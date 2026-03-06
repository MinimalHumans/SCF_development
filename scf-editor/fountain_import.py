"""
Fountain Import Orchestrator for SCF
======================================
Takes parsed FountainData and writes it into an SCF project using
the existing database CRUD layer. Supports both new project creation
and merging into existing projects.
"""

from pathlib import Path
from fountain_parser import parse as fountain_parse, FountainData

import database as db


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

    summary = _write_to_project(data, db_path)
    return db_path, summary


def merge_into_project(fountain_text: str, db_path: Path) -> dict:
    """
    Parse a Fountain screenplay and merge entities into an existing project.
    Deduplicates by name — existing entities are NOT overwritten.

    Returns summary dict of what was created vs skipped.
    """
    data = fountain_parse(fountain_text)
    summary = _write_to_project(data, db_path, merge=True)
    return summary


def _write_to_project(data: FountainData, db_path: Path, merge: bool = False) -> dict:
    """
    Core write logic. Creates locations, characters, scenes, props,
    and all junction records.

    When merge=True, skips entities whose names already exist.
    """
    summary = {
        "locations": {"created": 0, "skipped": 0},
        "characters": {"created": 0, "skipped": 0},
        "scenes": {"created": 0, "skipped": 0},
        "props": {"created": 0, "skipped": 0},
        "scene_characters": {"created": 0},
        "scene_props": {"created": 0},
    }

    # ── Build existing name lookups for merge dedup ──
    existing_locations = {}   # lowercase name → id
    existing_characters = {}
    existing_scenes = {}
    existing_props = {}

    if merge:
        for item in db.list_entities(db_path, "location"):
            existing_locations[item["name"].lower()] = item["id"]
        for item in db.list_entities(db_path, "character"):
            existing_characters[item["name"].lower()] = item["id"]
        for item in db.list_entities(db_path, "scene"):
            existing_scenes[item["name"].lower()] = item["id"]
        for item in db.list_entities(db_path, "prop"):
            existing_props[item["name"].lower()] = item["id"]

    # ═══════════════════════════════════════════════════════════════════
    # 1. Create Locations
    # ═══════════════════════════════════════════════════════════════════
    location_id_map = {}  # fountain location name (lowercase) → SCF id

    for loc in data.locations:
        key = loc.name.lower()

        if key in existing_locations:
            location_id_map[key] = existing_locations[key]
            summary["locations"]["skipped"] += 1
            continue

        loc_data = {"name": loc.name}

        # Infer location_type from raw headings
        has_int = any("INT" in h.upper().split('.')[0] for h in loc.raw_headings)
        has_ext = any("EXT" in h.upper().split('.')[0] for h in loc.raw_headings)
        if has_int and has_ext:
            loc_data["location_type"] = "Int/Ext"
        elif has_int:
            loc_data["location_type"] = "Interior"
        elif has_ext:
            loc_data["location_type"] = "Exterior"

        loc_id = db.create_entity(db_path, "location", loc_data)
        location_id_map[key] = loc_id
        existing_locations[key] = loc_id
        summary["locations"]["created"] += 1

    # ═══════════════════════════════════════════════════════════════════
    # 2. Create Characters
    # ═══════════════════════════════════════════════════════════════════
    character_id_map = {}  # fountain character name (lowercase) → SCF id

    for char in data.characters:
        key = char.name.lower()

        if key in existing_characters:
            character_id_map[key] = existing_characters[key]
            summary["characters"]["skipped"] += 1
            continue

        char_data = {"name": char.name}

        if char.description:
            char_data["summary"] = char.description

        if char.hair:
            char_data["hair"] = char.hair

        char_id = db.create_entity(db_path, "character", char_data)
        character_id_map[key] = char_id
        existing_characters[key] = char_id
        summary["characters"]["created"] += 1

    # ═══════════════════════════════════════════════════════════════════
    # 3. Create Scenes
    # ═══════════════════════════════════════════════════════════════════
    scene_id_map = {}  # fountain scene index (0-based) → SCF id

    for scene in data.scenes:
        scene_key = scene.name.lower()

        if scene_key in existing_scenes:
            scene_id_map[scene.scene_number - 1] = existing_scenes[scene_key]
            summary["scenes"]["skipped"] += 1
            continue

        scene_data = {
            "name": scene.name,
            "scene_number": scene.scene_number,
        }

        # Link to location
        loc_key = scene.location_name.lower()
        if loc_key in location_id_map:
            scene_data["location_id"] = location_id_map[loc_key]

        # INT/EXT on scene (the new field from our plan)
        if scene.int_ext:
            scene_data["int_ext"] = scene.int_ext

        # Time of day
        if scene.time_of_day:
            scene_data["time_of_day"] = scene.time_of_day

        # Summary from action text
        if scene.summary:
            # Truncate to reasonable length for the textarea field
            scene_data["summary"] = scene.summary[:2000]

        scene_id = db.create_entity(db_path, "scene", scene_data)
        scene_id_map[scene.scene_number - 1] = scene_id
        existing_scenes[scene_key] = scene_id
        summary["scenes"]["created"] += 1

    # ═══════════════════════════════════════════════════════════════════
    # 4. Create Props
    # ═══════════════════════════════════════════════════════════════════
    prop_id_map = {}  # fountain prop name (lowercase) → SCF id

    for prop in data.props:
        key = prop.name.lower()

        if key in existing_props:
            prop_id_map[key] = existing_props[key]
            summary["props"]["skipped"] += 1
            continue

        prop_data = {
            "name": prop.name,
        }

        # Store context as narrative significance
        if prop.context:
            prop_data["narrative_significance"] = prop.context[:500]

        # Store first appearance info
        if prop.first_scene < len(data.scenes):
            scene_name = data.scenes[prop.first_scene].name
            prop_data["first_appearance"] = f"Scene {prop.first_scene + 1}: {scene_name}"

        prop_id = db.create_entity(db_path, "prop", prop_data)
        prop_id_map[key] = prop_id
        existing_props[key] = prop_id
        summary["props"]["created"] += 1

    # ═══════════════════════════════════════════════════════════════════
    # 5. Create Scene-Character junction records
    # ═══════════════════════════════════════════════════════════════════
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

            # Check for existing junction (avoid duplicates on merge)
            if merge:
                conn = db.get_connection(db_path)
                try:
                    existing = conn.execute(
                        "SELECT id FROM scene_character WHERE scene_id = ? AND character_id = ?",
                        (scene_id, char_id)
                    ).fetchone()
                    if existing:
                        continue
                finally:
                    conn.close()

            junction_data = {
                "scene_id": scene_id,
                "character_id": char_id,
                "name": "",  # auto-named by main.py
            }

            # Store parentheticals as notes
            if sc_link.parentheticals:
                junction_data["notes"] = "; ".join(sc_link.parentheticals)

            # Default role: Featured if few characters in scene, Supporting otherwise
            if len(scene.characters) <= 3:
                junction_data["role_in_scene"] = "Featured"
            else:
                junction_data["role_in_scene"] = "Supporting"

            db.create_entity(db_path, "scene_character", junction_data)
            summary["scene_characters"]["created"] += 1

    # ═══════════════════════════════════════════════════════════════════
    # 6. Create Scene-Prop junction records
    # ═══════════════════════════════════════════════════════════════════
    # Build a reverse map: prop name → list of scenes it appears in
    # (from the action text scanning done by the parser)
    for prop in data.props:
        prop_key = prop.name.lower()
        prop_id = prop_id_map.get(prop_key)
        if not prop_id:
            continue

        # Link to the first scene where the prop was detected
        scene_idx = prop.first_scene
        scene_id = scene_id_map.get(scene_idx)
        if not scene_id:
            continue

        # Check for existing junction on merge
        if merge:
            conn = db.get_connection(db_path)
            try:
                existing = conn.execute(
                    "SELECT id FROM scene_prop WHERE scene_id = ? AND prop_id = ?",
                    (scene_id, prop_id)
                ).fetchone()
                if existing:
                    continue
            finally:
                conn.close()

        junction_data = {
            "scene_id": scene_id,
            "prop_id": prop_id,
            "name": "",
            "significance": _CONFIDENCE_TO_SIGNIFICANCE.get(prop.confidence, "Present"),
        }

        db.create_entity(db_path, "scene_prop", junction_data)
        summary["scene_props"]["created"] += 1

    return summary


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
