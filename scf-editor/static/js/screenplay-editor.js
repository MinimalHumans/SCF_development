/**
 * Screenplay Editor — CodeMirror 6 Initialization
 * ==================================================
 * Mounts a CodeMirror 6 editor with Fountain syntax highlighting,
 * load/save via API, unsaved state tracking, and export.
 */

import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { EditorView, keymap, placeholder, drawSelection, Decoration, ViewPlugin, MatchDecorator } from 'https://esm.sh/@codemirror/view@6.36.5';
import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@6.8.0';
import { fountainLanguage } from './fountain-mode.js';

// ── Element type detection & Tab cycling ───────────────────────────────────

const HEADING_RE = /^(\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s./])/i;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 ._\-']+(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D?|O\.?C\.?)\))?$/;

/**
 * Detect the Fountain element type of a line, given context.
 * Returns: 'heading' | 'character' | 'transition' | 'action'
 */
function detectElementType(lineText, prevLineBlank) {
    const trimmed = lineText.trim();
    if (trimmed === '') return 'action';
    if (HEADING_RE.test(trimmed)) return 'heading';
    // Transition: all-caps ending with ':'
    if (/^[A-Z][A-Z\s]+:$/.test(trimmed)) return 'transition';
    // Character: all-caps, blank line above, no trailing sentence punctuation
    if (prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && !/[.,;!?]$/.test(trimmed)) return 'character';
    // All-caps line without colon but blank above — still could be character
    if (prevLineBlank && /^[A-Z][A-Z0-9 ._\-']{1,}$/.test(trimmed)) return 'character';
    return 'action';
}

const CYCLE_ORDER = ['action', 'heading', 'character', 'transition'];

function cycleElementType(view, direction) {
    const state = view.state;
    const sel = state.selection.main;
    // Only act on single-line cursors / selections
    const fromLine = state.doc.lineAt(sel.from);
    const toLine = state.doc.lineAt(sel.to);
    if (fromLine.number !== toLine.number) return false;

    const line = fromLine;
    const lineText = line.text;

    // Determine previous line blank
    let prevLineBlank = true;
    if (line.number > 1) {
        const prev = state.doc.line(line.number - 1);
        prevLineBlank = prev.text.trim() === '';
    }

    const currentType = detectElementType(lineText, prevLineBlank);
    const idx = CYCLE_ORDER.indexOf(currentType);
    const nextIdx = (idx + direction + CYCLE_ORDER.length) % CYCLE_ORDER.length;
    const nextType = CYCLE_ORDER[nextIdx];

    // Build the new line content
    let content = lineText;
    // Strip existing markers first
    content = content.replace(/^\.(?=[A-Z])/i, ''); // forced heading dot
    content = content.replace(/^(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s*/i, ''); // heading prefixes
    content = content.replace(/:(\s*)$/, '$1'); // trailing colon
    content = content.trim();

    let newText = content;
    let changes = [];
    let needBlankAbove = false;

    switch (nextType) {
        case 'action':
            // Just the plain content, restore to mixed case isn't feasible so leave as-is
            newText = content;
            break;
        case 'heading':
            newText = 'INT. ' + content.toUpperCase();
            needBlankAbove = true;
            break;
        case 'character':
            newText = content.toUpperCase();
            // Remove trailing sentence punctuation
            newText = newText.replace(/[.,;!?]+$/, '');
            needBlankAbove = true;
            break;
        case 'transition':
            newText = content.toUpperCase();
            if (!newText.endsWith(':')) newText += ':';
            needBlankAbove = true;
            break;
    }

    // Build transaction changes
    if (needBlankAbove && line.number > 1) {
        const prev = state.doc.line(line.number - 1);
        if (prev.text.trim() !== '') {
            // Insert blank line before current line
            changes.push({ from: line.from, insert: '\n' });
        }
    }

    changes.push({ from: line.from, to: line.to, insert: newText });

    view.dispatch({
        changes,
        selection: { anchor: line.from + newText.length + (needBlankAbove && line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '' ? 1 : 0) },
    });

    return true;
}

const tabCycleKeymap = keymap.of([
    {
        key: 'Tab',
        run(view) { return cycleElementType(view, 1); },
    },
    {
        key: 'Shift-Tab',
        run(view) { return cycleElementType(view, -1); },
    },
]);

// ── Auto-Uppercase ─────────────────────────────────────────────────────────

function isAllUpperContent(text) {
    if (text.length === 0) return true;
    return /^[A-Z0-9 ._\-'()]*$/.test(text);
}

function isSceneHeadingLine(text) {
    return /^(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s/i.test(text.trim());
}

/**
 * Intercepts typed characters and uppercases them when on a character cue
 * line (blank line above, all-caps so far) or a scene heading line.
 */
const autoUppercaseHandler = EditorView.inputHandler.of((view, from, to, text) => {
    // Only act on single lowercase letter input
    if (text.length !== 1 || !/[a-z]/.test(text)) return false;

    const state = view.state;
    const line = state.doc.lineAt(from);
    const textBefore = state.doc.sliceString(line.from, from);
    const textAfter = state.doc.sliceString(to, line.to);
    const fullLine = textBefore + text + textAfter;

    // Scene heading: line starts with INT./EXT./etc.
    if (isSceneHeadingLine(fullLine)) {
        view.dispatch({
            changes: { from, to, insert: text.toUpperCase() },
            selection: { anchor: from + 1 },
        });
        return true;
    }

    // Character cue position: previous line is blank and existing text is all uppercase
    if (line.number > 1) {
        const prevLine = state.doc.line(line.number - 1);
        if (prevLine.text.trim() === '' && isAllUpperContent(textBefore) && isAllUpperContent(textAfter)) {
            view.dispatch({
                changes: { from, to, insert: text.toUpperCase() },
                selection: { anchor: from + 1 },
            });
            return true;
        }
    }

    return false;
});

// ── Enter Key Behaviors ────────────────────────────────────────────────────

function isInDialogueContext(state, lineNumber) {
    // Walk backward to find if we're in dialogue (character cue above with no blank line break)
    for (let i = lineNumber - 1; i >= 1; i--) {
        const l = state.doc.line(i);
        const text = l.text.trim();
        if (text === '') return false; // blank line = exited dialogue
        // Check if this line is a character cue
        if (i >= 2) {
            const above = state.doc.line(i - 1);
            if (above.text.trim() === '' && CHARACTER_CUE_RE.test(text)) return true;
        } else if (i === 1) {
            if (CHARACTER_CUE_RE.test(text)) return true;
        }
    }
    return false;
}

function handleEnter(view) {
    const state = view.state;
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.head);
    const lineText = line.text;
    const trimmed = lineText.trim();

    // Determine previous line blank
    let prevLineBlank = line.number <= 1 || state.doc.line(line.number - 1).text.trim() === '';

    // Case 1: Enter on a character cue line → single newline (enter dialogue)
    if (prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1 && sel.head === line.to) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n' },
            selection: { anchor: sel.head + 1 },
        });
        return true;
    }

    // Case 2: Enter on an empty line in dialogue context → insert blank line to exit
    if (trimmed === '' && line.number > 1 && isInDialogueContext(state, line.number)) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n' },
            selection: { anchor: sel.head + 1 },
        });
        return true;
    }

    // Case 3: Enter on a parenthetical in dialogue → single newline
    if (/^\s*\(.*\)\s*$/.test(lineText) && isInDialogueContext(state, line.number)) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n' },
            selection: { anchor: sel.head + 1 },
        });
        return true;
    }

    // Case 4: Enter on a scene heading → insert blank line after
    if (HEADING_RE.test(trimmed)) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n\n' },
            selection: { anchor: sel.head + 2 },
        });
        return true;
    }

    // Default: normal newline
    return false;
}

