import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
} from '@codemirror/view';
import { EditorState, StateEffect } from '@codemirror/state';
import {
  history,
  historyKeymap,
  defaultKeymap,
} from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import {
  Save, History, Plus, Check, Film, FileText,
  Trash2, List, User,
} from 'lucide-react';
import { db } from '../db/Database';
import { fountainHighlighter, fountainTheme, classifyFountainLine } from './ide/FountainExtension';
import type { FountainLineType } from './ide/FountainExtension';
import {
  entityStateField,
  spansToAnnotations,
  annotationsToEffects,
  commitEntitySpanEffect,
} from './ide/EntityStateField';
import { entityAutocomplete, openPropAutocomplete } from './ide/EntityAutocomplete';
import { ProductionNavigator } from './ide/ProductionNavigator';
import type { NavScene, ActGroup } from './ide/ProductionNavigator';
import { EntityPropertiesPanel } from './ide/EntityPropertiesPanel';

// =============================================================================
// Tab-mode cycling
// =============================================================================

type TabMode = 'description' | 'scene' | 'character' | 'dialogue' | 'transition';
const TAB_CYCLE: TabMode[] = ['description', 'scene', 'character', 'dialogue', 'transition'];

const INT_EXT_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. '];

function applyTabMode(view: EditorView, currentMode: TabMode): TabMode {
  const { state } = view;
  const pos  = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const text = line.text.trim();

  const nextIdx = (TAB_CYCLE.indexOf(currentMode) + 1) % TAB_CYCLE.length;
  const nextMode = TAB_CYCLE[nextIdx];

  let newText = text;
  switch (nextMode) {
    case 'scene':
      if (!INT_EXT_PREFIXES.some(p => text.startsWith(p))) newText = 'INT. ' + (text || '');
      break;
    case 'character':
      newText = text.toUpperCase();
      break;
    case 'dialogue':
      newText = text;
      break;
    case 'transition':
      newText = text.endsWith(' TO:') ? text : text.toUpperCase() + ' TO:';
      break;
    default:
      newText = text.replace(/^(INT\.|EXT\.|INT\.\/EXT\.)\s*/i, '');
  }

  if (newText !== line.text) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newText.length },
    });
  }

  return nextMode;
}

// =============================================================================
// Key command: double-Enter inserts a scene heading
// =============================================================================

let lastEnterTime = 0;
function doubleEnterCommand(view: EditorView): boolean {
  const now = Date.now();
  const gap = now - lastEnterTime;
  lastEnterTime = now;
  if (gap < 400) {
    const { state } = view;
    const pos  = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const insert = '\n\nINT. ';
    view.dispatch({
      changes: { from: line.to, to: line.to, insert },
      selection: { anchor: line.to + insert.length },
    });
    return true;
  }
  return false;
}

// =============================================================================
// Build CodeMirror state
// =============================================================================

function buildEditorState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      lineNumbers(),
      search(),
      fountainHighlighter,
      fountainTheme,
      entityStateField,
      ...entityAutocomplete,
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', fontFamily: "'Courier Prime', 'Courier New', Courier, monospace", fontSize: '15px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { padding: '2rem 4rem', maxWidth: '780px', margin: '0 auto' },
      }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        { key: 'Enter', run: doubleEnterCommand },
        { key: 'Ctrl-s', run: () => { window.dispatchEvent(new CustomEvent('ide-save')); return true; } },
        { key: 'Ctrl-Enter', run: (v) => {
          const pos = v.state.selection.main.head;
          v.dispatch({ changes: { from: pos, to: pos, insert: '\n\n--- PAGE BREAK ---\n\n' }, selection: { anchor: pos + 18 } });
          return true;
        }},
        { key: 'Ctrl-f', run: (v) => { openSearchPanel(v); return true; } },
        { key: 'Ctrl-p', run: (v) => { openPropAutocomplete(v); return true; } },
      ]),
    ],
  });
}

// =============================================================================
// ScreenplayIDE
// =============================================================================

