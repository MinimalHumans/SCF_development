/**
 * Screenplay Editor — CodeMirror 6 Initialization
 * ==================================================
 * Mounts a CodeMirror 6 editor with Fountain syntax highlighting,
 * load/save via API, unsaved state tracking, export, and a live
 * scene navigator sidebar.
 */

import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { EditorView, keymap, placeholder, drawSelection, Decoration, ViewPlugin, MatchDecorator } from 'https://esm.sh/@codemirror/view@6.36.5';
import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@6.8.0';
import { fountainLanguage } from './fountain-mode.js';

// ── Element type detection & Tab cycling ───────────────────────────────────

const HEADING_RE = /^(\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s./])/i;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 ._\-']+(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D?|O\.?C\.?)\))?$/;

function detectElementType(lineText, prevLineBlank) {
    const trimmed = lineText.trim();
    if (trimmed === '') return 'action';
    if (HEADING_RE.test(trimmed)) return 'heading';
    if (/^[A-Z][A-Z\s]+:$/.test(trimmed)) return 'transition';
    if (prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && !/[.,;!?]$/.test(trimmed)) return 'character';
    if (prevLineBlank && /^[A-Z][A-Z0-9 ._\-']{1,}$/.test(trimmed)) return 'character';
    return 'action';
}

const CYCLE_ORDER = ['action', 'heading', 'character', 'transition'];

function cycleElementType(view, direction) {
    const state = view.state;
    const sel = state.selection.main;
    const fromLine = state.doc.lineAt(sel.from);
    const toLine = state.doc.lineAt(sel.to);
    if (fromLine.number !== toLine.number) return false;

    const line = fromLine;
    const lineText = line.text;

    let prevLineBlank = true;
    if (line.number > 1) {
        const prev = state.doc.line(line.number - 1);
        prevLineBlank = prev.text.trim() === '';
    }

    const currentType = detectElementType(lineText, prevLineBlank);
    const idx = CYCLE_ORDER.indexOf(currentType);
    const nextIdx = (idx + direction + CYCLE_ORDER.length) % CYCLE_ORDER.length;
    const nextType = CYCLE_ORDER[nextIdx];

    let content = lineText;
    content = content.replace(/^\.(?=[A-Z])/i, '');
    content = content.replace(/^(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s*/i, '');
    content = content.replace(/:(\s*)$/, '$1');
    content = content.trim();

    let newText = content;
    let changes = [];
    let needBlankAbove = false;

    switch (nextType) {
        case 'action':
            newText = content;
            break;
        case 'heading':
            newText = 'INT. ' + content.toUpperCase();
            needBlankAbove = true;
            break;
        case 'character':
            newText = content.toUpperCase();
            newText = newText.replace(/[.,;!?]+$/, '');
            needBlankAbove = true;
            break;
        case 'transition':
            newText = content.toUpperCase();
            if (!newText.endsWith(':')) newText += ':';
            needBlankAbove = true;
            break;
    }

    if (needBlankAbove && line.number > 1) {
        const prev = state.doc.line(line.number - 1);
        if (prev.text.trim() !== '') {
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
    { key: 'Tab', run(view) { return cycleElementType(view, 1); } },
    { key: 'Shift-Tab', run(view) { return cycleElementType(view, -1); } },
]);

// ── Auto-Uppercase ─────────────────────────────────────────────────────────

function isAllUpperContent(text) {
    if (text.length === 0) return true;
    return /^[A-Z0-9 ._\-'()]*$/.test(text);
}

function isSceneHeadingLine(text) {
    return /^(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s/i.test(text.trim());
}

const autoUppercaseHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1 || !/[a-z]/.test(text)) return false;

    const state = view.state;
    const line = state.doc.lineAt(from);
    const textBefore = state.doc.sliceString(line.from, from);
    const textAfter = state.doc.sliceString(to, line.to);
    const fullLine = textBefore + text + textAfter;

    if (isSceneHeadingLine(fullLine)) {
        view.dispatch({
            changes: { from, to, insert: text.toUpperCase() },
            selection: { anchor: from + 1 },
        });
        return true;
    }

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
    for (let i = lineNumber - 1; i >= 1; i--) {
        const l = state.doc.line(i);
        const text = l.text.trim();
        if (text === '') return false;
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

    let prevLineBlank = line.number <= 1 || state.doc.line(line.number - 1).text.trim() === '';

    if (prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1 && sel.head === line.to) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n' },
            selection: { anchor: sel.head + 1 },
        });
        return true;
    }

    if (trimmed === '' && line.number > 1 && isInDialogueContext(state, line.number)) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n' },
            selection: { anchor: sel.head + 1 },
        });
        return true;
    }

    if (/^\s*\(.*\)\s*$/.test(lineText) && isInDialogueContext(state, line.number)) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n' },
            selection: { anchor: sel.head + 1 },
        });
        return true;
    }

    if (HEADING_RE.test(trimmed)) {
        view.dispatch({
            changes: { from: sel.head, insert: '\n\n' },
            selection: { anchor: sel.head + 2 },
        });
        return true;
    }

    return false;
}

