import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { 
  Search, 
  Film, 
  Database as DbIcon, 
  Settings, 
  X,
  LogOut
} from 'lucide-react';

import SidebarTree from './components/SidebarTree';
import EntityEditor from './components/EntityEditor';
import ProjectManager from './components/ProjectManager';
import ScreenplayEditor from './components/ScreenplayEditor';
import QueryExplorer from './components/QueryExplorer';
import { db } from './db/Database';
import * as Queries from './db/Queries';

import './assets/css/style.css';
import './assets/css/screenplay.css';
import './assets/css/screenplay_versions.css';
import './assets/css/screenplay_props.css';
import './assets/css/entity_tooltips.css';
import './assets/css/entity_images.css';
import './App.css';

const BrowseEmptyState = () => (
  <div className="empty-state">
    <DbIcon size={48} className="empty-state-icon" />
    <h2>Select an entity to edit</h2>
    <p>Or create a new one from the sidebar</p>
  </div>
);

const App: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(Number(localStorage.getItem('scf_sidebar_width')) || 280);
  const [currentProject, setCurrentProject] = useState<string | null>(db.getCurrentProject());
  const [projectMetadata, setProjectMetadata] = useState<any>(null);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectStats, setProjectStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isBrowseRoute = location.pathname.startsWith('/browse');

  const fetchProjectMetadata = async () => {
    try {
      const rows = await db.getRows("SELECT * FROM project WHERE id = 1");
      if (rows.length > 0) {
        setProjectMetadata(rows[0]);
      }
    } catch (e) {
      console.error("Failed to fetch project metadata", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await db.waitReady();
      const proj = db.getCurrentProject();
      if (proj) {
        try {
          await db.openProject(proj);
          setCurrentProject(proj);
          await fetchProjectMetadata();
        } catch (e) {
          console.error("Failed to auto-open project", e);
          setCurrentProject(null);
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail?.type === 'project') {
        fetchProjectMetadata();
      }
    };
    window.addEventListener('scf-data-updated', handleUpdate);
    return () => window.removeEventListener('scf-data-updated', handleUpdate);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F: Focus Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      // Ctrl+S: Save (custom event for editors to listen to)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('scf-save'));
      }

      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
        } else {
          setSearchQuery('');
          setSearchResults([]);
          setIsSearching(false);
          searchInputRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (settingsOpen) {
      Queries.projectStats().then(setProjectStats);
    }
  }, [settingsOpen]);

  useEffect(() => {
    const doSearch = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      const results = await db.globalSearch(searchQuery);
      setSearchResults(results);
      setSelectedIndex(-1);
    };
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        const result = searchResults[selectedIndex];
        navigate(`/browse/${result.type}/${result.id}`);
        setSearchQuery('');
        setSearchResults([]);
        setIsSearching(false);
      }
    }
  };

  const handleProjectOpened = async (name: string) => {
    setCurrentProject(name);
    await fetchProjectMetadata();
    navigate('/browse');
  };

  const handleCloseProject = () => {
    db.closeProject();
    setCurrentProject(null);
    setProjectMetadata(null);
    navigate('/');
  };

  const handleRenameProject = async () => {
    if (!currentProject || !editingProjectName.trim()) {
      setIsEditingProjectName(false);
      return;
    }

    const newName = editingProjectName.trim();
    if (projectMetadata && newName === projectMetadata.name) {
      setIsEditingProjectName(false);
      return;
    }

    try {
      // Update internal 'soft' name in DB (Standard SQL UPDATE - 100% safe)
      await db.updateEntity('project', 1, { name: newName });
      setProjectMetadata((prev: any) => prev ? { ...prev, name: newName } : { name: newName });
      setIsEditingProjectName(false);
      
      // Notify other components
      window.dispatchEvent(new CustomEvent('scf-data-updated', { detail: { type: 'project', action: 'update' } }));
    } catch (e) {
      console.error("Failed to rename project", e);
      setIsEditingProjectName(false);
    }
  };

  const handleResize = (e: MouseEvent) => {
    const newWidth = e.clientX;
    if (newWidth > 150 && newWidth < 600) {
      setSidebarWidth(newWidth);
      localStorage.setItem('scf_sidebar_width', newWidth.toString());
    }
  };

  const stopResize = () => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
  };

  const startResize = () => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
  };

  if (!currentProject) {
    return <ProjectManager onProjectOpened={handleProjectOpened} />;
  }

  const projectDisplayName = projectMetadata?.name || currentProject.replace('.scf', '');

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">🎬</span>
            <span className="logo-text">SCF</span>
          </div>
          <div className="header-sep">/</div>
          {isEditingProjectName ? (
            <input 
              autoFocus
              className="project-name-input"
              value={editingProjectName}
              onChange={(e) => setEditingProjectName(e.target.value)}
              onBlur={handleRenameProject}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameProject();
                if (e.key === 'Escape') setIsEditingProjectName(false);
              }}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--accent)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 600,
                padding: '2px 8px',
                outline: 'none',
                width: 'auto',
                minWidth: '150px'
              }}
            />
          ) : (
            <div 
              className="project-name" 
              style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              onDoubleClick={() => {
                setEditingProjectName(projectDisplayName);
                setIsEditingProjectName(true);
              }}
              title="Double-click to rename"
            >
              {projectDisplayName}
            </div>
          )}
        </div>

        <div className="global-search-container">
          <Search size={16} className="global-search-icon" />
          <input 
            ref={searchInputRef}
            type="text" 
            className="global-search-input"
            placeholder="Search everything... (/)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => searchQuery.length >= 2 && setIsSearching(true)}
          />
          {isSearching && searchQuery.length >= 2 && (
            <div className="global-search-results">
              {searchResults.length > 0 ? (
                searchResults.map((result, index) => (
                  <Link 
                    key={`${result.type}-${result.id}`}
                    to={`/browse/${result.type}/${result.id}`}
                    className={`search-result-item ${selectedIndex === index ? 'selected' : ''}`}
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setIsSearching(false);
                    }}
                  >
                    <div className="search-result-icon">{result.icon}</div>
                    <div className="search-result-info">
                      <span className="search-result-name">{result.name}</span>
                      <span className="search-result-type">{result.type}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="search-no-results">No matches found for "{searchQuery}"</div>
              )}
            </div>
          )}
        </div>

        <nav className="header-nav">
          <Link 
            to="/browse" 
            className={`nav-link ${location.pathname.startsWith('/browse') ? 'active' : ''}`}
          >
            <Search size={18} />
            <span>Entity Browser</span>
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
        {isBrowseRoute && (
          <aside 
            className="sidebar open"
            style={{ width: sidebarWidth }}
          >
            <SidebarTree />
            <div 
              className="sidebar-resizer" 
              onMouseDown={startResize}
            />
          </aside>
        )}

        <section className="content-area">
          <Routes>
            <Route path="/" element={<Navigate to="/browse" replace />} />
            <Route path="/browse" element={<BrowseEmptyState />} />
            <Route path="/browse/:type/:id" element={<EntityEditor />} />
            <Route path="/screenplay" element={<ScreenplayEditor />} />
            <Route path="/query" element={<QueryExplorer />} />
          </Routes>
        </section>
      </main>

      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '600px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Settings & Project Stats</h2>
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

              {projectStats && (
                <div className="field-group" style={{ marginTop: '24px' }}>
                  <label className="field-label">Quick Stats</label>
                  <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '16px', display: 'grid', gap: '12px' }}>
                    <div className="stats-card" style={{ padding: '12px' }}>
                      <div className="stats-label" style={{ fontSize: '10px' }}>Scenes</div>
                      <div className="stats-value" style={{ fontSize: '20px' }}>{projectStats.scene_count}</div>
                    </div>
                    <div className="stats-card" style={{ padding: '12px' }}>
                      <div className="stats-label" style={{ fontSize: '10px' }}>Characters</div>
                      <div className="stats-value" style={{ fontSize: '20px' }}>{projectStats.character_count}</div>
                    </div>
                    <div className="stats-card" style={{ padding: '12px' }}>
                      <div className="stats-label" style={{ fontSize: '10px' }}>Locations</div>
                      <div className="stats-value" style={{ fontSize: '20px' }}>{projectStats.location_count}</div>
                    </div>
                  </div>
                </div>
              )}

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
