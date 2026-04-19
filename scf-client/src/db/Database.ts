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
    return result[0].id;
  }

  public async updateEntity(entityType: string, id: number, data: Record<string, any>): Promise<void> {
    const fields = Object.keys(data);
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = [...Object.values(data), id];
    
    const sql = `UPDATE ${entityType} SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;
    await this.exec(sql, values);
  }

  public async deleteEntity(entityType: string, id: number): Promise<void> {
    await this.exec(`DELETE FROM ${entityType} WHERE id = ?`, [id]);
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
    const rows = await this.getRows<T>(`SELECT * FROM ${entityType} WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : null;
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
