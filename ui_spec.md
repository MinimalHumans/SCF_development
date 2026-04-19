## SCF Editor — UI Feature Specification

**A metadata-driven authoring tool for screenplays and narrative projects.**

---

### 1. Application Areas

- **Project Selector** — entry point for managing projects
- **Entity Browser** — main authoring workspace
- **Screenplay Editor** — script composition interface
- **Query Explorer** — analytical queries for story structure

---

### 2. Project Management

- Create a new project by name
- Import an existing project file (`.scf`)
- Import a Fountain screenplay — creates a project and extracts entities automatically
- Open an existing project from a list
- Download a project file locally
- Close the current project

---

### 3. Entity Browser

#### Header
- Global search — real-time, searches across all entity types, keyboard shortcut to focus, Esc to clear

#### Left Panel — Entity Tree
- Resizable panel (drag to adjust width)
- Collapse All / Expand All buttons
- Entities organized into collapsible categories
- Per entity type: collapsible group with icon, label, count badge, and Add button
- Sort toggle per entity type: alphabetical vs. creation order
- Active entity highlighted; scroll position preserved between selections

#### Right Panel — Entity Editor
- Empty state prompt when nothing is selected
- Entity header: icon, type label, name, ID, last-updated timestamp
- Delete entity with confirmation dialog
- **Tabs** — fields organized across multiple tabs per entity type (e.g., General, Backstory, Physical, Voice, Relationships, Notes, Reference)
- **Field types:** single-line text, multi-line text, integer, decimal, dropdown (static options), entity reference (linked to another entity), checkbox, JSON
- Required field markers and contextual help text per field
- Save button with inline success indicator
- Tab and scroll position restored after saving

#### Reference Images (character, location, prop)
- Drag-and-drop or click-to-browse image upload
- Multi-image support
- Image gallery grid view
- Per-image description field
- Per-image delete

---

### 4. Entity Relationships (Inline Link Panels)

Displayed within entity editors where relationships exist:

- **Scene → Characters** — link characters with role and notes
- **Scene → Props** — link props with significance and usage note
- **Sequence → Scenes** — link scenes with ordering
- **Character, Prop, Location** — reverse views showing which scenes they appear in

**Link Panel Mechanics:**
- Autocomplete search to find existing entities
- Create a new linked entity inline without leaving the current editor
- Linked entities shown as removable chips
- Metadata fields editable per link (e.g., role, significance, order)
- Changes apply immediately without page reload

---

### 5. Entity Types

**Active in the editor UI:**
- `project`, `character`, `location`, `prop`, `scene`, `theme`, `sequence`
- Relationship junction types: scene↔character, scene↔prop, sequence↔scene

**Schema-only (visible in tree but not editable — 86+ types):**
Organized into extended schema categories:
- *Character depth:* costume, makeup, vocal/physical profiles, relationships, variants
- *Location depth:* design, variants, color schemes, sound profiles
- *Scene detail:* emotional targets, lighting, music, set dressing, dialogue sound
- *Creative direction:* directorial philosophy, visual identity, cinematography, pacing
- *Thematic tracking:* motifs, symbols, color scripts, emotional arcs
- *Production:* shots, blocking, action sequences, proxemics, vocal performance

---

### 6. Screenplay Editor

#### Empty State
- Import an existing Fountain file
- Create a blank screenplay

#### Layout
- **Navigator panel** (collapsible sidebar) — lists of Scenes, Characters, Locations, and Props with counts
- **Text editor** — Fountain format with per-line-type syntax highlighting
- **Status bar** — current line type, scene number, active characters, line/page numbers, word count, save status

#### Supported Line Types
Action, Scene Heading (INT/EXT), Character, Dialogue, Parenthetical, Transition, Section, Synopsis, Centered, Blank, Boneyard (comments), Title Page

#### Editing
- Tab key cycles through line types: Description → Scene → Character → Dialogue → Transition
- Autocomplete for character names, location names, and prop names based on entities in the project
- Prop tagging — select text and tag it as a prop reference (keyboard shortcut)
- Title page editing

#### Versioning
- Publish the current screenplay as a named snapshot with a description
- View all published versions with timestamps
- Restore any prior version as the live screenplay
- Delete a version

---

### 7. Query Explorer

Five predefined analytical queries:

| Query | Inputs | What It Shows |
|-------|--------|---------------|
| Character Journey | One character | All scenes the character appears in, with role |
| Location Breakdown | One location | All scenes at that location, with characters and props present |
| Scene Context | One scene | Full details: location, characters, props, emotional beat |
| Character Crossover | Two characters | All scenes where both appear together |
| Project Stats | None | Entity counts, most-appearing characters, coverage gaps |

Each query has an entity selector input and an expandable results panel.

---

### 8. Global UI Behaviors

#### Persisted State
- Tree collapse/expand state per entity type and category
- Sort preference per entity type
- Panel width
- Last active tab in entity editor
- Scroll position in tree and editor

#### Keyboard Shortcuts
- Focus global search
- Cycle line type in screenplay editor
- Tag prop reference in screenplay

#### UI Polish
- Hover, active, and disabled states throughout
- Animated loading overlay during import operations
- Confirmation dialogs for destructive actions
- Inline save confirmation (auto-dismisses)
- Error messages for failed operations
- Empty state prompts throughout

---

### 9. Known Gaps

- Multiselect field type (not yet in UI)
- Relationship graph/network visualization
- Batch / multi-entity operations
- Undo/redo outside the screenplay editor
- Export to JSON or CSV
- Mobile responsiveness
- Natural language queries
- Real-time collaboration