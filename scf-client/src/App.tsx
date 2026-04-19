import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Film, 
  Database as DbIcon, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  Info
} from 'lucide-react';

import SidebarTree from './components/SidebarTree';
import EntityEditor from './components/EntityEditor';
import ProjectManager from './components/ProjectManager';
import { db } from './db/Database';

import './assets/css/style.css';
import './assets/css/screenplay.css';
import './assets/css/screenplay_versions.css';
import './assets/css/screenplay_props.css';
import './assets/css/entity_tooltips.css';
import './assets/css/entity_images.css';
import './App.css';

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentProject, setCurrentProject] = useState<string | null>(db.getCurrentProject());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      await db.waitReady();
      const proj = db.getCurrentProject();
      if (proj) {
        try {
          await db.openProject(proj);
          setCurrentProject(proj);
        } catch (e) {
          console.error("Failed to auto-open project", e);
          setCurrentProject(null);
        }
      }
    };
    init();
  }, []);

  const handleProjectOpened = (name: string) => {
    setCurrentProject(name);
    navigate('/browse');
  };

  const handleCloseProject = () => {
    db.closeProject();
    setCurrentProject(null);
    navigate('/');
  };

  if (!currentProject) {
    return <ProjectManager onProjectOpened={handleProjectOpened} />;
  }

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-left">
          <button 
            className="icon-button menu-toggle" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
          <div className="logo">
            <span className="logo-icon">🎬</span>
            <span className="logo-text">SCF</span>
          </div>
          <div className="header-sep">/</div>
          <div className="project-name" style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
            {currentProject.replace('.scf', '')}
          </div>
        </div>

        <nav className="header-nav">
          <Link 
            to="/browse" 
            className={`nav-link ${location.pathname.startsWith('/browse') || location.pathname === '/' ? 'active' : ''}`}
          >
            <Search size={18} />
            <span>Search & Browse</span>
          </Link>
          <Link 
            to="/screenplay" 
            className={`nav-link ${location.pathname.startsWith('/screenplay') ? 'active' : ''}`}
          >
            <Film size={18} />
            <span>Screenplay</span>
          </Link>
          <Link 
            to="/query" 
            className={`nav-link ${location.pathname.startsWith('/query') ? 'active' : ''}`}
          >
            <DbIcon size={18} />
            <span>Query Explorer</span>
          </Link>
        </nav>

        <div className="header-right">
          <button 
            className="icon-button" 
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="main-content">
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <SidebarTree />
        </aside>

        <section className="content-area">
          <Routes>
            <Route path="/" element={
              <div className="placeholder-view">
                <div className="placeholder-header">
                  <h1>Project Overview</h1>
                  <p>Welcome back to {currentProject.replace('.scf', '')}.</p>
                </div>
                <div className="placeholder-card">
                  <Info size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <p>Select an entity from the sidebar to view or edit its details.</p>
                  <p style={{ marginTop: '12px', fontSize: '13px' }}>
                    Use the navigation above to switch between the Entity Browser, Screenplay Editor, and Query Explorer.
                  </p>
                </div>
              </div>
            } />
            <Route path="/browse" element={
              <div className="placeholder-view">
                <div className="placeholder-header">
                  <h1>Search & Browse</h1>
                  <p>Explore your story entities and their relationships.</p>
                </div>
                <div className="placeholder-card">
                  <Search size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <p>Select an entity type in the sidebar to browse existing entries or create new ones.</p>
                </div>
              </div>
            } />
            <Route path="/browse/:type/:id" element={<EntityEditor />} />
            <Route path="/screenplay" element={
              <div className="placeholder-view">
                <div className="placeholder-header">
                  <h1>Screenplay Editor</h1>
                  <p>High-fidelity script development with integrated entity tagging.</p>
                </div>
                <div className="placeholder-card">
                  <Film size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <p>The Screenplay Editor module is currently in development.</p>
                  <p style={{ marginTop: '12px', fontSize: '13px' }}>
                    Future updates will include real-time Fountain parsing and automated entity extraction.
                  </p>
                </div>
              </div>
            } />
            <Route path="/query" element={
              <div className="placeholder-view">
                <div className="placeholder-header">
                  <h1>Query Explorer</h1>
                  <p>Advanced data analysis and relationship mapping.</p>
                </div>
                <div className="placeholder-card">
                  <DbIcon size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <p>The Query Explorer module is currently in development.</p>
                  <p style={{ marginTop: '12px', fontSize: '13px' }}>
                    This view will provide tools for complex cross-entity analysis and project statistics.
                  </p>
                </div>
              </div>
            } />
          </Routes>
        </section>
      </main>

      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <button className="close-button" onClick={() => setSettingsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="field-label">Project Management</label>
                <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span>{currentProject}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn" 
                      onClick={() => {
                        setSettingsOpen(false);
                        navigate('/browse/project/1');
                      }}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <Settings size={14} />
                      <span>Project Settings</span>
                    </button>
                    <button 
                      className="btn btn-danger" 
                      onClick={handleCloseProject}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <LogOut size={14} />
                      <span>Close Project</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Application Theme</label>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Professional Dark (Default)
                </div>
              </div>
              <div className="field-group" style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  SCF System v0.1.0-alpha
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
