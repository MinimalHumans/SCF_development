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
import fountain_sync
from fountain_parser import parse as fountain_parse, _match_scene_heading, _is_character_cue, _CHAR_EXTENSION_RE
from datetime import date, datetime
import re


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


@app.get("/api/screenplay/load")
async def api_screenplay_load(request: Request):
    """Load the .fountain file for editing — anchors stripped for clean display."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    db_path = _require_project(request)

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        return JSONResponse({"has_fountain": False})

    raw_text = fountain_files[0].read_text(encoding="utf-8")
    clean_text = fountain_anchors.strip_anchors(raw_text)

    # Read screenplay_meta for title/author
    title = ""
    author = ""
    conn = db.get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT title, author FROM screenplay_meta WHERE id = 1"
        ).fetchone()
        if row:
            title = row["title"] or ""
            author = row["author"] or ""
    except Exception:
        pass
    finally:
        conn.close()

    return JSONResponse({
        "has_fountain": True,
        "text": clean_text,
        "title": title,
        "author": author,
    })


@app.put("/api/screenplay/save")
async def api_screenplay_save(request: Request):
    """Save editor content back to .fountain file, re-injecting anchors."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        raise HTTPException(status_code=404, detail="No fountain file to save to")

    fountain_path = fountain_files[0]
    body = await request.json()
    new_text = body.get("text", "")

    # Read existing file to extract current anchors
    old_text = fountain_path.read_text(encoding="utf-8")
    reanchored = _reanchor_text(old_text, new_text)

    fountain_path.write_text(reanchored, encoding="utf-8")

    # Run sync engine — parse screenplay and update database
    db_path = _require_project(request)
    sync_report = fountain_sync.sync(db_path, fountain_path)

    return JSONResponse({
        "success": True,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "sync": sync_report.to_dict(),
    })


