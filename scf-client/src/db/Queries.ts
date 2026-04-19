/**
 * SCF Query Explorer — Predefined Queries
 * =========================================
 * Ported from scf-editor/queries.py
 */

import { db } from './Database';

export async function characterJourney(characterId: number): Promise<any[]> {
  /** All scenes a character appears in, with location and other characters. */
  const rows = await db.getRows(`
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
  `, [characterId]);

  const results = [];
  for (const row of rows) {
    const r = { ...row };
    // Fetch other characters in the same scene
    const others = await db.getRows(`
        SELECT c.name AS character_name, sc2.role_in_scene
        FROM scene_character sc2
        JOIN character c ON c.id = sc2.character_id
        WHERE sc2.scene_id = ? AND sc2.character_id != ?
        ORDER BY c.name
    `, [r.scene_id, characterId]);
    r.other_characters = others;
    results.push(r);
  }

  return results;
}

export async function locationBreakdown(locationId: number): Promise<any[]> {
  /** All scenes at a location, with characters and props present. */
  const rows = await db.getRows(`
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
  `, [locationId]);

  const results = [];
  for (const row of rows) {
    const r = { ...row };
    // Characters in this scene
    const chars = await db.getRows(`
        SELECT c.name AS character_name, sc.role_in_scene
        FROM scene_character sc
        JOIN character c ON c.id = sc.character_id
        WHERE sc.scene_id = ?
        ORDER BY c.name
    `, [r.scene_id]);
    r.characters = chars;

    // Props in this scene
    const props = await db.getRows(`
        SELECT p.name AS prop_name, sp.usage_note, sp.significance
        FROM scene_prop sp
        JOIN prop p ON p.id = sp.prop_id
        WHERE sp.scene_id = ?
        ORDER BY p.name
    `, [r.scene_id]);
    r.props = props;

    results.push(r);
  }

  return results;
}

export async function sceneContext(sceneId: number): Promise<any> {
  /** Full context dump for a single scene. */
  const sceneRows = await db.getRows("SELECT * FROM scene WHERE id = ?", [sceneId]);
  if (sceneRows.length === 0) return null;
  const result = { ...sceneRows[0] };

  // Location details
  if (result.location_id) {
    const locRows = await db.getRows("SELECT * FROM location WHERE id = ?", [result.location_id]);
    result.location = locRows.length > 0 ? locRows[0] : null;
  } else {
    result.location = null;
  }

  // Characters (ordered by role importance)
  const chars = await db.getRows(`
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
  `, [sceneId]);
  result.characters = chars;

  // Props
  const props = await db.getRows(`
    SELECT p.id, p.name, p.prop_type, p.description,
           sp.usage_note, sp.significance
    FROM scene_prop sp
    JOIN prop p ON p.id = sp.prop_id
    WHERE sp.scene_id = ?
    ORDER BY p.name
  `, [sceneId]);
  result.props = props;

  // Sequence membership
  const seqs = await db.getRows(`
    SELECT seq.id, seq.name, seq.act, ss.order_in_sequence
    FROM scene_sequence ss
    JOIN sequence seq ON seq.id = ss.sequence_id
    WHERE ss.scene_id = ?
    ORDER BY ss.order_in_sequence
  `, [sceneId]);
  result.sequences = seqs;

  return result;
}

export async function characterCrossover(char1Id: number, char2Id: number): Promise<any[]> {
  /** Scenes where both characters appear. */
  const rows = await db.getRows(`
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
  `, [char1Id, char2Id]);

  return rows;
}

export async function projectStats(): Promise<any> {
  /** Aggregate project statistics. */
  const stats: Record<string, any> = {};

  // Entity counts
  const tables = ["character", "location", "prop", "scene",
                 "sequence", "theme", "scene_character",
                 "scene_prop", "scene_sequence"];
  for (const table of tables) {
    try {
      const rows = await db.getRows(`SELECT COUNT(*) AS cnt FROM ${table}`);
      stats[`${table}_count`] = rows[0].cnt;
    } catch (e) {
      stats[`${table}_count`] = 0;
    }
  }

  // Most-appearing characters (by scene_character links)
  const topChars = await db.getRows(`
    SELECT c.id, c.name, COUNT(sc.id) AS scene_count
    FROM scene_character sc
    JOIN character c ON c.id = sc.character_id
    GROUP BY c.id, c.name
    ORDER BY scene_count DESC
    LIMIT 10
  `);
  stats.top_characters = topChars;

  // Most-used locations (by scene count)
  const topLocs = await db.getRows(`
    SELECT l.id, l.name, COUNT(s.id) AS scene_count
    FROM scene s
    JOIN location l ON l.id = s.location_id
    WHERE s.location_id IS NOT NULL
    GROUP BY l.id, l.name
    ORDER BY scene_count DESC
    LIMIT 10
  `);
  stats.top_locations = topLocs;

  // Scenes without any characters linked
  const orphans = await db.getRows(`
    SELECT s.id, s.name, s.scene_number
    FROM scene s
    LEFT JOIN scene_character sc ON sc.scene_id = s.id
    WHERE sc.id IS NULL
    ORDER BY s.scene_number ASC, s.id ASC
  `);
  stats.scenes_without_characters = orphans;

  // Characters not in any scene
  const unlinkedChars = await db.getRows(`
    SELECT c.id, c.name, c.role
    FROM character c
    LEFT JOIN scene_character sc ON sc.character_id = c.id
    WHERE sc.id IS NULL
    ORDER BY c.name
  `);
  stats.characters_without_scenes = unlinkedChars;

  return stats;
}
