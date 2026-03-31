/**
 * Screenplay Editor — Modal Writing System
 * ==========================================
 * Four writing modes driven by Enter/Tab:
 *   Description (default) → Scene (Enter on blank) → Description (Enter)
 *   Description → Tab → Character → Enter → Dialogue → Enter → Character ...
 *   Character + Enter on empty → Description
 *
 * Mode is EXPLICITLY set by Enter/Tab and protected from context-detection
 * for 300ms to prevent cursor-update listeners from overriding transitions.
 */

const CM_STATE_DEP = '@codemirror/state@6.5.2';
const { EditorState } = await import(`https://esm.sh/@codemirror/state@6.5.2`);
const { EditorView, keymap, placeholder, drawSelection, Decoration, ViewPlugin, MatchDecorator } =
    await import(`https://esm.sh/@codemirror/view@6.36.5?deps=${CM_STATE_DEP}`);
const { defaultKeymap, history, historyKeymap } =
    await import(`https://esm.sh/@codemirror/commands@6.8.0?deps=${CM_STATE_DEP}`);
const { StreamLanguage } =
    await import(`https://esm.sh/@codemirror/language@6.10.8?deps=${CM_STATE_DEP}`);

console.log('[SCF] All CodeMirror modules loaded');

// ═══════════════════════════════════════════════════════════════════════════
// Shared Patterns
// ═══════════════════════════════════════════════════════════════════════════

const HEADING_RE = /^(\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s./])/i;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 ._\-']+(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D?|O\.?C\.?)\))?$/;
const TRANSITION_RE = /^[A-Z\s]+(?:TO|IN|OUT|UP):?\s*$/;
const FORCED_TRANSITION_RE = /^>\s*.+/;
const PARENTHETICAL_RE_LINE = /^\s*\(.*\)\s*$/;
const TITLE_KEY_RE = /^(Title|Credit|Author|Authors|Source|Notes|Draft date|Date|Contact|Copyright|Revision|Font)\s*:/i;
const CENTERED_RE = /^>.*<$/;
const SECTION_RE = /^#{1,6}\s/;
const SYNOPSIS_RE = /^=\s/;

// ═══════════════════════════════════════════════════════════════════════════
// Fountain Language Mode (StreamLanguage — syntax coloring)
// ═══════════════════════════════════════════════════════════════════════════

