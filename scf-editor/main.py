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
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from entity_registry import (
    get_entity, get_all_entities, get_entities_by_category, EntityDef
)
import database as db


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
    """Get current project path or raise."""
    proj = _get_current_project(request)
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    path = Path("projects") / proj
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Project file not found: {proj}")
    return path


# =============================================================================
# Page routes
# =============================================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Landing / project selector."""
    proj = _get_current_project(request)
    if proj and (Path("projects") / proj).exists():
        return RedirectResponse("/browse", status_code=302)
    projects = db.list_projects()
    for p in projects:
        p["abs_path"] = str(Path(p["path"]).resolve())
    return templates.TemplateResponse("index.html", {
        "request": request,
        "projects": projects,
    })


@app.post("/project/create")
async def project_create(request: Request, project_name: str = Form(...)):
    """Create a new project."""
    try:
        db_path = db.create_project(project_name)
        response = RedirectResponse("/browse", status_code=302)
        response.set_cookie("scf_project", db_path.name, max_age=86400 * 365)
        return response
    except FileExistsError:
        projects = db.list_projects()
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": f"Project '{project_name}' already exists.",
        })


@app.get("/project/open/{filename}")
async def project_open(filename: str):
    """Open an existing project."""
    path = Path("projects") / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
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
    """Import an existing .scf file into the projects folder."""
    if not file.filename or not file.filename.endswith(".scf"):
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": "Please select a valid .scf file.",
        })
    dest = Path("projects") / file.filename
    if dest.exists():
        projects = db.list_projects()
        for p in projects:
            p["abs_path"] = str(Path(p["path"]).resolve())
        return templates.TemplateResponse("index.html", {
            "request": request,
            "projects": projects,
            "error": f"A project named '{file.filename}' already exists.",
        })
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    response = RedirectResponse("/browse", status_code=302)
    response.set_cookie("scf_project", file.filename, max_age=86400 * 365)
    return response


@app.get("/project/download/{filename}")
async def project_download(filename: str):
    """Download a project .scf file."""
    path = Path("projects") / filename
    if not path.exists() or path.suffix != ".scf":
        raise HTTPException(status_code=404, detail="Project file not found")
    return FileResponse(path, filename=filename, media_type="application/octet-stream")


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

    return templates.TemplateResponse("partials/entity_form.html", {
        "request": request,
        "entity": entity_data,
        "entity_def": entity_def,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "reference_options": reference_options,
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
        return templates.TemplateResponse("partials/entity_form.html", {
            "request": request,
            "entity": entity_data,
            "entity_def": entity_def,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "reference_options": reference_options,
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
# Run
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=5000, reload=True)
