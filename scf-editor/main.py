"""
SCF Editor — FastAPI Application
==================================
A metadata-driven editor for Story Context Framework projects.
All routes are generic — entity types are resolved from the registry.
"""

import json
import shutil
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form, HTTPException, Query, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from entity_registry import (
    get_entity, get_all_entities, get_entities_by_category, EntityDef
)
import database as db
import queries
import fountain_import
import fountain_anchors
from fountain_parser import parse as fountain_parse
from datetime import date


# =============================================================================
# App setup
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure projects directory exists on startup."""
    Path("projects").mkdir(exist_ok=True)
    yield

app = FastAPI(
    title="SCF Editor",
    description="Story Context Framework — Entity Authoring Tool",
    version="0.1.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# -- Template globals/helpers --
def _add_template_context(request: Request, **kwargs):
    """Common context for all templates."""
    ctx = {
        "request": request,
        "categories": get_entities_by_category(),
        "current_project": _get_current_project(request),
    }
    ctx.update(kwargs)
    return ctx


def _get_current_project(request: Request) -> str | None:
    """Get current project from cookie."""
    return request.cookies.get("scf_project")


def _require_project(request: Request) -> Path:
    """Get current project .scf path or raise. Cookie stores the directory name."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    scf_path = project_dir / f"{proj}.scf"
    if not project_dir.exists() or not scf_path.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {proj}")
    return scf_path


# -- Junction entity auto-naming --
_JUNCTION_NAME_PARTS = {
    "scene_character": [("character_id", "character"), ("scene_id", "scene")],
    "scene_prop": [("prop_id", "prop"), ("scene_id", "scene")],
    "scene_sequence": [("scene_id", "scene"), ("sequence_id", "sequence")],
}


def _get_relationship_data(db_path: Path, entity_type: str, entity_id: int):
    """Get linked entities and reverse links for the entity editor."""
    linked_data = {}
    reverse_links = []
    conn = db.get_connection(db_path)
    try:
        if entity_type == "scene":
            linked_data["characters"] = _query_links(conn, "scene", entity_id, "characters")
            linked_data["props"] = _query_links(conn, "scene", entity_id, "props")
        elif entity_type == "sequence":
            linked_data["scenes"] = _query_links(conn, "sequence", entity_id, "scenes")
        elif entity_type == "character":
            reverse_links = _query_links(conn, "character", entity_id, "scenes")
        elif entity_type == "prop":
            reverse_links = _query_links(conn, "prop", entity_id, "scenes")
        elif entity_type == "location":
            reverse_links = _query_links(conn, "location", entity_id, "scenes")
    finally:
        conn.close()
    return linked_data, reverse_links


def _auto_name_junction(db_path: Path, entity_type: str, entity_id: int):
    """Compute a display name for junction entities from their references."""
    parts_spec = _JUNCTION_NAME_PARTS.get(entity_type)
    if not parts_spec:
        return

    record = db.get_entity_by_id(db_path, entity_type, entity_id)
    if not record:
        return

    name_parts = []
    for ref_field, ref_entity_type in parts_spec:
        ref_id = record.get(ref_field)
        if ref_id:
            ref_def = get_entity(ref_entity_type)
            ref_record = db.get_entity_by_id(db_path, ref_entity_type, ref_id)
            if ref_record and ref_def:
                name_parts.append(str(ref_record.get(ref_def.name_field, f"#{ref_id}")))
            else:
                name_parts.append(f"#{ref_id}")
        else:
            name_parts.append("?")

    display_name = " in ".join(name_parts)
    db.update_entity(db_path, entity_type, entity_id, {"name": display_name})


# =============================================================================
# Page routes
# =============================================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Landing / project selector."""
    proj = _get_current_project(request)
    if proj:
        project_dir = Path("projects") / proj
        scf_path = project_dir / f"{proj}.scf"
        if project_dir.exists() and scf_path.exists():
            return RedirectResponse("/browse", status_code=302)
    projects = db.list_projects()
    for p in projects:
        p["abs_path"] = str(Path(p["dir_path"]).resolve())
    return templates.TemplateResponse("index.html", {
        "request": request,
        "projects": projects,
    })