const fountainStreamMode = {
    name: 'fountain',
    startState() { return { inBoneyard: false, inTitlePage: true, prevLineBlank: true, inDialogue: false }; },
    copyState(s) { return { ...s }; },
    token(stream, state) {
        if (state.inBoneyard) {
            const ci = stream.string.indexOf('*/', stream.pos);
            if (ci >= 0) { stream.pos = ci + 2; state.inBoneyard = false; } else stream.skipToEnd();
            return 'fountain-boneyard';
        }
        if (stream.match('/*')) {
            state.inBoneyard = true;
            const ci = stream.string.indexOf('*/', stream.pos);
            if (ci >= 0) { stream.pos = ci + 2; state.inBoneyard = false; } else stream.skipToEnd();
            return 'fountain-boneyard';
        }
        if (stream.sol()) {
            const line = stream.string, trimmed = line.trim();
            if (trimmed === '') { stream.skipToEnd(); state.prevLineBlank = true; state.inDialogue = false; return null; }
            if (state.inTitlePage) {
                if (TITLE_KEY_RE.test(line)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-titleKey'; }
                if (!state.prevLineBlank && trimmed !== '') { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-titleValue'; }
                if (state.prevLineBlank && trimmed !== '' && !TITLE_KEY_RE.test(line)) state.inTitlePage = false;
            }
            if (HEADING_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = false; return 'fountain-heading'; }
            if (SECTION_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-section'; }
            if (SYNOPSIS_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-synopsis'; }
            if (CENTERED_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-centered'; }
            if (FORCED_TRANSITION_RE.test(trimmed) && !CENTERED_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-transition'; }
            if (state.inDialogue && PARENTHETICAL_RE_LINE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-parenthetical'; }
            if (state.inDialogue) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-dialogue'; }
            if (state.prevLineBlank && TRANSITION_RE.test(trimmed) && trimmed.length > 2) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-transition'; }
            if (state.prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1 && !TRANSITION_RE.test(trimmed)) {
                stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = true; return 'fountain-character';
            }
            if (trimmed.startsWith('@')) { stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = true; return 'fountain-character'; }
            stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = false; return null;
        }
        stream.skipToEnd(); return null;
    },
    blankLine(state) { state.prevLineBlank = true; state.inDialogue = false; },
    languageData: { commentTokens: { block: { open: '/*', close: '*/' } } },
};
const fountainLanguage = StreamLanguage.define(fountainStreamMode);

// ═══════════════════════════════════════════════════════════════════════════
// Line Decoration Plugin — visual screenplay formatting
// Classifies lines by CONTENT for display. Mode system handles behavior.
// ═══════════════════════════════════════════════════════════════════════════

function classifyLine(trimmed, st) {
    if (trimmed === '') { st.prevBlank = true; st.inDialogue = false; return 'blank'; }
    if (st.inBoneyard) { if (trimmed.includes('*/')) st.inBoneyard = false; st.prevBlank = false; return 'boneyard'; }
    if (trimmed.startsWith('/*')) { st.inBoneyard = true; if (trimmed.includes('*/')) st.inBoneyard = false; st.prevBlank = false; return 'boneyard'; }
    if (st.inTitlePage) {
        if (TITLE_KEY_RE.test(trimmed)) { st.prevBlank = false; return 'titleKey'; }
        if (!st.prevBlank) { st.prevBlank = false; return 'titleValue'; }
        st.inTitlePage = false;
    }
    if (HEADING_RE.test(trimmed)) { st.prevBlank = false; st.inDialogue = false; return 'heading'; }
    if (SECTION_RE.test(trimmed)) { st.prevBlank = false; return 'section'; }
    if (SYNOPSIS_RE.test(trimmed)) { st.prevBlank = false; return 'synopsis'; }
    if (CENTERED_RE.test(trimmed)) { st.prevBlank = false; return 'centered'; }
    if (FORCED_TRANSITION_RE.test(trimmed) && !CENTERED_RE.test(trimmed)) { st.prevBlank = false; return 'transition'; }
    if (st.inDialogue && PARENTHETICAL_RE_LINE.test(trimmed)) { st.prevBlank = false; return 'parenthetical'; }
    if (st.inDialogue) { st.prevBlank = false; return 'dialogue'; }
    if (st.prevBlank && TRANSITION_RE.test(trimmed) && trimmed.length > 2) { st.prevBlank = false; return 'transition'; }
    if (st.prevBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1 && !TRANSITION_RE.test(trimmed)) {
        st.prevBlank = false; st.inDialogue = true; return 'character';
    }
    if (trimmed.startsWith('@')) { st.prevBlank = false; st.inDialogue = true; return 'character'; }
    st.prevBlank = false; st.inDialogue = false; return 'action';
}

const LINE_CLS = {
    heading: 'cm-scf-heading', action: 'cm-scf-action', character: 'cm-scf-character',
    dialogue: 'cm-scf-dialogue', parenthetical: 'cm-scf-parenthetical',
    transition: 'cm-scf-transition', titleKey: 'cm-scf-titleKey', titleValue: 'cm-scf-titleValue',
    section: 'cm-scf-section', synopsis: 'cm-scf-synopsis', centered: 'cm-scf-centered',
    boneyard: 'cm-scf-boneyard',
};

const lineDecorationPlugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
    build(view) {
        const decos = [], doc = view.state.doc;
        const st = { prevBlank: true, inDialogue: false, inBoneyard: false, inTitlePage: true };
        for (let i = 1; i <= doc.lines; i++) {
            const type = classifyLine(doc.line(i).text.trim(), st);
            const cls = LINE_CLS[type];
            if (cls) decos.push(Decoration.line({ attributes: { class: cls } }).range(doc.line(i).from));
        }
        return Decoration.set(decos, true);
    }
}, { decorations: v => v.decorations });

// Get the Fountain element type at current cursor by scanning context
function getLineType(view) {
    const doc = view.state.doc, curNum = doc.lineAt(view.state.selection.main.head).number;
    const st = { prevBlank: true, inDialogue: false, inBoneyard: false, inTitlePage: true };
    const start = Math.max(1, curNum - 60);
    if (start > 1) st.inTitlePage = false;
    let type = 'action';
    for (let i = start; i <= curNum; i++) type = classifyLine(doc.line(i).text.trim(), st);
    return type;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

let currentMode = 'description';
let modeLockUntil = 0;   // timestamp — context detection blocked until this

/**
 * Set mode explicitly (from Enter/Tab). The 'explicit' flag
 * activates a 300ms lock preventing detectModeFromContext from
 * overriding the mode during the next few update cycles.
 */
function setMode(mode, explicit) {
    currentMode = mode;
    if (explicit) modeLockUntil = Date.now() + 300;
    const el = document.getElementById('status-mode');
    if (el) {
        const labels = { description: 'Description', scene: 'Scene', character: 'Character', dialogue: 'Dialogue' };
        el.textContent = labels[mode] || 'Description';
    }
}

function detectModeFromContext(view) {
    const type = getLineType(view);
    switch (type) {
        case 'heading': return 'scene';
        case 'character': return 'character';
        case 'dialogue': return 'dialogue';
        case 'parenthetical': return 'dialogue';
        default: return 'description';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTER — modal transitions
//
// Description + content  → newline, stay Description
// Description + empty    → newline, → Scene
// Scene + content        → newline + blank, → Description
// Scene + empty          → → Description (changed mind)
// Character + content    → newline, → Dialogue
// Character + empty      → newline, → Description (exit dialogue block)
// Dialogue + content     → blank + newline, → Character (next speaker)
// Dialogue + empty       → newline, → Character
// ═══════════════════════════════════════════════════════════════════════════

function handleEnter(view) {
    if (isAutocompleteVisible()) return false;

    const st = view.state, sel = st.selection.main;
    const line = st.doc.lineAt(sel.head);
    const hasContent = line.text.trim().length > 0;

    switch (currentMode) {

        case 'description':
            if (hasContent) {
                // Normal newline, stay in description
                view.dispatch({ changes: { from: sel.head, insert: '\n' }, selection: { anchor: sel.head + 1 } });
                // mode stays description — no explicit set needed
                return true;
            }
            // Empty line → enter Scene Mode on next line
            setMode('scene', true);
            view.dispatch({ changes: { from: sel.head, insert: '\n' }, selection: { anchor: sel.head + 1 } });
            return true;

        case 'scene':
            if (hasContent) {
                // Typed a heading → blank line + newline, back to Description
                setMode('description', true);
                view.dispatch({ changes: { from: sel.head, insert: '\n\n' }, selection: { anchor: sel.head + 2 } });
                return true;
            }
            // Empty scene line (changed mind) → just go to Description
            setMode('description', true);
            view.dispatch({ changes: { from: sel.head, insert: '\n' }, selection: { anchor: sel.head + 1 } });
            return true;

        case 'character':
            if (hasContent) {
                // Typed a character name → newline, enter Dialogue
                setMode('dialogue', true);
                view.dispatch({ changes: { from: sel.head, insert: '\n' }, selection: { anchor: sel.head + 1 } });
                return true;
            }
            // Empty character line → exit dialogue block, back to Description
            setMode('description', true);
            view.dispatch({ changes: { from: sel.head, insert: '\n' }, selection: { anchor: sel.head + 1 } });
            return true;

        case 'dialogue':
            if (hasContent) {
                // Typed dialogue → blank line + newline, enter Character (next speaker)
                setMode('character', true);
                view.dispatch({ changes: { from: sel.head, insert: '\n\n' }, selection: { anchor: sel.head + 2 } });
                return true;
            }
            // Empty dialogue line → go to Character
            setMode('character', true);
            view.dispatch({ changes: { from: sel.head, insert: '\n' }, selection: { anchor: sel.head + 1 } });
            return true;
    }
    return false;
}

const enterKeymap = keymap.of([{ key: 'Enter', run: handleEnter }]);

// ═══════════════════════════════════════════════════════════════════════════
// TAB — enter Character Mode / Shift+Tab → Description
// ═══════════════════════════════════════════════════════════════════════════

function handleTab(view) {
    if (isAutocompleteVisible()) return false;
    // Tab → enter Character Mode (from any mode except dialogue-with-content)
    setMode('character', true);
    return true;
}

const tabKeymap = keymap.of([
    { key: 'Tab', run: handleTab },
    { key: 'Shift-Tab', run() { setMode('description', true); return true; } },
]);

// ═══════════════════════════════════════════════════════════════════════════
// Auto-Uppercase — active in Scene and Character modes only
// ═══════════════════════════════════════════════════════════════════════════

const autoUppercaseHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1 || !/[a-z]/.test(text)) return false;
    if (currentMode === 'scene' || currentMode === 'character') {
        view.dispatch({
            changes: { from, to, insert: text.toUpperCase() },
            selection: { anchor: from + 1 },
        });
        return true;
    }
    return false;
});

// ═══════════════════════════════════════════════════════════════════════════
// Anchor Tag Hiding
// ═══════════════════════════════════════════════════════════════════════════

const anchorMatcher = new MatchDecorator({ regexp: /\[\[scf:\w+:\d+\]\]/g, decoration: () => Decoration.replace({}) });
const anchorHidingPlugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = anchorMatcher.createDeco(view); }
    update(update) { this.decorations = anchorMatcher.updateDeco(update, this.decorations); }
}, { decorations: v => v.decorations });

// ═══════════════════════════════════════════════════════════════════════════
// Autocomplete — triggered by MODE, not by text patterns
// ═══════════════════════════════════════════════════════════════════════════

let acDropdown = null, acItems = [], acHighlight = -1, acType = null, acQuery = '', acDebounce = null, acNewTimer = null;

function getOrCreateDropdown() {
    if (!acDropdown) {
        acDropdown = document.createElement('div');
        acDropdown.className = 'screenplay-autocomplete hidden';
        document.body.appendChild(acDropdown);
        document.addEventListener('click', (e) => { if (acDropdown && !acDropdown.contains(e.target)) hideAutocomplete(); });
    }
    return acDropdown;
}
function isAutocompleteVisible() { return acDropdown && !acDropdown.classList.contains('hidden'); }
function hideAutocomplete() {
    if (acDropdown) { acDropdown.classList.add('hidden'); acDropdown.innerHTML = ''; }
    acItems = []; acHighlight = -1; acType = null; acQuery = '';
    if (acDebounce) { clearTimeout(acDebounce); acDebounce = null; }
    if (acNewTimer) { clearTimeout(acNewTimer); acNewTimer = null; }
}
function updateAcHighlight() {
    if (!acDropdown) return;
    acDropdown.querySelectorAll('.screenplay-ac-item').forEach((el, i) => el.classList.toggle('highlighted', i === acHighlight));
    const hl = acDropdown.querySelector('.highlighted'); if (hl) hl.scrollIntoView({ block: 'nearest' });
}

function showAutocompleteDropdown(items, type, coords) {
    const dd = getOrCreateDropdown();
    acItems = items; acHighlight = items.length > 0 ? 0 : -1; acType = type;
    dd.innerHTML = '';
    items.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'screenplay-ac-item' + (i === 0 ? ' highlighted' : '');
        const icon = type === 'character' ? '\ud83d\udc64' : '\ud83d\udccd';
        const name = type === 'character' ? (item.display_name || item.name) : item.name;
        el.innerHTML = `<span class="screenplay-ac-icon">${icon}</span><span class="screenplay-ac-name">${esc(name)}</span>`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectSuggestion(i); });
        el.addEventListener('mouseenter', () => { acHighlight = i; updateAcHighlight(); });
        dd.appendChild(el);
    });
    dd.style.left = Math.max(0, coords.left) + 'px';
    dd.style.top = (coords.bottom + 4) + 'px';
    dd.classList.remove('hidden');
}

