import {
  autocompletion,
  CompletionContext,
  startCompletion,
  closeCompletion,
} from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import { EditorView, keymap } from '@codemirror/view';
import {
  addEntitySpanEffect,
  commitEntitySpanEffect,
  newStagedId,
  entityStateField,
} from './EntityStateField';
import type { EntityType } from './EntityStateField';
import { classifyFountainLine } from './FountainExtension';
import type { FountainLineType } from './FountainExtension';
import { db } from '../../db/Database';

// =============================================================================
// Debounce helper
// =============================================================================

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    return new Promise(resolve => {
      timer = setTimeout(() => resolve(fn(...args)), ms);
    });
  }) as any;
}

const fetchCharacters = debounce((q: string) => db.autocompleteCharacters(q), 150);
const fetchLocations  = debounce((q: string) => db.autocompleteLocations(q), 150);
const fetchProps      = debounce((q: string) => db.autocompleteProps(q), 150);

// =============================================================================
// Determine what kind of autocomplete applies on the current line
// =============================================================================

function getLineContext(ctx: CompletionContext): { entityType: EntityType; query: string; from: number } | null {
  const line     = ctx.state.doc.lineAt(ctx.pos);
  const lineText = line.text;

  // Classify the current line
  const lineNum = line.number;
  let prevType: FountainLineType = 'blank';
  if (lineNum > 1) {
    let p: FountainLineType = 'blank';
    for (let i = 1; i < lineNum; i++) {
      p = classifyFountainLine(ctx.state.doc.line(i).text, p);
    }
    prevType = p;
  }
  const currentType = classifyFountainLine(lineText, prevType);

  // Character line: autocomplete on the whole line text
  if (currentType === 'character') {
    const query = lineText.trimStart();
    if (!query && !ctx.explicit) return null;
    return { entityType: 'character', query, from: line.from };
  }

  // Scene heading: autocomplete the location segment after INT./EXT./...
  if (currentType === 'heading') {
    const match = lineText.match(/^(\.?(?:INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT)\.?\s+)(.*?)(\s+-\s+.*)?$/i);
    if (match) {
      const prefix = match[1];
      const loc = match[2];
      const from = line.from + prefix.length;
      if (ctx.pos < from) return null;
      return { entityType: 'location', query: loc.slice(0, ctx.pos - from), from };
    }
  }

  return null;
}

// =============================================================================
// Build completion items from DB results
// =============================================================================

function buildCompletions(
  results: { id: number; name: string }[],
  query: string,
  entityType: EntityType,
  from: number,
): Completion[] {
  const items: Completion[] = results.map(r => ({
    label: r.name,
    type: entityType,
    apply: (editorView: EditorView, _completion: Completion, _from: number, _to: number) => {
      const line = editorView.state.doc.lineAt(from);
      const insertTo = line.to;
      // Replace from the entityFrom to end of matched word
      editorView.dispatch({
        changes: { from, to: insertTo, insert: r.name },
        effects: [
          commitEntitySpanEffect.of({
            from,
            to: from + r.name.length,
            entityId: r.id,
            entityType,
          }),
        ],
      });
    },
    boost: 10,
  }));

  // "Create new" option at bottom
  if (query.trim().length >= 1) {
    items.push({
      label: `Create "${query.trim()}"`,
      type: 'keyword',
      apply: async (editorView: EditorView) => {
        const name = query.trim();
        const id = await db.findOrCreateEntity(entityType, name);
        const line = editorView.state.doc.lineAt(from);
        editorView.dispatch({
          changes: { from, to: line.to, insert: name },
          effects: [
            commitEntitySpanEffect.of({ from, to: from + name.length, entityId: id, entityType }),
          ],
        });
      },
      boost: -10,
    });
  }

  return items;
}

// =============================================================================
// Main CompletionSource
// =============================================================================

