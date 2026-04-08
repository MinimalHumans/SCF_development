/**
 * SCF Screenplay Editor v2 — SQLite-Native
 * ==========================================
 * 
 * Source of truth: screenplay_lines table (structured rows with entity FKs)
 * Editor: CodeMirror 6 with parallel metadata
 * 
 * Load: GET /api/screenplay-v2/load → lines array → CodeMirror text
 * Save: CodeMirror text → classify lines → PUT /api/screenplay-v2/save
 * 
 * Tab cycles modes: Description → Scene → Character → Dialogue → Transition
 * Autocomplete: Character mode → character names, Scene mode → locations
 * Navigator: DB queries via /api/screenplay-v2/scenes|characters|locations
 */

// ═══════════════════════════════════════════════════════════════════════════
// CodeMirror Imports
// ═══════════════════════════════════════════════════════════════════════════

const CM_STATE_DEP = '@codemirror/state@6.5.2';
const { EditorState } = await import(`https://esm.sh/@codemirror/state@6.5.2`);
const { EditorView, keymap, placeholder, drawSelection, Decoration, ViewPlugin, MatchDecorator } =
    await import(`https://esm.sh/@codemirror/view@6.36.5?deps=${CM_STATE_DEP}`);
const { defaultKeymap, history, historyKeymap } =
    await import(`https://esm.sh/@codemirror/commands@6.8.0?deps=${CM_STATE_DEP}`);
const { StreamLanguage } =
    await import(`https://esm.sh/@codemirror/language@6.10.8?deps=${CM_STATE_DEP}`);

console.log('[SCF-v2] Modules loaded');

// ═══════════════════════════════════════════════════════════════════════════
// Patterns
// ═══════════════════════════════════════════════════════════════════════════
const HEADING_RE = /^(\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s./])/i;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 ._\-']+(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D?|O\.?C\.?)\))?$/;
const TRANSITION_RE = /^[A-Z\s]+(?:TO|IN|OUT|UP):?\s*$/;
const FORCED_TRANSITION_RE = /^>\s*.+/;
const PARENTHETICAL_RE = /^\s*\(.*\)\s*$/;
const TITLE_KEY_RE = /^(Title|Credit|Author|Authors|Source|Notes|Draft date|Date|Contact|Copyright|Revision|Font)\s*:/i;
const CENTERED_RE = /^>.*<$/;
const SECTION_RE = /^#{1,6}\s/;
const SYNOPSIS_RE = /^=\s/;

// Character extension stripping
const CHAR_EXT_RE = /\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D?)\)\s*$/i;

// ═══════════════════════════════════════════════════════════════════════════
// Line Classification
// ═══════════════════════════════════════════════════════════════════════════

function classifyLine(trimmed, st) {
    if (trimmed === '') { st.prevBlank = true; st.inDialogue = false; return 'blank'; }
    if (st.inBoneyard) { if (trimmed.includes('*/')) st.inBoneyard = false; st.prevBlank = false; return 'boneyard'; }
    if (trimmed.startsWith('/*')) { st.inBoneyard = true; if (trimmed.includes('*/')) st.inBoneyard = false; st.prevBlank = false; return 'boneyard'; }
    if (st.inTitlePage) {
        if (TITLE_KEY_RE.test(trimmed)) { st.prevBlank = false; return 'titlekey'; }
        if (!st.prevBlank) { st.prevBlank = false; return 'titlevalue'; }
        st.inTitlePage = false;
    }
    if (HEADING_RE.test(trimmed)) { st.prevBlank = false; st.inDialogue = false; return 'heading'; }
    if (SECTION_RE.test(trimmed)) { st.prevBlank = false; return 'section'; }
    if (SYNOPSIS_RE.test(trimmed)) { st.prevBlank = false; return 'synopsis'; }
    if (CENTERED_RE.test(trimmed)) { st.prevBlank = false; return 'centered'; }
    if (FORCED_TRANSITION_RE.test(trimmed) && !CENTERED_RE.test(trimmed)) { st.prevBlank = false; return 'transition'; }
    if (st.inDialogue && PARENTHETICAL_RE.test(trimmed)) { st.prevBlank = false; return 'parenthetical'; }
    if (st.inDialogue) { st.prevBlank = false; return 'dialogue'; }
    if (st.prevBlank && TRANSITION_RE.test(trimmed) && trimmed.length > 2) { st.prevBlank = false; return 'transition'; }
    if (st.prevBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1 && !TRANSITION_RE.test(trimmed)) {
        st.prevBlank = false; st.inDialogue = true; return 'character';
    }
    if (trimmed.startsWith('@')) { st.prevBlank = false; st.inDialogue = true; return 'character'; }
    st.prevBlank = false; st.inDialogue = false; return 'action';
}