function selectSuggestion(index) {
    if (index < 0 || index >= acItems.length || !editorView) return;
    const item = acItems[index], st = editorView.state, line = st.doc.lineAt(st.selection.main.head);
    if (acType === 'character') {
        editorView.dispatch({ changes: { from: line.from, to: line.to, insert: item.name }, selection: { anchor: line.from + item.name.length } });
    } else if (acType === 'location') {
        const m = line.text.match(/^(\.?(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s*)/i);
        const prefix = m ? m[1] : '';
        const newText = prefix + item.name.toUpperCase() + ' - ';
        editorView.dispatch({ changes: { from: line.from, to: line.to, insert: newText }, selection: { anchor: line.from + newText.length } });
    }
    hideAutocomplete(); editorView.focus();
}

function checkAutocompleteContext() {
    if (!editorView) return;
    const st = editorView.state, sel = st.selection.main;
    if (!sel.empty) { hideAutocomplete(); return; }
    const trimmed = st.doc.lineAt(sel.head).text.trim();
    if (!trimmed || trimmed.length < 2) { hideAutocomplete(); return; }

    if (currentMode === 'character') {
        const query = trimmed.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        if (query.length >= 2) { triggerAutocomplete('character', query); return; }
    }

    if (currentMode === 'scene') {
        const m = trimmed.match(/^(\.?(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s+)(.+)/i);
        if (m && !m[2].includes(' - ') && m[2].trim().length >= 1) {
            triggerAutocomplete('location', m[2].replace(/\s*-\s*$/, '').trim());
            return;
        }
    }

    hideAutocomplete();
}

function triggerAutocomplete(type, query) {
    if (query === acQuery && type === acType && isAutocompleteVisible()) return;
    acQuery = query;
    if (acDebounce) clearTimeout(acDebounce);
    acDebounce = setTimeout(async () => {
        const endpoint = type === 'character'
            ? `/api/screenplay/autocomplete-characters?q=${encodeURIComponent(query)}`
            : `/api/screenplay/autocomplete-locations?q=${encodeURIComponent(query)}`;
        try {
            const res = await fetch(endpoint); if (!res.ok) return;
            const items = await res.json();
            if (!editorView) return;
            if (!items.length) {
                if (type === 'character' && query.length >= 2) showNewEntityIndicator(query);
                else hideAutocomplete();
                return;
            }
            const coords = editorView.coordsAtPos(editorView.state.selection.main.head);
            if (coords) showAutocompleteDropdown(items, type, coords);
        } catch (e) { /* silently fail */ }
    }, 200);
}

function showNewEntityIndicator(name) {
    const dd = getOrCreateDropdown(); acItems = []; acHighlight = -1;
    dd.innerHTML = `<div class="screenplay-ac-new">New character "${esc(name)}" \u2014 will be created on save</div>`;
    const coords = editorView.coordsAtPos(editorView.state.selection.main.head);
    if (coords) { dd.style.left = Math.max(0, coords.left) + 'px'; dd.style.top = (coords.bottom + 4) + 'px'; dd.classList.remove('hidden'); }
    if (acNewTimer) clearTimeout(acNewTimer);
    acNewTimer = setTimeout(() => { if (dd.querySelector('.screenplay-ac-new')) hideAutocomplete(); }, 2000);
}

const autocompleteKeymap = keymap.of([
    { key: 'ArrowDown', run() { if (!isAutocompleteVisible() || !acItems.length) return false; acHighlight = Math.min(acHighlight + 1, acItems.length - 1); updateAcHighlight(); return true; } },
    { key: 'ArrowUp', run() { if (!isAutocompleteVisible() || !acItems.length) return false; acHighlight = Math.max(acHighlight - 1, 0); updateAcHighlight(); return true; } },
    { key: 'Enter', run() { if (!isAutocompleteVisible() || acHighlight < 0 || !acItems.length) return false; selectSuggestion(acHighlight); return true; } },
    { key: 'Tab', run() { if (!isAutocompleteVisible() || acHighlight < 0 || !acItems.length) return false; selectSuggestion(acHighlight); return true; } },
    { key: 'Escape', run() { if (!isAutocompleteVisible()) return false; hideAutocomplete(); return true; } },
]);

// ═══════════════════════════════════════════════════════════════════════════
// Editor state
// ═══════════════════════════════════════════════════════════════════════════

let editorView = null;
let unsaved = false, saving = false, savedTimeout = null;
let navScenes = [], navCharacters = [], navLocations = [];
let activeFilter = null, liveScanTimer = null;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2500); }
function showSyncToast(sync) {
    const parts = [];
    if (sync.scenes_created) parts.push(`${sync.scenes_created} scene${sync.scenes_created > 1 ? 's' : ''}`);
    if (sync.characters_created) parts.push(`${sync.characters_created} character${sync.characters_created > 1 ? 's' : ''}`);
    if (sync.locations_created) parts.push(`${sync.locations_created} location${sync.locations_created > 1 ? 's' : ''}`);
    if (sync.props_created) parts.push(`${sync.props_created} prop${sync.props_created > 1 ? 's' : ''}`);
    if (parts.length) showToast('Synced: ' + parts.join(', '));
    if (sync.errors?.length) sync.errors.forEach(e => showToast('\u26a0 ' + e));
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ═══════════════════════════════════════════════════════════════════════════
// Navigator
// ═══════════════════════════════════════════════════════════════════════════

function initNavigatorResize() {
    const panel = document.getElementById('navigator-panel'); if (!panel) return;
    const KEY = 'scf-panel-navigator-width', MIN = 180, MAX = 500;
    const saved = localStorage.getItem(KEY);
    if (saved) panel.style.width = Math.max(MIN, Math.min(MAX, parseInt(saved, 10))) + 'px';
    const handle = document.createElement('div'); handle.className = 'panel-resize-handle'; panel.appendChild(handle);
    let startX, startW;
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault(); startX = e.clientX; startW = panel.getBoundingClientRect().width; handle.classList.add('dragging');
        const move = (e) => { panel.style.width = Math.max(MIN, Math.min(MAX, startW + (e.clientX - startX))) + 'px'; };
        const up = () => { handle.classList.remove('dragging'); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); localStorage.setItem(KEY, Math.round(panel.getBoundingClientRect().width)); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
}

const COLLAPSE_KEY = 'scf-navigator-collapse-state';
function loadCollapseState() { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { return {}; } }
function saveCollapseState(s) { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s)); }
function initCollapseHandlers() {
    const st = loadCollapseState();
    document.querySelectorAll('#navigator-panel .nav-section').forEach(sec => {
        if (st[sec.id]) sec.classList.add('collapsed');
        const hdr = sec.querySelector('.nav-section-header');
        if (hdr) hdr.addEventListener('click', () => { sec.classList.toggle('collapsed'); const s = loadCollapseState(); s[sec.id] = sec.classList.contains('collapsed'); saveCollapseState(s); });
    });
}

