"""
SCF Database Layer
===================
Auto-creates SQLite tables from the entity registry.
Provides generic CRUD operations that work with any registered entity type.
"""

import sqlite3
import json
import os
from pathlib import Path
from datetime import datetime
from entity_registry import (
    get_entity, get_all_entities, EntityDef, FieldDef
)

PROJECTS_DIR = Path("projects")


def get_db_path(project_name: str) -> Path:
    """Get the .scf file path for a project (inside project directory)."""
    PROJECTS_DIR.mkdir(exist_ok=True)
    safe_name = "".join(c for c in project_name if c.isalnum() or c in " -_").strip()
    safe_name = safe_name.replace(" ", "_").lower()
    project_dir = PROJECTS_DIR / safe_name
    project_dir.mkdir(exist_ok=True)
    return project_dir / f"{safe_name}.scf"


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    """Get a database connection with row_factory set."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_database(db_path: str | Path) -> None:
    """Initialize/migrate database: create all tables from entity registry."""
    conn = get_connection(db_path)
    try:
        # Metadata table for the SCF file itself
        conn.execute("""
            CREATE TABLE IF NOT EXISTS _scf_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # Set version
        conn.execute(
            "INSERT OR REPLACE INTO _scf_meta (key, value) VALUES (?, ?)",
            ("scf_version", "0.1.0")
        )
        conn.execute(
            "INSERT OR REPLACE INTO _scf_meta (key, value) VALUES (?, ?)",
            ("updated_at", datetime.utcnow().isoformat())
        )

        # Screenplay mapping tables (infrastructure, not entity registry)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screenplay_meta (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fountain_path TEXT,
                title TEXT,
                author TEXT,
                draft TEXT,
                last_synced TEXT,
                total_scenes INTEGER DEFAULT 0,
                total_pages INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screenplay_character_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text_name TEXT NOT NULL UNIQUE,
                character_id INTEGER REFERENCES character(id),
                is_primary_name INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screenplay_scene_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scene_id INTEGER REFERENCES scene(id),
                heading_text TEXT,
                scene_order INTEGER,
                in_screenplay INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screenplay_location_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text_name TEXT NOT NULL,
                location_id INTEGER REFERENCES location(id),
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screenplay_prop_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prop_id INTEGER REFERENCES prop(id),
                text_fragment TEXT,
                scene_id INTEGER REFERENCES scene(id),
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Create tables for each registered entity type
        for name, entity_def in get_all_entities().items():
            _create_entity_table(conn, entity_def)

        # New structured screenplay tables (Phase 1 — SQLite-native editor)
        import screenplay_db
        screenplay_db.init_screenplay_tables(conn)

        # Entity images table (Reference tab — visual reference board)
        import images_api
        images_api.init_images_table(conn)

        conn.commit()
    finally:
        conn.close()


def _q(identifier: str) -> str:
    """Quote a SQL identifier so reserved words (order, group, key, etc.) work
    as table or column names. Uses standard SQL double-quoting; embedded
    double quotes are doubled per spec. Applied universally rather than
    selectively so the registry doesn't have to avoid every SQL keyword."""
    return '"' + identifier.replace('"', '""') + '"'


