import React, { useState, useEffect } from 'react';
import { 
  ChevronsDown, 
  AlertCircle,
  Clapperboard,
  Calendar,
  ChevronRight,
  Upload
} from 'lucide-react';
import { db } from '../db/Database';
import type { ProjectInfo } from '../db/Database';

interface ProjectManagerProps {
  onProjectOpened: (name: string) => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectOpened }) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const list = await db.listProjects();
      // Filter for .scf only as per request
      setProjects(list.filter(p => p.name.endsWith('.scf')));
    } catch (err: any) {
      setError("Failed to load projects: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError("Project name is required.");
      return;
    }
    try {
      const baseName = newProjectName.trim();
      const name = baseName.endsWith('.scf') ? baseName : `${baseName}.scf`;
      await db.openProject(name);
      onProjectOpened(name);
    } catch (err: any) {
      setError("Failed to create project: " + err.message);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const root = await navigator.storage.getDirectory();
      
      let fileName = file.name;
      // We accept .scf and .fountain. If it's something else, we might still try but it's risky.
      // For now, just save it with its original name.
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(buffer);
      await writable.close();
      
      await fetchProjects();
    } catch (err: any) {
      setError("Failed to import file: " + err.message);
    }
  };

  const handleOpen = (name: string) => {
    handleProjectAction(name);
  };

  const handleProjectAction = async (name: string) => {
    try {
      await db.openProject(name);
      onProjectOpened(name);
    } catch (err: any) {
      setError("Failed to open project: " + err.message);
    }
  };

  const handleDownload = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(name);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("Failed to download project: " + err.message);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="project-manager-wrapper" style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      minHeight: '100vh',
      width: '100%',
      background: 'var(--bg-base)',
      padding: '80px 10%'
    }}>
      <div className="project-manager-card" style={{
        width: '100%',
        maxWidth: '640px',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: '48px',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        textAlign: 'left'
      }}>
        <header>
          <h1 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
            SCF
          </h1>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Story Context Framework
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
            Create and edit structured story databases.<br />
            Open an existing project or create a new one.
          </p>
        </header>

        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px'
          }}>
            <AlertCircle size={16} />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* CREATE PROJECT */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Create New Project
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="Project name..." 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button 
                onClick={handleCreateProject}
                className="btn btn-primary"
                style={{ padding: '0 24px', fontWeight: 600 }}
              >
                Create
              </button>
            </div>
          </section>

          {/* IMPORT PROJECT */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Import Project
            </h3>
            <label className="file-input-label" style={{ justifyContent: 'center', gap: '8px', padding: '16px', borderStyle: 'dashed' }}>
              <Upload size={18} />
              <span style={{ fontSize: '14px' }}>Drag & drop .scf or .fountain or browse to upload</span>
              <input type="file" accept=".scf,.fountain" onChange={handleImportFile} />
            </label>
          </section>

          {/* EXISTING */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Existing Projects
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
              ) : projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No projects found.
                </div>
              ) : (
                projects.map(proj => (
                  <div 
                    key={proj.name}
                    onClick={() => handleOpen(proj.name)}
                    style={{
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius)',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.background = 'var(--bg-raised)';
                    }}
                  >
                    <div style={{ color: 'var(--accent)', flexShrink: 0 }}>
                      <Clapperboard size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {proj.name.replace('.scf', '')}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={10} />
                          {formatDate(proj.lastModified)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                      <button 
                        className="btn-icon" 
                        onClick={(e) => handleDownload(proj.name, e)}
                        style={{ 
                          padding: '6px', 
                          color: 'var(--text-muted)', 
                          border: '1px solid transparent',
                          background: 'none',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.color = 'var(--accent)';
                          e.currentTarget.style.background = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-muted)';
                          e.currentTarget.style.background = 'none';
                        }}
                        title="Download"
                      >
                        <ChevronsDown size={16} />
                      </button>
                      <div style={{ padding: '6px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProjectManager;