function renderScenes() {
    const c = document.getElementById('nav-scenes-items'), b = document.getElementById('nav-scenes-count'); if (!c) return;
    if (!navScenes.length) { c.innerHTML = '<span class="nav-empty-msg">No scenes found</span>'; if (b) b.textContent = ''; return; }
    if (b) b.textContent = navScenes.length;
    const f = document.createDocumentFragment();
    for (const sc of navScenes) {
        const item = document.createElement('div'); item.className = 'nav-item nav-scene-item';
        item.dataset.lineNumber = sc.line_number; item.dataset.sceneNumber = sc.scene_number;
        if (sc.characters) item.dataset.characters = sc.characters.join(',');
        const num = document.createElement('span'); num.className = 'nav-scene-num'; num.textContent = `#${sc.scene_number}`;
        const name = document.createElement('span'); name.className = 'nav-item-name';
        let dn = sc.name.replace(/^(\.?(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s.]+)/i, '').trim();
        dn = dn.replace(/\s*[-\.]\s*(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|TWILIGHT|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS?\s+LATER|SAME\s+TIME)\s*$/i, '');
        name.textContent = dn || sc.name; name.title = sc.name;
        item.appendChild(num); item.appendChild(name);
        if (sc.character_count > 0) { const bg = document.createElement('span'); bg.className = 'nav-item-badge'; bg.textContent = sc.character_count; item.appendChild(bg); }
        item.addEventListener('click', () => scrollToLine(sc.line_number)); f.appendChild(item);
    }
    c.innerHTML = ''; c.appendChild(f); applyFilter(); updateCurrentScene();
}