/** Classify all lines in a text string. Returns array of {line_type, content}. */
function classifyAllLines(text) {
    const rawLines = text.split('\n');
    const st = { prevBlank: true, inDialogue: false, inBoneyard: false, inTitlePage: true };
    return rawLines.map(raw => {
        const trimmed = raw.trim();
        const line_type = classifyLine(trimmed, st);
        return { line_type, content: trimmed };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Entity Cache — content-addressed ID lookup
// ═══════════════════════════════════════════════════════════════════════════
// Maps "type:CONTENT" → {scene_id, character_id, location_id}
// Survives edits because it's keyed by content, not position.

const entityCache = new Map();

function cacheKey(lineType, content) {
    return `${lineType}:${content.trim()}`;
}

function cacheEntityIds(lineType, content, ids) {
    const key = cacheKey(lineType, content);
    const existing = entityCache.get(key) || {};
    entityCache.set(key, { ...existing, ...ids });
}

function getCachedIds(lineType, content) {
    return entityCache.get(cacheKey(lineType, content)) || {};
}

// ═══════════════════════════════════════════════════════════════════════════
// Fountain StreamLanguage (syntax coloring — unchanged)
// ═══════════════════════════════════════════════════════════════════════════
const fountainStreamMode = {
    name: 'fountain',
    startState() { return { inBoneyard: false, inTitlePage: true, prevLineBlank: true, inDialogue: false }; },
    copyState(s) { return { ...s }; },
    token(stream, state) {
        if (state.inBoneyard) { const ci = stream.string.indexOf('*/', stream.pos); if (ci >= 0) { stream.pos = ci + 2; state.inBoneyard = false; } else stream.skipToEnd(); return 'fountain-boneyard'; }
        if (stream.match('/*')) { state.inBoneyard = true; const ci = stream.string.indexOf('*/', stream.pos); if (ci >= 0) { stream.pos = ci + 2; state.inBoneyard = false; } else stream.skipToEnd(); return 'fountain-boneyard'; }
        if (stream.sol()) {
            const trimmed = stream.string.trim();
            if (trimmed === '') { stream.skipToEnd(); state.prevLineBlank = true; state.inDialogue = false; return null; }
            if (state.inTitlePage) { if (TITLE_KEY_RE.test(stream.string)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-titleKey'; } if (!state.prevLineBlank) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-titleValue'; } if (state.prevLineBlank && !TITLE_KEY_RE.test(stream.string)) state.inTitlePage = false; }
            if (HEADING_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = false; return 'fountain-heading'; }
            if (SECTION_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-section'; }
            if (SYNOPSIS_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-synopsis'; }
            if (CENTERED_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-centered'; }
            if (FORCED_TRANSITION_RE.test(trimmed) && !CENTERED_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-transition'; }
            if (state.inDialogue && PARENTHETICAL_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-parenthetical'; }
            if (state.inDialogue) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-dialogue'; }
            if (state.prevLineBlank && TRANSITION_RE.test(trimmed) && trimmed.length > 2) { stream.skipToEnd(); state.prevLineBlank = false; return 'fountain-transition'; }
            if (state.prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1 && !TRANSITION_RE.test(trimmed)) { stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = true; return 'fountain-character'; }
            if (trimmed.startsWith('@')) { stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = true; return 'fountain-character'; }
            stream.skipToEnd(); state.prevLineBlank = false; state.inDialogue = false; return null;
        }
        stream.skipToEnd(); return null;
    },
    blankLine(state) { state.prevLineBlank = true; state.inDialogue = false; },
};
const fountainLanguage = StreamLanguage.define(fountainStreamMode);

// ═══════════════════════════════════════════════════════════════════════════
// Line Decoration Plugin (visual formatting per line type)
// ═══════════════════════════════════════════════════════════════════════════
const LINE_CLS = {
    heading: 'cm-scf-heading', action: 'cm-scf-action', character: 'cm-scf-character',
    dialogue: 'cm-scf-dialogue', parenthetical: 'cm-scf-parenthetical',
    transition: 'cm-scf-transition', titlekey: 'cm-scf-titleKey', titlevalue: 'cm-scf-titleValue',
    section: 'cm-scf-section', synopsis: 'cm-scf-synopsis', centered: 'cm-scf-centered',
    boneyard: 'cm-scf-boneyard',
};

const lineDecorationPlugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) { if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = this.build(update.view); }
    build(view) {
        const decos = [], doc = view.state.doc;
        const cursorLine = doc.lineAt(view.state.selection.main.head).number;
        const st = { prevBlank: true, inDialogue: false, inBoneyard: false, inTitlePage: true };
        for (let i = 1; i <= doc.lines; i++) {
            const type = classifyLine(doc.line(i).text.trim(), st);
            if (i === cursorLine) continue;
            const cls = LINE_CLS[type];
            if (cls) decos.push(Decoration.line({ attributes: { class: cls } }).range(doc.line(i).from));
        }
        return Decoration.set(decos, true);
    }
}, { decorations: v => v.decorations });

// ═══════════════════════════════════════════════════════════════════════════
// Mode System — Tab cycles
// ═══════════════════════════════════════════════════════════════════════════
const MODES = ['description', 'scene', 'character', 'dialogue', 'transition'];
const MODE_LABELS = { description: 'Description', scene: 'Scene Heading', character: 'Character', dialogue: 'Dialogue', transition: 'Transition' };
let currentMode = 'description';

function setMode(mode) {
    currentMode = mode;
    if (editorView) {
        const dom = editorView.dom;
        for (const m of MODES) dom.classList.remove('mode-' + m);
        dom.classList.add('mode-' + mode);
    }
    const el = document.getElementById('status-mode');
    if (el) el.textContent = MODE_LABELS[mode] || 'Description';
}

function handleTab() {
    if (isAutocompleteVisible()) return false;
    const idx = MODES.indexOf(currentMode);
    setMode(MODES[(idx + 1) % MODES.length]);
    return true;
}

function handleShiftTab() {
    if (isAutocompleteVisible()) return false;
    const idx = MODES.indexOf(currentMode);
    setMode(MODES[(idx - 1 + MODES.length) % MODES.length]);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-Uppercase
// ═══════════════════════════════════════════════════════════════════════════
const autoUppercaseHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1 || !/[a-z]/.test(text)) return false;
    if (currentMode === 'scene' || currentMode === 'character' || currentMode === 'transition') {
        view.dispatch({ changes: { from, to, insert: text.toUpperCase() }, selection: { anchor: from + 1 } });
        return true;
    }
    return false;
});

// ═══════════════════════════════════════════════════════════════════════════
// Autocomplete
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
    const hl = acDropdown.querySelector('.highlighted');
    if (hl) hl.scrollIntoView({ block: 'nearest' });
}

function showAutocompleteDropdown(items, type, coords) {
    const dd = getOrCreateDropdown();
    acItems = items; acHighlight = items.length > 0 ? 0 : -1; acType = type;
    dd.innerHTML = '';
    items.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'screenplay-ac-item' + (i === 0 ? ' highlighted' : '');
        const icon = type === 'character' ? '👤' : '📍';
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
    const item = acItems[index];
    const line = editorView.state.doc.lineAt(editorView.state.selection.main.head);

    if (acType === 'character') {
        const newText = item.name; // Already uppercase from API
        editorView.dispatch({
            changes: { from: line.from, to: line.to, insert: newText },
            selection: { anchor: line.from + newText.length }
        });
        // Cache the character_id for this content
        cacheEntityIds('character', newText, { character_id: item.character_id });
    } else if (acType === 'location') {
        const m = line.text.match(/^(\.?(?:INT\.|EXT\.|EST\.|I\/E|INT\.\/EXT\.)\s*)/i);
        const prefix = m ? m[1] : '';
        const newText = prefix + item.name.toUpperCase() + ' - ';
        editorView.dispatch({
            changes: { from: line.from, to: line.to, insert: newText },
            selection: { anchor: line.from + newText.length }
        });
        // Cache the location_id for heading lines containing this location
        cacheEntityIds('location_hint', item.name.toUpperCase(), { location_id: item.location_id });
    }
    hideAutocomplete();
    editorView.focus();
}

function checkAutocompleteContext() {
    if (!editorView) return;
    const sel = editorView.state.selection.main;
    if (!sel.empty) { hideAutocomplete(); return; }
    const trimmed = editorView.state.doc.lineAt(sel.head).text.trim();
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
        // Use v2 endpoints
        const endpoint = type === 'character'
            ? `/api/screenplay-v2/autocomplete-characters?q=${encodeURIComponent(query)}`
            : `/api/screenplay-v2/autocomplete-locations?q=${encodeURIComponent(query)}`;
        try {
            const res = await fetch(endpoint);
            if (!res.ok) return;
            const items = await res.json();
            if (!editorView) return;
            if (!items.length) {
                if (type === 'character' && query.length >= 2) showNewEntityIndicator(query);
                else hideAutocomplete();
                return;
            }
            const coords = editorView.coordsAtPos(editorView.state.selection.main.head);
            if (coords) showAutocompleteDropdown(items, type, coords);
        } catch (e) { /* silent */ }
    }, 200);
}

