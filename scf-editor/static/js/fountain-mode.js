/**
 * Fountain Screenplay Language Mode for CodeMirror 6
 * ====================================================
 * StreamLanguage-based tokenizer for Fountain markup syntax.
 * Uses CSS classes (cm-fountain-*) for styling.
 */

import { StreamLanguage } from 'https://esm.sh/@codemirror/language@6.10.8';
import { HighlightStyle, syntaxHighlighting } from 'https://esm.sh/@codemirror/language@6.10.8';
import { Tag, tags as defaultTags } from 'https://esm.sh/@lezer/highlight@1.2.1';

// Scene heading pattern: INT./EXT./INT/EXT/I/E or forced with leading dot
const SCENE_HEADING_RE = /^(\.(?=[A-Z])|(?:INT|EXT|EST|I\/E|INT\.\/EXT\.)[\s./])(.*)$/i;

// Transition pattern: all-caps ending with TO: or common transitions
const TRANSITION_RE = /^[A-Z\s]+(?:TO|IN|OUT|UP):?\s*$/;
const FORCED_TRANSITION_RE = /^>\s*.+/;

// Character cue: all-caps line (at least 2 chars), possibly with extensions
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 ._\-']+(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D?|O\.?C\.?)\))?$/;

// Parenthetical within dialogue
const PARENTHETICAL_RE = /^\s*\(.*\)\s*$/;

// Title page key: starts with known key followed by colon
const TITLE_KEY_RE = /^(Title|Credit|Author|Authors|Source|Notes|Draft date|Date|Contact|Copyright|Revision|Font)\s*:/i;

// Centered text
const CENTERED_RE = /^>.*<$/;

// Section headers
const SECTION_RE = /^#{1,6}\s/;

// Synopsis
const SYNOPSIS_RE = /^=\s/;

// Boneyard (block comment)
const BONEYARD_OPEN = /\/\*/;
const BONEYARD_CLOSE = /\*\//;

// Inline note
const NOTE_RE = /\[\[.*?\]\]/;

/**
 * State tracked across lines for context-sensitive parsing.
 */
function createStartState() {
    return {
        inBoneyard: false,
        inTitlePage: true,  // Title page is at the start
        prevLineBlank: true,
        inDialogue: false,
    };
}

const fountainMode = {
    name: 'fountain',

    startState: createStartState,

    copyState(state) {
        return { ...state };
    },

    token(stream, state) {
        // --- Boneyard (block comment) ---
        if (state.inBoneyard) {
            const closeIdx = stream.string.indexOf('*/', stream.pos);
            if (closeIdx >= 0) {
                stream.pos = closeIdx + 2;
                state.inBoneyard = false;
            } else {
                stream.skipToEnd();
            }
            return 'fountain-boneyard';
        }

        // Check for boneyard open
        if (stream.match('/*')) {
            state.inBoneyard = true;
            const closeIdx = stream.string.indexOf('*/', stream.pos);
            if (closeIdx >= 0) {
                stream.pos = closeIdx + 2;
                state.inBoneyard = false;
            } else {
                stream.skipToEnd();
            }
            return 'fountain-boneyard';
        }

        // --- At start of line: determine line type ---
        if (stream.sol()) {
            const line = stream.string;
            const trimmed = line.trim();

            // Blank line tracking
            if (trimmed === '') {
                stream.skipToEnd();
                state.prevLineBlank = true;
                state.inDialogue = false;
                return null;
            }

            // Title page: lines at the top before first blank line with content
            if (state.inTitlePage) {
                if (TITLE_KEY_RE.test(line)) {
                    stream.skipToEnd();
                    state.prevLineBlank = false;
                    return 'fountain-titleKey';
                }
                if (!state.prevLineBlank && trimmed !== '') {
                    // Continuation of title page value
                    stream.skipToEnd();
                    state.prevLineBlank = false;
                    return 'fountain-titleValue';
                }
                // First blank line or non-title content ends title page
                if (state.prevLineBlank && trimmed !== '' && !TITLE_KEY_RE.test(line)) {
                    state.inTitlePage = false;
                    // Fall through to normal parsing
                }
            }

            // Scene heading
            if (SCENE_HEADING_RE.test(trimmed)) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = false;
                return 'fountain-heading';
            }

            // Section headers (# ... )
            if (SECTION_RE.test(trimmed)) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = false;
                return 'fountain-section';
            }

            // Synopsis (= ...)
            if (SYNOPSIS_RE.test(trimmed)) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = false;
                return 'fountain-synopsis';
            }

            // Centered text (> ... <)
            if (CENTERED_RE.test(trimmed)) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = false;
                return 'fountain-centered';
            }

            // Forced transition (> without closing <)
            if (FORCED_TRANSITION_RE.test(trimmed) && !CENTERED_RE.test(trimmed)) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = false;
                return 'fountain-transition';
            }

            // Parenthetical (inside dialogue context)
            if (state.inDialogue && PARENTHETICAL_RE.test(trimmed)) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                return 'fountain-parenthetical';
            }

            // Dialogue continuation
            if (state.inDialogue) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                return 'fountain-dialogue';
            }

            // Transition (all-caps ending with TO:, etc.) — must follow blank line
            if (state.prevLineBlank && TRANSITION_RE.test(trimmed) && trimmed.length > 2) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = false;
                return 'fountain-transition';
            }

            // Character cue — all-caps line after blank line
            if (state.prevLineBlank && CHARACTER_CUE_RE.test(trimmed) && trimmed.length > 1) {
                // Differentiate from transitions: transitions end with TO:/IN:/OUT:
                // Character cues don't, or they have extensions like (V.O.)
                if (!TRANSITION_RE.test(trimmed)) {
                    stream.skipToEnd();
                    state.prevLineBlank = false;
                    state.inDialogue = true;
                    return 'fountain-character';
                }
            }

            // Forced character cue (starts with @)
            if (trimmed.startsWith('@')) {
                stream.skipToEnd();
                state.prevLineBlank = false;
                state.inDialogue = true;
                return 'fountain-character';
            }

            // Default: action line
            stream.skipToEnd();
            state.prevLineBlank = false;
            state.inDialogue = false;
            return null;
        }

        // Mid-line: just consume (line-level tokenizer handles full lines)
        stream.skipToEnd();
        return null;
    },

    blankLine(state) {
        state.prevLineBlank = true;
        state.inDialogue = false;
        if (state.inTitlePage) {
            // A blank line in context — could still be title page
            // Title page ends when we see content after a blank that isn't a key
        }
    },

    languageData: {
        commentTokens: { block: { open: '/*', close: '*/' } },
    },
};

/**
 * The Fountain StreamLanguage instance for CodeMirror 6.
 */
export const fountainLanguage = StreamLanguage.define(fountainMode);