function renderCharacters() {
    const c = document.getElementById('nav-characters-items'), b = document.getElementById('nav-characters-count'); if (!c) return;
    if (!navCharacters.length) { c.innerHTML = '<span class="nav-empty-msg">No characters found</span>'; if (b) b.textContent = ''; return; }
    if (b) b.textContent = navCharacters.length;
    const f = document.createDocumentFragment();
    for (const ch of navCharacters) {
        const item = document.createElement('div'); item.className = 'nav-item nav-char-item';
        if (!ch.is_mapped) item.classList.add('unmapped'); item.dataset.charName = ch.name;
        item.innerHTML = `<span class="nav-item-icon">\ud83d\udc64</span><span class="nav-item-name">${esc(ch.display_name)}</span><span class="nav-item-badge">${ch.scene_count}</span>`;
        if (ch.is_mapped && ch.character_id) { const lk = document.createElement('a'); lk.className = 'nav-item-link'; lk.href = `/browse?entity_type=character&entity_id=${ch.character_id}`; lk.textContent = '\u2192'; lk.title = 'Open in Entity Browser'; lk.addEventListener('click', e => e.stopPropagation()); item.appendChild(lk); }
        item.addEventListener('click', () => toggleFilter('character', ch.name)); f.appendChild(item);
    }
    c.innerHTML = ''; c.appendChild(f); applyFilterHighlight();
}