function showNewEntityIndicator(name) {
    const dd = getOrCreateDropdown();
    acItems = []; acHighlight = -1;
    dd.innerHTML = `<div class="screenplay-ac-new">New character "${esc(name)}" — created on save</div>`;
    const coords = editorView.coordsAtPos(editorView.state.selection.main.head);
    if (coords) {
        dd.style.left = Math.max(0, coords.left) + 'px';
        dd.style.top = (coords.bottom + 4) + 'px';
        dd.classList.remove('hidden');
    }
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
// State
// ═══════════════════════════════════════════════════════════════════════════
let editorView = null;
let unsaved = false, saving = false, savedTimeout = null;
let navScenes = [], navCharacters = [], navLocations = [];
let activeFilter = null;
let loadedTitlePage = [];

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}
function showSyncToast(summary) {
    const parts = [];
    if (summary.scenes_created) parts.push(`${summary.scenes_created} scene${summary.scenes_created > 1 ? 's' : ''}`);
    if (summary.characters_created) parts.push(`${summary.characters_created} char${summary.characters_created > 1 ? 's' : ''}`);
    if (summary.locations_created) parts.push(`${summary.locations_created} loc${summary.locations_created > 1 ? 's' : ''}`);
    if (parts.length) showToast('Synced: ' + parts.join(', '));
    if (summary.errors?.length) summary.errors.forEach(e => showToast('⚠ ' + e));
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ═══════════════════════════════════════════════════════════════════════════
// Load — structured lines → CodeMirror text
// ═══════════════════════════════════════════════════════════════════════════

async function loadScreenplay() {
    if (!editorView) return;
    try {
        const res = await fetch('/api/screenplay-v2/load');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        if (!data.has_content) {
            setSaveStatus('Empty', '');
            return;
        }

        // Store title page for round-tripping
        loadedTitlePage = data.title_page || [];

        // Build entity cache from loaded data
        entityCache.clear();
        for (const line of data.lines) {
            const ids = {};
            if (line.scene_id) ids.scene_id = line.scene_id;
            if (line.character_id) ids.character_id = line.character_id;
            if (line.location_id) ids.location_id = line.location_id;
            if (Object.keys(ids).length > 0) {
                cacheEntityIds(line.line_type, line.content, ids);
            }
        }

        // Build plain text for CodeMirror
        const text = data.lines.map(l => l.content).join('\n');

        editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: text }
        });

        unsaved = false;
        setSaveStatus('Loaded ✓', 'var(--success)');
        savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 2000);

        // Fetch navigator data from DB
        fetchNavigatorData();

    } catch (e) {
        console.error('Load failed:', e);
        setSaveStatus('Load failed', 'var(--warning)');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Save — CodeMirror text → classify → structured lines → API
// ═══════════════════════════════════════════════════════════════════════════

async function saveScreenplay() {
    if (!editorView || saving) return;
    markSaving();
    hideAutocomplete();

    try {
        const text = editorView.state.doc.toString();
        const classified = classifyAllLines(text);

        // Build structured line objects with cached entity IDs
        const lines = classified.map(line => {
            const cached = getCachedIds(line.line_type, line.content);
            return {
                line_type: line.line_type,
                content: line.content,
                scene_id: cached.scene_id || null,
                character_id: cached.character_id || null,
                location_id: cached.location_id || null,
            };
        });

        const payload = {
            title_page: loadedTitlePage,
            lines: lines,
        };

        const res = await fetch('/api/screenplay-v2/save', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Save failed');
        }

        const data = await res.json();
        markSaved();

        if (data.summary) showSyncToast(data.summary);

        // Refresh navigator and entity cache from DB
        fetchNavigatorData();

        // Reload to refresh entity cache with server-assigned IDs
        const reloadRes = await fetch('/api/screenplay-v2/load');
        if (reloadRes.ok) {
            const reloaded = await reloadRes.json();
            entityCache.clear();
            for (const line of reloaded.lines) {
                const ids = {};
                if (line.scene_id) ids.scene_id = line.scene_id;
                if (line.character_id) ids.character_id = line.character_id;
                if (line.location_id) ids.location_id = line.location_id;
                if (Object.keys(ids).length > 0) {
                    cacheEntityIds(line.line_type, line.content, ids);
                }
            }
            loadedTitlePage = reloaded.title_page || [];
        }

    } catch (e) {
        markSaveFailed();
        showToast(`Save error: ${e.message}`);
    }
}

function exportScreenplay() {
    const a = document.createElement('a');
    a.href = '/api/screenplay-v2/export-fountain';
    a.click();
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigator — DB-driven, no live scanning
// ═══════════════════════════════════════════════════════════════════════════

function initNavigatorResize() {
    const panel = document.getElementById('navigator-panel');
    if (!panel) return;
    const KEY = 'scf-panel-navigator-width', MIN = 180, MAX = 500;
    const saved = localStorage.getItem(KEY);
    if (saved) panel.style.width = Math.max(MIN, Math.min(MAX, parseInt(saved, 10))) + 'px';
    const handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    panel.appendChild(handle);
    let startX, startW;
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault(); startX = e.clientX; startW = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');
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
        if (hdr) hdr.addEventListener('click', () => {
            sec.classList.toggle('collapsed');
            const s = loadCollapseState(); s[sec.id] = sec.classList.contains('collapsed'); saveCollapseState(s);
        });
    });
}

