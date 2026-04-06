"""
Fountain Sync Engine for SCF
==============================
Save-triggered sync that keeps the SCF database synchronized with the
screenplay.  Parses the fountain file, compares against the database and
mapping tables, creates/updates entities as needed, rebuilds scene-character
junctions, injects anchors for new entities, and returns a report.

Uses a single database connection and transaction — commit once at the end.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import database as db
from entity_registry import get_entity
from fountain_parser import parse as fountain_parse, FountainData
import fountain_anchors

# Strip SCF anchor tags from entity names
_SCF_ANCHOR_RE = re.compile(r'\[\[scf:\w+:\d+\]\]')

def _strip_anchors(text: str) -> str:
    """Remove [[scf:...]] tags and clean up whitespace."""
    return re.sub(r'\s{2,}', ' ', _SCF_ANCHOR_RE.sub('', text)).strip()


# =============================================================================
# Sync report
# =============================================================================

@dataclass
class SyncReport:
    scenes_created: int = 0
    scenes_updated: int = 0
    scenes_removed: int = 0        # marked in_screenplay=false, NOT deleted
    characters_created: int = 0
    characters_mapped: int = 0     # existing character linked via new mapping
    locations_created: int = 0
    locations_mapped: int = 0
    props_created: int = 0
    junctions_rebuilt: int = 0     # scene_character records created
    new_anchors_injected: int = 0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "scenes_created": self.scenes_created,
            "scenes_updated": self.scenes_updated,
            "scenes_removed": self.scenes_removed,
            "characters_created": self.characters_created,
            "characters_mapped": self.characters_mapped,
            "locations_created": self.locations_created,
            "locations_mapped": self.locations_mapped,
            "props_created": self.props_created,
            "junctions_rebuilt": self.junctions_rebuilt,
            "new_anchors_injected": self.new_anchors_injected,
            "errors": self.errors,
        }


# =============================================================================
# Helpers
# =============================================================================

def _insert_entity(conn, entity_type: str, data: dict) -> int:
    """Insert an entity row using a shared connection. Returns new row id."""
    entity_def = get_entity(entity_type)
    valid_fields = {f.name for f in entity_def.fields}
    filtered = {k: v for k, v in data.items()
                if k in valid_fields and v is not None and v != ""}
    if not filtered:
        return -1
    cols = ", ".join(filtered.keys())
    placeholders = ", ".join(["?"] * len(filtered))
    values = list(filtered.values())
    cursor = conn.execute(
        f"INSERT INTO {entity_type} ({cols}) VALUES ({placeholders})", values
    )
    return cursor.lastrowid


def _update_entity_fields(conn, entity_type: str, entity_id: int,
                          fields: dict) -> None:
    """Update specific fields on an entity row (targeted, not full overwrite)."""
    entity_def = get_entity(entity_type)
    valid_fields = {f.name for f in entity_def.fields}
    filtered = {k: v for k, v in fields.items()
                if k in valid_fields and v is not None}
    if not filtered:
        return
    set_clause = ", ".join(f"{k} = ?" for k in filtered.keys())
    values = list(filtered.values()) + [entity_id]
    conn.execute(
        f"UPDATE {entity_type} SET {set_clause} WHERE id = ?", values
    )


# =============================================================================
# Main sync function
# =============================================================================

def sync(db_path: Path, fountain_path: Path) -> SyncReport:
    """
    Parse the fountain file and sync entities into the SCF database.

    All reads and writes use one connection. Commit once at the end.
    If anything fails, the transaction rolls back and no partial state is written.
    """
    report = SyncReport()

    # 1. Read and parse the fountain file
    fountain_text = fountain_path.read_text(encoding="utf-8")
    parsed = fountain_parse(fountain_text)
    existing_anchors = fountain_anchors.read_anchors(fountain_text)

    # 2. Open a single database connection
    conn = db.get_connection(db_path)
    try:
        # 3. Load existing mapping tables into memory
        existing_scene_maps = {}   # scene_id -> row dict
        for row in conn.execute("SELECT * FROM screenplay_scene_map").fetchall():
            existing_scene_maps[row["scene_id"]] = dict(row)

        existing_char_maps = {}    # text_name.upper() -> row dict
        for row in conn.execute("SELECT * FROM screenplay_character_map").fetchall():
            existing_char_maps[row["text_name"].upper()] = dict(row)

        existing_loc_maps = {}     # text_name.lower() -> row dict
        for row in conn.execute("SELECT * FROM screenplay_location_map").fetchall():
            existing_loc_maps[row["text_name"].lower()] = dict(row)

        # Load existing entity names for matching
        all_characters = {}  # name.lower() -> id
        for row in conn.execute("SELECT id, name FROM character").fetchall():
            all_characters[row["name"].lower()] = row["id"]

        all_locations = {}   # name.lower() -> id
        for row in conn.execute("SELECT id, name FROM location").fetchall():
            all_locations[row["name"].lower()] = row["id"]

        # Build reverse lookups: scene_id -> scene_map row
        scene_map_by_heading = {}  # heading_text.lower() -> [rows]
        for row_dict in existing_scene_maps.values():
            key = row_dict["heading_text"].lower() if row_dict["heading_text"] else ""
            scene_map_by_heading.setdefault(key, []).append(row_dict)

        # Build scene anchor lookup: line_number -> scene_id
        scene_anchors_by_line = {}
        for line_num, entity_id in existing_anchors["scenes"]:
            scene_anchors_by_line[line_num] = entity_id

        # Queue for anchor injections: list of (line_index, anchor_tag)
        anchor_queue = []

        # Track which scene_ids we encounter in this sync pass
        seen_scene_ids = set()

        # ═════════════════════════════════════════════════════════════════
        # 4. Process SCENES
        # ═════════════════════════════════════════════════════════════════

        # We need to find the line number for each parsed scene so we can
        # check for anchors. Build a mapping from scene index to line number
        # by re-scanning the fountain text for scene headings.
        fountain_lines = fountain_text.splitlines()
        scene_heading_lines = []  # list of (line_index, clean_heading)
        from fountain_parser import _match_scene_heading
        for i, line in enumerate(fountain_lines):
            clean = fountain_anchors.strip_anchor_from_line(line.strip())
            if clean and _match_scene_heading(clean):
                scene_heading_lines.append((i, clean))

        for scene_idx, scene in enumerate(parsed.scenes):
            scene_order = scene.scene_number  # 1-based

            # Find the corresponding line in the fountain file
            line_index = scene_heading_lines[scene_idx][0] if scene_idx < len(scene_heading_lines) else -1

            # Check for existing anchor on this line
            anchor_scene_id = scene_anchors_by_line.get(line_index) if line_index >= 0 else None

            # Parser-derived fields for scene entity
            scene_fields = {
                "name": _strip_anchors(scene.name),
                "scene_number": scene.scene_number,
                "int_ext": scene.int_ext,
                "time_of_day": scene.time_of_day,
                "summary": scene.summary[:2000] if scene.summary else "",
            }

            if anchor_scene_id and anchor_scene_id in existing_scene_maps:
                # 4a. Has anchor — update existing scene
                scene_id = anchor_scene_id
                _update_entity_fields(conn, "scene", scene_id, scene_fields)
                # Update scene map record
                conn.execute(
                    """UPDATE screenplay_scene_map
                       SET heading_text = ?, scene_order = ?, in_screenplay = 1
                       WHERE scene_id = ?""",
                    (_strip_anchors(scene.name), scene_order, scene_id)
                )
                seen_scene_ids.add(scene_id)
                report.scenes_updated += 1

            else:
                # 4b. No anchor — check for heading match in mapping
                heading_key = scene.name.strip().lower()
                matched = False
                candidates = scene_map_by_heading.get(heading_key, [])
                for cand in candidates:
                    if cand["in_screenplay"] == 0:
                        cand_id = cand["scene_id"]
                        if cand_id not in seen_scene_ids:
                            # Reactivate
                            scene_id = cand_id
                            _update_entity_fields(conn, "scene", scene_id, scene_fields)
                            conn.execute(
                                """UPDATE screenplay_scene_map
                                   SET scene_order = ?, in_screenplay = 1
                                   WHERE scene_id = ?""",
                                (scene_order, scene_id)
                            )
                            seen_scene_ids.add(scene_id)
                            report.scenes_updated += 1
                            matched = True
                            # Queue anchor injection
                            if line_index >= 0:
                                anchor_queue.append(
                                    (line_index, f"[[scf:scene:{scene_id}]]"))
                            break

                if not matched:
                    # 4c. New scene
                    scene_id = _insert_entity(conn, "scene", scene_fields)
                    if scene_id > 0:
                        conn.execute(
                            """INSERT INTO screenplay_scene_map
                               (scene_id, heading_text, scene_order, in_screenplay)
                               VALUES (?, ?, ?, 1)""",
                            (scene_id, _strip_anchors(scene.name), scene_order)
                        )
                        seen_scene_ids.add(scene_id)
                        report.scenes_created += 1
                        # Queue anchor injection
                        if line_index >= 0:
                            anchor_queue.append(
                                (line_index, f"[[scf:scene:{scene_id}]]"))

        # Mark scenes no longer in screenplay
        for sid, row_dict in existing_scene_maps.items():
            if row_dict["in_screenplay"] == 1 and sid not in seen_scene_ids:
                conn.execute(
                    "UPDATE screenplay_scene_map SET in_screenplay = 0 WHERE scene_id = ?",
                    (sid,)
                )
                report.scenes_removed += 1

        # ═════════════════════════════════════════════════════════════════
        # 5. Process CHARACTERS
        # ═════════════════════════════════════════════════════════════════

        # Build a character cue line lookup for anchor injection
        # We need first-cue-per-scene positions for new characters
        from fountain_parser import _is_character_cue, _CHAR_EXTENSION_RE
        import re as _re

        char_first_cue_lines = {}  # CHAR_NAME_UPPER -> first line_index
        prev_blank = True
        for i, line in enumerate(fountain_lines):
            stripped = line.strip()
            clean = fountain_anchors.strip_anchor_from_line(stripped)
            if stripped == "":
                prev_blank = True
                continue
            if prev_blank and clean and _is_character_cue(clean):
                char_name = _CHAR_EXTENSION_RE.sub('', clean).strip()
                if '(' in char_name:
                    char_name = _re.sub(r'\([^)]*\)', '', char_name).strip()
                    char_name = _re.sub(r'\s{2,}', ' ', char_name)
                char_upper = char_name.upper()
                if char_upper not in char_first_cue_lines:
                    char_first_cue_lines[char_upper] = i
            prev_blank = (stripped == "")

        for char in parsed.characters:
            char_upper = char.raw_name.upper()

            if char_upper in existing_char_maps:
                # 5a. Already mapped — nothing to do
                pass
            elif char.name.lower() in all_characters:
                # 5b. Entity exists but no mapping — create mapping
                char_id = all_characters[char.name.lower()]
                conn.execute(
                    """INSERT OR IGNORE INTO screenplay_character_map
                       (text_name, character_id, is_primary_name)
                       VALUES (?, ?, 1)""",
                    (char.raw_name, char_id)
                )
                existing_char_maps[char_upper] = {
                    "text_name": char.raw_name,
                    "character_id": char_id,
                    "is_primary_name": 1,
                }
                report.characters_mapped += 1
                # Queue anchor injection on first cue
                if char_upper in char_first_cue_lines:
                    anchor_queue.append(
                        (char_first_cue_lines[char_upper],
                         f"[[scf:char:{char_id}]]"))
            else:
                # 5c. Entirely new character
                char_data = {"name": _strip_anchors(char.name)}
                if char.description:
                    char_data["summary"] = char.description
                if char.hair:
                    char_data["hair"] = char.hair

                char_id = _insert_entity(conn, "character", char_data)
                if char_id > 0:
                    conn.execute(
                        """INSERT OR IGNORE INTO screenplay_character_map
                           (text_name, character_id, is_primary_name)
                           VALUES (?, ?, 1)""",
                        (char.raw_name, char_id)
                    )
                    existing_char_maps[char_upper] = {
                        "text_name": char.raw_name,
                        "character_id": char_id,
                        "is_primary_name": 1,
                    }
                    all_characters[char.name.lower()] = char_id
                    report.characters_created += 1
                    # Queue anchor injection
                    if char_upper in char_first_cue_lines:
                        anchor_queue.append(
                            (char_first_cue_lines[char_upper],
                             f"[[scf:char:{char_id}]]"))

        # ═════════════════════════════════════════════════════════════════
        # 6. Process LOCATIONS
        # ═════════════════════════════════════════════════════════════════

        for loc in parsed.locations:
            loc_lower = loc.name.lower()

            # Determine location_type from raw headings
            has_int = any("INT" in h.upper().split('.')[0] for h in loc.raw_headings)
            has_ext = any("EXT" in h.upper().split('.')[0] for h in loc.raw_headings)
            if has_int and has_ext:
                loc_type = "Int/Ext"
            elif has_int:
                loc_type = "Interior"
            elif has_ext:
                loc_type = "Exterior"
            else:
                loc_type = ""

            if loc_lower in existing_loc_maps:
                # 6a. Already mapped — update location_type if changed
                loc_id = existing_loc_maps[loc_lower]["location_id"]
                if loc_type:
                    _update_entity_fields(conn, "location", loc_id,
                                          {"location_type": loc_type})
            elif loc_lower in all_locations:
                # 6b. Entity exists but no mapping
                loc_id = all_locations[loc_lower]
                conn.execute(
                    """INSERT INTO screenplay_location_map
                       (text_name, location_id) VALUES (?, ?)""",
                    (loc.name, loc_id)
                )
                existing_loc_maps[loc_lower] = {
                    "text_name": loc.name,
                    "location_id": loc_id,
                }
                report.locations_mapped += 1
            else:
                # 6c. New location
                loc_data = {"name": _strip_anchors(loc.name)}
                if loc_type:
                    loc_data["location_type"] = loc_type

                loc_id = _insert_entity(conn, "location", loc_data)
                if loc_id > 0:
                    conn.execute(
                        """INSERT INTO screenplay_location_map
                           (text_name, location_id) VALUES (?, ?)""",
                        (loc.name, loc_id)
                    )
                    existing_loc_maps[loc_lower] = {
                        "text_name": loc.name,
                        "location_id": loc_id,
                    }
                    all_locations[loc_lower] = loc_id
                    report.locations_created += 1

        # Resolve location_id on scene entities
        for scene in parsed.scenes:
            loc_key = scene.location_name.lower()
            loc_entry = existing_loc_maps.get(loc_key)
            if not loc_entry:
                # Try all_locations directly
                loc_id = all_locations.get(loc_key)
            else:
                loc_id = loc_entry["location_id"]
            if loc_id:
                # Find the scene_id for this parsed scene
                # Use scene_heading_lines to match
                heading_key = scene.name.strip().lower()
                for sid, row_dict in existing_scene_maps.items():
                    if (row_dict["heading_text"]
                            and row_dict["heading_text"].lower() == heading_key
                            and sid in seen_scene_ids):
                        _update_entity_fields(conn, "scene", sid,
                                              {"location_id": loc_id})
                        break
                else:
                    # Check newly created scenes in scene_map
                    rows = conn.execute(
                        """SELECT scene_id FROM screenplay_scene_map
                           WHERE lower(heading_text) = ? AND in_screenplay = 1""",
                        (heading_key,)
                    ).fetchall()
                    for r in rows:
                        if r["scene_id"] in seen_scene_ids:
                            _update_entity_fields(conn, "scene", r["scene_id"],
                                                  {"location_id": loc_id})
                            break

        # Queue location anchor injections for new locations on heading lines
        # Re-scan heading lines and inject loc anchors for newly mapped/created locs
        for scene_idx, (line_idx, clean_heading) in enumerate(scene_heading_lines):
            heading_match = _match_scene_heading(clean_heading)
            if not heading_match:
                continue
            _, loc_part, _ = heading_match
            loc_key = loc_part.strip().lower()
            loc_entry = existing_loc_maps.get(loc_key)
            if loc_entry:
                loc_id = loc_entry["location_id"]
                anchor_tag = f"[[scf:loc:{loc_id}]]"
                # Only inject if not already present on this line
                if anchor_tag not in fountain_lines[line_idx]:
                    anchor_queue.append((line_idx, anchor_tag))

        # ═════════════════════════════════════════════════════════════════
        # 7. Rebuild scene_character junctions
        # ═════════════════════════════════════════════════════════════════

        # Delete junctions for in-screenplay scenes only
        in_screenplay_ids = [sid for sid in seen_scene_ids]
        if in_screenplay_ids:
            placeholders = ", ".join(["?"] * len(in_screenplay_ids))
            conn.execute(
                f"DELETE FROM scene_character WHERE scene_id IN ({placeholders})",
                in_screenplay_ids
            )

        # Rebuild from parser output
        # Refresh char map lookup (includes newly created mappings)
        char_map_lookup = {}  # UPPERCASE name -> character_id
        for key, row_dict in existing_char_maps.items():
            char_map_lookup[key] = row_dict["character_id"]

        # Also load any mappings that were in DB but not in our initial load
        for row in conn.execute("SELECT text_name, character_id FROM screenplay_character_map").fetchall():
            char_map_lookup[row["text_name"].upper()] = row["character_id"]

        # Build scene_id lookup from scene_map by heading+order
        # Refresh scene map from DB
        scene_id_by_order = {}  # scene_order -> scene_id (for in_screenplay scenes)
        for row in conn.execute(
            "SELECT scene_id, scene_order FROM screenplay_scene_map WHERE in_screenplay = 1"
        ).fetchall():
            scene_id_by_order[row["scene_order"]] = row["scene_id"]

        for scene in parsed.scenes:
            scene_id = scene_id_by_order.get(scene.scene_number)
            if not scene_id:
                continue

            for sc_link in scene.characters:
                char_key = sc_link.name.upper()
                # Strip extensions for lookup
                char_name_clean = _CHAR_EXTENSION_RE.sub('', char_key).strip()
                if '(' in char_name_clean:
                    char_name_clean = _re.sub(r'\([^)]*\)', '', char_name_clean).strip()
                    char_name_clean = _re.sub(r'\s{2,}', ' ', char_name_clean)

                char_id = char_map_lookup.get(char_name_clean)
                if not char_id:
                    continue

                junction_data = {
                    "scene_id": scene_id,
                    "character_id": char_id,
                    "name": "",
                }
                if sc_link.parentheticals:
                    junction_data["notes"] = "; ".join(sc_link.parentheticals)
                if len(scene.characters) <= 3:
                    junction_data["role_in_scene"] = "Featured"
                else:
                    junction_data["role_in_scene"] = "Supporting"

                _insert_entity(conn, "scene_character", junction_data)
                report.junctions_rebuilt += 1

        # ═════════════════════════════════════════════════════════════════
        # 8. Update screenplay_meta
        # ═════════════════════════════════════════════════════════════════

        in_screenplay_count = len(seen_scene_ids)
        total_pages = max(1, len(fountain_lines) // 55) if fountain_lines else 0

        meta_exists = conn.execute(
            "SELECT id FROM screenplay_meta WHERE id = 1"
        ).fetchone()
        if meta_exists:
            conn.execute(
                """UPDATE screenplay_meta SET
                       total_scenes = ?,
                       total_pages = ?,
                       last_synced = ?
                   WHERE id = 1""",
                (in_screenplay_count, total_pages,
                 datetime.now().isoformat(timespec="seconds"))
            )
        else:
            conn.execute(
                """INSERT INTO screenplay_meta
                   (fountain_path, total_scenes, total_pages, last_synced)
                   VALUES (?, ?, ?, ?)""",
                (str(fountain_path.name), in_screenplay_count, total_pages,
                 datetime.now().isoformat(timespec="seconds"))
            )

        # ═════════════════════════════════════════════════════════════════
        # 9. Inject queued anchors
        # ═════════════════════════════════════════════════════════════════

        if anchor_queue:
            # Sort by line index descending so insertions don't shift later lines
            anchor_queue.sort(key=lambda x: x[0], reverse=True)

            updated_text = fountain_text
            injected = 0
            for line_idx, anchor_tag in anchor_queue:
                before = updated_text
                updated_text = fountain_anchors.inject_single_anchor(
                    updated_text, line_idx, anchor_tag
                )
                if updated_text != before:
                    injected += 1

            if injected > 0:
                fountain_path.write_text(updated_text, encoding="utf-8")
                report.new_anchors_injected = injected

        # ═════════════════════════════════════════════════════════════════
        # 10. Commit
        # ═════════════════════════════════════════════════════════════════

        conn.commit()

    except Exception as e:
        conn.rollback()
        report.errors.append(f"Sync failed: {str(e)}")
        raise
    finally:
        conn.close()

    return report
