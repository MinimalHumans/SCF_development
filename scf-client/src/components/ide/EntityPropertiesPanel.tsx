import React, { useState, useEffect } from 'react';
import { User, MapPin, Package, Link2, Edit2, Unlink, RefreshCw, X } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import { startCompletion } from '@codemirror/autocomplete';
import { db } from '../../db/Database';
import {
  EntitySpan,
  spanAtPos,
  EntityType,
  commitEntitySpanEffect,
  unlinkEntitySpanEffect,
  addEntitySpanEffect,
  newStagedId,
} from './EntityStateField';

// =============================================================================
// Types
// =============================================================================

interface EntityRecord {
  id: number;
  name: string;
  [key: string]: any;
}

interface Props {
  view: EditorView | null;
  cursorPos: number;
  onNavigatorFallback?: () => React.ReactNode;
}

// =============================================================================
// Helpers
// =============================================================================

const TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  character: <User size={14} />,
  location:  <MapPin size={14} />,
  prop:      <Package size={14} />,
};

const TYPE_LABELS: Record<EntityType, string> = {
  character: 'Character',
  location:  'Location',
  prop:      'Prop',
};

const TYPE_COLOR: Record<EntityType, string> = {
  character: 'var(--entity-char)',
  location:  'var(--entity-loc)',
  prop:      'var(--entity-prop)',
};

// =============================================================================
// EntityPropertiesPanel
// =============================================================================