const enterKeymap = keymap.of([
    { key: 'Enter', run: handleEnter },
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

// Navigator state
let navScenes = [];      // from API or live scan
let navCharacters = [];  // from API only
let navLocations = [];   // from API only
let activeFilter = null; // { type: 'character'|'location', name: string }
let liveScanTimer = null;

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
}

// ── Navigator collapse persistence ─────────────────────────────────────────

const COLLAPSE_KEY = 'scf-navigator-collapse-state';

function loadCollapseState() {
    try {
        return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {};
    } catch { return {}; }
}

function saveCollapseState(state) {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state));
}

function initCollapseHandlers() {
    const state = loadCollapseState();
    document.querySelectorAll('#navigator-panel .nav-section').forEach(section => {
        const id = section.id;
        if (state[id]) section.classList.add('collapsed');
        const header = section.querySelector('.nav-section-header');
        if (header) {
            header.addEventListener('click', () => {
                section.classList.toggle('collapsed');
                const s = loadCollapseState();
                s[id] = section.classList.contains('collapsed');
                saveCollapseState(s);
            });
        }
    });
}

// ── Navigator rendering ────────────────────────────────────────────────────

function renderScenes() {
    const container = document.getElementById('nav-scenes-items');
    const countBadge = document.getElementById('nav-scenes-count');
    if (!container) return;

    if (!navScenes.length) {
        container.innerHTML = '<span class="nav-empty-msg">No scenes found</span>';
        if (countBadge) countBadge.textContent = '';
        return;
    }

    if (countBadge) countBadge.textContent = navScenes.length;

    const frag = document.createDocumentFragment();
    for (const scene of navScenes) {
        const item = document.createElement('div');
        item.className = 'nav-item nav-scene-item';
        item.dataset.lineNumber = scene.line_number;
        item.dataset.sceneNumber = scene.scene_number;
        if (scene.characters) item.dataset.characters = scene.characters.join(',');

        const num = document.createElement('span');
        num.className = 'nav-scene-num';
        num.textContent = `#${scene.scene_number}`;

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        // Strip INT./EXT. prefix for compact display
        let displayName = scene.name.replace(/^(\.?(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s.]+)/i, '').trim();
        // Also strip trailing time of day
        displayName = displayName.replace(/\s*[-\.]\s*(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|TWILIGHT|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS?\s+LATER|SAME\s+TIME)\s*$/i, '');
        name.textContent = displayName || scene.name;
        name.title = scene.name;

        const badge = document.createElement('span');
        badge.className = 'nav-item-badge';
        badge.textContent = scene.character_count;
        badge.title = `${scene.character_count} character${scene.character_count !== 1 ? 's' : ''}`;

        item.appendChild(num);
        item.appendChild(name);
        if (scene.character_count > 0) item.appendChild(badge);

        item.addEventListener('click', () => scrollToLine(scene.line_number));
        frag.appendChild(item);
    }

    container.innerHTML = '';
    container.appendChild(frag);

    applyFilter();
    updateCurrentScene();
}

