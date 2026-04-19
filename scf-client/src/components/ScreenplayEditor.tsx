import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Film, 
  ChevronDown, 
  ChevronRight, 
  Save, 
  History, 
  Plus, 
  FileText,
  Trash2,
  Check,
  User,
  MapPin,
  Package,
  List
} from 'lucide-react';
import { db } from '../db/Database';

// =============================================================================
// Constants & Regex
// =============================================================================

const SCENE_HEADING_RE = /^\.?(INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT|INT\.?\/EXT\.?|EXT\.?\/INT\.?|EST)[\.\s]+\s*(.+?)(?:\s*[-\.]\s*(DAY|NIGHT|MORNING|EARLY\s+MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|TWILIGHT|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS?\s+LATER|SAME\s+TIME))?$/i;
const CHARACTER_RE = /^[A-Z][A-Z\s0-9\(\)\-\.]+$/;
const PARENTHETICAL_RE = /^\s*\(.*\)\s*$/;
const TRANSITION_RE = /^[A-Z\s]+TO:\s*$/;

// =============================================================================
// Helper Functions
// =============================================================================

function classifyLine(text: string, prevType: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return 'blank';
  if (SCENE_HEADING_RE.test(trimmed)) return 'heading';
  if (TRANSITION_RE.test(trimmed)) return 'transition';
  
  // Character cue usually follows a blank line and is uppercase
  if (prevType === 'blank' && CHARACTER_RE.test(trimmed) && !trimmed.startsWith('(')) {
    return 'character';
  }
  
  // Parenthetical usually follows character or dialogue
  if ((prevType === 'character' || prevType === 'dialogue') && PARENTHETICAL_RE.test(trimmed)) {
    return 'parenthetical';
  }
  
  // Dialogue follows character or parenthetical
  if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
    // If it's not a heading or transition, and we are in a dialogue block, it's dialogue
    return 'dialogue';
  }

  return 'action';
}

// =============================================================================
// Sub-components
// =============================================================================

