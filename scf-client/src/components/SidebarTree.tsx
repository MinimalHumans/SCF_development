import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Search,
  Folder,
  FileText,
  Lock
} from 'lucide-react';
import { db } from '../db/Database';
import schemaData from '../db/schema.json';

const schema = schemaData as Record<string, any>;

const CATEGORY_ORDER = [
  'STORY ENTITIES',
  'STORY STRUCTURE',
  'VISION',
  'CREATIVE DIRECTION',
  'CHARACTER DEPTH',
  'LOCATION DEPTH',
  'SCENE DETAIL',
  'THEMATIC TRACKING',
  'PRODUCTION',
  'METADATA'
];

interface Entity {
  id: number;
  name: string;
  [key: string]: any;
}

interface GroupedEntities {
  [category: string]: {
    [type: string]: Entity[];
  };
}

const SidebarTree: React.FC = () => {
  const [entities, setEntities] = useState<GroupedEntities>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Expand top categories by default
    const initial: Record<string, boolean> = {};
    CATEGORY_ORDER.forEach(cat => {
      initial[cat] = true;
    });
    return initial;
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const fetchEntities = async () => {
    setLoading(true);
    const newEntities: GroupedEntities = {};
    
    // Initialize all categories from ORDER to ensure they exist
    CATEGORY_ORDER.forEach(cat => {
      newEntities[cat] = {};
    });
    
    const entityTypes = Object.keys(schema);
    
    for (const type of entityTypes) {
      const typeDef = schema[type];
      const category = (typeDef.category || 'Other').toUpperCase();
      
      // Explicitly exclude non-content categories
      if (category === 'PROJECT' || category === 'CONNECTIONS') continue;
      
      if (!newEntities[category]) newEntities[category] = {};
      
      // Only fetch rows for Tier 0
      if (typeDef.tier === 0) {
        try {
          const nameField = typeDef.name_field || 'name';
          const rows = await db.listEntities(type, { orderBy: `${nameField} ASC` });
          newEntities[category][type] = rows;
        } catch (e) {
          console.error(`Error fetching ${type}:`, e);
          newEntities[category][type] = [];
        }
      } else {
        // Tier 1+: no rows fetched, just a placeholder
        newEntities[category][type] = [];
      }
    }
    
    setEntities(newEntities);
    setLoading(false);
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateEntity = async (type: string) => {
    const typeDef = schema[type];
    if (typeDef.tier > 0) return;

    const nameField = typeDef.name_field || 'name';
    const newId = await db.createEntity(type, { [nameField]: `New ${typeDef.label}` });
    await fetchEntities();
    navigate(`/browse/${type}/${newId}`);
  };

  // Filter out categories that are not in our list or empty
  const categories = CATEGORY_ORDER.filter(cat => 
    entities[cat] && Object.keys(entities[cat]).length > 0
  );

  return (
    <div className="sidebar-tree">
      <div className="sidebar-search">
        <div className="search-input-container">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search entities..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="tree-content">
        {loading ? (
          <div className="p-4 text-sm text-muted">Loading...</div>
        ) : (
          categories.map(category => (
            <div key={category} className="tree-category">
              <div 
                className="tree-node category-node" 
                onClick={() => toggleExpand(category)}
              >
                {expanded[category] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="node-label">{category}</span>
              </div>
              
              {expanded[category] && (
                <div className="category-children">
                  {Object.keys(entities[category])
                    .sort((a, b) => (schema[a].sort_order || 0) - (schema[b].sort_order || 0))
                    .map(type => {
                      const typeDef = schema[type];
                      const isPlaceholder = typeDef.tier > 0;
                      const typeKey = `${category}-${type}`;
                      const nameField = typeDef.name_field || 'name';
                      const filteredItems = entities[category][type].filter(e => {
                        const val = e[nameField] || e.name || '';
                        return val.toString().toLowerCase().includes(searchTerm.toLowerCase());
                      });

                      return (
                        <div key={type} className={`tree-type-group ${isPlaceholder ? 'tree-entity-placeholder' : ''}`}>
                          <div 
                            className="tree-node type-node"
                            onClick={() => !isPlaceholder && toggleExpand(typeKey)}
                            style={{ opacity: isPlaceholder ? 0.5 : 1, cursor: isPlaceholder ? 'default' : 'pointer' }}
                          >
                            {!isPlaceholder && (expanded[typeKey] ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                            {isPlaceholder && <Lock size={12} className="node-icon" />}
                            <span className="type-icon">{typeDef.icon || '📄'}</span>
                            <span className="node-label">{typeDef.label_plural}</span>
                            {isPlaceholder && <span className="tree-dev-badge">DEV</span>}
                            {!isPlaceholder && (
                              <button 
                                className="add-button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreateEntity(type);
                                }}
                                title={`Add ${typeDef.label}`}
                              >
                                <Plus size={12} />
                              </button>
                            )}
                          </div>
                          
                          {expanded[typeKey] && !isPlaceholder && (
                            <div className="type-children">
                              {filteredItems.length === 0 && !searchTerm && (
                                <div className="tree-node entity-node" style={{ fontStyle: 'italic', opacity: 0.5, pointerEvents: 'none' }}>
                                  No {typeDef.label_plural.toLowerCase()} yet
                                </div>
                              )}
                              {filteredItems.map(entity => {
                                const nameField = typeDef.name_field || 'name';
                                return (
                                  <NavLink 
                                    key={entity.id} 
                                    to={`/browse/${type}/${entity.id}`}
                                    className={({ isActive }) => `tree-node entity-node ${isActive ? 'active' : ''}`}
                                  >
                                    <FileText size={12} className="node-icon" />
                                    <span className="node-label">{entity[nameField] || entity.name}</span>
                                  </NavLink>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SidebarTree;
