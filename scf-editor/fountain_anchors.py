"""
Fountain Anchor Utilities
==========================
Handles SCF anchor tags — lightweight identity markers embedded in .fountain
files using Fountain's native note syntax [[...]].

Anchor format: [[scf:<type>:<id>]] where type is scene, char, loc, or prop.
"""

import re
from fountain_parser import (
    _match_scene_heading, _is_character_cue, _CHAR_EXTENSION_RE
)

# Matches any SCF anchor tag: [[scf:type:id]]
_SCF_ANCHOR_RE = re.compile(r'\[\[scf:(\w+):(\d+)\]\]')


def strip_anchors(text: str) -> str:
    """Remove all [[scf:...]] tags from text. Preserves other [[...]] notes."""
    result = _SCF_ANCHOR_RE.sub('', text)
    # Clean up double-spaces left behind
    result = re.sub(r'  +', ' ', result)
    # Clean up trailing spaces on lines
    result = re.sub(r' +$', '', result, flags=re.MULTILINE)
    return result


def strip_anchor_from_line(line: str, anchor_type: str = None) -> str:
    """Strip SCF anchors from a single line.
    If anchor_type specified (e.g. 'scene', 'char'), only strip that type."""
    if anchor_type:
        pattern = re.compile(r'\s*\[\[scf:' + re.escape(anchor_type) + r':\d+\]\]')
    else:
        pattern = re.compile(r'\s*\[\[scf:\w+:\d+\]\]')
    result = pattern.sub('', line)
    return result


def get_heading_without_anchors(line: str) -> str:
    """Return scene heading text with all [[scf:...]] tags removed."""
    return strip_anchor_from_line(line).strip()


def read_anchors(text: str) -> dict:
    """Parse all SCF anchors from text and return their positions.

    Returns dict with keys 'scenes', 'characters', 'locations', 'props',
    each a list of (line_number, entity_id) tuples (0-based line numbers).
    """
    result = {
        "scenes": [],
        "characters": [],
        "locations": [],
        "props": [],
    }
    type_map = {
        "scene": "scenes",
        "char": "characters",
        "loc": "locations",
        "prop": "props",
    }
    for line_num, line in enumerate(text.splitlines()):
        for m in _SCF_ANCHOR_RE.finditer(line):
            anchor_type = m.group(1)
            entity_id = int(m.group(2))
            key = type_map.get(anchor_type)
            if key:
                result[key].append((line_num, entity_id))
    return result


def inject_single_anchor(text: str, line_index: int, anchor_tag: str) -> str:
    """Inject a single anchor tag at the end of a specific line (0-based index).
    Returns text unchanged if anchor already exists on that line."""
    lines = text.splitlines(True)  # preserve line endings
    if line_index < 0 or line_index >= len(lines):
        return text
    line = lines[line_index]
    if anchor_tag in line:
        return text
    # Strip trailing newline, append anchor, restore newline
    stripped = line.rstrip('\n\r')
    ending = line[len(stripped):]
    lines[line_index] = f"{stripped} {anchor_tag}{ending}"
    return ''.join(lines)


def inject_anchors(fountain_text: str, scene_map: dict,
                   character_map: dict, location_map: dict) -> str:
    """Inject SCF anchor tags into fountain text.

    Args:
        fountain_text: full fountain screenplay text
        scene_map: {heading_lower: [{"id": N, "order": M}, ...]} —
                   lists sorted by order, matched by occurrence in document
        character_map: {UPPERCASE_NAME: character_entity_id}
        location_map: {normalized_loc_lower: location_entity_id}

    Returns the text with anchors injected.
    """
    lines = fountain_text.splitlines()
    result = []

    # Track heading occurrence counters for scene_map ordering
    heading_counters = {}  # heading_lower → next index into scene_map list
    # Track which characters have been anchored in the current scene
    chars_anchored_this_scene = set()

    prev_blank = True  # treat start of file as after a blank line

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Check for scene heading (on the stripped-then-anchor-stripped version)
        clean_line = strip_anchor_from_line(stripped)
        heading_match = _match_scene_heading(clean_line) if clean_line else None

        if heading_match:
            # New scene — reset per-scene character tracking
            chars_anchored_this_scene = set()

            # Determine heading key for scene_map lookup
            heading_lower = clean_line.strip().lower()

            # Get occurrence index for this heading
            occ_idx = heading_counters.get(heading_lower, 0)
            heading_counters[heading_lower] = occ_idx + 1

            # Build the anchored line
            working = stripped

            # Strip existing SCF anchors to rebuild cleanly
            working = strip_anchor_from_line(working)

            # Location anchor — extract normalized location name from heading
            # heading_match returns (int_ext, location_part, time_of_day)
            _, loc_part, _ = heading_match
            loc_key = loc_part.strip().lower()
            if loc_key in location_map:
                loc_id = location_map[loc_key]
                loc_anchor = f"[[scf:loc:{loc_id}]]"
                working = f"{working} {loc_anchor}"

            # Scene anchor
            entries = scene_map.get(heading_lower)
            if entries and occ_idx < len(entries):
                scene_id = entries[occ_idx]["id"]
                scene_anchor = f"[[scf:scene:{scene_id}]]"
                working = f"{working} {scene_anchor}"

            # Preserve original indentation
            leading = line[:len(line) - len(line.lstrip())]
            result.append(f"{leading}{working}")
            prev_blank = False
            continue

        # Check for character cue (must follow a blank line)
        if prev_blank and stripped and _is_character_cue(clean_line):
            # Extract the character name (strip extensions like (V.O.), (O.S.))
            char_name = _CHAR_EXTENSION_RE.sub('', clean_line).strip()
            # Clean internal parentheticals too
            if '(' in char_name:
                char_name = re.sub(r'\([^)]*\)', '', char_name).strip()
                char_name = re.sub(r'\s{2,}', ' ', char_name)

            char_upper = char_name.upper()

            if (char_upper in character_map
                    and char_upper not in chars_anchored_this_scene
                    and f"[[scf:char:" not in stripped):
                char_id = character_map[char_upper]
                char_anchor = f"[[scf:char:{char_id}]]"
                # Strip existing char anchors and re-add
                working = strip_anchor_from_line(stripped, "char")
                leading = line[:len(line) - len(line.lstrip())]
                result.append(f"{leading}{working} {char_anchor}")
                chars_anchored_this_scene.add(char_upper)
                prev_blank = False
                continue

        result.append(line)
        prev_blank = (stripped == '')

    return '\n'.join(result)
