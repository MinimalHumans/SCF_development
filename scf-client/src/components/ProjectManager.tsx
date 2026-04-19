import React, { useState, useEffect } from 'react';
import { 
  AlertCircle,
  Clapperboard,
  Calendar,
  ChevronRight,
  Upload,
  Trash2,
  X
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
  const [loadingImport, setLoadingImport] = useState(false);
  const [importStep, setImportStep] = useState<string | null>(null);
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

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
    
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.altKey || e.ctrlKey || e.metaKey) setIsModifierPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (!e.altKey && !e.ctrlKey && !e.metaKey) setIsModifierPressed(false);
    };
    const handleBlur = () => setIsModifierPressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleBlur);
    };
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

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!pendingFile) return;

    setLoadingImport(true);
    try {
      if (pendingFile.name.endsWith('.fountain')) {
        setImportStep("Reading file...");
        const text = await pendingFile.text();
        const baseName = pendingFile.name.replace(/\.fountain$/i, '');
        const projectName = `${baseName}.scf`;
        
        setImportStep("Extracting story data...");
        const { importAsNewProject } = await import('../db/FountainImport');
        await importAsNewProject(text, projectName);
        
        setImportStep("Finalizing project...");
        await fetchProjects();
      } else {
        setImportStep("Validating SQLite structure...");
        const buffer = await pendingFile.arrayBuffer();
        const root = await navigator.storage.getDirectory();
        
        setImportStep("Finalizing project...");
        const fileHandle = await root.getFileHandle(pendingFile.name, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(buffer);
        await writable.close();
        
        // Wait 300ms for OPFS to flush and release handles before we try to open it
        await new Promise(r => setTimeout(r, 300));
        
        await fetchProjects();
      }
      setPendingFile(null);
    } catch (err: any) {
      setError("Failed to import file: " + err.message);
    } finally {
      setLoadingImport(false);
      setImportStep(null);
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

  const handleDeleteProject = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Permanently delete project "${name}"?`)) return;
    
    try {
        await db.deleteProject(name);
        await fetchProjects();
    } catch (err: any) {
        setError("Failed to delete project: " + err.message);
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
      {loadingImport && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, color: 'white'
        }}>
          <div style={{ marginBottom: '20px', color: 'var(--accent)' }}>
            <Clapperboard size={48} className="animate-pulse" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
            Importing Project
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            {importStep || "Please wait..."}
          </div>
        </div>
      )}
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
            {!pendingFile ? (
                <label className="file-input-label" style={{ justifyContent: 'center', gap: '8px', padding: '16px', borderStyle: 'dashed' }}>
                    <Upload size={18} />
                    <span style={{ fontSize: '14px' }}>Drag & drop .scf or .fountain or browse to upload</span>
                    <input type="file" accept=".scf,.fountain" onChange={handleImportFile} />
                </label>
            ) : (
                <div style={{ 
                    padding: '16px', 
                    background: 'var(--bg-input)', 
                    border: '1px solid var(--accent)', 
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ color: 'var(--accent)' }}><Upload size={20} /></div>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Ready to import: {pendingFile.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(pendingFile.size / 1024).toFixed(1)} KB</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setPendingFile(null)} className="btn btn-icon" style={{ padding: '8px' }}>
                            <X size={16} />
                        </button>
                        <button onClick={confirmImport} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                            Import Now
                        </button>
                    </div>
                </div>
            )}
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
                      transition: 'all 0.2s',
                      position: 'relative'
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
                      {isModifierPressed && (
                        <button 
                            className="btn-icon btn-danger"
                            onClick={(e) => handleDeleteProject(proj.name, e)}
                            style={{ 
                                padding: '6px',
                                background: 'rgba(255,0,0,0.1)',
                                color: 'var(--danger)',
                                border: '1px solid var(--danger)',
                                borderRadius: '4px'
                            }}
                            title="Delete Project"
                        >
                            <Trash2 size={16} />
                        </button>
                      )}
                      <button 
                        className="btn-icon" 
                        onClick={(e) => handleDownload(proj.name, e)}
                        style={{ 
                          padding: '6px 10px', 
                          color: 'var(--text-muted)', 
                          border: '1px solid transparent',
                          background: 'none',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          lineHeight: 1
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
                        ⇓
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
