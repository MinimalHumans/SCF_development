"""
Screenplay API v2 — Structured Line-Based Routes
===================================================
These routes serve the new SQLite-native screenplay editor.
All data flows through screenplay_lines, not Fountain text.

Mount in main.py:
    from screenplay_api import screenplay_router
    app.include_router(screenplay_router)

IMPORTANT: Mount BEFORE the generic CRUD routes so /api/screenplay-v2/*
matches before /api/{entity_type}/{entity_id}.
"""

import shutil
from pathlib import Path
from datetime import date, datetime

from fastapi import APIRouter, Request, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse

import database as db
import screenplay_db

screenplay_router = APIRouter(prefix="/api/screenplay-v2", tags=["screenplay-v2"])


def _require_project(request: Request) -> Path:
    """Get current project .scf path or raise."""
    proj = request.cookies.get("scf_project")
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    scf_path = project_dir / f"{proj}.scf"
    if not scf_path.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {proj}")
    return scf_path


def _project_dir(request: Request) -> Path:
    proj = request.cookies.get("scf_project")
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    return Path("projects") / proj


# ═══════════════════════════════════════════════════════════════════════════
# Load / Save
# ═══════════════════════════════════════════════════════════════════════════

@screenplay_router.get("/load")
async def load(request: Request):
    """Load the full screenplay for the editor."""
    db_path = _require_project(request)
    data = screenplay_db.load_screenplay(db_path)
    return JSONResponse(data)


@screenplay_router.put("/save")
async def save(request: Request):
    """Save the full screenplay from the editor."""
    db_path = _require_project(request)
    body = await request.json()

    title_page = body.get("title_page", [])
    lines = body.get("lines", [])

    summary = screenplay_db.save_screenplay(db_path, title_page, lines)

    return JSONResponse({
        "success": True,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "summary": summary,
    })


# ═══════════════════════════════════════════════════════════════════════════
# Navigator Data
# ═══════════════════════════════════════════════════════════════════════════

@screenplay_router.get("/scenes")
async def scenes(request: Request):
    """Scene list for the navigator panel."""
    db_path = _require_project(request)
    return JSONResponse(screenplay_db.get_scenes(db_path))


@screenplay_router.get("/characters")
async def characters(request: Request):
    """Character list with scene counts."""
    db_path = _require_project(request)
    return JSONResponse(screenplay_db.get_characters(db_path))


@screenplay_router.get("/locations")
async def locations(request: Request):
    """Location list with scene counts."""
    db_path = _require_project(request)
    return JSONResponse(screenplay_db.get_locations(db_path))


# ═══════════════════════════════════════════════════════════════════════════
# Entity Autocomplete
# ═══════════════════════════════════════════════════════════════════════════

@screenplay_router.get("/autocomplete-characters")
async def autocomplete_characters(request: Request, q: str = Query("")):
    """Autocomplete character names from the character entity table."""
    if not q or len(q) < 2:
        return JSONResponse([])
    db_path = _require_project(request)

    conn = db.get_connection(db_path)
    try:
        rows = conn.execute(
            """SELECT id, name FROM character
               WHERE name LIKE ? COLLATE NOCASE
               ORDER BY name LIMIT 8""",
            (f"%{q}%",)
        ).fetchall()

        return JSONResponse([
            {
                "character_id": r["id"],
                "name": r["name"].upper(),
                "display_name": r["name"],
            }
            for r in rows
        ])
    finally:
        conn.close()


@screenplay_router.get("/autocomplete-locations")
async def autocomplete_locations(request: Request, q: str = Query("")):
    """Autocomplete location names from the location entity table."""
    if not q or len(q) < 1:
        return JSONResponse([])
    db_path = _require_project(request)

    conn = db.get_connection(db_path)
    try:
        rows = conn.execute(
            """SELECT id, name FROM location
               WHERE name LIKE ? COLLATE NOCASE
               ORDER BY name LIMIT 8""",
            (f"%{q}%",)
        ).fetchall()

        return JSONResponse([
            {
                "location_id": r["id"],
                "name": r["name"],
            }
            for r in rows
        ])
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# Fountain Import / Export
# ═══════════════════════════════════════════════════════════════════════════

@screenplay_router.get("/export-fountain")
async def export_fountain(request: Request):
    """Export the screenplay as a clean .fountain file."""
    db_path = _require_project(request)
    text = screenplay_db.export_fountain(db_path)

    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else "screenplay"
    safe_name = "".join(c for c in project_name if c.isalnum() or c in " -_").strip()
    safe_name = safe_name.replace(" ", "_") or "screenplay"

    return PlainTextResponse(
        text,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.fountain"',
        },
    )


@screenplay_router.post("/import-fountain")
async def import_fountain(request: Request, file: UploadFile = File(...)):
    """Import a .fountain file into screenplay_lines for the current project."""
    if not file.filename or not file.filename.endswith(".fountain"):
        raise HTTPException(status_code=400, detail="Please upload a .fountain file")

    db_path = _require_project(request)
    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    summary = screenplay_db.import_fountain_to_lines(db_path, text)

    return JSONResponse({
        "success": True,
        "summary": summary,
    })


@screenplay_router.post("/create-blank")
async def create_blank(request: Request):
    """Create a blank screenplay with a title page template."""
    db_path = _require_project(request)

    project_info = db.list_entities(db_path, "project", limit=1)
    project_name = project_info[0]["name"] if project_info else "Untitled"
    today = date.today().strftime("%Y-%m-%d")

    title_page = [
        {"key": "Title", "value": project_name},
        {"key": "Author", "value": ""},
        {"key": "Draft date", "value": today},
    ]

    # Create a minimal starting scene
    lines = [
        {"line_type": "blank", "content": ""},
        {"line_type": "heading", "content": "EXT. LOCATION - DAY"},
        {"line_type": "blank", "content": ""},
        {"line_type": "action", "content": "Action description."},
        {"line_type": "blank", "content": ""},
        {"line_type": "character", "content": "CHARACTER"},
        {"line_type": "dialogue", "content": "Dialogue."},
        {"line_type": "blank", "content": ""},
    ]

    summary = screenplay_db.save_screenplay(db_path, title_page, lines)

    return JSONResponse({
        "success": True,
        "summary": summary,
    })


# ═══════════════════════════════════════════════════════════════════════════
# Line-level operations (for future incremental saves)
# ═══════════════════════════════════════════════════════════════════════════

@screenplay_router.put("/line/{line_id}/link")
async def link_line_entity(request: Request, line_id: int):
    """
    Update entity links on a specific line.
    Body: {"character_id": N} or {"location_id": N} or {"scene_id": N}
    Used when the user selects an autocomplete suggestion.
    """
    db_path = _require_project(request)
    body = await request.json()

    conn = db.get_connection(db_path)
    try:
        allowed_fields = {"character_id", "location_id", "scene_id"}
        updates = {k: v for k, v in body.items() if k in allowed_fields}
        if not updates:
            return JSONResponse({"success": False, "detail": "No valid fields"})

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [line_id]
        conn.execute(
            f"UPDATE screenplay_lines SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
        return JSONResponse({"success": True})
    finally:
        conn.close()
