# SCF Editor — Project Context

## What This Is

The **Story Context Framework (SCF)** Editor is a proof-of-concept authoring tool for a structured database format that defines all elements of a film or narrative project. Think of it like Ftrack/ShotGrid but for creative story elements rather than production tasks.

This is an MVP / functionality demo, not production software.

## Architecture

The system is **metadata-driven**. All entity types (Character, Location, Scene, etc.) are defined in `entity_registry.py`. The database tables, API routes, and UI forms are all generated automatically from those definitions. Adding a new entity type means adding ONE `register()` call in that file — no new routes, templates, or SQL needed.

```
entity_registry.py   ← Single source of truth for all entity types + fields
database.py          ← Auto-creates SQLite tables, generic CRUD operations
main.py              ← FastAPI app with generic routes
templates/           ← Jinja2 templates with dynamic form generation
static/              ← CSS (dark theme) and JS (tree toggling, tabs, htmx)
projects/            ← Created at runtime, holds .scf SQLite files
```

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI / Jinja2
- **Database:** SQLite (single `.scf` file per project)
- **Frontend:** HTML/CSS/JS with htmx for dynamic updates, Alpine.js-style minimal JS
- **No heavy frontend frameworks** — vanilla JS, htmx for interactivity

## Running

```bash
pip install fastapi uvicorn jinja2 python-multipart aiofiles
python main.py
# Opens at http://127.0.0.1:5000
```

## Key Concepts

- **EntityDef** — Defines an entity type (name, fields, tabs, category, icon)
- **FieldDef** — Defines a single field (type, label, tab, options, reference to other entity)
- **Field types:** text, textarea, integer, float, select, multiselect, boolean, json, reference
- **Tabs** — Fields are grouped into tabs via the `tab` parameter (default: "General")
- **Categories** — Entity types are grouped in the sidebar tree (Story Entities, Story Structure, Vision)
- **Projects** — Each is a single `.scf` SQLite file in `projects/`

## SCF Layer Mapping

The entity fields map to the SCF layer concepts:
- **Vision Layer** — Themes, director's intent, emotional architecture (Theme entity, emotional tabs on Scene)
- **Performance Layer** — Physical and vocal character traits (Physical/Voice tabs on Character)
- **Audiovisual Layer** — Visual design, sound, color (Atmosphere/Sound tabs on Location, Technical tab on Scene, Wardrobe tab on Character)

## Current Entity Types

Project, Character (27 fields, 6 tabs), Location (16 fields, 4 tabs), Prop (15 fields, 4 tabs), Scene (18 fields, 5 tabs), Sequence, Theme

## Development Guidelines

- When adding entity types, only edit `entity_registry.py`
- The database auto-migrates (adds missing columns on startup)
- htmx handles dynamic UI updates — partials are in `templates/partials/`
- Cookie `scf_project` tracks which .scf file is active
- FastAPI auto-docs available at `/docs` when running
