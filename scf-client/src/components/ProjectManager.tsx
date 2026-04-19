import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Download, 
  Trash2, 
  FolderOpen,
  AlertCircle,
  FileVideo,
  Clapperboard,
  BookOpen,
  Calendar,
  Folder,
  ChevronRight,
  HardDrive
} from 'lucide-react';
import { db } from '../db/Database';
import type { ProjectInfo } from '../db/Database';

interface ProjectManagerProps {
  onProjectOpened: (name: string) => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectOpened }) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectTemplate, setProjectTemplate] = useState('Feature Film');
  const [localPath, setLocalPath] = useState('/home/user/projects');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const list = await db.listProjects();
      setProjects(list);
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
      const name = newProjectName.trim().endsWith('.scf') 
        ? newProjectName.trim() 
        : `${newProjectName.trim()}.scf`;
      await db.openProject(name);
      onProjectOpened(name);
    } catch (err: any) {
      setError("Failed to create project: " + err.message);
    }
  };

  const handleOpen = async (name: string) => {
    try {
      await db.openProject(name);
      onProjectOpened(name);
    } catch (err: any) {
      setError("Failed to open project: " + err.message);
    }
  };

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
      await db.deleteProject(name);
      await fetchProjects();
    } catch (err: any) {
      setError("Failed to delete project: " + err.message);
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

  const simulateBrowse = () => {
    // In a real app we might use window.showDirectoryPicker()
    // For this prototype, we'll just simulate a path change
    const paths = ['/Documents/Screenplays', '/Work/Studio/Projects', '/Home/Creative/Scripts'];
    const randomPath = paths[Math.floor(Math.random() * paths.length)];
    setLocalPath(randomPath);
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

  const getTemplateIcon = (template: string) => {
    switch (template) {
      case 'Feature Film': return <Clapperboard size={24} />;
      case 'TV Pilot': return <FileVideo size={24} />;
      case 'Short Story': return <BookOpen size={24} />;
      default: return <Folder size={24} />;
    }
  };

  return (
    <div className="project-manager-container" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      padding: '40px',
      gap: '40px',
      overflowY: 'auto',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)'
    }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.02em' }}>
          SCF Project Manager
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Organize and develop your cinematic universes.
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
          maxWidth: '800px'
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '350px 1fr',
        gap: '40px',
        alignItems: 'start'
      }}>
        
        {/* SECTION: NEW PROJECT */}
        <section style={{
          background: 'var(--bg-surface)',
          padding: '30px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Plus size={20} color="var(--accent)" />
            New Project
          </h2>

          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Project Name
            </label>
            <input 
              type="text" 
              placeholder="Enter title..." 
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Project Template
            </label>
            <select 
              value={projectTemplate}
              onChange={(e) => setProjectTemplate(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            >
              <option>Feature Film</option>
              <option>TV Pilot</option>
              <option>Short Story</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Local Directory
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1,
                padding: '12px',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {localPath}
              </div>
              <button 
                onClick={simulateBrowse}
                className="btn-icon"
                style={{
                  padding: '10px',
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
                title="Select Directory"
              >
                <FolderOpen size={18} />
              </button>
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            onClick={handleCreateProject}
            style={{
              marginTop: '10px',
              padding: '14px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'var(--accent)'}
          >
            <Plus size={18} />
            Create Project
          </button>
        </section>

        {/* SECTION: EXISTING PROJECTS */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Folder size={20} color="var(--text-secondary)" />
            Existing Projects
          </h2>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div style={{ 
                padding: '60px', 
                textAlign: 'center', 
                background: 'var(--bg-surface)', 
                borderRadius: 'var(--radius-lg)',
                border: '1px dotted var(--border)',
                color: 'var(--text-muted)'
              }}>
                <HardDrive size={48} style={{ marginBottom: '15px', opacity: 0.2 }} />
                <p>No projects found in your local storage.</p>
              </div>
            ) : (
              projects.map(proj => (
                <div 
                  key={proj.name}
                  onClick={() => handleOpen(proj.name)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    cursor: 'pointer',
                    transition: 'transform 0.1s, border-color 0.1s, background 0.1s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--bg-surface)';
                  }}
                >
                  {/* Thumbnail Placeholder */}
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: 'var(--bg-raised)',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                    flexShrink: 0
                  }}>
                    {getTemplateIcon(proj.name.includes('Pilot') ? 'TV Pilot' : 'Feature Film')}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {proj.name.replace('.scf', '').replace(/_/g, ' ')}
                      </h3>
                      <span style={{
                        padding: '2px 8px',
                        background: 'var(--success-bg)',
                        color: 'var(--success)',
                        fontSize: '0.7rem',
                        borderRadius: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        In Development
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <HardDrive size={12} />
                        <span>/opfs/{proj.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>{formatDate(proj.lastModified)}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                    <button 
                      className="btn-icon" 
                      onClick={() => handleOpen(proj.name)}
                      style={{
                        padding: '8px',
                        background: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer'
                      }}
                      title="Open Project"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button 
                      className="btn-icon" 
                      onClick={(e) => handleDownload(proj.name, e)}
                      style={{
                        padding: '8px',
                        background: 'var(--bg-raised)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer'
                      }}
                      title="Download .scf"
                    >
                      <Download size={18} />
                    </button>
                    <button 
                      className="btn-icon" 
                      onClick={(e) => handleDelete(proj.name, e)}
                      style={{
                        padding: '8px',
                        background: 'var(--danger-bg)',
                        color: 'var(--danger)',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer'
                      }}
                      title="Delete Project"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProjectManager;