@app.post("/project/create")
async def project_create(request: Request, project_name: str = Form(...)):
    """Create a new project."""
    try:
        db_path = db.create_project(project_name)
        # Cookie stores the directory name (parent of the .scf file)
        dir_name = db_path.parent.name
        response = RedirectResponse("/browse", status_code=302)
        response.set_cookie("scf_project", dir_name, max_age=86400 * 365)
        return response
    except FileExistsError:
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["dir_path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": f"Project '{project_name}' already exists.",
        })


@app.get("/project/open/{filename}")
async def project_open(filename: str):
    """Open an existing project (auto-migrates tables for new entity types).
    filename is the project directory name."""
    project_dir = Path("projects") / filename
    scf_path = project_dir / f"{filename}.scf"
    if not project_dir.exists() or not scf_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    # Auto-migrate: ensures new entity tables (e.g. junction tables) exist
    db.init_database(scf_path)
    response = RedirectResponse("/browse", status_code=302)
    response.set_cookie("scf_project", filename, max_age=86400 * 365)
    return response


@app.get("/project/close")
async def project_close():
    """Close current project."""
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie("scf_project")
    return response


@app.post("/project/import")
async def project_import(request: Request, file: UploadFile = File(...)):
    """Import an existing .scf file into a project directory."""
    if not file.filename or not file.filename.endswith(".scf"):
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["dir_path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": "Please select a valid .scf file.",
        })
    dir_name = file.filename.rsplit(".", 1)[0]
    # Sanitize same as get_db_path
    dir_name = "".join(c for c in dir_name if c.isalnum() or c in " -_").strip()
    dir_name = dir_name.replace(" ", "_").lower()
    project_dir = Path("projects") / dir_name
    if project_dir.exists():
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["dir_path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": f"A project named '{dir_name}' already exists.",
        })
    project_dir.mkdir(parents=True)
    dest = project_dir / f"{dir_name}.scf"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    response = RedirectResponse("/browse", status_code=302)
    response.set_cookie("scf_project", dir_name, max_age=86400 * 365)
    return response


@app.get("/project/download/{filename}")
async def project_download(filename: str):
    """Download a project .scf file. filename is the project directory name."""
    project_dir = Path("projects") / filename
    scf_path = project_dir / f"{filename}.scf"
    if not scf_path.exists():
        raise HTTPException(status_code=404, detail="Project file not found")
    return FileResponse(scf_path, filename=f"{filename}.scf", media_type="application/octet-stream")


@app.get("/browse", response_class=HTMLResponse)
async def browse(request: Request, entity_type: str = None, entity_id: int = None):
    """Main two-panel browser view."""
    db_path = _require_project(request)

    # Build tree data: counts per entity type
    tree_data = {}
    for name, edef in get_all_entities().items():
        if name == "project":
            continue
        try:
            items = db.list_entities(db_path, name)
            tree_data[name] = {
                "def": edef,
                "records": items,
                "count": len(items),
            }
        except Exception:
            tree_data[name] = {"def": edef, "records": [], "count": 0}

    # Selected entity data
    selected = None
    selected_def = None
    if entity_type and entity_id:
        selected_def = get_entity(entity_type)
        if selected_def:
            selected = db.get_entity_by_id(db_path, entity_type, entity_id)

    # Reference field resolution (populate dropdowns for reference fields)
    reference_options = {}
    if selected_def:
        for f in selected_def.fields:
            if f.field_type == "reference" and f.reference_entity:
                ref_def = get_entity(f.reference_entity)
                if ref_def:
                    ref_items = db.list_entities(db_path, f.reference_entity)
                    reference_options[f.name] = [
                        {"id": item["id"], "name": item.get(ref_def.name_field, f"#{item['id']}")}
                        for item in ref_items
                    ]

    # Linked entities data for inline relationship panels
    linked_data = {}
    reverse_links = []
    if entity_type and entity_id:
        linked_data, reverse_links = _get_relationship_data(db_path, entity_type, entity_id)

    # Get project info
    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else "Untitled"

    return templates.TemplateResponse("browse.html", _add_template_context(
        request,
        tree_data=tree_data,
        selected=selected,
        selected_def=selected_def,
        selected_type=entity_type,
        selected_id=entity_id,
        reference_options=reference_options,
        linked_data=linked_data,
        reverse_links=reverse_links,
        project_name=project_name,
    ))


