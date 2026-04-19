import React, { useState, useEffect } from 'react';
import { Trash2, Link as LinkIcon } from 'lucide-react';
import { db } from '../db/Database';
import schemaData from '../db/schema.json';

const schema = schemaData as Record<string, any>;

interface RelationshipPanelProps {
  entityType: string;
  entityId: number;
}

interface Link {
  id: number;
  [key: string]: any;
  target_name?: string;
}

const RelationshipPanel: React.FC<RelationshipPanelProps> = ({ entityType, entityId }) => {
  const [links, setLinks] = useState<Record<string, Link[]>>({});
  const [availableEntities, setAvailableEntities] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  const junctionTables = [
    { table: 'scene_character', left: 'scene_id', right: 'character_id', rightType: 'character' },
    { table: 'scene_prop', left: 'scene_id', right: 'prop_id', rightType: 'prop' }
  ];

  const fetchLinks = async () => {
    setLoading(true);
    const newLinks: Record<string, Link[]> = {};
    const newAvailable: Record<string, any[]> = {};

    for (const j of junctionTables) {
      let filterField = '';
      let targetField = '';
      let targetType = '';

      if (entityType === 'scene' && j.left === 'scene_id') {
        filterField = j.left;
        targetField = j.right;
        targetType = j.rightType;
      } else if (entityType === j.rightType) {
        filterField = j.right;
        targetField = j.left;
        targetType = 'scene';
      } else {
        continue;
      }

      try {
        // Fetch existing links
        const sql = `
          SELECT j.*, t.name as target_name 
          FROM ${j.table} j
          JOIN ${targetType} t ON j.${targetField} = t.id
          WHERE j.${filterField} = ?
        `;
        const rows = await db.getRows(sql, [entityId]);
        newLinks[j.table] = rows;

        // Fetch available entities to link
        const allTargets = await db.listEntities(targetType);
        newAvailable[targetType] = allTargets.filter(t => !rows.find(r => r[targetField] === t.id));
      } catch (e) {
        console.error(`Error fetching links for ${j.table}:`, e);
      }
    }

    setLinks(newLinks);
    setAvailableEntities(newAvailable);
    setLoading(false);
  };

  useEffect(() => {
    fetchLinks();
  }, [entityType, entityId]);

  const handleAddLink = async (table: string, _targetType: string, targetId: number) => {
    const j = junctionTables.find(jt => jt.table === table);
    if (!j) return;

    const data: Record<string, any> = {};
    if (entityType === 'scene') {
      data[j.left] = entityId;
      data[j.right] = targetId;
    } else {
      data[j.right] = entityId;
      data[j.left] = targetId;
    }

    try {
      await db.createEntity(table, data);
      await fetchLinks();
    } catch (e) {
      console.error("Error adding link:", e);
    }
  };

  const handleCreateNew = async (targetType: string, table: string) => {
    const name = prompt(`Enter name for new ${schema[targetType].label}:`);
    if (!name) return;

    try {
      const nameField = schema[targetType].name_field || 'name';
      const newId = await db.createEntity(targetType, { [nameField]: name });
      await handleAddLink(table, targetType, newId);
    } catch (e) {
      console.error("Error creating new entity inline:", e);
    }
  };

  const handleRemoveLink = async (table: string, linkId: number) => {
    try {
      await db.deleteEntity(table, linkId);
      await fetchLinks();
    } catch (e) {
      console.error("Error removing link:", e);
    }
  };

  if (loading) return <div className="p-4 text-muted">Loading relationships...</div>;

  return (
    <div className="link-panel">
      {Object.keys(links).length === 0 && <p className="text-muted italic">No applicable relationships for this entity type.</p>}
      
      {Object.entries(links).map(([table, tableLinks]) => {
        const j = junctionTables.find(jt => jt.table === table)!;
        const targetType = entityType === 'scene' ? j.rightType : 'scene';
        const available = availableEntities[targetType] || [];

        return (
          <div key={table} className="relationship-group mb-6">
            <h3 className="link-panel-header flex items-center">
              <LinkIcon size={14} className="mr-2" />
              {schema[table].label_plural}
            </h3>
            
            <div className="link-chips mb-4">
              {tableLinks.length === 0 ? (
                <p className="text-sm text-muted italic">No links yet.</p>
              ) : (
                <>
                  {tableLinks.map(link => (
                    <div key={link.id} className="link-chip">
                      <span className="link-chip-name">{link.target_name}</span>
                      <button 
                        className="link-chip-remove"
                        onClick={() => handleRemoveLink(table, link.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="add-link flex items-center gap-2">
              <select 
                className="text-sm"
                onChange={(e) => {
                  if (e.target.value === 'NEW') {
                    handleCreateNew(targetType, table);
                  } else if (e.target.value) {
                    handleAddLink(table, targetType, parseInt(e.target.value));
                  }
                  e.target.value = '';
                }}
              >
                <option value="">+ Link a {schema[targetType].label}...</option>
                {available.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
                <option value="NEW">✨ Create New {schema[targetType].label}...</option>
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RelationshipPanel;
