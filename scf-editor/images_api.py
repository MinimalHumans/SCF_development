"""
Entity Images API
==================
Upload, list, update, and delete reference images for entities.
Images are stored in the project's sourcefiles directory:
    projects/{project}/sourcefiles/images/{entity_type}/{entity_id}/

File serving route provides browser access to stored images.
"""

import shutil
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse

import database as db

images_router = APIRouter(tags=["images"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
IMAGES_SUBDIR = Path("sourcefiles") / "images"


def _require_project(request: Request) -> tuple[Path, Path]:
    """Returns (scf_path, project_dir)."""
    proj = request.cookies.get("scf_project")
    if not proj:
        raise HTTPException(status_code=400, detail="No project selected")
    project_dir = Path("projects") / proj
    scf_path = project_dir / f"{proj}.scf"
    if not scf_path.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {proj}")
    return scf_path, project_dir


def _images_dir(project_dir: Path, entity_type: str, entity_id: int) -> Path:
    """Get the images directory for an entity, creating it if needed."""
    d = project_dir / IMAGES_SUBDIR / entity_type / str(entity_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _next_filename(images_dir: Path, entity_type: str, entity_id: int, ext: str) -> str:
    """Generate the next sequential filename like prop_5_001.png."""
    existing = sorted(images_dir.glob(f"{entity_type}_{entity_id}_*"))
    if not existing:
        return f"{entity_type}_{entity_id}_001{ext}"

    # Find highest number
    max_num = 0
    for f in existing:
        stem = f.stem  # e.g. "prop_5_003"
        parts = stem.rsplit("_", 1)
        if len(parts) == 2:
            try:
                max_num = max(max_num, int(parts[1]))
            except ValueError:
                pass
    return f"{entity_type}_{entity_id}_{max_num + 1:03d}{ext}"


def _relative_path(project_dir: Path, full_path: Path) -> str:
    """Get the path relative to the project directory."""
    return str(full_path.relative_to(project_dir))


# ═══════════════════════════════════════════════════════════════════════════
# Table creation (called from database.init_database)
# ═══════════════════════════════════════════════════════════════════════════

def init_images_table(conn) -> None:
    """Create the entity_images table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entity_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_entity_images_lookup
        ON entity_images(entity_type, entity_id)
    """)


# ═══════════════════════════════════════════════════════════════════════════
# Upload
# ═══════════════════════════════════════════════════════════════════════════

@images_router.post("/api/images/{entity_type}/{entity_id}")
async def upload_image(
    request: Request,
    entity_type: str,
    entity_id: int,
    file: UploadFile = File(...),
    description: str = Form(""),
):
    """Upload an image for an entity."""
    # Validate entity type
    if entity_type not in ("character", "location", "prop"):
        raise HTTPException(status_code=400, detail="Images only supported for character, location, prop")

    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    scf_path, project_dir = _require_project(request)

    # Verify entity exists
    entity = db.get_entity_by_id(scf_path, entity_type, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type} #{entity_id} not found")

    # Write file to disk
    img_dir = _images_dir(project_dir, entity_type, entity_id)
    filename = _next_filename(img_dir, entity_type, entity_id, ext)
    dest = img_dir / filename

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    # Get the next sort_order
    conn = db.get_connection(scf_path)
    try:
        row = conn.execute(
            """SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
               FROM entity_images WHERE entity_type = ? AND entity_id = ?""",
            (entity_type, entity_id),
        ).fetchone()
        sort_order = row["next_order"]

        rel_path = _relative_path(project_dir, dest)

        cursor = conn.execute(
            """INSERT INTO entity_images
               (entity_type, entity_id, filename, relative_path, description, sort_order)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (entity_type, entity_id, filename, rel_path, description.strip(), sort_order),
        )
        conn.commit()
        image_id = cursor.lastrowid
    finally:
        conn.close()

    return JSONResponse({
        "id": image_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "filename": filename,
        "relative_path": rel_path,
        "description": description.strip(),
        "sort_order": sort_order,
    })


# ═══════════════════════════════════════════════════════════════════════════
# List
# ═══════════════════════════════════════════════════════════════════════════

@images_router.get("/api/images/{entity_type}/{entity_id}")
async def list_images(request: Request, entity_type: str, entity_id: int):
    """List all images for an entity."""
    scf_path, project_dir = _require_project(request)

    conn = db.get_connection(scf_path)
    try:
        rows = conn.execute(
            """SELECT id, entity_type, entity_id, filename, relative_path,
                      description, sort_order, created_at
               FROM entity_images
               WHERE entity_type = ? AND entity_id = ?
               ORDER BY sort_order ASC, id ASC""",
            (entity_type, entity_id),
        ).fetchall()

        images = []
        for r in rows:
            img_path = project_dir / r["relative_path"]
            images.append({
                "id": r["id"],
                "entity_type": r["entity_type"],
                "entity_id": r["entity_id"],
                "filename": r["filename"],
                "relative_path": r["relative_path"],
                "description": r["description"],
                "sort_order": r["sort_order"],
                "created_at": r["created_at"],
                "exists": img_path.exists(),
            })

        return JSONResponse(images)
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# Update description
# ═══════════════════════════════════════════════════════════════════════════

@images_router.put("/api/images/{image_id}")
async def update_image(request: Request, image_id: int):
    """Update image metadata (description)."""
    scf_path, _ = _require_project(request)
    body = await request.json()

    description = body.get("description", "").strip()

    conn = db.get_connection(scf_path)
    try:
        cursor = conn.execute(
            "UPDATE entity_images SET description = ? WHERE id = ?",
            (description, image_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Image not found")
        return JSONResponse({"success": True})
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# Delete
# ═══════════════════════════════════════════════════════════════════════════

@images_router.delete("/api/images/{image_id}")
async def delete_image(request: Request, image_id: int):
    """Delete an image (removes file from disk and DB record)."""
    scf_path, project_dir = _require_project(request)

    conn = db.get_connection(scf_path)
    try:
        row = conn.execute(
            "SELECT relative_path FROM entity_images WHERE id = ?",
            (image_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Image not found")

        # Delete file from disk
        file_path = project_dir / row["relative_path"]
        if file_path.exists():
            file_path.unlink()

        # Delete DB record
        conn.execute("DELETE FROM entity_images WHERE id = ?", (image_id,))
        conn.commit()

        return JSONResponse({"success": True})
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# File serving — serve images from project sourcefiles
# ═══════════════════════════════════════════════════════════════════════════

@images_router.get("/project-files/{project_name}/{path:path}")
async def serve_project_file(project_name: str, path: str):
    """Serve a file from a project's directory (images, etc)."""
    project_dir = Path("projects") / project_name
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    file_path = project_dir / path

    # Security: ensure the resolved path is inside the project directory
    try:
        file_path.resolve().relative_to(project_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    ext = file_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(file_path, media_type=media_type)