@app.get("/api/screenplay/scenes")
async def api_screenplay_scenes(request: Request):
    """Return scene list parsed from the stripped fountain text."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    db_path = _require_project(request)

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        return JSONResponse([])

    raw_text = fountain_files[0].read_text(encoding="utf-8")
    stripped = fountain_anchors.strip_anchors(raw_text)
    lines = stripped.splitlines()

    # Load scene_map for scene_id lookup
    conn = db.get_connection(db_path)
    scene_map_by_heading = {}  # heading_lower -> [{"scene_id": N, "scene_order": M}]
    try:
        for row in conn.execute("SELECT scene_id, heading_text, scene_order FROM screenplay_scene_map WHERE in_screenplay = 1").fetchall():
            key = row["heading_text"].lower() if row["heading_text"] else ""
            scene_map_by_heading.setdefault(key, []).append({
                "scene_id": row["scene_id"], "scene_order": row["scene_order"]
            })
        # Sort by scene_order
        for entries in scene_map_by_heading.values():
            entries.sort(key=lambda e: e["scene_order"] or 0)
    finally:
        conn.close()

    # Scan stripped text for scene headings
    scenes = []
    heading_counters = {}  # heading_lower -> occurrence index

    for i, line in enumerate(lines):
        stripped_line = line.strip()
        match = _match_scene_heading(stripped_line) if stripped_line else None
        if match:
            heading_lower = stripped_line.lower()
            occ = heading_counters.get(heading_lower, 0)
            heading_counters[heading_lower] = occ + 1

            int_ext_raw, loc_part, time_part = match
            from fountain_parser import _INT_EXT_MAP, _TIME_MAP
            int_ext = _INT_EXT_MAP.get(int_ext_raw.upper().rstrip("."), "")
            time_of_day = _TIME_MAP.get(time_part.upper(), time_part.title()) if time_part else ""

            # Lookup scene_id
            scene_id = None
            entries = scene_map_by_heading.get(heading_lower)
            if entries and occ < len(entries):
                scene_id = entries[occ]["scene_id"]

            scenes.append({
                "scene_number": len(scenes) + 1,
                "name": stripped_line,
                "line_number": i,
                "character_count": 0,  # filled below
                "characters": [],      # filled below
                "int_ext": int_ext,
                "time_of_day": time_of_day,
                "scene_id": scene_id,
            })

    # Count characters per scene by scanning between headings
    for s_idx, scene in enumerate(scenes):
        start = scene["line_number"] + 1
        end = scenes[s_idx + 1]["line_number"] if s_idx + 1 < len(scenes) else len(lines)
        chars_in_scene = set()
        prev_blank = True
        for j in range(start, end):
            l = lines[j].strip()
            if l == "":
                prev_blank = True
                continue
            if prev_blank and l and _is_character_cue(l):
                char_name = _CHAR_EXTENSION_RE.sub('', l).strip()
                if '(' in char_name:
                    char_name = re.sub(r'\([^)]*\)', '', char_name).strip()
                    char_name = re.sub(r'\s{2,}', ' ', char_name)
                if char_name:
                    chars_in_scene.add(char_name.upper())
            prev_blank = (l == "")
        scene["character_count"] = len(chars_in_scene)
        scene["characters"] = sorted(chars_in_scene)

    return JSONResponse(scenes)


@app.get("/api/screenplay/characters")
async def api_screenplay_characters(request: Request):
    """Return character list with scene counts and entity links."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    db_path = _require_project(request)

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        return JSONResponse([])

    raw_text = fountain_files[0].read_text(encoding="utf-8")
    stripped = fountain_anchors.strip_anchors(raw_text)
    lines = stripped.splitlines()

    # Scan the stripped text for character cues and count scenes per character
    # character_name_upper -> set of scene_indices
    char_scenes = {}
    current_scene = -1
    prev_blank = True
    for i, line in enumerate(lines):
        stripped_line = line.strip()
        if stripped_line == "":
            prev_blank = True
            continue
        if _match_scene_heading(stripped_line):
            current_scene += 1
            prev_blank = False
            continue
        if prev_blank and stripped_line and _is_character_cue(stripped_line):
            char_name = _CHAR_EXTENSION_RE.sub('', stripped_line).strip()
            if '(' in char_name:
                char_name = re.sub(r'\([^)]*\)', '', char_name).strip()
                char_name = re.sub(r'\s{2,}', ' ', char_name)
            if char_name and current_scene >= 0:
                upper = char_name.upper()
                char_scenes.setdefault(upper, set()).add(current_scene)
        prev_blank = (stripped_line == "")

    # Load character mappings from DB
    conn = db.get_connection(db_path)
    try:
        char_map = {}  # text_name_upper -> {character_id, display_name}
        for row in conn.execute(
            """SELECT cm.text_name, cm.character_id, c.name
               FROM screenplay_character_map cm
               LEFT JOIN character c ON cm.character_id = c.id"""
        ).fetchall():
            char_map[row["text_name"].upper()] = {
                "character_id": row["character_id"],
                "display_name": row["name"] or row["text_name"].title(),
            }
    finally:
        conn.close()

    result = []
    for upper_name, scene_set in char_scenes.items():
        mapped = char_map.get(upper_name)
        result.append({
            "name": upper_name,
            "display_name": mapped["display_name"] if mapped else upper_name.title(),
            "scene_count": len(scene_set),
            "character_id": mapped["character_id"] if mapped else None,
            "is_mapped": mapped is not None,
        })

    # Sort by scene_count descending
    result.sort(key=lambda x: x["scene_count"], reverse=True)
    return JSONResponse(result)


@app.get("/api/screenplay/locations")
async def api_screenplay_locations(request: Request):
    """Return location list with scene counts and entity links."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    db_path = _require_project(request)

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        return JSONResponse([])

    raw_text = fountain_files[0].read_text(encoding="utf-8")
    stripped = fountain_anchors.strip_anchors(raw_text)
    lines = stripped.splitlines()

    # Scan for locations from scene headings
    loc_scenes = {}  # loc_name_lower -> set of scene indices
    scene_idx = -1
    for line in lines:
        stripped_line = line.strip()
        match = _match_scene_heading(stripped_line) if stripped_line else None
        if match:
            scene_idx += 1
            _, loc_part, _ = match
            loc_key = loc_part.strip().lower()
            if loc_key:
                loc_scenes.setdefault(loc_key, set()).add(scene_idx)

    # Load location mappings
    conn = db.get_connection(db_path)
    try:
        loc_map = {}  # text_name_lower -> {location_id, display_name}
        for row in conn.execute(
            """SELECT lm.text_name, lm.location_id, l.name
               FROM screenplay_location_map lm
               LEFT JOIN location l ON lm.location_id = l.id"""
        ).fetchall():
            loc_map[row["text_name"].lower()] = {
                "location_id": row["location_id"],
                "display_name": row["name"] or row["text_name"].title(),
            }
    finally:
        conn.close()

    result = []
    for loc_key, scene_set in loc_scenes.items():
        mapped = loc_map.get(loc_key)
        result.append({
            "name": mapped["display_name"] if mapped else loc_key.title(),
            "scene_count": len(scene_set),
            "location_id": mapped["location_id"] if mapped else None,
            "is_mapped": mapped is not None,
        })

    result.sort(key=lambda x: x["scene_count"], reverse=True)
    return JSONResponse(result)


@app.get("/api/screenplay/export")
async def api_screenplay_export(request: Request):
    """Download a clean .fountain file with all anchors stripped."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    db_path = _require_project(request)

    fountain_files = list(project_dir.glob("*.fountain"))
    if not fountain_files:
        raise HTTPException(status_code=404, detail="No fountain file found")

    raw_text = fountain_files[0].read_text(encoding="utf-8")
    clean_text = fountain_anchors.strip_anchors(raw_text)

    # Get project name for the filename
    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else proj

    # Sanitise for filename
    safe_name = "".join(c for c in project_name if c.isalnum() or c in " -_").strip()
    safe_name = safe_name.replace(" ", "_") or proj

    return PlainTextResponse(
        clean_text,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.fountain"',
        },
    )


