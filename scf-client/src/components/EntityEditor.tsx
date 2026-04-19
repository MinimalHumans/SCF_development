import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Trash2, Image as ImageIcon, Plus, X, Film } from 'lucide-react';
import { db } from '../db/Database';
import schemaData from '../db/schema.json';
import RelationshipPanel from './RelationshipPanel';

const schema = schemaData as Record<string, any>;

interface Field {
  name: string;
  label: string;
  field_type: string;
  required: boolean;
  default: any;
  placeholder: string;
  options: string[] | null;
  reference_entity: string | null;
  tab: string;
  help_text: string;
  hidden: boolean;
}

interface EntityImage {
  id: number;
  filename: string;
  relative_path: string;
  description: string;
}

const EntityEditor: React.FC<{ entityType?: string; entityId?: string }> = ({ entityType: propType, entityId: propId }) => {
  const params = useParams<{ type: string; id: string }>();
  const type = propType || params.type;
  const id = propId || params.id;
  const navigate = useNavigate();
  
  const [entity, setEntity] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem(`scf_tab_${type}`) || 'General';
  });
  const [references, setReferences] = useState<Record<string, any[]>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [images, setImages] = useState<EntityImage[]>([]);
  const [appearsIn, setAppearsIn] = useState<any[]>([]);

  useEffect(() => {
    localStorage.setItem(`scf_tab_${type}`, activeTab);
  }, [activeTab, type]);

  const loadEntity = async () => {
    if (!type || !id) return;
    setLoading(true);
    try {
      const data = await db.getEntityById(type, parseInt(id));
      setEntity(data);
      
      // Load references
      const fields = schema[type].fields as Field[];
      const refFields = fields.filter(f => f.field_type === 'reference' && f.reference_entity);
      const newRefs: Record<string, any[]> = {};
      for (const f of refFields) {
        if (f.reference_entity) {
          const rows = await db.listEntities(f.reference_entity);
          newRefs[f.reference_entity] = rows;
        }
      }
      setReferences(newRefs);

      // Load images
      if (['character', 'location', 'prop'].includes(type)) {
        const imgRows = await db.getRows(`SELECT * FROM entity_images WHERE entity_type = ? AND entity_id = ? ORDER BY sort_order ASC`, [type, parseInt(id)]);
        setImages(imgRows);
      }

      // Load Reverse Links (Appears In)
      if (['character', 'location', 'prop'].includes(type)) {
        let sql = '';
        if (type === 'character') {
          sql = `SELECT s.* FROM scene s JOIN scene_character sc ON s.id = sc.scene_id WHERE sc.character_id = ? ORDER BY s.scene_number ASC`;
        } else if (type === 'prop') {
          sql = `SELECT s.* FROM scene s JOIN scene_prop sp ON s.id = sp.scene_id WHERE sp.prop_id = ? ORDER BY s.scene_number ASC`;
        } else if (type === 'location') {
          sql = `SELECT * FROM scene WHERE location_id = ? ORDER BY scene_number ASC`;
        }
        if (sql) {
          const scenes = await db.getRows(sql, [parseInt(id)]);
          setAppearsIn(scenes);
        }
      }
    } catch (e) {
      console.error("Error loading entity:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntity();
  }, [type, id]);

  const handleFieldChange = (name: string, value: any) => {
    setEntity(prev => prev ? { ...prev, [name]: value } : null);
  };

  const handleSave = async () => {
    if (!entity || !type || !id) return;
    setSaving(true);
    try {
      const { id: _, created_at, updated_at, ...dataToSave } = entity;
      await db.updateEntity(type, parseInt(id), dataToSave);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Error saving entity:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!type || !id || !confirm('Are you sure you want to delete this entity?')) return;
    await db.deleteEntity(type, parseInt(id));
    navigate('/browse');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      await db.exec(`INSERT INTO entity_images (entity_type, entity_id, filename, relative_path) VALUES (?, ?, ?, ?)`, 
        [type, parseInt(id), file.name, base64]);
      loadEntity();
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteImage = async (imgId: number) => {
    if (!confirm('Delete this image?')) return;
    await db.exec(`DELETE FROM entity_images WHERE id = ?`, [imgId]);
    loadEntity();
  };

  const updateImageDescription = async (imgId: number, desc: string) => {
    await db.exec(`UPDATE entity_images SET description = ? WHERE id = ?`, [desc, imgId]);
  };

  if (!type || !schema[type]) return <div className="p-4">Invalid entity type</div>;
  if (loading) return <div className="editor-empty">Loading entity...</div>;
  if (!entity) return <div className="editor-empty">Entity not found</div>;

  const fields = schema[type].fields as Field[];
  const tabs = Array.from(new Set(fields.map(f => f.tab || 'General')));
  if (['scene', 'character', 'location', 'prop'].includes(type)) {
    tabs.push('Relationships');
    tabs.push('Images');
  }

  const renderField = (field: Field) => {
    if (field.hidden) return null;
    const value = entity[field.name] ?? '';
    switch (field.field_type) {
      case 'textarea': return <textarea value={value} placeholder={field.placeholder} onChange={(e) => handleFieldChange(field.name, e.target.value)} />;
      case 'select': return (
        <select value={value} onChange={(e) => handleFieldChange(field.name, e.target.value)}>
          <option value="">-- Select --</option>
          {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
      case 'reference': return (
        <select value={value} onChange={(e) => handleFieldChange(field.name, e.target.value ? parseInt(e.target.value) : null)}>
          <option value="">-- Select {field.reference_entity} --</option>
          {(references[field.reference_entity!] || []).map(ref => <option key={ref.id} value={ref.id}>{ref.name}</option>)}
        </select>
      );
      case 'boolean': return (
        <div className="field-checkbox">
          <input type="checkbox" id={field.name} checked={!!value} onChange={(e) => handleFieldChange(field.name, e.target.checked)} />
          <label htmlFor={field.name}>{field.label}</label>
        </div>
      );
      case 'integer': case 'float': return <input type="number" value={value} placeholder={field.placeholder} onChange={(e) => handleFieldChange(field.name, field.field_type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />;
      case 'json': return <textarea className="mono" style={{ fontSize: '11px' }} value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)} placeholder={field.placeholder} onChange={(e) => handleFieldChange(field.name, e.target.value)} />;
      default: return <input type="text" value={value} placeholder={field.placeholder} onChange={(e) => handleFieldChange(field.name, e.target.value)} />;
    }
  };

  return (
    <div className="entity-editor">
      <header className="entity-header">
        <div className="icon">{schema[type].icon}</div>
        <div className="entity-header-info">
          <div className="type-label">{schema[type].label}</div>
          <h1 className="entity-name">{entity.name}</h1>
          <div className="entity-meta">ID: {id} • Updated: {new Date(entity.updated_at || entity.created_at).toLocaleString()}</div>
        </div>
        <div className="entity-actions">
          <button className="btn btn-danger" title="Delete" onClick={handleDelete}><Trash2 size={16} /></button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={16} /><span>{saving ? 'Saving...' : 'Save Changes'}</span></button>
        </div>
      </header>

      <div className="tab-bar">
        {tabs.map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>

      <div className="tab-content active">
        {activeTab === 'Relationships' ? (
          <RelationshipPanel entityType={type} entityId={parseInt(id!)} />
        ) : activeTab === 'Images' ? (
          <div className="images-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="link-panel-header" style={{ margin: 0 }}>Reference Images</h3>
                <label className="btn btn-primary" style={{ cursor: 'pointer', fontSize: '12px', padding: '6px 12px' }}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Upload Image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                </label>
            </div>
            
            {images.length === 0 ? (
                <div className="query-empty">
                    <ImageIcon size={48} style={{ opacity: 0.1, marginBottom: '12px' }} />
                    <p>No reference images uploaded for this {type}.</p>
                </div>
            ) : (
                <div className="image-grid">
                    {images.map(img => (
                        <div key={img.id} className="image-card">
                            <div className="image-preview">
                                <img src={img.relative_path} alt={img.filename} />
                                <button className="image-delete" onClick={() => handleDeleteImage(img.id)}><X size={14} /></button>
                            </div>
                            <div className="image-info">
                                <input 
                                    type="text" 
                                    placeholder="Add description..." 
                                    defaultValue={img.description} 
                                    onBlur={(e) => updateImageDescription(img.id, e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        ) : (
          <>
            <div className="fields-grid">
              {fields.filter(f => f.tab === activeTab || (!f.tab && activeTab === 'General')).map(field => (
                <div key={field.name} className={`field-group ${field.field_type === 'textarea' || field.field_type === 'json' ? 'field-full' : ''}`}>
                  <label className="field-label">{field.label}{field.required && <span className="required">*</span>}</label>
                  {renderField(field)}
                  {field.help_text && <p className="field-help">{field.help_text}</p>}
                </div>
              ))}
            </div>
            
            {activeTab === 'General' && appearsIn.length > 0 && (
                <div className="reverse-links" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                    <h3 className="link-panel-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Film size={16} /> Appears In
                    </h3>
                    <div className="scene-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px', marginTop: '12px' }}>
                        {appearsIn.map(scene => (
                            <Link key={scene.id} to={`/browse/scene/${scene.id}`} className="scene-link-card" style={{ 
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-surface)', 
                                border: '1px solid var(--border)', borderRadius: 'var(--radius)', textDecoration: 'none', color: 'inherit'
                            }}>
                                <div style={{ background: 'var(--accent-subtle)', color: 'var(--text-accent)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                                    {scene.scene_number || '?'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{scene.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{scene.int_ext} {scene.time_of_day}</div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
          </>
        )}
      </div>

      <div className="save-bar">
          <span className={`save-indicator ${saveSuccess ? 'show' : ''}`}>Changes saved successfully</span>
      </div>
    </div>
  );
};

export default EntityEditor;
