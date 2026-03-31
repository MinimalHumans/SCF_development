/**
 * Screenplay Editor — CodeMirror 6 Initialization
 * ==================================================
 * Mounts a CodeMirror 6 editor with Fountain syntax highlighting
 * inside the #screenplay-panel container.
 */

import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { EditorView, keymap, placeholder, drawSelection } from 'https://esm.sh/@codemirror/view@6.36.5';
import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@6.8.0';
import { fountainLanguage } from './fountain-mode.js';

// ── Navigator panel resize ──────────────────────────────────────────────────

function initNavigatorResize() {
    const panel = document.getElementById('navigator-panel');
    if (!panel) return;

    const STORAGE_KEY = 'scf-panel-navigator-width';
    const MIN_W = 180;
    const MAX_W = 500;

    // Restore saved width
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const w = Math.max(MIN_W, Math.min(MAX_W, parseInt(saved, 10)));
        panel.style.width = w + 'px';
    }

    // Create resize handle
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

    // Navigator section collapse toggles
    panel.querySelectorAll('.nav-section-header').forEach((header) => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('collapsed');
        });
    });
}

// ── Status bar updates ──────────────────────────────────────────────────────

function updateStatusBar(state) {
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);

    const lineEl = document.getElementById('status-line');
    const pageEl = document.getElementById('status-page');

    if (lineEl) lineEl.textContent = `Ln ${line.number}`;
    if (pageEl) pageEl.textContent = `Pg ~${Math.max(1, Math.ceil(line.number / 55))}`;
}

// ── CodeMirror setup ────────────────────────────────────────────────────────

function createEditor(container) {
    const state = EditorState.create({
        doc: '',
        extensions: [
            fountainLanguage,
            history(),
            drawSelection(),
            EditorView.lineWrapping,
            placeholder('Loading screenplay...'),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
                if (update.selectionSet || update.docChanged) {
                    updateStatusBar(update.state);
                }
            }),
            // Dark theme matching the app
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
                // Fountain syntax token styles
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

    const view = new EditorView({
        state,
        parent: container,
    });

    return view;
}

// ── Initialize on DOM ready ─────────────────────────────────────────────────

const container = document.getElementById('screenplay-panel');
let editorView = null;

if (container) {
    editorView = createEditor(container);
    initNavigatorResize();

    // Load fountain content from the server
    fetch('/api/screenplay/content')
        .then((res) => {
            if (res.ok) return res.text();
            return '';
        })
        .then((text) => {
            if (text && editorView) {
                editorView.dispatch({
                    changes: { from: 0, to: editorView.state.doc.length, insert: text },
                });
            }
        })
        .catch(() => {
            // Content load will be handled in Phase 2B
        });
}

export { editorView };
