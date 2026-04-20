# Story Context Framework — Schema & Roadmap

## What SCF Is

The Story Context Framework is a structured data format for describing films. It captures not just what happens in a story (plot, characters, dialogue) but the complete creative intent behind every decision — why something looks the way it does, why a character moves through space in a particular way, what a color means, how sound shapes emotion.

SCF is to film storytelling what USD is to 3D scenes: a composable, addressable, tool-agnostic format that any application can read from or write to. A color pipeline reads the color entities. An image generator reads character appearance and location atmosphere. A dialogue tool reads vocal profiles and speech patterns. Each tool consumes the layer it needs and ignores the rest.

The format is stored as a `.scf` file — a SQLite database with a defined table schema. Every entity type has its own table. Every entity has a unique ID and timestamps. Relationships between entities are expressed through foreign key references and junction tables.

---

## Relationship to the SSF Spec

The original Story State Framework (SSF) specification defined the conceptual model: three layers (Vision, Performance, Creative), their sub-layers, and ~100 entity definitions with attributes and relationships. That spec was organized by creative function — what layer of filmmaking each concept belongs to.

The SCF schema preserves the full SSF conceptual model but reorganizes it for practical authoring and tool consumption:

- The layer hierarchy (Vision → Performance → Creative) remains the conceptual backbone. Every entity in the schema traces back to a specific layer and sub-layer from the SSF spec.
- The editor groups entities by **functional category** (what you're working on) rather than by layer (which conceptual domain it belongs to). This means "Character Depth" groups physical profile, vocal profile, color identity, and costumes together — even though those span Performance Layer and Creative Layer in the spec.
- A **tier system** defines the order of population: which entities are most useful earliest, and which require the project to be further developed before they're worth filling in.
- The `Dialogue_Line` entity from the SSF spec is replaced by the screenplay editor's `screenplay_lines` table, which serves as the canonical per-line dialogue representation.

Everything else from the SSF spec is present in the schema.

---

## Design Principles

**The schema is the product.** The editor is one authoring interface. Other tools — importers, exporters, validators, generators, visualizers — read and write the same `.scf` file. The schema must be stable, complete, and self-describing independent of any particular tool.

**Every concept is its own entity.** Visual Identity is not a tab on Project. It is its own table with its own fields, queryable and addressable independently. A tool that needs to know the project's aesthetic genre reads `visual_identity` without parsing unrelated Project fields. This mirrors USD's principle that materials, lights, cameras, and geometry are separate prims composed together, not attributes jammed onto geometry.

**Incremental population.** A `.scf` file is useful at 5% populated (just a project name, some characters, and scene headings) and becomes progressively richer as more entities are authored. No entity is required for the format to be valid. Empty tables are fine.

**Context inheritance.** Project-level entities establish defaults that scene-level entities specialize. A tool generating output for a scene should walk up the chain: scene-level → sequence-level → project-level, using the most specific data available. This is not enforced by the schema (no hierarchical constraints) but is the intended consumption pattern.

**Forward compatibility.** The full schema — all 96 entity tables — is created when a project is initialized, even if most are empty. Tools can be built against the complete spec today. New entities can be added to the registry without migrating existing files (the `init_database` function creates missing tables on open).

---

## Tier System

Tiers describe the natural order of population during story development. They are not access levels or feature gates — all tiers are available from day one. The tier system is a guide for authors (what to fill in first) and a compatibility contract for tools (what data you can expect at each stage of development).

### Tier 0 — Structural Foundation

The bones of the story. Who, what, where, when, in what order.

A tool reading a Tier 0 file gets: a project with a name and logline, characters with names and roles, locations with descriptions, props, scenes in order with character/location links, sequences grouping scenes, and themes. This is enough for a text-based AI to understand the story's structure and generate context-aware output.

**Entities:**

| Entity | Fields | Description |
|---|---|---|
| `project` | 12 | Root container — name, logline, genre, tone, status, vision statement |
| `character` | 34 | Characters — name through wardrobe, spanning General/Backstory/Physical/Voice/Relationships/Wardrobe tabs |
| `location` | 16 | Places — name, type, atmosphere, sound, key features |
| `prop` | 16 | Objects — name, type, materials, story significance, symbolism |
| `scene` | 21 | Scenes — heading, location link, emotional beat, visual/sound notes |
| `sequence` | 8 | Scene groups — act assignment, dramatic purpose, turning point |
| `theme` | 7 | Thematic elements — description, motifs, character/scene connections |
| `scene_character` | 5 | Junction: character appears in scene with role |
| `scene_prop` | 5 | Junction: prop appears in scene with significance |
| `scene_sequence` | 4 | Junction: scene belongs to sequence with ordering |

These are the entities currently exposed in the SCF editor with full CRUD, tree navigation, inline relationship linking, and query explorer support. The screenplay editor also creates and links these entities during Fountain import and structured saves.

---

### Tier 1 — Creative Direction

Project-level singletons that establish the creative DNA. One of each per project.

A tool reading a Tier 1 file gets: "This is a desaturated, naturalistic western shot anamorphic at 2.39:1, 24fps, with motivated camera movement, sparse acoustic score, and a lived-in textural philosophy. The color palette centers on amber, slate, and dried blood. The pacing is slow-burn with specific acceleration points." That's enough to establish a generation style without any per-scene data.

This is the most common state for a project in early development — you have a vision but haven't broken it down scene by scene yet. The format is designed to be useful at this stage.

**Entities (17) — all in the "Creative Direction" category:**

| Entity | Fields | SSF Origin | Description |
|---|---|---|---|
| `project_vision` | 11 | Vision → Director's Intent | Why this story — core question, intended impact, personal connection |
| `directorial_philosophy` | 6 | Vision → Director's Intent | Filmmaking approach, technical style, risk tolerance, audience relationship |
| `technical_specs` | 8 | *(new — not in SSF)* | Aspect ratio, resolution, frame rate, color space, delivery format |
| `visual_identity` | 7 | Creative → World Design | Aesthetic genre, design era, visual density, textural philosophy, influences |
| `cinematographic_philosophy` | 5 | Creative → Cinematography | Camera personality, movement philosophy, framing approach |
| `project_color_palette` | 9 | Creative → Color | Primary/secondary/accent/restricted colors with hex codes, saturation, value structure |
| `project_tone` | 7 | Vision → Emotional Architecture | Primary tone, blend ratios, tonal range, reference touchstones |
| `pacing_strategy` | 6 | Vision → Emotional Architecture | Overall pacing, philosophy, breathing room, acceleration/deceleration |
| `sonic_identity` | 6 | Creative → Sound Design | Sound aesthetic, density, silence philosophy, subjective approach |
| `musical_identity` | 6 | Creative → Music | Score approach, musical tone, instrumentation, density |
| `design_constraints` | 10 | Creative → World Design | Allowed/forbidden materials, technology level, architectural rules |
| `look_development` | 11 | Creative → Cinematography | Contrast, saturation, color bias, grain, LUT info |
| `coverage_philosophy` | 4 | Creative → Cinematography | Coverage style, editorial approach |
| `costume_design_philosophy` | 6 | Creative → Character Appearance | Design approach, silhouette strategy, fabric philosophy |
| `material_palette` | 6 | Creative → World Design | Primary/secondary/accent/forbidden materials |
| `texture_philosophy` | 5 | Creative → World Design | Texture spectrum, contrast strategy, patina approach |
| `color_temperature_strategy` | 7 | Creative → Color | Warm/cool associations, day/night patterns |

---

### Tier 2 — Character & Location Depth

Per-entity structured detail from the Performance and Creative layers. These entities extend the base Character and Location with machine-readable attributes (select values, hex codes, discrete fields) rather than freeform text.

A tool reading a Tier 2 file can generate character-consistent and location-consistent output. It knows Eleanor's silhouette, her color palette (with hex codes), how she moves through space, what her voice sounds like as structured data — not a paragraph to be parsed.

**Character Depth (11 entities):**

| Entity | Fields | SSF Origin | Description |
|---|---|---|---|
| `character_relationship` | 10 | Base → Character | Proper relationship entity replacing JSON blob — type, power dynamic, valence, arc |
| `character_color_identity` | 12 | Creative → Color | Signature colors with hex codes, manifestation, consistency, evolution |
| `physical_character_profile` | 16 | Performance → Physical | Posture, center of gravity, tension, energy, movement speed/fluidity/economy/weight |
| `vocal_profile` | 17 | Performance → Vocal | Pitch, timbre, pace, rhythm, articulation, accent, filler words, verbal tics |
| `delivery_profile` | 7 | Performance → Vocal | Line delivery style, emotional access, subtext playing |
| `facial_expression_profile` | 10 | Performance → Physical | Resting face, expressiveness, eye contact patterns, mouth behavior |
| `character_appearance_profile` | 11 | Creative → Character Appearance | Silhouette, visual distinction, shorthand, appearance evolution |
| `costume` | 17 | Creative → Character Appearance | Specific wardrobe look — garments, hex colors, fabrics, condition, narrative meaning |
| `costume_progression` | 9 | Creative → Character Appearance | How wardrobe evolves through the arc |
| `makeup_hair_design` | 11 | Creative → Character Appearance | Makeup approach, hair design, prosthetics (baseline or per-scene) |
| `character_variant` | 6 | Base → Character | Named character states: "Young Eleanor", "Marcus in Disguise" |

**Location Depth (4 entities):**

| Entity | Fields | SSF Origin | Description |
|---|---|---|---|
| `location_design` | 19 | Creative → World Design | Architecture, materials, spatial layout, focal points, light sources |
| `location_variant` | 6 | Creative → World Design | Modified states: "Warehouse — Night", "Apartment — After Fire" |
| `location_color_scheme` | 7 | Creative → Color | Dominant colors, atmosphere, character-location color interaction |
| `location_sound_profile` | 9 | Creative → Sound Design | Room tone, reverb, constant/variable/characteristic sounds |

**Junctions added:** `costume_scene` (which scenes a costume appears in).

---

### Tier 3 — Scene-Level Creative Data

Per-scene creative direction from the Vision and Creative layers. These entities give each scene its own emotional target, color palette, lighting design, and music approach — enabling tools to generate scene-specific output that varies correctly across the story.

**Entities (7) — all in the "Scene Detail" category:**

| Entity | Fields | SSF Origin | Description |
|---|---|---|---|
| `scene_emotional_target` | 8 | Vision → Emotional Architecture | Primary emotion + intensity (1-10), emotional function, audience relationship |
| `scene_color_palette` | 8 | Creative → Color | Dominant colors, harmony type, source distribution, focal color |
| `lighting_design` | 18 | Creative → Cinematography | Style, key/fill/back specs, color temps, contrast ratio, practicals |
| `scene_music_design` | 11 | Creative → Music | Presence, emotional function, entry/exit, themes used, source music |
| `tone_marker` | 9 | Vision → Emotional Architecture | Scene-specific tone, intensity, genre elements, pacing |
| `set_dressing` | 9 | Creative → World Design | Hero objects, atmospheric objects, sightline management |
| `dialogue_sound_design` | 7 | Creative → Dialogue (Sound) | Recording aesthetic, acoustic environment, clarity, processing |

---

### Tier 4 — Thematic Tracking

The cross-cutting meaning layer. Motifs, symbols, subtext, and thematic connections that weave through the story. These entities create the "web of meaning" that the SSF spec describes — they link any entity to any theme, track how visual and sonic patterns recur and evolve, and document the gap between surface and subtext.

This tier is what makes a fully-populated `.scf` file genuinely novel as a format. No existing screenplay or production tool captures "this window motif represents isolation, appears in scenes 3, 7, 15, 23, 35, and evolves from barrier to shared view."

**Entities (12) — in the "Thematic Tracking" category:**

| Entity | Fields | SSF Origin | Description |
|---|---|---|---|
| `visual_motif` | 7 | Creative → World Design | Recurring visual element — shape, pattern, material, object |
| `sonic_motif` | 7 | Creative → Sound Design | Recurring sound with symbolic meaning |
| `symbol` | 7 | Vision → Subtext & Symbolism | Object/image/sound/action carrying meaning beyond the literal |
| `conceptual_motif` | 4 | Vision → Thematic Framework | Recurring idea, behavior, or verbal pattern |
| `subtext` | 8 | Vision → Subtext & Symbolism | Surface vs underlying meaning, gap size, character awareness |
| `thematic_connection` | 7 | Vision → Thematic Framework | Links any entity to a theme with nature and subtlety |
| `color_symbolism` | 8 | Creative → Color | Per-color symbolic meaning, emotional associations |
| `color_script` | 7 | Creative → Color | Project-wide color progression map |
| `emotional_arc` | 5 | Vision → Emotional Architecture | Overall audience emotional trajectory |
| `emotional_beat` | 8 | Vision → Emotional Architecture | Specific points on the emotional journey |
| `information_strategy` | 7 | Vision → Audience Manipulation | What audience knows vs characters — suspense, surprise |
| `identification_strategy` | 7 | Vision → Audience Manipulation | How audience relates to characters — empathy, distance |

**Junctions added:** `visual_motif_appearance` (where motifs manifest in locations/props/costumes), `motif_manifestation` (where conceptual motifs appear in scenes).

---

### Tier 5 — Production & Execution

Shot-level specifications, performance execution details, choreography, and audio cue placement. This is the most granular tier — individual camera setups, specific blocking movements, line delivery instructions, sound cue timing.

These entities represent the transition from story development into production planning. They're included in the schema for format completeness (the `.scf` file can describe a film at production-level granularity) but are expected to be populated last.

**Entities (27) — in the "Production" category:**

*Camera & Cinematography:*

| Entity | Fields | SSF Origin |
|---|---|---|
| `shot` | 5 | Base → Structure |
| `shot_design` | 18 | Creative → Cinematography |
| `shot_language` | 5 | Creative → Cinematography |

*Blocking & Choreography:*

| Entity | Fields | SSF Origin |
|---|---|---|
| `scene_blocking` | 6 | Performance → Choreography |
| `blocking_beat` | 10 | Performance → Choreography |
| `action_sequence` | 8 | Performance → Choreography |
| `action_beat` | 9 | Performance → Choreography |
| `proxemic_design` | 7 | Performance → Spatial Dynamics |
| `movement_choreography` | 6 | Performance → Choreography |

*Per-Scene Performance States:*

| Entity | Fields | SSF Origin |
|---|---|---|
| `physical_state` | 9 | Performance → Physical |
| `vocal_state` | 7 | Performance → Vocal |

*Performance Beats:*

| Entity | Fields | SSF Origin |
|---|---|---|
| `physical_performance_beat` | 9 | Performance → Physical |
| `vocal_beat` | 7 | Performance → Vocal |
| `line_delivery` | 12 | Performance → Vocal |
| `dialogue_rhythm` | 8 | Performance → Vocal Interaction |
| `emotional_physicality` | 10 | Performance → Body Language |
| `physical_habit` | 8 | Performance → Physical |
| `microexpression` | 9 | Performance → Physical |

*Physical Relationships:*

| Entity | Fields | SSF Origin |
|---|---|---|
| `character_environment_physicality` | 8 | Performance → Physical Interaction |
| `physical_relationship` | 10 | Performance → Physical Interaction |
| `physical_relationship_evolution` | 7 | Performance → Physical Interaction |

*Audio Cues & Themes:*

| Entity | Fields | SSF Origin |
|---|---|---|
| `musical_theme` | 8 | Creative → Music |
| `sound_cue` | 10 | Creative → Sound Design |
| `music_cue` | 10 | Creative → Music |
| `sound_perspective` | 6 | Creative → Sound Design |
| `voiceover_design` | 6 | Creative → Dialogue (Sound) |
| `music_sound_relationship` | 5 | Creative → Music |

**Junctions added:** `action_sequence_character` (characters in action sequences).

---

### Metadata

Cross-cutting entities for documenting decisions, communicating with collaborators, and linking external files.

| Entity | Fields | SSF Origin | Description |
|---|---|---|---|
| `creative_decision` | 9 | Vision → Decision Framework | Documented rationale for a creative choice — options considered, tradeoffs |
| `collaboration_note` | 8 | Vision → Decision Framework | Director's guidance to specific domains — vision, boundaries, questions |
| `asset` | 11 | Base → Assets | External file references — images, models, audio, documents |
| `asset_relationship` | 6 | Base → Assets | Junction linking assets to any entity |

---

## Schema Statistics

| Metric | Count |
|---|---|
| Total entity types | 96 |
| Total fields across all entities | 844 |
| Categories | 10 |
| Junction/connection entities | 8 |
| Project-level singletons (Creative Direction) | 17 |
| Per-character entities (Character Depth) | 11 |
| Per-location entities (Location Depth) | 4 |
| Per-scene entities (Scene Detail) | 7 |
| Thematic/motif entities (Thematic Tracking) | 12 |
| Production entities | 27 |
| Metadata entities | 3 |
| Entities with hex color fields | 5 |
| Select fields with defined options | ~90 |
| JSON fields (structured arrays/objects) | ~35 |
| Reference (foreign key) fields | ~75 |

---

## Context Inheritance Model

The schema encodes a natural cascade from project-wide direction to scene-specific detail:

```
Project Color Palette
  └── Sequence Color Palette (not yet in schema — future addition)
        └── Scene Color Palette
              └── Costume colors + Location Color Scheme + Lighting colors

Visual Identity (project aesthetic)
  └── Location Design (per-location materials, geometry)
        └── Set Dressing (per-scene object arrangement)

Project Tone
  └── Tone Marker (per-scene/sequence tone)
        └── Scene Emotional Target (per-scene emotion + intensity)

Sonic Identity (project sound philosophy)
  └── Location Sound Profile (per-location acoustics)
        └── Sound Cue (individual sound placement)

Musical Identity (project score approach)
  └── Musical Theme (recurring melodic ideas)
        └── Scene Music Design → Music Cue (placement)

Physical Character Profile (baseline physicality)
  └── Physical State (per-scene condition)
        └── Physical Performance Beat (specific moment)
```

A tool generating output for Scene 23 walks up these chains, using the most specific data available. If Scene 23 has no `scene_color_palette`, the tool uses the project palette filtered through the characters present (via `character_color_identity`) and the location (via `location_color_scheme`).

This inheritance is a consumption convention, not a database constraint. The schema does not enforce that a scene palette "belongs to" a project palette. Tools implement the fallback logic.

---

## Layer Mapping Reference

For readers familiar with the SSF specification, this maps each schema entity back to its origin layer and sub-layer.

### Vision Layer — "The Why"

| Sub-Layer | Entities |
|---|---|
| Director's Intent | `project_vision`, `directorial_philosophy`, `creative_decision`, `collaboration_note` |
| Thematic Framework | `theme`, `thematic_connection`, `symbol`, `conceptual_motif`, `motif_manifestation`, `subtext` |
| Emotional Architecture | `project_tone`, `pacing_strategy`, `emotional_arc`, `emotional_beat`, `scene_emotional_target`, `tone_marker`, `information_strategy`, `identification_strategy` |

### Performance Layer — "Characters Come Alive"

| Sub-Layer | Entities |
|---|---|
| Physical Performance | `physical_character_profile`, `physical_state`, `physical_performance_beat`, `emotional_physicality`, `physical_habit`, `microexpression`, `facial_expression_profile` |
| Vocal Performance | `vocal_profile`, `delivery_profile`, `vocal_state`, `vocal_beat`, `line_delivery`, `dialogue_rhythm` |
| Choreography | `scene_blocking`, `blocking_beat`, `action_sequence`, `action_beat`, `proxemic_design`, `movement_choreography` |
| Physical Interaction | `character_environment_physicality`, `physical_relationship`, `physical_relationship_evolution` |

### Creative Layer — Visual

| Sub-Layer | Entities |
|---|---|
| World Design | `visual_identity`, `design_constraints`, `material_palette`, `texture_philosophy`, `location_design`, `location_variant`, `set_dressing`, `visual_motif` |
| Character Appearance | `character_appearance_profile`, `costume_design_philosophy`, `costume`, `costume_progression`, `makeup_hair_design`, `character_variant` |
| Color | `project_color_palette`, `scene_color_palette`, `character_color_identity`, `location_color_scheme`, `color_symbolism`, `color_script`, `color_temperature_strategy` |
| Cinematography | `cinematographic_philosophy`, `look_development`, `coverage_philosophy`, `shot_design`, `shot_language`, `lighting_design` |

### Creative Layer — Auditory

| Sub-Layer | Entities |
|---|---|
| Dialogue (as Sound) | `dialogue_sound_design`, `voiceover_design` |
| Sound Design | `sonic_identity`, `location_sound_profile`, `sound_cue`, `sonic_motif`, `sound_perspective`, `music_sound_relationship` |
| Music | `musical_identity`, `musical_theme`, `scene_music_design`, `music_cue` |

### Non-Layer (Structural / Format)

| Category | Entities |
|---|---|
| Structure | `project`, `scene`, `sequence`, `shot` |
| Story Entities | `character`, `location`, `prop` |
| Technical | `technical_specs` |
| Assets | `asset`, `asset_relationship` |
| Junctions | `scene_character`, `scene_prop`, `scene_sequence`, `costume_scene`, `visual_motif_appearance`, `motif_manifestation`, `action_sequence_character`, `character_relationship` |

---

## File Format Details

A `.scf` file is a SQLite 3 database containing:

- **Entity tables** — one per registered entity type (96 tables). Each has `id`, `created_at`, `updated_at` plus entity-specific columns.
- **`_scf_meta`** — key/value metadata (format version, last update timestamp).
- **`screenplay_lines`** — the structured screenplay (line-by-line with type classification and entity foreign keys).
- **`screenplay_title_page`** — title page key/value pairs.
- **`screenplay_versions`** / **`screenplay_version_lines`** / **`screenplay_version_title_page`** — published screenplay snapshots.
- **`screenplay_meta`** — screenplay statistics (scene count, page count).
- **`screenplay_character_map`** / **`screenplay_scene_map`** / **`screenplay_location_map`** / **`screenplay_prop_map`** — legacy mapping tables from Fountain import.
- **`screenplay_prop_tags`** — inline prop annotation tags.
- **`entity_images`** — reference image metadata (files stored in `sourcefiles/` directory).

The entity tables are auto-created from the entity registry on database initialization. Adding a new entity type to the registry creates the table on next open. Adding new fields to an existing entity triggers an `ALTER TABLE ADD COLUMN` migration.

Field types map to SQLite types: `TEXT` for text/textarea/select/multiselect/json, `INTEGER` for integer/boolean/reference, `REAL` for float.

JSON fields store structured data as JSON strings — arrays for lists, objects for structured records. The format convention is to use JSON for ordered lists (color palettes, garment lists, filler words) and for structured records that benefit from key/value access (color objects with hex + name + percentage).

Reference fields store integer IDs pointing to other entity tables. These are not enforced with SQL FOREIGN KEY constraints in the entity tables (to allow flexible authoring) but are semantically foreign keys that tools should resolve.

---

## Editor Status & Expansion Roadmap

### Currently Implemented in Editor

The SCF editor (FastAPI/HTMX/CodeMirror) fully supports Tier 0 entities:

- **Entity Browser** — tree navigation with collapsible categories, inline relationship linking (scene↔character, scene↔prop, scene↔sequence), tabbed edit forms, search, sort toggles, drag-resize panels.
- **Screenplay Editor** — CodeMirror 6 with modal writing system (Description/Scene/Character/Dialogue/Transition), CSS-driven formatting, entity autocomplete, prop tagging (Ctrl+P), Fountain import/export, version publishing/restore.
- **Query Explorer** — predefined cross-entity queries: character journey, location breakdown, scene context, character crossover, project stats.
- **Reference Images** — upload, gallery, lightbox preview, descriptions for character/location/prop entities.
- **Fountain Import** — parses `.fountain` screenplays into structured `screenplay_lines` with automatic entity creation (characters, locations, scenes, props) and junction linking.

### Phase 1 — Schema Deployment (Current)

Deploy the full 96-entity registry. All tables are created in every `.scf` file. The editor continues to work identically — existing entity forms, screenplay editor, and query explorer are unchanged. New entity types appear in the sidebar grouped by category but are empty.

No migration needed for existing projects (all are disposable during development).

### Phase 2 — Creative Direction Authoring

Expose Tier 1 (Creative Direction) entities in the editor. These are the 17 project-level singletons. UI considerations:

- These are singletons — each project should have exactly one. The "+" button creates the singleton; subsequent clicks open it for editing.
- Many share the same pattern: a few select fields plus textareas. The existing form renderer handles this.
- The `project_color_palette` and `color_temperature_strategy` entities would benefit from color picker UI eventually, but text/hex input works initially.

### Phase 3 — Character & Location Depth

Expose Tier 2 entities. These are per-entity detail records — each character can have a physical profile, vocal profile, color identity, costumes, etc.

UI considerations:

- These are child entities of a parent (character or location). The editor could show them as sub-sections or tabs on the parent entity's edit form, or as separate entities in the tree grouped under their parent.
- Costumes are multi-record: a character can have many costumes. The costume_scene junction links them to scenes.
- The existing inline relationship panel pattern (used for scene↔character linking) could be extended for character↔costume linking.

### Phase 4 — Scene Detail

Expose Tier 3 entities. Per-scene creative data: emotional target, color palette, lighting design, music design.

UI considerations:

- These extend the scene edit form. The scene already has Emotional and Technical tabs with freeform text fields; these structured entities provide the machine-readable version of the same data.
- Potential for visual feedback: showing the scene color palette as actual color swatches, displaying lighting design as a diagram.

### Phase 5 — Thematic Tracking

Expose Tier 4 entities. Motifs, symbols, subtext, thematic connections.

UI considerations:

- Thematic connections use the generic `entity_type` + `entity_id` pattern to link any entity to a theme. The editor would need a polymorphic entity picker (select entity type, then select entity within that type).
- Visual motif tracking across scenes could power a "motif map" visualization in the query explorer.

### Phase 6 — Context Output / Prompt Generation

With the structured schema populated, implement context assembly — the ability to query across layers and produce formatted output for downstream tools:

- **Scene context dump**: walk the inheritance chain for a scene and produce a structured JSON or markdown document containing everything a generation tool needs.
- **Character context dump**: assemble complete character profile across all layers.
- **Prompt templates**: structured templates that concatenate entity fields into formatted prompts for image generation (Midjourney, ComfyUI), dialogue generation, or music direction.

This is the payoff of the format — the `.scf` file becomes a queryable creative database that any tool can read.

### Future Considerations

- **Sequence Color Palette** — the inheritance chain currently jumps from project palette to scene palette. A sequence-level color palette (analogous to the SSF spec's `Sequence_Color_Palette`) would complete the cascade.
- **Prop Design** — the SSF spec has a separate `Prop_Design` entity with visual inspiration, design concept, and in-world manufacturing details, distinct from the base Prop entity. Currently these fields are partially on Prop itself.
- **Graphic Design** — the SSF spec has an entity for in-world typography, signage, branded elements, and screen content. Not yet in the schema.
- **Sound Effects Palette** — project-level sound effect categories (hard effects, foley, designed sounds) with design approach. Currently partially covered by `sonic_identity`.
- **Camera Package** / **Lens Set** / **Lens** — the SSF spec has dedicated entities for camera body specs, lens set characteristics, and individual lens optical profiles. These are production-level entities that could be added to the Production tier.
- **Schema versioning** — as the entity registry evolves, the `.scf` file should carry a schema version number for compatibility detection.
- **Export formats** — JSON export of the full `.scf` contents for tool consumption without SQLite dependency.