const enterKeymap = keymap.of([
    {
        key: 'Enter',
        run: handleEnter,
    },
]);

// ── Anchor Tag Hiding ──────────────────────────────────────────────────────

const anchorMatcher = new MatchDecorator({
    regexp: /\[\[scf:\w+:\d+\]\]/g,
    decoration: () => Decoration.replace({}),
});

const anchorHidingPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = anchorMatcher.createDeco(view);
    }
    update(update) {
        this.decorations = anchorMatcher.updateDeco(update, this.decorations);
    }
}, {
    decorations: v => v.decorations,
});

// ── State ───────────────────────────────────────────────────────────────────

let editorView = null;
let unsaved = false;
let saving = false;
let savedTimeout = null;

// ── Toast helper (standalone — app.js not loaded on this page) ──────────────

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function showSyncToast(sync) {
    const parts = [];
    if (sync.scenes_created)     parts.push(`${sync.scenes_created} new scene${sync.scenes_created > 1 ? 's' : ''}`);
    if (sync.characters_created) parts.push(`${sync.characters_created} new character${sync.characters_created > 1 ? 's' : ''}`);
    if (sync.locations_created)  parts.push(`${sync.locations_created} new location${sync.locations_created > 1 ? 's' : ''}`);
    if (sync.props_created)      parts.push(`${sync.props_created} new prop${sync.props_created > 1 ? 's' : ''}`);
    if (parts.length) showToast('Synced: ' + parts.join(', '));
    if (sync.errors && sync.errors.length) {
        for (const err of sync.errors) showToast('\u26a0 ' + err);
    }
}