function renderCharacters() {
    const container = document.getElementById('nav-characters-items');
    const countBadge = document.getElementById('nav-characters-count');
    if (!container) return;

    if (!navCharacters.length) {
        container.innerHTML = '<span class="nav-empty-msg">No characters found</span>';
        if (countBadge) countBadge.textContent = '';
        return;
    }

    if (countBadge) countBadge.textContent = navCharacters.length;

    const frag = document.createDocumentFragment();
    for (const char of navCharacters) {
        const item = document.createElement('div');
        item.className = 'nav-item nav-char-item';
        if (!char.is_mapped) item.classList.add('unmapped');
        item.dataset.charName = char.name;

        const icon = document.createElement('span');
        icon.className = 'nav-item-icon';
        icon.textContent = '\ud83d\udc64';

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        name.textContent = char.display_name;

        const badge = document.createElement('span');
        badge.className = 'nav-item-badge';
        badge.textContent = char.scene_count;
        badge.title = `${char.scene_count} scene${char.scene_count !== 1 ? 's' : ''}`;

        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(badge);

        if (char.is_mapped && char.character_id) {
            const link = document.createElement('a');
            link.className = 'nav-item-link';
            link.href = `/browse?entity_type=character&entity_id=${char.character_id}`;
            link.textContent = '\u2192';
            link.title = 'Open in Entity Browser';
            link.addEventListener('click', (e) => e.stopPropagation());
            item.appendChild(link);
        }

        item.addEventListener('click', () => toggleFilter('character', char.name));
        frag.appendChild(item);
    }

    container.innerHTML = '';
    container.appendChild(frag);
    applyFilterHighlight();
}

function renderLocations() {
    const container = document.getElementById('nav-locations-items');
    const countBadge = document.getElementById('nav-locations-count');
    if (!container) return;

    if (!navLocations.length) {
        container.innerHTML = '<span class="nav-empty-msg">No locations found</span>';
        if (countBadge) countBadge.textContent = '';
        return;
    }

    if (countBadge) countBadge.textContent = navLocations.length;

    const frag = document.createDocumentFragment();
    for (const loc of navLocations) {
        const item = document.createElement('div');
        item.className = 'nav-item nav-loc-item';
        if (!loc.is_mapped) item.classList.add('unmapped');
        item.dataset.locName = loc.name.toUpperCase();

        const icon = document.createElement('span');
        icon.className = 'nav-item-icon';
        icon.textContent = '\ud83d\udccd';

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        name.textContent = loc.name;

        const badge = document.createElement('span');
        badge.className = 'nav-item-badge';
        badge.textContent = loc.scene_count;

        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(badge);

        if (loc.is_mapped && loc.location_id) {
            const link = document.createElement('a');
            link.className = 'nav-item-link';
            link.href = `/browse?entity_type=location&entity_id=${loc.location_id}`;
            link.textContent = '\u2192';
            link.title = 'Open in Entity Browser';
            link.addEventListener('click', (e) => e.stopPropagation());
            item.appendChild(link);
        }

        item.addEventListener('click', () => toggleFilter('location', loc.name.toUpperCase()));
        frag.appendChild(item);
    }

    container.innerHTML = '';
    container.appendChild(frag);
    applyFilterHighlight();
}

// ── Filtering ───────────────────────────────────────────────────────────────

function toggleFilter(type, name) {
    if (activeFilter && activeFilter.type === type && activeFilter.name === name) {
        activeFilter = null;
    } else {
        activeFilter = { type, name };
    }
    applyFilter();
    applyFilterHighlight();
}

