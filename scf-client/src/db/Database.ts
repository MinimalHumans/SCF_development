/**
 * Database Singleton
 * ==================
 * Provides a promise-based API for the React app to interact with the SQLite database
 * via a Web Worker (DatabaseWorker.ts).
 */

export interface ListOptions {
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}

export interface ProjectStats {
  entities: Record<string, number>;
  screenplay: {
    scenes: number;
    lines: number;
    versions: number;
  };
}

export interface ProjectInfo {
  name: string;
  lastModified: number;
}

class Database {
  private static instance: Database;
  private worker: Worker;
  private nextId = 1;
  private pending: Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }> = new Map();
  private initialized: Promise<void>;
  private currentProjectName: string | null = null;

  private constructor() {
    this.worker = new Worker(new URL('./DatabaseWorker.ts', import.meta.url), {
      type: 'module',
    });

    this.initialized = new Promise((resolve, reject) => {
      const initId = 0;
      this.pending.set(initId, { resolve, reject });
      
      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, error, rows } = e.data;

        if (type === 'ready') {
          const initPromise = this.pending.get(0);
          if (initPromise) {
            initPromise.resolve(undefined);
            this.pending.delete(0);
          }
          return;
        }

        const promise = this.pending.get(id);
        if (!promise) return;

        if (type === 'error') {
          promise.reject(new Error(error));
        } else {
          promise.resolve(rows);
        }
        this.pending.delete(id);
      };

      this.worker.postMessage({ type: 'start' });
    });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async waitReady(): Promise<void> {
    return this.initialized;
  }

  private async call(type: string, payload: any): Promise<any> {
    await this.initialized;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  public async listProjects(): Promise<ProjectInfo[]> {
    return this.call('listProjects', {});
  }

  public async openProject(projectName: string): Promise<void> {
    const name = projectName.endsWith('.scf') ? projectName : `${projectName}.scf`;
    await this.call('open', { dbName: name });
    this.currentProjectName = name;
    localStorage.setItem('scf_current_project', name);
  }

  public closeProject(): void {
    this.currentProjectName = null;
    localStorage.removeItem('scf_current_project');
  }

  public async deleteProject(projectName: string): Promise<void> {
    await this.call('deleteProject', { dbName: projectName });
    if (this.currentProjectName === projectName) {
        this.currentProjectName = null;
        localStorage.removeItem('scf_current_project');
    }
  }

  public async renameProject(oldName: string, newName: string): Promise<void> {
    const formattedOldName = oldName.endsWith('.scf') ? oldName : `${oldName}.scf`;
    const formattedNewName = newName.endsWith('.scf') ? newName : `${newName}.scf`;
    
    await this.call('renameProject', { oldName: formattedOldName, newName: formattedNewName });
    
    if (this.currentProjectName === formattedOldName) {
      this.currentProjectName = formattedNewName;
      localStorage.setItem('scf_current_project', formattedNewName);
    }
  }

  public getCurrentProject(): string | null {
    if (!this.currentProjectName) {
        this.currentProjectName = localStorage.getItem('scf_current_project');
    }
    return this.currentProjectName;
  }

  public async exec(sql: string, params?: any[]): Promise<void> {
    return this.call('exec', { sql, params });
  }

  public async getRows<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return this.call('getRows', { sql, params });
  }

  // ===========================================================================
  // Generic Entity CRUD
  // ===========================================================================

  public async createEntity(entityType: string, data: Record<string, any>): Promise<number> {
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Object.values(data);
    
    const sql = `INSERT INTO ${entityType} (${fields.join(', ')}) VALUES (${placeholders})`;
    await this.exec(sql, values);
    
    const result = await this.getRows(`SELECT last_insert_rowid() as id`);
    
    // Notify app of data change
    window.dispatchEvent(new CustomEvent('scf-data-updated', { detail: { type: entityType, action: 'create' } }));
    
    return result[0].id;
  }

  public async updateEntity(entityType: string, id: number, data: Record<string, any>): Promise<void> {
    const fields = Object.keys(data);
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = [...Object.values(data), id];
    
    const sql = `UPDATE ${entityType} SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;
    await this.exec(sql, values);

    // Notify app of data change
    window.dispatchEvent(new CustomEvent('scf-data-updated', { detail: { type: entityType, id, action: 'update' } }));
  }

  public async deleteEntity(entityType: string, id: number): Promise<void> {
    await this.exec(`DELETE FROM ${entityType} WHERE id = ?`, [id]);
    
    // Notify app of data change
    window.dispatchEvent(new CustomEvent('scf-data-updated', { detail: { type: entityType, id, action: 'delete' } }));
  }

  public async listEntities<T = any>(entityType: string, options: ListOptions = {}): Promise<T[]> {
    const { search, limit = 500, offset = 0, orderBy = 'id ASC' } = options;
    
    let sql = `SELECT * FROM ${entityType}`;
    const params: any[] = [];
    
    if (search) {
      // Note: This assumes a 'name' field exists, which is true for most SCF entities
      sql += ` WHERE name LIKE ?`;
      params.push(`%${search}%`);
    }
    
    sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    return this.getRows<T>(sql, params);
  }

  public async getEntityById<T = any>(entityType: string, id: number): Promise<T | null> {
    const rows = await db.getRows<T>(`SELECT * FROM ${entityType} WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public async globalSearch(query: string): Promise<any[]> {
    const searchables = [
      { type: 'character', icon: '👤' },
      { type: 'location', icon: '📍' },
      { type: 'prop', icon: '📦' },
      { type: 'scene', icon: '🎬' }
    ];

    let allResults: any[] = [];

    for (const s of searchables) {
      const rows = await this.listEntities(s.type, { search: query, limit: 5 });
      allResults = [...allResults, ...rows.map(r => ({ ...r, type: s.type, icon: s.icon }))];
    }

    return allResults;
  }

  // ===========================================================================
  // Screenplay Editor Methods
  // ===========================================================================

  public async loadScreenplay(): Promise<{ title_page: any[], lines: any[], has_content: boolean }> {
    const titleRows = await this.getRows(
      "SELECT key, value FROM screenplay_title_page ORDER BY sort_order, id"
    );

    const linesRows = await this.getRows(`
      SELECT 
          sl.id,
          sl.line_order,
          sl.line_type,
          sl.content,
          sl.scene_id,
          sl.character_id,
          sl.location_id,
          sl.metadata,
          s.name AS scene_name,
          c.name AS character_name,
          l.name AS location_name
      FROM screenplay_lines sl
      LEFT JOIN scene s ON s.id = sl.scene_id
      LEFT JOIN character c ON c.id = sl.character_id
      LEFT JOIN location l ON l.id = sl.location_id
      ORDER BY sl.line_order ASC
    `);

    return {
      title_page: titleRows,
      lines: linesRows,
      has_content: linesRows.length > 0 || titleRows.length > 0
    };
  }

  public async saveScreenplay(titlePage: any[], lines: any[]): Promise<any> {
    // This is a complex operation that we'll perform via multiple exec/getRows calls
    // In a real production app, this should probably be a single transaction in the worker.
    
    try {
      await this.exec("BEGIN TRANSACTION");

      // 1. Title page
      await this.exec("DELETE FROM screenplay_title_page");
      for (let i = 0; i < titlePage.length; i++) {
        const tp = titlePage[i];
        await this.exec(
          "INSERT INTO screenplay_title_page (key, value, sort_order) VALUES (?, ?, ?)",
          [tp.key || "", tp.value || "", i]
        );
      }

      // 2. Clear lines
      await this.exec("DELETE FROM screenplay_lines");

      // We won't port the full entity-auto-creation logic here to keep it simpler for the UI
      // but we should at least save the lines.
      // The Python backend did a lot of "find or create" logic.
      // For the client, we'll assume the editor might have already resolved some IDs 
      // or we just save what we have.

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await this.exec(
          `INSERT INTO screenplay_lines 
           (line_order, line_type, content, scene_id, character_id, location_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            i, 
            line.line_type || 'action', 
            line.content || '', 
            line.scene_id || null,
            line.character_id || null,
            line.location_id || null,
            line.metadata ? JSON.stringify(line.metadata) : null
          ]
        );
      }

      await this.exec("COMMIT");
      
      // Notify app of data change (scenes might have changed)
      window.dispatchEvent(new CustomEvent('scf-data-updated', { detail: { type: 'screenplay', action: 'save' } }));
      
      return { lines_written: lines.length };
    } catch (e) {
      await this.exec("ROLLBACK");
      throw e;
    }
  }

  public async publishVersion(description: string = ""): Promise<any> {
    const stats = await this.getProjectStats();
    if (stats.screenplay.lines === 0) {
      throw new Error("Cannot publish an empty screenplay");
    }

    const nextNumRows = await this.getRows("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_num FROM screenplay_versions");
    const versionNumber = nextNumRows[0].next_num;

    const charCountRows = await this.getRows("SELECT COUNT(DISTINCT character_id) AS cnt FROM screenplay_lines WHERE character_id IS NOT NULL");
    const locCountRows = await this.getRows("SELECT COUNT(DISTINCT location_id) AS cnt FROM screenplay_lines WHERE location_id IS NOT NULL");
    
    const allContent = await this.getRows("SELECT content FROM screenplay_lines WHERE content != ''");
    const wordCount = allContent.reduce((sum, r) => sum + (r.content.split(/\s+/).length), 0);

    await this.exec("BEGIN TRANSACTION");
    try {
      await this.exec(
        `INSERT INTO screenplay_versions 
         (version_number, description, line_count, scene_count, character_count, location_count, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [versionNumber, description, stats.screenplay.lines, stats.screenplay.scenes, charCountRows[0].cnt, locCountRows[0].cnt, wordCount]
      );

      const versionIdRows = await this.getRows("SELECT last_insert_rowid() as id");
      const versionId = versionIdRows[0].id;

      await this.exec(
        `INSERT INTO screenplay_version_lines 
         (version_id, line_order, line_type, content, scene_id, character_id, location_id, metadata)
         SELECT ?, line_order, line_type, content, scene_id, character_id, location_id, metadata
         FROM screenplay_lines
         ORDER BY line_order`,
        [versionId]
      );

      await this.exec(
        `INSERT INTO screenplay_version_title_page (version_id, key, value, sort_order)
         SELECT ?, key, value, sort_order
         FROM screenplay_title_page
         ORDER BY sort_order, id`,
        [versionId]
      );

      await this.exec("COMMIT");
      return { version_id: versionId, version_number: versionNumber };
    } catch (e) {
      await this.exec("ROLLBACK");
      throw e;
    }
  }

  public async listVersions(): Promise<any[]> {
    return this.getRows(`
      SELECT id, version_number, description, published_at, 
             line_count, scene_count, character_count, 
             location_count, word_count
      FROM screenplay_versions
      ORDER BY version_number DESC
    `);
  }

  public async restoreVersion(versionId: number): Promise<any> {
    await this.exec("BEGIN TRANSACTION");
    try {
      await this.exec("DELETE FROM screenplay_lines");
      await this.exec("DELETE FROM screenplay_title_page");

      await this.exec(
        `INSERT INTO screenplay_lines 
         (line_order, line_type, content, scene_id, character_id, location_id, metadata)
         SELECT line_order, line_type, content, scene_id, character_id, location_id, metadata
         FROM screenplay_version_lines
         WHERE version_id = ?
         ORDER BY line_order`,
        [versionId]
      );

      await this.exec(
        `INSERT INTO screenplay_title_page (key, value, sort_order)
         SELECT key, value, sort_order
         FROM screenplay_version_title_page
         WHERE version_id = ?
         ORDER BY sort_order, id`,
        [versionId]
      );

      await this.exec("COMMIT");
      
      // Notify app of data change
      window.dispatchEvent(new CustomEvent('scf-data-updated', { detail: { type: 'screenplay', action: 'restore' } }));
      
      return { success: true };
    } catch (e) {
      await this.exec("ROLLBACK");
      throw e;
    }
  }

  public async deleteVersion(versionId: number): Promise<void> {
    await this.exec("DELETE FROM screenplay_versions WHERE id = ?", [versionId]);
  }

  public async getNavigatorData(): Promise<any> {
    const scenes = await this.getRows(`
      SELECT 
          sl.scene_id,
          sl.content AS heading,
          sl.line_order,
          sl.location_id,
          s.name AS scene_name,
          s.scene_number,
          l.name AS location_name
      FROM screenplay_lines sl
      LEFT JOIN scene s ON s.id = sl.scene_id
      LEFT JOIN location l ON l.id = sl.location_id
      WHERE sl.line_type = 'heading'
      ORDER BY sl.line_order ASC
    `);

    const characters = await this.getRows(`
      SELECT 
          c.id AS character_id,
          c.name AS display_name,
          COUNT(DISTINCT sl.scene_id) AS scene_count
      FROM screenplay_lines sl
      JOIN character c ON c.id = sl.character_id
      WHERE sl.character_id IS NOT NULL AND sl.scene_id IS NOT NULL
      GROUP BY c.id, c.name
      ORDER BY scene_count DESC, c.name ASC
    `);

    const locations = await this.getRows(`
      SELECT 
          l.id AS location_id,
          l.name,
          COUNT(DISTINCT sl.scene_id) AS scene_count
      FROM screenplay_lines sl
      JOIN location l ON l.id = sl.location_id
      WHERE sl.location_id IS NOT NULL AND sl.line_type = 'heading'
      GROUP BY l.id, l.name
      ORDER BY scene_count DESC, l.name ASC
    `);

    const props = await this.getRows(`
      SELECT 
          p.id AS prop_id,
          p.name,
          (SELECT COUNT(DISTINCT scene_id) FROM scene_prop WHERE prop_id = p.id) AS scene_count
      FROM prop p
      ORDER BY scene_count DESC, p.name ASC
    `);

    return { scenes, characters, locations, props };
  }

  // ===========================================================================
  // Project Helpers
  // ===========================================================================

  public async getProjectStats(): Promise<ProjectStats> {
    const stats: ProjectStats = {
      entities: {},
      screenplay: {
        scenes: 0,
        lines: 0,
        versions: 0
      }
    };

    // Generic entity counts
    const entityTypes = ['character', 'location', 'prop', 'scene', 'theme', 'sequence'];
    for (const type of entityTypes) {
      try {
        const rows = await this.getRows(`SELECT COUNT(*) as cnt FROM ${type}`);
        stats.entities[type] = rows[0].cnt;
      } catch (e) {
        stats.entities[type] = 0;
      }
    }

    // Screenplay stats
    try {
      const lineRows = await this.getRows(`SELECT COUNT(*) as cnt FROM screenplay_lines`);
      stats.screenplay.lines = lineRows[0].cnt;
      
      const sceneRows = await this.getRows(`SELECT COUNT(*) as cnt FROM screenplay_lines WHERE line_type = 'heading'`);
      stats.screenplay.scenes = sceneRows[0].cnt;

      const versionRows = await this.getRows(`SELECT COUNT(*) as cnt FROM screenplay_versions`);
      stats.screenplay.versions = versionRows[0].cnt;
    } catch (e) {
      // ignore
    }

    return stats;
  }
}

export const db = Database.getInstance();
export default db;
