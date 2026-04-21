import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import schema from './schema.json';

const log = (...args: any[]) => console.log('[DatabaseWorker]', ...args);
const error = (...args: any[]) => console.error('[DatabaseWorker]', ...args);

let sqlite3: any = null;
let db: any = null;
let currentDbName: string | null = null;

const fieldTypeToSql = (type: string) => {
  switch (type) {
    case 'integer': return 'INTEGER';
    case 'float': return 'REAL';
    case 'boolean': return 'BOOLEAN';
    case 'json': return 'JSON';
    case 'reference': return 'INTEGER';
    default: return 'TEXT';
  }
};

const safeExec = (sql: any) => {
  try {
    return db.exec(sql);
  } catch (err: any) {
    error(`Error executing SQL: ${typeof sql === 'string' ? sql : JSON.stringify(sql)}`, err);
    throw err;
  }
};

const initSchema = () => {
  log('Initializing schema...');
  
  // Create project table first as it's the context
  safeExec(`
    CREATE TABLE IF NOT EXISTS project (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logline TEXT,
      genre_tone TEXT,
      target_runtime TEXT,
      setting_period TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Screenplay Editor tables
  safeExec(`
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

  safeExec(`CREATE INDEX IF NOT EXISTS idx_screenplay_lines_order ON screenplay_lines(line_order)`);
  safeExec(`CREATE INDEX IF NOT EXISTS idx_screenplay_lines_scene ON screenplay_lines(scene_id)`);

  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_title_page (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  safeExec(`
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

  safeExec(`
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

  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_version_title_page (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL REFERENCES screenplay_versions(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  safeExec(`
    CREATE TABLE IF NOT EXISTS entity_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      image_data TEXT NOT NULL,
      description TEXT,
      is_primary BOOLEAN DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  safeExec(`CREATE INDEX IF NOT EXISTS idx_entity_images_lookup ON entity_images(entity_type, entity_id)`);

  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      author TEXT,
      total_scenes INTEGER DEFAULT 0,
      total_pages INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_character_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text_name TEXT NOT NULL,
      character_id INTEGER REFERENCES character(id) ON DELETE CASCADE,
      is_primary_name BOOLEAN DEFAULT 0
    )
  `);

  safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_scm_text_name ON screenplay_character_map(text_name)`);

  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_scene_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER REFERENCES scene(id) ON DELETE CASCADE,
      heading_text TEXT,
      scene_order INTEGER,
      in_screenplay BOOLEAN DEFAULT 1
    )
  `);

  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_location_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text_name TEXT NOT NULL,
      location_id INTEGER REFERENCES location(id) ON DELETE CASCADE
    )
  `);

  safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_slm_text_name ON screenplay_location_map(text_name)`);

  // Entity annotation map (staged/committed spans)
  safeExec(`
    CREATE TABLE IF NOT EXISTS screenplay_line_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_order INTEGER NOT NULL,
      char_from INTEGER NOT NULL,
      char_to INTEGER NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('character','location','prop')),
      entity_state TEXT NOT NULL CHECK(entity_state IN ('staged','committed')),
      entity_id INTEGER,
      staged_local_id TEXT
    )
  `);

  safeExec(`CREATE INDEX IF NOT EXISTS idx_sla_line ON screenplay_line_annotations(line_order)`);

  // Act groupings (navigator-only, no in-text marker)
  safeExec(`
    CREATE TABLE IF NOT EXISTS scene_act_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      act_name TEXT NOT NULL DEFAULT 'Act',
      act_order INTEGER NOT NULL DEFAULT 0,
      scene_ids JSON NOT NULL DEFAULT '[]'
    )
  `);

  // Soft-delete support on entity tables (migration guard)
  for (const tbl of ['character', 'location', 'prop']) {
    const cols: Set<string> = new Set();
    safeExec({ sql: `PRAGMA table_info(${tbl})`, rowMode: 'object', callback: (r: any) => cols.add(r.name) });
    if (!cols.has('deleted')) {
      safeExec(`ALTER TABLE ${tbl} ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT 0`);
    }
  }

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
    safeExec(sql);

    // Seed project table if it's the one we just created and it's empty
    if (entityName === 'project') {
        let count = 0;
        safeExec({
            sql: "SELECT COUNT(*) as cnt FROM project",
            rowMode: 'object',
            callback: (row: any) => { count = row.cnt; }
        });
        if (count === 0) {
            log('Seeding initial project record...');
            safeExec("INSERT INTO project (name) VALUES ('Untitled Project')");
        }
    }

    // Migration
    const existingColumns: Set<string> = new Set();
    safeExec({
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
        safeExec(alter);
      }
    }
  }

  log('Schema initialization complete.');
};

const validateSqliteHeader = async (opfsPath: string) => {
  const root = await navigator.storage.getDirectory();
  try {
    const fileHandle = await root.getFileHandle(opfsPath);
    const file = await fileHandle.getFile();
    
    if (file.size > 0) {
      const buffer = await file.slice(0, 100).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const expected = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
      
      let isValid = bytes.length >= 16;
      for (let i = 0; i < 16 && isValid; i++) {
        if (bytes[i] !== expected[i]) isValid = false;
      }
      
      if (!isValid) {
        throw new Error("Invalid SCF file: The file header does not match the SQLite standard. It may be corrupted or not a valid .scf database.");
      }

      const writeVersion = bytes[18];
      const readVersion = bytes[19];
      if (writeVersion === 2 || readVersion === 2) {
        log("WAL mode detected in file header.");
      }
    }
  } catch (e: any) {
    if (e.name !== 'NotFoundError' && e.message.indexOf('Invalid SCF file') === -1) {
      throw e;
    } else if (e.message.indexOf('Invalid SCF file') !== -1) {
      throw e;
    }
  }
};

const openDatabase = async (dbName: string, retryCount = 0) => {
  const maxRetries = 3;
  let opfsPath = dbName.startsWith('/') ? dbName.substring(1) : dbName;
  try { opfsPath = decodeURIComponent(opfsPath); } catch (e) {}

  try {
    if (db) {
      log('Closing previous database connection...');
      try { db.close(); } catch (e) {}
      db = null;
      currentDbName = null;
      await new Promise(r => setTimeout(r, 200));
    }

    if (!sqlite3) {
      sqlite3 = await (sqlite3InitModule as any)({
        locateFile: (path: string) => `/sqlite3/${path}`
      });
    }

    if ('opfs' in sqlite3) {
      await validateSqliteHeader(opfsPath);
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(opfsPath);
        await handle.getFile();
      } catch (e: any) {
        if (e.name !== 'NotFoundError') {
          log(`OPFS Handle check failed (likely locked): ${e}`);
          throw e;
        }
      }

      log(`Opening OPFS database (Attempt ${retryCount + 1}): ${opfsPath}`);
      db = new sqlite3.oo1.DB(opfsPath, 'ct', 'opfs');
      currentDbName = opfsPath;
      log(`OPFS database opened successfully: ${opfsPath}`);
    } else {
      const path = dbName.startsWith('/') ? dbName : `/${dbName}`;
      log(`Opening InMemory database: ${path}`);
      db = new sqlite3.oo1.DB(path, 'ct');
      currentDbName = dbName;
    }

    try {
        safeExec("PRAGMA busy_timeout = 10000");
        safeExec("PRAGMA journal_mode=DELETE");
        safeExec("PRAGMA foreign_keys=ON");
        initSchema();
    } catch (sqlErr: any) {
        if (sqlErr.message && sqlErr.message.includes('CANTOPEN')) {
            throw sqlErr;
        }
        throw sqlErr;
    }

    return true;
  } catch (err: any) {
    if (db) {
      try { db.close(); } catch (e) {}
      db = null;
      currentDbName = null;
    }

    const isLockError = err.message && (err.message.includes('CANTOPEN') || err.message.includes('locked'));
    if (isLockError && retryCount < maxRetries) {
      log(`Database file is likely locked or busy. Retrying in 500ms... (${retryCount + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 500));
      return openDatabase(dbName, retryCount + 1);
    }

    error(`Failed to open database ${dbName} after ${retryCount} retries:`, err);
    throw err;
  }
};

const listProjects = async () => {
  if (!sqlite3 || !('opfs' in sqlite3)) return [];
  
  try {
    const root = await navigator.storage.getDirectory();
    const projects = [];
    for await (const entry of (root as any).values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.scf')) {
        const file = await entry.getFile();
        let displayName = entry.name;
        try { displayName = decodeURIComponent(entry.name); } catch (e) {}
        projects.push({
          name: displayName,
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
    let opfsPath = name.startsWith('/') ? name.substring(1) : name;
    try { opfsPath = decodeURIComponent(opfsPath); } catch (e) {}
    
    if (db && (currentDbName === opfsPath || currentDbName === name)) {
        log(`Closing database before deletion: ${currentDbName}`);
        try { db.close(); } catch (e) {}
        db = null;
        currentDbName = null;
        await new Promise(r => setTimeout(r, 200));
    }
    
    const root = await navigator.storage.getDirectory();
    try {
        await root.removeEntry(opfsPath);
    } catch (e) {
        try {
            await root.removeEntry(encodeURIComponent(opfsPath));
        } catch (e2) {
            throw e;
        }
    }
    log(`Project deleted: ${opfsPath}`);
};

const renameProject = async (oldName: string, newName: string) => {
    let oldPath = oldName.startsWith('/') ? oldName.substring(1) : oldName;
    try { oldPath = decodeURIComponent(oldPath); } catch (e) {}
    
    let newPath = newName.startsWith('/') ? newName.substring(1) : newName;
    try { newPath = decodeURIComponent(newPath); } catch (e) {}

    log(`Renaming project: ${oldPath} -> ${newPath}`);

    if (db && (currentDbName === oldPath || currentDbName === oldName)) {
        log(`Closing database before rename: ${currentDbName}`);
        try { db.close(); } catch (e) {}
        db = null;
        currentDbName = null;
        await new Promise(r => setTimeout(r, 300));
    }

    const root = await navigator.storage.getDirectory();
    
    try {
        const oldHandle = await root.getFileHandle(oldPath);
        if ((oldHandle as any).move) {
            await (oldHandle as any).move(newPath);
        } else {
            const file = await oldHandle.getFile();
            const newHandle = await root.getFileHandle(newPath, { create: true });
            const writable = await (newHandle as any).createWritable();
            await writable.write(file);
            await writable.close();
            
            const newFile = await newHandle.getFile();
            if (newFile.size === file.size || (file.size === 0 && newFile.size === 0)) {
                await root.removeEntry(oldPath);
            } else {
                throw new Error(`Rename failed size check`);
            }
        }
        log(`Rename complete: ${newPath}`);
        await openDatabase(newPath);
    } catch (err) {
        error(`Rename failed:`, err);
        throw err;
    }
};

self.onmessage = async (e) => {
  const { type, id, sql, params, dbName, oldName, newName } = e.data;

  if (type === 'start') {
    if (!sqlite3) { sqlite3 = await sqlite3InitModule(); }
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

  if (type === 'renameProject') {
    try {
      await renameProject(oldName, newName);
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
        safeExec({ sql, bind: params });
        self.postMessage({ type: 'success', id });
        break;
      case 'getRows':
        const rows: any[] = [];
        safeExec({
          sql,
          bind: params,
          rowMode: 'object',
          callback: (row: any) => rows.push(row)
        });
        self.postMessage({ type: 'success', id, rows });
        break;
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (err: any) {
    error(`Error in ${type}:`, err);
    self.postMessage({ type: 'error', id, error: err.message });
  }
};
