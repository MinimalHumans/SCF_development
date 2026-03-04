# SCF Editor — Project Context

## What This Is

The **Story Context Framework (SCF)** Editor is a proof-of-concept authoring tool for a structured database format that defines all elements of a film or narrative project. Think of it like Ftrack/ShotGrid but for creative story elements rather than production tasks.

Previously named SSF (Story State Framework). File extension remains `.scf`.

This is an MVP / functionality demo, not production software.

## Architecture

The system is **metadata-driven**. All entity types (Character, Location, Scene, etc.) are defined in `entity_registry.py`. The database tables, API routes, and UI forms are all generated automatically from those definitions. Adding a new entity type means adding ONE `register()` call in that file — no new routes, templates, or SQL needed.

```
entity_registry.py   ← Single source of truth for all entity types + fields
database.py          ← Auto-creates SQLite tables, generic CRUD operations
main.py              ← FastAPI app with generic routes + link/autocomplete API
queries.py           ← Raw SQL queries for the Query Explorer (JOINs on junction tables)
templates/           ← Jinja2 templates with dynamic form generation
  partials/          ← Reusable components (entity_tree, entity_form, link_panel, search_results)
static/
  css/style.css      ← Dark theme with design tokens (CSS variables)
  js/app.js          ← Tree toggling, tabs, autocomplete, inline linking JS
projects/            ← Created at runtime, holds .scf SQLite files
```

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI / Jinja2
- **Database:** SQLite (single `.scf` file per project)
- **Frontend:** HTML/CSS/JS with htmx for dynamic updates
- **No heavy frontend frameworks** — vanilla JS, htmx for interactivity

## Running

```bash
pip install fastapi uvicorn jinja2 python-multipart aiofiles
python main.py
# Opens at http://127.0.0.1:5000
```

**Important:** Run from the project root folder directly, not from a `.claude/worktrees/` subfolder, so that project files save to the expected `projects/` location.

## Key Concepts

- **EntityDef** — Defines an entity type (name, fields, tabs, category, icon)
- **FieldDef** — Defines a single field (type, label, tab, options, reference to other entity)
- **Field types:** text, textarea, integer, float, select, multiselect, boolean, json, reference
- **Tabs** — Fields are grouped into tabs via the `tab` parameter (default: "General")
- **Categories** — Entity types are grouped in the sidebar tree (Story Entities, Story Structure, Vision, Connections)
- **Projects** — Each is a single `.scf` SQLite file in `projects/`

## SCF Layer Mapping

The entity fields map to the SCF layer concepts:
- **Vision Layer** — Themes, director's intent, emotional architecture (Theme entity, emotional tabs on Scene)
- **Performance Layer** — Physical and vocal character traits (Physical/Voice tabs on Character)
- **Audiovisual Layer** — Visual design, sound, color (Atmosphere/Sound tabs on Location, Technical tab on Scene, Wardrobe tab on Character)

## Current Entity Types

### Standalone Entities (visible in sidebar)
- **Project** — Root container with vision layer
- **Character** — 27 fields, 6 tabs (General, Backstory, Physical, Voice, Relationships, Wardrobe)
- **Location** — 16 fields, 4 tabs (General, Atmosphere, Sound, Details)
- **Prop** — 15 fields, 4 tabs (General, Physical, Story, Notes)
- **Scene** — 18 fields, 5 tabs (General, Characters, Emotional, Technical, Notes)
- **Sequence** — Story structure grouping
- **Theme** — Vision layer thematic elements

### Junction Entities (hidden from sidebar, managed inline)
- **scene_character** — Links characters to scenes (with role: Featured/Supporting/Background/Mentioned/Voiceover)
- **scene_prop** — Links props to scenes (with significance: Key/Present/Background/Mentioned)
- **scene_sequence** — Links scenes to sequences (with order_in_sequence)

These exist in the database and entity_registry.py but are **never shown in the sidebar tree**. They are managed through inline relationship panels on the parent entity editors.

## Inline Relationship System (Celtx-style)

The core UX pattern for entity linking follows the Celtx autocomplete model:

### How it works
- On the **Scene editor**, the Characters tab has a type-to-link input field
- As you type a character name, an autocomplete dropdown shows matches (debounced, 200ms)
- Selecting a match creates a junction record instantly and shows the character as a chip
- If you type a name with **no matches** and press Enter, a new Character entity is created as a placeholder (name only) and immediately linked
- Each linked character shows an inline role dropdown and a remove (×) button
- Same pattern for Props on Scene, and Scenes on Sequence

### Reverse relationships
- Character, Prop, and Location editors show read-only "Appears In" sections
- These display which scenes the entity is linked to (clickable links)
- No editing from the reverse side — manage links from the Scene editor

### API endpoints for linking
- `GET /api/autocomplete/{entity_type}?q=...` — Search entities by name
- `POST /api/link/scene-character` — Create junction (supports `"new:Name"` to auto-create entity)
- `PUT /api/link/scene-character/{link_id}` — Update role/significance
- `DELETE /api/link/scene-character/{link_id}` — Remove link only (not the entity)
- `GET /api/links/scene/{scene_id}/characters` — Get linked characters with junction data
- Same pattern for scene-prop and scene-sequence

## Query Explorer

Accessible from the header bar via "Query Explorer" button. Located at `/query`.

Pre-built query templates that demonstrate cross-entity querying:

1. **Character Journey** — Select character → all scenes they appear in, ordered by scene_number, with location, time of day, other characters, emotional beat
2. **Location Breakdown** — Select location → all scenes set there, characters present, props present
3. **Scene Context** — Select scene → full context dump (location, characters with roles, props with usage, emotional beat, visual style, sound design)
4. **Character Crossover** — Two character dropdowns → scenes where both appear
5. **Project Stats** — Entity counts, most-appearing characters, most-used locations, scenes without characters

Backend: `queries.py` with raw SQL JOIN queries. API routes at `/api/query/*`.

## File Management

Landing page (`/`) supports:
- **Create** new projects
- **Open** existing projects from list
- **Import** `.scf` files from anywhere on disk (file upload → copies to projects/)
- **Export/Download** `.scf` files (browser save dialog)
- **File paths** displayed for each project so user always knows where data lives

## Development Guidelines

- When adding entity types, only edit `entity_registry.py`
- The database auto-migrates (adds missing columns on startup)
- Junction entities (category "Connections") are filtered from the sidebar tree
- htmx handles dynamic UI updates — partials are in `templates/partials/`
- Cookie `scf_project` tracks which .scf file is active
- FastAPI auto-docs available at `/docs` when running
- The `characters_present` JSON field on Scene is deprecated — use the inline linking system instead
- Keep Query Explorer functional — it reads from the same junction tables as inline linking

## Design Tokens

The dark theme uses CSS custom properties defined in `style.css`:
- Backgrounds: `--bg-base` (#111116) through `--bg-active` (#32324a)
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-accent`
- Accent: `--accent` (#6c6cff) with hover, subtle, and glow variants
- Fonts: DM Sans (body), JetBrains Mono (code/labels)