function applyFilter() {
    const items = document.querySelectorAll('.nav-scene-item');
    const filterIndicator = document.getElementById('nav-scenes-filter');

    if (!activeFilter) {
        items.forEach(item => item.classList.remove('filtered-out'));
        if (filterIndicator) filterIndicator.classList.remove('active');
        return;
    }

    if (filterIndicator) filterIndicator.classList.add('active');

    items.forEach(item => {
        let visible = false;
        if (activeFilter.type === 'character') {
            const chars = (item.dataset.characters || '').split(',');
            visible = chars.includes(activeFilter.name);
        } else if (activeFilter.type === 'location') {
            // Match location by checking if the scene heading contains the location name
            const sceneNum = parseInt(item.dataset.sceneNumber);
            const scene = navScenes.find(s => s.scene_number === sceneNum);
            if (scene) {
                visible = scene.name.toUpperCase().includes(activeFilter.name);
            }
        }
        item.classList.toggle('filtered-out', !visible);
    });
}

function applyFilterHighlight() {
    document.querySelectorAll('.nav-char-item').forEach(item => {
        item.classList.toggle('active',
            activeFilter && activeFilter.type === 'character' && item.dataset.charName === activeFilter.name);
    });
    document.querySelectorAll('.nav-loc-item').forEach(item => {
        item.classList.toggle('active',
            activeFilter && activeFilter.type === 'location' && item.dataset.locName === activeFilter.name);
    });
}

// ── Click-to-scroll ────────────────────────────────────────────────────────

function scrollToLine(lineNumber) {
    if (!editorView) return;
    // lineNumber is 0-based in the stripped text; CodeMirror lines are 1-based
    const cmLineNum = lineNumber + 1;
    const totalLines = editorView.state.doc.lines;
    if (cmLineNum < 1 || cmLineNum > totalLines) return;

    const line = editorView.state.doc.line(cmLineNum);
    editorView.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
    });
    editorView.focus();
}

// ── Current scene tracking ─────────────────────────────────────────────────

