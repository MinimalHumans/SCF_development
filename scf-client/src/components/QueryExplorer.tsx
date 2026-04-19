import React, { useState, useEffect } from 'react';
import { 
  Users, 
  MapPin, 
  Film, 
  Layers, 
  BarChart3, 
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import * as Queries from '../db/Queries';
import { db } from '../db/Database';

type QueryType = 'journey' | 'breakdown' | 'context' | 'crossover' | 'stats';

const QueryExplorer: React.FC = () => {
  const [activeQuery, setActiveQuery] = useState<QueryType>('journey');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Inputs
  const [characterId, setCharacterId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [sceneId, setSceneId] = useState<number | ''>('');
  const [char1Id, setChar1Id] = useState<number | ''>('');
  const [char2Id, setChar2Id] = useState<number | ''>('');

  // Dropdown lists
  const [characters, setCharacters] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [scenes, setScenes] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      await db.waitReady();
      const [chars, locs, scns] = await Promise.all([
        db.getRows('SELECT id, name FROM character ORDER BY name'),
        db.getRows('SELECT id, name FROM location ORDER BY name'),
        db.getRows('SELECT id, name, scene_number FROM scene ORDER BY scene_number, id')
      ]);
      setCharacters(chars);
      setLocations(locs);
      setScenes(scns);
    };
    fetchData();
  }, []);

  const runQuery = async () => {
    setLoading(true);
    setResults(null);
    try {
      let data;
      switch (activeQuery) {
        case 'journey':
          if (characterId) data = await Queries.characterJourney(Number(characterId));
          break;
        case 'breakdown':
          if (locationId) data = await Queries.locationBreakdown(Number(locationId));
          break;
        case 'context':
          if (sceneId) data = await Queries.sceneContext(Number(sceneId));
          break;
        case 'crossover':
          if (char1Id && char2Id) data = await Queries.characterCrossover(Number(char1Id), Number(char2Id));
          break;
        case 'stats':
          data = await Queries.projectStats();
          break;
      }
      setResults(data);
    } catch (err) {
      console.error("Query failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeQuery === 'stats') {
      runQuery();
    } else {
      setResults(null);
    }
  }, [activeQuery]);

  const renderStats = (stats: any) => (
    <div className="stats-results">
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-label">Total Scenes</div>
          <div className="stats-value">{stats.scene_count}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Characters</div>
          <div className="stats-value">{stats.character_count}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Locations</div>
          <div className="stats-value">{stats.location_count}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Props</div>
          <div className="stats-value">{stats.prop_count}</div>
        </div>
      </div>

      <div className="stats-sections">
        <div className="stats-section">
          <h3>Top Characters (Scene Appearance)</h3>
          <div className="stats-list">
            {stats.top_characters.map((c: any) => (
              <div key={c.id} className="stats-list-item">
                <span>{c.name}</span>
                <span className="badge">{c.scene_count} scenes</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="stats-section">
          <h3>Top Locations</h3>
          <div className="stats-list">
            {stats.top_locations.map((l: any) => (
              <div key={l.id} className="stats-list-item">
                <span>{l.name}</span>
                <span className="badge">{l.scene_count} scenes</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stats-section warning">
          <h3>Coverage Gaps: Scenes without Characters</h3>
          <div className="stats-list">
            {stats.scenes_without_characters.length > 0 ? (
              stats.scenes_without_characters.map((s: any) => (
                <Link key={s.id} to={`/browse/scene/${s.id}`} className="stats-list-item clickable">
                  <span>Scene {s.scene_number}: {s.name}</span>
                  <AlertCircle size={14} color="var(--accent-red)" />
                </Link>
              ))
            ) : (
              <div className="stats-empty">No coverage gaps found.</div>
            )}
          </div>
        </div>

        <div className="stats-section warning">
          <h3>Unused Characters</h3>
          <div className="stats-list">
            {stats.characters_without_scenes.length > 0 ? (
              stats.characters_without_scenes.map((c: any) => (
                <Link key={c.id} to={`/browse/character/${c.id}`} className="stats-list-item clickable">
                  <span>{c.name} ({c.role})</span>
                  <AlertCircle size={14} color="var(--accent-red)" />
                </Link>
              ))
            ) : (
              <div className="stats-empty">All characters are used.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderJourney = (data: any[]) => (
    <div className="query-table-container">
      <table className="query-table">
        <thead>
          <tr>
            <th>Scene #</th>
            <th>Scene Name</th>
            <th>Location</th>
            <th>Role in Scene</th>
            <th>Others Present</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.scene_id}>
              <td>{row.scene_number}</td>
              <td>{row.scene_name}</td>
              <td>{row.location_name}</td>
              <td><span className={`badge badge-${row.role_in_scene?.toLowerCase()}`}>{row.role_in_scene}</span></td>
              <td>
                <div className="tag-cloud">
                  {row.other_characters.map((oc: any, i: number) => (
                    <span key={i} className="mini-tag">{oc.character_name}</span>
                  ))}
                </div>
              </td>
              <td>
                <Link to={`/browse/scene/${row.scene_id}`} className="icon-link">
                  <ExternalLink size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderBreakdown = (data: any[]) => (
    <div className="query-table-container">
      <table className="query-table">
        <thead>
          <tr>
            <th>Scene #</th>
            <th>Scene Name</th>
            <th>Time of Day</th>
            <th>Characters</th>
            <th>Props</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.scene_id}>
              <td>{row.scene_number}</td>
              <td>{row.scene_name}</td>
              <td>{row.time_of_day}</td>
              <td>
                <div className="tag-cloud">
                  {row.characters.map((c: any, i: number) => (
                    <span key={i} className="mini-tag">{c.character_name}</span>
                  ))}
                </div>
              </td>
              <td>
                <div className="tag-cloud">
                  {row.props.map((p: any, i: number) => (
                    <span key={i} className="mini-tag prop">{p.prop_name}</span>
                  ))}
                </div>
              </td>
              <td>
                <Link to={`/browse/scene/${row.scene_id}`} className="icon-link">
                  <ExternalLink size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCrossover = (data: any[]) => (
    <div className="query-table-container">
      <table className="query-table">
        <thead>
          <tr>
            <th>Scene #</th>
            <th>Scene Name</th>
            <th>Location</th>
            <th>Char 1 Role</th>
            <th>Char 2 Role</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.scene_id}>
              <td>{row.scene_number}</td>
              <td>{row.scene_name}</td>
              <td>{row.location_name}</td>
              <td><span className="badge">{row.char1_role}</span></td>
              <td><span className="badge">{row.char2_role}</span></td>
              <td>
                <Link to={`/browse/scene/${row.scene_id}`} className="icon-link">
                  <ExternalLink size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderContext = (scene: any) => (
    <div className="scene-context-results">
      <div className="context-header">
        <div className="context-title">
          <h2>Scene {scene.scene_number}: {scene.name}</h2>
          <span className="badge">{scene.time_of_day}</span>
        </div>
        <div className="context-location">
          <MapPin size={16} />
          <span>{scene.location?.name || 'Unknown Location'}</span>
        </div>
      </div>

      <div className="context-grid">
        <div className="context-block">
          <h3>Summary</h3>
          <p className="context-text">{scene.summary || 'No summary available.'}</p>
          
          <h3 style={{ marginTop: '20px' }}>Emotional Beat</h3>
          <p className="context-text italic">{scene.emotional_beat || 'Not specified.'}</p>
        </div>

        <div className="context-block">
          <h3>Characters</h3>
          <div className="context-list">
            {scene.characters.map((c: any) => (
              <div key={c.id} className="context-list-item">
                <strong>{c.name}</strong>
                <span className="badge">{c.role_in_scene}</span>
                {c.link_notes && <div className="sub-note">{c.link_notes}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="context-block">
          <h3>Props</h3>
          <div className="context-list">
            {scene.props.length > 0 ? (
              scene.props.map((p: any) => (
                <div key={p.id} className="context-list-item">
                  <strong>{p.name}</strong>
                  <span className="badge prop">{p.usage_note}</span>
                  {p.significance && <div className="sub-note">{p.significance}</div>}
                </div>
              ))
            ) : (
              <div className="stats-empty">No props linked.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="query-explorer">
      <div className="query-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">Select Query</label>
          <div className="query-nav">
            <button 
              className={`query-nav-item ${activeQuery === 'journey' ? 'active' : ''}`}
              onClick={() => setActiveQuery('journey')}
            >
              <Users size={18} />
              <span>Character Journey</span>
            </button>
            <button 
              className={`query-nav-item ${activeQuery === 'breakdown' ? 'active' : ''}`}
              onClick={() => setActiveQuery('breakdown')}
            >
              <MapPin size={18} />
              <span>Location Breakdown</span>
            </button>
            <button 
              className={`query-nav-item ${activeQuery === 'context' ? 'active' : ''}`}
              onClick={() => setActiveQuery('context')}
            >
              <Film size={18} />
              <span>Scene Context</span>
            </button>
            <button 
              className={`query-nav-item ${activeQuery === 'crossover' ? 'active' : ''}`}
              onClick={() => setActiveQuery('crossover')}
            >
              <Layers size={18} />
              <span>Character Crossover</span>
            </button>
            <button 
              className={`query-nav-item ${activeQuery === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveQuery('stats')}
            >
              <BarChart3 size={18} />
              <span>Project Stats</span>
            </button>
          </div>
        </div>

        <div className="sidebar-section inputs">
          <label className="sidebar-label">Query Inputs</label>
          
          {activeQuery === 'journey' && (
            <div className="input-group">
              <label>Character</label>
              <select value={characterId} onChange={e => setCharacterId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Select Character...</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {activeQuery === 'breakdown' && (
            <div className="input-group">
              <label>Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Select Location...</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}

          {activeQuery === 'context' && (
            <div className="input-group">
              <label>Scene</label>
              <select value={sceneId} onChange={e => setSceneId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Select Scene...</option>
                {scenes.map(s => <option key={s.id} value={s.id}>Scene {s.scene_number}: {s.name}</option>)}
              </select>
            </div>
          )}

          {activeQuery === 'crossover' && (
            <>
              <div className="input-group">
                <label>First Character</label>
                <select value={char1Id} onChange={e => setChar1Id(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Select...</option>
                  {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Second Character</label>
                <select value={char2Id} onChange={e => setChar2Id(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Select...</option>
                  {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </>
          )}

          {activeQuery !== 'stats' && (
            <button 
              className="btn btn-primary" 
              onClick={runQuery}
              disabled={loading || 
                (activeQuery === 'journey' && !characterId) ||
                (activeQuery === 'breakdown' && !locationId) ||
                (activeQuery === 'context' && !sceneId) ||
                (activeQuery === 'crossover' && (!char1Id || !char2Id))
              }
              style={{ width: '100%', marginTop: '12px' }}
            >
              {loading ? 'Running...' : 'Run Query'}
            </button>
          )}
        </div>
      </div>

      <div className="query-results-area">
        {loading ? (
          <div className="results-empty">
            <div className="spinner"></div>
            <p>Analyzing project data...</p>
          </div>
        ) : !results ? (
          <div className="results-empty">
            <BarChart3 size={48} opacity={0.2} />
            <p>Select query parameters and click "Run Query" to see results.</p>
          </div>
        ) : (
          <div className="results-content">
            {activeQuery === 'journey' && renderJourney(results)}
            {activeQuery === 'breakdown' && renderBreakdown(results)}
            {activeQuery === 'context' && renderContext(results)}
            {activeQuery === 'crossover' && renderCrossover(results)}
            {activeQuery === 'stats' && renderStats(results)}
          </div>
        )}
      </div>
    </div>
  );
};

export default QueryExplorer;
