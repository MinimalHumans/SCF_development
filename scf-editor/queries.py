"""
SCF Query Explorer — Predefined Queries
=========================================
Each function takes a db_path and parameters, returns a list of dicts.
Uses raw SQL with JOINs on junction tables for cross-entity analysis.
"""

from pathlib import Path
from database import get_connection


def character_journey(db_path: str | Path, character_id: int) -> list[dict]:
    """All scenes a character appears in, with location and other characters."""
    conn = get_connection(db_path)
    try:
        rows = conn.execute("""
            SELECT
                sc.id           AS link_id,
                sc.role_in_scene,
                sc.notes        AS link_notes,
                s.id            AS scene_id,
                s.name          AS scene_name,
                s.scene_number,
                s.time_of_day,
                s.emotional_beat,
                s.summary       AS scene_summary,
                l.id            AS location_id,
                l.name          AS location_name,
                l.location_type
            FROM scene_character sc
            JOIN scene s ON s.id = sc.scene_id
            LEFT JOIN location l ON l.id = s.location_id
            WHERE sc.character_id = ?
            ORDER BY s.scene_number ASC, s.id ASC
        """, (character_id,)).fetchall()

        results = []
        for row in rows:
            r = dict(row)
            # Fetch other characters in the same scene
            others = conn.execute("""
                SELECT c.name AS character_name, sc2.role_in_scene
                FROM scene_character sc2
                JOIN character c ON c.id = sc2.character_id
                WHERE sc2.scene_id = ? AND sc2.character_id != ?
                ORDER BY c.name
            """, (r["scene_id"], character_id)).fetchall()
            r["other_characters"] = [dict(o) for o in others]
            results.append(r)

        return results
    finally:
        conn.close()


def location_breakdown(db_path: str | Path, location_id: int) -> list[dict]:
    """All scenes at a location, with characters and props present."""
    conn = get_connection(db_path)
    try:
        rows = conn.execute("""
            SELECT
                s.id            AS scene_id,
                s.name          AS scene_name,
                s.scene_number,
                s.time_of_day,
                s.emotional_beat,
                s.summary       AS scene_summary
            FROM scene s
            WHERE s.location_id = ?
            ORDER BY s.scene_number ASC, s.id ASC
        """, (location_id,)).fetchall()

        results = []
        for row in rows:
            r = dict(row)
            # Characters in this scene
            chars = conn.execute("""
                SELECT c.name AS character_name, sc.role_in_scene
                FROM scene_character sc
                JOIN character c ON c.id = sc.character_id
                WHERE sc.scene_id = ?
                ORDER BY c.name
            """, (r["scene_id"],)).fetchall()
            r["characters"] = [dict(c) for c in chars]

            # Props in this scene
            props = conn.execute("""
                SELECT p.name AS prop_name, sp.usage_note, sp.significance
                FROM scene_prop sp
                JOIN prop p ON p.id = sp.prop_id
                WHERE sp.scene_id = ?
                ORDER BY p.name
            """, (r["scene_id"],)).fetchall()
            r["props"] = [dict(p) for p in props]

            results.append(r)

        return results
    finally:
        conn.close()


def scene_context(db_path: str | Path, scene_id: int) -> dict:
    """Full context dump for a single scene."""
    conn = get_connection(db_path)
    try:
        # Scene data
        scene = conn.execute("SELECT * FROM scene WHERE id = ?", (scene_id,)).fetchone()
        if not scene:
            return {}
        result = dict(scene)

        # Location details
        if result.get("location_id"):
            loc = conn.execute("SELECT * FROM location WHERE id = ?",
                               (result["location_id"],)).fetchone()
            result["location"] = dict(loc) if loc else None
        else:
            result["location"] = None

        # Characters (ordered by role importance)
        chars = conn.execute("""
            SELECT c.id, c.name, c.role, c.archetype,
                   sc.role_in_scene, sc.notes AS link_notes
            FROM scene_character sc
            JOIN character c ON c.id = sc.character_id
            WHERE sc.scene_id = ?
            ORDER BY
                CASE sc.role_in_scene
                    WHEN 'Featured' THEN 1
                    WHEN 'Supporting' THEN 2
                    WHEN 'Background' THEN 3
                    WHEN 'Mentioned' THEN 4
                    WHEN 'Voiceover' THEN 5
                    ELSE 6
                END
        """, (scene_id,)).fetchall()
        result["characters"] = [dict(c) for c in chars]

        # Props
        props = conn.execute("""
            SELECT p.id, p.name, p.prop_type, p.description,
                   sp.usage_note, sp.significance
            FROM scene_prop sp
            JOIN prop p ON p.id = sp.prop_id
            WHERE sp.scene_id = ?
            ORDER BY p.name
        """, (scene_id,)).fetchall()
        result["props"] = [dict(p) for p in props]

        # Sequence membership
        seqs = conn.execute("""
            SELECT seq.id, seq.name, seq.act, ss.order_in_sequence
            FROM scene_sequence ss
            JOIN sequence seq ON seq.id = ss.sequence_id
            WHERE ss.scene_id = ?
            ORDER BY ss.order_in_sequence
        """, (scene_id,)).fetchall()
        result["sequences"] = [dict(s) for s in seqs]

        return result
    finally:
        conn.close()