# =============================================================================
# HTMX Partial routes (for dynamic updates without full page reload)
# =============================================================================

@app.get("/htmx/entity-form/{entity_type}/{entity_id}", response_class=HTMLResponse)
async def htmx_entity_form(request: Request, entity_type: str, entity_id: int):
    """Return just the entity edit form (for htmx swaps)."""
    db_path = _require_project(request)
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise HTTPException(status_code=404, detail="Unknown entity type")

    entity_data = db.get_entity_by_id(db_path, entity_type, entity_id)
    if not entity_data:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Resolve references
    reference_options = {}
    for f in entity_def.fields:
        if f.field_type == "reference" and f.reference_entity:
            ref_def = get_entity(f.reference_entity)
            if ref_def:
                ref_items = db.list_entities(db_path, f.reference_entity)
                reference_options[f.name] = [
                    {"id": item["id"], "name": item.get(ref_def.name_field, f"#{item['id']}")}
                    for item in ref_items
                ]

    # Linked entities data
    linked_data, reverse_links = _get_relationship_data(db_path, entity_type, entity_id)

    return templates.TemplateResponse("partials/entity_form.html", {
        "request": request,
        "entity": entity_data,
        "entity_def": entity_def,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "reference_options": reference_options,
        "linked_data": linked_data,
        "reverse_links": reverse_links,
    })


@app.get("/htmx/tree", response_class=HTMLResponse)
async def htmx_tree(request: Request):
    """Return just the tree panel (for htmx refresh after create/delete)."""
    db_path = _require_project(request)
    tree_data = {}
    for name, edef in get_all_entities().items():
        if name == "project":
            continue
        try:
            items = db.list_entities(db_path, name)
            tree_data[name] = {"def": edef, "records": items, "count": len(items)}
        except Exception:
            tree_data[name] = {"def": edef, "records": [], "count": 0}

    return templates.TemplateResponse("partials/entity_tree.html", {
        "request": request,
        "tree_data": tree_data,
        "categories": get_entities_by_category(),
        "selected_type": request.query_params.get("selected_type"),
        "selected_id": request.query_params.get("selected_id"),
    })


# =============================================================================
# API routes (CRUD)
# =============================================================================

@app.post("/api/{entity_type}")
async def api_create(request: Request, entity_type: str):
    """Create a new entity."""
    db_path = _require_project(request)
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise HTTPException(status_code=404, detail="Unknown entity type")

    form = await request.form()
    data = dict(form)

    # Set a default name if not provided
    if entity_def.name_field not in data or not data[entity_def.name_field]:
        count = db.count_entities(db_path, entity_type)
        data[entity_def.name_field] = f"New {entity_def.label} {count + 1}"

    new_id = db.create_entity(db_path, entity_type, data)
    _auto_name_junction(db_path, entity_type, new_id)

    # If htmx request, redirect to browse
    if request.headers.get("HX-Request"):
        return HTMLResponse(
            status_code=200,
            headers={"HX-Redirect": f"/browse?entity_type={entity_type}&entity_id={new_id}"}
        )
    return JSONResponse({"id": new_id, "entity_type": entity_type})


