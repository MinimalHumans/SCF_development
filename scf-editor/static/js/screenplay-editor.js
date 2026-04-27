/**
 * SCF Screenplay Editor v3
 * ==========================================
 *
 * MODEL
 * -----
 * The editor's document contains ONLY real content lines. No blanks.
 * Visual spacing between blocks is provided entirely by CSS gap classes
 * applied via line decorations.
 *
 * Each line has a stored type held in a `StateField`. Types are STICKY:
 * they only change when the user does something explicit (Tab, Enter,
 * Backspace/Delete merge, autocomplete, server load). Typing characters
 * does NOT reclassify. There is no Fountain runtime classifier; the
 * `classifyAllLines` helper is only used as a fallback for legacy data.
 *
 * Position mapping uses assoc=-1 so old line starts still map to new
 * line starts even when a character is typed at line start. This was
 * the bug in v2: with assoc=1, typing the first character of a line
 * caused the type to revert to a fresh classification.
 *
 * LOAD/SAVE
 * ---------
 * Load: any blank-empty line in the server response is dropped. The
 *       remaining lines + their types go straight into the editor.
 * Save: the editor's content is sent as-is. Empty lines (which shouldn't
 *       exist post-load, but we coerce defensively) are typed 'blank'.
 *       The client sends NO blank-content lines beyond that.
 *
 * If the server injects structural blanks during save processing, they
 * get filtered out on the next load. The client never propagates them
 * back into editor state.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Imports
// ═══════════════════════════════════════════════════════════════════════════
const CM_STATE_DEP = '@codemirror/state@6.5.2';
const { EditorState, StateEffect, StateField } = await import(`https://esm.sh/@codemirror/state@6.5.2`);
const { EditorView, keymap, placeholder, drawSelection, highlightActiveLine, Decoration, ViewPlugin } =
    await import(`https://esm.sh/@codemirror/view@6.36.5?deps=${CM_STATE_DEP}`);
const { defaultKeymap, history, historyKeymap } =
    await import(`https://esm.sh/@codemirror/commands@6.8.0?deps=${CM_STATE_DEP}`);

console.log('[SCF-v3] Modules loaded');

// ═══════════════════════════════════════════════════════════════════════════
// Patterns (used only by classifyAllLines fallback)
// ═══════════════════════════════════════════════════════════════════════════
const HEADING_RE = /^(\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s./])/i;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 ._\-']+(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D?|O\.?C\.?)\))?$/;
const TRANSITION_RE = /^[A-Z\s]+(?:TO|IN|OUT|UP):?\s*$/;
const PARENTHETICAL_RE = /^\s*\(.*\)\s*$/;

const LINES_PER_PAGE = 55;

// ═══════════════════════════════════════════════════════════════════════════
// Classifier (fallback only — used when server returns content w/o types)
// ═══════════════════════════════════════════════════════════════════════════
function classifyLine(trimmed, st) {
    if (trimmed === '') { st.prevBlank = true; st.inDialogue = false; return 'blank'; }
    if (HEADING_RE.test(trimmed)) { st.prevBlank = false; st.inDialogue = false; return 'heading'; }
    if (st.inDialogue && PARENTHETICAL_RE.test(trimmed)) { st.prevBlank = false; return 'parenthetical'; }
    if (st.inDialogue) { st.prevBlank = false; return 'dialogue'; }
    if (st.prevBlank && TRANSITION_RE.test(trimmed) && trimmed.length > 2) { st.prevBlank = false; return 'transition'; }
    if (st.prevBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1) {
        st.prevBlank = false; st.inDialogue = true; return 'character';
    }
    st.prevBlank = false; st.inDialogue = false; return 'action';
}
function classifyAllLines(doc) {
    const st = { prevBlank: true, inDialogue: false };
    const out = new Array(doc.lines);
    for (let i = 1; i <= doc.lines; i++) out[i - 1] = classifyLine(doc.line(i).text.trim(), st);
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Entity Cache
// ═══════════════════════════════════════════════════════════════════════════
const entityCache = new Map();
const cacheKey = (lineType, content) => `${lineType}:${content.trim()}`;
function cacheEntityIds(lineType, content, ids) {
    const k = cacheKey(lineType, content);
    entityCache.set(k, { ...(entityCache.get(k) || {}), ...ids });
}
const getCachedIds = (lineType, content) => entityCache.get(cacheKey(lineType, content)) || {};

// ═══════════════════════════════════════════════════════════════════════════
// StateField — sticky line types
// ═══════════════════════════════════════════════════════════════════════════
const setLineTypeAtPosEffect = StateEffect.define();
const setAllLineTypesEffect = StateEffect.define();

const lineTypesField = StateField.define({
    create(state) {
        return new Array(state.doc.lines).fill('action');
    },
    update(oldTypes, tr) {
        // (1) Authoritative bulk replacement (load) — bypass mapping.
        for (const e of tr.effects) {
            if (e.is(setAllLineTypesEffect)) {
                const incoming = e.value || [];
                const out = new Array(tr.state.doc.lines);
                for (let i = 0; i < out.length; i++) out[i] = incoming[i] || 'action';
                return out;
            }
        }

        // (2) Map types through doc changes using text-match scoring.
        // Unmapped new lines (e.g. from paste) get classifier types.
        let types;
        if (tr.docChanged) {
            const oldDoc = tr.startState.doc;
            const newDoc = tr.state.doc;
            const newLineCount = newDoc.lines;

            // For each new line, find the best-scoring old line whose `from`
            // mapped to this new line's start. Text match wins over position
            // collision — e.g. when a multi-line range is deleted, all the
            // deleted-range old lines map to the same new position; scoring
            // by text content picks the one that actually survived.
            const bestMatch = new Array(newLineCount).fill(null);

            for (let oldNum = 1; oldNum <= oldDoc.lines; oldNum++) {
                const oldFrom = oldDoc.line(oldNum).from;
                let newFrom;
                try {
                    // assoc=-1: typing at line start keeps that position
                    // mapped to the same line start.
                    newFrom = tr.changes.mapPos(oldFrom, -1);
                } catch { continue; }
                if (newFrom == null || newFrom < 0 || newFrom > newDoc.length) continue;
                const newLine = newDoc.lineAt(newFrom);
                if (newLine.from !== newFrom) continue;

                const idx = newLine.number - 1;
                const oldText = oldDoc.line(oldNum).text;
                const newText = newLine.text;
                const oldType = oldTypes[oldNum - 1];

                // Score:
                //   4 = exact text match (line shifted but content identical)
                //   3 = trimmed match (whitespace edits)
                //   2 = old line had a special type and both have content
                //       (catches typing edits on character/heading/etc lines)
                //   1 = both have content but text differs
                //   0 = blank ↔ blank or other
                let score;
                if (oldText === newText) score = 4;
                else if (oldText.trim() === newText.trim()) score = 3;
                else if (oldType && oldType !== 'action' && oldType !== 'blank'
                         && oldText.trim() !== '' && newText.trim() !== '') score = 2;
                else if (oldText.trim() !== '' && newText.trim() !== '') score = 1;
                else score = 0;

                if (!bestMatch[idx] || score > bestMatch[idx].score) {
                    bestMatch[idx] = { oldNum, score };
                }
            }

            // Detect "structural" changes (unmapped new lines = paste, complex
            // multi-line replacements). For those, classifier fills the gaps.
            let needsClassifier = false;
            for (let i = 0; i < newLineCount; i++) {
                if (!bestMatch[i]) { needsClassifier = true; break; }
            }
            const classified = needsClassifier ? classifyAllLines(newDoc) : null;

            types = new Array(newLineCount);
            for (let i = 0; i < newLineCount; i++) {
                if (bestMatch[i]) {
                    const oldType = oldTypes[bestMatch[i].oldNum - 1];
                    types[i] = oldType || 'action';
                } else if (classified) {
                    types[i] = classified[i] || 'action';
                } else {
                    types[i] = 'action';
                }
            }
        } else {
            // Length defensive: stay in sync with doc even if oldTypes drifted.
            types = oldTypes.length === tr.state.doc.lines
                ? oldTypes
                : new Array(tr.state.doc.lines).fill('action');
        }

        // (3) Per-line effects (override mapping).
        let mutated = types !== oldTypes;
        for (const e of tr.effects) {
            if (!e.is(setLineTypeAtPosEffect)) continue;
            const { pos, type } = e.value || {};
            if (pos == null || pos < 0 || pos > tr.state.doc.length) continue;
            const idx = tr.state.doc.lineAt(pos).number - 1;
            if (idx < 0 || idx >= types.length) continue;
            if (!mutated) { types = [...types]; mutated = true; }
            types[idx] = type || 'action';
        }

        return types;
    },
});

const getLineTypes = (state) => state.field(lineTypesField);
const getLineType = (state, lineNum) => state.field(lineTypesField)[lineNum - 1] || 'action';

// ═══════════════════════════════════════════════════════════════════════════
// Modes
// ═══════════════════════════════════════════════════════════════════════════
const MODES = ['description', 'scene', 'character', 'dialogue', 'transition'];
const MODE_LABELS = {
    description: 'Description', scene: 'Scene Heading', character: 'Character',
    dialogue: 'Dialogue', transition: 'Transition',
};
let currentMode = 'description';

const modeToLineType = (m) => ({
    description: 'action', scene: 'heading', character: 'character',
    dialogue: 'dialogue', transition: 'transition',
}[m] || 'action');

const lineTypeToMode = (t) => ({
    heading: 'scene', character: 'character', dialogue: 'dialogue',
    parenthetical: 'dialogue', transition: 'transition', action: 'description',
    blank: null,
}[t] || 'description');

function setModeUI(mode) {
    if (!mode) return;
    currentMode = mode;
    if (editorView) {
        const dom = editorView.dom;
        for (const m of MODES) dom.classList.remove('mode-' + m);
        dom.classList.add('mode-' + mode);
    }
    const el = document.getElementById('status-mode');
    if (el) el.textContent = MODE_LABELS[mode] || 'Description';
}

function setMode(mode, view) {
    setModeUI(mode);
    if (!view) return;
    const sel = view.state.selection.main;
    const lineType = modeToLineType(mode);
    // If the selection spans multiple lines, set every line's type. Otherwise
    // just the cursor's line. Multi-line is useful for fixing pasted blocks.
    const startLineNum = view.state.doc.lineAt(sel.from).number;
    const endLineNum = view.state.doc.lineAt(sel.to).number;
    const effects = [];
    for (let i = startLineNum; i <= endLineNum; i++) {
        effects.push(setLineTypeAtPosEffect.of({
            pos: view.state.doc.line(i).from,
            type: lineType,
        }));
    }
    view.dispatch({ effects });
}

function handleTab(view) {
    if (isAutocompleteVisible()) return false;
    const idx = MODES.indexOf(currentMode);
    setMode(MODES[(idx + 1) % MODES.length], view);
    return true;
}
function handleShiftTab(view) {
    if (isAutocompleteVisible()) return false;
    const idx = MODES.indexOf(currentMode);
    setMode(MODES[(idx - 1 + MODES.length) % MODES.length], view);
    return true;
}

function detectModeFromCursor(state) {
    const line = state.doc.lineAt(state.selection.main.head);
    // For empty lines, leave mode alone; the user's intent is whatever
    // mode they're already in.
    if (line.text === '') return;
    const stored = getLineType(state, line.number);
    const mode = lineTypeToMode(stored);
    if (mode && mode !== currentMode) setModeUI(mode);
}

// ═══════════════════════════════════════════════════════════════════════════
// Input Handler — uppercase + first-char-on-blank type stamping
// ═══════════════════════════════════════════════════════════════════════════
const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1) return false;

    const lineNum = view.state.doc.lineAt(from).number;
    const line = view.state.doc.line(lineNum);
    const lineEmpty = line.text.length === 0;

    // On empty lines, the user's intent is the current mode.
    // On non-empty lines, the type is sticky (whatever's already stored).
    const effectiveType = lineEmpty
        ? modeToLineType(currentMode)
        : getLineType(view.state, lineNum);

    const wantsUpper = effectiveType === 'heading'
                    || effectiveType === 'character'
                    || effectiveType === 'transition';
    const isLowerLetter = /[a-z]/.test(text);
    const insertText = (wantsUpper && isLowerLetter) ? text.toUpperCase() : text;

    // If we don't need to override (no uppercase needed AND line not
    // empty), let CodeMirror handle the input. The state field will
    // preserve the line's type via assoc=-1 mapping.
    if (insertText === text && !lineEmpty) return false;

    const dispatch = {
        changes: { from, to, insert: insertText },
        selection: { anchor: from + insertText.length },
        scrollIntoView: true,
    };
    if (lineEmpty) {
        dispatch.effects = setLineTypeAtPosEffect.of({ pos: from, type: effectiveType });
    }
    view.dispatch(dispatch);
    return true;
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
        const icon = { character: '👤', location: '📍', prefix: '🎬', tod: '🕐' }[type] || '📍';
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

    let newText, type, ids = null, idCacheKey = null;
    if (acType === 'character') {
        newText = item.name;
        type = 'character';
        ids = { character_id: item.character_id };
        idCacheKey = newText;
    } else if (acType === 'location') {
        const m = line.text.match(/^(\.?(?:INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s*)/i);
        const prefix = m ? m[1] : '';
        newText = prefix + item.name.toUpperCase() + ' - ';
        type = 'heading';
        ids = { location_id: item.location_id };
        idCacheKey = item.name.toUpperCase();
    } else if (acType === 'prefix') {
        newText = item.value; type = 'heading';
    } else if (acType === 'tod') {
        const dashMatch = line.text.match(/^(.+\s-\s*)/);
        const beforeTod = dashMatch ? dashMatch[1] : line.text;
        newText = beforeTod + item.value;
        type = 'heading';
    } else { hideAutocomplete(); return; }

    editorView.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        selection: { anchor: line.from + newText.length },
        effects: setLineTypeAtPosEffect.of({ pos: line.from, type }),
    });
    if (ids && idCacheKey) cacheEntityIds(type === 'character' ? 'character' : 'location_hint', idCacheKey, ids);
    setModeUI(lineTypeToMode(type));
    hideAutocomplete();
    editorView.focus();
}

const HEADING_PREFIXES = [
    { name: 'INT.', value: 'INT. ' },
    { name: 'EXT.', value: 'EXT. ' },
    { name: 'INT./EXT.', value: 'INT./EXT. ' },
];

const TIME_OF_DAY_OPTIONS = [
    { name: 'DAY', value: 'DAY' }, { name: 'NIGHT', value: 'NIGHT' },
    { name: 'MORNING', value: 'MORNING' }, { name: 'AFTERNOON', value: 'AFTERNOON' },
    { name: 'EVENING', value: 'EVENING' }, { name: 'DAWN', value: 'DAWN' },
    { name: 'DUSK', value: 'DUSK' }, { name: 'SUNSET', value: 'SUNSET' },
    { name: 'SUNRISE', value: 'SUNRISE' }, { name: 'TWILIGHT', value: 'TWILIGHT' },
    { name: 'MIDDAY', value: 'MIDDAY' }, { name: 'CONTINUOUS', value: 'CONTINUOUS' },
    { name: 'LATER', value: 'LATER' }, { name: 'MOMENTS LATER', value: 'MOMENTS LATER' },
    { name: 'SAME TIME', value: 'SAME TIME' },
];

const HEADING_READY_FOR_TOD_RE = /^\.?(?:INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s+.+\s-\s*/i;
const HEADING_HAS_PREFIX_RE = /^\.?(?:INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s+/i;

function checkAutocompleteContext() {
    if (!editorView) return;
    const sel = editorView.state.selection.main;
    if (!sel.empty) { hideAutocomplete(); return; }
    const lineText = editorView.state.doc.lineAt(sel.head).text;
    const trimmed = lineText.trim();

    if (currentMode === 'character') {
        if (!trimmed || trimmed.length < 2) { hideAutocomplete(); return; }
        const query = trimmed.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        if (query.length >= 2) { triggerAutocomplete('character', query); return; }
    }

    if (currentMode === 'scene') {
        const upper = trimmed.toUpperCase();
        if (HEADING_READY_FOR_TOD_RE.test(trimmed)) {
            const dashIdx = trimmed.lastIndexOf(' - ');
            const afterDash = dashIdx >= 0 ? trimmed.slice(dashIdx + 3).toUpperCase() : '';
            const filtered = afterDash
                ? TIME_OF_DAY_OPTIONS.filter(o => o.name.startsWith(afterDash))
                : TIME_OF_DAY_OPTIONS;
            if (filtered.length > 0) { showStaticAutocomplete(filtered, 'tod'); return; }
            hideAutocomplete(); return;
        }
        if (HEADING_HAS_PREFIX_RE.test(trimmed)) {
            const m = trimmed.match(/^(\.?(?:INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s+)(.+)/i);
            if (m && m[2].trim().length >= 1) { triggerAutocomplete('location', m[2].replace(/\s*-\s*$/, '').trim()); return; }
            hideAutocomplete(); return;
        }
        if (trimmed.length === 0) { showStaticAutocomplete(HEADING_PREFIXES, 'prefix'); return; }
        const prefixMatches = HEADING_PREFIXES.filter(p => p.value.toUpperCase().startsWith(upper) || p.name.startsWith(upper));
        if (prefixMatches.length > 0 && trimmed.length < 10) { showStaticAutocomplete(prefixMatches, 'prefix'); return; }
    }
    hideAutocomplete();
}

function showStaticAutocomplete(items, type) {
    if (!editorView) return;
    if (acType === type && isAutocompleteVisible() && acItems.length === items.length) return;
    const coords = editorView.coordsAtPos(editorView.state.selection.main.head);
    if (coords) showAutocompleteDropdown(items, type, coords);
}

function triggerAutocomplete(type, query) {
    if (query === acQuery && type === acType && isAutocompleteVisible()) return;
    acQuery = query;
    if (acDebounce) clearTimeout(acDebounce);
    acDebounce = setTimeout(async () => {
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
// Clipboard — preserve line types on copy/cut/paste within the editor
// ═══════════════════════════════════════════════════════════════════════════
//
// Line types live in the StateField, not in the document text, so a default
// copy/paste loses formatting. We attach a JSON sidecar (custom MIME type) on
// copy. On paste, if our sidecar is present, we restore types directly. If
// not (paste from external app), CM's default insertion runs and the
// StateField update's classifier fallback handles the new lines.
//
// Mid-line paste rule: the first and/or last pasted segment merges with
// surrounding existing content. Those merged-edge lines keep their original
// type — applying a copied type to "OriginalText" + "PastedSegment" merged
// together would be visually wrong.

const SCF_TYPES_MIME = 'application/x-scf-line-types';

function copyOrCut(view, event, isCut) {
    const sel = view.state.selection;
    if (sel.ranges.length > 1) return false;  // multi-range: let CM default handle
    const range = sel.main;
    if (range.empty) return false;

    const text = view.state.doc.sliceString(range.from, range.to);
    const fromLineNum = view.state.doc.lineAt(range.from).number;
    const toLineNum = view.state.doc.lineAt(range.to).number;
    const types = [];
    for (let ln = fromLineNum; ln <= toLineNum; ln++) {
        types.push(getLineType(view.state, ln));
    }

    if (!event.clipboardData) return false;
    event.clipboardData.setData('text/plain', text);
    try {
        event.clipboardData.setData(SCF_TYPES_MIME, JSON.stringify(types));
    } catch { /* some browsers reject custom MIME — text/plain is enough */ }

    event.preventDefault();

    if (isCut) {
        view.dispatch({
            changes: { from: range.from, to: range.to, insert: '' },
            selection: { anchor: range.from },
            scrollIntoView: true,
        });
    }
    return true;
}

function handlePaste(view, event) {
    const cb = event.clipboardData;
    if (!cb) return false;

    const typesJson = cb.getData(SCF_TYPES_MIME);
    const rawText = cb.getData('text/plain');
    if (!typesJson || !rawText) return false;  // external paste — let default handle

    let typeArr;
    try {
        typeArr = JSON.parse(typesJson);
        if (!Array.isArray(typeArr)) return false;
    } catch { return false; }

    // Normalize line endings; CM's doc uses \n internally.
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const pastedLines = text.split('\n');
    const N = pastedLines.length;

    // Defensive: if counts don't match, abort to default. The classifier
    // fallback in the StateField update will type the new lines best-effort.
    if (typeArr.length !== N) return false;

    const sel = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(sel.from);
    const toLine = view.state.doc.lineAt(sel.to);
    const atLineStart = sel.from === fromLine.from;
    const atLineEnd = sel.to === toLine.to;

    // Compute post-paste line start positions in the NEW doc.
    // The first new line begins at fromLine.from (unchanged prefix). Each
    // subsequent line begins after its predecessor's content + a newline.
    const linePositions = [fromLine.from];
    let pos = fromLine.from;
    for (let k = 0; k < N - 1; k++) {
        const lineLen = (k === 0)
            ? (sel.from - fromLine.from) + pastedLines[0].length
            : pastedLines[k].length;
        pos += lineLen + 1;  // +1 for newline
        linePositions.push(pos);
    }

    // Apply types, skipping merged-edge lines (they keep their existing type).
    const effects = [];
    for (let k = 0; k < N; k++) {
        const isFirstMerged = (k === 0) && !atLineStart;
        const isLastMerged = (k === N - 1) && !atLineEnd;
        if (isFirstMerged || isLastMerged) continue;
        effects.push(setLineTypeAtPosEffect.of({
            pos: linePositions[k],
            type: typeArr[k] || 'action',
        }));
    }

    view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        effects,
        selection: { anchor: sel.from + text.length },
        scrollIntoView: true,
    });
    event.preventDefault();
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Decorations — line classes + structural gaps + page breaks
// ═══════════════════════════════════════════════════════════════════════════
const LINE_CLS = {
    heading: 'cm-scf-heading', action: 'cm-scf-action', character: 'cm-scf-character',
    dialogue: 'cm-scf-dialogue', parenthetical: 'cm-scf-parenthetical',
    transition: 'cm-scf-transition',
};

function getGapClass(currType, prevType) {
    if (!prevType) return null;
    if (currType === 'heading') return 'cm-scf-gap-scene';
    if (currType === 'character' && prevType !== 'blank') return 'cm-scf-gap-block';
    if (currType === 'transition') return 'cm-scf-gap-element';
    if (currType === 'action' && (prevType === 'dialogue' || prevType === 'parenthetical' || prevType === 'transition')) return 'cm-scf-gap-element';
    return null;
}

const lineDecorationPlugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) {
        const fieldChanged = update.startState.field(lineTypesField, false)
                          !== update.state.field(lineTypesField, false);
        if (update.docChanged || update.viewportChanged || update.selectionSet || fieldChanged) {
            this.decorations = this.build(update.view);
        }
    }
    build(view) {
        const decos = [];
        const doc = view.state.doc;
        const types = view.state.field(lineTypesField);
        const cursorLine = doc.lineAt(view.state.selection.main.head).number;

        // Effective type per line: if line text is empty, treat as 'blank'
        // for visual purposes (no class, no gap implications).
        const eff = new Array(doc.lines);
        for (let i = 1; i <= doc.lines; i++) {
            eff[i - 1] = doc.line(i).text === '' ? 'blank' : (types[i - 1] || 'action');
        }

        for (let i = 1; i <= doc.lines; i++) {
            const classes = [];
            const effType = eff[i - 1];
            if (i !== cursorLine) {
                const cls = LINE_CLS[effType];
                if (cls) classes.push(cls);
            }
            const prevEff = i > 1 ? eff[i - 2] : null;
            const gapCls = getGapClass(effType, prevEff);
            if (gapCls) classes.push(gapCls);
            if (i % LINES_PER_PAGE === 0 && i < doc.lines) {
                classes.push('cm-scf-pagebreak');
                decos.push(Decoration.line({ attributes: { class: classes.join(' '), 'data-page': String(i / LINES_PER_PAGE) } }).range(doc.line(i).from));
                continue;
            }
            if (classes.length > 0) {
                decos.push(Decoration.line({ attributes: { class: classes.join(' ') } }).range(doc.line(i).from));
            }
        }
        return Decoration.set(decos, true);
    }
}, { decorations: v => v.decorations });

// ═══════════════════════════════════════════════════════════════════════════
// Prop Tags
// ═══════════════════════════════════════════════════════════════════════════
const propTagsChanged = StateEffect.define();
let propTags = [];
let propPopoverEl = null;

async function fetchPropTags() {
    try {
        const res = await fetch('/api/screenplay-v2/prop-tags');
        if (!res.ok) return;
        propTags = await res.json();
        if (editorView) editorView.dispatch({ effects: propTagsChanged.of(null) });
    } catch (e) { console.error('Prop tags fetch failed:', e); }
}

const propHighlightPlugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) {
        const effectFired = update.transactions.some(t => t.effects.some(e => e.is(propTagsChanged)));
        if (update.docChanged || update.viewportChanged || effectFired) {
            this.decorations = this.build(update.view);
        }
    }
    build(view) {
        if (!propTags.length) return Decoration.none;
        const sorted = [...propTags].sort((a, b) => b.tagged_text.length - a.tagged_text.length);
        const escaped = sorted.map(t => t.tagged_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (!escaped.length) return Decoration.none;
        const re = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
        const decos = [];
        for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);
            let m;
            while ((m = re.exec(text)) !== null) {
                const start = from + m.index;
                const end = start + m[0].length;
                decos.push(Decoration.mark({ class: 'cm-prop-highlight' }).range(start, end));
            }
        }
        return Decoration.set(decos, true);
    }
}, { decorations: v => v.decorations });

