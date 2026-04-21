import {
  StateField,
  StateEffect,
  EditorState,
  Transaction,
  RangeSet,
  RangeSetBuilder,
} from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

// =============================================================================
// Types
// =============================================================================

export type EntityType = 'character' | 'location' | 'prop';
export type EntitySpanState = 'staged' | 'committed';

export interface EntitySpan {
  from: number;
  to: number;
  entityType: EntityType;
  state: EntitySpanState;
  entityId: number | null;
  stagedLocalId: string | null;
}

// =============================================================================
// Effects (transaction annotations for undo tracking)
// =============================================================================

export const addEntitySpanEffect = StateEffect.define<EntitySpan>();

export const removeEntitySpanEffect = StateEffect.define<{ from: number; to: number }>();

export const commitEntitySpanEffect = StateEffect.define<{
  from: number;
  to: number;
  entityId: number;
  entityType: EntityType;
}>();

export const unlinkEntitySpanEffect = StateEffect.define<{ from: number; to: number }>();

// =============================================================================
// Decoration factories
// =============================================================================

function makeSpanDeco(span: EntitySpan): Decoration {
  const stateClass = span.state === 'committed' ? 'cm-entity-committed' : 'cm-entity-staged';
  const typeClass = `cm-entity-${span.entityType}`;
  const attrs: Record<string, string> = {
    'data-entity-type': span.entityType,
    'data-entity-state': span.state,
  };
  if (span.entityId != null) attrs['data-entity-id'] = String(span.entityId);
  if (span.stagedLocalId)     attrs['data-staged-id'] = span.stagedLocalId;

  return Decoration.mark({ class: `cm-entity ${stateClass} ${typeClass}`, attributes: attrs, inclusive: false });
}

// =============================================================================
// Internal storage: parallel arrays of EntitySpan metadata + decorations
// =============================================================================

interface EntityState {
  spans: EntitySpan[];
  decos: DecorationSet;
}

function rebuildDecos(spans: EntitySpan[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sorted = [...spans].sort((a, b) => a.from - b.from || a.to - b.to);
  for (const s of sorted) {
    if (s.from < s.to) builder.add(s.from, s.to, makeSpanDeco(s));
  }
  return builder.finish();
}

// =============================================================================
// StateField
// =============================================================================

export const entityStateField = StateField.define<EntityState>({
  create(): EntityState {
    return { spans: [], decos: Decoration.none };
  },

  update(prev: EntityState, tr: Transaction): EntityState {
    let { spans, decos } = prev;

    // Map existing spans through document changes
    if (tr.docChanged) {
      decos = decos.map(tr.changes);
      spans = spans.map(s => {
        const from = tr.changes.mapPos(s.from, -1);
        const to   = tr.changes.mapPos(s.to, 1);
        return { ...s, from, to };
      }).filter(s => s.from < s.to);
    }

    let dirty = false;

    for (const effect of tr.effects) {
      if (effect.is(addEntitySpanEffect)) {
        const span = effect.value;
        // Remove any overlapping spans first
        spans = spans.filter(s => s.to <= span.from || s.from >= span.to);
        spans = [...spans, span];
        dirty = true;
      } else if (effect.is(removeEntitySpanEffect) || effect.is(unlinkEntitySpanEffect)) {
        const { from, to } = effect.value;
        spans = spans.filter(s => s.to <= from || s.from >= to);
        dirty = true;
      } else if (effect.is(commitEntitySpanEffect)) {
        const { from, to, entityId, entityType } = effect.value;
        spans = spans.map(s =>
          s.from === from && s.to === to
            ? { ...s, state: 'committed' as const, entityId, entityType, stagedLocalId: null }
            : s
        );
        dirty = true;
      }
    }

    if (dirty) decos = rebuildDecos(spans);

    return { spans, decos };
  },

  provide: field => EditorView.decorations.from(field, s => s.decos),
});

// =============================================================================
// Helpers used by the editor and autocomplete
// =============================================================================

/** Return the entity span at a given doc position, if any. */
export function spanAtPos(state: EditorState, pos: number): EntitySpan | null {
  const { spans } = state.field(entityStateField);
  return spans.find(s => pos >= s.from && pos <= s.to) ?? null;
}

/** Build the serialisable annotation list for saving to DB. */
export function spansToAnnotations(
  state: EditorState
): { line_order: number; char_from: number; char_to: number; entity_type: string; entity_state: string; entity_id: number | null; staged_local_id: string | null }[] {
  const { spans } = state.field(entityStateField);
  const doc = state.doc;
  return spans.map(s => {
    const line = doc.lineAt(s.from);
    return {
      line_order: line.number - 1,
      char_from:  s.from - line.from,
      char_to:    s.to   - line.from,
      entity_type:   s.entityType,
      entity_state:  s.state,
      entity_id:     s.entityId,
      staged_local_id: s.stagedLocalId,
    };
  });
}

/** Reconstruct spans from saved annotations + doc. */
export function annotationsToEffects(
  annotations: { line_order: number; char_from: number; char_to: number; entity_type: string; entity_state: string; entity_id: number | null; staged_local_id: string | null }[],
  state: EditorState
): StateEffect<EntitySpan>[] {
  const effects: StateEffect<EntitySpan>[] = [];
  for (const a of annotations) {
    const lineNum = a.line_order + 1;
    if (lineNum > state.doc.lines) continue;
    const line = state.doc.line(lineNum);
    const from = line.from + a.char_from;
    const to   = line.from + a.char_to;
    if (from >= to || to > line.to) continue;
    effects.push(addEntitySpanEffect.of({
      from,
      to,
      entityType: a.entity_type as EntityType,
      state: a.entity_state as EntitySpanState,
      entityId: a.entity_id,
      stagedLocalId: a.staged_local_id,
    }));
  }
  return effects;
}

/** Generate a unique local ID for a new staged entity. */
export function newStagedId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `staged-${crypto.randomUUID()}`;
  return `staged-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