@app.put("/api/{entity_type}/{entity_id}")
async def api_update(request: Request, entity_type: str, entity_id: int):
    """Update an entity."""
    db_path = _require_project(request)
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise HTTPException(status_code=404, detail="Unknown entity type")

    form = await request.form()
    data = dict(form)

    # Clean up empty strings for integer/float fields
    for f in entity_def.fields:
        if f.name in data:
            if f.field_type in ("integer", "float") and data[f.name] == "":
                data[f.name] = None

    success = db.update_entity(db_path, entity_type, entity_id, data)
    _auto_name_junction(db_path, entity_type, entity_id)

    if request.headers.get("HX-Request"):
        # Return updated form with a success indicator
        entity_data = db.get_entity_by_id(db_path, entity_type, entity_id)
        reference_options = {}
        for f in entity_def.fields:
            if f.field_type == "reference" and f.reference_entity:
                ref_def = get_entity(f.reference_entity)
                if ref_def:
                    ref_items = db.list_entities(db_path, f.reference_entity)
                    reference_options[f.name] = [
                        {"id": item["id"], "name": item.get(ref_def.name_field, f"#{item['id']}")}
                        for item in ref_items
                    ]
        linked_data, reverse_links = _get_relationship_data(db_path, entity_type, entity_id)
        return templates.TemplateResponse("partials/entity_form.html", {
            "request": request,
            "entity": entity_data,
            "entity_def": entity_def,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "reference_options": reference_options,
            "linked_data": linked_data,
            "reverse_links": reverse_links,
            "save_success": True,
        })

    return JSONResponse({"success": success})


@app.delete("/api/{entity_type}/{entity_id}")
async def api_delete(request: Request, entity_type: str, entity_id: int):
    """Delete an entity."""
    db_path = _require_project(request)
    success = db.delete_entity(db_path, entity_type, entity_id)

    if request.headers.get("HX-Request"):
        return HTMLResponse(
            status_code=200,
            headers={"HX-Redirect": f"/browse"}
        )
    return JSONResponse({"success": success})


@app.get("/api/search")
async def api_search(request: Request, q: str = Query("")):
    """Search across all entity types."""
    if not q or len(q) < 2:
        return JSONResponse([])
    db_path = _require_project(request)
    results = db.search_all(db_path, q)
    return JSONResponse(results)


@app.get("/htmx/search-results", response_class=HTMLResponse)
async def htmx_search(request: Request, q: str = Query("")):
    """Return search results as HTML partial."""
    if not q or len(q) < 2:
        return HTMLResponse('<div class="search-empty">Type to search…</div>')
    db_path = _require_project(request)
    results = db.search_all(db_path, q)
    return templates.TemplateResponse("partials/search_results.html", {
        "request": request,
        "results": results,
        "query": q,
    })


# =============================================================================
# Query Explorer
# =============================================================================

@app.get("/query", response_class=HTMLResponse)
async def query_page(request: Request):
    """Query Explorer page."""
    db_path = _require_project(request)

    # Load entity lists for dropdowns
    characters = db.list_entities(db_path, "character")
    locations = db.list_entities(db_path, "location")
    scenes = db.list_entities(db_path, "scene")

    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else "Untitled"

    return templates.TemplateResponse("query.html", _add_template_context(
        request,
        characters=characters,
        locations=locations,
        scenes=scenes,
        project_name=project_name,
    ))


@app.get("/api/query/character-journey")
async def api_query_character_journey(request: Request, character_id: int = Query(...)):
    db_path = _require_project(request)
    results = queries.character_journey(db_path, character_id)
    return JSONResponse(results)


@app.get("/api/query/location-breakdown")
async def api_query_location_breakdown(request: Request, location_id: int = Query(...)):
    db_path = _require_project(request)
    results = queries.location_breakdown(db_path, location_id)
    return JSONResponse(results)


@app.get("/api/query/scene-context")
async def api_query_scene_context(request: Request, scene_id: int = Query(...)):
    db_path = _require_project(request)
    result = queries.scene_context(db_path, scene_id)
    return JSONResponse(result)


@app.get("/api/query/character-crossover")
async def api_query_character_crossover(request: Request,
                                         char1: int = Query(...),
                                         char2: int = Query(...)):
    db_path = _require_project(request)
    results = queries.character_crossover(db_path, char1, char2)
    return JSONResponse(results)


@app.get("/api/query/project-stats")
async def api_query_project_stats(request: Request):
    db_path = _require_project(request)
    results = queries.project_stats(db_path)
    return JSONResponse(results)


# =============================================================================
# Screenplay Editor
# =============================================================================