async function fetchNavigatorData() {
    try {
        const [sr, cr, lr] = await Promise.all([
            fetch('/api/screenplay-v2/scenes'),
            fetch('/api/screenplay-v2/characters'),
            fetch('/api/screenplay-v2/locations'),
        ]);
        if (sr.ok) navScenes = await sr.json();
        if (cr.ok) navCharacters = await cr.json();
        if (lr.ok) navLocations = await lr.json();
    } catch (e) {
        console.error('Navigator fetch failed:', e);
    }
    renderScenes();
    renderCharacters();
    renderLocations();
}

function renderScenes() {
    const c = document.getElementById('nav-scenes-items'), b = document.getElementById('nav-scenes-count');
    if (!c) return;
    if (!navScenes.length) { c.innerHTML = '<span class="nav-empty-msg">No scenes found</span>'; if (b) b.textContent = ''; return; }
    if (b) b.textContent = navScenes.length;
    const f = document.createDocumentFragment();
    for (const sc of navScenes) {
        const item = document.createElement('div');
        item.className = 'nav-item nav-scene-item';
        item.dataset.lineNumber = sc.line_number;
        item.dataset.sceneNumber = sc.scene_number;
        const charNames = (sc.characters || []).map(ch => ch.name || '');
        item.dataset.characters = charNames.join(',');

        const num = document.createElement('span');
        num.className = 'nav-scene-num';
        num.textContent = `#${sc.scene_number}`;

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        let dn = sc.heading.replace(/^(\.?(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s.]+)/i, '').trim();
        dn = dn.replace(/\s*[-\.]\s*(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|TWILIGHT|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS?\s+LATER|SAME\s+TIME)\s*$/i, '');
        name.textContent = dn || sc.heading;
        name.title = sc.heading;

        item.appendChild(num);
        item.appendChild(name);
        if (sc.character_count > 0) {
            const bg = document.createElement('span');
            bg.className = 'nav-item-badge';
            bg.textContent = sc.character_count;
            item.appendChild(bg);
        }
        if (sc.scene_id) {
            const lk = document.createElement('a');
            lk.className = 'nav-item-link';
            lk.href = `/browse?entity_type=scene&entity_id=${sc.scene_id}`;
            lk.textContent = '→';
            lk.title = 'Open in Entity Browser';
            lk.addEventListener('click', e => e.stopPropagation());
            item.appendChild(lk);
        }
        item.addEventListener('click', () => scrollToLine(sc.line_number));
        f.appendChild(item);
    }
    c.innerHTML = '';
    c.appendChild(f);
    applyFilter();
    updateCurrentScene();
}