function renderLocations() {
    const c = document.getElementById('nav-locations-items'), b = document.getElementById('nav-locations-count'); if (!c) return;
    if (!navLocations.length) { c.innerHTML = '<span class="nav-empty-msg">No locations found</span>'; if (b) b.textContent = ''; return; }
    if (b) b.textContent = navLocations.length;
    const f = document.createDocumentFragment();
    for (const loc of navLocations) {
        const item = document.createElement('div'); item.className = 'nav-item nav-loc-item';
        if (!loc.is_mapped) item.classList.add('unmapped'); item.dataset.locName = loc.name.toUpperCase();
        item.innerHTML = `<span class="nav-item-icon">\ud83d\udccd</span><span class="nav-item-name">${esc(loc.name)}</span><span class="nav-item-badge">${loc.scene_count}</span>`;
        if (loc.is_mapped && loc.location_id) { const lk = document.createElement('a'); lk.className = 'nav-item-link'; lk.href = `/browse?entity_type=location&entity_id=${loc.location_id}`; lk.textContent = '\u2192'; lk.title = 'Open in Entity Browser'; lk.addEventListener('click', e => e.stopPropagation()); item.appendChild(lk); }
        item.addEventListener('click', () => toggleFilter('location', loc.name.toUpperCase())); f.appendChild(item);
    }
    c.innerHTML = ''; c.appendChild(f); applyFilterHighlight();
}

function toggleFilter(type, name) { activeFilter = (activeFilter && activeFilter.type === type && activeFilter.name === name) ? null : { type, name }; applyFilter(); applyFilterHighlight(); }
function applyFilter() {
    const items = document.querySelectorAll('.nav-scene-item'), ind = document.getElementById('nav-scenes-filter');
    if (!activeFilter) { items.forEach(i => i.classList.remove('filtered-out')); if (ind) ind.classList.remove('active'); return; }
    if (ind) ind.classList.add('active');
    items.forEach(item => {
        let vis = false;
        if (activeFilter.type === 'character') vis = (item.dataset.characters || '').split(',').includes(activeFilter.name);
        else if (activeFilter.type === 'location') { const sc = navScenes.find(s => s.scene_number === parseInt(item.dataset.sceneNumber)); if (sc) vis = sc.name.toUpperCase().includes(activeFilter.name); }
        item.classList.toggle('filtered-out', !vis);
    });
}
function applyFilterHighlight() {
    document.querySelectorAll('.nav-char-item').forEach(i => i.classList.toggle('active', !!(activeFilter && activeFilter.type === 'character' && i.dataset.charName === activeFilter.name)));
    document.querySelectorAll('.nav-loc-item').forEach(i => i.classList.toggle('active', !!(activeFilter && activeFilter.type === 'location' && i.dataset.locName === activeFilter.name)));
}