@app.get("/screenplay", response_class=HTMLResponse)
async def screenplay_page(request: Request):
    """Screenplay Editor page."""
    db_path = _require_project(request)
    proj = _get_current_project(request)
    project_dir = Path("projects") / proj

    # Check for .fountain file
    fountain_files = list(project_dir.glob("*.fountain"))
    has_fountain = len(fountain_files) > 0

    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else "Untitled"

    return templates.TemplateResponse("screenplay.html", _add_template_context(
        request,
        has_fountain=has_fountain,
        project_name=project_name,
    ))


@app.post("/project/import-fountain-into-current")
async def project_import_fountain_into_current(
    request: Request,
    file: UploadFile = File(...),
):
    """Import a .fountain file into the current project (no new project created)."""
    if not file.filename or not file.filename.endswith(".fountain"):
        return RedirectResponse("/screenplay", status_code=302)

    db_path = _require_project(request)
    proj = _get_current_project(request)
    project_dir = Path("projects") / proj

    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    # Parse and write entities into the existing project (merge mode for safety)
    data = fountain_parse(text)
    summary, anchor_maps = fountain_import._write_to_project(
        data, db_path, merge=True, fountain_text=text
    )

    # Inject anchors into the fountain text
    anchored_text = text
    if anchor_maps:
        scene_map, char_map, loc_map = anchor_maps
        anchored_text = fountain_anchors.inject_anchors(
            text, scene_map, char_map, loc_map
        )

    # Save the anchored .fountain file into the project directory
    fountain_dest = project_dir / f"{proj}.fountain"
    fountain_dest.write_text(anchored_text, encoding="utf-8")

    response = RedirectResponse("/screenplay", status_code=302)
    return response


@app.post("/project/create-fountain")
async def project_create_fountain(request: Request):
    """Create a blank .fountain file in the current project directory."""
    db_path = _require_project(request)
    proj = _get_current_project(request)
    project_dir = Path("projects") / proj

    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else "Untitled"

    today = date.today().strftime("%Y-%m-%d")
    blank_fountain = f"""Title: {project_name}
Author:
Draft date: {today}

EXT. LOCATION - DAY

Action description.

CHARACTER
Dialogue.
"""

    fountain_dest = project_dir / f"{proj}.fountain"
    fountain_dest.write_text(blank_fountain, encoding="utf-8")

    # Create screenplay_meta record
    conn = db.get_connection(db_path)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO screenplay_meta (id, fountain_path, title) VALUES (1, ?, ?)",
            (str(fountain_dest), project_name)
        )
        conn.commit()
    finally:
        conn.close()

    response = RedirectResponse("/screenplay", status_code=302)
    return response