function renderCharacters() {
    const c = document.getElementById('nav-characters-items'), b = document.getElementById('nav-characters-count');
    if (!c) return;
    if (!navCharacters.length) { c.innerHTML = '<span class="nav-empty-msg">No characters found</span>'; if (b) b.textContent = ''; return; }
    if (b) b.textContent = navCharacters.length;
    const f = document.createDocumentFragment();
    for (const ch of navCharacters) {
        const item = document.createElement('div');
        item.className = 'nav-item nav-char-item';
        item.dataset.charName = ch.name;
        item.innerHTML = `<span class="nav-item-icon">👤</span><span class="nav-item-name">${esc(ch.display_name)}</span><span class="nav-item-badge">${ch.scene_count}</span>`;
        if (ch.character_id) {
            const lk = document.createElement('a');
            lk.className = 'nav-item-link';
            lk.href = `/browse?entity_type=character&entity_id=${ch.character_id}`;
            lk.textContent = '→';
            lk.title = 'Open in Entity Browser';
            lk.addEventListener('click', e => e.stopPropagation());
            item.appendChild(lk);
        }
        item.addEventListener('click', () => toggleFilter('character', ch.name));
        f.appendChild(item);
    }
    c.innerHTML = '';
    c.appendChild(f);
    applyFilterHighlight();
}