async function fountainCompletionSource(ctx: CompletionContext): Promise<CompletionResult | null> {
  const lineCtx = getLineContext(ctx);
  if (!lineCtx) return null;

  const { entityType, query, from } = lineCtx;

  let results: { id: number; name: string }[] = [];
  if (entityType === 'character') results = await fetchCharacters(query) as any;
  if (entityType === 'location')  results = await fetchLocations(query) as any;
  if (entityType === 'prop')      results = await fetchProps(query) as any;

  if (!results) return null;

  // Exact-match auto-commit (§2 spec)
  const exact = results.find(r => r.name.toLowerCase() === query.toLowerCase());
  if (exact && !ctx.explicit && ctx.view) {
    const view = ctx.view;
    const line = view.state.doc.lineAt(from);
    const to = from + query.length;
    if (to <= line.to) {
      const alreadyCommitted = view.state.field(entityStateField)
        .spans.find(s => s.from === from && s.entityId === exact.id);
      if (!alreadyCommitted) {
        view.dispatch({
          effects: commitEntitySpanEffect.of({ from, to, entityId: exact.id, entityType }),
        });
      }
    }
  }

  const completions = buildCompletions(results, query, entityType, from);
  if (!completions.length) return null;

  return { from, options: completions, validFor: /^[\w\s\.']*$/ };
}

// =============================================================================
// Prop autocomplete triggered via Ctrl+P
// =============================================================================

export async function openPropAutocomplete(view: EditorView): Promise<boolean> {
  const { state } = view;
  const sel = state.selection.main;

  const query = sel.empty
    ? ''
    : state.sliceDoc(sel.from, sel.to);

  const results = await db.autocompleteProps(query);

  // Use a simple inline popup approach — dispatch directly
  if (results.length === 0 && !query) return false;

  // Build a one-shot completion by injecting items via startCompletion
  // We expose results on a temporary global for the source to pick up
  (window as any).__scf_prop_override = { query, results, from: sel.from, to: sel.to };
  startCompletion(view);
  return true;
}

// =============================================================================
// Prop override CompletionSource (picks up __scf_prop_override)
// =============================================================================

async function propOverrideSource(_ctx: CompletionContext): Promise<CompletionResult | null> {
  const override = (window as any).__scf_prop_override;
  if (!override) return null;
  (window as any).__scf_prop_override = null;

  const { query, results, from, to } = override;
  const items = buildCompletions(results, query, 'prop', from);
  if (!items.length) return null;
  return { from, to, options: items, validFor: /^[\w\s]*$/ };
}

// =============================================================================
// Time-of-day suggestions after ' - ' in scene headings
// =============================================================================

const TIME_OF_DAY = [
  'DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING',
  'DUSK', 'DAWN', 'CONTINUOUS', 'LATER', 'MOMENTS LATER',
];

async function timeOfDaySource(ctx: CompletionContext): Promise<CompletionResult | null> {
  const line = ctx.state.doc.lineAt(ctx.pos);
  // Only on heading lines
  if (!/^(\.?(?:INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT))/i.test(line.text)) return null;

  // Look for ' - ' followed by cursor
  const dashMatch = line.text.match(/\s-\s(.*)$/);
  if (!dashMatch) return null;

  const dashOffset = line.text.lastIndexOf(' - ');
  const afterDash  = dashOffset + 3; // skip ' - '
  const fromPos    = line.from + afterDash;
  if (ctx.pos < fromPos) return null;

  const typed = line.text.slice(afterDash).toUpperCase();
  const matches = TIME_OF_DAY.filter(t => t.startsWith(typed) || typed === '');
  if (!matches.length) return null;

  return {
    from: fromPos,
    options: matches.map(t => ({ label: t, type: 'keyword', boost: 5 })),
    validFor: /^[A-Z\s]*$/,
  };
}

// =============================================================================
// Escape→Staged behavior
// =============================================================================

export function stageCurrentToken(view: EditorView, entityType: EntityType): void {
  const { state } = view;
  const pos  = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const text = line.text;

  // Find boundaries of the current "word" (including spaces for multi-word names)
  // Walk backward to line start or previous punctuation
  let from = pos - line.from;
  while (from > 0 && /[\w\s']/.test(text[from - 1])) from--;
  let to = pos - line.from;
  while (to < text.length && /[\w\s']/.test(text[to])) to++;

  // Trim trailing spaces
  while (to > from && text[to - 1] === ' ') to--;

  const absFrom = line.from + from;
  const absTo   = line.from + to;
  if (absFrom >= absTo) return;

  view.dispatch({
    effects: [
      addEntitySpanEffect.of({
        from: absFrom,
        to: absTo,
        entityType,
        state: 'staged',
        entityId: null,
        stagedLocalId: newStagedId(),
      }),
    ],
  });
}

// When Escape is pressed and autocomplete is open: close dropdown and stage the current token
function escapeToStageCommand(view: EditorView): boolean {
  // Determine entity type for the current line
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);

  let prevType: FountainLineType = 'blank';
  for (let i = 1; i < line.number; i++) {
    prevType = classifyFountainLine(state.doc.line(i).text, prevType);
  }
  const lineType = classifyFountainLine(line.text, prevType);

  let entityType: EntityType | null = null;
  if (lineType === 'character') entityType = 'character';
  else if (lineType === 'heading') entityType = 'location';

  // Only intercept if autocomplete is currently open
  // closeCompletion returns true if it was open
  const wasOpen = closeCompletion(view);
  if (wasOpen && entityType) {
    stageCurrentToken(view, entityType);
    return true;
  }
  return wasOpen;
}

// =============================================================================
// Entity-aware keymap extensions
// =============================================================================

export const entityKeymap = keymap.of([
  { key: 'Escape', run: escapeToStageCommand },
]);

// =============================================================================
// Export the autocompletion extension bundle
// =============================================================================

export const entityAutocomplete = [
  autocompletion({
    override: [fountainCompletionSource, propOverrideSource, timeOfDaySource],
    closeOnBlur: true,
    activateOnTyping: true,
    defaultKeymap: true,
  }),
  entityKeymap,
];
