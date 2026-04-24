import React, { useState } from 'react';
import {
  ChevronDown, ChevronRight, Film, User, MapPin,
  FolderPlus, Trash2, Edit2, X,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface NavScene {
  id: number;
  scene_number: number | null;
  heading: string;
  line_order: number;
  characters: string[];
  props: string[];
}

export interface ActGroup {
  id?: number;
  act_name: string;
  act_order: number;
  scene_ids: number[];
}

interface Props {
  scenes: NavScene[];
  actGroups: ActGroup[];
  onJumpToScene: (lineOrder: number) => void;
  onActGroupsChange: (groups: ActGroup[]) => void;
  filterCharacter?: string | null;
  filterLocation?: string | null;
  onFilterCharacter: (name: string | null) => void;
  onFilterLocation: (name: string | null) => void;
}

// =============================================================================
// Component
// =============================================================================

export const ProductionNavigator: React.FC<Props> = ({
  scenes,
  actGroups,
  onJumpToScene,
  onActGroupsChange,
  filterCharacter,
  filterLocation,
  onFilterCharacter,
  onFilterLocation,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('ide_nav_collapsed') || '{}'); } catch { return {}; }
  });
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<number>>(new Set());
  const [editingActId, setEditingActId] = useState<number | null>(null);
  const [editingActName, setEditingActName] = useState('');
  const [activeTab, setActiveTab] = useState<'scenes' | 'characters' | 'locations'>(() => {
    return (localStorage.getItem('ide_nav_tab') as any) || 'scenes';
  });

  // Derive unique characters and locations from scene data
  const allCharacters = Array.from(
    new Map(scenes.flatMap(s => s.characters.map(c => [c, c]))).keys()
  ).sort();
  const allLocations = Array.from(
    new Set(scenes.map(s => {
      const m = s.heading.match(/(?:INT|EXT|I\/E)[.\s]+(.+?)(?:\s+-\s+|$)/i);
      return m ? m[1].trim() : null;
    }).filter(Boolean))
  ).sort() as string[];

  // Character scene-count map
  const charSceneCounts: Record<string, number> = {};
  for (const s of scenes) {
    for (const c of s.characters) {
      charSceneCounts[c] = (charSceneCounts[c] ?? 0) + 1;
    }
  }

  const toggleCollapsed = (key: string) =>
    setCollapsed(p => {
      const next = { ...p, [key]: !p[key] };
      localStorage.setItem('ide_nav_collapsed', JSON.stringify(next));
      return next;
    });

  const filteredScenes = scenes.filter(s => {
    if (filterCharacter && !s.characters.includes(filterCharacter)) return false;
    if (filterLocation) {
      const m = s.heading.match(/(?:INT|EXT|I\/E)[.\s]+(.+?)(?:\s+-\s+|$)/i);
      const loc = m ? m[1].trim() : '';
      if (loc !== filterLocation) return false;
    }
    return true;
  });

  // Build scene lookup for act rendering
  const sceneById = new Map(scenes.map(s => [s.id, s]));

  // Scenes not in any act group
  const groupedSceneIds = new Set(actGroups.flatMap(g => g.scene_ids));
  const ungroupedScenes = filteredScenes.filter(s => !groupedSceneIds.has(s.id));

  // =============================================================================
  // Act group actions
  // =============================================================================

  const createActGroup = () => {
    const newGroup: ActGroup = {
      act_name: `Act ${actGroups.length + 1}`,
      act_order: actGroups.length,
      scene_ids: [...selectedSceneIds],
    };
    onActGroupsChange([...actGroups, newGroup]);
    setSelectedSceneIds(new Set());
  };

  const disbandAct = (idx: number) => {
    const updated = actGroups.filter((_, i) => i !== idx)
      .map((g, i) => ({ ...g, act_order: i }));
    onActGroupsChange(updated);
  };

  const renameAct = (idx: number, name: string) => {
    const updated = actGroups.map((g, i) => i === idx ? { ...g, act_name: name } : g);
    onActGroupsChange(updated);
    setEditingActId(null);
  };

  const handleSceneClick = (s: NavScene, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedSceneIds(prev => {
        const next = new Set(prev);
        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
        return next;
      });
    } else {
      setSelectedSceneIds(new Set());
      onJumpToScene(s.line_order);
    }
  };

  // =============================================================================
  // Render helpers
  // =============================================================================

  const renderScene = (s: NavScene, inAct = false) => {
    const selected = selectedSceneIds.has(s.id);
    return (
      <div
        key={s.id}
        className={`nav-ide-scene ${selected ? 'selected' : ''} ${inAct ? 'in-act' : ''}`}
        onClick={e => handleSceneClick(s, e)}
        title={s.heading}
      >
        <span className="nav-ide-scene-num">{s.scene_number ?? '—'}</span>
        <span className="nav-ide-scene-heading">{s.heading}</span>
        {s.characters.length > 0 && (
          <div className="nav-ide-scene-entities">
            {s.characters.slice(0, 3).map(c => (
              <span key={c} className="nav-ide-chip nav-ide-chip-char">{c}</span>
            ))}
            {s.characters.length > 3 && (
              <span className="nav-ide-chip nav-ide-chip-more">+{s.characters.length - 3}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderActGroup = (g: ActGroup, idx: number) => {
    const key = `act-${idx}`;
    const isCollapsed = collapsed[key];
    const actScenes = g.scene_ids
      .map(id => sceneById.get(id))
      .filter(Boolean)
      .filter(s => filteredScenes.some(fs => fs.id === s!.id)) as NavScene[];

    return (
      <div key={idx} className="nav-ide-act">
        <div className="nav-ide-act-header" onClick={() => toggleCollapsed(key)}>
          <span className="nav-ide-act-chevron">
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>

          {editingActId === idx ? (
            <input
              className="nav-ide-act-name-input"
              value={editingActName}
              autoFocus
              onChange={e => setEditingActName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') renameAct(idx, editingActName);
                if (e.key === 'Escape') setEditingActId(null);
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="nav-ide-act-name">{g.act_name}</span>
          )}

          <span className="nav-ide-act-count">{actScenes.length} scenes</span>

          <div className="nav-ide-act-actions">
            <button
              className="nav-ide-icon-btn"
              title="Rename act"
              onClick={e => {
                e.stopPropagation();
                setEditingActId(idx);
                setEditingActName(g.act_name);
              }}
            >
              <Edit2 size={11} />
            </button>
            <button
              className="nav-ide-icon-btn nav-ide-icon-btn-danger"
              title="Disband act"
              onClick={e => { e.stopPropagation(); disbandAct(idx); }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="nav-ide-act-scenes">
            {actScenes.map(s => renderScene(s, true))}
            {actScenes.length === 0 && (
              <div className="nav-ide-empty-act">No scenes in this act</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <aside className="nav-ide-panel">
      {/* Tab bar */}
      <div className="nav-ide-tabs">
        {(['scenes', 'characters', 'locations'] as const).map(tab => (
          <button
            key={tab}
            className={`nav-ide-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); localStorage.setItem('ide_nav_tab', tab); }}
          >
            {tab === 'scenes' && <Film size={12} />}
            {tab === 'characters' && <User size={12} />}
            {tab === 'locations' && <MapPin size={12} />}
            <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </button>
        ))}
      </div>

      <div className="nav-ide-scroll">

        {/* ── SCENES TAB ── */}
        {activeTab === 'scenes' && (
          <>
            {selectedSceneIds.size > 0 && (
              <div className="nav-ide-selection-bar">
                <span>{selectedSceneIds.size} selected</span>
                <button className="btn btn-xs" onClick={createActGroup}>
                  <FolderPlus size={11} /> Group into Act
                </button>
                <button className="nav-ide-icon-btn" onClick={() => setSelectedSceneIds(new Set())}>
                  <X size={11} />
                </button>
              </div>
            )}

            {actGroups.map((g, i) => renderActGroup(g, i))}

            {ungroupedScenes.length > 0 && (
              <div className="nav-ide-ungrouped">
                {actGroups.length > 0 && (
                  <div className="nav-ide-ungrouped-label">Ungrouped</div>
                )}
                {ungroupedScenes.map(s => renderScene(s))}
              </div>
            )}

            {filteredScenes.length === 0 && (
              <div className="nav-ide-empty">No scenes yet</div>
            )}
          </>
        )}

        {/* ── CHARACTERS TAB ── */}
        {activeTab === 'characters' && (
          <div className="nav-ide-list">
            {(filterCharacter || filterLocation) && (
              <div className="nav-ide-filter-bar">
                <span>Filtered</span>
                <button className="nav-ide-icon-btn" onClick={() => { onFilterCharacter(null); onFilterLocation(null); }}>
                  <X size={11} /> Clear
                </button>
              </div>
            )}
            {allCharacters.map(c => (
              <div
                key={c}
                className={`nav-ide-entity-row ${filterCharacter === c ? 'active-filter' : ''}`}
                onClick={() => onFilterCharacter(filterCharacter === c ? null : c)}
              >
                <User size={12} className="nav-ide-entity-icon char-icon" />
                <span className="nav-ide-entity-name">{c}</span>
                <span className="nav-ide-entity-badge">{charSceneCounts[c] ?? 0}</span>
              </div>
            ))}
            {allCharacters.length === 0 && <div className="nav-ide-empty">No characters</div>}
          </div>
        )}

        {/* ── LOCATIONS TAB ── */}
        {activeTab === 'locations' && (
          <div className="nav-ide-list">
            {allLocations.map(loc => (
              <div
                key={loc}
                className={`nav-ide-entity-row ${filterLocation === loc ? 'active-filter' : ''}`}
                onClick={() => onFilterLocation(filterLocation === loc ? null : loc)}
              >
                <MapPin size={12} className="nav-ide-entity-icon loc-icon" />
                <span className="nav-ide-entity-name">{loc}</span>
              </div>
            ))}
            {allLocations.length === 0 && <div className="nav-ide-empty">No locations</div>}
          </div>
        )}

      </div>
    </aside>
  );
};

export default ProductionNavigator;
