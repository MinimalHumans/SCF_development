# SCF Schema Reference

*Auto-generated from `entity_registry.py` on 2026-05-15 UTC. Do not edit by hand — re-run `scripts/generate_schema_docs.py` instead.*

---

## Summary

- **Total entities:** 111
- **Total declared visible fields:** 962
- **Total auto-injected fields:** 124 (from `versionable` / `has_lifecycle_status` / `has_external_id` flags)
- **Categories:** 15
- **Versionable:** 2 entities
- **Has lifecycle status:** 100 entities
- **Has external ID:** 8 entities

---

## Table of contents

- [Project](#category-project) (1 entities)
- [Story Entities](#category-story-entities) (3 entities)
- [Story Structure](#category-story-structure) (4 entities)
- [Vision](#category-vision) (1 entities)
- [Connections](#category-connections) (12 entities)
- [Creative Direction](#category-creative-direction) (17 entities)
- [Character Depth](#category-character-depth) (11 entities)
- [Asset Reference](#category-asset-reference) (3 entities)
- [Performance Corpus](#category-performance-corpus) (4 entities)
- [Workflow State](#category-workflow-state) (2 entities)
- [Location Depth](#category-location-depth) (4 entities)
- [Scene Detail](#category-scene-detail) (7 entities)
- [Thematic Tracking](#category-thematic-tracking) (13 entities)
- [Production](#category-production) (26 entities)
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

**All enum values across the schema are lowercase**, with two carve-outs for legibility:

- **Acronyms stay uppercase.** Camera framing acronyms (`EWS`, `WS`, `MS`, `MCU`, `CU`, `ECU`, `OTS`, `POV`), color spaces (`Rec.709`, `DCI-P3`), standards (`ACES`, `DCP`, `BVH`), resolution tokens (`2K`, `4K`, `8K`), mixed-case proper nouns (`ProRes`, `ARRIRAW`, `REDCODE`, `ARRI`, `Dolby`, `Atmos`, `Stereo`). The principle: when a token is a domain acronym or proper noun that everyone in film/VFX writes a specific way, we honor that — strict lowercase would harm legibility (`mcu` reads worse than `MCU`).
- **Embedded punctuation and numerics preserved.** Slashes (`int/ext`, `mentor/mentee`), hyphens (`pre-production`, `actor-focused`), parens with technical content (`1.85:1 (flat)`, `intimate (0-18in)`) — only descriptive words inside are lowercased; technical content stays intact.

Display layers may capitalize for UI; the stored value is canonical lowercase (with the acronym carve-outs). This sidesteps "is this a display label or a value?" comparison bugs across tools.

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
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Project Name* — placeholder: e.g. My Feature Film |
| `logline` | textarea |  |  | General | *Logline* — placeholder: A one-sentence summary of the story |
| `genre` | select<br/>options: `drama`, `comedy`, `thriller`, `sci-fi`, `fantasy`, `horror`, `action`, `romance`, `documentary`, `animation`, `western`, `other` |  |  | General | *Genre* |
| `tone` | text |  |  | General | *Tone* — placeholder: e.g. Dark, whimsical, gritty |
| `setting_period` | text |  |  | General | *Setting / Time Period* — placeholder: e.g. Victorian England, Near-future Tokyo |
| `target_runtime` | integer |  |  | General | *Target Runtime (minutes)* |
| `project_format` | select<br/>options: `feature`, `series`, `short`, `commercial`, `other` |  |  | General | *Format* — The form factor of the project |
| `production_status` | select<br/>options: `development`, `pre_production`, `production`, `post_production`, `complete` |  | `development` | General | *Production Status* — Project-level production phase axis. Distinct from lifecycle_status and from scene/act/sequence writing-process status. |
| `workflow_mode` | select<br/>options: `performance_first`, `generation_first`, `hybrid` |  | `generation_first` | General | *Workflow Mode* — Dominant production workflow stance for this project. performance_first = footage-driven (Rango-style); generation_first = synthesis-driven; hybrid = mixed. |
| `notes` | textarea |  |  | Notes | *Notes* |
| `vision_statement` | textarea |  |  | Vision | *Vision Statement* — The director's overarching vision for this project |
| `creative_philosophy` | textarea |  |  | Vision | *Creative Philosophy* |
| `themes` | json |  |  | Vision | *Core Themes* — placeholder: ["redemption", "identity", "power"] — JSON array of thematic keywords |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Notes`, `Vision`, `Lifecycle`, `External`


---

### Category: Story Entities

<a id='category-story-entities'></a>

#### 👤 `character` — Character

A character in the story. Identity and narrative function only — physical/vocal/wardrobe details live in Tier 2 description entities.

| Meta | Value |
|---|---|
| Plural label | Characters |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 10 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Character Name* — placeholder: e.g. Eleanor Vance |
| `role` | select<br/>options: `protagonist`, `antagonist`, `supporting`, `minor`, `background`, `narrator` |  |  | General | *Role* |
| `archetype` | text |  |  | General | *Archetype* — placeholder: e.g. The Mentor, The Trickster |
| `age` | text |  |  | General | *Age* — placeholder: e.g. 34, Late 20s, Ageless |
| `gender` | text |  |  | General | *Gender* |
| `pronouns` | text |  |  | General | *Pronouns* — placeholder: e.g. he/him, she/her, they/them |
| `occupation` | text |  |  | General | *Occupation* |
| `casting_status` | select<br/>options: `tbd`, `cast`, `actor_as_character`, `digital_double`, `generated_only` |  | `tbd` | General | *Casting Status* — Whether this character has a real-world actor anchor. Drives downstream tool expectations. |
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

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Backstory`, `Lifecycle`, `External`


#### 📍 `location` — Location

A location where story events take place.

| Meta | Value |
|---|---|
| Plural label | Locations |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 20 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Location Name* — placeholder: e.g. The Old Mill |
| `location_type` | select<br/>options: `interior`, `exterior`, `int/ext`, `virtual`, `abstract` |  |  | General | *Type* |
| `setting` | textarea |  |  | General | *Setting Description* — placeholder: What does this place look and feel like? |
| `time_period` | text |  |  | General | *Time Period* |
| `geography` | text |  |  | General | *Geography / Region* — placeholder: e.g. Northern California coast |
| `mood` | textarea |  |  | Atmosphere | *Mood / Atmosphere* — placeholder: What feeling does this place evoke? |
| `lighting` | textarea |  |  | Atmosphere | *Lighting* — placeholder: e.g. Harsh fluorescent, Dappled sunlight through canopy |
| `color_palette` | text |  |  | Atmosphere | *Color Palette* — placeholder: e.g. Warm ambers, desaturated greens |
| `time_of_day` | select<br/>options: `dawn`, `morning`, `midday`, `afternoon`, `dusk`, `night`, `varies` |  |  | Atmosphere | *Typical Time of Day* |
| `weather` | text |  |  | Atmosphere | *Weather* |
| `ambient_sound` | textarea |  |  | Sound | *Ambient Sound* — placeholder: e.g. Distant traffic, birdsong, mechanical hum |
| `sound_notes` | textarea |  |  | Sound | *Sound Design Notes* |
| `key_features` | textarea |  |  | Details | *Key Features* — placeholder: Notable objects, architecture, landmarks within this location |
| `props_present` | textarea |  |  | Details | *Props Typically Present* |
| `notes` | textarea |  |  | Details | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Atmosphere`, `Sound`, `Details`, `Lifecycle`


#### 🔧 `prop` — Prop

A significant object in the story.

| Meta | Value |
|---|---|
| Plural label | Props |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 30 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Prop Name* — placeholder: e.g. The Silver Compass |
| `prop_type` | select<br/>options: `hand prop`, `set dressing`, `vehicle`, `weapon`, `document`, `technology`, `clothing item`, `food/drink`, `other` |  |  | General | *Type* |
| `description` | textarea |  |  | General | *Description* — placeholder: What does this prop look like? |
| `narrative_significance` | textarea |  |  | General | *Narrative Significance* — placeholder: Why does this prop matter to the story? |
| `story_function` | select<br/>options: `macguffin`, `character extension`, `plot device`, `symbol`, `atmosphere`, `other` |  |  | General | *Story Function* |
| `associated_character` | reference → `character` |  |  | General | *Primary Character* |
| `material` | text |  |  | Physical | *Material* — placeholder: e.g. Tarnished silver, worn leather |
| `size` | text |  |  | Physical | *Size* — placeholder: e.g. Palm-sized, 6 feet tall |
| `color` | text |  |  | Physical | *Color* |
| `condition` | text |  |  | Physical | *Condition* — placeholder: e.g. Pristine, battle-worn, ancient |
| `physical_notes` | textarea |  |  | Physical | *Physical Notes* |
| `first_appearance` | textarea |  |  | Story | *First Appearance* — placeholder: When/where does this prop first appear? |
| `key_moments` | textarea |  |  | Story | *Key Moments* — placeholder: Important scenes involving this prop |
| `symbolism` | textarea |  |  | Story | *Symbolism* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Physical`, `Story`, `Notes`, `Lifecycle`


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
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Act Name* — placeholder: e.g. Act One, The Setup, Episode 1 Act A |
| `act_number` | integer |  |  | General | *Act Number* — placeholder: Position in the structure: 1, 2, 3... |
| `function` | textarea |  |  | General | *Function* — placeholder: What does this act do in the story? |
| `dramatic_question` | textarea |  |  | General | *Dramatic Question* — placeholder: The central question this act poses |
| `shift` | textarea |  |  | General | *Shift* — placeholder: What changes from the start to the end of this act? |
| `summary` | textarea |  |  | General | *Summary* |
| `status` | select<br/>options: `outline`, `draft`, `revised`, `locked`, `cut` |  | `outline` | General | *Status* — Writing-process status. Distinct from lifecycle_status. |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Notes`, `Lifecycle`


#### 📑 `sequence` — Sequence

A group of related scenes forming a narrative unit.

| Meta | Value |
|---|---|
| Plural label | Sequences |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 35 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Sequence Name* — placeholder: e.g. The Heist |
| `sequence_number` | integer |  |  | General | *Sequence Number* |
| `act_id` | reference → `act` |  |  | General | *Act* |
| `summary` | textarea |  |  | General | *Summary* |
| `goal` | textarea |  |  | General | *Goal* |
| `conflict` | textarea |  |  | General | *Conflict* |
| `outcome` | textarea |  |  | General | *Outcome / Resolution* |
| `purpose` | textarea |  |  | General | *Dramatic Purpose* |
| `turning_point` | textarea |  |  | General | *Turning Point* |
| `status` | select<br/>options: `outline`, `draft`, `revised`, `locked`, `cut` |  | `outline` | General | *Status* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Notes`, `Lifecycle`


#### 🎬 `scene` — Scene

A single scene in the story.

| Meta | Value |
|---|---|
| Plural label | Scenes |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 40 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Scene Name / Slug* — placeholder: e.g. INT. COFFEE SHOP - MORNING |
| `scene_number` | integer |  |  | General | *Scene Number* |
| `int_ext` | select<br/>options: `interior`, `exterior`, `int/ext` |  |  | General | *Int/Ext* |
| `location_id` | reference → `location` |  |  | General | *Location* |
| `time_of_day` | select<br/>options: `dawn`, `morning`, `midday`, `afternoon`, `dusk`, `night`, `continuous` |  |  | General | *Time of Day* |
| `weather_conditions` | text |  |  | General | *Weather* |
| `season` | select<br/>options: `spring`, `summer`, `autumn`, `winter`, `unspecified` |  |  | General | *Season* |
| `summary` | textarea |  |  | General | *Scene Summary* |
| `purpose` | textarea |  |  | General | *Dramatic Purpose* |
| `status` | select<br/>options: `outline`, `draft`, `revised`, `locked`, `cut` |  | `outline` | General | *Status* |
| `character_dynamics` | textarea |  |  | Characters | *Character Dynamics* |
| `emotional_beat` | textarea |  |  | Emotional | *Emotional Beat* |
| `tone` | text |  |  | Emotional | *Tone* |
| `tension_level` | integer |  |  | Emotional | *Tension Level (1-10)* |
| `thematic_connection` | textarea |  |  | Emotional | *Thematic Connection* |
| `visual_style` | textarea |  |  | Technical | *Visual Style Notes* |
| `sound_design` | textarea |  |  | Technical | *Sound Design Notes* |
| `music_notes` | textarea |  |  | Technical | *Music Notes* |
| `estimated_duration` | integer |  |  | Technical | *Estimated Duration (seconds)* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Hidden fields** (not shown in editor UI):

- `characters_present` (json)

**Tabs:** `General`, `Characters`, `Emotional`, `Technical`, `Notes`, `Lifecycle`, `External`


#### 🎯 `story_beat` — Story Beat

A discrete narrative unit within a scene — a moment of change.

| Meta | Value |
|---|---|
| Plural label | Story Beats |
| Category | Story Structure |
| Tier | 0 |
| Sort order | 42 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Beat Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `beat_order` | integer |  |  | General | *Order in Scene* |
| `beat_type` | select<br/>options: `setup`, `action`, `reaction`, `decision`, `discovery`, `revelation`, `reversal`, `payoff`, `other` |  |  | General | *Beat Type* |
| `description` | textarea |  |  | General | *Description* |
| `purpose` | textarea |  |  | General | *Purpose* |
| `value_shift` | text |  |  | General | *Value Shift* — placeholder: e.g. Hope → Despair, Trust → Doubt |
| `pov_character_id` | reference → `character` |  |  | General | *POV Character* |
| `notes` | textarea |  |  | General | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


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
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Theme Name* — placeholder: e.g. Redemption |
| `description` | textarea |  |  | General | *Description* |
| `motifs` | json |  |  | General | *Associated Motifs* |
| `character_connections` | textarea |  |  | General | *Character Connections* |
| `scene_connections` | textarea |  |  | General | *Key Scenes* |
| `evolution` | textarea |  |  | General | *Thematic Evolution* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Notes`, `Lifecycle`


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

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `role_in_scene` | select<br/>options: `featured`, `supporting`, `background`, `mentioned`, `voiceover` |  |  | General | *Role in Scene* |
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

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `usage_note` | text |  |  | General | *Usage Note* |
| `significance` | select<br/>options: `key`, `present`, `background`, `mentioned` |  |  | General | *Significance* |

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

**Declared fields:**

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
| Tier | 0 |
| Sort order | 63 |

**Declared fields:**

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
| Tier | 0 |
| Sort order | 64 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `visual_motif_id` | reference → `visual_motif` | yes |  | General | *Visual Motif* |
| `entity_type` | select<br/>options: `location`, `prop`, `costume`, `scene`, `shot` |  |  | General | *Entity Type* |
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
| Tier | 0 |
| Sort order | 65 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `conceptual_motif_id` | reference → `conceptual_motif` | yes |  | General | *Conceptual Motif* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `entity_type` | select<br/>options: `dialogue`, `action`, `visual`, `audio` |  |  | General | *Domain* |
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
| Tier | 0 |
| Sort order | 66 |

**Declared fields:**

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
| Tier | 0 |
| Sort order | 67 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `asset_id` | reference → `asset` | yes |  | General | *Asset* |
| `entity_type` | text | yes |  | General | *Entity Type* |
| `entity_id` | integer | yes |  | General | *Entity ID* |
| `relationship_type` | select<br/>options: `reference for`, `concept of`, `generated from`, `variant of` |  |  | General | *Relationship Type* |
| `context_notes` | textarea |  |  | General | *Context Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `bundle_asset` — Bundle-Asset

Junction: assets that compose a bundle.

| Meta | Value |
|---|---|
| Plural label | Bundle-Assets |
| Category | Connections |
| Tier | 0 |
| Sort order | 68 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `bundle_id` | reference → `bundle` | yes |  | General | *Bundle* |
| `asset_id` | reference → `asset` | yes |  | General | *Asset* |
| `role_in_bundle` | text |  |  | General | *Role in Bundle* — placeholder: e.g. "front view neutral", "phoneme /θ/", "anger reaction" |
| `order` | integer |  |  | General | *Order* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `actor_character_role` — Actor-Character Role

Junction: actor + character + role type. Handles all combinations: one actor playing multiple characters, multiple actors playing one character (principal, body double, voice double, ADR, mocap).

| Meta | Value |
|---|---|
| Plural label | Actor-Character Roles |
| Category | Connections |
| Tier | 0 |
| Sort order | 69 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `actor_id` | reference → `actor` | yes |  | General | *Actor* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `role_type` | select<br/>options: `principal`, `body_double`, `stunt_double`, `voice_double`, `adr`, `motion_capture`, `reference_only`, `other` | yes |  | General | *Role Type* |
| `scope` | select<br/>options: `whole_project`, `specific_scenes`, `specific_takes` |  | `whole_project` | General | *Scope* |
| `scope_details` | textarea |  |  | General | *Scope Details* — placeholder: When scope isn't whole_project |
| `notes` | textarea |  |  | General | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Hidden fields** (not shown in editor UI):

- `name` (text)

**Tabs:** `General`, `Lifecycle`


#### 🔗 `take_scene` — Take-Scene

Junction: scenes covered by a take. Takes can cross scenes.

| Meta | Value |
|---|---|
| Plural label | Take-Scenes |
| Category | Connections |
| Tier | 0 |
| Sort order | 70 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `take_id` | reference → `take` | yes |  | General | *Take* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `order_in_take` | integer |  |  | General | *Order in Take* — Which scene comes first in the take. |
| `coverage_completeness` | select<br/>options: `partial`, `complete`, `incidental` |  | `complete` | General | *Coverage Completeness* — incidental = take caught the scene in passing, not trying to cover it. |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `clip_character` — Clip-Character

Junction: characters present in a clip with their role.

| Meta | Value |
|---|---|
| Plural label | Clip-Characters |
| Category | Connections |
| Tier | 0 |
| Sort order | 71 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `clip_id` | reference → `clip` | yes |  | General | *Clip* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `role_in_clip` | select<br/>options: `featured`, `supporting`, `background` |  | `featured` | General | *Role in Clip* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


---

### Category: Creative Direction

<a id='category-creative-direction'></a>

#### 🔭 `project_vision` — Project Vision

Overarching creative intent.

| Meta | Value |
|---|---|
| Plural label | Project Vision |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 100 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Project Vision` | General | *Name* |
| `vision_statement` | textarea |  |  | General | *Vision Statement* |
| `core_question` | textarea |  |  | General | *Core Question* |
| `intended_audience_impact` | textarea |  |  | General | *Intended Audience Impact* |
| `unique_perspective` | textarea |  |  | General | *Unique Perspective* |
| `why_tell_this_story` | textarea |  |  | General | *Why Tell This Story* |
| `what_makes_different` | textarea |  |  | General | *What Makes It Different* |
| `success_criteria` | textarea |  |  | General | *Success Criteria* |
| `personal_resonance` | textarea |  |  | Personal | *Personal Resonance* |
| `emotional_stakes` | textarea |  |  | Personal | *Emotional Stakes for Director* |
| `artistic_growth_goals` | textarea |  |  | Personal | *Artistic Growth Goals* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Personal`, `Lifecycle`


#### 🎯 `directorial_philosophy` — Directorial Philosophy

The director's approach to filmmaking on this project.

| Meta | Value |
|---|---|
| Plural label | Directorial Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 101 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Directorial Philosophy` | General | *Name* |
| `filmmaking_philosophy` | select<br/>options: `auteur`, `collaborative`, `actor-focused`, `visual-first`, `story-first`, `experiential` |  |  | General | *Filmmaking Philosophy* |
| `technical_approach` | select<br/>options: `naturalistic`, `stylized`, `mixed` |  |  | General | *Technical Approach* |
| `aesthetic_priorities` | json |  |  | General | *Aesthetic Priorities* |
| `risk_tolerance` | select<br/>options: `safe/commercial`, `experimental`, `balanced` |  |  | General | *Risk Tolerance* |
| `audience_relationship` | select<br/>options: `accessible`, `challenging`, `hybrid` |  |  | General | *Audience Relationship* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### ⚙️ `technical_specs` — Technical Specs

Technical format specifications for the project.

| Meta | Value |
|---|---|
| Plural label | Technical Specs |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 102 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Technical Specs` | General | *Name* |
| `aspect_ratio` | select<br/>options: `1.33:1 (academy)`, `1.66:1`, `1.78:1 (16:9)`, `1.85:1 (flat)`, `2.00:1 (univisium)`, `2.20:1 (70mm)`, `2.35:1 (scope)`, `2.39:1 (anamorphic)`, `2.76:1 (ultra panavision)`, `variable`, `other` |  |  | General | *Aspect Ratio* |
| `resolution` | select<br/>options: `2K (2048x1080)`, `2.8K`, `3.4K`, `4K (4096x2160)`, `4.6K`, `5.7K`, `6K`, `6.5K`, `8K`, `other` |  |  | General | *Resolution* |
| `frame_rate` | select<br/>options: `23.976 fps`, `24 fps`, `25 fps`, `29.97 fps`, `30 fps`, `48 fps`, `60 fps`, `variable`, `other` |  |  | General | *Frame Rate* |
| `color_space` | text |  |  | General | *Color Space / Gamut* |
| `recording_codec` | text |  |  | General | *Recording Codec* |
| `delivery_format` | text |  |  | General | *Delivery Format* |
| `audio_format` | text |  |  | General | *Audio Format* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 👁️ `visual_identity` — Visual Identity

Overarching aesthetic vision — the film's visual DNA.

| Meta | Value |
|---|---|
| Plural label | Visual Identity |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 103 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Visual Identity` | General | *Name* |
| `visual_statement` | textarea |  |  | General | *Visual Statement* |
| `aesthetic_genre` | select<br/>options: `naturalistic`, `stylized`, `hyperreal`, `expressionistic`, `fantastical`, `hybrid` |  |  | General | *Aesthetic Genre* |
| `design_era` | text |  |  | General | *Design Era / Period* |
| `visual_density` | select<br/>options: `minimalist`, `moderate`, `dense`, `maximalist` |  |  | General | *Visual Density* |
| `textural_philosophy` | select<br/>options: `clean/pristine`, `lived-in`, `weathered`, `decayed` |  |  | General | *Textural Philosophy* |
| `visual_influences` | json |  |  | Influences | *Visual Influences* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Influences`, `Lifecycle`


#### 🎥 `cinematographic_philosophy` — Cinematographic Philosophy

Overall approach to camera, movement, and visual storytelling.

| Meta | Value |
|---|---|
| Plural label | Cinematographic Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 104 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Cinematographic Philosophy` | General | *Name* |
| `camera_personality` | select<br/>options: `objective observer`, `subjective participant`, `omniscient presence`, `character-aligned` |  |  | General | *Camera Personality* |
| `movement_philosophy` | select<br/>options: `static`, `fluid`, `motivated`, `expressive` |  |  | General | *Movement Philosophy* |
| `framing_philosophy` | select<br/>options: `classical`, `dynamic`, `intimate`, `epic` |  |  | General | *Framing Philosophy* |
| `visual_consistency` | select<br/>options: `unified`, `varied`, `evolving` |  |  | General | *Visual Consistency* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎨 `project_color_palette` — Project Color Palette

Overall color scheme and color rules for the entire project.

| Meta | Value |
|---|---|
| Plural label | Project Color Palette |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 105 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Project Color Palette` | General | *Name* |
| `primary_colors` | json |  |  | General | *Primary Colors (3-5)* |
| `secondary_colors` | json |  |  | General | *Secondary Colors* |
| `accent_colors` | json |  |  | General | *Accent Colors* |
| `restricted_colors` | json |  |  | General | *Restricted Colors* |
| `saturation_philosophy` | select<br/>options: `highly saturated`, `desaturated`, `mixed`, `neutral-heavy` |  |  | General | *Saturation Philosophy* |
| `value_structure` | select<br/>options: `high key`, `low key`, `full range`, `compressed` |  |  | General | *Value Structure* |
| `color_evolution` | textarea |  |  | Evolution | *Color Evolution by Act* |
| `color_relationships` | textarea |  |  | Evolution | *Color Relationships* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Evolution`, `Lifecycle`


#### 🌡️ `project_tone` — Project Tone

Overall tonal identity — the emotional temperature of the film.

| Meta | Value |
|---|---|
| Plural label | Project Tone |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 106 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Project Tone` | General | *Name* |
| `primary_tone` | text |  |  | General | *Primary Tone* |
| `tone_blend` | json |  |  | General | *Tone Blend* |
| `lightest_moment` | textarea |  |  | General | *Lightest Moments* |
| `darkest_moment` | textarea |  |  | General | *Darkest Moments* |
| `tonal_consistency` | select<br/>options: `unified`, `varied`, `shifting` |  |  | General | *Tonal Consistency* |
| `reference_touchstones` | textarea |  |  | General | *Reference Touchstones* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### ⏱️ `pacing_strategy` — Pacing Strategy

Rhythm and timing philosophy at the story level.

| Meta | Value |
|---|---|
| Plural label | Pacing Strategy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 107 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Pacing Strategy` | General | *Name* |
| `overall_pacing` | select<br/>options: `slow/contemplative`, `moderate/balanced`, `fast/urgent`, `variable/dynamic` |  |  | General | *Overall Pacing* |
| `pacing_philosophy` | textarea |  |  | General | *Pacing Philosophy* |
| `breathing_room_strategy` | textarea |  |  | General | *Breathing Room Strategy* |
| `key_acceleration_points` | textarea |  |  | General | *Key Acceleration Points* |
| `key_deceleration_points` | textarea |  |  | General | *Key Deceleration Points* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔊 `sonic_identity` — Sonic Identity

Overall approach to the film's sound world.

| Meta | Value |
|---|---|
| Plural label | Sonic Identity |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 108 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Sonic Identity` | General | *Name* |
| `sound_aesthetic` | select<br/>options: `naturalistic`, `heightened`, `stylized`, `surreal` |  |  | General | *Sound Aesthetic* |
| `sonic_density` | select<br/>options: `sparse`, `moderate`, `dense`, `overwhelming` |  |  | General | *Sonic Density* |
| `silence_philosophy` | textarea |  |  | General | *Silence Philosophy* |
| `subjective_sound_approach` | textarea |  |  | General | *Subjective Sound Approach* |
| `sound_evolution` | textarea |  |  | General | *Sound Evolution* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎵 `musical_identity` — Musical Identity

Overall approach to the film's music and score.

| Meta | Value |
|---|---|
| Plural label | Musical Identity |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 109 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Musical Identity` | General | *Name* |
| `score_approach` | select<br/>options: `traditional orchestral`, `electronic/synthesized`, `hybrid`, `acoustic/intimate`, `genre-specific` |  |  | General | *Score Approach* |
| `musical_tone` | select<br/>options: `emotional support`, `counterpoint`, `commentary`, `neutral/ambient` |  |  | General | *Musical Tone* |
| `instrumentation_palette` | textarea |  |  | General | *Instrumentation Palette* |
| `score_density` | select<br/>options: `wall-to-wall`, `selective`, `sparse` |  |  | General | *Score Density* |
| `source_music_approach` | textarea |  |  | General | *Source Music Approach* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📐 `design_constraints` — Design Constraints

Intentional boundaries that shape the visual world.

| Meta | Value |
|---|---|
| Plural label | Design Constraints |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 110 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Design Constraints` | General | *Name* |
| `allowed_materials` | json |  |  | General | *Allowed Materials* |
| `forbidden_materials` | json |  |  | General | *Forbidden Materials* |
| `dominant_materials` | text |  |  | General | *Dominant Materials* |
| `technology_level` | text |  |  | General | *Technology Level* |
| `technology_aesthetic` | text |  |  | General | *Technology Aesthetic* |
| `architectural_styles` | text |  |  | General | *Architectural Styles* |
| `scale_rules` | select<br/>options: `human scale`, `intimate`, `monumental`, `mixed` |  |  | General | *Scale Rules* |
| `geometric_language` | select<br/>options: `organic`, `angular`, `mixed` |  |  | General | *Geometric Language* |
| `lighting_constraints` | textarea |  |  | General | *Lighting Constraints* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🖼️ `look_development` — Look Development

Target visual look for the final image — grading and post direction.

| Meta | Value |
|---|---|
| Plural label | Look Development |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 111 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Look Development` | General | *Name* |
| `contrast` | select<br/>options: `flat`, `normal`, `high` |  |  | General | *Contrast* |
| `saturation` | select<br/>options: `desaturated`, `normal`, `vivid` |  |  | General | *Saturation* |
| `color_bias` | select<br/>options: `warm`, `cool`, `neutral`, `tinted` |  |  | General | *Color Bias* |
| `highlight_handling` | select<br/>options: `preserved`, `blown`, `rolled-off` |  |  | General | *Highlight Handling* |
| `shadow_handling` | select<br/>options: `crushed`, `lifted`, `detailed` |  |  | General | *Shadow Handling* |
| `grain_texture` | select<br/>options: `clean`, `subtle grain`, `heavy grain` |  |  | General | *Grain / Texture* |
| `on_set_lut` | text |  |  | LUTs | *On-Set LUT* |
| `editorial_lut` | text |  |  | LUTs | *Editorial LUT* |
| `final_grade_foundation` | textarea |  |  | LUTs | *Final Grade Foundation* |
| `reference_images` | textarea |  |  | References | *Reference Images / Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `LUTs`, `References`, `Lifecycle`


#### 📹 `coverage_philosophy` — Coverage Philosophy

Approach to shooting and editorial coverage.

| Meta | Value |
|---|---|
| Plural label | Coverage Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 112 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Coverage Philosophy` | General | *Name* |
| `coverage_style` | select<br/>options: `master + coverage`, `single camera`, `multi-camera`, `oner/long take`, `run-and-gun`, `shot-list driven` |  |  | General | *Coverage Style* |
| `editorial_approach` | select<br/>options: `cut-friendly`, `in-camera editing`, `improvised` |  |  | General | *Editorial Approach* |
| `coverage_priorities` | textarea |  |  | General | *Coverage Priorities* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 👗 `costume_design_philosophy` — Costume Design Philosophy

Overall approach to wardrobe and costume design.

| Meta | Value |
|---|---|
| Plural label | Costume Design Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 113 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Costume Design Philosophy` | General | *Name* |
| `design_approach` | select<br/>options: `period-accurate`, `period-inspired`, `contemporary`, `timeless`, `stylized`, `fantastical` |  |  | General | *Design Approach* |
| `silhouette_strategy` | textarea |  |  | General | *Silhouette Strategy* |
| `fabric_philosophy` | select<br/>options: `natural`, `synthetic`, `mixed` |  |  | General | *Fabric Philosophy* |
| `formality_spectrum` | textarea |  |  | General | *Formality Spectrum* |
| `condition_philosophy` | textarea |  |  | General | *Condition Philosophy* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🧱 `material_palette` — Material Palette

Dominant materials and textures in the film's world.

| Meta | Value |
|---|---|
| Plural label | Material Palette |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 114 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Material Palette` | General | *Name* |
| `primary_materials` | json |  |  | General | *Primary Materials* |
| `secondary_materials` | json |  |  | General | *Secondary Materials* |
| `accent_materials` | json |  |  | General | *Accent Materials* |
| `forbidden_materials` | json |  |  | General | *Forbidden Materials* |
| `material_storytelling` | textarea |  |  | General | *Material Storytelling* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🪨 `texture_philosophy` — Texture Philosophy

Approach to surface quality throughout the film.

| Meta | Value |
|---|---|
| Plural label | Texture Philosophy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 115 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Texture Philosophy` | General | *Name* |
| `texture_spectrum` | select<br/>options: `smooth dominance`, `rough dominance`, `mixed` |  |  | General | *Texture Spectrum* |
| `texture_contrast_strategy` | textarea |  |  | General | *Texture Contrast Strategy* |
| `surface_finish_preference` | textarea |  |  | General | *Surface Finish Preference* |
| `patina_aging_approach` | textarea |  |  | General | *Patina & Aging Approach* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🌡️ `color_temperature_strategy` — Color Temperature Strategy

Warm/cool distribution across the story.

| Meta | Value |
|---|---|
| Plural label | Color Temperature Strategy |
| Category | Creative Direction |
| Tier | 1 |
| Sort order | 116 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Color Temperature Strategy` | General | *Name* |
| `overall_approach` | select<br/>options: `warm`, `cool`, `balanced`, `journey` |  |  | General | *Overall Approach* |
| `warm_associations` | textarea |  |  | General | *Warm Associations* |
| `cool_associations` | textarea |  |  | General | *Cool Associations* |
| `temperature_contrast_points` | textarea |  |  | General | *Temperature Contrast Points* |
| `day_scene_temperature` | text |  |  | General | *Day Scene Temperature* |
| `night_scene_temperature` | text |  |  | General | *Night Scene Temperature* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---

### Category: Character Depth

<a id='category-character-depth'></a>

#### 🤝 `character_relationship` — Character Relationship

Relationship between two characters with dynamics and evolution.

| Meta | Value |
|---|---|
| Plural label | Character Relationships |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 200 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Relationship Label* — placeholder: e.g. Father/Son, Rivals |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` | yes |  | General | *Character B* |
| `relationship_type` | select<br/>options: `family`, `friend`, `enemy`, `lover`, `colleague`, `mentor/mentee`, `rival`, `authority`, `other` |  |  | General | *Type* |
| `specific_relationship` | text |  |  | General | *Specific Relationship* |
| `emotional_valence` | select<br/>options: `positive`, `negative`, `complex`, `neutral` |  |  | General | *Emotional Valence* |
| `power_dynamic` | textarea |  |  | General | *Power Dynamic* |
| `relationship_arc` | textarea |  |  | General | *Relationship Arc* |
| `history` | textarea |  |  | Background | *History* |
| `current_status` | text |  |  | Background | *Current Status* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Background`, `Lifecycle`


#### 🏃 `physical_character_profile` — Physical Character Profile

Baseline physical existence — posture, movement, tension, energy.

| Meta | Value |
|---|---|
| Plural label | Physical Character Profiles |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 202 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Physicality |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `height` | text |  |  | General | *Height* — placeholder: e.g. 5'10", Tall, Average |
| `build` | select<br/>options: `slim`, `athletic`, `average`, `stocky`, `heavy`, `muscular`, `frail`, `other` |  |  | General | *Build* |
| `posture` | select<br/>options: `upright`, `slouched`, `rigid`, `relaxed`, `asymmetric` |  |  | General | *Posture* |
| `center_of_gravity` | select<br/>options: `high`, `low`, `forward`, `back` |  |  | General | *Center of Gravity* |
| `tension_level` | select<br/>options: `tense`, `relaxed`, `variable` |  |  | General | *Physical Tension Level* |
| `energy_quality` | select<br/>options: `kinetic`, `still`, `restless`, `contained` |  |  | General | *Energy Quality* |
| `movement_style` | textarea |  |  | Movement | *Movement Style* |
| `movement_speed` | select<br/>options: `quick`, `slow`, `deliberate`, `erratic` |  |  | Movement | *Movement Speed* |
| `movement_fluidity` | select<br/>options: `smooth`, `jerky`, `graceful`, `awkward` |  |  | Movement | *Movement Fluidity* |
| `movement_economy` | select<br/>options: `efficient`, `wasteful`, `precise`, `sloppy` |  |  | Movement | *Movement Economy* |
| `movement_weight` | select<br/>options: `light`, `heavy`, `grounded`, `floating` |  |  | Movement | *Movement Weight* |
| `spatial_presence` | select<br/>options: `takes up space`, `minimizes self` |  |  | Presence | *Spatial Presence* |
| `physical_comfort` | select<br/>options: `at home in body`, `disconnected` |  |  | Presence | *Physical Comfort* |
| `coordination_level` | text |  |  | Presence | *Coordination Level* |
| `physical_training_visible` | textarea |  |  | History | *Physical Training Visible* |
| `physical_neglect_visible` | textarea |  |  | History | *Physical Neglect Visible* |
| `injuries_visible_in_movement` | textarea |  |  | History | *Injuries Visible in Movement* |
| `physical_notes` | textarea |  |  | History | *Physical Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Movement`, `Presence`, `History`, `Lifecycle`


#### 🗣️ `vocal_profile` — Vocal Profile

Baseline vocal identity — how a character sounds.

| Meta | Value |
|---|---|
| Plural label | Vocal Profiles |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 203 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Voice |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `voice_quality` | text |  |  | General | *Voice Quality* — placeholder: e.g. Deep, gravelly, warm |
| `pitch_range` | select<br/>options: `high`, `low`, `middle`, `variable` |  |  | General | *Pitch Range* |
| `timbre` | select<br/>options: `warm`, `nasal`, `resonant`, `thin`, `gravelly` |  |  | General | *Timbre* |
| `volume_tendency` | select<br/>options: `loud`, `soft`, `variable` |  |  | General | *Volume Tendency* |
| `breathiness_level` | select<br/>options: `none`, `slight`, `moderate`, `heavy` |  |  | General | *Breathiness* |
| `speech_pattern` | textarea |  |  | Speech | *Speech Pattern* |
| `pace` | select<br/>options: `fast`, `slow`, `measured`, `variable` |  |  | Speech | *Pace* |
| `rhythm` | select<br/>options: `regular`, `syncopated`, `halting` |  |  | Speech | *Rhythm* |
| `articulation` | select<br/>options: `precise`, `mumbled`, `clipped`, `drawled` |  |  | Speech | *Articulation* |
| `fluency` | select<br/>options: `smooth`, `stuttered`, `filled pauses` |  |  | Speech | *Fluency* |
| `accent` | text |  |  | Accent | *Accent / Dialect* |
| `regional_markers` | text |  |  | Accent | *Regional Markers* |
| `class_markers` | text |  |  | Accent | *Class Markers* |
| `educational_markers` | text |  |  | Accent | *Educational Markers* |
| `accent_authenticity` | select<br/>options: `native`, `acquired`, `affected` |  |  | Accent | *Accent Authenticity* |
| `vocal_habits` | textarea |  |  | Habits | *Vocal Habits* |
| `filler_words` | json |  |  | Habits | *Filler Words* |
| `catch_phrases` | json |  |  | Habits | *Catch Phrases* |
| `verbal_tics` | json |  |  | Habits | *Verbal Tics* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Speech`, `Accent`, `Habits`, `Lifecycle`


#### 🎭 `delivery_profile` — Delivery Profile

How a character generally delivers lines.

| Meta | Value |
|---|---|
| Plural label | Delivery Profiles |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 204 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Delivery |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `delivery_style` | select<br/>options: `naturalistic`, `theatrical`, `minimalist`, `mannered` |  |  | General | *Delivery Style* |
| `emotional_access` | select<br/>options: `available`, `controlled`, `variable` |  |  | General | *Emotional Access* |
| `subtext_playing` | select<br/>options: `plays clearly`, `hides`, `unaware` |  |  | General | *Subtext Playing* |
| `listening_behavior` | textarea |  |  | General | *Listening Behavior* |
| `interruption_tendencies` | textarea |  |  | General | *Interruption Tendencies* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 😐 `facial_expression_profile` — Facial Expression Profile

Face as performance instrument.

| Meta | Value |
|---|---|
| Plural label | Facial Expression Profiles |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 205 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `resting_face` | textarea |  |  | General | *Resting Face* |
| `expressiveness_level` | select<br/>options: `mobile`, `controlled`, `flat` |  |  | General | *Expressiveness Level* |
| `asymmetries` | text |  |  | General | *Asymmetries* |
| `eye_contact_patterns` | textarea |  |  | Eyes | *Eye Contact Patterns* |
| `gaze_direction_tendencies` | textarea |  |  | Eyes | *Gaze Direction Tendencies* |
| `blink_rate_variations` | text |  |  | Eyes | *Blink Rate Variations* |
| `mouth_tension_patterns` | textarea |  |  | Mouth | *Mouth Tension Patterns* |
| `smile_authenticity` | textarea |  |  | Mouth | *Smile Authenticity* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Eyes`, `Mouth`, `Lifecycle`


#### 👤 `character_appearance_profile` — Character Appearance Profile

Complete visual design — silhouette, distinction, evolution.

| Meta | Value |
|---|---|
| Plural label | Character Appearance Profiles |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 206 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `body_type` | text |  |  | General | *Body Type* |
| `height_proportions` | text |  |  | General | *Height / Proportions* |
| `age_appearance` | text |  |  | General | *Age Appearance* |
| `hair` | text |  |  | General | *Hair* — placeholder: e.g. Long dark curls |
| `eyes` | text |  |  | General | *Eyes* |
| `distinguishing_features` | textarea |  |  | General | *Distinguishing Features* |
| `skin_tone` | text |  |  | Appearance | *Skin Tone* |
| `grooming_level` | text |  |  | Appearance | *Grooming Level* |
| `visual_distinction` | textarea |  |  | Identity | *Visual Distinction* |
| `silhouette_description` | textarea |  |  | Identity | *Silhouette Description* |
| `visual_shorthand` | textarea |  |  | Identity | *Visual Shorthand* |
| `appearance_evolution` | textarea |  |  | Evolution | *Appearance Evolution* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Appearance`, `Identity`, `Evolution`, `Lifecycle`


#### 👔 `costume` — Costume

A specific wardrobe look for a character.

| Meta | Value |
|---|---|
| Plural label | Costumes |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 207 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Costume Name* — placeholder: e.g. Eleanor's Work Outfit, Marcus's Disguise |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `description` | textarea |  |  | General | *Description* |
| `silhouette` | text |  |  | General | *Silhouette* |
| `key_garments` | json |  |  | General | *Key Garments* |
| `layers` | textarea |  |  | General | *Layers* |
| `accessories` | json |  |  | General | *Accessories* |
| `primary_color_hex` | text |  |  | Color | *Primary Color (hex)* |
| `primary_color_name` | text |  |  | Color | *Primary Color Name* |
| `secondary_colors` | json |  |  | Color | *Secondary Colors* |
| `fabrics` | textarea |  |  | Material | *Fabrics* |
| `texture_qualities` | textarea |  |  | Material | *Texture Qualities* |
| `condition` | select<br/>options: `new`, `worn`, `distressed` |  |  | Narrative | *Condition* |
| `what_reveals` | textarea |  |  | Narrative | *What It Reveals* |
| `emotional_state_reflected` | textarea |  |  | Narrative | *Emotional State Reflected* |
| `social_signals` | textarea |  |  | Narrative | *Social/Economic Signals* |
| `continuity_notes` | textarea |  |  | Notes | *Continuity Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Color`, `Material`, `Narrative`, `Notes`, `Lifecycle`


#### 📈 `costume_progression` — Costume Progression

How wardrobe evolves through the story arc.

| Meta | Value |
|---|---|
| Plural label | Costume Progressions |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 208 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `starting_wardrobe` | textarea |  |  | General | *Starting Wardrobe* |
| `starting_meaning` | textarea |  |  | General | *Starting Meaning* |
| `progression_stages` | json |  |  | General | *Progression Stages* |
| `color_evolution` | textarea |  |  | General | *Color Evolution* |
| `formality_evolution` | textarea |  |  | General | *Formality Evolution* |
| `condition_evolution` | textarea |  |  | General | *Condition Evolution* |
| `symbolic_meaning` | textarea |  |  | General | *Symbolic Meaning* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💇 `makeup_hair_design` — Makeup & Hair Design

Non-costume appearance: makeup, hair, prosthetics.

| Meta | Value |
|---|---|
| Plural label | Makeup & Hair Designs |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 209 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene (if scene-specific)* |
| `makeup_approach` | select<br/>options: `naturalistic`, `beauty`, `character`, `special effects` |  |  | General | *Makeup Approach* |
| `makeup_details` | textarea |  |  | General | *Makeup Details* |
| `hair_style` | text |  |  | Hair | *Hair Style* |
| `hair_condition` | text |  |  | Hair | *Hair Condition* |
| `hair_notes` | textarea |  |  | Hair | *Hair Notes* |
| `prosthetics` | textarea |  |  | Effects | *Prosthetics* |
| `aging_effects` | textarea |  |  | Effects | *Aging Effects* |
| `injury_effects` | textarea |  |  | Effects | *Injury Effects* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Hair`, `Effects`, `Lifecycle`


#### 🔀 `character_variant` — Character Variant

Specific state or version of a character (e.g. Young Eleanor, Angry Marcus). The previous duration_type field has been removed; the variant's purpose lives in its name, context, and physical_differences fields.

| Meta | Value |
|---|---|
| Plural label | Character Variants |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 210 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Variant Name* — placeholder: e.g. Young Eleanor, Marcus in Disguise |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `emotional_state` | textarea |  |  | General | *Emotional State* |
| `context` | textarea |  |  | General | *Context* — placeholder: When/why this variant appears |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### ✋ `physical_habit` — Physical Habit

Recurring physical behavior — gesture, tic, comfort behavior.

| Meta | Value |
|---|---|
| Plural label | Physical Habits |
| Category | Character Depth |
| Tier | 2 |
| Sort order | 211 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Habit Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `description` | textarea |  |  | General | *Description* |
| `body_parts_involved` | text |  |  | General | *Body Parts Involved* |
| `habit_trigger` | textarea |  |  | General | *Trigger* |
| `frequency` | select<br/>options: `constant`, `frequent`, `occasional`, `rare/situational` |  |  | General | *Frequency* |
| `meaning` | textarea |  |  | General | *Meaning* |
| `character_awareness` | select<br/>options: `aware`, `unaware`, `sometimes aware` |  |  | General | *Character Awareness* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---

### Category: Asset Reference

<a id='category-asset-reference'></a>

#### 📦 `bundle` — Bundle

Named, intent-typed collection of assets. Tool-agnostic media reference primitive used by the character cluster (and later by props and locations). Versionable — participates in linear version chains.

| Meta | Value |
|---|---|
| Plural label | Bundles |
| Category | Asset Reference |
| Tier | 2 |
| Sort order | 250 |
| Versionable | yes |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Bundle Name* — placeholder: e.g. "Snapper — baseline visual" |
| `intent` | select<br/>options: `visual_identity`, `voice_identity`, `motion`, `behavior`, `performance`, `surface`, `environment`, `other` | yes |  | General | *Intent* — Hard enum. Tools switch on this to determine compatibility. |
| `description` | textarea |  |  | General | *Description* — placeholder: What this bundle is for |
| `coverage_summary` | textarea |  |  | General | *Coverage Summary* — placeholder: Plain-language: angles, expressions, phoneme set, etc. |
| `format_hints` | json |  |  | Technical | *Format Hints* — placeholder: {"frame_count": 30, "lighting_conditions": [...], "audio_duration_sec": 240} — Structured metadata tools can read without prescribing pipeline. Open shape — conventional keys vary by intent. |
| `intended_consumers` | json |  |  | Technical | *Intended Consumers* — placeholder: ["image_gen", "video_gen", "voice_clone", "world_model"] — Optional hints about what tool types this is designed for. |
| `provenance` | textarea |  |  | Technical | *Provenance* — placeholder: How this bundle was assembled — shoot session, curated set, etc. |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `parent_id` | reference → `bundle` |  |  | Lifecycle | `versionable` | *Parent Version* — Previous version in the chain. Null for root version. |
| `version_label` | text |  |  | Lifecycle | `versionable` | *Version Label* — placeholder: e.g. "v1.2", "approved-final" — Human-readable version identifier. Tool-managed. |
| `superseded_at` | timestamp |  |  | Lifecycle | `versionable` | *Superseded At* — Set when a successor version becomes active. |
| `superseded_by_id` | reference → `bundle` |  |  | Lifecycle | `versionable` | *Superseded By* — Forward pointer to successor. Auto-set on supersession. |
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Technical`, `Notes`, `Lifecycle`


#### 🎚️ `character_asset_binding` — Character Asset Binding

Applies a bundle to a character under specific conditions. Tools walk the resolution cascade and use bindings to find the right media for a given character in a given scene/state.

| Meta | Value |
|---|---|
| Plural label | Character Asset Bindings |
| Category | Asset Reference |
| Tier | 2 |
| Sort order | 251 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Binding Name* — placeholder: e.g. "Snapper baseline visual" |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `bundle_id` | reference → `bundle` | yes |  | General | *Bundle* |
| `is_baseline` | boolean |  | `False` | General | *Is Baseline* — True for the unconditional default binding for this character. |
| `precedence` | integer |  | `0` | General | *Precedence* — Higher wins when multiple bindings could apply. Author or tool sets this manually. |
| `variant_id` | reference → `character_variant` |  |  | Conditions | *Variant* |
| `physical_state_filter` | text |  |  | Conditions | *Physical State Filter* — placeholder: Matches against physical_state values |
| `vocal_state_filter` | text |  |  | Conditions | *Vocal State Filter* |
| `scene_range_start_id` | reference → `scene` |  |  | Conditions | *Scene Range Start* |
| `scene_range_end_id` | reference → `scene` |  |  | Conditions | *Scene Range End* |
| `act_id` | reference → `act` |  |  | Conditions | *Act* — Alternative coarser scope to scene range. |
| `conditions_json` | json |  |  | Conditions | *Additional Conditions* — placeholder: {"custom_key": "value"} — Catch-all for tool-specific filters. |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Conditions`, `Notes`, `Lifecycle`


#### 📍 `identity_anchor` — Identity Anchor

Known-good single frame, audio segment, or motion sample marked as canonical reference for a character. Used for both ID-locking inputs and output verification. Points into source assets without modifying them.

| Meta | Value |
|---|---|
| Plural label | Identity Anchors |
| Category | Asset Reference |
| Tier | 2 |
| Sort order | 252 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Anchor Name* — placeholder: e.g. "Snapper front neutral verified" |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `variant_id` | reference → `character_variant` |  |  | General | *Variant* |
| `anchor_type` | select<br/>options: `visual`, `audio`, `motion` | yes |  | General | *Anchor Type* |
| `asset_id` | reference → `asset` | yes |  | General | *Source Asset* — The whole source asset. Anchors describe how to interpret it. |
| `frame_number` | integer |  |  | Scope | *Frame Number* — For video/motion assets. |
| `timecode` | text |  |  | Scope | *Timecode* — placeholder: HH:MM:SS:FF — Alternative to frame number. |
| `region_box` | json |  |  | Scope | *Region Box* — placeholder: {"x": 420, "y": 180, "w": 480, "h": 600} — Optional spatial crop within frame. |
| `region_label` | text |  |  | Scope | *Region Label* — placeholder: e.g. "face only", "head and shoulders" — Author's note on what the region box represents. |
| `audio_offset_start_sec` | float |  |  | Scope | *Audio Offset Start (sec)* — For audio anchors. |
| `audio_offset_end_sec` | float |  |  | Scope | *Audio Offset End (sec)* |
| `condition_description` | textarea |  |  | Context | *Condition Description* — placeholder: When this anchor is valid: lighting, expression, state |
| `physical_state` | text |  |  | Context | *Physical State* |
| `vocal_state` | text |  |  | Context | *Vocal State* |
| `canonical_status` | select<br/>options: `verified`, `candidate`, `rejected` |  | `candidate` | General | *Canonical Status* — Verification axis distinct from lifecycle_status. |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Scope`, `Context`, `Notes`, `Lifecycle`


---

### Category: Performance Corpus

<a id='category-performance-corpus'></a>

#### 🎞️ `performance_corpus` — Performance Corpus

Project-level index of captured footage. Singleton per project. Only populated when shooting happens, but always queryable.

| Meta | Value |
|---|---|
| Plural label | Performance Corpora |
| Category | Performance Corpus |
| Tier | 2 |
| Sort order | 260 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Performance Corpus` | General | *Name* |
| `shoot_dates_start` | text |  |  | General | *Shoot Dates Start* — placeholder: YYYY-MM-DD |
| `shoot_dates_end` | text |  |  | General | *Shoot Dates End* — placeholder: YYYY-MM-DD |
| `shoot_locations` | textarea |  |  | General | *Shoot Locations* |
| `coverage_completeness` | select<br/>options: `planned`, `in_production`, `principal_complete`, `pickups_complete`, `complete` |  | `planned` | General | *Coverage Completeness* |
| `camera_metadata` | textarea |  |  | Technical | *Camera Metadata* — placeholder: Sensors, codec, color space |
| `audio_metadata` | textarea |  |  | Technical | *Audio Metadata* — placeholder: Sample rate, mic config, boom/lav setup |
| `corpus_notes` | textarea |  |  | Notes | *Corpus Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Technical`, `Notes`, `Lifecycle`


#### 🎭 `actor` — Actor

Minimal actor entity. SCF is story-first, not a casting tracker — this entity captures only what the story format needs.

| Meta | Value |
|---|---|
| Plural label | Actors |
| Category | Performance Corpus |
| Tier | 2 |
| Sort order | 261 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Actor Name* |
| `notes` | textarea |  |  | General | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Lifecycle`, `External`


#### 🎬 `take` — Take

A single recorded take. May cross scenes (via take_scene junction).

| Meta | Value |
|---|---|
| Plural label | Takes |
| Category | Performance Corpus |
| Tier | 2 |
| Sort order | 262 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Take Name / Slate* — placeholder: e.g. "23A-3" |
| `corpus_id` | reference → `performance_corpus` | yes |  | General | *Corpus* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `take_number` | integer |  |  | General | *Take Number* |
| `date_recorded` | text |  |  | General | *Date Recorded* — placeholder: YYYY-MM-DD |
| `duration_seconds` | integer |  |  | General | *Duration (seconds)* |
| `timecode_start` | text |  |  | General | *Timecode Start* — placeholder: HH:MM:SS:FF |
| `timecode_end` | text |  |  | General | *Timecode End* |
| `preferred` | boolean |  | `False` | General | *Director's Pick* |
| `camera_designation` | text |  |  | Technical | *Camera* — placeholder: e.g. "A cam", "B cam", "witness" |
| `lens_info` | text |  |  | Technical | *Lens Info* |
| `recording_format` | text |  |  | Technical | *Recording Format* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Technical`, `Notes`, `Lifecycle`, `External`


#### ✂️ `clip` — Clip

A meaningful within-scene segment of a take. Clips are by definition within-scene; cross-scene takes get cut into multiple clips.

| Meta | Value |
|---|---|
| Plural label | Clips |
| Category | Performance Corpus |
| Tier | 2 |
| Sort order | 263 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Clip Name* |
| `take_id` | reference → `take` | yes |  | General | *Take* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `clip_in_timecode` | text |  |  | General | *Clip In* — placeholder: HH:MM:SS:FF |
| `clip_out_timecode` | text |  |  | General | *Clip Out* |
| `duration_seconds` | integer |  |  | General | *Duration (seconds)* |
| `clip_type` | select<br/>options: `dialogue`, `action`, `reaction`, `transition`, `insert`, `atmospheric` |  |  | General | *Clip Type* |
| `screenplay_line_start_id` | integer |  |  | Screenplay | *Screenplay Line Start* — Reference into screenplay_lines table. Links clips to dialogue. |
| `screenplay_line_end_id` | integer |  |  | Screenplay | *Screenplay Line End* |
| `beat_id` | reference → `story_beat` |  |  | Screenplay | *Story Beat* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Screenplay`, `Notes`, `Lifecycle`, `External`


---

### Category: Workflow State

<a id='category-workflow-state'></a>

#### 📊 `shot_coverage` — Shot Coverage

Production state of each shot. Multiple records per shot, ordered by status_date, give a production timeline. Most recent is canonical.

| Meta | Value |
|---|---|
| Plural label | Shot Coverages |
| Category | Workflow State |
| Tier | 2 |
| Sort order | 270 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Coverage Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `coverage_state` | select<br/>options: `planned`, `captured_live`, `generated`, `hybrid_live_plate`, `hybrid_generated_extension`, `reshoot_needed`, `pickup_scheduled`, `final` | yes |  | General | *Coverage State* |
| `source_take_id` | reference → `take` |  |  | General | *Source Take* |
| `source_clip_id` | reference → `clip` |  |  | General | *Source Clip* |
| `generation_required` | textarea |  |  | General | *Generation Required* — placeholder: What needs to be generated to complete this shot |
| `override_summary` | textarea |  |  | General | *Override Summary* — placeholder: High-level deviation summary — details in character_shot_override |
| `status_date` | text |  |  | General | *Status Date* — placeholder: YYYY-MM-DD — For ordering history. Most recent record is canonical. |
| `decided_by` | text |  |  | General | *Decided By* |
| `notes` | textarea |  |  | General | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎛️ `character_shot_override` — Character Shot Override

Per-character deviation from the cascade for a specific shot. Versionable: only one active record per (shot, character). Multiple intents compose into a single record via override_types multiselect and the delta fields.

| Meta | Value |
|---|---|
| Plural label | Character Shot Overrides |
| Category | Workflow State |
| Tier | 2 |
| Sort order | 271 |
| Versionable | yes |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Override Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `override_types` | multiselect<br/>options: `aging`, `de_aging`, `prosthetic`, `body_change`, `voice_change`, `motion_change`, `identity_swap`, `transformation`, `other` |  |  | General | *Override Types* |
| `bundle_override_id` | reference → `bundle` |  |  | General | *Bundle Override* — Use this bundle instead of the default cascade resolution. |
| `variant_target_id` | reference → `character_variant` |  |  | General | *Variant Target* |
| `visual_delta` | textarea |  |  | Deltas | *Visual Delta* |
| `vocal_delta` | textarea |  |  | Deltas | *Vocal Delta* |
| `motion_delta` | textarea |  |  | Deltas | *Motion Delta* |
| `progression_axis` | text |  |  | Progression | *Progression Axis* — placeholder: e.g. "transformation", "aging", "decay", "corruption" — Project-defined progression dimension. Free text — axes are project-specific. |
| `progression_value` | float |  |  | Progression | *Progression Value (0-1)* — Where on the named axis this shot sits. Author-defined endpoints. |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `parent_id` | reference → `character_shot_override` |  |  | Lifecycle | `versionable` | *Parent Version* — Previous version in the chain. Null for root version. |
| `version_label` | text |  |  | Lifecycle | `versionable` | *Version Label* — placeholder: e.g. "v1.2", "approved-final" — Human-readable version identifier. Tool-managed. |
| `superseded_at` | timestamp |  |  | Lifecycle | `versionable` | *Superseded At* — Set when a successor version becomes active. |
| `superseded_by_id` | reference → `character_shot_override` |  |  | Lifecycle | `versionable` | *Superseded By* — Forward pointer to successor. Auto-set on supersession. |
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Deltas`, `Progression`, `Notes`, `Lifecycle`


---

### Category: Location Depth

<a id='category-location-depth'></a>

#### 🏗️ `location_design` — Location Design

Detailed visual design — architecture, materials, spatial layout.

| Meta | Value |
|---|---|
| Plural label | Location Designs |
| Category | Location Depth |
| Tier | 2 |
| Sort order | 300 |
| Parent entity | `location` via `location_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `design_concept` | textarea |  |  | General | *Design Concept* |
| `visual_metaphor` | textarea |  |  | General | *Visual Metaphor* |
| `emotional_target` | textarea |  |  | General | *Emotional Target* |
| `period_style` | text |  |  | Architecture | *Period / Style* |
| `condition` | select<br/>options: `pristine`, `maintained`, `neglected`, `ruined` |  |  | Architecture | *Condition* |
| `scale` | select<br/>options: `intimate`, `domestic`, `commercial`, `monumental` |  |  | Architecture | *Scale* |
| `geometry` | select<br/>options: `organic`, `angular`, `chaotic`, `ordered` |  |  | Architecture | *Geometry* |
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

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Architecture`, `Materials`, `Spatial`, `Lighting`, `Lifecycle`


#### 🔀 `location_variant` — Location Variant

Modified state of a location (e.g. Night version, After fire).

| Meta | Value |
|---|---|
| Plural label | Location Variants |
| Category | Location Depth |
| Tier | 2 |
| Sort order | 301 |
| Parent entity | `location` via `location_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Variant Name* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `lighting_differences` | textarea |  |  | General | *Lighting Differences* |
| `emotional_shift` | textarea |  |  | General | *Emotional Shift* |
| `time_context` | textarea |  |  | General | *Time / Story Context* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎨 `location_color_scheme` — Location Color Scheme

Color palette and atmosphere for a specific location.

| Meta | Value |
|---|---|
| Plural label | Location Color Schemes |
| Category | Location Depth |
| Tier | 2 |
| Sort order | 302 |
| Parent entity | `location` via `location_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `dominant_colors` | json |  |  | General | *Dominant Colors* |
| `color_motivation` | select<br/>options: `period`, `character`, `symbolic`, `practical` |  |  | General | *Color Motivation* |
| `color_atmosphere` | select<br/>options: `warm`, `cool`, `neutral`, `colorful` |  |  | General | *Color Atmosphere* |
| `color_intensity` | select<br/>options: `saturated`, `desaturated`, `mixed` |  |  | General | *Color Intensity* |
| `character_location_interaction` | select<br/>options: `match`, `contrast`, `transform` |  |  | General | *Character-Location Color Interaction* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔉 `location_sound_profile` — Location Sound Profile

Acoustic identity of a place — room tone, ambience, character.

| Meta | Value |
|---|---|
| Plural label | Location Sound Profiles |
| Category | Location Depth |
| Tier | 2 |
| Sort order | 303 |
| Parent entity | `location` via `location_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `room_tone` | textarea |  |  | General | *Room Tone* |
| `reverb_quality` | textarea |  |  | General | *Reverb / Reflection* |
| `resonance` | textarea |  |  | General | *Resonance Characteristics* |
| `constant_sounds` | json |  |  | Ambience | *Constant Sounds* |
| `variable_sounds` | textarea |  |  | Ambience | *Variable Sounds* |
| `characteristic_sounds` | textarea |  |  | Ambience | *Characteristic Sounds* |
| `sonic_perspective` | textarea |  |  | Ambience | *Sonic Perspective* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Ambience`, `Lifecycle`


---

### Category: Scene Detail

<a id='category-scene-detail'></a>

#### 💗 `scene_emotional_target` — Scene Emotional Target

Specific emotional goal and function for a scene.

| Meta | Value |
|---|---|
| Plural label | Scene Emotional Targets |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 400 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `primary_emotion` | text | yes |  | General | *Primary Emotion* |
| `primary_intensity` | integer |  |  | General | *Intensity (1-10)* |
| `secondary_emotions` | json |  |  | General | *Secondary Emotions* |
| `emotional_function` | select<br/>options: `setup`, `build`, `release`, `shift`, `sustain` |  |  | General | *Emotional Function* |
| `audience_character_relationship` | select<br/>options: `empathy`, `sympathy`, `antipathy`, `observation` |  |  | General | *Audience-Character Relationship* |
| `contrast_with_previous` | textarea |  |  | General | *Contrast with Previous Scene* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎨 `scene_color_palette` — Scene Color Palette

Specific color design for a scene.

| Meta | Value |
|---|---|
| Plural label | Scene Color Palettes |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 401 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `dominant_colors` | json |  |  | General | *Dominant Colors (1-3)* |
| `color_harmony_type` | select<br/>options: `monochromatic`, `analogous`, `complementary`, `triadic`, `split-complementary` |  |  | General | *Color Harmony Type* |
| `color_source_distribution` | textarea |  |  | General | *Color Source Distribution* |
| `color_contrast_level` | select<br/>options: `low`, `medium`, `high` |  |  | General | *Color Contrast Level* |
| `focal_color` | text |  |  | General | *Focal / Hero Color* |
| `grading_notes` | textarea |  |  | General | *Color Grading Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💡 `lighting_design` — Lighting Design

Illumination approach for a scene.

| Meta | Value |
|---|---|
| Plural label | Lighting Designs |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 402 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot (optional)* |
| `lighting_style` | select<br/>options: `naturalistic`, `stylized`, `high key`, `low key`, `chiaroscuro` |  |  | General | *Lighting Style* |
| `contrast_ratio` | text |  |  | General | *Contrast Ratio* |
| `overall_mood` | text |  |  | General | *Overall Mood* |
| `light_quality` | select<br/>options: `hard`, `soft`, `mixed` |  |  | General | *Overall Light Quality* |
| `key_source` | text |  |  | Key Light | *Key Light Source* |
| `key_direction` | text |  |  | Key Light | *Key Direction* |
| `key_quality` | select<br/>options: `hard`, `soft` |  |  | Key Light | *Key Quality* |
| `key_color_temperature` | integer |  |  | Key Light | *Key Color Temperature (K)* |
| `fill_ratio` | text |  |  | Fill & Other | *Fill Ratio* |
| `fill_quality` | text |  |  | Fill & Other | *Fill Quality* |
| `fill_color_temperature` | integer |  |  | Fill & Other | *Fill Color Temp (K)* |
| `backlight_notes` | textarea |  |  | Fill & Other | *Back/Rim/Hair Light* |
| `practical_lights` | textarea |  |  | Fill & Other | *Practical Lights* |
| `ambient_light` | textarea |  |  | Fill & Other | *Ambient Light* |
| `lighting_evolution` | textarea |  |  | Fill & Other | *Lighting Evolution Through Scene* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Key Light`, `Fill & Other`, `Lifecycle`


#### 🎶 `scene_music_design` — Scene Music Design

Music approach for a specific scene.

| Meta | Value |
|---|---|
| Plural label | Scene Music Designs |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 403 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `music_presence` | select<br/>options: `score`, `source`, `none`, `mixed` |  |  | General | *Music Presence* |
| `emotional_function` | select<br/>options: `support`, `anticipate`, `counterpoint`, `neutral` |  |  | General | *Emotional Function* |
| `entry_point` | text |  |  | General | *Entry Point* |
| `build_evolution` | textarea |  |  | General | *Build / Evolution* |
| `peak` | text |  |  | General | *Peak* |
| `exit_point` | text |  |  | General | *Exit Point* |
| `themes_used` | json |  |  | General | *Themes Used* |
| `source_music_description` | textarea |  |  | Source Music | *Source Music Description* |
| `lyrics_relevance` | textarea |  |  | Source Music | *Lyrics Relevance* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Source Music`, `Lifecycle`


#### 🏷️ `tone_marker` — Tone Marker

Scene-specific tonal quality and atmosphere.

| Meta | Value |
|---|---|
| Plural label | Tone Markers |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 404 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `sequence_id` | reference → `sequence` |  |  | General | *Sequence* |
| `tone_descriptor` | text |  |  | General | *Tone Descriptor* |
| `intensity` | select<br/>options: `light`, `moderate`, `heavy` |  |  | General | *Intensity* |
| `genre_elements` | text |  |  | General | *Genre Elements Active* |
| `mood_atmosphere` | textarea |  |  | General | *Mood / Atmosphere* |
| `pacing_expectation` | textarea |  |  | General | *Pacing Expectation* |
| `tonal_shift` | textarea |  |  | General | *Tonal Shift Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🛋️ `set_dressing` — Set Dressing

Objects and arrangement populating a scene's location.

| Meta | Value |
|---|---|
| Plural label | Set Dressings |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 405 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `location_id` | reference → `location` |  |  | General | *Location* |
| `hero_objects` | json |  |  | General | *Hero Objects* |
| `atmospheric_objects` | textarea |  |  | General | *Atmospheric Objects* |
| `practical_objects` | textarea |  |  | General | *Practical Objects* |
| `background_fill` | textarea |  |  | General | *Background Fill* |
| `sightline_management` | textarea |  |  | General | *Sightline Management* |
| `continuity_requirements` | textarea |  |  | General | *Continuity Requirements* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎙️ `dialogue_sound_design` — Dialogue Sound Design

How dialogue sounds in the world — recording aesthetic, processing.

| Meta | Value |
|---|---|
| Plural label | Dialogue Sound Designs |
| Category | Scene Detail |
| Tier | 3 |
| Sort order | 406 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene (optional)* |
| `recording_aesthetic` | select<br/>options: `clean/studio`, `production audio`, `stylized` |  |  | General | *Recording Aesthetic* |
| `acoustic_environment` | textarea |  |  | General | *Acoustic Environment* |
| `dialogue_clarity` | select<br/>options: `always clear`, `sometimes obscured`, `deliberately muddy` |  |  | General | *Dialogue Clarity* |
| `dialogue_layering` | textarea |  |  | General | *Dialogue Layering* |
| `processing_notes` | textarea |  |  | General | *Processing Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---

### Category: Thematic Tracking

<a id='category-thematic-tracking'></a>

#### 🔷 `visual_motif` — Visual Motif

Recurring visual element that carries meaning.

| Meta | Value |
|---|---|
| Plural label | Visual Motifs |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 500 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Motif Name* |
| `motif_type` | select<br/>options: `shape/form`, `pattern`, `material`, `architectural element`, `object`, `natural element` |  |  | General | *Motif Type* |
| `symbolic_meaning` | textarea |  |  | General | *Symbolic Meaning* |
| `emotional_associations` | textarea |  |  | General | *Emotional Associations* |
| `evolution_description` | textarea |  |  | General | *Evolution Through Story* |
| `placement_strategy` | textarea |  |  | General | *Placement Strategy* |
| `subtlety_level` | select<br/>options: `obvious`, `noticeable`, `subtle`, `hidden` |  |  | General | *Subtlety Level* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔔 `sonic_motif` — Sonic Motif

Recurring sound that carries meaning.

| Meta | Value |
|---|---|
| Plural label | Sonic Motifs |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 501 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Motif Name* |
| `sound_description` | textarea |  |  | General | *Sound Description* |
| `symbolic_meaning` | textarea |  |  | General | *Symbolic Meaning* |
| `first_appearance_scene_id` | reference → `scene` |  |  | General | *First Appearance Scene* |
| `recurrence_pattern` | textarea |  |  | General | *Recurrence Pattern* |
| `evolution_description` | textarea |  |  | General | *Evolution Through Story* |
| `related_visual_motif_id` | reference → `visual_motif` |  |  | General | *Related Visual Motif* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔮 `symbol` — Symbol

Object, image, sound, or action carrying meaning beyond the literal.

| Meta | Value |
|---|---|
| Plural label | Symbols |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 502 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Symbol Name* |
| `symbol_type` | select<br/>options: `object`, `image`, `sound`, `color`, `location`, `action`, `character` |  |  | General | *Symbol Type* |
| `literal_function` | textarea |  |  | General | *Literal Function* |
| `symbolic_meaning_primary` | textarea |  |  | General | *Primary Symbolic Meaning* |
| `symbolic_meaning_secondary` | textarea |  |  | General | *Secondary Meaning* |
| `meaning_evolution` | textarea |  |  | General | *Meaning Evolution* |
| `first_appearance_scene_id` | reference → `scene` |  |  | General | *First Appearance Scene* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💭 `conceptual_motif` — Conceptual Motif

Recurring idea, behavior, or verbal pattern that carries thematic weight.

| Meta | Value |
|---|---|
| Plural label | Conceptual Motifs |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 503 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Motif Name* |
| `motif_type` | select<br/>options: `conceptual`, `behavioral`, `verbal`, `situational` |  |  | General | *Motif Type* |
| `thematic_meaning` | textarea |  |  | General | *Thematic Meaning* |
| `evolution_description` | textarea |  |  | General | *Evolution / Transformation* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🧊 `subtext` — Subtext

Underlying meaning beneath surface action or dialogue.

| Meta | Value |
|---|---|
| Plural label | Subtext Layers |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 504 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `surface_level` | textarea | yes |  | General | *Surface Level* |
| `subtext_level` | textarea | yes |  | General | *Subtext Level* |
| `gap_size` | select<br/>options: `small`, `moderate`, `large` |  |  | General | *Gap Between Surface and Subtext* |
| `character_awareness` | select<br/>options: `aware`, `unaware`, `mixed` |  |  | General | *Character Awareness* |
| `audience_access` | select<br/>options: `first viewing`, `repeat viewing`, `analysis` |  |  | General | *Audience Access* |
| `purpose` | select<br/>options: `dramatic irony`, `character revelation`, `thematic depth`, `foreshadowing`, `emotional complexity` |  |  | General | *Subtext Purpose* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔗 `thematic_connection` — Thematic Connection

How a specific element connects to a theme.

| Meta | Value |
|---|---|
| Plural label | Thematic Connections |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 505 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Display Name* |
| `theme_id` | reference → `theme` | yes |  | General | *Theme* |
| `entity_type` | select<br/>options: `character`, `scene`, `location`, `prop`, `costume`, `visual motif`, `sonic motif`, `symbol` |  |  | General | *Connected Entity Type* |
| `entity_id` | integer | yes |  | General | *Connected Entity ID* |
| `nature_of_connection` | select<br/>options: `embodies`, `explores`, `represents`, `challenges`, `resolves` |  |  | General | *Nature of Connection* |
| `subtlety_level` | select<br/>options: `on-the-nose`, `clear`, `subtle`, `hidden` |  |  | General | *Subtlety Level* |
| `intended_perception` | select<br/>options: `must recognize`, `enhances if recognized`, `reward for careful viewing` |  |  | General | *Intended Perception* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🌈 `color_symbolism` — Color Symbolism

Thematic meanings assigned to specific colors in this story.

| Meta | Value |
|---|---|
| Plural label | Color Symbolism |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 506 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Color Name* |
| `color_hex` | text |  |  | General | *Color (hex)* |
| `primary_symbolism` | textarea |  |  | General | *Primary Symbolism* |
| `secondary_symbolism` | textarea |  |  | General | *Secondary Symbolism* |
| `emotional_positive` | textarea |  |  | General | *Positive Emotional Association* |
| `emotional_negative` | textarea |  |  | General | *Negative Emotional Association* |
| `evolution_through_story` | textarea |  |  | General | *Evolution Through Story* |
| `cultural_context` | textarea |  |  | General | *Cultural Context* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎞️ `color_script` — Color Script

Visual map of color progression through the story.

| Meta | Value |
|---|---|
| Plural label | Color Scripts |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 507 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Color Script` | General | *Name* |
| `format` | select<br/>options: `strip`, `grid`, `timeline` |  |  | General | *Format* |
| `granularity` | select<br/>options: `per scene`, `per sequence`, `per act` |  |  | General | *Granularity* |
| `progression_description` | textarea |  |  | General | *Color Progression Description* |
| `key_color_moments` | textarea |  |  | General | *Key Color Moments* |
| `arc_shape` | select<br/>options: `linear`, `cyclical`, `transformative`, `oscillating` |  |  | General | *Color Arc Shape* |
| `emotional_mapping` | textarea |  |  | General | *Emotional Color Mapping* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎨 `character_color_identity` — Character Color Identity

Signature color language for a character. A directorial choice about how the character manifests visually — thematic, not fundamental.

| Meta | Value |
|---|---|
| Plural label | Character Color Identities |
| Category | Thematic Tracking |
| Tier | 4 |
| Sort order | 508 |
| Parent entity | `character` via `character_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* — placeholder: e.g. Eleanor's Color Identity |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `primary_color_hex` | text |  |  | General | *Primary Color (hex)* — placeholder: #2C3E50 |
| `primary_color_name` | text |  |  | General | *Primary Color Name* |
| `secondary_colors` | json |  |  | General | *Secondary Colors* |
| `how_manifests` | select<br/>options: `wardrobe`, `accessories`, `environment`, `lighting`, `multiple` |  |  | General | *How Colors Manifest* |
| `why_these_colors` | textarea |  |  | General | *Why These Colors* |
| `consistency_level` | select<br/>options: `always`, `usually`, `accent only`, `metaphor only` |  |  | General | *Consistency Level* |
| `starting_colors` | text |  |  | Evolution | *Starting Colors* |
| `midpoint_shift` | text |  |  | Evolution | *Midpoint Shift* |
| `final_colors` | text |  |  | Evolution | *Final Colors* |
| `color_isolation` | select<br/>options: `unique to character`, `shared`, `contrasting with another` |  |  | Evolution | *Color Isolation* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Evolution`, `Lifecycle`


#### 📈 `emotional_arc` — Emotional Arc

Overall emotional trajectory for the audience across the project.

| Meta | Value |
|---|---|
| Plural label | Emotional Arcs |
| Category | Thematic Tracking |
| Tier | 5 |
| Sort order | 510 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Audience Emotional Arc` | General | *Name* |
| `opening_emotional_state` | textarea |  |  | General | *Opening Emotional State* |
| `closing_emotional_state` | textarea |  |  | General | *Closing Emotional State* |
| `emotional_shape` | select<br/>options: `rising action`, `oscillating`, `descent`, `transformation` |  |  | General | *Emotional Shape* |
| `lingering_feelings` | textarea |  |  | General | *Lingering Feelings* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💓 `emotional_beat` — Emotional Beat

Specific point on the audience emotional journey.

| Meta | Value |
|---|---|
| Plural label | Emotional Beats |
| Category | Thematic Tracking |
| Tier | 5 |
| Sort order | 511 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `emotional_arc_id` | reference → `emotional_arc` |  |  | General | *Emotional Arc* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `sequence_id` | reference → `sequence` |  |  | General | *Sequence* |
| `beat_order` | integer | yes |  | General | *Beat Order* |
| `target_emotion` | text | yes |  | General | *Target Emotion* |
| `intensity` | integer |  |  | General | *Intensity (1-10)* |
| `beat_trigger` | textarea |  |  | General | *Trigger* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🧩 `information_strategy` — Information Strategy

What the audience knows vs what characters know.

| Meta | Value |
|---|---|
| Plural label | Information Strategies |
| Category | Thematic Tracking |
| Tier | 5 |
| Sort order | 512 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `knowledge_asymmetry` | select<br/>options: `dramatic irony`, `mystery`, `parallel knowledge`, `shifting` |  |  | General | *Knowledge Asymmetry* |
| `information_withheld` | textarea |  |  | General | *Information Withheld* |
| `reveal_timing` | textarea |  |  | General | *Reveal Timing* |
| `suspense_approach` | textarea |  |  | General | *Suspense Approach* |
| `surprise_setup` | textarea |  |  | General | *Surprise / Plant-and-Payoff* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🪞 `identification_strategy` — Identification Strategy

How the audience relates to and identifies with characters.

| Meta | Value |
|---|---|
| Plural label | Identification Strategies |
| Category | Thematic Tracking |
| Tier | 5 |
| Sort order | 513 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Audience Identification Strategy` | General | *Name* |
| `primary_identification_character_id` | reference → `character` |  |  | General | *Primary Identification Character* |
| `how_identification_created` | textarea |  |  | General | *How Identification is Created* |
| `identification_shifts` | textarea |  |  | General | *Identification Shifts* |
| `empathy_targets` | json |  |  | General | *Empathy Targets* |
| `distance_targets` | json |  |  | General | *Distance Targets* |
| `moral_alignment_approach` | textarea |  |  | General | *Moral Alignment Approach* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---

### Category: Production

<a id='category-production'></a>

#### 📷 `shot` — Shot

Specific camera setup within a scene.

| Meta | Value |
|---|---|
| Plural label | Shots |
| Category | Production |
| Tier | 6 |
| Sort order | 600 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Shot Number/Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `duration` | integer |  |  | General | *Duration (seconds)* |
| `coverage_type` | select<br/>options: `primary`, `alt angle`, `cutaway`, `insert`, `establishing` |  |  | General | *Coverage Type* |
| `technical_requirements` | textarea |  |  | General | *Technical Requirements* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Lifecycle`, `External`


#### 🎯 `shot_design` — Shot Design

Framing, lens, focus, and movement specifications for a shot.

| Meta | Value |
|---|---|
| Plural label | Shot Designs |
| Category | Production |
| Tier | 6 |
| Sort order | 601 |
| Parent entity | `shot` via `shot_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `framing_type` | select<br/>options: `EWS`, `WS`, `MWS`, `MS`, `MCU`, `CU`, `ECU`, `insert`, `OTS`, `POV` |  |  | General | *Framing Type* |
| `angle` | select<br/>options: `eye level`, `high`, `low`, `dutch`, `overhead`, `worm's eye` |  |  | General | *Angle* |
| `composition` | text |  |  | General | *Composition* |
| `subject_placement` | text |  |  | General | *Subject Placement* |
| `depth_composition` | textarea |  |  | General | *Depth Composition* |
| `focal_length` | integer |  |  | Lens | *Focal Length (mm)* |
| `aperture` | text |  |  | Lens | *Aperture* |
| `lens_choice_reason` | textarea |  |  | Lens | *Lens Choice Reason* |
| `focus_mode` | select<br/>options: `deep focus`, `shallow focus`, `rack focus`, `split diopter` |  |  | Focus | *Focus Mode* |
| `primary_focus_subject` | text |  |  | Focus | *Primary Focus Subject* |
| `rack_focus_choreography` | textarea |  |  | Focus | *Rack Focus Choreography* |
| `movement_type` | select<br/>options: `static`, `pan`, `tilt`, `dolly`, `crane`, `handheld`, `steadicam`, `tracking`, `zoom`, `combined` |  |  | Movement | *Movement Type* |
| `movement_speed` | text |  |  | Movement | *Movement Speed* |
| `movement_motivation` | textarea |  |  | Movement | *Movement Motivation* |
| `start_position` | text |  |  | Movement | *Start Position* |
| `end_position` | text |  |  | Movement | *End Position* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lens`, `Focus`, `Movement`, `Lifecycle`


#### 💬 `shot_language` — Shot Language

Meaning and intent conveyed through shot choices.

| Meta | Value |
|---|---|
| Plural label | Shot Language |
| Category | Production |
| Tier | 6 |
| Sort order | 602 |
| Parent entity | `shot` via `shot_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `shot_intention` | select<br/>options: `establishing`, `reaction`, `POV`, `insert`, `emotional emphasis`, `information delivery` |  |  | General | *Shot Intention* |
| `shot_psychology` | select<br/>options: `intimate`, `distant`, `powerful`, `vulnerable`, `stable`, `unstable` |  |  | General | *Shot Psychology* |
| `audience_relationship` | select<br/>options: `observer`, `participant`, `character identification`, `omniscient` |  |  | General | *Audience Relationship* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🗺️ `scene_blocking` — Scene Blocking

Physical arrangement and movement of characters through a scene.

| Meta | Value |
|---|---|
| Plural label | Scene Blockings |
| Category | Production |
| Tier | 6 |
| Sort order | 610 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `opening_positions` | json |  |  | General | *Opening Positions* |
| `closing_positions` | json |  |  | General | *Closing Positions* |
| `spatial_storytelling` | textarea |  |  | General | *Spatial Storytelling* |
| `blocking_notes` | textarea |  |  | General | *Blocking Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 👣 `blocking_beat` — Blocking Beat

Specific movement or position change within a scene.

| Meta | Value |
|---|---|
| Plural label | Blocking Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 611 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_blocking_id` | reference → `scene_blocking` | yes |  | General | *Scene Blocking* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `beat_order` | integer | yes |  | General | *Beat Order* |
| `movement_description` | textarea | yes |  | General | *Movement Description* |
| `character_motivation` | textarea |  |  | General | *Character Motivation* |
| `story_motivation` | textarea |  |  | General | *Story Motivation* |
| `timing` | text |  |  | General | *Timing* |
| `quality` | text |  |  | General | *Quality* |
| `meaning` | textarea |  |  | General | *Meaning* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### ⚔️ `action_sequence` — Action Sequence

Extended physical action — fight, chase, dance, stunt.

| Meta | Value |
|---|---|
| Plural label | Action Sequences |
| Category | Production |
| Tier | 6 |
| Sort order | 612 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `action_type` | select<br/>options: `fight/combat`, `chase`, `physical labor`, `athletic performance`, `dance`, `stunt sequence` |  |  | General | *Action Type* |
| `narrative_function` | textarea |  |  | General | *Narrative Function* |
| `character_revelation` | textarea |  |  | General | *Character Revelation* |
| `emotional_journey` | textarea |  |  | General | *Emotional Journey* |
| `action_arc` | textarea |  |  | General | *Action Arc* |
| `physical_vocabulary` | textarea |  |  | General | *Physical Vocabulary / Style* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💥 `action_beat` — Action Beat

Specific moment within an action sequence.

| Meta | Value |
|---|---|
| Plural label | Action Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 613 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `action_sequence_id` | reference → `action_sequence` |  |  | General | *Action Sequence* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` |  |  | General | *Character* |
| `description` | textarea | yes |  | General | *Description* |
| `beat_function` | select<br/>options: `story`, `character`, `spectacle`, `emotional` |  |  | General | *Beat Function* |
| `timing` | text |  |  | General | *Timing* |
| `intensity` | integer |  |  | General | *Intensity (1-10)* |
| `safety_requirements` | textarea |  |  | General | *Safety Requirements* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### ↔️ `proxemic_design` — Proxemic Design

Intentional use of interpersonal distance in a scene.

| Meta | Value |
|---|---|
| Plural label | Proxemic Designs |
| Category | Production |
| Tier | 6 |
| Sort order | 614 |
| Parent entity | `scene` via `scene_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `starting_distance_zone` | select<br/>options: `intimate (0-18in)`, `personal (18in-4ft)`, `social (4-12ft)`, `public (12ft+)` |  |  | General | *Starting Distance Zone* |
| `ending_distance_zone` | select<br/>options: `intimate (0-18in)`, `personal (18in-4ft)`, `social (4-12ft)`, `public (12ft+)` |  |  | General | *Ending Distance Zone* |
| `distance_story` | textarea |  |  | General | *Distance Story* |
| `violations` | textarea |  |  | General | *Violations* |
| `violation_purpose` | textarea |  |  | General | *Violation Purpose* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🤕 `physical_state` — Physical State

Character's physical condition at a specific story point.

| Meta | Value |
|---|---|
| Plural label | Physical States |
| Category | Production |
| Tier | 6 |
| Sort order | 620 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `energy_level` | select<br/>options: `alert/energized`, `tired/depleted`, `wired/anxious`, `relaxed/calm` |  |  | General | *Energy Level* |
| `physical_comfort` | textarea |  |  | General | *Physical Comfort* |
| `intoxication_level` | select<br/>options: `sober`, `slightly intoxicated`, `heavily intoxicated`, `medicated`, `exhausted to impairment` |  |  | General | *Intoxication / Alteration* |
| `physical_needs` | textarea |  |  | General | *Physical Needs* |
| `current_injuries` | textarea |  |  | General | *Current Injuries* |
| `illness_symptoms` | textarea |  |  | General | *Illness Symptoms* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🗣️ `vocal_state` — Vocal State

Character's vocal condition at a specific story point.

| Meta | Value |
|---|---|
| Plural label | Vocal States |
| Category | Production |
| Tier | 6 |
| Sort order | 621 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `physical_vocal_state` | select<br/>options: `healthy`, `hoarse`, `strained`, `damaged` |  |  | General | *Physical Vocal State* |
| `emotional_vocal_state` | select<br/>options: `controlled`, `emotional`, `confident`, `shaking` |  |  | General | *Emotional Vocal State* |
| `environmental_factors` | textarea |  |  | General | *Environmental Factors* |
| `altered_state_effects` | textarea |  |  | General | *Altered State Effects* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎭 `physical_performance_beat` — Physical Performance Beat

Specific physical moment or action in a performance.

| Meta | Value |
|---|---|
| Plural label | Physical Performance Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 622 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `beat_description` | textarea | yes |  | General | *Beat Description* |
| `timing` | text |  |  | General | *Timing* |
| `purpose` | textarea |  |  | General | *Purpose* |
| `quality_notes` | text |  |  | General | *Quality Notes* |
| `scale` | select<br/>options: `large`, `small`, `subtle` |  |  | General | *Scale* |
| `relationship_to_dialogue` | select<br/>options: `accompanies`, `replaces`, `contradicts`, `punctuates` |  |  | General | *Relationship to Dialogue* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎤 `vocal_beat` — Vocal Beat

Specific vocal moment.

| Meta | Value |
|---|---|
| Plural label | Vocal Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 623 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `beat_description` | textarea | yes |  | General | *Beat Description* |
| `beat_type` | select<br/>options: `silence/pause`, `non-verbal sound`, `quality shift`, `volume shift`, `tempo shift` |  |  | General | *Beat Type* |
| `timing` | text |  |  | General | *Timing* |
| `purpose` | textarea |  |  | General | *Purpose* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📜 `line_delivery` — Line Delivery

Specific delivery instructions for a line of dialogue.

| Meta | Value |
|---|---|
| Plural label | Line Deliveries |
| Category | Production |
| Tier | 6 |
| Sort order | 624 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` |  |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `line_text` | text |  |  | General | *Line Text* |
| `emotional_quality` | textarea |  |  | General | *Emotional Quality* |
| `tempo` | text |  |  | General | *Tempo* |
| `volume` | text |  |  | General | *Volume* |
| `emphasis_words` | json |  |  | General | *Emphasis Words* |
| `pause_locations` | json |  |  | General | *Pause Locations* |
| `subtext` | textarea |  |  | General | *Subtext* |
| `operative_words` | textarea |  |  | General | *Operative Words* |
| `physical_integration` | textarea |  |  | General | *Physical Integration* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🥁 `dialogue_rhythm` — Dialogue Rhythm

The musicality of conversation between characters in a scene.

| Meta | Value |
|---|---|
| Plural label | Dialogue Rhythms |
| Category | Production |
| Tier | 6 |
| Sort order | 625 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` |  |  | General | *Character B* |
| `conversational_style` | select<br/>options: `overlapping/interrupting`, `turn-taking/polite`, `rapid exchange`, `languid/paused` |  |  | General | *Conversational Style* |
| `power_dynamics` | textarea |  |  | General | *Power Dynamics* |
| `listening_indicators` | textarea |  |  | General | *Listening Indicators* |
| `rhythm_evolution` | textarea |  |  | General | *Rhythm Evolution Through Scene* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 😤 `emotional_physicality` — Emotional Physicality

How a specific emotion manifests physically for a character.

| Meta | Value |
|---|---|
| Plural label | Emotional Physicalities |
| Category | Production |
| Tier | 6 |
| Sort order | 630 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `emotion` | text | yes |  | General | *Emotion* |
| `posture_changes` | textarea |  |  | General | *Posture Changes* |
| `tension_location` | text |  |  | General | *Tension Location* |
| `breathing_pattern` | textarea |  |  | General | *Breathing Pattern* |
| `expansion_contraction` | select<br/>options: `expanding`, `contracting` |  |  | General | *Expansion / Contraction* |
| `stillness_vs_movement` | textarea |  |  | General | *Stillness vs Movement* |
| `visibility_level` | select<br/>options: `obvious`, `subtle`, `hidden`, `leaked` |  |  | General | *Visibility Level* |
| `control_level` | select<br/>options: `conscious`, `unconscious`, `suppressed`, `overwhelming` |  |  | General | *Control Level* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 😏 `microexpression` — Microexpression

Fleeting facial expression that reveals hidden emotion.

| Meta | Value |
|---|---|
| Plural label | Microexpressions |
| Category | Production |
| Tier | 6 |
| Sort order | 632 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `expression_type` | text |  |  | General | *Expression Type* |
| `facial_region` | text |  |  | General | *Facial Region* |
| `underlying_emotion` | text |  |  | General | *Underlying (True) Emotion* |
| `displayed_emotion` | text |  |  | General | *Displayed (Surface) Emotion* |
| `character_awareness` | select<br/>options: `aware`, `unaware` |  |  | General | *Character Awareness* |
| `audience_intended_to_catch` | boolean |  |  | General | *Audience Intended to Catch?* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🏠 `character_environment_physicality` — Character-Environment Physicality

How a character physically inhabits a specific location.

| Meta | Value |
|---|---|
| Plural label | Character-Environment Physicalities |
| Category | Production |
| Tier | 6 |
| Sort order | 633 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `how_enters_space` | textarea |  |  | General | *How Character Enters* |
| `typical_position` | textarea |  |  | General | *Typical Position* |
| `space_claiming_behavior` | textarea |  |  | General | *Space Claiming Behavior* |
| `object_interaction_quality` | textarea |  |  | General | *Object Interaction Quality* |
| `territorial_behavior` | textarea |  |  | General | *Territorial Behavior* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🤲 `physical_relationship` — Physical Relationship

How two characters physically relate.

| Meta | Value |
|---|---|
| Plural label | Physical Relationships |
| Category | Production |
| Tier | 6 |
| Sort order | 634 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` | yes |  | General | *Character B* |
| `typical_distance` | select<br/>options: `intimate`, `personal`, `social`, `public` |  |  | General | *Typical Distance* |
| `who_controls_distance` | text |  |  | General | *Who Controls Distance* |
| `touch_patterns` | textarea |  |  | General | *Touch Patterns* |
| `touch_quality` | select<br/>options: `gentle`, `aggressive`, `casual`, `charged` |  |  | General | *Touch Quality* |
| `who_initiates_touch` | text |  |  | General | *Who Initiates Touch* |
| `physical_mirroring` | textarea |  |  | General | *Physical Mirroring* |
| `physical_power_dynamic` | textarea |  |  | General | *Physical Power Dynamic* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📊 `physical_relationship_evolution` — Physical Relationship Evolution

How a physical relationship between characters changes at a specific scene.

| Meta | Value |
|---|---|
| Plural label | Physical Relationship Evolutions |
| Category | Production |
| Tier | 6 |
| Sort order | 635 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `physical_relationship_id` | reference → `physical_relationship` | yes |  | General | *Physical Relationship* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `distance_state` | text |  |  | General | *Distance State* |
| `touch_state` | text |  |  | General | *Touch State* |
| `mirroring_state` | text |  |  | General | *Mirroring State* |
| `change_from_previous` | textarea |  |  | General | *Change from Previous* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💃 `movement_choreography` — Movement Choreography

Designed movement patterns — dance, ritual, work, sport.

| Meta | Value |
|---|---|
| Plural label | Movement Choreographies |
| Category | Production |
| Tier | 6 |
| Sort order | 636 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `choreography_type` | select<br/>options: `dance (formal)`, `dance (social)`, `dance (spontaneous)`, `ritual/ceremony`, `work/labor`, `sport/game`, `synchronized movement` |  |  | General | *Choreography Type* |
| `style` | textarea |  |  | General | *Style* |
| `meaning` | textarea |  |  | General | *Meaning* |
| `period_accuracy` | textarea |  |  | General | *Period Accuracy* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎼 `musical_theme` — Musical Theme

Recurring melodic or harmonic idea — leitmotif.

| Meta | Value |
|---|---|
| Plural label | Musical Themes |
| Category | Production |
| Tier | 6 |
| Sort order | 640 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Theme Name* |
| `theme_description` | textarea |  |  | General | *Theme Description* |
| `emotional_association` | textarea |  |  | General | *Emotional Association* |
| `character_id` | reference → `character` |  |  | General | *Associated Character* |
| `concept_association` | text |  |  | General | *Concept Association* |
| `first_appearance_scene_id` | reference → `scene` |  |  | General | *First Appearance Scene* |
| `development_description` | textarea |  |  | General | *Development Through Story* |
| `orchestration_variations` | textarea |  |  | General | *Orchestration Variations* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔈 `sound_cue` — Sound Cue

Individual sound effect or designed sound placement.

| Meta | Value |
|---|---|
| Plural label | Sound Cues |
| Category | Production |
| Tier | 6 |
| Sort order | 641 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `cue_type` | select<br/>options: `SFX`, `foley`, `ambient`, `designed` |  |  | General | *Cue Type* |
| `description` | textarea |  |  | General | *Description* |
| `source` | select<br/>options: `on screen`, `off screen` |  |  | General | *Source* |
| `volume_intensity` | text |  |  | General | *Volume / Intensity* |
| `emotional_function` | textarea |  |  | General | *Emotional Function* |
| `timing` | text |  |  | General | *Timing* |
| `duration` | integer |  |  | General | *Duration (seconds)* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎵 `music_cue` — Music Cue

Individual music cue placement in a scene.

| Meta | Value |
|---|---|
| Plural label | Music Cues |
| Category | Production |
| Tier | 6 |
| Sort order | 642 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Cue Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `cue_type` | select<br/>options: `diegetic`, `non-diegetic` |  |  | General | *Cue Type* |
| `genre_style` | text |  |  | General | *Genre / Style* |
| `tempo_mood` | text |  |  | General | *Tempo / Mood* |
| `emotional_purpose` | textarea |  |  | General | *Emotional Purpose* |
| `musical_theme_id` | reference → `musical_theme` |  |  | General | *Musical Theme* |
| `instrumentation` | textarea |  |  | General | *Instrumentation* |
| `volume_level` | text |  |  | General | *Volume Level* |
| `source` | text |  |  | Source | *Source (if diegetic)* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Source`, `Lifecycle`


#### 👂 `sound_perspective` — Sound Perspective

Point-of-view in sound — whose hearing, what techniques.

| Meta | Value |
|---|---|
| Plural label | Sound Perspectives |
| Category | Production |
| Tier | 6 |
| Sort order | 643 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` |  |  | General | *Character* |
| `perspective_type` | select<br/>options: `objective`, `subjective`, `omniscient` |  |  | General | *Perspective Type* |
| `subjective_techniques` | textarea |  |  | General | *Subjective Techniques* |
| `transition_triggers` | textarea |  |  | General | *Transition Triggers* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📢 `voiceover_design` — Voiceover Design

Non-diegetic or semi-diegetic speech design.

| Meta | Value |
|---|---|
| Plural label | Voiceover Designs |
| Category | Production |
| Tier | 6 |
| Sort order | 644 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  | `Voiceover Design` | General | *Name* |
| `character_id` | reference → `character` |  |  | General | *Character (whose voice)* |
| `narration_type` | select<br/>options: `character voice-over`, `omniscient narrator`, `internal monologue` |  |  | General | *Narration Type* |
| `acoustic_treatment` | select<br/>options: `intimate (close, dry)`, `distanced (room, space)`, `stylized` |  |  | General | *Acoustic Treatment* |
| `relationship_to_image` | select<br/>options: `complements`, `counterpoints`, `reveals` |  |  | General | *Relationship to Image* |
| `placement_in_mix` | textarea |  |  | General | *Placement in Mix* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔀 `music_sound_relationship` — Music-Sound Relationship

How score and sound design interact.

| Meta | Value |
|---|---|
| Plural label | Music-Sound Relationships |
| Category | Production |
| Tier | 6 |
| Sort order | 645 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene (optional)* |
| `hierarchy` | select<br/>options: `music-forward`, `sound-forward`, `equal partners`, `shifting` |  |  | General | *Hierarchy* |
| `blend_approach` | select<br/>options: `clear separation`, `blurred boundaries`, `designed interaction` |  |  | General | *Blend Approach* |
| `combined_silence` | textarea |  |  | General | *Combined Silence* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


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
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Decision Title* |
| `entity_type` | text |  |  | General | *Related Entity Type* |
| `entity_id` | integer |  |  | General | *Related Entity ID* |
| `decision_description` | textarea | yes |  | General | *Decision Description* |
| `options_considered` | json |  |  | General | *Options Considered* |
| `why_chosen` | textarea |  |  | General | *Why This Option Chosen* |
| `what_sacrificed` | textarea |  |  | General | *What Was Sacrificed* |
| `what_gained` | textarea |  |  | General | *What Was Gained* |
| `confidence_level` | select<br/>options: `certain`, `confident`, `uncertain`, `compromised` |  |  | General | *Confidence Level* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📝 `collaboration_note` — Collaboration Note

Director's guidance to specific collaborators or domains.

| Meta | Value |
|---|---|
| Plural label | Collaboration Notes |
| Category | Metadata |
| Tier | 1 |
| Sort order | 801 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Note Title* |
| `entity_type` | text |  |  | General | *Related Entity Type* |
| `entity_id` | integer |  |  | General | *Related Entity ID* |
| `domain` | text |  |  | General | *Domain / Area* |
| `note_text` | textarea | yes |  | General | *Note Text* |
| `note_type` | select<br/>options: `vision communication`, `problem-solving`, `permission-granting`, `boundary-setting`, `question-posing` |  |  | General | *Note Type* |
| `priority` | select<br/>options: `critical`, `important`, `optional` |  |  | General | *Priority* |
| `response_expected` | select<br/>options: `execution`, `interpretation`, `options` |  |  | General | *Response Expected* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📎 `asset` — Asset

External file reference — image, model, audio, document.

| Meta | Value |
|---|---|
| Plural label | Assets |
| Category | Metadata |
| Tier | 1 |
| Sort order | 802 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *File Name* |
| `file_path` | text | yes |  | General | *File Path* |
| `file_type` | select<br/>options: `image`, `3D model`, `audio`, `video`, `document`, `project file` |  |  | General | *File Type* |
| `purpose` | select<br/>options: `reference`, `concept`, `pre-production`, `production`, `post-production` |  |  | General | *Purpose* |
| `department` | text |  |  | General | *Department* |
| `creator` | text |  |  | General | *Creator* |
| `approval_status` | select<br/>options: `wip`, `pending`, `approved`, `final` |  |  | General | *Approval Status* — Approval axis — distinct from lifecycle_status. |
| `resolution` | text |  |  | Technical | *Resolution* |
| `color_space` | text |  |  | Technical | *Color Space* |
| `duration` | integer |  |  | Technical | *Duration (seconds)* |
| `file_size` | integer |  |  | Technical | *File Size (bytes)* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Technical`, `Lifecycle`, `External`


---