// ── Navigator panel resize ──────────────────────────────────────────────────

function initNavigatorResize() {
    const panel = document.getElementById('navigator-panel');
    if (!panel) return;

    const STORAGE_KEY = 'scf-panel-navigator-width';
    const MIN_W = 180;
    const MAX_W = 500;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const w = Math.max(MIN_W, Math.min(MAX_W, parseInt(saved, 10)));
        panel.style.width = w + 'px';
    }

    const handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    panel.appendChild(handle);

    let startX, startW;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');

        function onMouseMove(e) {
            const dx = e.clientX - startX;
            const newW = Math.max(MIN_W, Math.min(MAX_W, startW + dx));
            panel.style.width = newW + 'px';
        }

        function onMouseUp() {
            handle.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            localStorage.setItem(STORAGE_KEY, Math.round(panel.getBoundingClientRect().width));
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    panel.querySelectorAll('.nav-section-header').forEach((header) => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('collapsed');
        });
    });
}

// ── Status bar ──────────────────────────────────────────────────────────────

function updateCursorStatus(state) {
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);

    const lineEl = document.getElementById('status-line');
    const pageEl = document.getElementById('status-page');

    if (lineEl) lineEl.textContent = `Ln ${line.number}`;
    if (pageEl) pageEl.textContent = `Pg ~${Math.max(1, Math.ceil(line.number / 55))}`;
}

function setSaveStatus(text, color) {
    const el = document.getElementById('status-save');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '';
}

function markUnsaved() {
    if (saving) return;
    unsaved = true;
    if (savedTimeout) { clearTimeout(savedTimeout); savedTimeout = null; }
    setSaveStatus('Unsaved \u2022', 'var(--warning)');
}

function markSaved() {
    unsaved = false;
    saving = false;
    setSaveStatus('Saved \u2713', 'var(--success)');
    if (savedTimeout) clearTimeout(savedTimeout);
    savedTimeout = setTimeout(() => {
        setSaveStatus('Ready', '');
    }, 3000);
}

function markSaving() {
    saving = true;
    setSaveStatus('Saving\u2026', '');
}

function markSaveFailed() {
    saving = false;
    setSaveStatus('Save failed', 'var(--warning)');
}

// ── Save ────────────────────────────────────────────────────────────────────

async function saveScreenplay() {
    if (!editorView || saving) return;
    markSaving();

    const text = editorView.state.doc.toString();

    try {
        const res = await fetch('/api/screenplay/save', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(err.detail || 'Save failed');
        }
        const data = await res.json();
        markSaved();
        if (data.sync) showSyncToast(data.sync);
    } catch (e) {
        markSaveFailed();
        showToast(`Save error: ${e.message}`);
    }
}

// ── Export ───────────────────────────────────────────────────────────────────

function exportScreenplay() {
    const link = document.createElement('a');
    link.href = '/api/screenplay/export';
    link.click();
}