export const EntityPropertiesPanel: React.FC<Props> = ({ view, cursorPos, onNavigatorFallback }) => {
  const [span, setSpan] = useState<EntitySpan | null>(null);
  const [record, setRecord] = useState<EntityRecord | null>(null);
  const [scenes, setScenes] = useState<{ id: number; heading: string }[]>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapQuery, setSwapQuery] = useState('');
  const [swapResults, setSwapResults] = useState<{ id: number; name: string }[]>([]);

  // Sync span whenever cursor moves
  useEffect(() => {
    if (!view) { setSpan(null); return; }
    const s = spanAtPos(view.state, cursorPos);
    setSpan(s);
  }, [view, cursorPos]);

  // Load entity record when span changes
  useEffect(() => {
    if (!span || span.state !== 'committed' || !span.entityId) {
      setRecord(null);
      setScenes([]);
      return;
    }
    db.getEntityById(span.entityType, span.entityId).then(r => setRecord(r as EntityRecord));
    loadScenes(span.entityType, span.entityId);
  }, [span]);

  const loadScenes = async (type: EntityType, id: number) => {
    try {
      let rows: any[] = [];
      if (type === 'character') {
        rows = await db.getRows(
          `SELECT s.id, sl.content AS heading FROM screenplay_lines sl
           JOIN scene s ON s.id = sl.scene_id
           WHERE sl.line_type = 'heading' AND sl.character_id = ?
           GROUP BY s.id ORDER BY sl.line_order LIMIT 20`,
          [id]
        );
      } else if (type === 'location') {
        rows = await db.getRows(
          `SELECT s.id, sl.content AS heading FROM screenplay_lines sl
           JOIN scene s ON s.id = sl.scene_id
           WHERE sl.line_type = 'heading' AND sl.location_id = ?
           GROUP BY s.id ORDER BY sl.line_order LIMIT 20`,
          [id]
        );
      } else {
        rows = await db.getRows(
          `SELECT s.id, s.name AS heading FROM scene_prop sp
           JOIN scene s ON s.id = sp.scene_id
           WHERE sp.prop_id = ? LIMIT 20`,
          [id]
        );
      }
      setScenes(rows);
    } catch { setScenes([]); }
  };

  // =============================================================================
  // Actions
  // =============================================================================

  const handleUnlink = () => {
    if (!view || !span) return;
    view.dispatch({
      effects: [
        unlinkEntitySpanEffect.of({ from: span.from, to: span.to }),
        addEntitySpanEffect.of({
          from: span.from, to: span.to,
          entityType: span.entityType,
          state: 'staged',
          entityId: null,
          stagedLocalId: newStagedId(),
        }),
      ],
    });
    setSpan(null);
  };

  const handleRename = async () => {
    if (!span?.entityId || !renameValue.trim()) return;
    await db.renameEntityById(span.entityType, span.entityId, renameValue.trim());
    setRecord(r => r ? { ...r, name: renameValue.trim() } : r);
    setIsRenaming(false);
    // Propagate text change in editor for the current span
    if (view && span) {
      view.dispatch({
        changes: { from: span.from, to: span.to, insert: renameValue.trim() },
      });
    }
  };

  const handleSwapSearch = async (q: string) => {
    setSwapQuery(q);
    if (!q) { setSwapResults([]); return; }
    let results: { id: number; name: string }[] = [];
    if (span?.entityType === 'character') results = await db.autocompleteCharacters(q);
    if (span?.entityType === 'location')  results = await db.autocompleteLocations(q);
    if (span?.entityType === 'prop')      results = await db.autocompleteProps(q);
    setSwapResults(results);
  };

  const handleSwapSelect = (r: { id: number; name: string }) => {
    if (!view || !span) return;
    view.dispatch({
      changes: { from: span.from, to: span.to, insert: r.name },
      effects: [
        commitEntitySpanEffect.of({ from: span.from, to: span.from + r.name.length, entityId: r.id, entityType: span.entityType }),
      ],
    });
    setIsSwapping(false);
    setSwapQuery('');
    setSwapResults([]);
  };

  // =============================================================================
  // Staged entity view
  // =============================================================================

  if (span && span.state === 'staged') {
    const text = view ? view.state.sliceDoc(span.from, span.to) : '';
    return (
      <aside className="ep-panel">
        <div className="ep-header ep-staged">
          <span className="ep-type-icon">{TYPE_ICONS[span.entityType]}</span>
          <span className="ep-type-label">{TYPE_LABELS[span.entityType]} — Staged</span>
        </div>
        <div className="ep-body">
          <div className="ep-staged-text">"{text}"</div>
          <p className="ep-hint">This entity is not yet linked to a database record. Place your cursor here and press <kbd>Ctrl+Space</kbd> to commit it, or use the button below.</p>
          <button
            className="btn btn-primary ep-commit-btn"
            onClick={() => { if (view) startCompletion(view); }}
          >
            <Link2 size={12} /> Link to Entity
          </button>
        </div>
      </aside>
    );
  }

  // =============================================================================
  // Committed entity view
  // =============================================================================

  if (span && span.state === 'committed' && record) {
    const color = TYPE_COLOR[span.entityType];
    return (
      <aside className="ep-panel">
        <div className="ep-header" style={{ borderColor: color }}>
          <span className="ep-type-icon" style={{ color }}>{TYPE_ICONS[span.entityType]}</span>
          {isRenaming ? (
            <div className="ep-rename-row">
              <input
                className="ep-rename-input"
                value={renameValue}
                autoFocus
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
              />
              <button className="nav-ide-icon-btn" onClick={handleRename}><Check size={11} /></button>
              <button className="nav-ide-icon-btn" onClick={() => setIsRenaming(false)}><X size={11} /></button>
            </div>
          ) : (
            <span className="ep-entity-name">{record.name}</span>
          )}
        </div>

        {/* Swap / modify link */}
        {isSwapping && (
          <div className="ep-swap-box">
            <input
              className="ep-swap-input"
              placeholder="Search for entity…"
              value={swapQuery}
              autoFocus
              onChange={e => handleSwapSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setIsSwapping(false); }}
            />
            {swapResults.map(r => (
              <div key={r.id} className="ep-swap-result" onClick={() => handleSwapSelect(r)}>
                {r.name}
              </div>
            ))}
          </div>
        )}

        <div className="ep-body">
          {/* Action buttons */}
          <div className="ep-actions">
            <button className="ep-action-btn" title="Rename entity" onClick={() => { setRenameValue(record.name); setIsRenaming(true); setIsSwapping(false); }}>
              <Edit2 size={12} /> Rename
            </button>
            <button className="ep-action-btn" title="Swap link" onClick={() => { setIsSwapping(s => !s); setIsRenaming(false); }}>
              <RefreshCw size={12} /> Swap
            </button>
            <button className="ep-action-btn ep-action-danger" title="Unlink entity" onClick={handleUnlink}>
              <Unlink size={12} /> Unlink
            </button>
          </div>

          {/* Entity-specific fields */}
          {span.entityType === 'character' && record.backstory && (
            <div className="ep-field">
              <label>Backstory</label>
              <p>{record.backstory}</p>
            </div>
          )}
          {span.entityType === 'character' && record.casting_notes && (
            <div className="ep-field">
              <label>Casting Notes</label>
              <p>{record.casting_notes}</p>
            </div>
          )}
          {span.entityType === 'location' && record.set_notes && (
            <div className="ep-field">
              <label>Set Notes</label>
              <p>{record.set_notes}</p>
            </div>
          )}
          {span.entityType === 'prop' && record.notes && (
            <div className="ep-field">
              <label>Notes</label>
              <p>{record.notes}</p>
            </div>
          )}

          {/* Scene appearances */}
          {scenes.length > 0 && (
            <div className="ep-scenes">
              <label>Appears in</label>
              {scenes.map(s => (
                <div key={s.id} className="ep-scene-chip">{s.heading}</div>
              ))}
            </div>
          )}
        </div>
      </aside>
    );
  }

  // =============================================================================
  // Fallback: Navigator view
  // =============================================================================

  return (
    <aside className="ep-panel ep-fallback">
      {onNavigatorFallback?.() ?? (
        <div className="ep-empty">
          <p>Place cursor on an entity to view its properties.</p>
        </div>
      )}
    </aside>
  );
};

export default EntityPropertiesPanel;