function scrollToLine(ln) {
    if (!editorView) return; const n = ln + 1; if (n < 1 || n > editorView.state.doc.lines) return;
    editorView.dispatch({ selection: { anchor: editorView.state.doc.line(n).from }, scrollIntoView: true }); editorView.focus();
}

function updateCurrentScene() {
    if (!editorView || !navScenes.length) return;
    const cur0 = editorView.state.doc.lineAt(editorView.state.selection.main.head).number - 1;
    let idx = -1;
    for (let i = navScenes.length - 1; i >= 0; i--) { if (cur0 >= navScenes[i].line_number) { idx = i; break; } }
    document.querySelectorAll('.nav-scene-item').forEach((el, i) => el.classList.toggle('active', i === idx));
    const se = document.getElementById('status-scene');
    if (se) se.textContent = idx >= 0 ? `Sc ${navScenes[idx].scene_number}/${navScenes.length}` : `Sc \u2014/${navScenes.length}`;
    const charsEl = document.getElementById('status-chars');
    if (charsEl) {
        if (idx < 0 || !navScenes[idx]) { charsEl.textContent = ''; }
        else {
            const chars = navScenes[idx].characters || [];
            const tc = s => s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
            charsEl.textContent = !chars.length ? '' : chars.length <= 3 ? 'Chars: ' + chars.map(tc).join(', ') : 'Chars: ' + chars.slice(0, 3).map(tc).join(', ') + `, +${chars.length - 3}`;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Status bar
// ═══════════════════════════════════════════════════════════════════════════

function updateCursorStatus(state) {
    const line = state.doc.lineAt(state.selection.main.head);
    const le = document.getElementById('status-line'), pe = document.getElementById('status-page');
    if (le) le.textContent = `Ln ${line.number}`;
    if (pe) pe.textContent = `Pg ~${Math.max(1, Math.ceil(line.number / 55))}`;
    updateCurrentScene();
}
function setSaveStatus(text, color) { const el = document.getElementById('status-save'); if (el) { el.textContent = text; el.style.color = color || ''; } }
function markUnsaved() { if (saving) return; unsaved = true; if (savedTimeout) { clearTimeout(savedTimeout); savedTimeout = null; } setSaveStatus('Unsaved \u2022', 'var(--warning)'); }
function markSaved() { unsaved = false; saving = false; setSaveStatus('Saved \u2713', 'var(--success)'); if (savedTimeout) clearTimeout(savedTimeout); savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 3000); }
function markSaving() { saving = true; setSaveStatus('Saving\u2026', ''); }
function markSaveFailed() { saving = false; setSaveStatus('Save failed', 'var(--warning)'); }

// ═══════════════════════════════════════════════════════════════════════════
// Live scene scan
// ═══════════════════════════════════════════════════════════════════════════

function liveScanScenes() {
    if (!editorView) return;
    const lines = editorView.state.doc.toString().split('\n'), scanned = [];
    for (let i = 0; i < lines.length; i++) {
        const clean = lines[i].trim().replace(/\[\[scf:\w+:\d+\]\]/g, '').trim();
        if (clean === '') continue;
        if (HEADING_RE.test(clean)) {
            const cs = new Set(); let pb = true;
            for (let j = i + 1; j < lines.length; j++) {
                const cl = lines[j].trim().replace(/\[\[scf:\w+:\d+\]\]/g, '').trim();
                if (cl === '') { pb = true; continue; } if (HEADING_RE.test(cl)) break;
                if (pb && CHARACTER_CUE_RE.test(cl) && !/[.,;!?]$/.test(cl)) { let cn = cl.replace(/\s*\([^)]*\)\s*$/g, '').trim(); if (cn) cs.add(cn.toUpperCase()); }
                pb = (cl === '');
            }
            scanned.push({ scene_number: scanned.length + 1, name: clean, line_number: i, character_count: cs.size, characters: Array.from(cs).sort(), scene_id: null });
        }
    }
    if (navScenes.length) {
        const old = {}, oc = {}; for (const s of navScenes) { const k = s.name.toUpperCase(), o = oc[k] || 0; oc[k] = o + 1; old[k + ':' + o] = s.scene_id; }
        const nc = {}; for (const s of scanned) { const k = s.name.toUpperCase(), o = nc[k] || 0; nc[k] = o + 1; s.scene_id = old[k + ':' + o] || null; }
    }
    navScenes = scanned; renderScenes();
}
function scheduleLiveScan() { if (liveScanTimer) clearTimeout(liveScanTimer); liveScanTimer = setTimeout(liveScanScenes, 500); }

async function fetchNavigatorData() {
    try {
        const [sr, cr, lr] = await Promise.all([fetch('/api/screenplay/scenes'), fetch('/api/screenplay/characters'), fetch('/api/screenplay/locations')]);
        if (sr.ok) navScenes = await sr.json(); if (cr.ok) navCharacters = await cr.json(); if (lr.ok) navLocations = await lr.json();
    } catch (e) { console.error('Navigator fetch failed:', e); }
    renderScenes(); renderCharacters(); renderLocations();
}

// ═══════════════════════════════════════════════════════════════════════════
// Save / Export / Load
// ═══════════════════════════════════════════════════════════════════════════

async function saveScreenplay() {
    if (!editorView || saving) return; markSaving(); hideAutocomplete();
    try {
        const res = await fetch('/api/screenplay/save', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: editorView.state.doc.toString() }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Save failed');
        const data = await res.json(); markSaved(); if (data.sync) showSyncToast(data.sync); fetchNavigatorData();
    } catch (e) { markSaveFailed(); showToast(`Save error: ${e.message}`); }
}
function exportScreenplay() { const a = document.createElement('a'); a.href = '/api/screenplay/export'; a.click(); }
async function loadScreenplay() {
    if (!editorView) return;
    try {
        const res = await fetch('/api/screenplay/load'); if (!res.ok) throw new Error('Failed to load');
        const data = await res.json(); if (!data.has_fountain) return;
        editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: data.text || '' } });
        unsaved = false; setSaveStatus('Loaded \u2713', 'var(--success)'); savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 2000);
        fetchNavigatorData();
    } catch (e) {
        console.error('Load failed:', e);
        const p = document.getElementById('screenplay-panel');
        if (p) { const m = document.createElement('div'); m.className = 'screenplay-load-error'; m.textContent = 'Failed to load screenplay. Please try refreshing.'; p.appendChild(m); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CodeMirror setup
// ═══════════════════════════════════════════════════════════════════════════

function createEditor(container) {
    const state = EditorState.create({
        doc: '',
        extensions: [
            fountainLanguage, history(), drawSelection(), EditorView.lineWrapping,
            placeholder('Loading screenplay\u2026'),
            lineDecorationPlugin,
            autocompleteKeymap,     // highest priority when dropdown visible
            tabKeymap,              // Tab/Shift-Tab for mode switching
            enterKeymap,            // Enter for mode transitions
            autoUppercaseHandler,
            anchorHidingPlugin,
            keymap.of([
                { key: 'Mod-s', run() { saveScreenplay(); return true; } },
                ...defaultKeymap,
                ...historyKeymap,
            ]),
            EditorView.updateListener.of((update) => {
                if (update.selectionSet || update.docChanged) updateCursorStatus(update.state);

                if (update.docChanged) {
                    markUnsaved();
                    scheduleLiveScan();
                    checkAutocompleteContext();
                } else if (update.selectionSet) {
                    // Cursor moved (click, arrow keys) without doc change.
                    // Only detect mode from context if we're NOT in a
                    // mode-lock window from a recent Enter/Tab.
                    if (Date.now() > modeLockUntil) {
                        setMode(detectModeFromContext(update.view));
                    }
                    checkAutocompleteContext();
                }
            }),
            EditorView.domEventHandlers({ blur() { setTimeout(hideAutocomplete, 150); } }),
            EditorView.theme({
                '&': { backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Courier Prime', 'Courier New', Courier, monospace", fontSize: '15px', lineHeight: '1.5', flex: '1' },
                '.cm-content': { caretColor: 'var(--accent)' },
                '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
                '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--accent-subtle) !important' },
                '.cm-activeLine': { backgroundColor: 'rgba(42, 42, 56, 0.3)' },
                '.cm-gutters': { display: 'none' },
            }, { dark: true }),
        ],
    });
    return new EditorView({ state, parent: container });
}

// ═══════════════════════════════════════════════════════════════════════════
// Initialize
// ═══════════════════════════════════════════════════════════════════════════

const container = document.getElementById('screenplay-panel');
if (container) {
    editorView = createEditor(container);
    initNavigatorResize(); initCollapseHandlers(); loadScreenplay();
    document.getElementById('btn-save-screenplay')?.addEventListener('click', saveScreenplay);
    document.getElementById('btn-export-screenplay')?.addEventListener('click', exportScreenplay);
    window.addEventListener('beforeunload', (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });
    setMode('description', true);
}

export { editorView, saveScreenplay, exportScreenplay };