function updateCurrentScene() {
    if (!editorView || !navScenes.length) return;

    const cursor = editorView.state.selection.main.head;
    const cursorLine = editorView.state.doc.lineAt(cursor);
    // CodeMirror is 1-based, navScenes line_number is 0-based
    const cursorLine0 = cursorLine.number - 1;

    // Find which scene contains the cursor
    let currentIdx = -1;
    for (let i = navScenes.length - 1; i >= 0; i--) {
        if (cursorLine0 >= navScenes[i].line_number) {
            currentIdx = i;
            break;
        }
    }

    // Update active highlighting
    const items = document.querySelectorAll('.nav-scene-item');
    items.forEach((item, idx) => {
        item.classList.toggle('active', idx === currentIdx);
    });

    // Scroll active scene into view in navigator
    if (currentIdx >= 0 && items[currentIdx]) {
        const el = items[currentIdx];
        const container = document.getElementById('nav-scenes-items');
        if (container) {
            const elRect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    // Update status bar — Sc N/Total
    const sceneEl = document.getElementById('status-scene');
    if (sceneEl) {
        if (currentIdx >= 0) {
            sceneEl.textContent = `Sc ${navScenes[currentIdx].scene_number}/${navScenes.length}`;
        } else {
            sceneEl.textContent = `Sc \u2014/${navScenes.length}`;
        }
    }

    // Update status bar — Chars in current scene
    updateCharsStatus(currentIdx);
}

function updateCharsStatus(currentIdx) {
    const charsEl = document.getElementById('status-chars');
    if (!charsEl) return;

    if (currentIdx < 0 || !navScenes[currentIdx]) {
        charsEl.textContent = '';
        return;
    }

    const scene = navScenes[currentIdx];
    const chars = scene.characters || [];
    if (!chars.length) {
        charsEl.textContent = '';
        return;
    }

    // Title-case the names for display
    const titleCase = (s) => s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

    if (chars.length <= 3) {
        charsEl.textContent = 'Chars: ' + chars.map(titleCase).join(', ');
    } else {
        charsEl.textContent = 'Chars: ' + chars.slice(0, 3).map(titleCase).join(', ') + `, +${chars.length - 3}`;
    }
}

// ── Status bar ──────────────────────────────────────────────────────────────

function updateCursorStatus(state) {
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);

    const lineEl = document.getElementById('status-line');
    const pageEl = document.getElementById('status-page');

    if (lineEl) lineEl.textContent = `Ln ${line.number}`;
    if (pageEl) pageEl.textContent = `Pg ~${Math.max(1, Math.ceil(line.number / 55))}`;

    updateCurrentScene();
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

// ── Live client-side scene scan (debounced) ─────────────────────────────────

function liveScanScenes() {
    if (!editorView) return;

    const text = editorView.state.doc.toString();
    const lines = text.split('\n');
    const scanned = [];
    let prevBlank = true;

    for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        // Remove anchor tags for matching
        const clean = stripped.replace(/\[\[scf:\w+:\d+\]\]/g, '').trim();

        if (clean === '') {
            prevBlank = true;
            continue;
        }

        if (HEADING_RE.test(clean)) {
            // Count characters until next heading
            const charSet = new Set();
            for (let j = i + 1; j < lines.length; j++) {
                const cl = lines[j].trim().replace(/\[\[scf:\w+:\d+\]\]/g, '').trim();
                if (cl === '') { prevBlank = true; continue; }
                if (HEADING_RE.test(cl)) break;
                if (prevBlank && CHARACTER_CUE_RE.test(cl) && !/[.,;!?]$/.test(cl)) {
                    // Extract name — strip extensions
                    let cName = cl.replace(/\s*\([^)]*\)\s*$/g, '').trim();
                    if (cName) charSet.add(cName.toUpperCase());
                }
                prevBlank = (cl === '');
            }

            scanned.push({
                scene_number: scanned.length + 1,
                name: clean,
                line_number: i,
                character_count: charSet.size,
                characters: Array.from(charSet).sort(),
                scene_id: null,
            });
        }

        prevBlank = (stripped === '');
    }

    // Preserve scene_ids from the API data if headings match
    if (navScenes.length) {
        const oldByKey = {};
        const oldCounters = {};
        for (const s of navScenes) {
            const key = s.name.toUpperCase();
            const occ = oldCounters[key] || 0;
            oldCounters[key] = occ + 1;
            oldByKey[key + ':' + occ] = s.scene_id;
        }
        const newCounters = {};
        for (const s of scanned) {
            const key = s.name.toUpperCase();
            const occ = newCounters[key] || 0;
            newCounters[key] = occ + 1;
            s.scene_id = oldByKey[key + ':' + occ] || null;
        }
    }

    navScenes = scanned;
    renderScenes();
}

function scheduleLiveScan() {
    if (liveScanTimer) clearTimeout(liveScanTimer);
    liveScanTimer = setTimeout(liveScanScenes, 500);
}

// ── Navigator data fetching ─────────────────────────────────────────────────

async function fetchNavigatorData() {
    try {
        const [scenesRes, charsRes, locsRes] = await Promise.all([
            fetch('/api/screenplay/scenes'),
            fetch('/api/screenplay/characters'),
            fetch('/api/screenplay/locations'),
        ]);
        if (scenesRes.ok) navScenes = await scenesRes.json();
        if (charsRes.ok) navCharacters = await charsRes.json();
        if (locsRes.ok) navLocations = await locsRes.json();
    } catch (e) {
        // Silently fail — navigator just stays empty
    }

    renderScenes();
    renderCharacters();
    renderLocations();
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

        // Refresh navigator after save (sync may have created new entities)
        fetchNavigatorData();
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

        // Populate navigator after text is loaded
        fetchNavigatorData();
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
                    scheduleLiveScan();
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
    initCollapseHandlers();
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