def _reanchor_text(old_text: str, new_text: str) -> str:
    """Re-inject anchors from old_text into new_text by matching content lines.

    Strategy: build a map of anchor_tag → associated clean content from the old
    file, then scan the new text for matching lines and re-attach the anchors.
    Scene heading anchors match by heading text; character anchors match by
    character cue name.
    """
    # Build mapping: for each line in old_text that has anchors, record
    # { anchor_tag: clean_line_content_stripped }
    old_lines = old_text.splitlines()
    anchor_re = fountain_anchors._SCF_ANCHOR_RE

    # For scene headings: collect (clean_heading_lower, [anchor_tags_on_line])
    # grouped by heading text to handle repeated headings in order
    heading_anchors = {}   # clean_heading_lower -> [ [tag1, tag2], [tag1, tag2], ... ]
    # For character cues: collect (CHAR_NAME_UPPER, anchor_tag) — first occurrence per scene
    char_anchors = {}      # CHAR_NAME_UPPER -> tag  (keep last mapping)

    prev_blank = True
    for line in old_lines:
        stripped = line.strip()
        anchors_on_line = anchor_re.findall(stripped)
        if not anchors_on_line:
            prev_blank = (stripped == '')
            continue

        tags = [f"[[scf:{t}:{i}]]" for t, i in anchors_on_line]
        clean = fountain_anchors.strip_anchor_from_line(stripped).strip()

        # Is this a scene heading?
        if _match_scene_heading(clean):
            key = clean.lower()
            heading_anchors.setdefault(key, [])
            heading_anchors[key].append(tags)
        # Is this a character cue?
        elif prev_blank and clean and _is_character_cue(clean):
            char_name = _CHAR_EXTENSION_RE.sub('', clean).strip()
            if '(' in char_name:
                char_name = re.sub(r'\([^)]*\)', '', char_name).strip()
                char_name = re.sub(r'\s{2,}', ' ', char_name)
            char_upper = char_name.upper()
            # Only keep char anchors (type "char")
            for tag in tags:
                if '[[scf:char:' in tag:
                    char_anchors[char_upper] = tag
                    break

        prev_blank = (stripped == '')

    # Track heading occurrence counters for ordering
    heading_counters = {}  # heading_lower -> int (next index)
    # Track which characters have been anchored in the current scene
    chars_anchored_this_scene = set()

    new_lines = new_text.splitlines()
    result = []
    prev_blank = True

    for line in new_lines:
        stripped = line.strip()

        if stripped == '':
            result.append(line)
            prev_blank = True
            continue

        # Check scene heading
        if _match_scene_heading(stripped):
            chars_anchored_this_scene = set()
            key = stripped.lower()
            occ = heading_counters.get(key, 0)
            heading_counters[key] = occ + 1

            entries = heading_anchors.get(key)
            if entries and occ < len(entries):
                tags = entries[occ]
                leading = line[:len(line) - len(line.lstrip())]
                result.append(f"{leading}{stripped} {' '.join(tags)}")
            else:
                result.append(line)
            prev_blank = False
            continue

        # Check character cue
        if prev_blank and _is_character_cue(stripped):
            char_name = _CHAR_EXTENSION_RE.sub('', stripped).strip()
            if '(' in char_name:
                char_name = re.sub(r'\([^)]*\)', '', char_name).strip()
                char_name = re.sub(r'\s{2,}', ' ', char_name)
            char_upper = char_name.upper()

            if char_upper in char_anchors and char_upper not in chars_anchored_this_scene:
                tag = char_anchors[char_upper]
                leading = line[:len(line) - len(line.lstrip())]
                result.append(f"{leading}{stripped} {tag}")
                chars_anchored_this_scene.add(char_upper)
                prev_blank = False
                continue

        result.append(line)
        prev_blank = False

    return '\n'.join(result)


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