@app.get("/api/screenplay/content")
async def api_screenplay_content(request: Request):
    """Return the raw .fountain file content for the current project."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        raise HTTPException(status_code=404, detail="No fountain file found")

    text = fountain_files[0].read_text(encoding="utf-8")
    return PlainTextResponse(text)


# =============================================================================
# Inline Relationship Linking API
# =============================================================================

# Config for junction types: maps URL slug to DB/entity details
_LINK_CONFIG = {
    "scene-character": {
        "junction_table": "scene_character",
        "parent_field": "scene_id",
        "child_field": "character_id",
        "child_entity": "character",
        "meta_fields": ["role_in_scene", "notes"],
    },
    "scene-prop": {
        "junction_table": "scene_prop",
        "parent_field": "scene_id",
        "child_field": "prop_id",
        "child_entity": "prop",
        "meta_fields": ["significance", "usage_note"],
    },
    "scene-sequence": {
        "junction_table": "scene_sequence",
        "parent_field": "sequence_id",
        "child_field": "scene_id",
        "child_entity": "scene",
        "meta_fields": ["order_in_sequence"],
    },
}


@app.get("/api/autocomplete/{entity_type}")
async def api_autocomplete(request: Request, entity_type: str, q: str = Query("")):
    """Autocomplete search for entity names."""
    if not q:
        return JSONResponse([])
    db_path = _require_project(request)
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise HTTPException(status_code=404, detail="Unknown entity type")
    items = db.list_entities(db_path, entity_type, search=q, limit=10)
    results = [{"id": item["id"], "name": item.get(entity_def.name_field, f"#{item['id']}")}
               for item in items]
    return JSONResponse(results)


@app.post("/api/link/{junction_type}")
async def api_link_create(request: Request, junction_type: str):
    """Create a junction link. Supports creating new child entities inline."""
    cfg = _LINK_CONFIG.get(junction_type)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown junction type")

    db_path = _require_project(request)
    body = await request.json()

    parent_id = body.get("parent_id")
    child_id = body.get("child_id")
    new_name = body.get("new_name")
    is_new = False

    if not parent_id:
        raise HTTPException(status_code=400, detail="parent_id required")

    # Create new child entity if needed
    if not child_id and new_name:
        child_id = db.create_entity(db_path, cfg["child_entity"], {"name": new_name})
        is_new = True
    elif not child_id:
        raise HTTPException(status_code=400, detail="child_id or new_name required")

    # Check for duplicate link
    conn = db.get_connection(db_path)
    try:
        existing = conn.execute(
            f"SELECT id FROM {cfg['junction_table']} WHERE {cfg['parent_field']} = ? AND {cfg['child_field']} = ?",
            (parent_id, child_id)
        ).fetchone()
        if existing:
            return JSONResponse({"id": existing["id"], "child_id": child_id, "is_new": False, "duplicate": True})
    finally:
        conn.close()

    # Build junction data
    junction_data = {
        cfg["parent_field"]: parent_id,
        cfg["child_field"]: child_id,
        "name": "",  # auto-named later
    }
    for mf in cfg["meta_fields"]:
        if mf in body:
            junction_data[mf] = body[mf]

    link_id = db.create_entity(db_path, cfg["junction_table"], junction_data)
    _auto_name_junction(db_path, cfg["junction_table"], link_id)

    return JSONResponse({"id": link_id, "child_id": child_id, "is_new": is_new})


@app.delete("/api/link/{junction_type}/{link_id}")
async def api_link_delete(request: Request, junction_type: str, link_id: int):
    """Delete a junction link."""
    cfg = _LINK_CONFIG.get(junction_type)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown junction type")
    db_path = _require_project(request)
    success = db.delete_entity(db_path, cfg["junction_table"], link_id)
    return JSONResponse({"success": success})


@app.put("/api/link/{junction_type}/{link_id}")
async def api_link_update(request: Request, junction_type: str, link_id: int):
    """Update junction metadata (role, significance, order)."""
    cfg = _LINK_CONFIG.get(junction_type)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown junction type")
    db_path = _require_project(request)
    body = await request.json()

    # Only allow updating meta fields
    update_data = {k: v for k, v in body.items() if k in cfg["meta_fields"]}
    if not update_data:
        return JSONResponse({"success": False, "detail": "No valid fields"})

    success = db.update_entity(db_path, cfg["junction_table"], link_id, update_data)
    return JSONResponse({"success": success})


@app.get("/api/links/{parent_type}/{parent_id}/{link_type}")
async def api_links_list(request: Request, parent_type: str, parent_id: int, link_type: str):
    """List linked entities for a parent. Handles both forward and reverse lookups."""
    db_path = _require_project(request)
    conn = db.get_connection(db_path)
    try:
        results = _query_links(conn, parent_type, parent_id, link_type)
        return JSONResponse(results)
    finally:
        conn.close()


def _query_links(conn, parent_type: str, parent_id: int, link_type: str) -> list[dict]:
    """Query linked entities. Used by both API and template rendering."""

    if parent_type == "scene" and link_type == "characters":
        rows = conn.execute("""
            SELECT sc.id AS link_id, sc.role_in_scene, sc.notes AS link_notes,
                   c.id AS entity_id, c.name AS entity_name
            FROM scene_character sc
            JOIN character c ON c.id = sc.character_id
            WHERE sc.scene_id = ?
            ORDER BY c.name
        """, (parent_id,)).fetchall()
        return [dict(r) for r in rows]

    elif parent_type == "scene" and link_type == "props":
        rows = conn.execute("""
            SELECT sp.id AS link_id, sp.significance, sp.usage_note,
                   p.id AS entity_id, p.name AS entity_name
            FROM scene_prop sp
            JOIN prop p ON p.id = sp.prop_id
            WHERE sp.scene_id = ?
            ORDER BY p.name
        """, (parent_id,)).fetchall()
        return [dict(r) for r in rows]

    elif parent_type == "sequence" and link_type == "scenes":
        rows = conn.execute("""
            SELECT ss.id AS link_id, ss.order_in_sequence,
                   s.id AS entity_id, s.name AS entity_name, s.scene_number
            FROM scene_sequence ss
            JOIN scene s ON s.id = ss.scene_id
            WHERE ss.sequence_id = ?
            ORDER BY ss.order_in_sequence ASC, s.scene_number ASC
        """, (parent_id,)).fetchall()
        return [dict(r) for r in rows]

    # Reverse lookups
    elif parent_type == "character" and link_type == "scenes":
        rows = conn.execute("""
            SELECT sc.id AS link_id, sc.role_in_scene,
                   s.id AS entity_id, s.name AS entity_name, s.scene_number
            FROM scene_character sc
            JOIN scene s ON s.id = sc.scene_id
            WHERE sc.character_id = ?
            ORDER BY s.scene_number ASC, s.id ASC
        """, (parent_id,)).fetchall()
        return [dict(r) for r in rows]

    elif parent_type == "prop" and link_type == "scenes":
        rows = conn.execute("""
            SELECT sp.id AS link_id, sp.significance,
                   s.id AS entity_id, s.name AS entity_name, s.scene_number
            FROM scene_prop sp
            JOIN scene s ON s.id = sp.scene_id
            WHERE sp.prop_id = ?
            ORDER BY s.scene_number ASC, s.id ASC
        """, (parent_id,)).fetchall()
        return [dict(r) for r in rows]

    elif parent_type == "location" and link_type == "scenes":
        rows = conn.execute("""
            SELECT s.id AS entity_id, s.name AS entity_name, s.scene_number
            FROM scene s
            WHERE s.location_id = ?
            ORDER BY s.scene_number ASC, s.id ASC
        """, (parent_id,)).fetchall()
        return [{"link_id": None, **dict(r)} for r in rows]

    return []


# =============================================================================
# Fountain Screenplay Import
# =============================================================================

@app.post("/project/import-fountain")
async def project_import_fountain(
    request: Request,
    file: UploadFile = File(...),
    project_name: str = Form(""),
):
    """Import a .fountain screenplay as a new SCF project."""
    if not file.filename or not file.filename.endswith(".fountain"):
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["dir_path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": "Please select a valid .fountain file.",
        })

    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    # Use filename as project name if none provided
    if not project_name.strip():
        project_name = file.filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()

    try:
        db_path, summary, anchored_text = fountain_import.import_as_new_project(text, project_name)
    except FileExistsError:
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["dir_path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": f"Project '{project_name}' already exists.",
        })

    # Save the anchored .fountain file into the project directory
    project_dir = db_path.parent
    fountain_dest = project_dir / f"{project_dir.name}.fountain"
    fountain_dest.write_text(anchored_text, encoding="utf-8")

    dir_name = project_dir.name
    response = RedirectResponse("/browse", status_code=302)
    response.set_cookie("scf_project", dir_name, max_age=86400 * 365)
    msg = fountain_import.format_summary(summary)
    response.set_cookie("import_summary", msg, max_age=30)
    return response


@app.post("/project/merge-fountain")
async def project_merge_fountain(
    request: Request,
    file: UploadFile = File(...),
    target_project: str = Form(...),
):
    """Merge a .fountain screenplay into an existing SCF project."""
    if not file.filename or not file.filename.endswith(".fountain"):
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["dir_path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": "Please select a valid .fountain file.",
        })

    project_dir = Path("projects") / target_project
    target_path = project_dir / f"{target_project}.scf"
    if not project_dir.exists() or not target_path.exists():
        raise HTTPException(status_code=404, detail="Target project not found")

    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    summary = fountain_import.merge_into_project(text, target_path)

    response = RedirectResponse("/browse", status_code=302)
    response.set_cookie("scf_project", target_project, max_age=86400 * 365)
    msg = fountain_import.format_summary(summary)
    response.set_cookie("import_summary", msg, max_age=30)
    return response


# =============================================================================
# Run
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=5000, reload=True)
