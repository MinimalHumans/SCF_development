# SCF Editor — MVP

A metadata-driven authoring tool for the **Story Context Framework (SCF)** — a structured database format for defining all elements of a film or narrative project.

## Quick Start

```bash
# Install dependencies
pip install fastapi uvicorn jinja2 python-multipart aiofiles

# Run the editor
cd scf-editor
python main.py
```

Then open **http://127.0.0.1:5000** in your browser.

## Architecture

The entire system is driven by a single source of truth: `entity_registry.py`. Adding a new entity type means adding ONE entry there — the database tables, API routes, and UI forms are all generated automatically.

```
entity_registry.py   ← Defines all entity types + fields (THE source of truth)
        │
        ▼
  database.py        ← Auto-creates SQLite tables, generic CRUD operations
        │
        ▼
  main.py            ← FastAPI app with generic routes (no per-entity code)
        │
        ▼
  templates/         ← Dynamic forms generated from registry metadata
        │
        ▼
  projects/*.scf     ← SQLite databases (one per project)
```

## How to Add a New Entity Type

Edit `entity_registry.py` and add a new `register()` call. That's it.

```python
register(EntityDef(
    name="costume",                    # Internal name (becomes table name)
    label="Costume",                   # Display name
    label_plural="Costumes",           # Plural for tree view
    icon="👗",                         # Tree icon
    category="Story Entities",         # Tree grouping
    sort_order=25,                     # Order within category
    description="A costume or wardrobe piece.",
    fields=[
        FieldDef("name", "Costume Name", required=True),
        FieldDef("character_id", "Character", "reference", reference_entity="character"),
        FieldDef("description", "Description", "textarea"),
        FieldDef("period", "Period", "text", placeholder="e.g. Victorian, Modern"),
        FieldDef("color_notes", "Color Notes", "textarea", tab="Design"),
        FieldDef("material", "Material", "text", tab="Design"),
        FieldDef("notes", "Notes", "textarea", tab="Notes"),
    ],
))
```

After restarting the server, the new entity type will:
- Appear in the sidebar tree
- Have a create (+) button
- Generate a full edit form with tabs
- Support CRUD via the API
- Be searchable via global search
- Persist to the .scf SQLite file

### Field Types

| Type | Renders As | Stored As |
|------|-----------|-----------|
| `text` | Text input | TEXT |
| `textarea` | Multi-line textarea | TEXT |
| `integer` | Number input (step=1) | INTEGER |
| `float` | Number input (step=any) | REAL |
| `select` | Dropdown (provide `options` list) | TEXT |
| `boolean` | Checkbox | INTEGER (0/1) |
| `json` | Textarea with mono font | TEXT |
| `reference` | Dropdown populated from another entity | INTEGER (FK) |

### Tabs

Fields are grouped into tabs via the `tab` parameter. Default is "General". Tabs appear in the order they're first encountered in the fields list.

## Project Files

Each project is a single `.scf` file (SQLite database) in the `projects/` directory. You can:
- Copy them to share
- Open them in DB Browser for SQLite
- Query them directly with SQL
- Back them up by copying the file

## API Endpoints

The FastAPI auto-docs are available at **http://127.0.0.1:5000/docs** when running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/browse` | Main editor UI |
| `POST` | `/api/{entity_type}` | Create entity |
| `PUT` | `/api/{entity_type}/{id}` | Update entity |
| `DELETE` | `/api/{entity_type}/{id}` | Delete entity |
| `GET` | `/api/search?q=...` | Search all entities |
| `GET` | `/htmx/entity-form/{type}/{id}` | Get form partial |
| `GET` | `/htmx/tree` | Get tree partial |
| `GET` | `/htmx/search-results?q=...` | Search results HTML |

## Current Entity Types

- **Project** — Root container with vision layer
- **Character** — Full character with Physical, Voice, Backstory, Wardrobe tabs
- **Location** — With Atmosphere and Sound tabs
- **Prop** — With Physical and Story significance tabs
- **Scene** — With Characters, Emotional, and Technical tabs
- **Sequence** — Story structure grouping
- **Theme** — Vision layer thematic elements

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI
- **Database:** SQLite (single .scf file per project)
- **Frontend:** HTML/CSS/JS with htmx for dynamic updates
- **No heavy frameworks** — vanilla JS, htmx for interactivity

## Next Steps

Possible expansions:
- Shot / Take entities (story structure depth)
- Character Variant support
- Relationship visualization
- Import/export (JSON, CSV)
- More Vision/Performance/Audiovisual layer entities
- File/image attachment support
- Natural language query via LLM
