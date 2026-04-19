/**
 * Fountain Import Orchestrator for SCF
 * ======================================
 * Ported from scf-editor/fountain_import.py
 */

import { db } from './Database';
import { parse as fountainParse } from './FountainParser';
import type { FountainData } from './FountainParser';

const SCF_ANCHOR_RE = /\[\[scf:\w+:\d+\]\]/g;

function stripAnchors(text: string): string {
  return text.replace(SCF_ANCHOR_RE, '').replace(/\s{2,}/g, ' ').trim();
}

const CONFIDENCE_TO_SIGNIFICANCE: Record<string, string> = {
  "high": "Key",
  "medium": "Present",
  "low": "Background",
};

export interface ImportSummary {
  locations: { created: number; skipped: number };
  characters: { created: number; skipped: number };
  scenes: { created: number; skipped: number };
  props: { created: number; skipped: number };
  scene_characters: { created: number };
  scene_props: { created: number };
}

export async function importAsNewProject(fountainText: string, projectName: string): Promise<ImportSummary> {
  const data = fountainParse(fountainText);
  await db.openProject(projectName);

  // Update the root project entity with parsed metadata
  const projects = await db.getRows(`SELECT id FROM project LIMIT 1`);
  if (projects.length > 0) {
    const update: Record<string, any> = {};
    if (data.title) update.name = data.title;
    if (data.author) update.notes = `Written by ${data.author}`;
    if (Object.keys(update).length > 0) {
      await db.updateEntity('project', projects[0].id, update);
    }
  }

  const summary = await writeToProject(data, false, fountainText);
  return summary;
}

export async function mergeIntoProject(fountainText: string): Promise<ImportSummary> {
  const data = fountainParse(fountainText);
  const summary = await writeToProject(data, true);
  return summary;
}

