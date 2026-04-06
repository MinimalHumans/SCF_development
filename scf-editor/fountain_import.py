"""
Fountain Import Orchestrator for SCF
======================================
Takes parsed FountainData and writes it into an SCF project using
the existing database CRUD layer. Supports both new project creation
and merging into existing projects.

Performance: uses a single database connection and transaction for
all writes, avoiding the overhead of per-entity connection cycling.
"""

import re
from pathlib import Path
from fountain_parser import parse as fountain_parse, FountainData

import database as db
from entity_registry import get_entity
import fountain_anchors

# Strip SCF anchor tags from entity names
_SCF_ANCHOR_RE = re.compile(r'\[\[scf:\w+:\d+\]\]')

def _strip_anchors(text: str) -> str:
    """Remove [[scf:...]] tags and clean up whitespace."""
    return re.sub(r'\s{2,}', ' ', _SCF_ANCHOR_RE.sub('', text)).strip()


# Confidence → scene_prop significance mapping
_CONFIDENCE_TO_SIGNIFICANCE = {
    "high": "Key",
    "medium": "Present",
    "low": "Background",
}


def import_as_new_project(fountain_text: str, project_name: str) -> tuple[Path, dict]:
    """
    Parse a Fountain screenplay and create a new SCF project from it.

    Returns (db_path, summary) where summary counts what was created.
    """
    data = fountain_parse(fountain_text)
    db_path = db.create_project(project_name)

    # Update the root project entity with parsed metadata
    projects = db.list_entities(db_path, "project", limit=1)
    if projects:
        update = {}
        if data.title:
            update["name"] = data.title
        if data.author:
            update["notes"] = f"Written by {data.author}"
        if update:
            db.update_entity(db_path, "project", projects[0]["id"], update)

    summary, anchor_maps = _write_to_project(data, db_path, fountain_text=fountain_text)

    # Inject anchors into the fountain text for the working copy
    anchored_text = fountain_text
    if anchor_maps:
        scene_map, char_map, loc_map = anchor_maps
        anchored_text = fountain_anchors.inject_anchors(
            fountain_text, scene_map, char_map, loc_map
        )

    return db_path, summary, anchored_text


def merge_into_project(fountain_text: str, db_path: Path) -> dict:
    """
    Parse a Fountain screenplay and merge entities into an existing project.
    Deduplicates by name — existing entities are NOT overwritten.

    Returns summary dict of what was created vs skipped.
    """
    data = fountain_parse(fountain_text)
    summary, _ = _write_to_project(data, db_path, merge=True)
    return summary


def _insert(conn, table: str, data: dict, entity_type: str) -> int:
    """Insert a row using a shared connection (no open/close overhead)."""
    entity_def = get_entity(entity_type)
    valid_fields = {f.name for f in entity_def.fields}
    filtered = {k: v for k, v in data.items() if k in valid_fields and v is not None and v != ""}
    if not filtered:
        return -1
    cols = ", ".join(filtered.keys())
    placeholders = ", ".join(["?"] * len(filtered))
    values = list(filtered.values())
    cursor = conn.execute(
        f"INSERT INTO {entity_type} ({cols}) VALUES ({placeholders})", values
    )
    return cursor.lastrowid


