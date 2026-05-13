# SCF Schema Reference

*Auto-generated from `entity_registry.py` on 2026-05-13 UTC. Do not edit by hand — re-run `scripts/generate_schema_docs.py` instead.*

---

## Summary

- **Total entities:** 98
- **Total visible fields:** 855
- **Categories:** 12

---

## Table of contents

- [Project](#category-project) (1 entities)
- [Story Entities](#category-story-entities) (3 entities)
- [Story Structure](#category-story-structure) (4 entities)
- [Vision](#category-vision) (1 entities)
- [Connections](#category-connections) (8 entities)
- [Creative Direction](#category-creative-direction) (17 entities)
- [Character Depth](#category-character-depth) (11 entities)
- [Location Depth](#category-location-depth) (4 entities)
- [Scene Detail](#category-scene-detail) (7 entities)
- [Thematic Tracking](#category-thematic-tracking) (12 entities)
- [Production](#category-production) (27 entities)
- [Metadata](#category-metadata) (3 entities)

---

## Cross-cutting conventions

*Source: `conventions.md` — the canonical authority. This section is reproduced from that file.*

### Versioning model

Some entities are flagged versionable. They participate in linear version chains, with five additional fields automatically present:

| Field | Notes |
|---|---|
| `parent_id` | self-referential, optional. Null = original/root version. |
| `version_label` | free text for human display, tool-managed. e.g. `"v1.2"`, `"approved-final"`, `"pre-cast"`. |
| `lifecycle_status` | the standard enum (see status taxonomy below). |
| `superseded_at` | timestamp, set when a successor is promoted to active. |
| `superseded_by_id` | self-referential, optional. Reverse pointer for query convenience. |

**Branching is not supported.** Each entity has at most one `parent_id` and at most one currently-`active` descendant. Linear chains only.

**Single active record per logical slot.** Where the format permits multiple records covering the same conceptual position (versions of a bundle, overrides on a shot+character), exactly one is `active` at a time. Predecessors are preserved with `superseded` status. Tools default to `active`; can opt into history.

**Format defines lineage; tools define policy.** The format provides the structural fields and the single-active invariant. Tools decide when a new version is created, whether new records start as `draft` or `active`, who is authorized to promote, and what review process gates the transition.

### Status field taxonomy

Four distinct axes track different concerns. Named separately to avoid collision and to keep the format honest about what's being measured.

#### 1. `lifecycle_status` — cross-cutting "is this current?"

Standard enum:

| Value | Meaning |
|---|---|
| `active` | current, in use |
| `draft` | work in progress, not yet promoted |
| `superseded` | replaced by a newer version (only meaningful on versionable entities) |
| `deprecated` | explicitly marked as no longer preferred, but kept for reference. Different from superseded — nothing necessarily replaced it. |
| `cut` | intentionally removed from the work but preserved |
| `archived` | historical, not actively maintained |

Applied to: versionable entities (where it also drives the active/superseded distinction), and to entities where lifecycle state is the relevant axis (character, prop, location, take, clip, etc.).

#### 2. `production_status` — project-level production phase

Values: `development`, `pre_production`, `production`, `post_production`, `complete`.

Applied to: the `project` entity. Tracks the project's production phase, independent of whether the project record itself is `active`. A project in `post_production` could be in any lifecycle state.

#### 3. `status` — writing-process state (scene/act/sequence)

Values: `outline`, `draft`, `revised`, `locked`, `cut`.

Applied to: `scene`, `act`, `sequence`. Tracks where each narrative unit is in the writing process. A locked scene is still active in the lifecycle sense; a draft scene is still active. The two axes are orthogonal.

#### 4. Entity-specific status fields

Domain-specific verification or approval axes:

- `asset.approval_status` — `wip`, `pending`, `approved`, `final`
- `identity_anchor.canonical_status` — `verified`, `candidate`, `rejected`

These track concerns that are genuinely distinct from lifecycle. They stay as separate fields with their own enums.

#### Multiple axes coexist

A single entity often has multiple status fields, each measuring a different axis:

- A `project` has `lifecycle_status` (is this record current?) and `production_status` (what phase?).
- An `asset` has `lifecycle_status` (is this record current?) and `approval_status` (has this been approved for use?).
- An `identity_anchor` has `lifecycle_status` and `canonical_status`.

Tools query the axis relevant to their job. Compressing axes into a single field would force false equivalences.

### Casing convention

**All enum values across the schema are lowercase.** Display layers may capitalize for UI; the stored value is canonical lowercase. This sidesteps "is this a display label or a value?" comparison bugs across tools.

Field names use `snake_case`. Entity names use `snake_case`. Reference fields are named `<entity>_id` (e.g. `character_id`, `scene_id`, `bundle_id`).

### Reference fields

All `*_id` fields are **integer foreign keys**. They reference rows in the target entity's table by primary key. Renaming an entity's `name` field does not break references — the integer ID is stable.

Reference field declarations in the entity registry specify the target entity:

```python
FieldDef("character_id", "Character", "reference",
         reference_entity="character", required=True)
```

SQL `FOREIGN KEY` constraints are not enforced in entity tables to allow flexible authoring (e.g. creating a relationship before its target exists). Tools should validate references but the format permits temporary inconsistency.

### Preservation over deletion

The schema favors lifecycle state transitions over physical deletion. A cut character isn't removed from the file; their `lifecycle_status` changes to `cut`. A superseded bundle isn't deleted; the new version supersedes it and the old version's `lifecycle_status` becomes `superseded`. A rejected identity anchor isn't deleted; its `canonical_status` changes to `rejected`.

Tools default to showing `active` records. They can opt into showing other states. They never need to handle missing entities — the file is the complete history.

The only legitimate reason to delete a record is privacy compliance (e.g. removing personal data on request). In all other cases, lifecycle transitions are the correct mechanism.

### Format-level versioning

The `_scf_meta` table carries a `schema_version` entry — a string declaring which entity registry version the file was authored against. Tools open a file, check schema version, and either proceed, migrate, or refuse with a clear message.

Schema versions follow semver-style conventions:

- **Major bumps** (e.g. 1.x → 2.0) for breaking changes: entities removed, fields renamed, semantics changed.
- **Minor bumps** (e.g. 1.0 → 1.1) for additive changes: new entity, new field, new enum value.

The changelog at `docs/history/changelog.md` records the version-to-design-document mapping.

### OMC posture

SCF is independent of MovieLabs OMC. SCF is **not** an OMC extension, **not** an OMC profile, and **not** dependent on OMC's release cycle or governance. Where SCF and OMC happen to mean the same thing, terminology alignment is welcome. Where they don't, SCF reserves the right to its own design.

#### External identifiers

Entities that may be addressed by external systems (OMC, EIDR, production databases, asset management tools) carry two optional fields:

| Field | Notes |
|---|---|
| `external_id` | identifier in an external system |
| `external_id_namespace` | which system the identifier belongs to. e.g. `omc`, `eidr`, `shotgrid:project_42` |

These appear on: `project`, `asset`, `actor`, `character`, `scene`, `shot`, `take`, `clip`. Authoring tools don't need to fill them in. Tools that bridge SCF and an external system populate them to maintain identity across handoffs.

The mechanism is generic. It serves OMC interop but is not OMC-specific.

#### What SCF does not do

SCF does not adopt OMC's identifier scheme, does not implement OMC's base classes, does not follow OMC's governance, and does not require OMC-aware tools to consume it. A tool that knows nothing about OMC can author and read SCF files in full.

### The bundle pattern (character cluster)

For media references on characters, the schema uses a tool-agnostic bundle pattern. The same pattern is intended to extend to props and locations.

#### Bundle

A `bundle` is a named, intent-typed collection of assets:

- **`name`** — author-facing label
- **`intent`** — hard enum from this set:

| Intent | Description |
|---|---|
| `visual_identity` | face/body locking (photos, video stills) |
| `voice_identity` | voice cloning material (audio with varied delivery) |
| `motion` | body/gesture data (mocap, video clips, gait recordings) |
| `behavior` | decision/reaction corpora, character LLM training data |
| `performance` | multimodal captured performance (video with sync sound) |
| `surface` | material/texture detail (skin micro, fabric weave) |
| `environment` | for locations: spatial/environmental references |
| `other` | escape hatch — should be flagged for promotion to a real value |

- **`format_hints`** — JSON metadata tools can read to assess compatibility (frame count, view angles, lighting conditions, phonemes covered, audio duration, etc.)
- **`intended_consumers`** — JSON hints about what tool types this bundle is designed for. Guidance, not constraint.
- **`provenance`** — how the bundle was assembled.
- **`coverage_summary`** — plain-language description.

Bundles are versionable (participate in version chains).

#### Bindings

A `character_asset_binding` applies a bundle to a character under specific conditions:

- Optional `variant_id` (which character variant this applies to)
- Optional state filters (physical state, vocal state)
- Optional scene range
- `is_baseline` flag for the unconditional default
- `precedence` integer for resolution priority

A character typically has several bindings: a baseline visual, a baseline voice, then more specific ones layered on (variant-specific, state-specific, scene-range-specific).

#### Identity anchors

Distinct from bundles, anchors mark known-good single frames or audio segments as canonical references. Used for both ID-locking inputs and output verification (QA). Anchors point into source assets with optional spatial scoping (region_box) and temporal scoping (frame_number, timecode, audio offset). Source assets stay whole and uncropped — anchors describe how to interpret them.

#### Resolution cascade

A tool generating any character in any shot walks a deterministic cascade:

1. Check `character_shot_override` for (shot, character, active). If `bundle_override_id` is set and the bundle matches the requested modality, use it.
2. Check `shot_coverage` (most recent by status_date). If `coverage_state` is `captured_live` and the captured source provides usable data for the requested modality, use it.
3. Resolve `character_asset_binding` for the character, filtered by scene/variant/state and bundle `intent` matching the requested modality. Pick highest-precedence match.
4. Fall back to bindings with looser scope: drop state filter, then variant filter, then fall to `is_baseline=true`.
5. For verification, pull `identity_anchor` records matching the same conditions and modality.

**The cascade operates per-modality.** Visual, voice, motion, and behavior are resolved independently. A tool requesting one modality filters by bundle `intent`. Step 2 (captured live) short-circuits only when the captured source provides usable data for that modality.

The cascade enables performance-first projects (live action, generation augmenting) and generation-first projects (fully synthetic) to use the same query patterns. They simply land at different steps.

### Naming conventions for new entities

When adding new entities to the registry, follow these conventions:

- **Entity names:** `snake_case` singular. e.g. `character_variant`, `identity_anchor`, `performance_corpus`.
- **Junction entities:** noun-noun, indicating what's being connected. e.g. `scene_character`, `clip_character`, `actor_character_role`.
- **Field names:** `snake_case`. Reference fields are `<target>_id`.
- **Enum values:** lowercase, underscored if multi-word. e.g. `actor_as_character`, `hybrid_generated_extension`.
- **Categories:** human-readable Title Case. e.g. `"Character Depth"`, `"Thematic Tracking"`.

### Notational conventions in documentation

In design documents and worked examples, code blocks may use entity names as shorthand for their integer IDs:

```
character_asset_binding:
  character_id = Snapper
  bundle_id = Snapper-baseline-visual
```

This is shorthand for "the integer id of the character record whose name is currently Snapper" and "the integer id of the bundle whose name is currently Snapper-baseline-visual". The format stores integers; the names are for human readability only. Renaming an entity in its `name` field doesn't break references because the integer ID is stable.

This convention is widely used in the design and workflow documents under `docs/design/`.



---

## Entities

### Category: Project

<a id='category-project'></a>

#### 🎬 `project` — Project

The root container for an SCF story project.

| Meta | Value |
|---|---|
| Plural label | Projects |
| Category | Project |
| Tier | 0 |
| Sort order | 0 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Project Name* — placeholder: e.g. My Feature Film |
| `logline` | textarea |  |  | General | *Logline* — placeholder: A one-sentence summary of the story |
| `genre` | select<br/>options: `Drama`, `Comedy`, `Thriller`, `Sci-Fi`, `Fantasy`, `Horror`, `Action`, `Romance`, `Documentary`, `Animation`, `Western`, `Other` |  |  | General | *Genre* |
| `tone` | text |  |  | General | *Tone* — placeholder: e.g. Dark, whimsical, gritty |
| `setting_period` | text |  |  | General | *Setting / Time Period* — placeholder: e.g. Victorian England, Near-future Tokyo |
| `target_runtime` | integer |  |  | General | *Target Runtime (minutes)* |
| `project_format` | select<br/>options: `Feature`, `Series`, `Short`, `Commercial`, `Other` |  |  | General | *Format* — The form factor of the project |
| `status` | select<br/>options: `Development`, `Pre-Production`, `Production`, `Post-Production`, `Complete` |  | `Development` | General | *Status* |
| `notes` | textarea |  |  | Notes | *Notes* |
| `vision_statement` | textarea |  |  | Vision | *Vision Statement* — The director's overarching vision for this project |
| `creative_philosophy` | textarea |  |  | Vision | *Creative Philosophy* |
| `themes` | json |  |  | Vision | *Core Themes* — placeholder: ["redemption", "identity", "power"] — JSON array of thematic keywords |

**Tabs:** `General`, `Notes`, `Vision`


---

### Category: Story Entities

<a id='category-story-entities'></a>

#### 👤 `character` — Character

A character in the story.

| Meta | Value |
|---|---|
| Plural label | Characters |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 10 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Character Name* — placeholder: e.g. Eleanor Vance |
| `role` | select<br/>options: `Protagonist`, `Antagonist`, `Supporting`, `Minor`, `Background`, `Narrator` |  |  | General | *Role* |
| `archetype` | text |  |  | General | *Archetype* — placeholder: e.g. The Mentor, The Trickster |
| `age` | text |  |  | General | *Age* — placeholder: e.g. 34, Late 20s, Ageless |
| `gender` | text |  |  | General | *Gender* |
| `pronouns` | text |  |  | General | *Pronouns* — placeholder: e.g. he/him, she/her, they/them |
| `occupation` | text |  |  | General | *Occupation* |
| `status` | select<br/>options: `Active`, `Draft`, `Cut`, `Archived` |  | `Active` | General | *Status* |
| `summary` | textarea |  |  | General | *Character Summary* — placeholder: Brief description of who this character is |
| `backstory` | textarea |  |  | Backstory | *Backstory* — placeholder: Key events and history that shaped this character |
| `motivation` | textarea |  |  | Backstory | *Core Motivation* |
| `flaw` | text |  |  | Backstory | *Fatal Flaw* |
| `arc_description` | textarea |  |  | Backstory | *Character Arc* — How does this character change throughout the story? |
| `internal_goal` | textarea |  |  | Backstory | *Internal Goal* — placeholder: What does the character need emotionally/psychologically? |
| `external_goal` | textarea |  |  | Backstory | *External Goal* — placeholder: What is the character actively trying to achieve? |
| `greatest_fear` | textarea |  |  | Backstory | *Greatest Fear* |
| `core_belief` | textarea |  |  | Backstory | *Core Belief* — placeholder: The fundamental belief this character operates from |
| `education_level` | text |  |  | Backstory | *Education Level* |
| `skills_abilities` | textarea |  |  | Backstory | *Skills & Abilities* |
| `height` | text |  |  | Physical | *Height* — placeholder: e.g. 5'10", Tall, Average |
| `build` | select<br/>options: `Slim`, `Athletic`, `Average`, `Stocky`, `Heavy`, `Muscular`, `Frail`, `Other` |  |  | Physical | *Build* |
| `hair` | text |  |  | Physical | *Hair* — placeholder: e.g. Long dark curls |
| `eyes` | text |  |  | Physical | *Eyes* |
| `distinguishing_features` | textarea |  |  | Physical | *Distinguishing Features* |
| `movement_style` | textarea |  |  | Physical | *Movement Style* — How does this character move? Confident stride? Nervous shuffle? |
| `physical_notes` | textarea |  |  | Physical | *Physical Notes* |
| `voice_quality` | text |  |  | Voice | *Voice Quality* — placeholder: e.g. Deep, gravelly, warm |
| `speech_pattern` | textarea |  |  | Voice | *Speech Pattern* — placeholder: e.g. Speaks in short sentences. Avoids contractions. |
| `accent` | text |  |  | Voice | *Accent / Dialect* |
| `vocal_habits` | textarea |  |  | Voice | *Vocal Habits* — placeholder: e.g. Clears throat when nervous, laughs before bad news |
| `relationships_json` | json |  |  | Relationships | *Key Relationships* — placeholder: [{"character": "Marcus", "type": "rival", "notes": "childhood friends turned enemies"}] — JSON array of relationship objects |
| `default_wardrobe` | textarea |  |  | Wardrobe | *Default Wardrobe* — placeholder: Typical outfit and style |
| `wardrobe_notes` | textarea |  |  | Wardrobe | *Wardrobe Notes* |
| `color_associations` | text |  |  | Wardrobe | *Color Associations* — placeholder: e.g. Always wears blue, red appears when angry |

**Tabs:** `General`, `Backstory`, `Physical`, `Voice`, `Relationships`, `Wardrobe`


#### 📍 `location` — Location

A location where story events take place.

| Meta | Value |
|---|---|
| Plural label | Locations |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 20 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Location Name* — placeholder: e.g. The Old Mill |
| `location_type` | select<br/>options: `Interior`, `Exterior`, `Int/Ext`, `Virtual`, `Abstract` |  |  | General | *Type* |
| `setting` | textarea |  |  | General | *Setting Description* — placeholder: What does this place look and feel like? |
| `time_period` | text |  |  | General | *Time Period* |
| `geography` | text |  |  | General | *Geography / Region* — placeholder: e.g. Northern California coast |
| `status` | select<br/>options: `Active`, `Draft`, `Cut`, `Archived` |  | `Active` | General | *Status* |
| `mood` | textarea |  |  | Atmosphere | *Mood / Atmosphere* — placeholder: What feeling does this place evoke? |
| `lighting` | textarea |  |  | Atmosphere | *Lighting* — placeholder: e.g. Harsh fluorescent, Dappled sunlight through canopy |
| `color_palette` | text |  |  | Atmosphere | *Color Palette* — placeholder: e.g. Warm ambers, desaturated greens |
| `time_of_day` | select<br/>options: `Dawn`, `Morning`, `Midday`, `Afternoon`, `Dusk`, `Night`, `Varies` |  |  | Atmosphere | *Typical Time of Day* |
| `weather` | text |  |  | Atmosphere | *Weather* |
| `ambient_sound` | textarea |  |  | Sound | *Ambient Sound* — placeholder: e.g. Distant traffic, birdsong, mechanical hum |
| `sound_notes` | textarea |  |  | Sound | *Sound Design Notes* |
| `key_features` | textarea |  |  | Details | *Key Features* — placeholder: Notable objects, architecture, landmarks within this location |
| `props_present` | textarea |  |  | Details | *Props Typically Present* |
| `notes` | textarea |  |  | Details | *Notes* |

**Tabs:** `General`, `Atmosphere`, `Sound`, `Details`


#### 🔧 `prop` — Prop

A significant object in the story.

| Meta | Value |
|---|---|
| Plural label | Props |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 30 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Prop Name* — placeholder: e.g. The Silver Compass |
| `prop_type` | select<br/>options: `Hand Prop`, `Set Dressing`, `Vehicle`, `Weapon`, `Document`, `Technology`, `Clothing Item`, `Food/Drink`, `Other` |  |  | General | *Type* |
| `description` | textarea |  |  | General | *Description* — placeholder: What does this prop look like? |
| `narrative_significance` | textarea |  |  | General | *Narrative Significance* — placeholder: Why does this prop matter to the story? |
| `story_function` | select<br/>options: `MacGuffin`, `Character Extension`, `Plot Device`, `Symbol`, `Atmosphere`, `Other` |  |  | General | *Story Function* |
| `associated_character` | reference → `character` |  |  | General | *Primary Character* |
| `status` | select<br/>options: `Active`, `Draft`, `Cut`, `Archived` |  | `Active` | General | *Status* |
| `material` | text |  |  | Physical | *Material* — placeholder: e.g. Tarnished silver, worn leather |
| `size` | text |  |  | Physical | *Size* — placeholder: e.g. Palm-sized, 6 feet tall |
| `color` | text |  |  | Physical | *Color* |
| `condition` | text |  |  | Physical | *Condition* — placeholder: e.g. Pristine, battle-worn, ancient |
| `physical_notes` | textarea |  |  | Physical | *Physical Notes* |
| `first_appearance` | textarea |  |  | Story | *First Appearance* — placeholder: When/where does this prop first appear? |
| `key_moments` | textarea |  |  | Story | *Key Moments* — placeholder: Important scenes involving this prop |
| `symbolism` | textarea |  |  | Story | *Symbolism* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Tabs:** `General`, `Physical`, `Story`, `Notes`


---

### Category: Story Structure

<a id='category-story-structure'></a>

#### 🎭 `act` — Act

A major structural division of the story.

| Meta | Value |
|---|---|
| Plural label | Acts |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 30 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Act Name* — placeholder: e.g. Act One, The Setup, Episode 1 Act A |
| `act_number` | integer |  |  | General | *Act Number* — placeholder: Position in the structure: 1, 2, 3... |
| `function` | textarea |  |  | General | *Function* — placeholder: What does this act do in the story? |
| `dramatic_question` | textarea |  |  | General | *Dramatic Question* — placeholder: The central question this act poses |
| `shift` | textarea |  |  | General | *Shift* — placeholder: What changes from the start to the end of this act? |
| `summary` | textarea |  |  | General | *Summary* |
| `status` | select<br/>options: `Outline`, `Draft`, `Revised`, `Locked` |  | `Outline` | General | *Status* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Tabs:** `General`, `Notes`


#### 📑 `sequence` — Sequence

A group of related scenes forming a narrative unit.

| Meta | Value |
|---|---|
| Plural label | Sequences |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 35 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Sequence Name* — placeholder: e.g. The Heist |
| `sequence_number` | integer |  |  | General | *Sequence Number* |
| `act_id` | reference → `act` |  |  | General | *Act* |
| `summary` | textarea |  |  | General | *Summary* |
| `goal` | textarea |  |  | General | *Goal* — placeholder: What is being pursued in this sequence? |
| `conflict` | textarea |  |  | General | *Conflict* — placeholder: What stands in the way? |
| `outcome` | textarea |  |  | General | *Outcome / Resolution* — placeholder: How does the sequence resolve — success, failure, complication? |
| `purpose` | textarea |  |  | General | *Dramatic Purpose* |
| `turning_point` | textarea |  |  | General | *Turning Point* — placeholder: What changes by the end of this sequence? |
| `status` | select<br/>options: `Outline`, `Draft`, `Revised`, `Locked` |  | `Outline` | General | *Status* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Tabs:** `General`, `Notes`


#### 🎬 `scene` — Scene

A single scene in the story.

| Meta | Value |
|---|---|
| Plural label | Scenes |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 40 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Scene Name / Slug* — placeholder: e.g. INT. COFFEE SHOP - MORNING |
| `scene_number` | integer |  |  | General | *Scene Number* |
| `int_ext` | select<br/>options: `Interior`, `Exterior`, `Int/Ext` |  |  | General | *Int/Ext* |
| `location_id` | reference → `location` |  |  | General | *Location* |
| `time_of_day` | select<br/>options: `Dawn`, `Morning`, `Midday`, `Afternoon`, `Dusk`, `Night`, `Continuous` |  |  | General | *Time of Day* |
| `weather_conditions` | text |  |  | General | *Weather* — placeholder: e.g. Heavy rain, clear skies, fog |
| `season` | select<br/>options: `Spring`, `Summer`, `Autumn`, `Winter`, `Unspecified` |  |  | General | *Season* |
| `summary` | textarea |  |  | General | *Scene Summary* — placeholder: What happens in this scene? |
| `purpose` | textarea |  |  | General | *Dramatic Purpose* — placeholder: Why does this scene exist? What does it accomplish? |
| `status` | select<br/>options: `Outline`, `Draft`, `Revised`, `Locked`, `Cut` |  | `Outline` | General | *Status* |
| `character_dynamics` | textarea |  |  | Characters | *Character Dynamics* — placeholder: Key interactions and tensions in this scene |
| `emotional_beat` | textarea |  |  | Emotional | *Emotional Beat* — placeholder: What should the audience feel during this scene? |
| `tone` | text |  |  | Emotional | *Tone* — placeholder: e.g. Tense, comedic, melancholic |
| `tension_level` | integer |  |  | Emotional | *Tension Level (1-10)* |
| `thematic_connection` | textarea |  |  | Emotional | *Thematic Connection* — placeholder: How does this scene connect to the project's themes? |
| `visual_style` | textarea |  |  | Technical | *Visual Style Notes* — placeholder: Camera style, lighting approach, color notes |
| `sound_design` | textarea |  |  | Technical | *Sound Design Notes* |
| `music_notes` | textarea |  |  | Technical | *Music Notes* |
| `estimated_duration` | integer |  |  | Technical | *Estimated Duration (seconds)* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Hidden fields** (not shown in editor UI):

- `characters_present` (json)

**Tabs:** `General`, `Characters`, `Emotional`, `Technical`, `Notes`


#### 🎯 `story_beat` — Story Beat

A discrete narrative unit within a scene — a moment of change.

| Meta | Value |
|---|---|
| Plural label | Story Beats |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 42 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Beat Name* — placeholder: e.g. Eleanor finds the letter |
| `scene_id` | reference → `scene` |  |  | General | *Scene* — Required to be useful — assign before saving. |
| `beat_order` | integer |  |  | General | *Order in Scene* — placeholder: 1, 2, 3... |
| `beat_type` | select<br/>options: `Setup`, `Action`, `Reaction`, `Decision`, `Discovery`, `Revelation`, `Reversal`, `Payoff`, `Other` |  |  | General | *Beat Type* |
| `description` | textarea |  |  | General | *Description* — placeholder: What happens in this beat? |
| `purpose` | textarea |  |  | General | *Purpose* — placeholder: Why does this beat exist? What does it accomplish? |
| `value_shift` | text |  |  | General | *Value Shift* — placeholder: e.g. Hope → Despair, Trust → Doubt |
| `pov_character_id` | reference → `character` |  |  | General | *POV Character* — Whose perspective is this beat from? (optional) |
| `notes` | textarea |  |  | General | *Notes* |


---

### Category: Vision

<a id='category-vision'></a>

#### 💡 `theme` — Theme

A thematic element that runs through the story.

| Meta | Value |
|---|---|
| Plural label | Themes |
| Category | Vision |
| Tier | 0 |
| Sort order | 50 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Theme Name* — placeholder: e.g. Redemption |
| `description` | textarea |  |  | General | *Description* — placeholder: What is this theme about? How does it manifest? |
| `motifs` | json |  |  | General | *Associated Motifs* — placeholder: ["water imagery", "broken mirrors", "dawn/dusk transitions"] |
| `character_connections` | textarea |  |  | General | *Character Connections* — placeholder: Which characters embody or challenge this theme? |
| `scene_connections` | textarea |  |  | General | *Key Scenes* — placeholder: Scenes where this theme is most prominent |
| `evolution` | textarea |  |  | General | *Thematic Evolution* — placeholder: How does this theme develop across the story? |
| `notes` | textarea |  |  | Notes | *Notes* |

**Tabs:** `General`, `Notes`


---

### Category: Connections

<a id='category-connections'></a>

#### 🔗 `scene_character` — Scene-Character

Links a character to a scene with role information.

| Meta | Value |
|---|---|
| Plural label | Scene-Characters |
| Category | Connections |
| Tier | 0 |
| Sort order | 60 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `role_in_scene` | select<br/>options: `Featured`, `Supporting`, `Background`, `Mentioned`, `Voiceover` |  |  | General | *Role in Scene* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `scene_prop` — Scene-Prop

Links a prop to a scene with usage details.

| Meta | Value |
|---|---|
| Plural label | Scene-Props |
| Category | Connections |
| Tier | 0 |
| Sort order | 61 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `usage_note` | text |  |  | General | *Usage Note* |
| `significance` | select<br/>options: `Key`, `Present`, `Background`, `Mentioned` |  |  | General | *Significance* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `scene_sequence` — Scene-Sequence

Links a scene to a sequence with ordering.

| Meta | Value |
|---|---|
| Plural label | Scene-Sequences |
| Category | Connections |
| Tier | 0 |
| Sort order | 62 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `sequence_id` | reference → `sequence` | yes |  | General | *Sequence* |
| `order_in_sequence` | integer |  |  | General | *Order in Sequence* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `costume_scene` — Costume-Scene

Links a costume to the scenes where it appears.

| Meta | Value |
|---|---|
| Plural label | Costume-Scenes |
| Category | Connections |
| Tier | 1 |
| Sort order | 63 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `costume_id` | reference → `costume` | yes |  | General | *Costume* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `condition_in_scene` | text |  |  | General | *Condition in Scene* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `visual_motif_appearance` — Visual Motif Appearance

Where a visual motif manifests (in a location, prop, costume, or scene).

| Meta | Value |
|---|---|
| Plural label | Visual Motif Appearances |
| Category | Connections |
| Tier | 1 |
| Sort order | 64 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `visual_motif_id` | reference → `visual_motif` | yes |  | General | *Visual Motif* |
| `entity_type` | select<br/>options: `Location`, `Prop`, `Costume`, `Scene`, `Shot` |  |  | General | *Entity Type* |
| `entity_id` | integer |  |  | General | *Entity ID* |
| `manifestation_notes` | textarea |  |  | General | *Manifestation Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `motif_manifestation` — Motif Manifestation

Where a conceptual motif manifests in the story.

| Meta | Value |
|---|---|
| Plural label | Motif Manifestations |
| Category | Connections |
| Tier | 1 |
| Sort order | 65 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `conceptual_motif_id` | reference → `conceptual_motif` | yes |  | General | *Conceptual Motif* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `entity_type` | select<br/>options: `Dialogue`, `Action`, `Visual`, `Audio` |  |  | General | *Domain* |
| `entity_id` | integer |  |  | General | *Entity ID* |
| `manifestation_description` | textarea |  |  | General | *Description* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `action_sequence_character` — Action Sequence Character

Links a character to an action sequence.

| Meta | Value |
|---|---|
| Plural label | Action Sequence Characters |
| Category | Connections |
| Tier | 1 |
| Sort order | 66 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `action_sequence_id` | reference → `action_sequence` | yes |  | General | *Action Sequence* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `role_in_action` | text |  |  | General | *Role in Action* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `asset_relationship` — Asset Relationship

Links an asset to any entity in the project.

| Meta | Value |
|---|---|
| Plural label | Asset Relationships |
| Category | Connections |
| Tier | 1 |
| Sort order | 67 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `asset_id` | reference → `asset` | yes |  | General | *Asset* |
| `entity_type` | text | yes |  | General | *Entity Type* — placeholder: e.g. character, location, costume |
| `entity_id` | integer | yes |  | General | *Entity ID* |
| `relationship_type` | select<br/>options: `Reference For`, `Concept Of`, `Generated From`, `Variant Of` |  |  | General | *Relationship Type* |
| `context_notes` | textarea |  |  | General | *Context Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


---

### Category: Creative Direction

<a id='category-creative-direction'></a>

#### 🔭 `project_vision` — Project Vision

Overarching creative intent — why this story, what it means, what it should accomplish.

| Meta | Value |
|---|---|
| Plural label | Project Vision |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 100 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Project Vision` | General | *Name* — placeholder: Project Vision |
| `vision_statement` | textarea |  |  | General | *Vision Statement* — placeholder: Concise articulation of what the film is fundamentally about |
| `core_question` | textarea |  |  | General | *Core Question* — placeholder: The central question the film explores |
| `intended_audience_impact` | textarea |  |  | General | *Intended Audience Impact* — placeholder: What the film is trying to make the audience feel/think/understand |
| `unique_perspective` | textarea |  |  | General | *Unique Perspective* — placeholder: What angle this film brings to its subject |
| `why_tell_this_story` | textarea |  |  | General | *Why Tell This Story* — placeholder: Why this story needs to be told now |
| `what_makes_different` | textarea |  |  | General | *What Makes It Different* — placeholder: How it differs from others in its genre |
| `success_criteria` | textarea |  |  | General | *Success Criteria* — placeholder: What would make this film successful beyond metrics |
| `personal_resonance` | textarea |  |  | Personal | *Personal Resonance* — placeholder: Autobiographical elements, life experiences that connect |
| `emotional_stakes` | textarea |  |  | Personal | *Emotional Stakes for Director* |
| `artistic_growth_goals` | textarea |  |  | Personal | *Artistic Growth Goals* — placeholder: What new territory this project explores |

**Tabs:** `General`, `Personal`


#### 🎯 `directorial_philosophy` — Directorial Philosophy

The director's approach to filmmaking on this project.

| Meta | Value |
|---|---|
| Plural label | Directorial Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 101 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Directorial Philosophy` | General | *Name* |
| `filmmaking_philosophy` | select<br/>options: `Auteur`, `Collaborative`, `Actor-Focused`, `Visual-First`, `Story-First`, `Experiential` |  |  | General | *Filmmaking Philosophy* |
| `technical_approach` | select<br/>options: `Naturalistic`, `Stylized`, `Mixed` |  |  | General | *Technical Approach* |
| `aesthetic_priorities` | json |  |  | General | *Aesthetic Priorities* — placeholder: ["performance", "cinematography", "editing", "sound"] — Ordered list — what matters most |
| `risk_tolerance` | select<br/>options: `Safe/Commercial`, `Experimental`, `Balanced` |  |  | General | *Risk Tolerance* |
| `audience_relationship` | select<br/>options: `Accessible`, `Challenging`, `Hybrid` |  |  | General | *Audience Relationship* |


#### ⚙️ `technical_specs` — Technical Specs

Technical format specifications for the project.

| Meta | Value |
|---|---|
| Plural label | Technical Specs |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 102 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Technical Specs` | General | *Name* |
| `aspect_ratio` | select<br/>options: `1.33:1 (Academy)`, `1.66:1`, `1.78:1 (16:9)`, `1.85:1 (Flat)`, `2.00:1 (Univisium)`, `2.20:1 (70mm)`, `2.35:1 (Scope)`, `2.39:1 (Anamorphic)`, `2.76:1 (Ultra Panavision)`, `Variable`, `Other` |  |  | General | *Aspect Ratio* |
| `resolution` | select<br/>options: `2K (2048x1080)`, `2.8K`, `3.4K`, `4K (4096x2160)`, `4.6K`, `5.7K`, `6K`, `6.5K`, `8K`, `Other` |  |  | General | *Resolution* |
| `frame_rate` | select<br/>options: `23.976 fps`, `24 fps`, `25 fps`, `29.97 fps`, `30 fps`, `48 fps`, `60 fps`, `Variable`, `Other` |  |  | General | *Frame Rate* |
| `color_space` | text |  |  | General | *Color Space / Gamut* — placeholder: e.g. Rec.709, DCI-P3, ACES, Rec.2020 |
| `recording_codec` | text |  |  | General | *Recording Codec* — placeholder: e.g. ARRIRAW, ProRes 4444, REDCODE |
| `delivery_format` | text |  |  | General | *Delivery Format* — placeholder: e.g. DCP 2K Scope, ProRes HQ 4K |
| `audio_format` | text |  |  | General | *Audio Format* — placeholder: e.g. 5.1 Surround, Dolby Atmos, Stereo |


#### 👁️ `visual_identity` — Visual Identity

Overarching aesthetic vision — the film's visual DNA.

| Meta | Value |
|---|---|
| Plural label | Visual Identity |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 103 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Visual Identity` | General | *Name* |
| `visual_statement` | textarea |  |  | General | *Visual Statement* — placeholder: Concise articulation of the film's look |
| `aesthetic_genre` | select<br/>options: `Naturalistic`, `Stylized`, `Hyperreal`, `Expressionistic`, `Fantastical`, `Hybrid` |  |  | General | *Aesthetic Genre* |
| `design_era` | text |  |  | General | *Design Era / Period* — placeholder: e.g. 1970s New York, Near-future, Timeless |
| `visual_density` | select<br/>options: `Minimalist`, `Moderate`, `Dense`, `Maximalist` |  |  | General | *Visual Density* |
| `textural_philosophy` | select<br/>options: `Clean/Pristine`, `Lived-In`, `Weathered`, `Decayed` |  |  | General | *Textural Philosophy* |
| `visual_influences` | json |  |  | Influences | *Visual Influences* — placeholder: ["Edward Hopper paintings", "1970s paranoia thrillers", "Japanese wabi-sabi"] — Art movements, films, photographers, cultural references |

**Tabs:** `General`, `Influences`


#### 🎥 `cinematographic_philosophy` — Cinematographic Philosophy

Overall approach to camera, movement, and visual storytelling.

| Meta | Value |
|---|---|
| Plural label | Cinematographic Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 104 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Cinematographic Philosophy` | General | *Name* |
| `camera_personality` | select<br/>options: `Objective Observer`, `Subjective Participant`, `Omniscient Presence`, `Character-Aligned` |  |  | General | *Camera Personality* |
| `movement_philosophy` | select<br/>options: `Static`, `Fluid`, `Motivated`, `Expressive` |  |  | General | *Movement Philosophy* |
| `framing_philosophy` | select<br/>options: `Classical`, `Dynamic`, `Intimate`, `Epic` |  |  | General | *Framing Philosophy* |
| `visual_consistency` | select<br/>options: `Unified`, `Varied`, `Evolving` |  |  | General | *Visual Consistency* |


#### 🎨 `project_color_palette` — Project Color Palette

Overall color scheme and color rules for the entire project.

| Meta | Value |
|---|---|
| Plural label | Project Color Palette |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 105 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Project Color Palette` | General | *Name* |
| `primary_colors` | json |  |  | General | *Primary Colors (3-5)* — placeholder: [{"hex": "#2C3E50", "name": "Midnight Blue"}, {"hex": "#E74C3C", "name": "Alizarin"}] |
| `secondary_colors` | json |  |  | General | *Secondary Colors* — placeholder: [{"hex": "#95A5A6", "name": "Silver"}] |
| `accent_colors` | json |  |  | General | *Accent Colors* — placeholder: [{"hex": "#F39C12", "name": "Amber"}] |
| `restricted_colors` | json |  |  | General | *Restricted Colors* — placeholder: [{"hex": "#FF0000", "name": "Pure Red", "context": "reserved for blood"}] — Colors to avoid or reserve for specific contexts |
| `saturation_philosophy` | select<br/>options: `Highly Saturated`, `Desaturated`, `Mixed`, `Neutral-Heavy` |  |  | General | *Saturation Philosophy* |
| `value_structure` | select<br/>options: `High Key`, `Low Key`, `Full Range`, `Compressed` |  |  | General | *Value Structure* |
| `color_evolution` | textarea |  |  | Evolution | *Color Evolution by Act* — placeholder: How the palette shifts through the story |
| `color_relationships` | textarea |  |  | Evolution | *Color Relationships* — placeholder: Complementary pairs, temperature contrasts, etc. |

**Tabs:** `General`, `Evolution`


#### 🌡️ `project_tone` — Project Tone

Overall tonal identity — the emotional temperature of the film.

| Meta | Value |
|---|---|
| Plural label | Project Tone |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 106 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Project Tone` | General | *Name* |
| `primary_tone` | text |  |  | General | *Primary Tone* — placeholder: e.g. Dramatic, Comedic, Thriller, Contemplative |
| `tone_blend` | json |  |  | General | *Tone Blend* — placeholder: [{"tone": "Drama", "ratio": 60}, {"tone": "Dark Comedy", "ratio": 30}] — Genre tones present with approximate ratios |
| `lightest_moment` | textarea |  |  | General | *Lightest Moments* — placeholder: How light can the film get? |
| `darkest_moment` | textarea |  |  | General | *Darkest Moments* — placeholder: How dark can the film get? |
| `tonal_consistency` | select<br/>options: `Unified`, `Varied`, `Shifting` |  |  | General | *Tonal Consistency* |
| `reference_touchstones` | textarea |  |  | General | *Reference Touchstones* — placeholder: Other films with similar tone — what to emulate and avoid |


#### ⏱️ `pacing_strategy` — Pacing Strategy

Rhythm and timing philosophy at the story level.

| Meta | Value |
|---|---|
| Plural label | Pacing Strategy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 107 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Pacing Strategy` | General | *Name* |
| `overall_pacing` | select<br/>options: `Slow/Contemplative`, `Moderate/Balanced`, `Fast/Urgent`, `Variable/Dynamic` |  |  | General | *Overall Pacing* |
| `pacing_philosophy` | textarea |  |  | General | *Pacing Philosophy* — placeholder: What earns slow moments? What earns fast moments? |
| `breathing_room_strategy` | textarea |  |  | General | *Breathing Room Strategy* — placeholder: How and when to give the audience space to process |
| `key_acceleration_points` | textarea |  |  | General | *Key Acceleration Points* — placeholder: Where pacing deliberately speeds up |
| `key_deceleration_points` | textarea |  |  | General | *Key Deceleration Points* — placeholder: Where pacing deliberately slows down |


#### 🔊 `sonic_identity` — Sonic Identity

Overall approach to the film's sound world.

| Meta | Value |
|---|---|
| Plural label | Sonic Identity |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 108 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Sonic Identity` | General | *Name* |
| `sound_aesthetic` | select<br/>options: `Naturalistic`, `Heightened`, `Stylized`, `Surreal` |  |  | General | *Sound Aesthetic* |
| `sonic_density` | select<br/>options: `Sparse`, `Moderate`, `Dense`, `Overwhelming` |  |  | General | *Sonic Density* |
| `silence_philosophy` | textarea |  |  | General | *Silence Philosophy* — placeholder: How silence is used, when silence matters |
| `subjective_sound_approach` | textarea |  |  | General | *Subjective Sound Approach* — placeholder: When and how we hear a character's perspective |
| `sound_evolution` | textarea |  |  | General | *Sound Evolution* — placeholder: How the sonic world changes through the story |


#### 🎵 `musical_identity` — Musical Identity

Overall approach to the film's music and score.

| Meta | Value |
|---|---|
| Plural label | Musical Identity |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 109 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Musical Identity` | General | *Name* |
| `score_approach` | select<br/>options: `Traditional Orchestral`, `Electronic/Synthesized`, `Hybrid`, `Acoustic/Intimate`, `Genre-Specific` |  |  | General | *Score Approach* |
| `musical_tone` | select<br/>options: `Emotional Support`, `Counterpoint`, `Commentary`, `Neutral/Ambient` |  |  | General | *Musical Tone* |
| `instrumentation_palette` | textarea |  |  | General | *Instrumentation Palette* — placeholder: Primary, secondary, and signature instruments |
| `score_density` | select<br/>options: `Wall-to-Wall`, `Selective`, `Sparse` |  |  | General | *Score Density* |
| `source_music_approach` | textarea |  |  | General | *Source Music Approach* — placeholder: Approach to diegetic music — how source relates to score |


#### 📐 `design_constraints` — Design Constraints

Intentional boundaries that shape the visual world.

| Meta | Value |
|---|---|
| Plural label | Design Constraints |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 110 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Design Constraints` | General | *Name* |
| `allowed_materials` | json |  |  | General | *Allowed Materials* — placeholder: ["natural wood", "raw concrete", "rusted metal"] |
| `forbidden_materials` | json |  |  | General | *Forbidden Materials* — placeholder: ["chrome", "neon", "plastic"] |
| `dominant_materials` | text |  |  | General | *Dominant Materials* — placeholder: Most prevalent materials in the world |
| `technology_level` | text |  |  | General | *Technology Level* — placeholder: What technology exists in this world |
| `technology_aesthetic` | text |  |  | General | *Technology Aesthetic* — placeholder: How technology looks and feels |
| `architectural_styles` | text |  |  | General | *Architectural Styles* |
| `scale_rules` | select<br/>options: `Human Scale`, `Intimate`, `Monumental`, `Mixed` |  |  | General | *Scale Rules* |
| `geometric_language` | select<br/>options: `Organic`, `Angular`, `Mixed` |  |  | General | *Geometric Language* |
| `lighting_constraints` | textarea |  |  | General | *Lighting Constraints* — placeholder: Available light sources, stylization rules |


#### 🖼️ `look_development` — Look Development

Target visual look for the final image — grading and post direction.

| Meta | Value |
|---|---|
| Plural label | Look Development |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 111 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Look Development` | General | *Name* |
| `contrast` | select<br/>options: `Flat`, `Normal`, `High` |  |  | General | *Contrast* |
| `saturation` | select<br/>options: `Desaturated`, `Normal`, `Vivid` |  |  | General | *Saturation* |
| `color_bias` | select<br/>options: `Warm`, `Cool`, `Neutral`, `Tinted` |  |  | General | *Color Bias* |
| `highlight_handling` | select<br/>options: `Preserved`, `Blown`, `Rolled-Off` |  |  | General | *Highlight Handling* |
| `shadow_handling` | select<br/>options: `Crushed`, `Lifted`, `Detailed` |  |  | General | *Shadow Handling* |
| `grain_texture` | select<br/>options: `Clean`, `Subtle Grain`, `Heavy Grain` |  |  | General | *Grain / Texture* |
| `on_set_lut` | text |  |  | LUTs | *On-Set LUT* |
| `editorial_lut` | text |  |  | LUTs | *Editorial LUT* |
| `final_grade_foundation` | textarea |  |  | LUTs | *Final Grade Foundation* |
| `reference_images` | textarea |  |  | References | *Reference Images / Notes* |

**Tabs:** `General`, `LUTs`, `References`


#### 📹 `coverage_philosophy` — Coverage Philosophy

Approach to shooting and editorial coverage.

| Meta | Value |
|---|---|
| Plural label | Coverage Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 112 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Coverage Philosophy` | General | *Name* |
| `coverage_style` | select<br/>options: `Master + Coverage`, `Single Camera`, `Multi-Camera`, `Oner/Long Take`, `Run-and-Gun`, `Shot-List Driven` |  |  | General | *Coverage Style* |
| `editorial_approach` | select<br/>options: `Cut-Friendly`, `In-Camera Editing`, `Improvised` |  |  | General | *Editorial Approach* |
| `coverage_priorities` | textarea |  |  | General | *Coverage Priorities* |


#### 👗 `costume_design_philosophy` — Costume Design Philosophy

Overall approach to wardrobe and costume design.

| Meta | Value |
|---|---|
| Plural label | Costume Design Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 113 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Costume Design Philosophy` | General | *Name* |
| `design_approach` | select<br/>options: `Period-Accurate`, `Period-Inspired`, `Contemporary`, `Timeless`, `Stylized`, `Fantastical` |  |  | General | *Design Approach* |
| `silhouette_strategy` | textarea |  |  | General | *Silhouette Strategy* — placeholder: Dominant silhouettes, character differentiation through shape |
| `fabric_philosophy` | select<br/>options: `Natural`, `Synthetic`, `Mixed` |  |  | General | *Fabric Philosophy* |
| `formality_spectrum` | textarea |  |  | General | *Formality Spectrum* |
| `condition_philosophy` | textarea |  |  | General | *Condition Philosophy* — placeholder: Pristine to distressed — how wardrobe shows wear |


#### 🧱 `material_palette` — Material Palette

Dominant materials and textures in the film's world.

| Meta | Value |
|---|---|
| Plural label | Material Palette |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 114 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Material Palette` | General | *Name* |
| `primary_materials` | json |  |  | General | *Primary Materials* — placeholder: ["weathered oak", "tarnished brass", "raw linen"] |
| `secondary_materials` | json |  |  | General | *Secondary Materials* |
| `accent_materials` | json |  |  | General | *Accent Materials* |
| `forbidden_materials` | json |  |  | General | *Forbidden Materials* |
| `material_storytelling` | textarea |  |  | General | *Material Storytelling* — placeholder: What materials reveal about characters and world |


#### 🪨 `texture_philosophy` — Texture Philosophy

Approach to surface quality throughout the film.

| Meta | Value |
|---|---|
| Plural label | Texture Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 115 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Texture Philosophy` | General | *Name* |
| `texture_spectrum` | select<br/>options: `Smooth Dominance`, `Rough Dominance`, `Mixed` |  |  | General | *Texture Spectrum* |
| `texture_contrast_strategy` | textarea |  |  | General | *Texture Contrast Strategy* |
| `surface_finish_preference` | textarea |  |  | General | *Surface Finish Preference* |
| `patina_aging_approach` | textarea |  |  | General | *Patina & Aging Approach* |


#### 🌡️ `color_temperature_strategy` — Color Temperature Strategy

Warm/cool distribution across the story.

| Meta | Value |
|---|---|
| Plural label | Color Temperature Strategy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 116 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Color Temperature Strategy` | General | *Name* |
| `overall_approach` | select<br/>options: `Warm`, `Cool`, `Balanced`, `Journey` |  |  | General | *Overall Approach* |
| `warm_associations` | textarea |  |  | General | *Warm Associations* — placeholder: What warm tones mean in this story |
| `cool_associations` | textarea |  |  | General | *Cool Associations* — placeholder: What cool tones mean in this story |
| `temperature_contrast_points` | textarea |  |  | General | *Temperature Contrast Points* |
| `day_scene_temperature` | text |  |  | General | *Day Scene Temperature* |
| `night_scene_temperature` | text |  |  | General | *Night Scene Temperature* |


---

### Category: Character Depth

<a id='category-character-depth'></a>

#### 🤝 `character_relationship` — Character Relationship

Relationship between two characters with dynamics and evolution.

| Meta | Value |
|---|---|
| Plural label | Character Relationships |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 200 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Relationship Label* — placeholder: e.g. Father/Son, Rivals |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` | yes |  | General | *Character B* |
| `relationship_type` | select<br/>options: `Family`, `Friend`, `Enemy`, `Lover`, `Colleague`, `Mentor/Mentee`, `Rival`, `Authority`, `Other` |  |  | General | *Type* |
| `specific_relationship` | text |  |  | General | *Specific Relationship* — placeholder: e.g. estranged brothers, childhood sweethearts |
| `emotional_valence` | select<br/>options: `Positive`, `Negative`, `Complex`, `Neutral` |  |  | General | *Emotional Valence* |
| `power_dynamic` | textarea |  |  | General | *Power Dynamic* |
| `relationship_arc` | textarea |  |  | General | *Relationship Arc* — placeholder: How does this relationship change through the story? |
| `history` | textarea |  |  | Background | *History* |
| `current_status` | text |  |  | Background | *Current Status* |

**Tabs:** `General`, `Background`


#### 🎨 `character_color_identity` — Character Color Identity

Signature color language for a character.

| Meta | Value |
|---|---|
| Plural label | Character Color Identities |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 201 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Color Identity |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `primary_color_hex` | text |  |  | General | *Primary Color (hex)* — placeholder: #2C3E50 |
| `primary_color_name` | text |  |  | General | *Primary Color Name* — placeholder: e.g. Midnight Blue |
| `secondary_colors` | json |  |  | General | *Secondary Colors* — placeholder: [{"hex": "#7F8C8D", "name": "Concrete Gray"}] |
| `how_manifests` | select<br/>options: `Wardrobe`, `Accessories`, `Environment`, `Lighting`, `Multiple` |  |  | General | *How Colors Manifest* |
| `why_these_colors` | textarea |  |  | General | *Why These Colors* — placeholder: Personality, plot, or thematic reasons for this palette |
| `consistency_level` | select<br/>options: `Always`, `Usually`, `Accent Only`, `Metaphor Only` |  |  | General | *Consistency Level* |
| `starting_colors` | text |  |  | Evolution | *Starting Colors* |
| `midpoint_shift` | text |  |  | Evolution | *Midpoint Shift* |
| `final_colors` | text |  |  | Evolution | *Final Colors* |
| `color_isolation` | select<br/>options: `Unique to Character`, `Shared`, `Contrasting with Another` |  |  | Evolution | *Color Isolation* |

**Tabs:** `General`, `Evolution`


#### 🏃 `physical_character_profile` — Physical Character Profile

Baseline physical existence — posture, movement, tension, energy.

| Meta | Value |
|---|---|
| Plural label | Physical Character Profiles |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 202 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Physicality |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `posture` | select<br/>options: `Upright`, `Slouched`, `Rigid`, `Relaxed`, `Asymmetric` |  |  | General | *Posture* |
| `center_of_gravity` | select<br/>options: `High`, `Low`, `Forward`, `Back` |  |  | General | *Center of Gravity* |
| `tension_level` | select<br/>options: `Tense`, `Relaxed`, `Variable` |  |  | General | *Physical Tension Level* |
| `energy_quality` | select<br/>options: `Kinetic`, `Still`, `Restless`, `Contained` |  |  | General | *Energy Quality* |
| `movement_speed` | select<br/>options: `Quick`, `Slow`, `Deliberate`, `Erratic` |  |  | Movement | *Movement Speed* |
| `movement_fluidity` | select<br/>options: `Smooth`, `Jerky`, `Graceful`, `Awkward` |  |  | Movement | *Movement Fluidity* |
| `movement_economy` | select<br/>options: `Efficient`, `Wasteful`, `Precise`, `Sloppy` |  |  | Movement | *Movement Economy* |
| `movement_weight` | select<br/>options: `Light`, `Heavy`, `Grounded`, `Floating` |  |  | Movement | *Movement Weight* |
| `spatial_presence` | select<br/>options: `Takes Up Space`, `Minimizes Self` |  |  | Presence | *Spatial Presence* |
| `physical_comfort` | select<br/>options: `At Home in Body`, `Disconnected` |  |  | Presence | *Physical Comfort* |
| `coordination_level` | text |  |  | Presence | *Coordination Level* |
| `physical_training_visible` | textarea |  |  | History | *Physical Training Visible* — placeholder: e.g. Athlete, dancer, soldier — how it shows |
| `physical_neglect_visible` | textarea |  |  | History | *Physical Neglect Visible* |
| `injuries_visible_in_movement` | textarea |  |  | History | *Injuries Visible in Movement* |

**Tabs:** `General`, `Movement`, `Presence`, `History`


#### 🗣️ `vocal_profile` — Vocal Profile

Baseline vocal identity — how a character sounds.

| Meta | Value |
|---|---|
| Plural label | Vocal Profiles |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 203 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Voice |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `pitch_range` | select<br/>options: `High`, `Low`, `Middle`, `Variable` |  |  | General | *Pitch Range* |
| `timbre` | select<br/>options: `Warm`, `Nasal`, `Resonant`, `Thin`, `Gravelly` |  |  | General | *Timbre* |
| `volume_tendency` | select<br/>options: `Loud`, `Soft`, `Variable` |  |  | General | *Volume Tendency* |
| `breathiness_level` | select<br/>options: `None`, `Slight`, `Moderate`, `Heavy` |  |  | General | *Breathiness* |
| `pace` | select<br/>options: `Fast`, `Slow`, `Measured`, `Variable` |  |  | Speech | *Pace* |
| `rhythm` | select<br/>options: `Regular`, `Syncopated`, `Halting` |  |  | Speech | *Rhythm* |
| `articulation` | select<br/>options: `Precise`, `Mumbled`, `Clipped`, `Drawled` |  |  | Speech | *Articulation* |
| `fluency` | select<br/>options: `Smooth`, `Stuttered`, `Filled Pauses` |  |  | Speech | *Fluency* |
| `regional_markers` | text |  |  | Accent | *Regional Markers* — placeholder: e.g. Southern US, Cockney, Midwestern |
| `class_markers` | text |  |  | Accent | *Class Markers* |
| `educational_markers` | text |  |  | Accent | *Educational Markers* |
| `accent_authenticity` | select<br/>options: `Native`, `Acquired`, `Affected` |  |  | Accent | *Accent Authenticity* |
| `filler_words` | json |  |  | Habits | *Filler Words* — placeholder: ["like", "um", "you know"] |
| `catch_phrases` | json |  |  | Habits | *Catch Phrases* — placeholder: ["fair enough", "listen here"] |
| `verbal_tics` | json |  |  | Habits | *Verbal Tics* — placeholder: ["clears throat before lying", "trailing off when unsure"] |

**Tabs:** `General`, `Speech`, `Accent`, `Habits`


#### 🎭 `delivery_profile` — Delivery Profile

How a character generally delivers lines — style, access, subtext.

| Meta | Value |
|---|---|
| Plural label | Delivery Profiles |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 204 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Delivery |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `delivery_style` | select<br/>options: `Naturalistic`, `Theatrical`, `Minimalist`, `Mannered` |  |  | General | *Delivery Style* |
| `emotional_access` | select<br/>options: `Available`, `Controlled`, `Variable` |  |  | General | *Emotional Access* |
| `subtext_playing` | select<br/>options: `Plays Clearly`, `Hides`, `Unaware` |  |  | General | *Subtext Playing* |
| `listening_behavior` | textarea |  |  | General | *Listening Behavior* — placeholder: How character listens — active, distracted, evaluating |
| `interruption_tendencies` | textarea |  |  | General | *Interruption Tendencies* |


#### 😐 `facial_expression_profile` — Facial Expression Profile

Face as performance instrument — baseline expressions, eye/mouth behavior.

| Meta | Value |
|---|---|
| Plural label | Facial Expression Profiles |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 205 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Expressions |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `resting_face` | textarea |  |  | General | *Resting Face* — placeholder: What does the face do naturally at rest? |
| `expressiveness_level` | select<br/>options: `Mobile`, `Controlled`, `Flat` |  |  | General | *Expressiveness Level* |
| `asymmetries` | text |  |  | General | *Asymmetries* |
| `eye_contact_patterns` | textarea |  |  | Eyes | *Eye Contact Patterns* — placeholder: Holds, avoids, challenges |
| `gaze_direction_tendencies` | textarea |  |  | Eyes | *Gaze Direction Tendencies* |
| `blink_rate_variations` | text |  |  | Eyes | *Blink Rate Variations* |
| `mouth_tension_patterns` | textarea |  |  | Mouth | *Mouth Tension Patterns* |
| `smile_authenticity` | textarea |  |  | Mouth | *Smile Authenticity* — placeholder: Genuine vs performed, asymmetric, delayed |

**Tabs:** `General`, `Eyes`, `Mouth`


#### 👤 `character_appearance_profile` — Character Appearance Profile

Complete visual design — silhouette, distinction, evolution.

| Meta | Value |
|---|---|
| Plural label | Character Appearance Profiles |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 206 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Appearance |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `body_type` | text |  |  | General | *Body Type* |
| `height_proportions` | text |  |  | General | *Height / Proportions* |
| `age_appearance` | text |  |  | General | *Age Appearance* — placeholder: How old do they look (may differ from actual age)? |
| `skin_tone` | text |  |  | Appearance | *Skin Tone* |
| `grooming_level` | text |  |  | Appearance | *Grooming Level* |
| `visual_distinction` | textarea |  |  | Identity | *Visual Distinction* — placeholder: What makes this character visually distinct at a glance? |
| `silhouette_description` | textarea |  |  | Identity | *Silhouette Description* — placeholder: Recognizable shape in outline |
| `visual_shorthand` | textarea |  |  | Identity | *Visual Shorthand* — placeholder: Instant visual read — what do you see first? |
| `appearance_evolution` | textarea |  |  | Evolution | *Appearance Evolution* — placeholder: How appearance changes through the story and what changes signify |

**Tabs:** `General`, `Appearance`, `Identity`, `Evolution`


#### 👔 `costume` — Costume

A specific wardrobe look for a character.

| Meta | Value |
|---|---|
| Plural label | Costumes |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 207 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Costume Name* — placeholder: e.g. Eleanor's Work Outfit, Marcus's Disguise |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `description` | textarea |  |  | General | *Description* |
| `silhouette` | text |  |  | General | *Silhouette* |
| `key_garments` | json |  |  | General | *Key Garments* — placeholder: ["navy wool overcoat", "white cotton shirt", "brown leather boots"] |
| `layers` | textarea |  |  | General | *Layers* |
| `accessories` | json |  |  | General | *Accessories* — placeholder: ["pocket watch", "leather satchel"] |
| `primary_color_hex` | text |  |  | Color | *Primary Color (hex)* — placeholder: #2C3E50 |
| `primary_color_name` | text |  |  | Color | *Primary Color Name* |
| `secondary_colors` | json |  |  | Color | *Secondary Colors* |
| `fabrics` | textarea |  |  | Material | *Fabrics* |
| `texture_qualities` | textarea |  |  | Material | *Texture Qualities* |
| `condition` | select<br/>options: `New`, `Worn`, `Distressed` |  |  | Narrative | *Condition* |
| `what_reveals` | textarea |  |  | Narrative | *What It Reveals* — placeholder: What does this costume say about the character? |
| `emotional_state_reflected` | textarea |  |  | Narrative | *Emotional State Reflected* |
| `social_signals` | textarea |  |  | Narrative | *Social/Economic Signals* |
| `continuity_notes` | textarea |  |  | Notes | *Continuity Notes* |

**Tabs:** `General`, `Color`, `Material`, `Narrative`, `Notes`


#### 📈 `costume_progression` — Costume Progression

How wardrobe evolves through the story arc.

| Meta | Value |
|---|---|
| Plural label | Costume Progressions |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 208 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Wardrobe Arc |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `starting_wardrobe` | textarea |  |  | General | *Starting Wardrobe* |
| `starting_meaning` | textarea |  |  | General | *Starting Meaning* |
| `progression_stages` | json |  |  | General | *Progression Stages* — placeholder: [{"trigger": "job loss", "change": "formality drops", "meaning": "masks falling"}] |
| `color_evolution` | textarea |  |  | General | *Color Evolution* |
| `formality_evolution` | textarea |  |  | General | *Formality Evolution* |
| `condition_evolution` | textarea |  |  | General | *Condition Evolution* |
| `symbolic_meaning` | textarea |  |  | General | *Symbolic Meaning* |


#### 💇 `makeup_hair_design` — Makeup & Hair Design

Non-costume appearance: makeup, hair, prosthetics.

| Meta | Value |
|---|---|
| Plural label | Makeup & Hair Designs |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 209 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor - Baseline, Eleanor - Post-Fight |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene (if scene-specific)* |
| `makeup_approach` | select<br/>options: `Naturalistic`, `Beauty`, `Character`, `Special Effects` |  |  | General | *Makeup Approach* |
| `makeup_details` | textarea |  |  | General | *Makeup Details* |
| `hair_style` | text |  |  | Hair | *Hair Style* |
| `hair_condition` | text |  |  | Hair | *Hair Condition* |
| `hair_notes` | textarea |  |  | Hair | *Hair Notes* |
| `prosthetics` | textarea |  |  | Effects | *Prosthetics* |
| `aging_effects` | textarea |  |  | Effects | *Aging Effects* |
| `injury_effects` | textarea |  |  | Effects | *Injury Effects* |

**Tabs:** `General`, `Hair`, `Effects`


#### 🔀 `character_variant` — Character Variant

Specific state or version of a character (e.g. Young Eleanor, Angry Marcus).

| Meta | Value |
|---|---|
| Plural label | Character Variants |
| Category | Character Depth |
| Tier | 1 |
| Sort order | 210 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Variant Name* — placeholder: e.g. Young Eleanor, Marcus in Disguise |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `emotional_state` | textarea |  |  | General | *Emotional State* |
| `context` | textarea |  |  | General | *Context* — placeholder: When/why this variant appears |
| `duration_type` | select<br/>options: `Temporary`, `Permanent` |  |  | General | *Duration* |


---

### Category: Location Depth

<a id='category-location-depth'></a>

#### 🏗️ `location_design` — Location Design

Detailed visual design — architecture, materials, spatial layout.

| Meta | Value |
|---|---|
| Plural label | Location Designs |
| Category | Location Depth |
| Tier | 1 |
| Sort order | 300 |
| Parent entity | `location` via `location_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. The Old Mill — Design |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `design_concept` | textarea |  |  | General | *Design Concept* — placeholder: Core design idea for this location |
| `visual_metaphor` | textarea |  |  | General | *Visual Metaphor* — placeholder: What does this place represent visually? |
| `emotional_target` | textarea |  |  | General | *Emotional Target* — placeholder: What feeling should this location evoke? |
| `period_style` | text |  |  | Architecture | *Period / Style* |
| `condition` | select<br/>options: `Pristine`, `Maintained`, `Neglected`, `Ruined` |  |  | Architecture | *Condition* |
| `scale` | select<br/>options: `Intimate`, `Domestic`, `Commercial`, `Monumental` |  |  | Architecture | *Scale* |
| `geometry` | select<br/>options: `Organic`, `Angular`, `Chaotic`, `Ordered` |  |  | Architecture | *Geometry* |
| `dominant_materials` | textarea |  |  | Materials | *Dominant Materials* |
| `secondary_materials` | textarea |  |  | Materials | *Secondary Materials* |
| `texture_quality` | textarea |  |  | Materials | *Texture Quality* |
| `surface_finish` | textarea |  |  | Materials | *Surface Finish* |
| `spatial_description` | textarea |  |  | Spatial | *Spatial Layout* |
| `sight_lines` | textarea |  |  | Spatial | *Sight Lines* |
| `key_focal_points` | textarea |  |  | Spatial | *Key Focal Points* |
| `natural_light_sources` | textarea |  |  | Lighting | *Natural Light Sources* |
| `practical_light_sources` | textarea |  |  | Lighting | *Practical Light Sources* |
| `light_quality` | textarea |  |  | Lighting | *Light Quality* |

**Tabs:** `General`, `Architecture`, `Materials`, `Spatial`, `Lighting`


#### 🔀 `location_variant` — Location Variant

Modified state of a location (e.g. Night version, After fire).

| Meta | Value |
|---|---|
| Plural label | Location Variants |
| Category | Location Depth |
| Tier | 1 |
| Sort order | 301 |
| Parent entity | `location` via `location_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Variant Name* — placeholder: e.g. Warehouse - Night, Apartment - After Fire |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `lighting_differences` | textarea |  |  | General | *Lighting Differences* |
| `emotional_shift` | textarea |  |  | General | *Emotional Shift* |
| `time_context` | textarea |  |  | General | *Time / Story Context* |


#### 🎨 `location_color_scheme` — Location Color Scheme

Color palette and atmosphere for a specific location.

| Meta | Value |
|---|---|
| Plural label | Location Color Schemes |
| Category | Location Depth |
| Tier | 1 |
| Sort order | 302 |
| Parent entity | `location` via `location_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. The Old Mill — Colors |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `dominant_colors` | json |  |  | General | *Dominant Colors* — placeholder: [{"hex": "#8B7355", "name": "Aged Oak"}] |
| `color_motivation` | select<br/>options: `Period`, `Character`, `Symbolic`, `Practical` |  |  | General | *Color Motivation* |
| `color_atmosphere` | select<br/>options: `Warm`, `Cool`, `Neutral`, `Colorful` |  |  | General | *Color Atmosphere* |
| `color_intensity` | select<br/>options: `Saturated`, `Desaturated`, `Mixed` |  |  | General | *Color Intensity* |
| `character_location_interaction` | select<br/>options: `Match`, `Contrast`, `Transform` |  |  | General | *Character-Location Color Interaction* |


#### 🔉 `location_sound_profile` — Location Sound Profile

Acoustic identity of a place — room tone, ambience, character.

| Meta | Value |
|---|---|
| Plural label | Location Sound Profiles |
| Category | Location Depth |
| Tier | 1 |
| Sort order | 303 |
| Parent entity | `location` via `location_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. The Old Mill — Sound |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `room_tone` | textarea |  |  | General | *Room Tone* — placeholder: The sound of the space itself |
| `reverb_quality` | textarea |  |  | General | *Reverb / Reflection* |
| `resonance` | textarea |  |  | General | *Resonance Characteristics* |
| `constant_sounds` | json |  |  | Ambience | *Constant Sounds* — placeholder: ["hum of machinery", "dripping water", "wind through cracks"] |
| `variable_sounds` | textarea |  |  | Ambience | *Variable Sounds* |
| `characteristic_sounds` | textarea |  |  | Ambience | *Characteristic Sounds* — placeholder: What makes this place sonically unique |
| `sonic_perspective` | textarea |  |  | Ambience | *Sonic Perspective* — placeholder: Interior/exterior, open/enclosed, near/distant |

**Tabs:** `General`, `Ambience`


---

### Category: Scene Detail

<a id='category-scene-detail'></a>

#### 💗 `scene_emotional_target` — Scene Emotional Target

Specific emotional goal and function for a scene.

| Meta | Value |
|---|---|
| Plural label | Scene Emotional Targets |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 400 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Emotional Target |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `primary_emotion` | text | yes |  | General | *Primary Emotion* — placeholder: e.g. Terror, Relief, Joy, Dread |
| `primary_intensity` | integer |  |  | General | *Intensity (1-10)* |
| `secondary_emotions` | json |  |  | General | *Secondary Emotions* — placeholder: ["anxiety", "hope"] |
| `emotional_function` | select<br/>options: `Setup`, `Build`, `Release`, `Shift`, `Sustain` |  |  | General | *Emotional Function* |
| `audience_character_relationship` | select<br/>options: `Empathy`, `Sympathy`, `Antipathy`, `Observation` |  |  | General | *Audience-Character Relationship* |
| `contrast_with_previous` | textarea |  |  | General | *Contrast with Previous Scene* |


#### 🎨 `scene_color_palette` — Scene Color Palette

Specific color design for a scene.

| Meta | Value |
|---|---|
| Plural label | Scene Color Palettes |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 401 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Colors |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `dominant_colors` | json |  |  | General | *Dominant Colors (1-3)* — placeholder: [{"hex": "#4A5568", "name": "Gray-Blue", "pct": 40}] |
| `color_harmony_type` | select<br/>options: `Monochromatic`, `Analogous`, `Complementary`, `Triadic`, `Split-Complementary` |  |  | General | *Color Harmony Type* |
| `color_source_distribution` | textarea |  |  | General | *Color Source Distribution* — placeholder: Where colors come from: lighting %, wardrobe %, design %, props % |
| `color_contrast_level` | select<br/>options: `Low`, `Medium`, `High` |  |  | General | *Color Contrast Level* |
| `focal_color` | text |  |  | General | *Focal / Hero Color* — placeholder: The one color that draws the eye |
| `grading_notes` | textarea |  |  | General | *Color Grading Notes* |


#### 💡 `lighting_design` — Lighting Design

Illumination approach for a scene.

| Meta | Value |
|---|---|
| Plural label | Lighting Designs |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 402 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Lighting |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot (optional)* |
| `lighting_style` | select<br/>options: `Naturalistic`, `Stylized`, `High Key`, `Low Key`, `Chiaroscuro` |  |  | General | *Lighting Style* |
| `contrast_ratio` | text |  |  | General | *Contrast Ratio* — placeholder: e.g. 4:1, 2:1 |
| `overall_mood` | text |  |  | General | *Overall Mood* |
| `light_quality` | select<br/>options: `Hard`, `Soft`, `Mixed` |  |  | General | *Overall Light Quality* |
| `key_source` | text |  |  | Key Light | *Key Light Source* — placeholder: e.g. Window camera-left, practial desk lamp |
| `key_direction` | text |  |  | Key Light | *Key Direction* |
| `key_quality` | select<br/>options: `Hard`, `Soft` |  |  | Key Light | *Key Quality* |
| `key_color_temperature` | integer |  |  | Key Light | *Key Color Temperature (K)* — placeholder: e.g. 5600 |
| `fill_ratio` | text |  |  | Fill & Other | *Fill Ratio* — placeholder: e.g. 2:1 to key |
| `fill_quality` | text |  |  | Fill & Other | *Fill Quality* |
| `fill_color_temperature` | integer |  |  | Fill & Other | *Fill Color Temp (K)* |
| `backlight_notes` | textarea |  |  | Fill & Other | *Back/Rim/Hair Light* |
| `practical_lights` | textarea |  |  | Fill & Other | *Practical Lights* — placeholder: What's visible in scene, how practicals motivate lighting |
| `ambient_light` | textarea |  |  | Fill & Other | *Ambient Light* |
| `lighting_evolution` | textarea |  |  | Fill & Other | *Lighting Evolution Through Scene* |

**Tabs:** `General`, `Key Light`, `Fill & Other`


#### 🎶 `scene_music_design` — Scene Music Design

Music approach for a specific scene.

| Meta | Value |
|---|---|
| Plural label | Scene Music Designs |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 403 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Music |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `music_presence` | select<br/>options: `Score`, `Source`, `None`, `Mixed` |  |  | General | *Music Presence* |
| `emotional_function` | select<br/>options: `Support`, `Anticipate`, `Counterpoint`, `Neutral` |  |  | General | *Emotional Function* |
| `entry_point` | text |  |  | General | *Entry Point* — placeholder: When music enters the scene |
| `build_evolution` | textarea |  |  | General | *Build / Evolution* |
| `peak` | text |  |  | General | *Peak* |
| `exit_point` | text |  |  | General | *Exit Point* |
| `themes_used` | json |  |  | General | *Themes Used* — placeholder: ["Eleanor Theme — piano variation", "Danger motif"] |
| `source_music_description` | textarea |  |  | Source Music | *Source Music Description* |
| `lyrics_relevance` | textarea |  |  | Source Music | *Lyrics Relevance* |

**Tabs:** `General`, `Source Music`


#### 🏷️ `tone_marker` — Tone Marker

Scene-specific tonal quality and atmosphere.

| Meta | Value |
|---|---|
| Plural label | Tone Markers |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 404 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Tone |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `sequence_id` | reference → `sequence` |  |  | General | *Sequence* |
| `tone_descriptor` | text |  |  | General | *Tone Descriptor* — placeholder: e.g. Comedic, Suspenseful, Whimsical, Raw |
| `intensity` | select<br/>options: `Light`, `Moderate`, `Heavy` |  |  | General | *Intensity* |
| `genre_elements` | text |  |  | General | *Genre Elements Active* — placeholder: e.g. Horror elements, rom-com beats |
| `mood_atmosphere` | textarea |  |  | General | *Mood / Atmosphere* |
| `pacing_expectation` | textarea |  |  | General | *Pacing Expectation* |
| `tonal_shift` | textarea |  |  | General | *Tonal Shift Notes* — placeholder: How tone differs from surrounding material, and why |


#### 🛋️ `set_dressing` — Set Dressing

Objects and arrangement populating a scene's location.

| Meta | Value |
|---|---|
| Plural label | Set Dressings |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 405 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Set Dressing |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `location_id` | reference → `location` |  |  | General | *Location* |
| `hero_objects` | json |  |  | General | *Hero Objects* — placeholder: ["skateboard by door", "half-empty bottle of bourbon"] — Story-significant objects |
| `atmospheric_objects` | textarea |  |  | General | *Atmospheric Objects* — placeholder: Mood-creating objects |
| `practical_objects` | textarea |  |  | General | *Practical Objects* — placeholder: Actor-interactive objects |
| `background_fill` | textarea |  |  | General | *Background Fill* |
| `sightline_management` | textarea |  |  | General | *Sightline Management* |
| `continuity_requirements` | textarea |  |  | General | *Continuity Requirements* |


#### 🎙️ `dialogue_sound_design` — Dialogue Sound Design

How dialogue sounds in the world — recording aesthetic, processing.

| Meta | Value |
|---|---|
| Plural label | Dialogue Sound Designs |
| Category | Scene Detail |
| Tier | 1 |
| Sort order | 406 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Dialogue — Project Default |
| `scene_id` | reference → `scene` |  |  | General | *Scene (optional — null for project-level)* |
| `recording_aesthetic` | select<br/>options: `Clean/Studio`, `Production Audio`, `Stylized` |  |  | General | *Recording Aesthetic* |
| `acoustic_environment` | textarea |  |  | General | *Acoustic Environment* |
| `dialogue_clarity` | select<br/>options: `Always Clear`, `Sometimes Obscured`, `Deliberately Muddy` |  |  | General | *Dialogue Clarity* |
| `dialogue_layering` | textarea |  |  | General | *Dialogue Layering* — placeholder: Overlapping conversations, background walla |
| `processing_notes` | textarea |  |  | General | *Processing Notes* — placeholder: Phone/radio effects, distortion, stylized treatment |


---

### Category: Thematic Tracking

<a id='category-thematic-tracking'></a>

#### 🔷 `visual_motif` — Visual Motif

Recurring visual element that carries meaning (shape, pattern, material, object).

| Meta | Value |
|---|---|
| Plural label | Visual Motifs |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 500 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Motif Name* — placeholder: e.g. Windows, Circular Shapes, Rust |
| `motif_type` | select<br/>options: `Shape/Form`, `Pattern`, `Material`, `Architectural Element`, `Object`, `Natural Element` |  |  | General | *Motif Type* |
| `symbolic_meaning` | textarea |  |  | General | *Symbolic Meaning* — placeholder: What this motif represents thematically |
| `emotional_associations` | textarea |  |  | General | *Emotional Associations* |
| `evolution_description` | textarea |  |  | General | *Evolution Through Story* |
| `placement_strategy` | textarea |  |  | General | *Placement Strategy* — placeholder: Where, how often, how subtle |
| `subtlety_level` | select<br/>options: `Obvious`, `Noticeable`, `Subtle`, `Hidden` |  |  | General | *Subtlety Level* |


#### 🔔 `sonic_motif` — Sonic Motif

Recurring sound that carries meaning.

| Meta | Value |
|---|---|
| Plural label | Sonic Motifs |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 501 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Motif Name* — placeholder: e.g. Train Horn, Heartbeat, Wind Chimes |
| `sound_description` | textarea |  |  | General | *Sound Description* — placeholder: What it sounds like |
| `symbolic_meaning` | textarea |  |  | General | *Symbolic Meaning* |
| `first_appearance_scene_id` | reference → `scene` |  |  | General | *First Appearance Scene* |
| `recurrence_pattern` | textarea |  |  | General | *Recurrence Pattern* |
| `evolution_description` | textarea |  |  | General | *Evolution Through Story* |
| `related_visual_motif_id` | reference → `visual_motif` |  |  | General | *Related Visual Motif* |


#### 🔮 `symbol` — Symbol

Object, image, sound, or action carrying meaning beyond the literal.

| Meta | Value |
|---|---|
| Plural label | Symbols |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 502 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Symbol Name* — placeholder: e.g. The Compass, Red Door, Rain |
| `symbol_type` | select<br/>options: `Object`, `Image`, `Sound`, `Color`, `Location`, `Action`, `Character` |  |  | General | *Symbol Type* |
| `literal_function` | textarea |  |  | General | *Literal Function* — placeholder: What it is/does in the story on the surface |
| `symbolic_meaning_primary` | textarea |  |  | General | *Primary Symbolic Meaning* |
| `symbolic_meaning_secondary` | textarea |  |  | General | *Secondary Meaning* |
| `meaning_evolution` | textarea |  |  | General | *Meaning Evolution* — placeholder: How meaning changes through the story |
| `first_appearance_scene_id` | reference → `scene` |  |  | General | *First Appearance Scene* |


#### 💭 `conceptual_motif` — Conceptual Motif

Recurring idea, behavior, or verbal pattern that carries thematic weight.

| Meta | Value |
|---|---|
| Plural label | Conceptual Motifs |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 503 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Motif Name* — placeholder: e.g. Failed Promises, Looking Away, 'Fair enough' |
| `motif_type` | select<br/>options: `Conceptual`, `Behavioral`, `Verbal`, `Situational` |  |  | General | *Motif Type* |
| `thematic_meaning` | textarea |  |  | General | *Thematic Meaning* |
| `evolution_description` | textarea |  |  | General | *Evolution / Transformation* |


#### 🧊 `subtext` — Subtext

Underlying meaning beneath surface action or dialogue.

| Meta | Value |
|---|---|
| Plural label | Subtext Layers |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 504 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Dinner Conversation |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `surface_level` | textarea | yes |  | General | *Surface Level* — placeholder: What appears to be happening |
| `subtext_level` | textarea | yes |  | General | *Subtext Level* — placeholder: What is actually happening underneath |
| `gap_size` | select<br/>options: `Small`, `Moderate`, `Large` |  |  | General | *Gap Between Surface and Subtext* |
| `character_awareness` | select<br/>options: `Aware`, `Unaware`, `Mixed` |  |  | General | *Character Awareness* |
| `audience_access` | select<br/>options: `First Viewing`, `Repeat Viewing`, `Analysis` |  |  | General | *Audience Access* |
| `purpose` | select<br/>options: `Dramatic Irony`, `Character Revelation`, `Thematic Depth`, `Foreshadowing`, `Emotional Complexity` |  |  | General | *Subtext Purpose* |


#### 🔗 `thematic_connection` — Thematic Connection

How a specific element connects to a theme.

| Meta | Value |
|---|---|
| Plural label | Thematic Connections |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 505 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Display Name* — placeholder: e.g. Eleanor → Redemption |
| `theme_id` | reference → `theme` | yes |  | General | *Theme* |
| `entity_type` | select<br/>options: `Character`, `Scene`, `Location`, `Prop`, `Costume`, `Visual Motif`, `Sonic Motif`, `Symbol` |  |  | General | *Connected Entity Type* |
| `entity_id` | integer | yes |  | General | *Connected Entity ID* |
| `nature_of_connection` | select<br/>options: `Embodies`, `Explores`, `Represents`, `Challenges`, `Resolves` |  |  | General | *Nature of Connection* |
| `subtlety_level` | select<br/>options: `On-the-Nose`, `Clear`, `Subtle`, `Hidden` |  |  | General | *Subtlety Level* |
| `intended_perception` | select<br/>options: `Must Recognize`, `Enhances if Recognized`, `Reward for Careful Viewing` |  |  | General | *Intended Perception* |


#### 🌈 `color_symbolism` — Color Symbolism

Thematic meanings assigned to specific colors in this story.

| Meta | Value |
|---|---|
| Plural label | Color Symbolism |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 506 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Color Name* — placeholder: e.g. Deep Red |
| `color_hex` | text |  |  | General | *Color (hex)* — placeholder: #8B0000 |
| `primary_symbolism` | textarea |  |  | General | *Primary Symbolism* |
| `secondary_symbolism` | textarea |  |  | General | *Secondary Symbolism* |
| `emotional_positive` | textarea |  |  | General | *Positive Emotional Association* |
| `emotional_negative` | textarea |  |  | General | *Negative Emotional Association* |
| `evolution_through_story` | textarea |  |  | General | *Evolution Through Story* |
| `cultural_context` | textarea |  |  | General | *Cultural Context* |


#### 🎞️ `color_script` — Color Script

Visual map of color progression through the story.

| Meta | Value |
|---|---|
| Plural label | Color Scripts |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 507 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Color Script` | General | *Name* |
| `format` | select<br/>options: `Strip`, `Grid`, `Timeline` |  |  | General | *Format* |
| `granularity` | select<br/>options: `Per Scene`, `Per Sequence`, `Per Act` |  |  | General | *Granularity* |
| `progression_description` | textarea |  |  | General | *Color Progression Description* |
| `key_color_moments` | textarea |  |  | General | *Key Color Moments* — placeholder: Dramatic color shifts and their story significance |
| `arc_shape` | select<br/>options: `Linear`, `Cyclical`, `Transformative`, `Oscillating` |  |  | General | *Color Arc Shape* |
| `emotional_mapping` | textarea |  |  | General | *Emotional Color Mapping* |


#### 📈 `emotional_arc` — Emotional Arc

Overall emotional trajectory for the audience across the project.

| Meta | Value |
|---|---|
| Plural label | Emotional Arcs |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 510 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Audience Emotional Arc` | General | *Name* |
| `opening_emotional_state` | textarea |  |  | General | *Opening Emotional State* — placeholder: Where the audience begins emotionally |
| `closing_emotional_state` | textarea |  |  | General | *Closing Emotional State* — placeholder: Where the audience should end |
| `emotional_shape` | select<br/>options: `Rising Action`, `Oscillating`, `Descent`, `Transformation` |  |  | General | *Emotional Shape* |
| `lingering_feelings` | textarea |  |  | General | *Lingering Feelings* — placeholder: What the audience carries out of the theater |


#### 💓 `emotional_beat` — Emotional Beat

Specific point on the audience emotional journey.

| Meta | Value |
|---|---|
| Plural label | Emotional Beats |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 511 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Act 2 — Hope Crushed |
| `emotional_arc_id` | reference → `emotional_arc` |  |  | General | *Emotional Arc* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `sequence_id` | reference → `sequence` |  |  | General | *Sequence* |
| `beat_order` | integer | yes |  | General | *Beat Order* |
| `target_emotion` | text | yes |  | General | *Target Emotion* — placeholder: e.g. Dread, Relief, Joy |
| `intensity` | integer |  |  | General | *Intensity (1-10)* |
| `beat_trigger` | textarea |  |  | General | *Trigger* — placeholder: What causes this emotional shift |


#### 🧩 `information_strategy` — Information Strategy

What the audience knows vs what characters know — suspense and surprise.

| Meta | Value |
|---|---|
| Plural label | Information Strategies |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 512 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Knowledge State |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `knowledge_asymmetry` | select<br/>options: `Dramatic Irony`, `Mystery`, `Parallel Knowledge`, `Shifting` |  |  | General | *Knowledge Asymmetry* |
| `information_withheld` | textarea |  |  | General | *Information Withheld* |
| `reveal_timing` | textarea |  |  | General | *Reveal Timing* |
| `suspense_approach` | textarea |  |  | General | *Suspense Approach* |
| `surprise_setup` | textarea |  |  | General | *Surprise / Plant-and-Payoff* |


#### 🪞 `identification_strategy` — Identification Strategy

How the audience relates to and identifies with characters.

| Meta | Value |
|---|---|
| Plural label | Identification Strategies |
| Category | Thematic Tracking |
| Tier | 1 |
| Sort order | 513 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Audience Identification Strategy` | General | *Name* |
| `primary_identification_character_id` | reference → `character` |  |  | General | *Primary Identification Character* |
| `how_identification_created` | textarea |  |  | General | *How Identification is Created* |
| `identification_shifts` | textarea |  |  | General | *Identification Shifts* — placeholder: Does identification change through the story? When and why? |
| `empathy_targets` | json |  |  | General | *Empathy Targets* — placeholder: ["Eleanor", "young Marcus"] — Characters we should feel for |
| `distance_targets` | json |  |  | General | *Distance Targets* — placeholder: ["The Senator"] — Characters we should observe from distance |
| `moral_alignment_approach` | textarea |  |  | General | *Moral Alignment Approach* |


---

### Category: Production

<a id='category-production'></a>

#### 📷 `shot` — Shot

Specific camera setup within a scene.

| Meta | Value |
|---|---|
| Plural label | Shots |
| Category | Production |
| Tier | 1 |
| Sort order | 600 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Shot Number/Name* — placeholder: e.g. 23A |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `duration` | integer |  |  | General | *Duration (seconds)* |
| `coverage_type` | select<br/>options: `Primary`, `Alt Angle`, `Cutaway`, `Insert`, `Establishing` |  |  | General | *Coverage Type* |
| `technical_requirements` | textarea |  |  | General | *Technical Requirements* |


#### 🎯 `shot_design` — Shot Design

Framing, lens, focus, and movement specifications for a shot.

| Meta | Value |
|---|---|
| Plural label | Shot Designs |
| Category | Production |
| Tier | 1 |
| Sort order | 601 |
| Parent entity | `shot` via `shot_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Shot 23A — Design |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `framing_type` | select<br/>options: `EWS`, `WS`, `MWS`, `MS`, `MCU`, `CU`, `ECU`, `Insert`, `OTS`, `POV` |  |  | General | *Framing Type* |
| `angle` | select<br/>options: `Eye Level`, `High`, `Low`, `Dutch`, `Overhead`, `Worm's Eye` |  |  | General | *Angle* |
| `composition` | text |  |  | General | *Composition* — placeholder: e.g. Rule of thirds, centered, symmetrical |
| `subject_placement` | text |  |  | General | *Subject Placement* |
| `depth_composition` | textarea |  |  | General | *Depth Composition* — placeholder: Foreground / midground / background elements |
| `focal_length` | integer |  |  | Lens | *Focal Length (mm)* |
| `aperture` | text |  |  | Lens | *Aperture* — placeholder: e.g. T2.8 |
| `lens_choice_reason` | textarea |  |  | Lens | *Lens Choice Reason* |
| `focus_mode` | select<br/>options: `Deep Focus`, `Shallow Focus`, `Rack Focus`, `Split Diopter` |  |  | Focus | *Focus Mode* |
| `primary_focus_subject` | text |  |  | Focus | *Primary Focus Subject* |
| `rack_focus_choreography` | textarea |  |  | Focus | *Rack Focus Choreography* |
| `movement_type` | select<br/>options: `Static`, `Pan`, `Tilt`, `Dolly`, `Crane`, `Handheld`, `Steadicam`, `Tracking`, `Zoom`, `Combined` |  |  | Movement | *Movement Type* |
| `movement_speed` | text |  |  | Movement | *Movement Speed* |
| `movement_motivation` | textarea |  |  | Movement | *Movement Motivation* |
| `start_position` | text |  |  | Movement | *Start Position* |
| `end_position` | text |  |  | Movement | *End Position* |

**Tabs:** `General`, `Lens`, `Focus`, `Movement`


#### 💬 `shot_language` — Shot Language

Meaning and intent conveyed through shot choices.

| Meta | Value |
|---|---|
| Plural label | Shot Language |
| Category | Production |
| Tier | 1 |
| Sort order | 602 |
| Parent entity | `shot` via `shot_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Shot 23A — Language |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `shot_intention` | select<br/>options: `Establishing`, `Reaction`, `POV`, `Insert`, `Emotional Emphasis`, `Information Delivery` |  |  | General | *Shot Intention* |
| `shot_psychology` | select<br/>options: `Intimate`, `Distant`, `Powerful`, `Vulnerable`, `Stable`, `Unstable` |  |  | General | *Shot Psychology* |
| `audience_relationship` | select<br/>options: `Observer`, `Participant`, `Character Identification`, `Omniscient` |  |  | General | *Audience Relationship* |


#### 🗺️ `scene_blocking` — Scene Blocking

Physical arrangement and movement of characters through a scene.

| Meta | Value |
|---|---|
| Plural label | Scene Blockings |
| Category | Production |
| Tier | 1 |
| Sort order | 610 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Blocking |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `opening_positions` | json |  |  | General | *Opening Positions* — placeholder: [{"character": "Eleanor", "position": "standing by window"}] |
| `closing_positions` | json |  |  | General | *Closing Positions* |
| `spatial_storytelling` | textarea |  |  | General | *Spatial Storytelling* — placeholder: What blocking communicates about relationships and power |
| `blocking_notes` | textarea |  |  | General | *Blocking Notes* |


#### 👣 `blocking_beat` — Blocking Beat

Specific movement or position change within a scene.

| Meta | Value |
|---|---|
| Plural label | Blocking Beats |
| Category | Production |
| Tier | 1 |
| Sort order | 611 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor crosses to door |
| `scene_blocking_id` | reference → `scene_blocking` | yes |  | General | *Scene Blocking* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `beat_order` | integer | yes |  | General | *Beat Order* |
| `movement_description` | textarea | yes |  | General | *Movement Description* |
| `character_motivation` | textarea |  |  | General | *Character Motivation* |
| `story_motivation` | textarea |  |  | General | *Story Motivation* |
| `timing` | text |  |  | General | *Timing* |
| `quality` | text |  |  | General | *Quality* — placeholder: e.g. Quick, deliberate, hesitant |
| `meaning` | textarea |  |  | General | *Meaning* |


#### ⚔️ `action_sequence` — Action Sequence

Extended physical action — fight, chase, dance, stunt.

| Meta | Value |
|---|---|
| Plural label | Action Sequences |
| Category | Production |
| Tier | 1 |
| Sort order | 612 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Name* — placeholder: e.g. Bar Fight, Rooftop Chase |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `action_type` | select<br/>options: `Fight/Combat`, `Chase`, `Physical Labor`, `Athletic Performance`, `Dance`, `Stunt Sequence` |  |  | General | *Action Type* |
| `narrative_function` | textarea |  |  | General | *Narrative Function* |
| `character_revelation` | textarea |  |  | General | *Character Revelation* |
| `emotional_journey` | textarea |  |  | General | *Emotional Journey* |
| `action_arc` | textarea |  |  | General | *Action Arc* — placeholder: Beginning → escalation → climax → resolution |
| `physical_vocabulary` | textarea |  |  | General | *Physical Vocabulary / Style* |


#### 💥 `action_beat` — Action Beat

Specific moment within an action sequence.

| Meta | Value |
|---|---|
| Plural label | Action Beats |
| Category | Production |
| Tier | 1 |
| Sort order | 613 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor disarms attacker |
| `action_sequence_id` | reference → `action_sequence` |  |  | General | *Action Sequence* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` |  |  | General | *Character* |
| `description` | textarea | yes |  | General | *Description* |
| `beat_function` | select<br/>options: `Story`, `Character`, `Spectacle`, `Emotional` |  |  | General | *Beat Function* |
| `timing` | text |  |  | General | *Timing* |
| `intensity` | integer |  |  | General | *Intensity (1-10)* |
| `safety_requirements` | textarea |  |  | General | *Safety Requirements* |


#### ↔️ `proxemic_design` — Proxemic Design

Intentional use of interpersonal distance in a scene.

| Meta | Value |
|---|---|
| Plural label | Proxemic Designs |
| Category | Production |
| Tier | 1 |
| Sort order | 614 |
| Parent entity | `scene` via `scene_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Proxemics |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `starting_distance_zone` | select<br/>options: `Intimate (0-18in)`, `Personal (18in-4ft)`, `Social (4-12ft)`, `Public (12ft+)` |  |  | General | *Starting Distance Zone* |
| `ending_distance_zone` | select<br/>options: `Intimate (0-18in)`, `Personal (18in-4ft)`, `Social (4-12ft)`, `Public (12ft+)` |  |  | General | *Ending Distance Zone* |
| `distance_story` | textarea |  |  | General | *Distance Story* — placeholder: How distance changes and what the changes mean |
| `violations` | textarea |  |  | General | *Violations* — placeholder: When characters enter unexpected distance zones |
| `violation_purpose` | textarea |  |  | General | *Violation Purpose* |


#### 🤕 `physical_state` — Physical State

Character's physical condition at a specific story point.

| Meta | Value |
|---|---|
| Plural label | Physical States |
| Category | Production |
| Tier | 1 |
| Sort order | 620 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — Scene 23 |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `energy_level` | select<br/>options: `Alert/Energized`, `Tired/Depleted`, `Wired/Anxious`, `Relaxed/Calm` |  |  | General | *Energy Level* |
| `physical_comfort` | textarea |  |  | General | *Physical Comfort* |
| `intoxication_level` | select<br/>options: `Sober`, `Slightly Intoxicated`, `Heavily Intoxicated`, `Medicated`, `Exhausted to Impairment` |  |  | General | *Intoxication / Alteration* |
| `physical_needs` | textarea |  |  | General | *Physical Needs* — placeholder: Hunger, temperature, rest, desire |
| `current_injuries` | textarea |  |  | General | *Current Injuries* |
| `illness_symptoms` | textarea |  |  | General | *Illness Symptoms* |


#### 🗣️ `vocal_state` — Vocal State

Character's vocal condition at a specific story point.

| Meta | Value |
|---|---|
| Plural label | Vocal States |
| Category | Production |
| Tier | 1 |
| Sort order | 621 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — Scene 23 Voice |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `physical_vocal_state` | select<br/>options: `Healthy`, `Hoarse`, `Strained`, `Damaged` |  |  | General | *Physical Vocal State* |
| `emotional_vocal_state` | select<br/>options: `Controlled`, `Emotional`, `Confident`, `Shaking` |  |  | General | *Emotional Vocal State* |
| `environmental_factors` | textarea |  |  | General | *Environmental Factors* |
| `altered_state_effects` | textarea |  |  | General | *Altered State Effects* — placeholder: e.g. Intoxication slur, crying breaks, cold stuffiness |


#### 🎭 `physical_performance_beat` — Physical Performance Beat

Specific physical moment or action in a performance.

| Meta | Value |
|---|---|
| Plural label | Physical Performance Beats |
| Category | Production |
| Tier | 1 |
| Sort order | 622 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — fingernail picking |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `beat_description` | textarea | yes |  | General | *Beat Description* |
| `timing` | text |  |  | General | *Timing* |
| `purpose` | textarea |  |  | General | *Purpose* |
| `quality_notes` | text |  |  | General | *Quality Notes* — placeholder: e.g. Sharp, soft, sudden, gradual |
| `scale` | select<br/>options: `Large`, `Small`, `Subtle` |  |  | General | *Scale* |
| `relationship_to_dialogue` | select<br/>options: `Accompanies`, `Replaces`, `Contradicts`, `Punctuates` |  |  | General | *Relationship to Dialogue* |


#### 🎤 `vocal_beat` — Vocal Beat

Specific vocal moment — a pause, sigh, voice break, volume shift.

| Meta | Value |
|---|---|
| Plural label | Vocal Beats |
| Category | Production |
| Tier | 1 |
| Sort order | 623 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — voice catches |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `beat_description` | textarea | yes |  | General | *Beat Description* |
| `beat_type` | select<br/>options: `Silence/Pause`, `Non-Verbal Sound`, `Quality Shift`, `Volume Shift`, `Tempo Shift` |  |  | General | *Beat Type* |
| `timing` | text |  |  | General | *Timing* |
| `purpose` | textarea |  |  | General | *Purpose* |


#### 📜 `line_delivery` — Line Delivery

Specific delivery instructions for a line of dialogue.

| Meta | Value |
|---|---|
| Plural label | Line Deliveries |
| Category | Production |
| Tier | 1 |
| Sort order | 624 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — 'I never said that' |
| `character_id` | reference → `character` |  |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `line_text` | text |  |  | General | *Line Text* — placeholder: The line being directed |
| `emotional_quality` | textarea |  |  | General | *Emotional Quality* |
| `tempo` | text |  |  | General | *Tempo* |
| `volume` | text |  |  | General | *Volume* |
| `emphasis_words` | json |  |  | General | *Emphasis Words* — placeholder: ["never", "that"] |
| `pause_locations` | json |  |  | General | *Pause Locations* — placeholder: ["before never", "after said"] |
| `subtext` | textarea |  |  | General | *Subtext* |
| `operative_words` | textarea |  |  | General | *Operative Words* |
| `physical_integration` | textarea |  |  | General | *Physical Integration* — placeholder: What the body does during this line |


#### 🥁 `dialogue_rhythm` — Dialogue Rhythm

The musicality of conversation between characters in a scene.

| Meta | Value |
|---|---|
| Plural label | Dialogue Rhythms |
| Category | Production |
| Tier | 1 |
| Sort order | 625 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Eleanor/Marcus Rhythm |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` |  |  | General | *Character B* |
| `conversational_style` | select<br/>options: `Overlapping/Interrupting`, `Turn-Taking/Polite`, `Rapid Exchange`, `Languid/Paused` |  |  | General | *Conversational Style* |
| `power_dynamics` | textarea |  |  | General | *Power Dynamics* |
| `listening_indicators` | textarea |  |  | General | *Listening Indicators* |
| `rhythm_evolution` | textarea |  |  | General | *Rhythm Evolution Through Scene* |


#### 😤 `emotional_physicality` — Emotional Physicality

How a specific emotion manifests physically for a character.

| Meta | Value |
|---|---|
| Plural label | Emotional Physicalities |
| Category | Production |
| Tier | 1 |
| Sort order | 630 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — Anger |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `emotion` | text | yes |  | General | *Emotion* — placeholder: e.g. Anger, Fear |
| `posture_changes` | textarea |  |  | General | *Posture Changes* |
| `tension_location` | text |  |  | General | *Tension Location* — placeholder: e.g. Shoulders, jaw, hands |
| `breathing_pattern` | textarea |  |  | General | *Breathing Pattern* |
| `expansion_contraction` | select<br/>options: `Expanding`, `Contracting` |  |  | General | *Expansion / Contraction* |
| `stillness_vs_movement` | textarea |  |  | General | *Stillness vs Movement* |
| `visibility_level` | select<br/>options: `Obvious`, `Subtle`, `Hidden`, `Leaked` |  |  | General | *Visibility Level* |
| `control_level` | select<br/>options: `Conscious`, `Unconscious`, `Suppressed`, `Overwhelming` |  |  | General | *Control Level* |


#### ✋ `physical_habit` — Physical Habit

Recurring physical behavior — gesture, tic, comfort behavior.

| Meta | Value |
|---|---|
| Plural label | Physical Habits |
| Category | Production |
| Tier | 1 |
| Sort order | 631 |
| Parent entity | `character` via `character_id` |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Habit Name* — placeholder: e.g. Picks at fingernails, Hair touching |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `description` | textarea |  |  | General | *Description* |
| `body_parts_involved` | text |  |  | General | *Body Parts Involved* |
| `habit_trigger` | textarea |  |  | General | *Trigger* — placeholder: What causes this behavior |
| `frequency` | select<br/>options: `Constant`, `Frequent`, `Occasional`, `Rare/Situational` |  |  | General | *Frequency* |
| `meaning` | textarea |  |  | General | *Meaning* — placeholder: What it communicates about the character |
| `character_awareness` | select<br/>options: `Aware`, `Unaware`, `Sometimes Aware` |  |  | General | *Character Awareness* |


#### 😏 `microexpression` — Microexpression

Fleeting facial expression that reveals hidden emotion.

| Meta | Value |
|---|---|
| Plural label | Microexpressions |
| Category | Production |
| Tier | 1 |
| Sort order | 632 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor — contempt flash |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `expression_type` | text |  |  | General | *Expression Type* |
| `facial_region` | text |  |  | General | *Facial Region* |
| `underlying_emotion` | text |  |  | General | *Underlying (True) Emotion* |
| `displayed_emotion` | text |  |  | General | *Displayed (Surface) Emotion* |
| `character_awareness` | select<br/>options: `Aware`, `Unaware` |  |  | General | *Character Awareness* |
| `audience_intended_to_catch` | boolean |  |  | General | *Audience Intended to Catch?* |


#### 🏠 `character_environment_physicality` — Character-Environment Physicality

How a character physically inhabits a specific location.

| Meta | Value |
|---|---|
| Plural label | Character-Environment Physicalities |
| Category | Production |
| Tier | 1 |
| Sort order | 633 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor at the Mill |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `how_enters_space` | textarea |  |  | General | *How Character Enters* |
| `typical_position` | textarea |  |  | General | *Typical Position* |
| `space_claiming_behavior` | textarea |  |  | General | *Space Claiming Behavior* |
| `object_interaction_quality` | textarea |  |  | General | *Object Interaction Quality* — placeholder: Careful, careless, reverent, destructive |
| `territorial_behavior` | textarea |  |  | General | *Territorial Behavior* |


#### 🤲 `physical_relationship` — Physical Relationship

How two characters physically relate — distance, touch, mirroring, power.

| Meta | Value |
|---|---|
| Plural label | Physical Relationships |
| Category | Production |
| Tier | 1 |
| Sort order | 634 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor & Marcus — Physical Dynamic |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` | yes |  | General | *Character B* |
| `typical_distance` | select<br/>options: `Intimate`, `Personal`, `Social`, `Public` |  |  | General | *Typical Distance* |
| `who_controls_distance` | text |  |  | General | *Who Controls Distance* |
| `touch_patterns` | textarea |  |  | General | *Touch Patterns* |
| `touch_quality` | select<br/>options: `Gentle`, `Aggressive`, `Casual`, `Charged` |  |  | General | *Touch Quality* |
| `who_initiates_touch` | text |  |  | General | *Who Initiates Touch* |
| `physical_mirroring` | textarea |  |  | General | *Physical Mirroring* |
| `physical_power_dynamic` | textarea |  |  | General | *Physical Power Dynamic* |


#### 📊 `physical_relationship_evolution` — Physical Relationship Evolution

How a physical relationship between characters changes at a specific scene.

| Meta | Value |
|---|---|
| Plural label | Physical Relationship Evolutions |
| Category | Production |
| Tier | 1 |
| Sort order | 635 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor & Marcus — Scene 23 |
| `physical_relationship_id` | reference → `physical_relationship` | yes |  | General | *Physical Relationship* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `distance_state` | text |  |  | General | *Distance State* |
| `touch_state` | text |  |  | General | *Touch State* |
| `mirroring_state` | text |  |  | General | *Mirroring State* |
| `change_from_previous` | textarea |  |  | General | *Change from Previous* |


#### 💃 `movement_choreography` — Movement Choreography

Designed movement patterns — dance, ritual, work, sport.

| Meta | Value |
|---|---|
| Plural label | Movement Choreographies |
| Category | Production |
| Tier | 1 |
| Sort order | 636 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Name* — placeholder: e.g. Ballroom Dance, Assembly Line |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `choreography_type` | select<br/>options: `Dance (Formal)`, `Dance (Social)`, `Dance (Spontaneous)`, `Ritual/Ceremony`, `Work/Labor`, `Sport/Game`, `Synchronized Movement` |  |  | General | *Choreography Type* |
| `style` | textarea |  |  | General | *Style* |
| `meaning` | textarea |  |  | General | *Meaning* |
| `period_accuracy` | textarea |  |  | General | *Period Accuracy* |


#### 🎼 `musical_theme` — Musical Theme

Recurring melodic or harmonic idea — leitmotif.

| Meta | Value |
|---|---|
| Plural label | Musical Themes |
| Category | Production |
| Tier | 1 |
| Sort order | 640 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Theme Name* — placeholder: e.g. Eleanor's Theme, Danger Motif |
| `theme_description` | textarea |  |  | General | *Theme Description* — placeholder: Melodic/harmonic character |
| `emotional_association` | textarea |  |  | General | *Emotional Association* |
| `character_id` | reference → `character` |  |  | General | *Associated Character* |
| `concept_association` | text |  |  | General | *Concept Association* — placeholder: If theme represents an idea rather than character |
| `first_appearance_scene_id` | reference → `scene` |  |  | General | *First Appearance Scene* |
| `development_description` | textarea |  |  | General | *Development Through Story* |
| `orchestration_variations` | textarea |  |  | General | *Orchestration Variations* |


#### 🔈 `sound_cue` — Sound Cue

Individual sound effect or designed sound placement.

| Meta | Value |
|---|---|
| Plural label | Sound Cues |
| Category | Production |
| Tier | 1 |
| Sort order | 641 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Door slam — Scene 23 |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `cue_type` | select<br/>options: `SFX`, `Foley`, `Ambient`, `Designed` |  |  | General | *Cue Type* |
| `description` | textarea |  |  | General | *Description* |
| `source` | select<br/>options: `On Screen`, `Off Screen` |  |  | General | *Source* |
| `volume_intensity` | text |  |  | General | *Volume / Intensity* |
| `emotional_function` | textarea |  |  | General | *Emotional Function* |
| `timing` | text |  |  | General | *Timing* |
| `duration` | integer |  |  | General | *Duration (seconds)* |


#### 🎵 `music_cue` — Music Cue

Individual music cue placement in a scene.

| Meta | Value |
|---|---|
| Plural label | Music Cues |
| Category | Production |
| Tier | 1 |
| Sort order | 642 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Cue Name* — placeholder: e.g. 3M2 — Eleanor discovers truth |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `cue_type` | select<br/>options: `Diegetic`, `Non-Diegetic` |  |  | General | *Cue Type* |
| `genre_style` | text |  |  | General | *Genre / Style* |
| `tempo_mood` | text |  |  | General | *Tempo / Mood* |
| `emotional_purpose` | textarea |  |  | General | *Emotional Purpose* |
| `musical_theme_id` | reference → `musical_theme` |  |  | General | *Musical Theme* |
| `instrumentation` | textarea |  |  | General | *Instrumentation* |
| `volume_level` | text |  |  | General | *Volume Level* |
| `source` | text |  |  | Source | *Source (if diegetic)* |

**Tabs:** `General`, `Source`


#### 👂 `sound_perspective` — Sound Perspective

Point-of-view in sound — whose hearing, what techniques.

| Meta | Value |
|---|---|
| Plural label | Sound Perspectives |
| Category | Production |
| Tier | 1 |
| Sort order | 643 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Scene 23 — Eleanor's Hearing |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` |  |  | General | *Character* |
| `perspective_type` | select<br/>options: `Objective`, `Subjective`, `Omniscient` |  |  | General | *Perspective Type* |
| `subjective_techniques` | textarea |  |  | General | *Subjective Techniques* — placeholder: Focus, muffling, internal sounds, memory sounds |
| `transition_triggers` | textarea |  |  | General | *Transition Triggers* |


#### 📢 `voiceover_design` — Voiceover Design

Non-diegetic or semi-diegetic speech design.

| Meta | Value |
|---|---|
| Plural label | Voiceover Designs |
| Category | Production |
| Tier | 1 |
| Sort order | 644 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Voiceover Design` | General | *Name* |
| `character_id` | reference → `character` |  |  | General | *Character (whose voice)* |
| `narration_type` | select<br/>options: `Character Voice-Over`, `Omniscient Narrator`, `Internal Monologue` |  |  | General | *Narration Type* |
| `acoustic_treatment` | select<br/>options: `Intimate (close, dry)`, `Distanced (room, space)`, `Stylized` |  |  | General | *Acoustic Treatment* |
| `relationship_to_image` | select<br/>options: `Complements`, `Counterpoints`, `Reveals` |  |  | General | *Relationship to Image* |
| `placement_in_mix` | textarea |  |  | General | *Placement in Mix* |


#### 🔀 `music_sound_relationship` — Music-Sound Relationship

How score and sound design interact.

| Meta | Value |
|---|---|
| Plural label | Music-Sound Relationships |
| Category | Production |
| Tier | 1 |
| Sort order | 645 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Project Default or Scene 23 |
| `scene_id` | reference → `scene` |  |  | General | *Scene (optional)* |
| `hierarchy` | select<br/>options: `Music-Forward`, `Sound-Forward`, `Equal Partners`, `Shifting` |  |  | General | *Hierarchy* |
| `blend_approach` | select<br/>options: `Clear Separation`, `Blurred Boundaries`, `Designed Interaction` |  |  | General | *Blend Approach* |
| `combined_silence` | textarea |  |  | General | *Combined Silence* — placeholder: When both music and sound pull back, and the impact |


---

### Category: Metadata

<a id='category-metadata'></a>

#### ⚖️ `creative_decision` — Creative Decision

Documented rationale for a creative choice.

| Meta | Value |
|---|---|
| Plural label | Creative Decisions |
| Category | Metadata |
| Tier | 1 |
| Sort order | 800 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Decision Title* — placeholder: e.g. Why anamorphic lenses |
| `entity_type` | text |  |  | General | *Related Entity Type* — placeholder: e.g. character, scene, costume |
| `entity_id` | integer |  |  | General | *Related Entity ID* |
| `decision_description` | textarea | yes |  | General | *Decision Description* |
| `options_considered` | json |  |  | General | *Options Considered* — placeholder: ["Option A description", "Option B description"] |
| `why_chosen` | textarea |  |  | General | *Why This Option Chosen* |
| `what_sacrificed` | textarea |  |  | General | *What Was Sacrificed* |
| `what_gained` | textarea |  |  | General | *What Was Gained* |
| `confidence_level` | select<br/>options: `Certain`, `Confident`, `Uncertain`, `Compromised` |  |  | General | *Confidence Level* |


#### 📝 `collaboration_note` — Collaboration Note

Director's guidance to specific collaborators or domains.

| Meta | Value |
|---|---|
| Plural label | Collaboration Notes |
| Category | Metadata |
| Tier | 1 |
| Sort order | 801 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Note Title* |
| `entity_type` | text |  |  | General | *Related Entity Type* |
| `entity_id` | integer |  |  | General | *Related Entity ID* |
| `domain` | text |  |  | General | *Domain / Area* — placeholder: e.g. Cinematography, Costume, Sound |
| `note_text` | textarea | yes |  | General | *Note Text* |
| `note_type` | select<br/>options: `Vision Communication`, `Problem-Solving`, `Permission-Granting`, `Boundary-Setting`, `Question-Posing` |  |  | General | *Note Type* |
| `priority` | select<br/>options: `Critical`, `Important`, `Optional` |  |  | General | *Priority* |
| `response_expected` | select<br/>options: `Execution`, `Interpretation`, `Options` |  |  | General | *Response Expected* |


#### 📎 `asset` — Asset

External file reference — image, model, audio, document.

| Meta | Value |
|---|---|
| Plural label | Assets |
| Category | Metadata |
| Tier | 1 |
| Sort order | 802 |

**Fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *File Name* |
| `file_path` | text | yes |  | General | *File Path* |
| `file_type` | select<br/>options: `Image`, `3D Model`, `Audio`, `Video`, `Document`, `Project File` |  |  | General | *File Type* |
| `purpose` | select<br/>options: `Reference`, `Concept`, `Pre-Production`, `Production`, `Post-Production` |  |  | General | *Purpose* |
| `department` | text |  |  | General | *Department* |
| `creator` | text |  |  | General | *Creator* |
| `approval_status` | select<br/>options: `WIP`, `Pending`, `Approved`, `Final` |  |  | General | *Approval Status* |
| `resolution` | text |  |  | Technical | *Resolution* |
| `color_space` | text |  |  | Technical | *Color Space* |
| `duration` | integer |  |  | Technical | *Duration (seconds)* |
| `file_size` | integer |  |  | Technical | *File Size (bytes)* |

**Tabs:** `General`, `Technical`


---
