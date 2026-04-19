import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import schema from './schema.json';

const log = (...args: any[]) => console.log('[DatabaseWorker]', ...args);
const error = (...args: any[]) => console.error('[DatabaseWorker]', ...args);

let db: any;
let sqlite3: any;

const fieldTypeToSql = (type: string): string => {
  switch (type) {
    case 'integer':
    case 'reference':
    case 'boolean':
      return 'INTEGER';
    case 'float':
      return 'REAL';
    case 'json':
    case 'text':
    case 'textarea':
    case 'select':
    case 'multiselect':
    default:
      return 'TEXT';
  }
};

const initSchema = () => {
  log('Initializing schema...');
  
  // Metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _scf_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.exec("INSERT OR REPLACE INTO _scf_meta (key, value) VALUES ('scf_version', '0.1.0')");
  db.exec(`INSERT OR REPLACE INTO _scf_meta (key, value) VALUES ('updated_at', '${new Date().toISOString()}')`);

  // Screenplay infrastructure tables
  db.exec(`
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
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_character_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text_name TEXT NOT NULL UNIQUE,
      character_id INTEGER REFERENCES character(id),
      is_primary_name INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_scene_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER REFERENCES scene(id),
      heading_text TEXT,
      scene_order INTEGER,
      in_screenplay INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_location_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text_name TEXT NOT NULL,
      location_id INTEGER REFERENCES location(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_prop_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prop_id INTEGER REFERENCES prop(id),
      text_fragment TEXT,
      scene_id INTEGER REFERENCES scene(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Screenplay Editor tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER REFERENCES scene(id) ON DELETE SET NULL,
      line_order INTEGER NOT NULL,
      line_type TEXT NOT NULL DEFAULT 'action',
      content TEXT NOT NULL DEFAULT '',
      character_id INTEGER REFERENCES character(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES location(id) ON DELETE SET NULL,
      metadata JSON,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_screenplay_lines_order ON screenplay_lines(line_order)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_screenplay_lines_scene ON screenplay_lines(scene_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_title_page (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_number INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      published_at TEXT DEFAULT (datetime('now')),
      line_count INTEGER DEFAULT 0,
      scene_count INTEGER DEFAULT 0,
      character_count INTEGER DEFAULT 0,
      location_count INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_version_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL REFERENCES screenplay_versions(id) ON DELETE CASCADE,
      line_order INTEGER NOT NULL,
      line_type TEXT NOT NULL DEFAULT 'action',
      content TEXT NOT NULL DEFAULT '',
      scene_id INTEGER,
      character_id INTEGER,
      location_id INTEGER,
      metadata JSON
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_version_lines_version ON screenplay_version_lines(version_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_version_title_page (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL REFERENCES screenplay_versions(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS screenplay_prop_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tagged_text TEXT NOT NULL,
      prop_id INTEGER NOT NULL REFERENCES prop(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prop_tags_prop ON screenplay_prop_tags(prop_id)`);

  // Entity Images table
  db.exec(`
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
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_images_lookup ON entity_images(entity_type, entity_id)`);

  // Generic Entity Tables from schema.json
  for (const [entityName, entityDef] of Object.entries(schema)) {
    const columns = [
      "id INTEGER PRIMARY KEY AUTOINCREMENT",
      "created_at TEXT DEFAULT (datetime('now'))",
      "updated_at TEXT DEFAULT (datetime('now'))",
    ];

    for (const field of (entityDef as any).fields) {
      let col = `${field.name} ${fieldTypeToSql(field.field_type)}`;
      if (field.required) {
        col += " NOT NULL";
      }
      if (field.default !== null && field.default !== undefined) {
        if (typeof field.default === 'string') {
          col += ` DEFAULT '${field.default}'`;
        } else {
          col += ` DEFAULT ${field.default}`;
        }
      }
      columns.push(col);
    }

    const sql = `CREATE TABLE IF NOT EXISTS ${entityName} (\n  ${columns.join(",\n  ")}\n)`;
    db.exec(sql);

    // Simple migration: check for missing columns
    const existingColumns: Set<string> = new Set();
    db.exec({
      sql: `PRAGMA table_info(${entityName})`,
      rowMode: 'object',
      callback: (row: any) => existingColumns.add(row.name)
    });

    for (const field of (entityDef as any).fields) {
      if (!existingColumns.has(field.name)) {
        let alter = `ALTER TABLE ${entityName} ADD COLUMN ${field.name} ${fieldTypeToSql(field.field_type)}`;
        if (field.default !== null && field.default !== undefined) {
          if (typeof field.default === 'string') {
            alter += ` DEFAULT '${field.default}'`;
          } else {
            alter += ` DEFAULT ${field.default}`;
          }
        }
        db.exec(alter);
      }
    }
  }

  log('Schema initialization complete.');
};