def _write_to_project(data: FountainData, db_path: Path, merge: bool = False,
                      fountain_text: str = "") -> dict:
    """
    Core write logic. Uses a SINGLE connection and transaction for all writes.
    """
    summary = {
        "locations": {"created": 0, "skipped": 0},
        "characters": {"created": 0, "skipped": 0},
        "scenes": {"created": 0, "skipped": 0},
        "props": {"created": 0, "skipped": 0},
        "scene_characters": {"created": 0},
        "scene_props": {"created": 0},
    }

    conn = db.get_connection(db_path)
    try:
        # ── Build existing name lookups for merge dedup ──
        existing_locations = {}
        existing_characters = {}
        existing_scenes = {}
        existing_props = {}

        if merge:
            for row in conn.execute("SELECT id, name FROM location").fetchall():
                existing_locations[row["name"].lower()] = row["id"]
            for row in conn.execute("SELECT id, name FROM character").fetchall():
                existing_characters[row["name"].lower()] = row["id"]
            for row in conn.execute("SELECT id, name FROM scene").fetchall():
                existing_scenes[row["name"].lower()] = row["id"]
            for row in conn.execute("SELECT id, name FROM prop").fetchall():
                existing_props[row["name"].lower()] = row["id"]

        # ═════════════════════════════════════════════════════════════
        # 1. Locations
        # ═════════════════════════════════════════════════════════════
        location_id_map = {}

        for loc in data.locations:
            key = loc.name.lower()
            if key in existing_locations:
                location_id_map[key] = existing_locations[key]
                summary["locations"]["skipped"] += 1
                continue

            loc_data = {"name": _strip_anchors(loc.name)}
            has_int = any("INT" in h.upper().split('.')[0] for h in loc.raw_headings)
            has_ext = any("EXT" in h.upper().split('.')[0] for h in loc.raw_headings)
            if has_int and has_ext:
                loc_data["location_type"] = "Int/Ext"
            elif has_int:
                loc_data["location_type"] = "Interior"
            elif has_ext:
                loc_data["location_type"] = "Exterior"

            loc_id = _insert(conn, "location", loc_data, "location")
            location_id_map[key] = loc_id
            existing_locations[key] = loc_id
            summary["locations"]["created"] += 1

        # ═════════════════════════════════════════════════════════════
        # 2. Characters
        # ═════════════════════════════════════════════════════════════
        character_id_map = {}

        for char in data.characters:
            key = char.name.lower()
            if key in existing_characters:
                character_id_map[key] = existing_characters[key]
                summary["characters"]["skipped"] += 1
                continue

            char_data = {"name": _strip_anchors(char.name)}
            if char.description:
                char_data["summary"] = char.description
            if char.hair:
                char_data["hair"] = char.hair

            char_id = _insert(conn, "character", char_data, "character")
            character_id_map[key] = char_id
            existing_characters[key] = char_id
            summary["characters"]["created"] += 1

        # ═════════════════════════════════════════════════════════════
        # 3. Scenes
        # ═════════════════════════════════════════════════════════════
        scene_id_map = {}

        for scene in data.scenes:
            scene_key = scene.name.lower()
            if scene_key in existing_scenes:
                scene_id_map[scene.scene_number - 1] = existing_scenes[scene_key]
                summary["scenes"]["skipped"] += 1
                continue

            scene_data = {
                "name": _strip_anchors(scene.name),
                "scene_number": scene.scene_number,
            }
            loc_key = scene.location_name.lower()
            if loc_key in location_id_map:
                scene_data["location_id"] = location_id_map[loc_key]
            if scene.int_ext:
                scene_data["int_ext"] = scene.int_ext
            if scene.time_of_day:
                scene_data["time_of_day"] = scene.time_of_day
            if scene.summary:
                scene_data["summary"] = scene.summary[:2000]

            scene_id = _insert(conn, "scene", scene_data, "scene")
            scene_id_map[scene.scene_number - 1] = scene_id
            existing_scenes[scene_key] = scene_id
            summary["scenes"]["created"] += 1

        # ═════════════════════════════════════════════════════════════
        # 4. Props
        # ═════════════════════════════════════════════════════════════
        prop_id_map = {}

        for prop in data.props:
            key = prop.name.lower()
            if key in existing_props:
                prop_id_map[key] = existing_props[key]
                summary["props"]["skipped"] += 1
                continue

            prop_data = {"name": prop.name}
            if prop.context:
                prop_data["narrative_significance"] = prop.context[:500]
            if prop.first_scene < len(data.scenes):
                scene_name = data.scenes[prop.first_scene].name
                prop_data["first_appearance"] = f"Scene {prop.first_scene + 1}: {scene_name}"

            prop_id = _insert(conn, "prop", prop_data, "prop")
            prop_id_map[key] = prop_id
            existing_props[key] = prop_id
            summary["props"]["created"] += 1

        # ═════════════════════════════════════════════════════════════
        # 5. Scene-Character junctions
        # ═════════════════════════════════════════════════════════════
        # Build set of existing junctions for merge dedup
        existing_sc_junctions = set()
        if merge:
            for row in conn.execute("SELECT scene_id, character_id FROM scene_character").fetchall():
                existing_sc_junctions.add((row["scene_id"], row["character_id"]))

        for scene in data.scenes:
            scene_idx = scene.scene_number - 1
            scene_id = scene_id_map.get(scene_idx)
            if not scene_id:
                continue

            for sc_link in scene.characters:
                char_key = sc_link.name.lower()
                char_id = character_id_map.get(char_key)
                if not char_id:
                    continue

                if (scene_id, char_id) in existing_sc_junctions:
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

                _insert(conn, "scene_character", junction_data, "scene_character")
                existing_sc_junctions.add((scene_id, char_id))
                summary["scene_characters"]["created"] += 1

        # ═════════════════════════════════════════════════════════════
        # 6. Scene-Prop junctions
        # ═════════════════════════════════════════════════════════════
        existing_sp_junctions = set()
        if merge:
            for row in conn.execute("SELECT scene_id, prop_id FROM scene_prop").fetchall():
                existing_sp_junctions.add((row["scene_id"], row["prop_id"]))

        for prop in data.props:
            prop_key = prop.name.lower()
            prop_id = prop_id_map.get(prop_key)
            if not prop_id:
                continue

            scene_idx = prop.first_scene
            scene_id = scene_id_map.get(scene_idx)
            if not scene_id:
                continue

            if (scene_id, prop_id) in existing_sp_junctions:
                continue

            junction_data = {
                "scene_id": scene_id,
                "prop_id": prop_id,
                "name": "",
                "significance": _CONFIDENCE_TO_SIGNIFICANCE.get(prop.confidence, "Present"),
            }

            _insert(conn, "scene_prop", junction_data, "scene_prop")
            existing_sp_junctions.add((scene_id, prop_id))
            summary["scene_props"]["created"] += 1

        # ═════════════════════════════════════════════════════════════
        # 7. Screenplay mapping tables (new project imports only)
        # ═════════════════════════════════════════════════════════════
        if not merge:
            # screenplay_meta
            fountain_filename = f"{db_path.parent.name}.fountain"
            total_pages = max(1, len(fountain_text.splitlines()) // 55) if fountain_text else 0
            conn.execute(
                """INSERT INTO screenplay_meta
                   (fountain_path, title, author, total_scenes, total_pages)
                   VALUES (?, ?, ?, ?, ?)""",
                (fountain_filename, data.title, data.author,
                 len(data.scenes), total_pages)
            )

            # screenplay_character_map
            for char in data.characters:
                char_id = character_id_map.get(char.name.lower())
                if char_id:
                    conn.execute(
                        """INSERT OR IGNORE INTO screenplay_character_map
                           (text_name, character_id, is_primary_name)
                           VALUES (?, ?, 1)""",
                        (char.name, char_id)
                    )

            # screenplay_scene_map
            for scene in data.scenes:
                scene_idx = scene.scene_number - 1
                scene_id = scene_id_map.get(scene_idx)
                if scene_id:
                    heading = scene.name
                    conn.execute(
                        """INSERT INTO screenplay_scene_map
                           (scene_id, heading_text, scene_order, in_screenplay)
                           VALUES (?, ?, ?, 1)""",
                        (scene_id, heading, scene.scene_number)
                    )

            # screenplay_location_map
            for loc in data.locations:
                loc_id = location_id_map.get(loc.name.lower())
                if loc_id:
                    conn.execute(
                        """INSERT INTO screenplay_location_map
                           (text_name, location_id)
                           VALUES (?, ?)""",
                        (loc.name, loc_id)
                    )

        # ═════════════════════════════════════════════════════════════
        # 8. Build anchor maps for fountain text injection
        # ═════════════════════════════════════════════════════════════
        anchor_maps = None
        if not merge and fountain_text:
            # scene_map: {heading_lower: [{"id": N, "order": M}, ...]}
            anchor_scene_map = {}
            for scene in data.scenes:
                scene_idx = scene.scene_number - 1
                scene_id = scene_id_map.get(scene_idx)
                if scene_id:
                    key = scene.name.strip().lower()
                    anchor_scene_map.setdefault(key, []).append({
                        "id": scene_id, "order": scene.scene_number
                    })
            # Sort each heading's entries by order
            for entries in anchor_scene_map.values():
                entries.sort(key=lambda e: e["order"])

            # character_map: {UPPERCASE_NAME: character_entity_id}
            anchor_char_map = {}
            for char in data.characters:
                char_id = character_id_map.get(char.name.lower())
                if char_id:
                    anchor_char_map[char.raw_name.upper()] = char_id

            # location_map: {normalized_loc_lower: location_entity_id}
            anchor_loc_map = {}
            for loc in data.locations:
                loc_id = location_id_map.get(loc.name.lower())
                if loc_id:
                    anchor_loc_map[loc.name.lower()] = loc_id

            anchor_maps = (anchor_scene_map, anchor_char_map, anchor_loc_map)

        # ── Commit everything in one transaction ──
        conn.commit()

    finally:
        conn.close()

    return summary, anchor_maps


def format_summary(summary: dict) -> str:
    """Format an import summary dict into a human-readable string."""
    parts = []
    for entity_type, counts in summary.items():
        if isinstance(counts, dict):
            created = counts.get("created", 0)
            skipped = counts.get("skipped", 0)
            if created or skipped:
                label = entity_type.replace("_", " ").title()
                if skipped:
                    parts.append(f"{label}: {created} created, {skipped} skipped")
                else:
                    parts.append(f"{label}: {created} created")
    return " | ".join(parts) if parts else "No entities created"