const Navigator: React.FC<{ 
  data: { scenes: any[], characters: any[], locations: any[], props: any[] },
  onJump: (lineIndex: number) => void
}> = ({ data, onJump }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    scenes: false,
    characters: true,
    locations: true,
    props: true
  });

  const toggle = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <aside className="panel-navigator">
      <div className="navigator-scroll">
        <div className={`nav-section ${collapsed.scenes ? 'collapsed' : ''}`}>
          <div className="nav-section-header" onClick={() => toggle('scenes')}>
            <span className="chevron">{collapsed.scenes ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
            <span>Scenes</span>
            <span className="nav-count-badge">{data.scenes.length}</span>
          </div>
          <div className="nav-section-items">
            {data.scenes.map((s, i) => (
              <div key={i} className="nav-item" onClick={() => onJump(s.line_order)}>
                <span className="nav-scene-num">{s.scene_number || i + 1}</span>
                <span className="nav-item-name">{s.heading}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`nav-section ${collapsed.characters ? 'collapsed' : ''}`}>
          <div className="nav-section-header" onClick={() => toggle('characters')}>
            <span className="chevron">{collapsed.characters ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
            <span>Characters</span>
            <span className="nav-count-badge">{data.characters.length}</span>
          </div>
          <div className="nav-section-items">
            {data.characters.map((c, i) => (
              <div key={i} className="nav-item">
                <span className="nav-item-icon"><User size={12} /></span>
                <span className="nav-item-name">{c.display_name}</span>
                <span className="nav-item-badge">{c.scene_count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`nav-section ${collapsed.locations ? 'collapsed' : ''}`}>
          <div className="nav-section-header" onClick={() => toggle('locations')}>
            <span className="chevron">{collapsed.locations ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
            <span>Locations</span>
            <span className="nav-count-badge">{data.locations.length}</span>
          </div>
          <div className="nav-section-items">
            {data.locations.map((l, i) => (
              <div key={i} className="nav-item">
                <span className="nav-item-icon"><MapPin size={12} /></span>
                <span className="nav-item-name">{l.name}</span>
                <span className="nav-item-badge">{l.scene_count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`nav-section ${collapsed.props ? 'collapsed' : ''}`}>
          <div className="nav-section-header" onClick={() => toggle('props')}>
            <span className="chevron">{collapsed.props ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
            <span>Props</span>
            <span className="nav-count-badge">{data.props.length}</span>
          </div>
          <div className="nav-section-items">
            {data.props.map((p, i) => (
              <div key={i} className="nav-item">
                <span className="nav-item-icon"><Package size={12} /></span>
                <span className="nav-item-name">{p.name}</span>
                <span className="nav-item-badge">{p.scene_count || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const ScreenplayEditor: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [titlePage, setTitlePage] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'script' | 'title' | 'versions'>('script');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [versions, setVersions] = useState<any[]>([]);
  const [navigatorData, setNavigatorData] = useState<any>({ scenes: [], characters: [], locations: [], props: [] });
  const [publishDesc, setPublishDesc] = useState('');
  const [showToast, setShowToast] = useState<string | null>(null);
  
  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acPos, setAcPos] = useState({ top: 0, left: 0 });
  const [acQuery, setAcQuery] = useState('');
  const [acItems, setAcItems] = useState<any[]>([]);
  const [acIndex, setAcIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Stats
  const stats = useMemo(() => {
    const lines = content.split('\n');
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const sceneCount = lines.filter(l => SCENE_HEADING_RE.test(l.trim())).length;
    return {
      lineCount: lines.length,
      wordCount,
      sceneCount,
      pageCount: Math.max(1, Math.ceil(lines.length / 55))
    };
  }, [content]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (acQuery.length > 0) {
      const allEntities = [
        ...navigatorData.characters.map((c: any) => ({ ...c, type: 'character', name: c.display_name })),
        ...navigatorData.locations.map((l: any) => ({ ...l, type: 'location', name: l.name })),
        ...navigatorData.props.map((p: any) => ({ ...p, type: 'prop', name: p.name }))
      ];
      const filtered = allEntities.filter(e => e.name.toLowerCase().includes(acQuery.toLowerCase())).slice(0, 10);
      setAcItems(filtered);
      setAcIndex(0);
      setAcOpen(filtered.length > 0);
    } else {
      setAcOpen(false);
    }
  }, [acQuery, navigatorData]);

  const loadData = async () => {
    const data = await db.loadScreenplay();
    const scriptContent = data.lines.map(l => l.content).join('\n');
    setContent(scriptContent);
    setTitlePage(data.title_page);
    
    const nav = await db.getNavigatorData();
    setNavigatorData(nav);

    const vers = await db.listVersions();
    setVersions(vers);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setSaveStatus('dirty');
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.target.scrollTop;
    }

    // Autocomplete trigger
    const cursor = e.target.selectionStart;
    const textBefore = newContent.substring(0, cursor);
    const lastWordMatch = textBefore.match(/(\w+)$/);
    if (lastWordMatch) {
      setAcQuery(lastWordMatch[1]);
      
      // Position calculation (approximate)
      const linesBefore = textBefore.split('\n');
      const currentLineIdx = linesBefore.length - 1;
      const charIdx = linesBefore[currentLineIdx].length;
      
      setAcPos({
        top: (currentLineIdx * 22.5) + 60 - e.target.scrollTop,
        left: (charIdx * 9) + 40 // Very rough estimate
      });
    } else {
      setAcQuery('');
    }
  };

  const handleAcSelect = (item: any) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBefore = content.substring(0, cursor);
    const textAfter = content.substring(cursor);
    const lastWordMatch = textBefore.match(/(\w+)$/);
    
    if (lastWordMatch) {
      const word = lastWordMatch[1];
      const newContent = textBefore.substring(0, textBefore.length - word.length) + item.name + textAfter;
      setContent(newContent);
      setAcOpen(false);
      setAcQuery('');
      
      // Set cursor position after inserted name
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = cursor - word.length + item.name.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (acOpen) setAcOpen(false);
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    const lines = content.split('\n').map((lineText, i) => {
      // Re-classify on save
      const prevType = i > 0 ? classifyLine(content.split('\n')[i-1], 'blank') : 'blank';
      return {
        line_order: i,
        content: lineText,
        line_type: classifyLine(lineText, prevType)
      };
    });
    
    await db.saveScreenplay(titlePage, lines);
    
    // Refresh navigator
    const nav = await db.getNavigatorData();
    setNavigatorData(nav);
    
    setSaveStatus('saved');
    triggerToast('Screenplay saved successfully');
  };

  const handlePublish = async () => {
    if (!publishDesc) return;
    try {
      await db.publishVersion(publishDesc);
      setPublishDesc('');
      const vers = await db.listVersions();
      setVersions(vers);
      triggerToast('Version published');
    } catch (e: any) {
      triggerToast(e.message);
    }
  };

  const handleRestore = async (id: number) => {
    if (confirm('Restore this version? Current changes will be lost.')) {
      await db.restoreVersion(id);
      await loadData();
      triggerToast('Version restored');
    }
  };

  const handleDeleteVersion = async (id: number) => {
    if (confirm('Delete this version?')) {
      await db.deleteVersion(id);
      const vers = await db.listVersions();
      setVersions(vers);
    }
  };

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (acOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcIndex(prev => (prev < acItems.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcIndex(prev => (prev > 0 ? prev - 1 : prev));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAcSelect(acItems[acIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setAcOpen(false);
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      // Tab cycling logic: Description -> Scene -> Character -> Dialogue -> Transition
      // In a simple textarea, this is hard because we need to know the current line
      const cursor = textareaRef.current?.selectionStart || 0;
      const textBefore = content.substring(0, cursor);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', cursor);
      const currentLine = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd);
      
      // Porting the cycle logic
      let newLine = currentLine.trim();
      if (currentLine.startsWith('INT.') || currentLine.startsWith('EXT.')) {
        // From Scene to Character (Uppercase)
        newLine = newLine.toUpperCase();
      } else if (CHARACTER_RE.test(newLine.toUpperCase()) && newLine === newLine.toUpperCase()) {
        // From Character to Transition (Uppercase + TO:)
        if (!newLine.endsWith('TO:')) newLine += ' TO:';
      } else {
        // Default to Scene
        if (!newLine.startsWith('INT.') && !newLine.startsWith('EXT.')) {
          newLine = 'INT. ' + newLine;
        } else {
           // If already INT. but we want to cycle back to description
           newLine = newLine.replace(/^(INT\.|EXT\.)\s*/i, '');
        }
      }

      const newContent = content.substring(0, lineStart) + newLine + content.substring(lineEnd === -1 ? content.length : lineEnd);
      setContent(newContent);
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const jumpToLine = (lineIndex: number) => {
    if (!textareaRef.current) return;
    const lines = content.split('\n');
    let pos = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(pos, pos);
    
    // Rough estimate of scroll position
    const scrollTop = (lineIndex * 22.5) - 100;
    textareaRef.current.scrollTop = scrollTop;
    if (highlightRef.current) highlightRef.current.scrollTop = scrollTop;
  };

  // Render highlighted lines
  const renderHighlighted = () => {
    const lines = content.split('\n');
    let lastType = 'blank';
    
    return lines.map((line, i) => {
      const type = classifyLine(line, lastType);
      lastType = type;
      
      let className = `cm-line cm-scf-${type}`;
      if (type === 'heading' && i > 0) className += ' cm-scf-gap-scene';
      if (type === 'character') className += ' cm-scf-gap-block';
      
      return (
        <div key={i} className={className}>
          {line || <br />}
        </div>
      );
    });
  };

  return (
    <div className="screenplay-layout">
      {activeTab === 'script' && <Navigator data={navigatorData} onJump={jumpToLine} />}
      
      <div className="panel-screenplay">
        <div className="entity-editor-tabs" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
          <button className={`tab-button ${activeTab === 'script' ? 'active' : ''}`} onClick={() => setActiveTab('script')}>
            <FileText size={14} /> Script
          </button>
          <button className={`tab-button ${activeTab === 'title' ? 'active' : ''}`} onClick={() => setActiveTab('title')}>
            <Plus size={14} /> Title Page
          </button>
          <button className={`tab-button ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>
            <History size={14} /> Versions
          </button>
          
          <div style={{ marginLeft: 'auto', paddingRight: '12px', display: 'flex', alignItems: 'center' }}>
            <button className={`btn btn-primary ${saveStatus === 'saved' ? 'btn-success' : ''}`} onClick={handleSave} disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        </div>

        <div className="editor-container" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>
          {activeTab === 'script' && (
            <>
              <div 
                ref={highlightRef}
                className="cm-editor" 
                style={{ 
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                  pointerEvents: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  overflowY: 'hidden', padding: '24px 0'
                }}
              >
                <div className="cm-content">
                  {renderHighlighted()}
                </div>
              </div>
              <textarea
                ref={textareaRef}
                className="screenplay-textarea"
                value={content}
                onChange={handleContentChange}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  width: '100%', height: '100%',
                  background: 'transparent', color: 'transparent',
                  caretColor: 'var(--accent)',
                  fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
                  fontSize: '15px', lineHeight: '1.5',
                  padding: '24px 20px',
                  border: 'none', outline: 'none',
                  resize: 'none',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  overflowY: 'auto',
                  margin: '0 auto',
                  maxWidth: '680px'
                }}
              />
              {acOpen && (
                <div 
                  className="screenplay-autocomplete" 
                  style={{ top: `${acPos.top}px`, left: `${acPos.left}px` }}
                >
                  {acItems.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`screenplay-ac-item ${idx === acIndex ? 'highlighted' : ''}`}
                      onClick={() => handleAcSelect(item)}
                    >
                      <span className="screenplay-ac-icon">
                        {item.type === 'character' ? <User size={12} /> : item.type === 'location' ? <MapPin size={12} /> : <Package size={12} />}
                      </span>
                      <span className="screenplay-ac-name">{item.name}</span>
                      <span className="screenplay-ac-meta">{item.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'title' && (
            <div className="title-page-editor" style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
              <h3>Title Page Metadata</h3>
              <div className="entity-form">
                {['Title', 'Author', 'Source', 'Draft', 'Contact'].map(key => {
                  const item = titlePage.find(tp => tp.key === key);
                  return (
                    <div key={key} className="field-group">
                      <label className="field-label">{key}</label>
                      <input 
                        className="field-input" 
                        value={item?.value || ''} 
                        onChange={(e) => {
                          const newTP = [...titlePage];
                          const idx = newTP.findIndex(tp => tp.key === key);
                          if (idx >= 0) newTP[idx].value = e.target.value;
                          else newTP.push({ key, value: e.target.value });
                          setTitlePage(newTP);
                          setSaveStatus('dirty');
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="version-drawer-body" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div className="version-publish-form">
                <input 
                  className="field-input" 
                  placeholder="Version description (e.g. First Draft, Polish...)" 
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handlePublish} disabled={!publishDesc}>
                  Publish Snapshot
                </button>
              </div>

              <div className="version-list">
                {versions.length === 0 && <div className="version-empty">No versions published yet.</div>}
                {versions.map(v => (
                  <div key={v.id} className="version-item">
                    <div className="version-item-header">
                      <span className="version-item-number">v{v.version_number}</span>
                      <span className="version-item-desc">{v.description}</span>
                      <span className="version-item-date">{new Date(v.published_at).toLocaleString()}</span>
                    </div>
                    <div className="version-item-stats">
                      <span className="version-item-stat"><List size={10} /> {v.line_count} lines</span>
                      <span className="version-item-stat"><Film size={10} /> {v.scene_count} scenes</span>
                      <span className="version-item-stat"><User size={10} /> {v.character_count} chars</span>
                    </div>
                    <div className="version-item-actions">
                      <button className="btn version-restore-btn" onClick={() => handleRestore(v.id)}>Restore</button>
                      <button className="btn version-delete-btn" onClick={() => handleDeleteVersion(v.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="screenplay-status-bar">
          <div className="status-item status-mode-item">
            {activeTab === 'script' ? 'SCREENPLAY' : activeTab === 'title' ? 'TITLE PAGE' : 'VERSIONS'}
          </div>
          <div className="status-divider"></div>
          <div className="status-item">Scene: {stats.sceneCount}</div>
          <div className="status-divider"></div>
          <div className="status-item">Pages: {stats.pageCount}</div>
          <div className="status-divider"></div>
          <div className="status-item">Words: {stats.wordCount}</div>
          <div className="status-divider"></div>
          <div className="status-item" style={{ color: saveStatus === 'dirty' ? 'var(--warning)' : 'var(--success)' }}>
            {saveStatus === 'dirty' ? 'Unsaved Changes' : 'All Saved'}
          </div>
        </div>
      </div>

      {showToast && <div className="toast">{showToast}</div>}
    </div>
  );
};

export default ScreenplayEditor;
