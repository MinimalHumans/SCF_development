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
    """Get the .scf file path for a project."""
    PROJECTS_DIR.mkdir(exist_ok=True)
    safe_name = "".join(c for c in project_name if c.isalnum() or c in " -_").strip()
    safe_name = safe_name.replace(" ", "_").lower()
    return PROJECTS_DIR / f"{safe_name}.scf"


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

        # Create tables for each registered entity type
        for name, entity_def in get_all_entities().items():
            _create_entity_table(conn, entity_def)

        conn.commit()
    finally:
        conn.close()


def _create_entity_table(conn: sqlite3.Connection, entity_def: EntityDef) -> None:
    """Create a table for an entity type if it doesn't exist."""
    columns = [
        "id INTEGER PRIMARY KEY AUTOINCREMENT",
        "created_at TEXT DEFAULT (datetime('now'))",
        "updated_at TEXT DEFAULT (datetime('now'))",
    ]

    for f in entity_def.fields:
        col = f"{f.name} {f.get_sql_type()}"
        if f.required:
            col += " NOT NULL"
        if f.default is not None:
            if isinstance(f.default, str):
                col += f" DEFAULT '{f.default}'"
            else:
                col += f" DEFAULT {f.default}"
        columns.append(col)

    sql = f"CREATE TABLE IF NOT EXISTS {entity_def.name} (\n  "
    sql += ",\n  ".join(columns)
    sql += "\n)"

    conn.execute(sql)

    # Check for missing columns (simple migration)
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({entity_def.name})")}
    for f in entity_def.fields:
        if f.name not in existing:
            alter = f"ALTER TABLE {entity_def.name} ADD COLUMN {f.name} {f.get_sql_type()}"
            if f.default is not None:
                if isinstance(f.default, str):
                    alter += f" DEFAULT '{f.default}'"
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

    cols = ", ".join(filtered.keys())
    placeholders = ", ".join(["?"] * len(filtered))
    values = list(filtered.values())

    conn = get_connection(db_path)
    try:
        cursor = conn.execute(
            f"INSERT INTO {entity_type} ({cols}) VALUES ({placeholders})",
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
            f"SELECT * FROM {entity_type} WHERE id = ?", (entity_id,)
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
        sql = f"SELECT * FROM {entity_type}"
        params = []

        if search:
            sql += f" WHERE {name_field} LIKE ?"
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

    set_clause = ", ".join(f"{k} = ?" for k in filtered.keys())
    values = list(filtered.values()) + [entity_id]

    conn = get_connection(db_path)
    try:
        conn.execute(
            f"UPDATE {entity_type} SET {set_clause} WHERE id = ?",
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
            f"DELETE FROM {entity_type} WHERE id = ?", (entity_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def count_entities(db_path: str | Path, entity_type: str) -> int:
    """Count entities of a type."""
    conn = get_connection(db_path)
    try:
        row = conn.execute(f"SELECT COUNT(*) as cnt FROM {entity_type}").fetchone()
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
# Project management
# =============================================================================

def list_projects() -> list[dict]:
    """List all .scf files in the projects directory."""
    PROJECTS_DIR.mkdir(exist_ok=True)
    projects = []
    for f in sorted(PROJECTS_DIR.glob("*.scf")):
        try:
            conn = get_connection(f)
            meta = {}
            for row in conn.execute("SELECT key, value FROM _scf_meta"):
                meta[row["key"]] = row["value"]
            conn.close()

            # Get project name from project table if it exists
            conn2 = get_connection(f)
            proj_row = conn2.execute("SELECT name FROM project LIMIT 1").fetchone()
            display_name = proj_row["name"] if proj_row else f.stem
            conn2.close()

            projects.append({
                "filename": f.name,
                "path": str(f),
                "display_name": display_name,
                "scf_version": meta.get("scf_version", "unknown"),
                "updated_at": meta.get("updated_at", ""),
            })
        except Exception:
            projects.append({
                "filename": f.name,
                "path": str(f),
                "display_name": f.stem,
                "scf_version": "unknown",
                "updated_at": "",
            })
    return projects


def create_project(name: str) -> Path:
    """Create a new .scf project file and return its path."""
    db_path = get_db_path(name)
    if db_path.exists():
        raise FileExistsError(f"Project already exists: {db_path}")

    init_database(db_path)

    # Create the root project entity
    create_entity(db_path, "project", {"name": name})

    return db_path