function renderLocations() {
    const c = document.getElementById('nav-locations-items'), b = document.getElementById('nav-locations-count');
    if (!c) return;
    if (!navLocations.length) { c.innerHTML = '<span class="nav-empty-msg">No locations found</span>'; if (b) b.textContent = ''; return; }
    if (b) b.textContent = navLocations.length;
    const f = document.createDocumentFragment();
    for (const loc of navLocations) {
        const item = document.createElement('div');
        item.className = 'nav-item nav-loc-item';
        item.dataset.locName = loc.name.toUpperCase();
        item.innerHTML = `<span class="nav-item-icon">📍</span><span class="nav-item-name">${esc(loc.name)}</span><span class="nav-item-badge">${loc.scene_count}</span>`;
        if (loc.location_id) {
            const lk = document.createElement('a');
            lk.className = 'nav-item-link';
            lk.href = `/browse?entity_type=location&entity_id=${loc.location_id}`;
            lk.textContent = '→';
            lk.title = 'Open in Entity Browser';
            lk.addEventListener('click', e => e.stopPropagation());
            item.appendChild(lk);
        }
        item.addEventListener('click', () => toggleFilter('location', loc.name.toUpperCase()));
        f.appendChild(item);
    }
    c.innerHTML = '';
    c.appendChild(f);
    applyFilterHighlight();
}

function toggleFilter(type, name) {
    activeFilter = (activeFilter && activeFilter.type === type && activeFilter.name === name) ? null : { type, name };
    applyFilter();
    applyFilterHighlight();
}
function applyFilter() {
    const items = document.querySelectorAll('.nav-scene-item');
    const ind = document.getElementById('nav-scenes-filter');
    if (!activeFilter) { items.forEach(i => i.classList.remove('filtered-out')); if (ind) ind.classList.remove('active'); return; }
    if (ind) ind.classList.add('active');
    items.forEach(item => {
        let vis = false;
        if (activeFilter.type === 'character') vis = (item.dataset.characters || '').split(',').includes(activeFilter.name);
        else if (activeFilter.type === 'location') {
            const sc = navScenes.find(s => s.scene_number === parseInt(item.dataset.sceneNumber));
            if (sc) vis = sc.heading.toUpperCase().includes(activeFilter.name);
        }
        item.classList.toggle('filtered-out', !vis);
    });
}
function applyFilterHighlight() {
    document.querySelectorAll('.nav-char-item').forEach(i => i.classList.toggle('active', !!(activeFilter && activeFilter.type === 'character' && i.dataset.charName === activeFilter.name)));
    document.querySelectorAll('.nav-loc-item').forEach(i => i.classList.toggle('active', !!(activeFilter && activeFilter.type === 'location' && i.dataset.locName === activeFilter.name)));
}

