"""
Fountain Screenplay Parser for SCF
====================================
Parses .fountain formatted screenplays and extracts structured story data:
- Scenes (with INT/EXT, location, time of day)
- Characters (with first-appearance descriptions)
- Locations (deduplicated from scene headings)
- Props (whitelist-based extraction with confidence levels)
- Scene-Character links (with parentheticals)

Supports both standard Fountain syntax and !-prefixed action lines.

Reference: https://fountain.io/syntax
"""

import re
from dataclasses import dataclass, field
from typing import Optional


# =============================================================================
# Data structures
# =============================================================================

@dataclass
class FountainCharacter:
    name: str                          # Title-cased: "Lillith Barbadill"
    raw_name: str                      # As found in script: "LILLITH BARBADILL"
    description: str = ""              # First-appearance description from action
    hair: str = ""                     # Extracted physical detail
    build: str = ""
    distinguishing_features: str = ""
    scenes: list[int] = field(default_factory=list)  # Scene indices (0-based)


@dataclass
class FountainLocation:
    name: str                          # Deduplicated: "Barbadill Manor"
    raw_headings: list[str] = field(default_factory=list)


@dataclass
class FountainProp:
    name: str                          # Title-cased: "Eyedropper"
    confidence: str = "medium"         # "high", "medium", "low"
    context: str = ""                  # Action line context where found
    first_scene: int = 0              # Scene index (0-based)
    mention_count: int = 1


@dataclass
class FountainSceneCharacter:
    name: str
    parentheticals: list[str] = field(default_factory=list)
    has_dialogue: bool = True


@dataclass
class FountainScene:
    scene_number: int                  # 1-based
    name: str                          # Full heading: "EXT. BARBADILL MANOR - GARDEN"
    location_name: str                 # Deduplicated: "Barbadill Manor - Garden"
    int_ext: str = ""                  # "Interior", "Exterior", "Int/Ext"
    time_of_day: str = ""
    summary: str = ""
    characters: list[FountainSceneCharacter] = field(default_factory=list)


@dataclass
class FountainData:
    """Complete parsed output from a Fountain screenplay."""
    characters: list[FountainCharacter] = field(default_factory=list)
    locations: list[FountainLocation] = field(default_factory=list)
    scenes: list[FountainScene] = field(default_factory=list)
    props: list[FountainProp] = field(default_factory=list)
    title: str = ""
    author: str = ""


# =============================================================================
# Constants
# =============================================================================

_SCENE_HEADING_RE = re.compile(
    r'^\.?(INT|EXT|I/E|INT\./EXT|EXT\./INT|INT\.?/EXT\.?|EXT\.?/INT\.?|EST)'
    r'[\.\s]+\s*'
    r'(.+?)'
    r'(?:\s*[-\.]\s*'  # separator: dash OR period before time-of-day
    r'(DAY|NIGHT|MORNING|EARLY\s+MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|'
    r'TWILIGHT|SUNSET|SUNRISE|'
    r'CONTINUOUS|LATER|MOMENTS?\s+LATER|SAME\s+TIME|'
    r'MANY\s+YEARS\s+AGO|YEARS\s+AGO|YEARS\s+LATER|YEARS\s+BEFORE|'
    r'PRESENT\s+DAY|PRESENT)'
    r')?'
    r'(?:\s*[\.\s]*(?:B\+W|B&W))?' # Optional B+W / B&W style marker
    r'(?:\s*[\(\[].*?[\)\]])*'  # Trailing (1973) or [FLASHBACK] etc.
    r'[\.\s]*$',  # Allow trailing periods and whitespace
    re.IGNORECASE
)

# Pattern to strip leading scene numbers: "1A ", "133T ", "5B ", "0EXT", "14*EXT"
_SCENE_NUMBER_PREFIX_RE = re.compile(r'^\d+[A-Z]?\s*(?=INT|EXT|I/E|EST)', re.IGNORECASE)

_CHAR_EXTENSION_RE = re.compile(
    r'(?:\s*\([^)]*\))+\s*$',  # Strip ALL trailing parenthesized groups
    re.IGNORECASE
)

_PARENTHETICAL_RE = re.compile(r'^\s*\(.*\)\s*$')
_TRANSITION_RE = re.compile(r'^[A-Z\s]+TO:\s*$')

_INT_EXT_MAP = {
    "INT": "Interior", "EXT": "Exterior", "I/E": "Int/Ext",
    "INT./EXT": "Int/Ext", "INT/EXT": "Int/Ext",
    "EXT./INT": "Int/Ext", "EXT/INT": "Int/Ext",
    "EST": "Exterior",
}

_TIME_MAP = {
    "DAY": "Midday", "NIGHT": "Night", "MORNING": "Morning",
    "EVENING": "Dusk", "DAWN": "Dawn", "DUSK": "Dusk",
    "AFTERNOON": "Afternoon", "MIDDAY": "Midday",
    "CONTINUOUS": "Continuous", "LATER": "Continuous",
    "MOMENTS LATER": "Continuous", "MOMENT LATER": "Continuous",
    "SAME TIME": "Continuous",
    "TWILIGHT": "Dusk",
    "SUNSET": "Dusk",
    "SUNRISE": "Dawn",
    "PRESENT DAY": "",
    "PRESENT": "",
    "EARLY MORNING": "Dawn",
}

# Screenplay conventions that look like character cues but aren't
_NOT_CHARACTERS = {
    "THE END", "FADE OUT", "FADE IN", "FADE TO BLACK", "FADE TO WHITE",
    "CUT TO", "SMASH CUT TO", "MATCH CUT TO", "JUMP CUT TO",
    "DISSOLVE TO", "WIPE TO", "IRIS IN", "IRIS OUT",
    "TITLE CARD", "SUPER", "SUPERIMPOSE", "CHYRON",
    "INTERCUT", "BACK TO SCENE", "CONTINUOUS", "LATER",
    "END CREDITS", "OPENING CREDITS", "CREDITS",
    "MONTAGE", "END MONTAGE", "SERIES OF SHOTS", "END SERIES",
    "FLASHBACK", "END FLASHBACK", "DREAM SEQUENCE", "END DREAM",
    "V.O.", "O.S.", "O.C.", "CONT'D", "PRE-LAP", "BEGIN", "END",
    "OMITTED", "CONTINUED", "MORE",
    "BLACK", "WHITE", "SILENCE", "DARKNESS", "MUSIC", "PAUSE",
    "OVER BLACK", "BACK ON DON",
    "MOMENTS LATER", "SOMETIME LATER", "YEARS LATER",
    "BEEP BEEP", "RING RING", "BANG BANG",
}

# Patterns for dual/group cues
_GROUP_CUE_PATTERNS = re.compile(
    r"'S\s+FAMILY|'S\s+FAMILY|'S\s+GROUP|'S\s+CREW|"
    r"\bALL$|\bEVERYONE$|\bBOTH$|\bTOGETHER$",
    re.IGNORECASE
)
_DUAL_CUE_SPLITTERS = [" AND ", " & ", " / "]


# =============================================================================
# Encoding normalization
# =============================================================================

