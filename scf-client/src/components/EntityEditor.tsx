import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Trash2, Image as ImageIcon } from 'lucide-react';
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

interface EntityEditorProps {
  entityType?: string;
  entityId?: string;
}

const EntityEditor: React.FC<EntityEditorProps> = ({ entityType: propType, entityId: propId }) => {
  const params = useParams<{ type: string; id: string }>();
  const type = propType || params.type;
  const id = propId || params.id;
  const navigate = useNavigate();
  const [entity, setEntity] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('General');
  const [references, setReferences] = useState<Record<string, any[]>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
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
      } catch (e) {
        console.error("Error loading entity:", e);
      } finally {
        setLoading(false);
      }
    };

    loadEntity();
  }, [type, id]);

  if (!type || !schema[type]) return <div className="p-4">Invalid entity type</div>;

  const fields = schema[type].fields as Field[];
  const tabs = Array.from(new Set(fields.map(f => f.tab || 'General')));
  if (['scene', 'character', 'location', 'prop'].includes(type)) {
    tabs.push('Relationships');
    tabs.push('Images');
  }

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
      alert('Error saving entity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!type || !id || !confirm('Are you sure you want to delete this entity?')) return;
    try {
      await db.deleteEntity(type, parseInt(id));
      navigate('/browse');
    } catch (e) {
      console.error("Error deleting entity:", e);
    }
  };

  if (loading) return <div className="editor-empty">Loading entity...</div>;
  if (!entity) return <div className="editor-empty">Entity not found</div>;

  const renderField = (field: Field) => {
    if (field.hidden) return null;

    const value = entity[field.name] ?? '';

    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          />
        );
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          >
            <option value="">-- Select --</option>
            {field.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'reference':
        const refList = references[field.reference_entity!] || [];
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">-- Select {field.reference_entity} --</option>
            {refList.map(ref => (
              <option key={ref.id} value={ref.id}>{ref.name}</option>
            ))}
          </select>
        );
      case 'boolean':
        return (
          <div className="field-checkbox">
            <input
              type="checkbox"
              id={field.name}
              checked={!!value}
              onChange={(e) => handleFieldChange(field.name, e.target.checked)}
            />
            <label htmlFor={field.name} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {field.label}
            </label>
          </div>
        );
      case 'integer':
      case 'float':
        return (
          <input
            type="number"
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.name, field.field_type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
          />
        );
      case 'json':
        return (
          <textarea
            className="mono"
            style={{ fontSize: '11px' }}
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          />
        );
    }
  };

  return (
    <div className="entity-editor">
      <header className="entity-header">
        <div className="icon">{schema[type].icon}</div>
        <div className="entity-header-info">
          <div className="type-label">{schema[type].label}</div>
          <h1 className="entity-name">{entity.name}</h1>
          <div className="entity-meta">ID: {id} • Created: {new Date(entity.created_at).toLocaleDateString()}</div>
        </div>
        <div className="entity-actions">
          <button className="btn btn-danger" title="Delete Entity" onClick={handleDelete}>
            <Trash2 size={16} />
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </header>

      <div className="tab-bar">
        {tabs.map(tab => (
          <button 
            key={tab} 
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="tab-content active">
        {activeTab === 'Relationships' ? (
          <RelationshipPanel entityType={type} entityId={parseInt(id!)} />
        ) : activeTab === 'Images' ? (
          <div className="images-panel">
            <h3 className="link-panel-header">Entity Images</h3>
            <div className="query-empty">
                <ImageIcon size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
                <p>Image management coming soon.</p>
            </div>
          </div>
        ) : (
          <div className="fields-grid">
            {fields.filter(f => f.tab === activeTab || (!f.tab && activeTab === 'General')).map(field => (
              <div key={field.name} className={`field-group ${field.field_type === 'textarea' || field.field_type === 'json' ? 'field-full' : ''}`}>
                <label className="field-label">
                  {field.label}
                  {field.required && <span className="required">*</span>}
                </label>
                {renderField(field)}
                {field.help_text && <p className="field-help">{field.help_text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="save-bar">
          <span className={`save-indicator ${saveSuccess ? 'show' : ''}`}>
            Changes saved successfully
          </span>
      </div>
    </div>
  );
};

export default EntityEditor;