function scrollToLine(ln) {
    if (!editorView) return;
    const n = ln + 1;
    if (n < 1 || n > editorView.state.doc.lines) return;
    editorView.dispatch({ selection: { anchor: editorView.state.doc.line(n).from }, scrollIntoView: true });
    editorView.focus();
}

function updateCurrentScene() {
    if (!editorView || !navScenes.length) return;
    const cur0 = editorView.state.doc.lineAt(editorView.state.selection.main.head).number - 1;
    let idx = -1;
    for (let i = navScenes.length - 1; i >= 0; i--) {
        if (cur0 >= navScenes[i].line_number) { idx = i; break; }
    }
    document.querySelectorAll('.nav-scene-item').forEach((el, i) => el.classList.toggle('active', i === idx));
    const se = document.getElementById('status-scene');
    if (se) se.textContent = idx >= 0 ? `Sc ${navScenes[idx].scene_number}/${navScenes.length}` : `Sc —/${navScenes.length}`;
    const charsEl = document.getElementById('status-chars');
    if (charsEl) {
        if (idx < 0 || !navScenes[idx]) { charsEl.textContent = ''; }
        else {
            const chars = (navScenes[idx].characters || []).map(c => c.name || '');
            const tc = s => s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
            charsEl.textContent = !chars.length ? '' :
                chars.length <= 3 ? 'Chars: ' + chars.map(tc).join(', ') :
                'Chars: ' + chars.slice(0, 3).map(tc).join(', ') + `, +${chars.length - 3}`;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Status
// ═══════════════════════════════════════════════════════════════════════════
function updateCursorStatus(state) {
    const line = state.doc.lineAt(state.selection.main.head);
    const le = document.getElementById('status-line'), pe = document.getElementById('status-page');
    if (le) le.textContent = `Ln ${line.number}`;
    if (pe) pe.textContent = `Pg ~${Math.max(1, Math.ceil(line.number / 55))}`;
    updateCurrentScene();
}
function setSaveStatus(text, color) { const el = document.getElementById('status-save'); if (el) { el.textContent = text; el.style.color = color || ''; } }
function markUnsaved() { if (saving) return; unsaved = true; if (savedTimeout) { clearTimeout(savedTimeout); savedTimeout = null; } setSaveStatus('Unsaved •', 'var(--warning)'); }
function markSaved() { unsaved = false; saving = false; setSaveStatus('Saved ✓', 'var(--success)'); if (savedTimeout) clearTimeout(savedTimeout); savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 3000); }
function markSaving() { saving = true; setSaveStatus('Saving…', ''); }
function markSaveFailed() { saving = false; setSaveStatus('Save failed', 'var(--warning)'); }

// ═══════════════════════════════════════════════════════════════════════════
// CodeMirror Editor
// ═══════════════════════════════════════════════════════════════════════════

function createEditor(container) {
    return new EditorView({
        state: EditorState.create({
            doc: '',
            extensions: [
                fountainLanguage, history(), drawSelection(), EditorView.lineWrapping,
                placeholder('Start writing your screenplay…'),
                lineDecorationPlugin,
                autoUppercaseHandler,
                autocompleteKeymap,
                keymap.of([
                    { key: 'Tab', run: handleTab },
                    { key: 'Shift-Tab', run: handleShiftTab },
                ]),
                keymap.of([
                    { key: 'Mod-s', run() { saveScreenplay(); return true; } },
                    ...defaultKeymap, ...historyKeymap,
                ]),
                EditorView.updateListener.of((update) => {
                    if (update.selectionSet || update.docChanged) updateCursorStatus(update.state);
                    if (update.docChanged) { markUnsaved(); checkAutocompleteContext(); }
                    else if (update.selectionSet) { checkAutocompleteContext(); }
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
        }),
        parent: container,
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════════════

const container = document.getElementById('screenplay-panel');
if (container) {
    editorView = createEditor(container);
    initNavigatorResize();
    initCollapseHandlers();
    loadScreenplay();
    document.getElementById('btn-save-screenplay')?.addEventListener('click', saveScreenplay);
    document.getElementById('btn-export-screenplay')?.addEventListener('click', exportScreenplay);
    window.addEventListener('beforeunload', (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });
    setMode('description');
}

export { editorView, saveScreenplay, exportScreenplay };