function getOrCreatePropPopover() {
    if (!propPopoverEl) {
        propPopoverEl = document.createElement('div');
        propPopoverEl.className = 'prop-tag-popover hidden';
        document.body.appendChild(propPopoverEl);
        document.addEventListener('click', (e) => {
            if (propPopoverEl && !propPopoverEl.contains(e.target)) hidePropPopover();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && propPopoverEl && !propPopoverEl.classList.contains('hidden')) {
                hidePropPopover(); e.stopPropagation();
            }
        });
    }
    return propPopoverEl;
}
function hidePropPopover() {
    if (propPopoverEl) { propPopoverEl.classList.add('hidden'); propPopoverEl.innerHTML = ''; }
}
async function showPropPopover() {
    if (!editorView) return;
    const sel = editorView.state.selection.main;
    if (sel.empty) { showToast('Select text to tag as a prop'); return; }
    const selectedText = editorView.state.doc.sliceString(sel.from, sel.to).trim();
    if (!selectedText || selectedText.includes('\n')) { showToast('Select a single word or phrase'); return; }
    const coords = editorView.coordsAtPos(sel.from);
    if (!coords) return;
    const popover = getOrCreatePropPopover();
    const existingTag = propTags.find(t => t.tagged_text.toLowerCase() === selectedText.toLowerCase());
    let html = `<div class="prop-tag-popover-header"><span>Tag prop:</span><span class="prop-tag-text">${esc(selectedText)}</span></div>`;
    if (existingTag) {
        html += `<div class="screenplay-ac-item" style="color: var(--text-secondary); cursor: default;"><span class="screenplay-ac-icon">🔧</span><span class="screenplay-ac-name">Tagged as: ${esc(existingTag.prop_name)}</span></div>`;
        html += `<div class="prop-tag-remove" data-tag-id="${existingTag.tag_id}"><span>✕</span> Remove tag</div>`;
    } else {
        try {
            const res = await fetch(`/api/screenplay-v2/autocomplete-props?q=${encodeURIComponent(selectedText)}`);
            if (res.ok) {
                const props = await res.json();
                for (const p of props) html += `<div class="screenplay-ac-item" data-prop-id="${p.prop_id}"><span class="screenplay-ac-icon">🔧</span><span class="screenplay-ac-name">${esc(p.name)}</span></div>`;
            }
        } catch (e) { /* silent */ }
        const titleCased = selectedText.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        html += `<div class="screenplay-ac-new" data-create-name="${esc(titleCased)}">+ Create "${esc(titleCased)}" as new prop</div>`;
    }
    popover.innerHTML = html;
    popover.style.left = Math.max(8, coords.left) + 'px';
    popover.style.top = (coords.bottom + 6) + 'px';
    popover.classList.remove('hidden');
    popover.querySelectorAll('.screenplay-ac-item[data-prop-id]').forEach(item => {
        item.addEventListener('click', (e) => { e.stopPropagation(); tagProp(selectedText, parseInt(item.dataset.propId)); });
    });
    popover.querySelectorAll('.screenplay-ac-new[data-create-name]').forEach(item => {
        item.addEventListener('click', (e) => { e.stopPropagation(); tagPropNew(selectedText, item.dataset.createName); });
    });
    popover.querySelectorAll('.prop-tag-remove[data-tag-id]').forEach(item => {
        item.addEventListener('click', (e) => { e.stopPropagation(); untagProp(parseInt(item.dataset.tagId)); });
    });
}
async function tagProp(taggedText, propId) {
    try {
        const res = await fetch('/api/screenplay-v2/tag-prop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagged_text: taggedText, prop_id: propId }) });
        if (!res.ok) throw new Error('Tag failed');
        const data = await res.json();
        if (data.duplicate) showToast('Already tagged'); else { showToast(`Tagged "${taggedText}" → ${data.prop_name}`); await fetchPropTags(); }
    } catch (e) { showToast('Tag error: ' + e.message); }
    hidePropPopover(); editorView?.focus();
}
async function tagPropNew(taggedText, newName) {
    try {
        const res = await fetch('/api/screenplay-v2/tag-prop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagged_text: taggedText, new_name: newName }) });
        if (!res.ok) throw new Error('Tag failed');
        const data = await res.json();
        showToast(`Created prop "${data.prop_name}" and tagged`); await fetchPropTags();
    } catch (e) { showToast('Tag error: ' + e.message); }
    hidePropPopover(); editorView?.focus();
}
async function untagProp(tagId) {
    try {
        const res = await fetch(`/api/screenplay-v2/tag-prop/${tagId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Untag failed');
        showToast('Prop tag removed'); await fetchPropTags();
    } catch (e) { showToast('Untag error: ' + e.message); }
    hidePropPopover(); editorView?.focus();
}

// ═══════════════════════════════════════════════════════════════════════════
// Module State & Helpers
// ═══════════════════════════════════════════════════════════════════════════
let editorView = null;
let unsaved = false, saving = false, savedTimeout = null;
let navScenes = [], navCharacters = [], navLocations = [];
let activeFilter = null;
let loadedTitlePage = [];
let lastEnterTime = 0;
// Set to true around programmatic dispatches that change the doc but
// shouldn't be treated as user edits (load, save reload). The
// updateListener checks this before calling markUnsaved.
let suppressUnsaved = false;

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
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
// Load / Save
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Drop any line whose content is empty. Whatever the server sent — legacy
 * structural blanks, synthesized blanks during save processing, anything —
 * gets filtered. The editor's doc only contains real content lines.
 */
function filterEmptyLines(lines) {
    return lines.filter(l => (l.content || '').trim() !== '');
}

function applyLoadedData(data, preserveCursorPos = null) {
    entityCache.clear();
    for (const line of data.lines || []) {
        const ids = {};
        if (line.scene_id) ids.scene_id = line.scene_id;
        if (line.character_id) ids.character_id = line.character_id;
        if (line.location_id) ids.location_id = line.location_id;
        if (Object.keys(ids).length > 0) cacheEntityIds(line.line_type, line.content, ids);
    }
    loadedTitlePage = data.title_page || [];

    const contentLines = filterEmptyLines(data.lines || []);

    // If the server returned content but no types, fall back to classifier.
    const hasMissingTypes = contentLines.some(l => !l.line_type || l.line_type === 'blank');
    let types;
    if (hasMissingTypes && contentLines.length > 0) {
        console.warn('[SCF-v3] Server returned content with missing/blank types; running fallback classifier.');
        const tempDoc = { lines: contentLines.length, line: (n) => ({ text: contentLines[n - 1].content }) };
        const classified = classifyAllLines(tempDoc);
        types = contentLines.map((l, i) => (l.line_type && l.line_type !== 'blank') ? l.line_type : classified[i]);
    } else {
        types = contentLines.map(l => l.line_type || 'action');
    }

    const text = contentLines.map(l => l.content).join('\n');
    // CodeMirror's empty doc has 1 line. Keep types in sync.
    if (text === '') types = ['action'];

    // Length safety: doc.split('\n').length must equal types.length.
    const expectedLines = text === '' ? 1 : text.split('\n').length;
    if (types.length !== expectedLines) {
        console.warn(`[SCF-v3] applyLoadedData: types.length=${types.length} but doc will have ${expectedLines} lines. Padding/truncating.`);
        if (types.length < expectedLines) {
            types = [...types, ...new Array(expectedLines - types.length).fill('action')];
        } else {
            types = types.slice(0, expectedLines);
        }
    }

    if (!editorView) return;
    const anchor = preserveCursorPos != null
        ? Math.max(0, Math.min(preserveCursorPos, text.length))
        : 0;

    // Suppress markUnsaved for this programmatic dispatch — it's a load,
    // not a user edit.
    suppressUnsaved = true;
    try {
        editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: text },
            effects: setAllLineTypesEffect.of(types),
            selection: { anchor },
        });
    } finally {
        suppressUnsaved = false;
    }

    // Sync mode to the cursor's actual line. If cursor is on an empty line,
    // detectModeFromCursor leaves currentMode alone — so fall back to the
    // first non-blank line's type as a reasonable default.
    detectModeFromCursor(editorView.state);
    const cursorLine = editorView.state.doc.lineAt(editorView.state.selection.main.head);
    if (cursorLine.text === '') {
        for (const t of types) {
            if (t && t !== 'blank') {
                const m = lineTypeToMode(t);
                if (m) { setModeUI(m); break; }
            }
        }
    }
}

async function loadScreenplay() {
    if (!editorView) return;
    try {
        const res = await fetch('/api/screenplay-v2/load');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (!data.has_content) { setSaveStatus('Empty', ''); return; }
        applyLoadedData(data);
        unsaved = false;
        setSaveStatus('Loaded ✓', 'var(--success)');
        savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 2000);
        fetchNavigatorData();
        fetchPropTags();
    } catch (e) {
        console.error('Load failed:', e);
        setSaveStatus('Load failed', 'var(--warning)');
    }
}

async function saveScreenplay() {
    if (!editorView || saving) return;
    markSaving();
    hideAutocomplete();
    hidePropPopover();

    try {
        const doc = editorView.state.doc;
        const types = getLineTypes(editorView.state);

        if (types.length !== doc.lines) {
            console.warn(`[SCF-v3] saveScreenplay: types.length=${types.length} doc.lines=${doc.lines}`);
        }

        const lines = [];
        for (let i = 0; i < doc.lines; i++) {
            const content = doc.line(i + 1).text.trim();
            // Defensive: empty lines (which shouldn't be in the editor in
            // the first place) are typed 'blank'. The server can drop or
            // keep them; on next load we'll filter them out either way.
            let lineType = content === '' ? 'blank' : (types[i] || 'action');
            const cached = getCachedIds(lineType, content);
            lines.push({
                line_type: lineType,
                content,
                scene_id: cached.scene_id || null,
                character_id: cached.character_id || null,
                location_id: cached.location_id || null,
            });
        }

        const payload = { title_page: loadedTitlePage, lines };
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
        fetchNavigatorData();
        fetchPropTags();

        // Reload to pick up server-resolved entity IDs.
        const cursorPos = editorView.state.selection.main.head;
        const reloadRes = await fetch('/api/screenplay-v2/load');
        if (reloadRes.ok) {
            const reloaded = await reloadRes.json();
            applyLoadedData(reloaded, cursorPos);
        }
    } catch (e) {
        markSaveFailed();
        showToast(`Save error: ${e.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigator
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
    } catch (e) { console.error('Navigator fetch failed:', e); }
    renderScenes(); renderCharacters(); renderLocations();
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
        const charNames = (sc.characters || []).map(ch => (ch.name || '').toUpperCase());
        item.dataset.characters = charNames.join(',');
        const num = document.createElement('span');
        num.className = 'nav-scene-num'; num.textContent = `#${sc.scene_number}`;
        const name = document.createElement('span');
        name.className = 'nav-item-name'; name.textContent = sc.heading; name.title = sc.heading;
        item.appendChild(num); item.appendChild(name);
        if (sc.character_count > 0) {
            const bg = document.createElement('span');
            bg.className = 'nav-item-badge'; bg.textContent = sc.character_count;
            item.appendChild(bg);
        }
        if (sc.scene_id) {
            const lk = document.createElement('a');
            lk.className = 'nav-item-link';
            lk.href = `/browse?entity_type=scene&entity_id=${sc.scene_id}`;
            lk.textContent = '→'; lk.title = 'Open in Entity Browser';
            lk.addEventListener('click', e => e.stopPropagation());
            item.appendChild(lk);
        }
        item.addEventListener('click', () => scrollToLine(sc.line_number));
        f.appendChild(item);
    }
    c.innerHTML = ''; c.appendChild(f);
    applyFilter(); updateCurrentScene();
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
        item.dataset.charName = ch.name.toUpperCase();
        item.innerHTML = `<span class="nav-item-icon">👤</span><span class="nav-item-name">${esc(ch.display_name)}</span><span class="nav-item-badge">${ch.scene_count}</span>`;
        if (ch.character_id) {
            const lk = document.createElement('a');
            lk.className = 'nav-item-link';
            lk.href = `/browse?entity_type=character&entity_id=${ch.character_id}`;
            lk.textContent = '→'; lk.title = 'Open in Entity Browser';
            lk.addEventListener('click', e => e.stopPropagation());
            item.appendChild(lk);
        }
        item.addEventListener('click', () => toggleFilter('character', ch.name.toUpperCase()));
        f.appendChild(item);
    }
    c.innerHTML = ''; c.appendChild(f);
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
            lk.textContent = '→'; lk.title = 'Open in Entity Browser';
            lk.addEventListener('click', e => e.stopPropagation());
            item.appendChild(lk);
        }
        item.addEventListener('click', () => toggleFilter('location', loc.name.toUpperCase()));
        f.appendChild(item);
    }
    c.innerHTML = ''; c.appendChild(f);
    applyFilterHighlight();
}