// ── Load ────────────────────────────────────────────────────────────────────

async function loadScreenplay() {
    if (!editorView) return;
    try {
        const res = await fetch('/api/screenplay/load');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (!data.has_fountain) return;

        editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: data.text || '' },
        });

        // Reset unsaved state after loading
        unsaved = false;
        setSaveStatus('Loaded \u2713', 'var(--success)');
        savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 2000);
    } catch (e) {
        const panel = document.getElementById('screenplay-panel');
        if (panel) {
            const msg = document.createElement('div');
            msg.className = 'screenplay-load-error';
            msg.textContent = 'Failed to load screenplay. Please try refreshing.';
            panel.appendChild(msg);
        }
    }
}

// ── CodeMirror setup ────────────────────────────────────────────────────────

function createEditor(container) {
    const saveKeymap = [{
        key: 'Mod-s',
        run() { saveScreenplay(); return true; },
    }];

    const state = EditorState.create({
        doc: '',
        extensions: [
            fountainLanguage,
            history(),
            drawSelection(),
            EditorView.lineWrapping,
            placeholder('Loading screenplay\u2026'),
            tabCycleKeymap,
            enterKeymap,
            autoUppercaseHandler,
            anchorHidingPlugin,
            keymap.of([...saveKeymap, ...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
                if (update.selectionSet || update.docChanged) {
                    updateCursorStatus(update.state);
                }
                if (update.docChanged) {
                    markUnsaved();
                }
            }),
            EditorView.theme({
                '&': {
                    backgroundColor: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
                    fontSize: '15px',
                    lineHeight: '1.5',
                    flex: '1',
                },
                '.cm-content': {
                    caretColor: 'var(--accent)',
                    padding: '24px 0',
                },
                '.cm-scroller': {
                    padding: '0 40px',
                    overflow: 'auto',
                },
                '.cm-cursor, .cm-dropCursor': {
                    borderLeftColor: 'var(--accent)',
                    borderLeftWidth: '2px',
                },
                '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
                    backgroundColor: 'var(--accent-subtle) !important',
                },
                '.cm-activeLine': {
                    backgroundColor: 'rgba(42, 42, 56, 0.3)',
                },
                '.cm-gutters': {
                    display: 'none',
                },
                '.cm-fountain-heading': {
                    color: 'var(--text-primary)',
                    fontWeight: 'bold',
                    letterSpacing: '0.02em',
                },
                '.cm-fountain-character': {
                    color: '#8b8bff',
                },
                '.cm-fountain-dialogue': {
                    color: 'var(--text-primary)',
                },
                '.cm-fountain-parenthetical': {
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                },
                '.cm-fountain-transition': {
                    color: 'var(--text-muted)',
                },
                '.cm-fountain-note': {
                    color: 'var(--text-muted)',
                    opacity: '0.5',
                },
                '.cm-fountain-boneyard': {
                    color: 'var(--text-muted)',
                    opacity: '0.4',
                },
                '.cm-fountain-centered': {
                    color: 'var(--text-primary)',
                },
                '.cm-fountain-synopsis': {
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                },
                '.cm-fountain-section': {
                    color: 'var(--text-secondary)',
                    fontWeight: 'bold',
                },
                '.cm-fountain-titleKey': {
                    color: 'var(--text-muted)',
                },
                '.cm-fountain-titleValue': {
                    color: 'var(--text-secondary)',
                },
            }, { dark: true }),
        ],
    });

    return new EditorView({ state, parent: container });
}

// ── Initialize ──────────────────────────────────────────────────────────────

const container = document.getElementById('screenplay-panel');

if (container) {
    editorView = createEditor(container);
    initNavigatorResize();
    loadScreenplay();

    // Wire up header buttons
    const saveBtn = document.getElementById('btn-save-screenplay');
    if (saveBtn) saveBtn.addEventListener('click', saveScreenplay);

    const exportBtn = document.getElementById('btn-export-screenplay');
    if (exportBtn) exportBtn.addEventListener('click', exportScreenplay);

    // Warn before navigating away with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (unsaved) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

export { editorView, saveScreenplay, exportScreenplay };