export const ScreenplayIDE: React.FC = () => {
  const editorParentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Panel widths (persisted)
  const [leftWidth,  setLeftWidth]  = useState(() => Number(localStorage.getItem('ide_left_width'))  || 260);
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('ide_right_width')) || 280);
  const draggingRef = useRef<'left' | 'right' | null>(null);

  // Editor state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [cursorPos,  setCursorPos]  = useState(0);
  const [activeTab,  setActiveTab]  = useState<'script' | 'title' | 'versions'>('script');
  const [tabMode,    setTabMode]    = useState<TabMode>('description');

  // Data
  const [titlePage, setTitlePage]   = useState<{ key: string; value: string }[]>([]);
  const [versions,  setVersions]    = useState<any[]>([]);
  const [navScenes, setNavScenes]   = useState<NavScene[]>([]);
  const [actGroups, setActGroups]   = useState<ActGroup[]>([]);
  const [publishDesc, setPublishDesc] = useState('');
  const [toast, setToast]           = useState<string | null>(null);
  const [filterChar, setFilterChar] = useState<string | null>(null);
  const [filterLoc,  setFilterLoc]  = useState<string | null>(null);

  // Autosave
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // =============================================================================
  // Init
  // =============================================================================

  useEffect(() => {
    if (!editorParentRef.current) return;

    const state = buildEditorState('');
    const view  = new EditorView({
      state,
      parent: editorParentRef.current,
      dispatch(tr) {
        view.update([tr]);
        if (tr.docChanged) {
          setSaveStatus('dirty');
          scheduleAutosave();
        }
        if (tr.selection || tr.docChanged) {
          setCursorPos(view.state.selection.main.head);
        }
      },
    });
    viewRef.current = view;

    loadAll(view);

    // Global Ctrl+S handler
    const onSave = () => handleSave(view);
    window.addEventListener('ide-save', onSave);

    return () => {
      window.removeEventListener('ide-save', onSave);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Auto-linking by exact match (§2 spec)
  const autoLinkEntities = useCallback(async (v: EditorView) => {
    const { state } = v;
    const { spans } = state.field(entityStateField);
    const effects: StateEffect<any>[] = [];

    // Fetch all known entities for exact matching
    const [allChars, allLocs, allProps] = await Promise.all([
      db.getRows<{ id: number; name: string }>(`SELECT id, name FROM character WHERE (deleted IS NULL OR deleted = 0)`),
      db.getRows<{ id: number; name: string }>(`SELECT id, name FROM location WHERE (deleted IS NULL OR deleted = 0)`),
      db.getRows<{ id: number; name: string }>(`SELECT id, name FROM prop WHERE (deleted IS NULL OR deleted = 0)`),
    ]);

    const charMap = new Map(allChars.map(c => [c.name.toLowerCase(), c.id]));
    const locMap  = new Map(allLocs.map(l => [l.name.toLowerCase(), l.id]));
    const propMap = new Map(allProps.map(p => [p.name.toLowerCase(), p.id]));

    // Scan the doc line by line
    let prevType: FountainLineType = 'blank';
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      const text = line.text;
      const type = classifyFountainLine(text, prevType);
      prevType = type;

      if (type === 'character') {
        const name = text.trim().toUpperCase();
        const id = charMap.get(name.toLowerCase());
        if (id) {
          const from = line.from + (text.length - text.trimStart().length);
          const to   = from + name.length;
          // Only add if not already present
          if (!spans.some(s => s.from === from && s.entityId === id)) {
            effects.push(commitEntitySpanEffect.of({ from, to, entityId: id, entityType: 'character' }));
          }
        }
      } else if (type === 'heading') {
        const match = text.match(/^(\.?(?:INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT)\.?\s+)(.*?)(\s+-\s+.*)?$/i);
        if (match) {
          const prefix = match[1];
          const locName = match[2].trim();
          const id = locMap.get(locName.toLowerCase());
          if (id) {
            const from = line.from + prefix.length;
            const to   = from + locName.length;
            if (!spans.some(s => s.from === from && s.entityId === id)) {
              effects.push(commitEntitySpanEffect.of({ from, to, entityId: id, entityType: 'location' }));
            }
          }
        }
      }
      
      // Props: Scan any text for exact prop matches (more expensive but thorough)
      // For performance, we only do this on the active line or during full-scan
      if (text.length > 0 && propMap.size > 0) {
          for (const [propName, propId] of propMap.entries()) {
              if (propName.length < 3) continue; // Skip too short props to avoid false positives
              const regex = new RegExp(`\\b${propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
              let match;
              while ((match = regex.exec(text)) !== null) {
                  const from = line.from + match.index;
                  const to   = from + match[0].length;
                  if (!spans.some(s => s.from === from && s.entityId === propId)) {
                      effects.push(commitEntitySpanEffect.of({ from, to, entityId: propId, entityType: 'prop' }));
                  }
              }
          }
      }
    }

    if (effects.length > 0) {
      v.dispatch({ effects });
    }
  }, []);

  // Persist panel widths
  useEffect(() => { localStorage.setItem('ide_left_width',  String(leftWidth));  }, [leftWidth]);
  useEffect(() => { localStorage.setItem('ide_right_width', String(rightWidth)); }, [rightWidth]);

  // =============================================================================
  // Load
  // =============================================================================

  const loadAll = async (view: EditorView) => {
    const [screenplay, annotations, actGroupsData, nav, vers] = await Promise.all([
      db.loadScreenplay(),
      db.loadAnnotations(),
      db.loadActGroups(),
      db.getNavigatorData(),
      db.listVersions(),
    ]);

    const doc = screenplay.lines.map((l: any) => l.content).join('\n');

    const newState = buildEditorState(doc);
    view.setState(newState);
    setTitlePage(screenplay.title_page);

    // Restore entity annotations
    if (annotations.length > 0) {
      const effects = annotationsToEffects(annotations, view.state);
      if (effects.length > 0) view.dispatch({ effects });
    }

    // Auto-link exact matches (§2 spec)
    await autoLinkEntities(view);

    setActGroups(actGroupsData);
    setVersions(vers);
    refreshNavScenes(nav);
    setSaveStatus('saved');
  };

  // Debounced auto-link while editing
  useEffect(() => {
    if (saveStatus !== 'dirty') return;
    const t = setTimeout(() => {
      if (viewRef.current) autoLinkEntities(viewRef.current);
    }, 2000);
    return () => clearTimeout(t);
  }, [saveStatus, autoLinkEntities]);

  // Build NavScene[] from navigator data
  const refreshNavScenes = async (navArg?: any) => {
    const nav = navArg ?? await db.getNavigatorData();

    // Per-scene character lookup via direct query
    let sceneCharMap: Record<number, string[]> = {};
    try {
      const rows = await db.getRows<{ scene_id: number; name: string }>(`
        SELECT DISTINCT sl.scene_id, c.name
        FROM screenplay_lines sl
        JOIN character c ON c.id = sl.character_id
        WHERE sl.character_id IS NOT NULL AND sl.scene_id IS NOT NULL
        AND (c.deleted IS NULL OR c.deleted = 0)
      `);
      for (const r of rows) {
        if (!sceneCharMap[r.scene_id]) sceneCharMap[r.scene_id] = [];
        sceneCharMap[r.scene_id].push(r.name);
      }
    } catch { /* table may not have data yet */ }

    const scenes: NavScene[] = (nav.scenes ?? []).map((s: any) => ({
      id: s.scene_id ?? 0,
      scene_number: s.scene_number,
      heading: s.heading,
      line_order: s.line_order,
      characters: sceneCharMap[s.scene_id] ?? [],
      props: [],
    }));
    setNavScenes(scenes);
  };

  // =============================================================================
  // Save
  // =============================================================================

  const handleSave = useCallback(async (view?: EditorView) => {
    const v = view ?? viewRef.current;
    if (!v) return;
    setSaveStatus('saving');

    // Final auto-link pass before saving (§2 spec)
    await autoLinkEntities(v);

    const doc   = v.state.doc;
    const lines = Array.from({ length: doc.lines }, (_, i) => {
      const line = doc.line(i + 1);
      return { content: line.text, line_type: 'action' };
    });

    // Classify line types
    let prev: FountainLineType = 'blank';
    for (const line of lines) {
      const t = classifyFountainLine(line.content, prev);
      line.line_type = t;
      prev = t;
    }

    const annotations = spansToAnnotations(v.state);

    const summary = await db.saveScreenplayWithAnnotations(titlePage, lines, annotations);
    await db.saveActGroups(actGroups);

    await refreshNavScenes();

    setSaveStatus('saved');
    const stagedMsg = summary.staged_count > 0
      ? ` · ${summary.staged_count} entity${summary.staged_count > 1 ? 'ies' : ''} staged`
      : '';
    showToast(`Saved${stagedMsg}`);
  }, [titlePage, actGroups]);

  // =============================================================================
  // Autosave
  // =============================================================================

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => handleSave(), 30_000);
  }, [handleSave]);

  // Idle autosave after 5s of inactivity
  useEffect(() => {
    const onIdle = () => {
      if (saveStatus === 'dirty') handleSave();
    };
    const t = setTimeout(onIdle, 5_000);
    return () => clearTimeout(t);
  }, [saveStatus, handleSave]);

  // =============================================================================
  // Publish
  // =============================================================================

  const handlePublish = async () => {
    if (!publishDesc.trim()) return;
    try {
      await handleSave();
      await db.publishVersion(publishDesc);
      setPublishDesc('');
      setVersions(await db.listVersions());
      showToast('Version published');
    } catch (e: any) {
      showToast(e.message);
    }
  };

  const handleRestoreVersion = async (id: number) => {
    if (!confirm('Restore this version? Current changes will be replaced.')) return;
    await db.restoreVersion(id);
    if (viewRef.current) await loadAll(viewRef.current);
    showToast('Version restored');
  };

  const handleDeleteVersion = async (id: number) => {
    if (!confirm('Delete this version?')) return;
    await db.deleteVersion(id);
    setVersions(await db.listVersions());
  };

  // =============================================================================
  // Panel resize
  // =============================================================================

  const onDragStart = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = side;
    const startX = e.clientX;
    const startW = side === 'left' ? leftWidth : rightWidth;

    const onMove = (me: MouseEvent) => {
      const delta = side === 'left' ? me.clientX - startX : startX - me.clientX;
      const newW  = Math.max(180, Math.min(480, startW + delta));
      if (side === 'left') setLeftWidth(newW);
      else                 setRightWidth(newW);
    };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  // Tab key inside CM handled via keymap; we also need Tab for mode cycling on blank lines
  const handleTabOnBlankLine = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const line = v.state.doc.lineAt(v.state.selection.main.head);
    if (line.text.trim() === '') {
      const next = applyTabMode(v, tabMode);
      setTabMode(next);
    }
  }, [tabMode]);

  // Extend the keymap for blank-line Tab cycling after the view is created
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && document.activeElement?.closest('.cm-editor')) {
        const v = viewRef.current;
        if (!v) return;
        const line = v.state.doc.lineAt(v.state.selection.main.head);
        if (line.text.trim() === '') {
          e.preventDefault();
          handleTabOnBlankLine();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleTabOnBlankLine]);

  // =============================================================================
  // Helpers
  // =============================================================================

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3_000);
  };

  const jumpToLine = (lineOrder: number) => {
    const v = viewRef.current;
    if (!v) return;
    const lineNum = lineOrder + 1;
    if (lineNum > v.state.doc.lines) return;
    const line = v.state.doc.line(lineNum);
    v.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    v.focus();
  };

  // =============================================================================
  // Render
  // =============================================================================

  const saveLabel = saveStatus === 'saving' ? 'Saving…'
    : saveStatus === 'saved' ? <><Check size={13} /> Saved</>
    : <><Save size={13} /> Save</>;

  return (
    <div className="ide-root">

      {/* ── LEFT PANEL ── */}
      <div className="ide-panel-left" style={{ width: leftWidth }}>
        <ProductionNavigator
          scenes={navScenes}
          actGroups={actGroups}
          onJumpToScene={jumpToLine}
          onActGroupsChange={groups => { setActGroups(groups); setSaveStatus('dirty'); }}
          filterCharacter={filterChar}
          filterLocation={filterLoc}
          onFilterCharacter={setFilterChar}
          onFilterLocation={setFilterLoc}
        />
      </div>

      {/* Resize handle — left */}
      <div className="ide-resize-handle" onMouseDown={onDragStart('left')} />

      {/* ── CENTER PANEL ── */}
      <div className="ide-panel-center">

        {/* Toolbar */}
        <div className="ide-toolbar">
          <button className={`ide-tab-btn ${activeTab === 'script' ? 'active' : ''}`} onClick={() => setActiveTab('script')}>
            <FileText size={13} /> Script
          </button>
          <button className={`ide-tab-btn ${activeTab === 'title' ? 'active' : ''}`} onClick={() => setActiveTab('title')}>
            <Plus size={13} /> Title
          </button>
          <button className={`ide-tab-btn ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>
            <History size={13} /> Versions
          </button>

          <div className="ide-toolbar-spacer" />

          {activeTab === 'script' && (
            <span className="ide-mode-badge">{tabMode.toUpperCase()}</span>
          )}

          <button
            className={`btn ${saveStatus === 'saved' ? 'btn-success' : 'btn-primary'} ide-save-btn`}
            onClick={() => handleSave()}
            disabled={saveStatus === 'saving'}
          >
            {saveLabel}
          </button>
        </div>

        {/* Editor area */}
        <div className="ide-editor-area">
          {activeTab === 'script' && (
            <div ref={editorParentRef} className="ide-cm-host" />
          )}

          {activeTab === 'title' && (
            <div className="ide-title-editor">
              {['Title', 'Author', 'Source', 'Draft', 'Contact'].map(key => {
                const item = titlePage.find(tp => tp.key === key);
                return (
                  <div key={key} className="field-group">
                    <label className="field-label">{key}</label>
                    <input
                      className="field-input"
                      value={item?.value || ''}
                      onChange={e => {
                        const next = [...titlePage];
                        const idx  = next.findIndex(tp => tp.key === key);
                        if (idx >= 0) next[idx] = { ...next[idx], value: e.target.value };
                        else          next.push({ key, value: e.target.value });
                        setTitlePage(next);
                        setSaveStatus('dirty');
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="ide-versions">
              <div className="version-publish-form">
                <input
                  className="field-input"
                  placeholder="Version label (e.g. First Draft, Director Review…)"
                  value={publishDesc}
                  onChange={e => setPublishDesc(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handlePublish} disabled={!publishDesc.trim()}>
                  Publish
                </button>
              </div>
              <div className="version-list">
                {versions.length === 0 && <div className="version-empty">No versions yet.</div>}
                {versions.map(v => (
                  <div key={v.id} className="version-item">
                    <div className="version-item-header">
                      <span className="version-item-number">v{v.version_number}</span>
                      <span className="version-item-desc">{v.description}</span>
                      <span className="version-item-date">{new Date(v.published_at).toLocaleString()}</span>
                    </div>
                    <div className="version-item-stats">
                      <span><Film size={10} /> {v.scene_count} scenes</span>
                      <span><User size={10} /> {v.character_count} chars</span>
                      <span><List size={10} /> {v.line_count} lines</span>
                    </div>
                    <div className="version-item-actions">
                      <button className="btn version-restore-btn" onClick={() => handleRestoreVersion(v.id)}>Restore</button>
                      <button className="btn version-delete-btn" onClick={() => handleDeleteVersion(v.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="ide-status-bar">
          <span className="ide-status-item">
            {saveStatus === 'dirty' ? '● Unsaved' : saveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
          </span>
          <span className="ide-status-sep" />
          <span className="ide-status-item">{navScenes.length} scenes</span>
          <span className="ide-status-sep" />
          <span className="ide-status-item">Ln {viewRef.current ? viewRef.current.state.doc.lineAt(cursorPos).number : 1}</span>
        </div>
      </div>

      {/* Resize handle — right */}
      <div className="ide-resize-handle" onMouseDown={onDragStart('right')} />

      {/* ── RIGHT PANEL ── */}
      <div className="ide-panel-right" style={{ width: rightWidth }}>
        <EntityPropertiesPanel
          view={viewRef.current}
          cursorPos={cursorPos}
        />
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default ScreenplayIDE;