const openDatabase = async (dbName: string) => {
  try {
    if (db) {
      db.close();
      db = null;
    }

    if (!sqlite3) {
      sqlite3 = await sqlite3InitModule();
    }

    const path = `/${dbName}`;
    if ('opfs' in sqlite3) {
      db = new sqlite3.oo1.OpfsDb(path);
      log(`OPFS database opened: ${path}`);
    } else {
      db = new sqlite3.oo1.DB(path, 'ct');
      log(`InMemory database opened (OPFS not available): ${path}`);
    }

    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");

    initSchema();

    return true;
  } catch (err: any) {
    error(`Failed to open database ${dbName}:`, err);
    throw err;
  }
};

const listProjects = async () => {
  if (!('opfs' in sqlite3)) return [];
  
  try {
    const root = await navigator.storage.getDirectory();
    const projects = [];
    for await (const entry of (root as any).values()) {
      if (entry.kind === 'file' && (entry.name.endsWith('.scf') || entry.name.endsWith('.db'))) {
        const file = await entry.getFile();
        projects.push({
          name: entry.name,
          lastModified: file.lastModified
        });
      }
    }
    return projects;
  } catch (err) {
    error('Failed to list projects:', err);
    return [];
  }
};

const deleteProject = async (name: string) => {
    if (db && db.filename === `/${name}`) {
        db.close();
        db = null;
    }
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name);
};

self.onmessage = async (e) => {
  const { type, id, sql, params, dbName } = e.data;

  if (type === 'start') {
    if (!sqlite3) {
        sqlite3 = await sqlite3InitModule();
    }
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'open') {
    try {
      await openDatabase(dbName);
      self.postMessage({ type: 'success', id });
    } catch (err: any) {
      self.postMessage({ type: 'error', id, error: err.message });
    }
    return;
  }

  if (type === 'listProjects') {
    const projects = await listProjects();
    self.postMessage({ type: 'success', id, rows: projects });
    return;
  }

  if (type === 'deleteProject') {
    try {
      await deleteProject(dbName);
      self.postMessage({ type: 'success', id });
    } catch (err: any) {
      self.postMessage({ type: 'error', id, error: err.message });
    }
    return;
  }

  if (!db) {
    self.postMessage({ type: 'error', id, error: 'Database not initialized. Call open first.' });
    return;
  }

  try {
    switch (type) {
      case 'exec':
        db.exec({
          sql,
          bind: params
        });
        self.postMessage({ type: 'success', id });
        break;
      case 'getRows':
        const rows: any[] = [];
        db.exec({
          sql,
          bind: params,
          rowMode: 'object',
          callback: (row: any) => rows.push(row)
        });
        self.postMessage({ type: 'success', id, rows });
        break;
      case 'export':
        // Not implemented in worker directly usually, but we could
        // For now, project manager can handle file downloads via OPFS directly if needed
        self.postMessage({ type: 'error', id, error: 'Export not implemented in worker' });
        break;
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (err: any) {
    error(`Error in ${type}:`, err);
    self.postMessage({ type: 'error', id, error: err.message });
  }
};
