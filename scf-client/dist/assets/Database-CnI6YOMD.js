var e=class t{static instance;worker;nextId=1;pending=new Map;initialized;currentProjectName=null;constructor(){this.worker=new Worker(new URL(`/assets/DatabaseWorker-DEtEhvOD.js`,``+import.meta.url),{type:`module`}),this.initialized=new Promise((e,t)=>{this.pending.set(0,{resolve:e,reject:t}),this.worker.onmessage=e=>{let{type:t,id:n,error:r,rows:i}=e.data;if(t===`ready`){let e=this.pending.get(0);e&&(e.resolve(void 0),this.pending.delete(0));return}let a=this.pending.get(n);a&&(t===`error`?a.reject(Error(r)):a.resolve(i),this.pending.delete(n))},this.worker.postMessage({type:`start`})})}static getInstance(){return t.instance||=new t,t.instance}async waitReady(){return this.initialized}async call(e,t){await this.initialized;let n=this.nextId++;return new Promise((r,i)=>{this.pending.set(n,{resolve:r,reject:i}),this.worker.postMessage({type:e,id:n,...t})})}async listProjects(){return this.call(`listProjects`,{})}async openProject(e){let t=e.endsWith(`.scf`)?e:`${e}.scf`;await this.call(`open`,{dbName:t}),this.currentProjectName=t,localStorage.setItem(`scf_current_project`,t)}closeProject(){this.currentProjectName=null,localStorage.removeItem(`scf_current_project`)}async deleteProject(e){await this.call(`deleteProject`,{dbName:e}),this.currentProjectName===e&&(this.currentProjectName=null,localStorage.removeItem(`scf_current_project`))}async renameProject(e,t){let n=e.endsWith(`.scf`)?e:`${e}.scf`,r=t.endsWith(`.scf`)?t:`${t}.scf`;await this.call(`renameProject`,{oldName:n,newName:r}),this.currentProjectName===n&&(this.currentProjectName=r,localStorage.setItem(`scf_current_project`,r))}getCurrentProject(){return this.currentProjectName||=localStorage.getItem(`scf_current_project`),this.currentProjectName}async exec(e,t){return this.call(`exec`,{sql:e,params:t})}async getRows(e,t){return this.call(`getRows`,{sql:e,params:t})}async createEntity(e,t){let n=Object.keys(t),r=n.map(()=>`?`).join(`, `),i=Object.values(t),a=`INSERT INTO ${e} (${n.join(`, `)}) VALUES (${r})`;await this.exec(a,i);let o=await this.getRows(`SELECT last_insert_rowid() as id`);return window.dispatchEvent(new CustomEvent(`scf-data-updated`,{detail:{type:e,action:`create`}})),o[0].id}async updateEntity(e,t,n){let r=Object.keys(n);if(r.length===0)return;let i=r.map(e=>`${e} = ?`).join(`, `),a=[...Object.values(n),t],o=`UPDATE ${e} SET ${i}, updated_at = datetime('now') WHERE id = ?`;await this.exec(o,a),window.dispatchEvent(new CustomEvent(`scf-data-updated`,{detail:{type:e,id:t,action:`update`}}))}async deleteEntity(e,t){await this.exec(`DELETE FROM ${e} WHERE id = ?`,[t]),window.dispatchEvent(new CustomEvent(`scf-data-updated`,{detail:{type:e,id:t,action:`delete`}}))}async listEntities(e,t={}){let{search:n,limit:r=500,offset:i=0,orderBy:a=`id ASC`}=t,o=`SELECT * FROM ${e}`,s=[];return n&&(o+=` WHERE name LIKE ?`,s.push(`%${n}%`)),o+=` ORDER BY ${a} LIMIT ? OFFSET ?`,s.push(r,i),this.getRows(o,s)}async listEntitiesByScreenplayOrder(e){let t=``,n=``;if(e===`character`)t=`screenplay_lines`,n=`character_id`;else if(e===`location`)t=`screenplay_lines`,n=`location_id`;else if(e===`scene`)return this.getRows(`SELECT * FROM scene ORDER BY scene_number ASC, id ASC`);else if(e===`prop`)return this.getRows(`
            SELECT p.* FROM prop p
            LEFT JOIN (
                SELECT sp.prop_id, MIN(s.scene_number) as first_scene 
                FROM scene_prop sp 
                JOIN scene s ON s.id = sp.scene_id
                GROUP BY sp.prop_id
            ) ord ON p.id = ord.prop_id
            ORDER BY CASE WHEN ord.first_scene IS NULL THEN 1 ELSE 0 END, ord.first_scene ASC, p.id ASC
        `);else return this.listEntities(e,{orderBy:`id ASC`});return this.getRows(`
        SELECT e.* FROM ${e} e
        LEFT JOIN (
            SELECT ${n}, MIN(line_order) as first_line 
            FROM ${t} 
            WHERE ${n} IS NOT NULL
            GROUP BY ${n}
        ) ord ON e.id = ord.${n}
        ORDER BY CASE WHEN ord.first_line IS NULL THEN 1 ELSE 0 END, ord.first_line ASC, e.id ASC
    `)}async getEntityById(t,n){let r=await e.getRows(`SELECT * FROM ${t} WHERE id = ?`,[n]);return r.length>0?r[0]:null}async globalSearch(e){let t=[{type:`character`,icon:`👤`},{type:`location`,icon:`📍`},{type:`prop`,icon:`📦`},{type:`scene`,icon:`🎬`}],n=[];for(let r of t){let t=await this.listEntities(r.type,{search:e,limit:5});n=[...n,...t.map(e=>({...e,type:r.type,icon:r.icon}))]}return n}async loadScreenplay(){let e=await this.getRows(`SELECT key, value FROM screenplay_title_page ORDER BY sort_order, id`),t=await this.getRows(`
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
    `);return{title_page:e,lines:t,has_content:t.length>0||e.length>0}}async saveScreenplay(e,t){try{await this.exec(`BEGIN TRANSACTION`),await this.exec(`DELETE FROM screenplay_title_page`);for(let t=0;t<e.length;t++){let n=e[t];await this.exec(`INSERT INTO screenplay_title_page (key, value, sort_order) VALUES (?, ?, ?)`,[n.key||``,n.value||``,t])}await this.exec(`DELETE FROM screenplay_lines`);for(let e=0;e<t.length;e++){let n=t[e];await this.exec(`INSERT INTO screenplay_lines 
           (line_order, line_type, content, scene_id, character_id, location_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,[e,n.line_type||`action`,n.content||``,n.scene_id||null,n.character_id||null,n.location_id||null,n.metadata?JSON.stringify(n.metadata):null])}return await this.exec(`COMMIT`),window.dispatchEvent(new CustomEvent(`scf-data-updated`,{detail:{type:`screenplay`,action:`save`}})),{lines_written:t.length}}catch(e){throw await this.exec(`ROLLBACK`),e}}async publishVersion(e=``){let t=await this.getProjectStats();if(t.screenplay.lines===0)throw Error(`Cannot publish an empty screenplay`);let n=(await this.getRows(`SELECT COALESCE(MAX(version_number), 0) + 1 AS next_num FROM screenplay_versions`))[0].next_num,r=await this.getRows(`SELECT COUNT(DISTINCT character_id) AS cnt FROM screenplay_lines WHERE character_id IS NOT NULL`),i=await this.getRows(`SELECT COUNT(DISTINCT location_id) AS cnt FROM screenplay_lines WHERE location_id IS NOT NULL`),a=(await this.getRows(`SELECT content FROM screenplay_lines WHERE content != ''`)).reduce((e,t)=>e+t.content.split(/\s+/).length,0);await this.exec(`BEGIN TRANSACTION`);try{await this.exec(`INSERT INTO screenplay_versions 
         (version_number, description, line_count, scene_count, character_count, location_count, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,[n,e,t.screenplay.lines,t.screenplay.scenes,r[0].cnt,i[0].cnt,a]);let o=(await this.getRows(`SELECT last_insert_rowid() as id`))[0].id;return await this.exec(`INSERT INTO screenplay_version_lines 
         (version_id, line_order, line_type, content, scene_id, character_id, location_id, metadata)
         SELECT ?, line_order, line_type, content, scene_id, character_id, location_id, metadata
         FROM screenplay_lines
         ORDER BY line_order`,[o]),await this.exec(`INSERT INTO screenplay_version_title_page (version_id, key, value, sort_order)
         SELECT ?, key, value, sort_order
         FROM screenplay_title_page
         ORDER BY sort_order, id`,[o]),await this.exec(`COMMIT`),{version_id:o,version_number:n}}catch(e){throw await this.exec(`ROLLBACK`),e}}async listVersions(){return this.getRows(`
      SELECT id, version_number, description, published_at, 
             line_count, scene_count, character_count, 
             location_count, word_count
      FROM screenplay_versions
      ORDER BY version_number DESC
    `)}async restoreVersion(e){await this.exec(`BEGIN TRANSACTION`);try{return await this.exec(`DELETE FROM screenplay_lines`),await this.exec(`DELETE FROM screenplay_title_page`),await this.exec(`INSERT INTO screenplay_lines 
         (line_order, line_type, content, scene_id, character_id, location_id, metadata)
         SELECT line_order, line_type, content, scene_id, character_id, location_id, metadata
         FROM screenplay_version_lines
         WHERE version_id = ?
         ORDER BY line_order`,[e]),await this.exec(`INSERT INTO screenplay_title_page (key, value, sort_order)
         SELECT key, value, sort_order
         FROM screenplay_version_title_page
         WHERE version_id = ?
         ORDER BY sort_order, id`,[e]),await this.exec(`COMMIT`),window.dispatchEvent(new CustomEvent(`scf-data-updated`,{detail:{type:`screenplay`,action:`restore`}})),{success:!0}}catch(e){throw await this.exec(`ROLLBACK`),e}}async deleteVersion(e){await this.exec(`DELETE FROM screenplay_versions WHERE id = ?`,[e])}async getNavigatorData(){return{scenes:await this.getRows(`
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
    `),characters:await this.getRows(`
      SELECT 
          c.id AS character_id,
          c.name AS display_name,
          COUNT(DISTINCT sl.scene_id) AS scene_count
      FROM screenplay_lines sl
      JOIN character c ON c.id = sl.character_id
      WHERE sl.character_id IS NOT NULL AND sl.scene_id IS NOT NULL
      GROUP BY c.id, c.name
      ORDER BY scene_count DESC, c.name ASC
    `),locations:await this.getRows(`
      SELECT 
          l.id AS location_id,
          l.name,
          COUNT(DISTINCT sl.scene_id) AS scene_count
      FROM screenplay_lines sl
      JOIN location l ON l.id = sl.location_id
      WHERE sl.location_id IS NOT NULL AND sl.line_type = 'heading'
      GROUP BY l.id, l.name
      ORDER BY scene_count DESC, l.name ASC
    `),props:await this.getRows(`
      SELECT 
          p.id AS prop_id,
          p.name,
          (SELECT COUNT(DISTINCT scene_id) FROM scene_prop WHERE prop_id = p.id) AS scene_count
      FROM prop p
      ORDER BY scene_count DESC, p.name ASC
    `)}}async getProjectStats(){let e={entities:{},screenplay:{scenes:0,lines:0,versions:0}};for(let t of[`character`,`location`,`prop`,`scene`,`theme`,`sequence`])try{let n=await this.getRows(`SELECT COUNT(*) as cnt FROM ${t}`);e.entities[t]=n[0].cnt}catch{e.entities[t]=0}try{let t=await this.getRows(`SELECT COUNT(*) as cnt FROM screenplay_lines`);e.screenplay.lines=t[0].cnt;let n=await this.getRows(`SELECT COUNT(*) as cnt FROM screenplay_lines WHERE line_type = 'heading'`);e.screenplay.scenes=n[0].cnt;let r=await this.getRows(`SELECT COUNT(*) as cnt FROM screenplay_versions`);e.screenplay.versions=r[0].cnt}catch{}return e}}.getInstance();export{e as t};