function toggleFilter(type, name) {
    activeFilter = (activeFilter && activeFilter.type === type && activeFilter.name === name) ? null : { type, name };
    applyFilter(); applyFilterHighlight();
}

function applyFilter() {
    const items = document.querySelectorAll('.nav-scene-item');
    const ind = document.getElementById('nav-scenes-filter');
    if (!activeFilter) { items.forEach(i => i.classList.remove('filtered-out')); if (ind) ind.classList.remove('active'); return; }
    if (ind) ind.classList.add('active');
    items.forEach(item => {
        let vis = false;
        if (activeFilter.type === 'character') {
            const chars = (item.dataset.characters || '').split(',');
            vis = chars.includes(activeFilter.name);
        } else if (activeFilter.type === 'location') {
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
    const pos = editorView.state.doc.line(n).from;
    editorView.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
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
        if (idx < 0 || !navScenes[idx]) charsEl.textContent = '';
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
// Status Bar
// ═══════════════════════════════════════════════════════════════════════════
function updateCursorStatus(state) {
    const line = state.doc.lineAt(state.selection.main.head);
    const totalLines = state.doc.lines;
    const curPage = Math.max(1, Math.ceil(line.number / LINES_PER_PAGE));
    const totalPages = Math.max(1, Math.ceil(totalLines / LINES_PER_PAGE));
    const le = document.getElementById('status-line'), pe = document.getElementById('status-page');
    if (le) le.textContent = `Ln ${line.number}`;
    if (pe) pe.textContent = `Pg ${curPage}/${totalPages}`;
    const we = document.getElementById('status-words');
    if (we) {
        const text = state.doc.toString();
        const wc = text.trim() ? text.trim().split(/\s+/).length : 0;
        we.textContent = `${wc.toLocaleString()} words`;
    }
    updateCurrentScene();
}
function setSaveStatus(text, color) { const el = document.getElementById('status-save'); if (el) { el.textContent = text; el.style.color = color || ''; } }
function markUnsaved() { if (saving) return; unsaved = true; if (savedTimeout) { clearTimeout(savedTimeout); savedTimeout = null; } setSaveStatus('Unsaved •', 'var(--warning)'); }
function markSaved() { unsaved = false; saving = false; setSaveStatus('Saved ✓', 'var(--success)'); if (savedTimeout) clearTimeout(savedTimeout); savedTimeout = setTimeout(() => setSaveStatus('Ready', ''), 3000); }
function markSaving() { saving = true; setSaveStatus('Saving…', ''); }
function markSaveFailed() { saving = false; setSaveStatus('Save failed', 'var(--warning)'); }

// ═══════════════════════════════════════════════════════════════════════════
// Keymap Handlers
// ═══════════════════════════════════════════════════════════════════════════

function handleBackspace(view) {
    const { head, empty } = view.state.selection.main;
    if (!empty) return false;
    const line = view.state.doc.lineAt(head);
    if (head !== line.from) return false;
    if (line.number === 1) return false;

    const prevLine = view.state.doc.line(line.number - 1);
    const prevType = getLineType(view.state, prevLine.number);
    const currType = getLineType(view.state, line.number);
    const currText = line.text.trim();
    // Text-having side wins. Empty current line → prev wins.
    const winType = (currText === '') ? prevType : currType;

    setModeUI(lineTypeToMode(winType));
    view.dispatch({
        changes: { from: prevLine.to, to: line.from },
        selection: { anchor: prevLine.to },
        effects: setLineTypeAtPosEffect.of({ pos: prevLine.from, type: winType }),
    });
    return true;
}

function handleDelete(view) {
    const { head, empty } = view.state.selection.main;
    if (!empty) return false;
    const line = view.state.doc.lineAt(head);
    if (head !== line.to) return false;
    if (line.number === view.state.doc.lines) return false;

    const nextLine = view.state.doc.line(line.number + 1);
    const currType = getLineType(view.state, line.number);
    const nextType = getLineType(view.state, nextLine.number);
    const currText = line.text.trim();
    const winType = (currText === '') ? nextType : currType;

    setModeUI(lineTypeToMode(winType));
    view.dispatch({
        changes: { from: line.to, to: nextLine.from },
        effects: setLineTypeAtPosEffect.of({ pos: line.from, type: winType }),
    });
    return true;
}

/**
 * Enter: insert newline + set new line's type based on mode transition.
 *   scene     → description
 *   character → dialogue
 *   dialogue  → character
 *   else      → same mode
 *
 * Double-Enter (two presses within 350ms) promotes to scene mode without
 * inserting an extra newline.
 */
function handleEnter(view) {
    if (isAutocompleteVisible() && acItems.length > 0 && acHighlight >= 0) return false;
    hideAutocomplete();

    const now = Date.now();
    const dt = now - lastEnterTime;
    lastEnterTime = now;

    if (dt < 350 && dt > 30) {
        setMode('scene', view);
        return true;
    }

    let newMode = currentMode;
    if (currentMode === 'scene') newMode = 'description';
    else if (currentMode === 'character') newMode = 'dialogue';
    else if (currentMode === 'dialogue') newMode = 'character';

    const newType = modeToLineType(newMode);
    setModeUI(newMode);

    const { from, to } = view.state.selection.main;
    const newCursorPos = from + 1;
    view.dispatch({
        changes: { from, to, insert: '\n' },
        selection: { anchor: newCursorPos },
        effects: setLineTypeAtPosEffect.of({ pos: newCursorPos, type: newType }),
        scrollIntoView: true,
    });
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// CodeMirror Editor
// ═══════════════════════════════════════════════════════════════════════════
function createEditor(container) {
    return new EditorView({
        state: EditorState.create({
            doc: '',
            extensions: [
                lineTypesField,                  // must come before plugins that read it
                history(),
                drawSelection(),
                highlightActiveLine(),
                EditorView.lineWrapping,
                placeholder('Start writing your screenplay…'),
                lineDecorationPlugin,
                propHighlightPlugin,
                inputHandler,
                autocompleteKeymap,

                keymap.of([
                    { key: 'Tab', run: handleTab },
                    { key: 'Shift-Tab', run: handleShiftTab },
                    { key: 'Backspace', run: handleBackspace },
                    { key: 'Delete', run: handleDelete },
                    { key: 'Enter', run: handleEnter },
                ]),
                keymap.of([
                    { key: 'Mod-s', run() { saveScreenplay(); return true; } },
                    { key: 'Mod-p', run() { showPropPopover(); return true; } },
                    ...defaultKeymap,
                    ...historyKeymap,
                ]),

                EditorView.updateListener.of((update) => {
                    if (update.selectionSet || update.docChanged) updateCursorStatus(update.state);
                    if (update.docChanged && !suppressUnsaved) {
                        markUnsaved();
                        checkAutocompleteContext();
                    }
                    if (update.selectionSet && !update.docChanged) {
                        detectModeFromCursor(update.state);
                        checkAutocompleteContext();
                    }
                }),
                EditorView.domEventHandlers({
                    blur() { setTimeout(hideAutocomplete, 150); },
                    copy(event, view) { return copyOrCut(view, event, false); },
                    cut(event, view)  { return copyOrCut(view, event, true);  },
                    paste(event, view) { return handlePaste(view, event); },
                }),
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
    window.addEventListener('beforeunload', (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });
    setModeUI('description');
}

export { editorView, saveScreenplay };