def _normalize_encoding(text: str) -> str:
    """
    Normalize smart quotes, special apostrophes, and other encoding artifacts
    from screenplay files exported by various editors.
    """
    replacements = {
        '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
        '\u2032': "'", '\u2035': "'",
        '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
        '\u2033': '"', '\u2036': '"',
        '\u2013': '-', '\u2014': '--', '\u2015': '--',
        '\u2026': '...',
        '\u00A0': ' ', '\u2002': ' ', '\u2003': ' ', '\u2009': ' ',
        '\u200B': '',
        '\uFFFD': "'",  # replacement character (corrupt smart apostrophe)
        '\u0080': '',   # C1 control (Mojibake from Windows-1252 smart quotes)
        '\u0091': "'",  # Windows-1252 left single quote as C1
        '\u0092': "'",  # Windows-1252 right single quote as C1
        '\u0093': '"',  # Windows-1252 left double quote as C1
        '\u0094': '"',  # Windows-1252 right double quote as C1
        '\u0096': '-',  # Windows-1252 en dash as C1
        '\u0097': '--', # Windows-1252 em dash as C1
        '\u0085': '...', # Windows-1252 ellipsis as C1
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


# =============================================================================
# Title page parsing
# =============================================================================

def _strip_fountain_formatting(text: str) -> str:
    """Strip Fountain markdown: ***bold italic***, **bold**, *italic*, _underline_."""
    text = re.sub(r'\*{3}(.+?)\*{3}', r'\1', text)  # ***bold italic***
    text = re.sub(r'\*{2}(.+?)\*{2}', r'\1', text)   # **bold**
    text = re.sub(r'\*(.+?)\*', r'\1', text)          # *italic*
    text = re.sub(r'_(.+?)_', r'\1', text)            # _underline_
    return text.strip()


def _parse_title_page(lines: list[str]) -> tuple[str, str, int]:
    """Extract title page metadata. Returns (title, author, first_content_line)."""
    title = ""
    author = ""
    i = 0
    in_title_page = False

    for i, line in enumerate(lines):
        stripped = line.strip()
        kv_match = re.match(
            r'^(Title|Author|Credit|Source|Draft date|Contact|Copyright)\s*:\s*(.*)',
            stripped, re.IGNORECASE
        )
        if kv_match:
            in_title_page = True
            key = kv_match.group(1).lower()
            value = kv_match.group(2).strip()
            if key == "title":
                title = _strip_fountain_formatting(value)
            elif key == "author":
                author = _strip_fountain_formatting(value)
        elif in_title_page and stripped == "":
            return title, author, i + 1
        elif in_title_page and (stripped.startswith(" ") or stripped.startswith("\t")):
            pass
        elif not in_title_page and i == 0:
            return "", "", 0
        else:
            break

    if in_title_page:
        return title, author, i + 1
    return "", "", 0


# =============================================================================
# Core parser
# =============================================================================

def parse(text: str) -> FountainData:
    """Parse a Fountain-formatted screenplay into structured data."""
    result = FountainData()

    # Normalize encoding FIRST
    text = _normalize_encoding(text)

    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    result.title, result.author, content_start = _parse_title_page(lines)

    # State
    current_scene: Optional[FountainScene] = None
    current_char_name: Optional[str] = None
    in_dialogue = False

    # Lookups
    char_lookup: dict[str, FountainCharacter] = {}
    location_lookup: dict[str, FountainLocation] = {}
    action_lines_by_scene: dict[int, list[str]] = {}
    char_first_seen_scene: dict[str, int] = {}
    scene_char_map: dict[int, dict[str, FountainSceneCharacter]] = {}
    all_action_text: list[tuple[int, str]] = []
    scene_events: dict[int, list[tuple[str, str]]] = {}
    dual_cue_notes: list[dict] = []

    scene_idx = -1

    for line_num in range(content_start, len(lines)):
        line = lines[line_num].rstrip()

        # ── Blank line ──
        if line.strip() == '':
            if in_dialogue:
                in_dialogue = False
                current_char_name = None
            continue

        # ── Scene heading ──
        scene_match = _match_scene_heading(line)
        if scene_match:
            int_ext_str, location_body, time_str = scene_match
            in_dialogue = False
            current_char_name = None
            scene_idx += 1

            location_name = _normalize_location_name(location_body)
            int_ext = _INT_EXT_MAP.get(int_ext_str.upper().replace('.', ''), "")
            time_of_day = _TIME_MAP.get(time_str.upper(), "") if time_str else ""

            scene_name = line.strip().lstrip('.').strip()

            current_scene = FountainScene(
                scene_number=scene_idx + 1, name=scene_name,
                location_name=location_name, int_ext=int_ext,
                time_of_day=time_of_day,
            )
            result.scenes.append(current_scene)
            action_lines_by_scene[scene_idx] = []
            scene_char_map[scene_idx] = {}
            scene_events[scene_idx] = []

            loc_key = location_name.lower()
            if loc_key not in location_lookup:
                loc = FountainLocation(name=location_name)
                location_lookup[loc_key] = loc
                result.locations.append(loc)
            location_lookup[loc_key].raw_headings.append(scene_name)
            continue

        if current_scene is None:
            continue

        # ── !-prefixed action ──
        if line.lstrip().startswith('!'):
            in_dialogue = False
            current_char_name = None
            action_text = line.lstrip()[1:].strip()
            if action_text:
                action_lines_by_scene[scene_idx].append(action_text)
                all_action_text.append((scene_idx, action_text))
                scene_events[scene_idx].append(("action", action_text))
            continue

        stripped = line.strip()

        # ── Transition ──
        if _TRANSITION_RE.match(stripped):
            continue

        # ── Character cue ──
        if not in_dialogue:
            # Clean Fountain markers for character cue analysis:
            # @ = forced character, ^ = dual dialogue, * = revision marks
            cue_candidate = stripped
            cue_candidate = cue_candidate.lstrip('@')              # forced character
            cue_candidate = cue_candidate.rstrip('^').strip()      # dual dialogue
            cue_candidate = cue_candidate.replace('\\*', '').strip()  # escaped revision marks
            cue_candidate = cue_candidate.strip('*').strip()       # leading/trailing asterisks

            # Strip leading (CONT'D) prefix stuck to name: (CONT'D)VICTOR -> VICTOR
            cue_candidate = re.sub(
                r"^\(CONT'?D?\)\s*", '', cue_candidate, flags=re.IGNORECASE
            ).strip()

            # Reject (CONTINUED) CONTINUED: page break markers
            if re.match(r'^\(CONTINUED\)', cue_candidate, re.IGNORECASE):
                continue
            if cue_candidate.upper().startswith('CONTINUED'):
                continue

            if _is_character_cue(cue_candidate):
                clean_name = _CHAR_EXTENSION_RE.sub('', cue_candidate).strip()

                # If there are still parenthesized groups inside (e.g. "BIRDIE (O.S.) LIONEL")
                # strip ALL parens — this is likely dual dialogue with extensions
                if '(' in clean_name:
                    clean_name = re.sub(r'\([^)]*\)', '', clean_name).strip()
                    clean_name = re.sub(r'\s{2,}', ' ', clean_name)  # collapse double spaces

                if len(clean_name) >= 2 and clean_name.upper() == clean_name:
                    if clean_name in _NOT_CHARACTERS:
                        continue

                    # Check dual/group cue
                    dual_result = _check_dual_cue(clean_name)
                    if dual_result is not None:
                        dual_cue_notes.append({"names": dual_result, "scene_idx": scene_idx})
                        in_dialogue = True
                        current_char_name = None
                        continue

                    current_char_name = _title_case_name(clean_name)
                    in_dialogue = True

                    if current_char_name not in char_lookup:
                        char = FountainCharacter(name=current_char_name, raw_name=clean_name)
                        char_lookup[current_char_name] = char
                        result.characters.append(char)

                    if scene_idx not in char_lookup[current_char_name].scenes:
                        char_lookup[current_char_name].scenes.append(scene_idx)

                    if current_char_name not in char_first_seen_scene:
                        char_first_seen_scene[current_char_name] = scene_idx

                    if current_char_name not in scene_char_map[scene_idx]:
                        sc_link = FountainSceneCharacter(name=current_char_name)
                        scene_char_map[scene_idx][current_char_name] = sc_link

                    scene_events[scene_idx].append(("cue", current_char_name))
                    continue

        # ── Parenthetical ──
        if in_dialogue and _PARENTHETICAL_RE.match(line):
            paren_text = stripped.strip('()').strip()
            if current_char_name and current_char_name in scene_char_map.get(scene_idx, {}):
                scene_char_map[scene_idx][current_char_name].parentheticals.append(paren_text)
            continue

        # ── Dialogue ──
        if in_dialogue:
            inline_paren = re.match(r'^\s*\(([^)]+)\)', line)
            if inline_paren:
                paren_text = inline_paren.group(1).strip()
                if current_char_name and current_char_name in scene_char_map.get(scene_idx, {}):
                    scene_char_map[scene_idx][current_char_name].parentheticals.append(paren_text)
            continue

        # ── Standard action line ──
        if stripped:
            in_dialogue = False
            current_char_name = None
            action_lines_by_scene[scene_idx].append(stripped)
            all_action_text.append((scene_idx, stripped))
            scene_events[scene_idx].append(("action", stripped))

    # ── Post-processing ──

    # 1. Scene summaries
    for idx, scene in enumerate(result.scenes):
        scene_lines = action_lines_by_scene.get(idx, [])
        if scene_lines:
            scene.summary = ' '.join(scene_lines)

    # 2. Attach scene-character links
    for idx, scene in enumerate(result.scenes):
        scene.characters = list(scene_char_map.get(idx, {}).values())

    # 3. Process dual cue notes
    for note in dual_cue_notes:
        for raw_name in note["names"]:
            tc_name = _title_case_name(raw_name)
            if tc_name in char_lookup:
                sidx = note["scene_idx"]
                if sidx not in char_lookup[tc_name].scenes:
                    char_lookup[tc_name].scenes.append(sidx)
                if tc_name not in scene_char_map.get(sidx, {}):
                    sc_link = FountainSceneCharacter(name=tc_name)
                    scene_char_map[sidx][tc_name] = sc_link
                    result.scenes[sidx].characters.append(sc_link)

    # 4. Character descriptions
    _extract_character_descriptions(result.characters, char_first_seen_scene,
                                     action_lines_by_scene, scene_events)

    # 4.5. Dedup compound character names (space-separated dual dialogue)
    # Some scripts format simultaneous dialogue as "DEVON LIONEL" on one line.
    # After initial parsing, detect these and redistribute scenes to components.
    _dedup_compound_characters(result, char_lookup, scene_char_map)

    # 5. Props (whitelist-based)
    result.props = _extract_props(all_action_text, char_lookup)

    return result


# =============================================================================
# Dual / group cue detection
# =============================================================================

def _check_dual_cue(name: str) -> Optional[list[str]]:
    """
    Returns list of individual names if dual/group cue, None if normal cue.
    """
    if _GROUP_CUE_PATTERNS.search(name):
        base_match = re.match(r"^(.+?)('S\s+)", name)
        if base_match:
            return [base_match.group(1).strip()]
        return []

    for splitter in _DUAL_CUE_SPLITTERS:
        if splitter in name:
            return [p.strip() for p in name.split(splitter) if p.strip()]

    return None


def _dedup_compound_characters(result, char_lookup, scene_char_map):
    """
    Detect and merge compound character names that are actually
    space-separated dual dialogue cues (e.g., "DEVON LIONEL" where
    Devon and Lionel both have separate character entries).

    Strategy: For each character with multiple words in their name,
    try splitting at every possible point. If both halves are already
    known characters with more scenes, merge and remove the compound.
    """
    # Build lookup of known names (use lowercase for matching)
    known_names = {}  # lowercase name -> FountainCharacter
    for c in result.characters:
        known_names[c.name.lower()] = c

    # Prefixes that indicate character variants, not dual dialogue
    _VARIANT_PREFIXES = {
        'young', 'old', 'older', 'elder', 'little', 'adult', 'baby',
        'teenage', 'teen', 'child', 'dr.', 'dr', 'professor', 'prof.',
        'captain', 'officer', 'detective', 'sergeant', 'sgt.',
        'king', 'queen', 'prince', 'princess', 'lord', 'lady',
        'uncle', 'aunt', 'cousin', 'sister', 'brother',
        'mr.', 'mrs.', 'ms.', 'miss', 'sir', 'madam',
    }

    to_remove = []

    for compound in list(result.characters):
        words = compound.name.split()
        if len(words) < 2:
            continue
        # Skip if this character appears in many scenes (likely a real name)
        if len(compound.scenes) > 3:
            continue
        # Skip if name starts with a variant prefix (Young Victor, Dr. Bennett, etc.)
        if words[0].lower() in _VARIANT_PREFIXES:
            continue

        # Try every split point
        best_split = None
        for split_at in range(1, len(words)):
            left = ' '.join(words[:split_at]).lower()
            right = ' '.join(words[split_at:]).lower()

            left_char = known_names.get(left)
            right_char = known_names.get(right)

            if left_char and right_char:
                # Both halves are known characters — check they're not the same
                # and that the compound doesn't refer to itself
                if (left_char is not compound and right_char is not compound
                        and left_char is not right_char):
                    # Prefer splits where both components have more scenes
                    left_scenes = len(left_char.scenes)
                    right_scenes = len(right_char.scenes)
                    if left_scenes >= 2 or right_scenes >= 2:
                        best_split = (left_char, right_char)
                        break

        if best_split:
            left_char, right_char = best_split
            # Redistribute scenes
            for sidx in compound.scenes:
                if sidx not in left_char.scenes:
                    left_char.scenes.append(sidx)
                if sidx not in right_char.scenes:
                    right_char.scenes.append(sidx)
                # Also update scene character maps
                for char in (left_char, right_char):
                    if sidx < len(result.scenes):
                        existing_names = {sc.name for sc in result.scenes[sidx].characters}
                        if char.name not in existing_names:
                            sc_link = FountainSceneCharacter(name=char.name)
                            result.scenes[sidx].characters.append(sc_link)

            to_remove.append(compound)

    # Remove compound entries
    for compound in to_remove:
        result.characters.remove(compound)
        if compound.name.lower() in known_names:
            del known_names[compound.name.lower()]


# =============================================================================
# Scene heading matching
# =============================================================================

def _match_scene_heading(line: str) -> Optional[tuple[str, str, Optional[str]]]:
    stripped = line.strip()
    if not stripped:
        return None
    if stripped == '.' or (stripped.startswith('.') and len(stripped.strip('.')) == 0):
        return None

    # Strip revision marks
    test = stripped.rstrip('*').rstrip('\\').rstrip().rstrip('*').strip()

    # Strip leading / (some scripts use /EXT.)
    test = test.lstrip('/')

    # Strip leading scene numbers: "1A ", "133T ", "5B "
    test = _SCENE_NUMBER_PREFIX_RE.sub('', test)

    # Try the main regex
    m = _SCENE_HEADING_RE.match(test)
    if m:
        return m.group(1), m.group(2).strip().rstrip('.'), m.group(3)

    # Try forced heading with . prefix
    if test.startswith('.'):
        inner = test[1:].strip()
        m = _SCENE_HEADING_RE.match(inner)
        if m:
            return m.group(1), m.group(2).strip().rstrip('.'), m.group(3)

    return None


# =============================================================================
# Character cue detection
# =============================================================================

def _is_character_cue(line: str) -> bool:
    """
    Determine if a line is a character cue in Fountain format.

    In standard Fountain, a character name is an all-uppercase line that
    appears after a blank line, before dialogue. We apply strict filtering
    to avoid matching scene directions, action descriptions, centered text,
    and other uppercase constructs common in professional screenplays.
    """
    stripped = line.strip()
    if not stripped:
        return False

    # ── Reject formatted/centered text ──
    if '>' in stripped or '<' in stripped or '_' in stripped:
        return False

    # ── Reject quoted text (props/set dressing described on their own line) ──
    if stripped.startswith('"') or stripped.startswith("'"):
        return False

    # ── Reject lines with exclamation marks in the middle (sound effects) ──
    # Allow trailing ! only after abbreviation-like words
    if '!' in stripped and not stripped.endswith('!'):
        return False
    if stripped.endswith('!') and len(stripped.split()) > 1:
        return False

    # ── Reject lines starting with digits (scene numbers) ──
    if stripped[0].isdigit():
        return False

    # ── Reject lines ending with sentence punctuation ──
    if stripped.endswith((',', '!', ':')):
        return False
    if stripped.endswith('.'):
        clean_end = stripped.rstrip('.')
        last_word = clean_end.split()[-1] if clean_end.split() else ''
        if last_word.upper() not in ('JR', 'SR', 'DR', 'MR', 'MRS', 'MS', 'ST', 'SGT', 'CPL', 'LT', 'GEN', 'PROF'):
            return False

    # Strip character extensions for analysis
    clean = _CHAR_EXTENSION_RE.sub('', stripped).strip()
    if not clean:
        return False

    # ── Reject OMITTED scenes ──
    if clean == 'OMITTED':
        return False

    # ── Reject lines starting with indefinite articles ──
    # "A VOICE", "AN OLD MAN" are descriptions, not names
    # Allow "THE" — many character names use it (The Void, The Doctor, The Beast)
    if re.match(r'^(A|AN)\s', clean):
        return False

    # ── Reject scene headings that slipped through ──
    if _match_scene_heading(stripped):
        return False
    # Catch EXT/INT with slash or other non-standard prefixes
    if re.match(r'^(EXT|INT|/EXT|/INT|EXT/INT)', clean, re.IGNORECASE):
        return False

    # ── Reject transitions ──
    if _TRANSITION_RE.match(stripped):
        return False
    if clean.endswith(('TO:', 'TO BLACK', 'TO WHITE')):
        return False

    # ── Reject scene directions and camera instructions ──
    _DIRECTION_STARTS = (
        'ON ', 'CLOSE ON', 'CLOSE UP', 'WIDE ON', 'ANGLE ON', 'BACK TO',
        'VARIOUS', 'INTERCUT', 'TITLE', 'SERIES OF', 'FLASHBACK',
        'UNDER ', 'AT ', 'DOWN ', 'FURTHER', 'NEARBY', 'ACROSS',
        'INSIDE ', 'OUTSIDE ', 'BEHIND ', 'ABOVE ', 'BELOW ',
        'OVER ', 'INTO ', 'ONTO ', 'THROUGH ',
        'CUT TO', 'FADE', 'DISSOLVE', 'WIPE', 'IRIS',
        'MONTAGE', 'END ', 'BEGIN ', 'TRANSITION',
        'SUPER:', 'SUPER ', 'CHYRON', 'TITLE CARD',
        'LATER', 'CONTINUOUS', 'SAME TIME',
        'WARNING', 'BRIGHT ', 'SLOW ',
    )
    if any(clean.startswith(d) for d in _DIRECTION_STARTS):
        return False

    # ── Must be uppercase ──
    letters_only = re.sub(r'[^A-Za-z]', '', clean)
    if not letters_only or letters_only != letters_only.upper():
        return False

    # ── Reject lines with too many words (names rarely exceed 5) ──
    word_count = len(clean.split())
    if word_count > 5:
        return False

    # ── Reject lines that look like action descriptions ──
    words = clean.split()
    # Lines that are all gerunds / present participles (only if there ARE long words)
    long_words = [w for w in words if len(w) > 3]
    if long_words and all(w.endswith('ING') for w in long_words):
        return False
    # Lines where the first word is a common action verb / gerund
    _ACTION_STARTS = {
        'GRABBING', 'SMASHING', 'JUMPING', 'SPINNING', 'RUNNING',
        'WALKING', 'SITTING', 'STANDING', 'LOOKING', 'WATCHING',
        'PULLING', 'PUSHING', 'HOLDING', 'CARRYING', 'DRIVING',
        'FALLING', 'FLYING', 'CLIMBING', 'CRAWLING', 'SWIMMING',
        'FIRING', 'SHOOTING', 'FIGHTING', 'BREAKING', 'OPENING',
        'CLOSING', 'ENTERING', 'LEAVING', 'APPROACHING', 'REVEALING',
        'SHOWING', 'RINGS', 'WEARING', 'MOVING', 'TURNING',
        'SUDDENLY', 'MEANWHILE', 'FINALLY', 'THEN',
    }
    if words[0] in _ACTION_STARTS:
        return False

    # Lines starting with number words (descriptions, not names)
    _NUMBER_STARTS = {
        'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT',
        'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'TWENTY', 'THIRTY',
        'FORTY', 'FIFTY', 'HUNDRED', 'THOUSAND', 'SEVERAL', 'MANY',
        'BOTH', 'HALF', 'DOZEN',
    }
    if words[0] in _NUMBER_STARTS and word_count > 1:
        return False

    # ── Minimum length ──
    if len(clean) < 2:
        return False

    return True


# =============================================================================
# Name normalization
# =============================================================================

def _title_case_name(name: str) -> str:
    parts = name.split()
    result = []
    for part in parts:
        if '-' in part:
            result.append('-'.join(w.capitalize() for w in part.split('-')))
        elif "'" in part:
            idx = part.index("'")
            before = part[:idx+1].capitalize()
            after = part[idx+1:]
            # Possessive 's stays lowercase; name parts like O'Brien get capitalized
            if after.upper() == 'S':
                result.append(before + 's')
            elif len(after) > 1:
                result.append(before + after.capitalize())
            else:
                result.append(before + after.lower())
        else:
            result.append(part.capitalize())
    return ' '.join(result)


def _normalize_location_name(raw: str) -> str:
    """
    Normalize location name from heading body for deduplication.
    Strips years, annotations, time-of-day markers, style markers, and qualifiers.
    Runs multiple passes to handle chained qualifiers like ". MANY YEARS AGO. DAY B+W"
    """
    name = raw.strip()

    # Run stripping passes until stable (handles chained qualifiers)
    for _ in range(3):
        prev = name

        # Strip leading /INT. or /EXT. from EXT./INT. style headings
        name = re.sub(r'^/(?:INT|EXT)\.?\s*', '', name, flags=re.IGNORECASE)

        # Strip secondary location in dual headings: "TOWER / INT. TOWER - LOBBY" -> "TOWER"
        name = re.sub(r'\s*/\s*(?:INT|EXT)\.?\s+.*$', '', name, flags=re.IGNORECASE)

        # Strip trailing parenthesized content: (1973), (PRESENT)
        name = re.sub(r'\s*\([^)]*\)\s*$', '', name)
        # Strip trailing bracket content: [FLASHBACK], [CONTINUOUS]
        name = re.sub(r'\s*\[[^\]]*\]\s*$', '', name)

        # Strip B+W / B&W style markers
        name = re.sub(r'\s*\.?\s*(?:B\+W|B&W)\s*$', '', name, flags=re.IGNORECASE)

        # Strip time-of-day / temporal suffixes
        name = re.sub(
            r'\s*[-\.]\s*(?:EARLY\s+)?'
            r'(?:DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|'
            r'TWILIGHT|SUNSET|SUNRISE|'
            r'CONTINUOUS|LATER|SAME TIME|MOMENTS? LATER|'
            r'MANY\s+YEARS\s+AGO|YEARS\s+AGO|YEARS\s+LATER|YEARS\s+BEFORE|'
            r'PRESENT\s+DAY|PRESENT)'
            r'(?:\s*(?:/|TO)\s*\w+)*'
            r'(?:\s*-?\s*\[[^\]]*\])?'
            r'[\.]*\s*$',
            '', name, flags=re.IGNORECASE
        )

        # Strip trailing qualifiers
        name = re.sub(r'\s*-\s*(PRE|VARIOUS\s+SHOTS?|PRESENT)\s*$', '', name, flags=re.IGNORECASE)

        # Clean up trailing punctuation
        name = name.strip().rstrip('-/.').strip()

        if name == prev:
            break

    if not name:
        return _smart_title(raw.strip())
    return _smart_title(name)


def _smart_title(text: str) -> str:
    """Title-case text with proper apostrophe handling."""
    words = text.split()
    result = []
    for word in words:
        if "'" in word:
            idx = word.index("'")
            before = word[:idx+1].capitalize()
            after = word[idx+1:]
            if after.upper() == 'S':
                result.append(before + 's')
            elif len(after) > 1:
                result.append(before + after.capitalize())
            else:
                result.append(before + after.lower())
        elif '-' in word:
            result.append('-'.join(w.capitalize() for w in word.split('-')))
        else:
            result.append(word.capitalize())
    return ' '.join(result)


# =============================================================================
# Character description extraction
# =============================================================================

_PHYSICAL_KEYWORDS = [
    'year old', 'years old', 'tall', 'short', 'hair',
    'wearing', 'wears', 'dressed', 'outfit', 'jumpsuit', 'suit',
    'shirt', 'coat', 'slim', 'heavy', 'muscular',
    'old', 'young', 'curly', 'wild', 'bold',
    'beautiful', 'handsome', 'rugged', 'scarred',
    'glasses', 'beard', 'tattoo', 'uniform',
    'flower', 'colorful',
    'crow', 'cat', 'dog', 'animal',
    'cowboy', 'attire', 'lanky', 'broad', 'shouldered',
    'styled', 'blonde', 'brunette', 'red', 'white',
]


def _extract_character_descriptions(characters, first_seen, action_by_scene, scene_events):
    for char in characters:
        scene_idx = first_seen.get(char.name)
        if scene_idx is None:
            continue
        events = scene_events.get(scene_idx, [])
        if not events:
            continue

        # Strategy 1: preceding action lines
        preceding = _get_preceding_actions(char.name, events)
        intro_desc, intro_score = "", 0
        for line in preceding:
            s = _score_intro_line(line)
            if s > intro_score:
                intro_score = s
                intro_desc = line

        # Strategy 2: named references
        action_lines = action_by_scene.get(scene_idx, [])
        terms = _get_name_search_terms(char)
        named_desc, named_score = "", 0
        for line in action_lines:
            ll = line.lower()
            for term, weight in terms:
                if term.lower() in ll:
                    s = weight + sum(2 for pk in _PHYSICAL_KEYWORDS if pk in ll)
                    if s > named_score:
                        named_score = s
                        named_desc = line
                    break

        if intro_desc and intro_score >= 3:
            char.description = intro_desc
        elif named_desc and named_score >= 3:
            char.description = named_desc
        elif intro_desc:
            char.description = intro_desc
        elif named_desc:
            char.description = named_desc

        if char.description:
            _extract_physical_details(char, char.description)


def _get_preceding_actions(char_name, events):
    first_cue_idx = None
    for i, (t, d) in enumerate(events):
        if t == "cue" and d == char_name:
            first_cue_idx = i
            break
    if first_cue_idx is None:
        return []
    actions = []
    for i in range(first_cue_idx - 1, -1, -1):
        if events[i][0] == "cue":
            break
        elif events[i][0] == "action":
            actions.append(events[i][1])
    actions.reverse()
    return actions


def _score_intro_line(line):
    ll = line.lower()
    score = 0
    for pat in [
        r'\b(a|an)\s+\w+.*?\b(enters|walks|sits|stands|appears|steps|comes|arrives)',
        r'\b(a|an)\s+\w+.*(year.?old|girl|boy|man|woman|crow|creature|figure)',
        r'\b(a|an)\s+([\w\s]+)(with|wearing|dressed|in\s+a)',
    ]:
        if re.search(pat, ll):
            score += 3
    score += sum(1 for pk in _PHYSICAL_KEYWORDS if pk in ll)
    return score


def _get_name_search_terms(char):
    terms = [(char.name, 3)]
    parts = char.name.split()
    if len(parts) > 1:
        terms.append((parts[0], 2))
        terms.append((parts[-1], 1))
    else:
        terms.append((char.name, 2))
    return terms


def _extract_physical_details(char, description):
    dl = description.lower()
    m = re.search(
        r'([\w\s]+(?:curly|straight|long|short|dark|red|blonde|black|white|grey|gray|wild|braided|wavy)\s+hair'
        r'|hair\s+(?:is|was)\s+[\w\s,]+)', dl)
    if m:
        char.hair = m.group(0).strip()
    if not char.hair:
        m2 = re.search(r'((?:\w+\s+){0,3}hair)', dl)
        if m2 and any(w in m2.group(0) for w in
                       ['curly', 'straight', 'long', 'short', 'dark', 'red',
                        'blonde', 'black', 'wild', 'braided', 'wavy', 'white']):
            char.hair = m2.group(0).strip()


# =============================================================================
# Prop extraction — Whitelist approach
# =============================================================================

# Curated whitelist of concrete nouns that are plausible screenplay props.
# Organized by category. ~700 words covering all major genres.
_PROP_WHITELIST: set[str] = {
    # ── Weapons / combat ──
    'sword', 'swords', 'knife', 'knives', 'gun', 'guns', 'pistol', 'rifle',
    'shotgun', 'revolver', 'dagger', 'axe', 'bow', 'arrow', 'arrows',
    'spear', 'shield', 'grenade', 'bomb', 'blade', 'machete', 'whip',
    'club', 'mace', 'crossbow', 'cannon', 'dynamite', 'holster', 'sheath',
    'slingshot', 'musket', 'bayonet', 'missile', 'torpedo', 'warhead',
    'flamethrower', 'taser', 'baton', 'truncheon', 'katana', 'rapier',
    'halberd', 'lance', 'javelin', 'blowgun', 'mortar', 'mine', 'claymore',
    'scimitar', 'saber', 'sabre', 'staff', 'quarterstaff',
    'laser', 'blaster', 'phaser', 'raygun',  # sci-fi weapons
    'armor', 'armour', 'gauntlet', 'gauntlets', 'quiver',

    # ── Tools / instruments ──
    'hammer', 'wrench', 'screwdriver', 'saw', 'drill', 'pliers',
    'shovel', 'rake', 'pickaxe', 'crowbar', 'lever', 'pulley',
    'scissors', 'tweezers', 'clamp', 'chisel', 'vise', 'tongs',
    'telescope', 'microscope', 'compass', 'binoculars', 'magnifier',
    'stethoscope', 'thermometer', 'syringe', 'scalpel', 'eyedropper',
    'spyglass', 'magnifying', 'ruler', 'protractor', 'level',
    'plunger', 'wrench', 'hacksaw', 'file', 'rasp', 'awl',
    'trowel', 'hoe', 'sickle', 'scythe', 'shears', 'pruner',
    'soldering', 'multimeter', 'voltmeter', 'caliper',
    'stopwatch', 'metronome', 'tuner',

    # ── Technology / electronics ──
    'phone', 'cellphone', 'smartphone', 'laptop', 'computer', 'tablet',
    'radio', 'camera', 'television', 'monitor', 'headphones', 'earbuds', 'headset', 'microphone', 'speaker', 'recorder',
    'flashlight', 'lantern', 'torch', 'lamp', 'lightbulb', 'spotlight',
    'battery', 'batteries', 'cable', 'cables', 'keyboard', 'remote',
    'projector', 'printer', 'terminal', 'machine', 'generator',
    'antenna', 'satellite', 'drone', 'scanner', 'copier', 'shredder',
    'calculator', 'pager', 'fax', 'intercom', 'walkie-talkie',
    'megaphone', 'bullhorn', 'amplifier', 'turntable',
    'console', 'panel', 'joystick', 'throttle', 'controller',
    'communicator', 'transmitter', 'receiver', 'transponder',
    'hard drive', 'usb', 'disc', 'disk', 'floppy', 'cassette', 'cd',
    'videotape', 'projector', 'webcam', 'gopro',
    'detonator', 'timer', 'sensor', 'detector', 'radar', 'sonar',

    # ── Containers / vessels ──
    'bag', 'backpack', 'suitcase', 'briefcase', 'purse', 'wallet',
    'box', 'crate', 'chest', 'trunk', 'barrel', 'basket', 'bucket',
    'jar', 'bottle', 'flask', 'vial', 'canteen', 'thermos', 'jug',
    'cup', 'mug', 'goblet', 'chalice', 'tankard', 'tumbler', 'glass',
    'bowl', 'plate', 'tray', 'platter', 'pot', 'pan', 'skillet',
    'kettle', 'cauldron', 'urn', 'pitcher', 'carafe', 'decanter',
    'envelope', 'package', 'parcel', 'pouch', 'sack', 'hamper',
    'toolbox', 'lunchbox', 'cooler', 'thermos', 'canister', 'tin',
    'duffel', 'rucksack', 'knapsack', 'satchel', 'messenger',
    'holster', 'sheath', 'saucer', 'tureen', 'gravy', 'teapot', 'coffeepot',

    # ── Furniture / fixtures ──
    'chair', 'stool', 'bench', 'sofa', 'couch', 'recliner', 'throne',
    'desk', 'table', 'shelf', 'cabinet', 'dresser', 'wardrobe', 'bookcase',
    'bed', 'crib', 'hammock', 'mattress', 'pillow', 'cushion',
    'mirror', 'clock', 'watch', 'hourglass', 'chandelier',
    'easel', 'podium', 'lectern', 'altar', 'pulpit',
    'cradle', 'bassinet', 'futon', 'ottoman', 'loveseat',
    'nightstand', 'hutch', 'armoire', 'credenza', 'sideboard',
    'mantle', 'mantelpiece', 'fireplace', 'hearth',

    # ── Documents / writing / office ──
    'letter', 'note', 'map', 'chart', 'charts', 'blueprint',
    'book', 'books', 'journal', 'diary', 'newspaper', 'magazine',
    'scroll', 'scrolls', 'parchment', 'manuscript', 'document',
    'postcard', 'telegram', 'telegraph', 'passport', 'ticket', 'receipt',
    'photograph', 'photo', 'poster', 'sign', 'banner', 'flag', 'pennant',
    'pen', 'pencil', 'quill', 'typewriter', 'notebook', 'notepad',
    'folder', 'portfolio', 'binder', 'clipboard', 'ledger', 'invoice',
    'manual', 'encyclopedia', 'encyclopedias', 'atlas', 'almanac',
    'brochure', 'pamphlet', 'flyer', 'leaflet', 'warrant', 'subpoena',
    'contract', 'deed', 'certificate', 'diploma', 'license', 'permit',
    'stapler', 'paperclip', 'thumbtack', 'pushpin',
    'whiteboard', 'blackboard', 'chalkboard', 'marker', 'eraser',
    'chalk', 'crayon', 'ink', 'inkwell',
    'evidence', 'dossier', 'report', 'file', 'files',
    'bible', 'scripture', 'grimoire', 'tome', 'codex',

    # ── Clothing / accessories ──
    'hat', 'cap', 'helmet', 'crown', 'tiara', 'mask', 'veil',
    'gloves', 'glove', 'scarf', 'shawl', 'cloak', 'cape', 'robe',
    'jacket', 'coat', 'vest', 'suit', 'dress', 'gown', 'tunic',
    'boots', 'boot', 'shoes', 'shoe', 'sandals', 'slippers', 'sneakers',
    'belt', 'buckle', 'brooch', 'badge', 'medal', 'ribbon', 'sash',
    'necklace', 'bracelet', 'ring', 'earring', 'pendant', 'amulet',
    'locket', 'choker', 'anklet', 'cufflinks', 'tieclip', 'tiepin',
    'glasses', 'sunglasses', 'goggles', 'monocle', 'visor',
    'jersey', 'jumpsuit', 'apron', 'uniform', 'toga', 'kimono',
    'hoodie', 'sweater', 'cardigan', 'parka', 'poncho', 'raincoat',
    'tuxedo', 'blazer', 'overalls', 'coveralls', 'wetsuit',
    'corset', 'bodice', 'petticoat', 'bonnet', 'headband', 'bandana',
    'blindfold', 'gag', 'muzzle',
    'backpack', 'headphones', 'wristwatch',
    'spurs', 'chaps',  # western

    # ── Food / drink ──
    'bread', 'sandwich', 'pizza', 'cake', 'pie', 'cookie', 'pastry',
    'apple', 'fruit', 'banana', 'orange', 'grape', 'grapes',
    'meat', 'steak', 'chicken', 'fish', 'burger', 'hotdog',
    'cheese', 'egg', 'eggs', 'bacon', 'sausage', 'ham',
    'rice', 'pasta', 'noodles', 'tortilla', 'taco', 'burrito',
    'wine', 'beer', 'whiskey', 'bourbon', 'vodka', 'rum', 'gin',
    'champagne', 'cocktail', 'martini', 'tequila', 'brandy', 'scotch',
    'coffee', 'tea', 'juice', 'milk', 'soda', 'lemonade', 'cider',
    'candy', 'chocolate', 'cereal', 'soup', 'stew', 'curry',
    'carrot', 'peanuts', 'peanut', 'pickle', 'pickles', 'snack', 'snacks',
    'donut', 'doughnut', 'muffin', 'croissant', 'bagel', 'waffle',
    'popcorn', 'pretzel', 'cracker', 'chips', 'fries', 'nachos',
    'ice', 'icecream',

    # ── Kitchen / cooking ──
    'fork', 'spoon', 'chopsticks', 'ladle', 'spatula', 'whisk',
    'blender', 'mixer', 'oven', 'stove', 'microwave', 'toaster',
    'fridge', 'refrigerator', 'freezer', 'dishwasher',
    'sink', 'faucet', 'tablecloth', 'placemat', 'coaster', 'trivet',
    'apron', 'oven mitt',
    'corkscrew', 'bottle opener', 'can opener', 'grater', 'peeler',
    'cutting board', 'rolling pin', 'colander', 'strainer', 'sieve',

    # ── Vehicles / transport ──
    'car', 'truck', 'van', 'bus', 'taxi', 'cab', 'ambulance', 'suv',
    'motorcycle', 'bicycle', 'bike', 'scooter', 'skateboard', 'moped',
    'boat', 'ship', 'canoe', 'kayak', 'yacht', 'raft', 'trawler',
    'dinghy', 'gondola', 'ferry', 'barge', 'tugboat', 'lifeboat',
    'airplane', 'plane', 'helicopter', 'jet', 'glider', 'biplane',
    'carriage', 'wagon', 'cart', 'sled', 'sleigh', 'chariot', 'rickshaw',
    'train', 'locomotive', 'trolley', 'tram', 'streetcar', 'monorail',
    'submarine', 'rocket', 'spacecraft', 'shuttle', 'capsule', 'pod',
    'cadillac', 'flyer', 'limousine', 'limo', 'hearse', 'convertible',
    'jeep', 'humvee', 'tank', 'apc',
    'horse', 'stallion', 'mare', 'pony', 'donkey', 'mule', 'camel',
    'saddle', 'bridle', 'reins', 'stirrup', 'horseshoe',

    # ── Maritime / nautical ──
    'anchor', 'sail', 'sails', 'mast', 'oar', 'oars', 'paddle',
    'rudder', 'helm', 'tiller', 'compass', 'sextant',
    'buoy', 'lifejacket', 'life ring',
    'harpoon', 'net', 'nets', 'fishhook', 'tackle', 'reel', 'rod',

    # ── Musical instruments ──
    'guitar', 'piano', 'violin', 'fiddle', 'drum', 'drums', 'trumpet',
    'flute', 'harp', 'harmonica', 'accordion', 'banjo', 'cello',
    'saxophone', 'clarinet', 'trombone', 'organ', 'ukulele', 'mandolin',
    'tambourine', 'cymbal', 'xylophone', 'maracas', 'triangle',
    'bagpipes', 'sitar', 'lute', 'lyre', 'dulcimer', 'oboe', 'bassoon',
    'tuba', 'bugle', 'cornet', 'piccolo', 'recorder',
    'synthesizer', 'theremin', 'turntable',
    'record', 'vinyl', 'cassette', 'cd', 'tape',  # music media

    # ── Keys / locks / restraints ──
    'key', 'keys', 'keycard', 'keychain', 'lock', 'padlock',
    'chain', 'chains', 'shackles', 'manacles',
    'handcuffs', 'cuffs', 'zip ties',
    'rope', 'wire', 'cord', 'twine', 'string', 'cable',
    'leash', 'lasso', 'noose', 'snare', 'trap',

    # ── Household / domestic ──
    'candle', 'candles', 'candlestick', 'candelabra',
    'match', 'matches', 'lighter', 'flare',
    'broom', 'mop', 'dustpan', 'vacuum', 'duster',
    'towel', 'blanket', 'sheet', 'sheets', 'quilt', 'comforter',
    'curtain', 'curtains', 'drapes', 'blinds',
    'rug', 'carpet', 'mat', 'doormat',
    'vase', 'painting', 'sculpture', 'statue', 'figurine', 'trophy',
    'toy', 'toys', 'doll', 'puppet', 'teddy', 'action figure',
    'umbrella', 'parasol', 'cane', 'walking stick',
    'crutch', 'crutches', 'walker', 'wheelchair',
    'needle', 'thread', 'tape', 'glue', 'velcro',
    'soap', 'toothbrush', 'comb', 'brush', 'razor', 'shaver',
    'ironing board', 'hanger', 'clothespin',
    'bucket', 'pail', 'watering can', 'sprinkler',
    'picture frame',
    'doorbell', 'knocker', 'peephole',
    'thermostat', 'smoke detector',

    # ── Sports / recreation ──
    'ball', 'bat', 'racket', 'racquet', 'paddle',
    'puck', 'shuttlecock', 'frisbee', 'boomerang',
    'goal', 'net', 'hoop',
    'trophy', 'medal', 'cup', 'pennant',
    'whistle', 'stopwatch', 'scoreboard',
    'skateboard', 'surfboard', 'snowboard', 'skis', 'sled',
    'barbell', 'dumbbell', 'weight', 'weights',
    'kite', 'puzzle', 'chess', 'checkers', 'marbles', 'dominos',
    'dice', 'cards', 'poker',
    'fishing rod', 'reel', 'tackle',
    'tent', 'sleeping bag', 'campfire', 'firewood',

    # ── Magical / fantasy / sci-fi ──
    'wand', 'crystal', 'orb', 'globe', 'medallion', 'talisman',
    'potion', 'elixir', 'antidote', 'venom', 'serum',
    'rune', 'runes', 'sigil', 'glyph',
    'artifact', 'relic', 'idol', 'totem', 'fetish',
    'scepter', 'sceptre', 'trident', 'pitchfork',
    'grimoire', 'spellbook',
    'barometer', 'astrolabe', 'sundial', 'compass',
    'portal', 'beacon', 'probe', 'hologram',
    'reactor', 'capacitor', 'conduit',
    'cryotube', 'stasis',

    # ── Containers / structural props ──
    'coffin', 'casket', 'cage', 'vault', 'safe', 'locker', 'mailbox',
    'crib', 'cradle', 'terrarium', 'aquarium', 'fishbowl',
    'cabinet', 'hutch', 'pantry', 'cellar',
    'dumpster', 'bin', 'trash can',

    # ── Money / valuables ──
    'coin', 'coins', 'bill', 'bills', 'cash', 'check', 'cheque',
    'card', 'creditcard', 'token', 'chip',
    'diamond', 'ruby', 'emerald', 'sapphire', 'pearl', 'gem', 'gems',
    'jewel', 'jewels', 'jewelry', 'jewellery',
    'gold', 'silver', 'platinum', 'treasure',
    'ingot', 'bullion', 'nugget',

    # ── Nature (as handled props) ──
    'plant', 'flower', 'flowers', 'bouquet', 'wreath', 'garland',
    'leaf', 'leaves', 'branch', 'log', 'firewood', 'stick', 'twig',
    'feather', 'feathers', 'shell', 'shells',
    'bone', 'bones', 'skull', 'fossil', 'antler', 'antlers', 'horn',
    'seed', 'seeds', 'acorn', 'pinecone',
    'rock', 'stone', 'pebble', 'boulder', 'crystal',
    'vine', 'vines', 'root', 'roots', 'moss', 'mushroom', 'fungus',
    'cobweb', 'web', 'cocoon', 'nest', 'hive',
    'egg', 'eggs', 'fur', 'pelt', 'hide', 'leather',

    # ── Medical / scientific ──
    'bandage', 'gauze', 'splint', 'tourniquet', 'wheelchair', 'stretcher', 'gurney', 'crutch', 'crutches',
    'pill', 'pills', 'capsule', 'tablet', 'medicine', 'prescription',
    'inhaler', 'oxygen', 'mask', 'ventilator', 'defibrillator',
    'iv', 'drip', 'catheter', 'tubing',
    'forceps', 'clamp', 'retractor',
    'microscope', 'petri', 'beaker', 'flask', 'test tube', 'pipette',
    'centrifuge', 'spectrometer', 'oscilloscope',

    # ── Art / craft ──
    'canvas', 'paintbrush', 'palette', 'charcoal', 'pastel',
    'clay', 'pottery', 'ceramic', 'kiln', 'loom', 'spindle',
    'sketch', 'sketchbook', 'mat', 'easel', 'tripod',

    # ── Religious / ceremonial ──
    'cross', 'crucifix', 'rosary', 'prayer beads',
    'incense', 'censer', 'thurible',
    'bible', 'quran', 'torah', 'prayer book',
    'holy water', 'communion', 'chalice', 'goblet',
    'altar', 'shrine', 'icon', 'reliquary',
    'wreath', 'garland', 'laurel',

    # ── Construction / hardware ──
    'ladder', 'scaffolding', 'crane', 'wheelbarrow',
    'brick', 'bricks', 'cement', 'mortar', 'plaster',
    'nail', 'nails', 'screw', 'screws', 'bolt', 'bolts',
    'hinge', 'latch', 'doorknob', 'handle',
    'pipe', 'pipes', 'valve', 'gauge', 'meter',
    'fuse', 'fuses', 'circuit', 'breaker',
    'jack', 'winch', 'pulley', 'crane', 'hoist',
    'saw', 'circular saw', 'chainsaw', 'jackhammer',
    'sandpaper', 'putty', 'caulk', 'sealant',
    'tarp', 'tarpaulin',

    # ── Automotive ──
    'tire', 'tires', 'wheel', 'wheels', 'hubcap',
    'engine', 'motor', 'hood', 'bonnet', 'bumper', 'fender',
    'windshield', 'headlight', 'headlights', 'taillight',
    'steering wheel', 'dashboard', 'gearshift', 'clutch', 'brake',
    'seatbelt', 'airbag', 'horn',
    'gas can', 'jerrycan', 'jumper cables',
    'license plate', 'rearview', 'mirror',

    # ── Smoking / vice ──
    'cigarette', 'cigarettes', 'cigar', 'cigars', 'pipe', 'ashtray',
    'lighter', 'matches', 'zippo', 'vape',

    # ── Textile / soft goods ──
    'handkerchief', 'tissue', 'napkin', 'rag',
    'bandanna', 'flag', 'pennant', 'tapestry',
    'net', 'mesh', 'gauze', 'lace', 'silk', 'velvet',

    # ── Signals / alarms / indicators ──
    'whistle', 'bell', 'gong', 'chime', 'siren', 'alarm', 'buzzer',
    'flare', 'beacon', 'flasher',
    'semaphore', 'morse',

    # ── Switches / controls / mechanical ──
    'lever', 'button', 'switch', 'dial', 'knob', 'crank', 'handle',
    'pedal', 'trigger', 'latch', 'valve', 'pulley', 'piston', 'flywheel', 'turbine', 'rotor', 'propeller',

    # ── Miscellaneous screenplay props ──
    'balloon', 'balloons', 'confetti', 'streamer', 'streamers',
    'fireworks', 'sparkler', 'sparklers',
    'binoculars', 'periscope', 'kaleidoscope',
    'seal', 'stamp', 'wax',
    'locket', 'compass', 'pocket watch',
    'dog tag', 'id', 'lanyard',
    'megaphone', 'gavel', 'scales',
    'hourglass', 'sundial', 'metronome',
    'mannequin', 'scarecrow', 'dummy',
    'stretcher', 'parachute', 'harness',
    'walkie-talkie', 'radio', 'antenna',
    'perimeter', 'barricade', 'barrier',
    'sandbag', 'sandbags',
}

_INTERACTION_VERBS = {
    'holds', 'holding', 'grabs', 'grabbing', 'picks', 'picking',
    'puts', 'putting', 'drops', 'dropping', 'carries', 'carrying',
    'wields', 'wielding', 'opens', 'opening', 'closes', 'closing',
    'uses', 'using', 'fills', 'filling', 'pours', 'pouring',
    'watering', 'leaking', 'takes', 'taking', 'pulls', 'pushing',
    'swings', 'throws', 'tosses', 'catches', 'slides', 'rolls',
    'reads', 'writes', 'signs', 'packs', 'unpacks', 'unwraps',
    'loads', 'fires', 'aims', 'drinks', 'eats', 'sips',
    'wears', 'wearing', 'removes', 'straps', 'buckles',
    'lights', 'extinguishes', 'ignites', 'smashes', 'breaks',
}


def _extract_props(action_text, char_lookup):
    """Extract props using whitelist-based noun matching."""
    candidates: dict[str, dict] = {}

    char_names_lower = set()
    for c in char_lookup.values():
        char_names_lower.add(c.name.lower())
        for part in c.name.lower().split():
            char_names_lower.add(part)

    for scene_idx, line in action_text:
        line_lower = line.lower()
        words = re.findall(r'[a-z]+(?:-[a-z]+)*', line_lower)

        for i, word in enumerate(words):
            if word not in _PROP_WHITELIST:
                continue
            if word in char_names_lower:
                continue

            # Look for determiner within 3 words back
            determiner = None
            for j in range(max(0, i - 3), i):
                if words[j] in ('a', 'an', 'the', 'her', 'his', 'my', 'their', 'its'):
                    determiner = words[j]
                    break

            has_interaction = any(v in words for v in _INTERACTION_VERBS)
            prop_key = word

            if prop_key not in candidates:
                candidates[prop_key] = {
                    "name": word.capitalize(),
                    "first_scene": scene_idx,
                    "contexts": [line],
                    "mention_count": 1,
                    "has_interaction": has_interaction,
                    "determiners": [determiner] if determiner else [],
                }
            else:
                candidates[prop_key]["mention_count"] += 1
                if line not in candidates[prop_key]["contexts"]:
                    candidates[prop_key]["contexts"].append(line)
                if has_interaction:
                    candidates[prop_key]["has_interaction"] = True
                if determiner and determiner not in candidates[prop_key]["determiners"]:
                    candidates[prop_key]["determiners"].append(determiner)

    props = []
    for key, info in candidates.items():
        confidence = _score_prop_confidence(info)
        props.append(FountainProp(
            name=info["name"], confidence=confidence,
            context=info["contexts"][0], first_scene=info["first_scene"],
            mention_count=info["mention_count"],
        ))

    confidence_order = {"high": 0, "medium": 1, "low": 2}
    props.sort(key=lambda p: (confidence_order.get(p.confidence, 3), -p.mention_count))
    return props


def _score_prop_confidence(info):
    mentions = info["mention_count"]
    has_interaction = info["has_interaction"]
    has_the = "the" in info.get("determiners", [])

    if mentions >= 3:
        return "high"
    elif mentions >= 2 and has_interaction:
        return "high"
    elif mentions >= 2:
        return "medium"
    elif has_interaction and has_the:
        return "high"
    elif has_interaction:
        return "medium"
    elif has_the:
        return "medium"
    else:
        return "low"


# =============================================================================
# Debug / inspection utility
# =============================================================================

def summarize(data: FountainData) -> str:
    """Return a human-readable summary of parsed data."""
    lines = []
    lines.append(f"=== Fountain Parse Results ===")
    if data.title:
        lines.append(f"Title: {data.title}")
    if data.author:
        lines.append(f"Author: {data.author}")

    lines.append(f"\n--- Locations ({len(data.locations)}) ---")
    for loc in data.locations:
        lines.append(f"  * {loc.name}")
        for h in loc.raw_headings:
            lines.append(f"      -> {h}")

    lines.append(f"\n--- Characters ({len(data.characters)}) ---")
    for char in data.characters:
        desc = f' -- "{char.description[:80]}..."' if char.description else ""
        lines.append(f"  * {char.name}{desc}")
        if char.hair:
            lines.append(f"      Hair: {char.hair}")
        lines.append(f"      Scenes: {[s+1 for s in char.scenes]}")

    lines.append(f"\n--- Scenes ({len(data.scenes)}) ---")
    for scene in data.scenes:
        tod = f" [{scene.time_of_day}]" if scene.time_of_day else ""
        lines.append(f"  Scene {scene.scene_number}: {scene.name}{tod}")
        lines.append(f"      Location: {scene.location_name} ({scene.int_ext})")
        if scene.characters:
            chars_str = ', '.join(
                f"{c.name}" + (f" ({'; '.join(c.parentheticals)})" if c.parentheticals else "")
                for c in scene.characters
            )
            lines.append(f"      Characters: {chars_str}")
        if scene.summary:
            preview = scene.summary[:120] + "..." if len(scene.summary) > 120 else scene.summary
            lines.append(f"      Summary: {preview}")

    lines.append(f"\n--- Props ({len(data.props)}) ---")
    for prop in data.props:
        lines.append(f"  * {prop.name} [{prop.confidence}] (x{prop.mention_count}, scene {prop.first_scene + 1})")
        ctx = prop.context[:100] + "..." if len(prop.context) > 100 else prop.context
        lines.append(f"      Context: {ctx}")

    return '\n'.join(lines)
