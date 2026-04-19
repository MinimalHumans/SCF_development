import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  FolderOpen,
  AlertCircle
} from 'lucide-react';
import { db } from '../db/Database';

interface ProjectManagerProps {
  onProjectOpened: (name: string) => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectOpened }) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
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

  const handleCreateEmpty = async () => {
    if (!newProjectName.trim()) return;
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

  const handleImportScf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(file.name, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(buffer);
      await writable.close();
      
      await fetchProjects();
    } catch (err: any) {
      setError("Failed to import .scf: " + err.message);
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

  return (
    <div className="landing">
      <div className="landing-card">
        <div className="landing-logo">SCF SYSTEM</div>
        <h1 className="landing-title">Professional Creative Tools</h1>
        <p className="landing-subtitle">
          Manage your story development projects with high-fidelity structured data.
        </p>

        {error && (
          <div className="error-msg">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="landing-section-label">Create New Project</div>
        <div className="landing-create">
          <input 
            type="text" 
            placeholder="Project name..." 
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateEmpty()}
          />
          <button className="btn btn-primary" onClick={handleCreateEmpty}>
            <Plus size={16} />
            <span>Create Empty</span>
          </button>
        </div>

        <div className="landing-section-label">Import Assets</div>
        <div className="landing-create">
          <label className="file-input-label">
            <Upload size={16} />
            <span>Import .scf (SQLite)</span>
            <input type="file" accept=".scf,.db" onChange={handleImportScf} />
          </label>
          <label className="file-input-label">
            <FileText size={16} />
            <span>Import .fountain</span>
            <input type="file" accept=".fountain" disabled />
          </label>
        </div>

        <div className="landing-section-label">Existing Projects</div>
        <div className="landing-projects">
          {loading ? (
            <div className="landing-empty">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="landing-empty">No projects found. Create or import one to begin.</div>
          ) : (
            projects.map(name => (
              <div key={name} className="project-item" onClick={() => handleOpen(name)}>
                <div className="project-item-link">
                  <FolderOpen className="project-icon" size={20} />
                  <div className="project-info">
                    <div className="project-name">{name.replace('.scf', '')}</div>
                    <div className="project-path">/opfs/{name}</div>
                  </div>
                </div>
                <button 
                  className="project-download btn-icon" 
                  title="Download .scf"
                  onClick={(e) => handleDownload(name, e)}
                >
                  <Download size={16} />
                </button>
                <button 
                  className="project-download btn-icon" 
                  title="Delete Project"
                  onClick={(e) => handleDelete(name, e)}
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectManager;