def _create_entity_table(conn: sqlite3.Connection, entity_def: EntityDef) -> None:
    """Create a table for an entity type if it doesn't exist.

    Note on `required=True`:
        The editor's UX is "click + to create a stub, then fill it in" — rows
        need to exist before they have meaningful values for FK fields. So
        `required=True` is treated as a *form-level / UX hint* (the form
        template renders the asterisk and emits `required` on the input,
        giving client-side enforcement). It is NOT translated to SQL
        `NOT NULL` here, because that would block stub creation for every
        entity with a required reference. Server-side validation on save can
        be added at the API layer if stricter enforcement is wanted later.
    """
    columns = [
        "id INTEGER PRIMARY KEY AUTOINCREMENT",
        "created_at TEXT DEFAULT (datetime('now'))",
        "updated_at TEXT DEFAULT (datetime('now'))",
    ]

    for f in entity_def.fields:
        col = f"{_q(f.name)} {f.get_sql_type()}"
        # NOT NULL is intentionally NOT emitted here — see docstring above.
        if f.default is not None:
            if isinstance(f.default, str):
                # Escape embedded single-quotes in string defaults
                safe_default = f.default.replace("'", "''")
                col += f" DEFAULT '{safe_default}'"
            else:
                col += f" DEFAULT {f.default}"
        columns.append(col)

    sql = f"CREATE TABLE IF NOT EXISTS {_q(entity_def.name)} (\n  "
    sql += ",\n  ".join(columns)
    sql += "\n)"

    conn.execute(sql)

    # Check for missing columns (simple migration). PRAGMA table_info takes
    # an unquoted name inside the parens — it's not standard SQL syntax.
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({_q(entity_def.name)})")}
    for f in entity_def.fields:
        if f.name not in existing:
            alter = f"ALTER TABLE {_q(entity_def.name)} ADD COLUMN {_q(f.name)} {f.get_sql_type()}"
            if f.default is not None:
                if isinstance(f.default, str):
                    safe_default = f.default.replace("'", "''")
                    alter += f" DEFAULT '{safe_default}'"
                else:
                    alter += f" DEFAULT {f.default}"
            conn.execute(alter)


# =============================================================================
# Generic CRUD
# =============================================================================