def character_crossover(db_path: str | Path, char1_id: int, char2_id: int) -> list[dict]:
    """Scenes where both characters appear."""
    conn = get_connection(db_path)
    try:
        rows = conn.execute("""
            SELECT
                s.id            AS scene_id,
                s.name          AS scene_name,
                s.scene_number,
                s.time_of_day,
                s.emotional_beat,
                l.name          AS location_name,
                sc1.role_in_scene AS char1_role,
                sc2.role_in_scene AS char2_role
            FROM scene_character sc1
            JOIN scene_character sc2 ON sc1.scene_id = sc2.scene_id
            JOIN scene s ON s.id = sc1.scene_id
            LEFT JOIN location l ON l.id = s.location_id
            WHERE sc1.character_id = ? AND sc2.character_id = ?
            ORDER BY s.scene_number ASC, s.id ASC
        """, (char1_id, char2_id)).fetchall()

        return [dict(r) for r in rows]
    finally:
        conn.close()


def project_stats(db_path: str | Path) -> dict:
    """Aggregate project statistics."""
    conn = get_connection(db_path)
    try:
        stats = {}

        # Entity counts
        for table in ["character", "location", "prop", "scene",
                       "sequence", "theme", "scene_character",
                       "scene_prop", "scene_sequence"]:
            try:
                row = conn.execute(f"SELECT COUNT(*) AS cnt FROM {table}").fetchone()
                stats[f"{table}_count"] = row["cnt"]
            except Exception:
                stats[f"{table}_count"] = 0

        # Most-appearing characters (by scene_character links)
        top_chars = conn.execute("""
            SELECT c.id, c.name, COUNT(sc.id) AS scene_count
            FROM scene_character sc
            JOIN character c ON c.id = sc.character_id
            GROUP BY c.id, c.name
            ORDER BY scene_count DESC
            LIMIT 10
        """).fetchall()
        stats["top_characters"] = [dict(r) for r in top_chars]

        # Most-used locations (by scene count)
        top_locs = conn.execute("""
            SELECT l.id, l.name, COUNT(s.id) AS scene_count
            FROM scene s
            JOIN location l ON l.id = s.location_id
            WHERE s.location_id IS NOT NULL
            GROUP BY l.id, l.name
            ORDER BY scene_count DESC
            LIMIT 10
        """).fetchall()
        stats["top_locations"] = [dict(r) for r in top_locs]

        # Scenes without any characters linked
        orphans = conn.execute("""
            SELECT s.id, s.name, s.scene_number
            FROM scene s
            LEFT JOIN scene_character sc ON sc.scene_id = s.id
            WHERE sc.id IS NULL
            ORDER BY s.scene_number ASC, s.id ASC
        """).fetchall()
        stats["scenes_without_characters"] = [dict(r) for r in orphans]

        # Characters not in any scene
        unlinked_chars = conn.execute("""
            SELECT c.id, c.name, c.role
            FROM character c
            LEFT JOIN scene_character sc ON sc.character_id = c.id
            WHERE sc.id IS NULL
            ORDER BY c.name
        """).fetchall()
        stats["characters_without_scenes"] = [dict(r) for r in unlinked_chars]

        return stats
    finally:
        conn.close()