async function writeToProject(data: FountainData, merge: boolean = false, fountainText: string = ""): Promise<ImportSummary> {
  const summary: ImportSummary = {
    locations: { created: 0, skipped: 0 },
    characters: { created: 0, skipped: 0 },
    scenes: { created: 0, skipped: 0 },
    props: { created: 0, skipped: 0 },
    scene_characters: { created: 0 },
    scene_props: { created: 0 },
  };

  // Build existing lookups for merge dedup
  const existingLocations: Record<string, number> = {};
  const existingCharacters: Record<string, number> = {};
  const existingScenes: Record<string, number> = {};
  const existingProps: Record<string, number> = {};

  if (merge) {
    const locRows = await db.getRows(`SELECT id, name FROM location`);
    locRows.forEach(r => existingLocations[r.name.toLowerCase()] = r.id);
    
    const charRows = await db.getRows(`SELECT id, name FROM character`);
    charRows.forEach(r => existingCharacters[r.name.toLowerCase()] = r.id);
    
    const sceneRows = await db.getRows(`SELECT id, name FROM scene`);
    sceneRows.forEach(r => existingScenes[r.name.toLowerCase()] = r.id);
    
    const propRows = await db.getRows(`SELECT id, name FROM prop`);
    propRows.forEach(r => existingProps[r.name.toLowerCase()] = r.id);
  }

  // 1. Locations
  const locationIdMap: Record<string, number> = {};
  for (const loc of data.locations) {
    const key = loc.name.toLowerCase();
    if (merge && existingLocations[key]) {
      locationIdMap[key] = existingLocations[key];
      summary.locations.skipped++;
      continue;
    }

    const locData: Record<string, any> = { name: stripAnchors(loc.name) };
    const hasInt = loc.raw_headings.some(h => h.toUpperCase().split('.')[0].includes("INT"));
    const hasExt = loc.raw_headings.some(h => h.toUpperCase().split('.')[0].includes("EXT"));
    
    if (hasInt && hasExt) locData.location_type = "Int/Ext";
    else if (hasInt) locData.location_type = "Interior";
    else if (hasExt) locData.location_type = "Exterior";

    const locId = await db.createEntity('location', locData);
    locationIdMap[key] = locId;
    existingLocations[key] = locId;
    summary.locations.created++;
  }

  // 2. Characters
  const characterIdMap: Record<string, number> = {};
  for (const char of data.characters) {
    const key = char.name.toLowerCase();
    if (merge && existingCharacters[key]) {
      characterIdMap[key] = existingCharacters[key];
      summary.characters.skipped++;
      continue;
    }

    const charData: Record<string, any> = { name: stripAnchors(char.name) };
    if (char.description) charData.summary = char.description;
    if (char.hair) charData.hair = char.hair;

    const charId = await db.createEntity('character', charData);
    characterIdMap[key] = charId;
    existingCharacters[key] = charId;
    summary.characters.created++;
  }

  // 3. Scenes
  const sceneIdMap: Record<number, number> = {};
  for (const scene of data.scenes) {
    const sceneKey = scene.name.toLowerCase();
    if (merge && existingScenes[sceneKey]) {
      sceneIdMap[scene.scene_number - 1] = existingScenes[sceneKey];
      summary.scenes.skipped++;
      continue;
    }

    const sceneData: Record<string, any> = {
      name: stripAnchors(scene.name),
      scene_number: scene.scene_number,
    };
    const locKey = scene.location_name.toLowerCase();
    if (locationIdMap[locKey]) {
      sceneData.location_id = locationIdMap[locKey];
    }
    if (scene.int_ext) sceneData.int_ext = scene.int_ext;
    if (scene.time_of_day) sceneData.time_of_day = scene.time_of_day;
    if (scene.summary) sceneData.summary = scene.summary.slice(0, 2000);

    const sceneId = await db.createEntity('scene', sceneData);
    sceneIdMap[scene.scene_number - 1] = sceneId;
    existingScenes[sceneKey] = sceneId;
    summary.scenes.created++;
  }

  // 4. Props
  const propIdMap: Record<string, number> = {};
  for (const prop of data.props) {
    const key = prop.name.toLowerCase();
    if (merge && existingProps[key]) {
      propIdMap[key] = existingProps[key];
      summary.props.skipped++;
      continue;
    }

    const propData: Record<string, any> = { name: prop.name };
    if (prop.context) propData.narrative_significance = prop.context.slice(0, 500);
    if (prop.first_scene < data.scenes.length) {
      const sceneName = data.scenes[prop.first_scene].name;
      propData.first_appearance = `Scene ${prop.first_scene + 1}: ${sceneName}`;
    }

    const propId = await db.createEntity('prop', propData);
    propIdMap[key] = propId;
    existingProps[key] = propId;
    summary.props.created++;
  }

  // 5. Scene-Character junctions
  const existingScJunctions = new Set<string>();
  if (merge) {
    const scRows = await db.getRows(`SELECT scene_id, character_id FROM scene_character`);
    scRows.forEach(r => existingScJunctions.add(`${r.scene_id}-${r.character_id}`));
  }

  for (const scene of data.scenes) {
    const sceneIdx = scene.scene_number - 1;
    const sceneId = sceneIdMap[sceneIdx];
    if (!sceneId) continue;

    for (const scLink of scene.characters) {
      const charKey = scLink.name.toLowerCase();
      const charId = characterIdMap[charKey];
      if (!charId) continue;

      if (existingScJunctions.has(`${sceneId}-${charId}`)) continue;

      const junctionData: Record<string, any> = {
        scene_id: sceneId,
        character_id: charId,
        name: "",
      };
      if (scLink.parentheticals.length > 0) {
        junctionData.notes = scLink.parentheticals.join('; ');
      }
      if (scene.characters.length <= 3) {
        junctionData.role_in_scene = "Featured";
      } else {
        junctionData.role_in_scene = "Supporting";
      }

      await db.createEntity('scene_character', junctionData);
      existingScJunctions.add(`${sceneId}-${charId}`);
      summary.scene_characters.created++;
    }
  }

  // 6. Scene-Prop junctions
  const existingSpJunctions = new Set<string>();
  if (merge) {
    const spRows = await db.getRows(`SELECT scene_id, prop_id FROM scene_prop`);
    spRows.forEach(r => existingSpJunctions.add(`${r.scene_id}-${r.prop_id}`));
  }

  for (const prop of data.props) {
    const propKey = prop.name.toLowerCase();
    const propId = propIdMap[propKey];
    if (!propId) continue;

    const sceneIdx = prop.first_scene;
    const sceneId = sceneIdMap[sceneIdx];
    if (!sceneId) continue;

    if (existingSpJunctions.has(`${sceneId}-${propId}`)) continue;

    const junctionData: Record<string, any> = {
      scene_id: sceneId,
      prop_id: propId,
      name: "",
      significance: CONFIDENCE_TO_SIGNIFICANCE[prop.confidence] || "Present",
    };

    await db.createEntity('scene_prop', junctionData);
    existingSpJunctions.add(`${sceneId}-${propId}`);
    summary.scene_props.created++;
  }

  // 7. Screenplay mapping tables (new project imports only)
  if (!merge) {
    const totalPages = fountainText ? Math.max(1, Math.floor(fountainText.split('\n').length / 55)) : 0;
    await db.exec(
      `INSERT INTO screenplay_meta (title, author, total_scenes, total_pages) VALUES (?, ?, ?, ?)`,
      [data.title, data.author, data.scenes.length, totalPages]
    );

    for (const char of data.characters) {
      const charId = characterIdMap[char.name.toLowerCase()];
      if (charId) {
        await db.exec(
          `INSERT OR IGNORE INTO screenplay_character_map (text_name, character_id, is_primary_name) VALUES (?, ?, 1)`,
          [char.name, charId]
        );
      }
    }

    for (const scene of data.scenes) {
      const sceneIdx = scene.scene_number - 1;
      const sceneId = sceneIdMap[sceneIdx];
      if (sceneId) {
        await db.exec(
          `INSERT INTO screenplay_scene_map (scene_id, heading_text, scene_order, in_screenplay) VALUES (?, ?, ?, 1)`,
          [sceneId, scene.name, scene.scene_number]
        );
      }
    }

    for (const loc of data.locations) {
      const locId = locationIdMap[loc.name.toLowerCase()];
      if (locId) {
        await db.exec(
          `INSERT INTO screenplay_location_map (text_name, location_id) VALUES (?, ?)`,
          [loc.name, locId]
        );
      }
    }
  }

  return summary;
}

export function formatSummary(summary: ImportSummary): string {
  const parts: string[] = [];
  const entities = summary as any;
  for (const key in entities) {
    const counts = entities[key];
    if (counts.created !== undefined || counts.skipped !== undefined) {
      const created = counts.created || 0;
      const skipped = counts.skipped || 0;
      if (created > 0 || skipped > 0) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (skipped > 0) {
          parts.push(`${label}: ${created} created, ${skipped} skipped`);
        } else {
          parts.push(`${label}: ${created} created`);
        }
      }
    }
  }
  return parts.length > 0 ? parts.join(' | ') : "No entities created";
}