def create_entity(db_path: str | Path, entity_type: str, data: dict) -> int:
    """Create a new entity. Returns the new ID."""
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise ValueError(f"Unknown entity type: {entity_type}")

    valid_fields = {f.name for f in entity_def.fields}
    filtered = {k: v for k, v in data.items() if k in valid_fields and v is not None and v != ""}

    if not filtered:
        raise ValueError("No valid fields provided")

    cols = ", ".join(_q(k) for k in filtered.keys())
    placeholders = ", ".join(["?"] * len(filtered))
    values = list(filtered.values())

    conn = get_connection(db_path)
    try:
        cursor = conn.execute(
            f"INSERT INTO {_q(entity_type)} ({cols}) VALUES ({placeholders})",
            values
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_entity_by_id(db_path: str | Path, entity_type: str, entity_id: int) -> dict | None:
    """Get a single entity by ID."""
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise ValueError(f"Unknown entity type: {entity_type}")

    conn = get_connection(db_path)
    try:
        row = conn.execute(
            f"SELECT * FROM {_q(entity_type)} WHERE id = ?", (entity_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_entities(db_path: str | Path, entity_type: str,
                  search: str = None, limit: int = 500, offset: int = 0) -> list[dict]:
    """List entities of a type with optional search."""
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise ValueError(f"Unknown entity type: {entity_type}")

    conn = get_connection(db_path)
    try:
        name_field = entity_def.name_field
        sql = f"SELECT * FROM {_q(entity_type)}"
        params = []

        if search:
            sql += f" WHERE {_q(name_field)} LIKE ?"
            params.append(f"%{search}%")

        sql += f" ORDER BY id ASC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_entity(db_path: str | Path, entity_type: str, entity_id: int, data: dict) -> bool:
    """Update an entity. Returns True if successful."""
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise ValueError(f"Unknown entity type: {entity_type}")

    valid_fields = {f.name for f in entity_def.fields}
    # Allow setting fields to empty string (clearing them)
    filtered = {k: v for k, v in data.items() if k in valid_fields}
    filtered["updated_at"] = datetime.utcnow().isoformat()

    if not filtered:
        return False

    set_clause = ", ".join(f"{_q(k)} = ?" for k in filtered.keys())
    values = list(filtered.values()) + [entity_id]

    conn = get_connection(db_path)
    try:
        conn.execute(
            f"UPDATE {_q(entity_type)} SET {set_clause} WHERE id = ?",
            values
        )
        conn.commit()
        return True
    finally:
        conn.close()


def delete_entity(db_path: str | Path, entity_type: str, entity_id: int) -> bool:
    """Delete an entity. Returns True if something was deleted."""
    entity_def = get_entity(entity_type)
    if not entity_def:
        raise ValueError(f"Unknown entity type: {entity_type}")

    conn = get_connection(db_path)
    try:
        cursor = conn.execute(
            f"DELETE FROM {_q(entity_type)} WHERE id = ?", (entity_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def count_entities(db_path: str | Path, entity_type: str) -> int:
    """Count entities of a type."""
    conn = get_connection(db_path)
    try:
        row = conn.execute(f"SELECT COUNT(*) as cnt FROM {_q(entity_type)}").fetchone()
        return row["cnt"]
    finally:
        conn.close()


def search_all(db_path: str | Path, query: str) -> list[dict]:
    """Search across all entity types. Returns matches with entity_type info."""
    results = []
    for name, entity_def in get_all_entities().items():
        try:
            matches = list_entities(db_path, name, search=query, limit=20)
            for m in matches:
                m["_entity_type"] = name
                m["_entity_label"] = entity_def.label
                m["_entity_icon"] = entity_def.icon
                m["_display_name"] = m.get(entity_def.name_field, f"#{m['id']}")
            results.extend(matches)
        except Exception:
            continue
    return results


# =============================================================================
# Batch queries — performance optimization for tree loading
# =============================================================================

def batch_entity_counts(db_path: str | Path) -> dict[str, int]:
    """Get row counts for all entity tables in a single connection.
    Returns {entity_name: count}. Much faster than calling count_entities N times."""
    conn = get_connection(db_path)
    try:
        counts = {}
        for name in get_all_entities():
            try:
                row = conn.execute(f"SELECT COUNT(*) as cnt FROM {_q(name)}").fetchone()
                counts[name] = row["cnt"]
            except Exception:
                counts[name] = 0
        return counts
    finally:
        conn.close()


def list_entities_batch(db_path: str | Path, entity_names: list[str],
                        limit: int = 500) -> dict[str, list[dict]]:
    """List entities for multiple types in a single connection.
    Only queries types in the provided list. Returns {entity_name: [records]}."""
    conn = get_connection(db_path)
    try:
        result = {}
        for name in entity_names:
            entity_def = get_entity(name)
            if not entity_def:
                result[name] = []
                continue
            try:
                rows = conn.execute(
                    f"SELECT * FROM {_q(name)} ORDER BY id ASC LIMIT ?", (limit,)
                ).fetchall()
                result[name] = [dict(r) for r in rows]
            except Exception:
                result[name] = []
        return result
    finally:
        conn.close()


# =============================================================================
# Project management
# =============================================================================

def list_projects() -> list[dict]:
    """List all project directories containing .scf files."""
    PROJECTS_DIR.mkdir(exist_ok=True)
    projects = []
    for d in sorted(PROJECTS_DIR.iterdir()):
        if not d.is_dir():
            continue
        scf_file = d / f"{d.name}.scf"
        if not scf_file.exists():
            continue
        try:
            conn = get_connection(scf_file)
            meta = {}
            for row in conn.execute("SELECT key, value FROM _scf_meta"):
                meta[row["key"]] = row["value"]

            proj_row = conn.execute("SELECT name FROM project LIMIT 1").fetchone()
            display_name = proj_row["name"] if proj_row else d.name
            conn.close()

            projects.append({
                "filename": d.name,
                "path": str(scf_file),
                "dir_path": str(d),
                "display_name": display_name,
                "scf_version": meta.get("scf_version", "unknown"),
                "updated_at": meta.get("updated_at", ""),
            })
        except Exception:
            projects.append({
                "filename": d.name,
                "path": str(scf_file),
                "dir_path": str(d),
                "display_name": d.name,
                "scf_version": "unknown",
                "updated_at": "",
            })
    return projects


def create_project(name: str) -> Path:
    """Create a new project directory with .scf file and return the .scf path."""
    safe_name = "".join(c for c in name if c.isalnum() or c in " -_").strip()
    safe_name = safe_name.replace(" ", "_").lower()
    project_dir = PROJECTS_DIR / safe_name
    if project_dir.exists():
        raise FileExistsError(f"Project already exists: {project_dir}")

    db_path = get_db_path(name)
    init_database(db_path)

    # Create the root project entity
    create_entity(db_path, "project", {"name": name})

    return db_path
