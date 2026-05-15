# SCF Schema Snapshot

*Compact reference for orientation. Auto-generated from `entity_registry.py` on 2026-05-15 UTC. For full field-level detail, see `schema_reference.md`.*

## What SCF is

SCF (Story Context Framework) is a structured data format for describing films and other narrative works. It captures creative intent — story structure, character, location, theme, performance, visual and sonic design — at sufficient density that generative tools, production tools, and analytical tools can all consume the same file. Storage is SQLite; every entity has its own table; relationships are foreign keys.

The format is tool-agnostic. It describes what's true about a story; tools decide how to use that data. A `.scf` file is useful at 5% populated and grows richer with authoring.

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

## Entities by tier

Tiers describe the natural order of population. Tier 0 entities are the structural foundation; higher tiers add increasing depth. All tiers exist in every project file; tiers indicate priority, not feature gates.

### Tier 0

*21 entities*

**Connections**
- 🔗 **`scene_character`** — Links a character to a scene with role information.
- 🔗 **`scene_prop`** — Links a prop to a scene with usage details.
- 🔗 **`scene_sequence`** — Links a scene to a sequence with ordering.
- 🔗 **`costume_scene`** — Links a costume to the scenes where it appears.
- 🔗 **`visual_motif_appearance`** — Where a visual motif manifests (in a location, prop, costume, or scene).
- 🔗 **`motif_manifestation`** — Where a conceptual motif manifests in the story.
- 🔗 **`action_sequence_character`** — Links a character to an action sequence.
- 🔗 **`asset_relationship`** — Links an asset to any entity in the project.
- 🔗 **`bundle_asset`** — Junction: assets that compose a bundle.
- 🔗 **`actor_character_role`** — Junction: actor + character + role type. Handles all combinations: one actor playing multiple characters, multiple actors playing one character (principal, body double, voice double, ADR, mocap).
- 🔗 **`take_scene`** — Junction: scenes covered by a take. Takes can cross scenes.
- 🔗 **`clip_character`** — Junction: characters present in a clip with their role.

**Project**
- 🎬 **`project`** — The root container for an SCF story project.

**Story Entities**
- 👤 **`character`** — A character in the story. Identity and narrative function only — physical/vocal/wardrobe details live in Tier 2 description entities.
- 📍 **`location`** — A location where story events take place.
- 🔧 **`prop`** — A significant object in the story.

**Story Structure**
- 🎭 **`act`** — A major structural division of the story.
- 📑 **`sequence`** — A group of related scenes forming a narrative unit.
- 🎬 **`scene`** — A single scene in the story.
- 🎯 **`story_beat`** — A discrete narrative unit within a scene — a moment of change.

**Vision**
- 💡 **`theme`** — A thematic element that runs through the story.


### Tier 1

*20 entities*

**Creative Direction**
- 🔭 **`project_vision`** — Overarching creative intent.
- 🎯 **`directorial_philosophy`** — The director's approach to filmmaking on this project.
- ⚙️ **`technical_specs`** — Technical format specifications for the project.
- 👁️ **`visual_identity`** — Overarching aesthetic vision — the film's visual DNA.
- 🎥 **`cinematographic_philosophy`** — Overall approach to camera, movement, and visual storytelling.
- 🎨 **`project_color_palette`** — Overall color scheme and color rules for the entire project.
- 🌡️ **`project_tone`** — Overall tonal identity — the emotional temperature of the film.
- ⏱️ **`pacing_strategy`** — Rhythm and timing philosophy at the story level.
- 🔊 **`sonic_identity`** — Overall approach to the film's sound world.
- 🎵 **`musical_identity`** — Overall approach to the film's music and score.
- 📐 **`design_constraints`** — Intentional boundaries that shape the visual world.
- 🖼️ **`look_development`** — Target visual look for the final image — grading and post direction.
- 📹 **`coverage_philosophy`** — Approach to shooting and editorial coverage.
- 👗 **`costume_design_philosophy`** — Overall approach to wardrobe and costume design.
- 🧱 **`material_palette`** — Dominant materials and textures in the film's world.
- 🪨 **`texture_philosophy`** — Approach to surface quality throughout the film.
- 🌡️ **`color_temperature_strategy`** — Warm/cool distribution across the story.

**Metadata**
- ⚖️ **`creative_decision`** — Documented rationale for a creative choice.
- 📝 **`collaboration_note`** — Director's guidance to specific collaborators or domains.
- 📎 **`asset`** — External file reference — image, model, audio, document.


### Tier 2

*24 entities*

**Asset Reference**
- 📦 **`bundle`** — Named, intent-typed collection of assets. Tool-agnostic media reference primitive used by the character cluster (and later by props and locations). Versionable — participates in linear version chains.
- 🎚️ **`character_asset_binding`** — Applies a bundle to a character under specific conditions. Tools walk the resolution cascade and use bindings to find the right media for a given character in a given scene/state.
- 📍 **`identity_anchor`** — Known-good single frame, audio segment, or motion sample marked as canonical reference for a character. Used for both ID-locking inputs and output verification. Points into source assets without modifying them.

**Character Depth**
- 🤝 **`character_relationship`** — Relationship between two characters with dynamics and evolution.
- 🏃 **`physical_character_profile`** — Baseline physical existence — posture, movement, tension, energy.
- 🗣️ **`vocal_profile`** — Baseline vocal identity — how a character sounds.
- 🎭 **`delivery_profile`** — How a character generally delivers lines.
- 😐 **`facial_expression_profile`** — Face as performance instrument.
- 👤 **`character_appearance_profile`** — Complete visual design — silhouette, distinction, evolution.
- 👔 **`costume`** — A specific wardrobe look for a character.
- 📈 **`costume_progression`** — How wardrobe evolves through the story arc.
- 💇 **`makeup_hair_design`** — Non-costume appearance: makeup, hair, prosthetics.
- 🔀 **`character_variant`** — Specific state or version of a character (e.g. Young Eleanor, Angry Marcus). The previous duration_type field has been removed; the variant's purpose lives in its name, context, and physical_differences fields.
- ✋ **`physical_habit`** — Recurring physical behavior — gesture, tic, comfort behavior.

**Location Depth**
- 🏗️ **`location_design`** — Detailed visual design — architecture, materials, spatial layout.
- 🔀 **`location_variant`** — Modified state of a location (e.g. Night version, After fire).
- 🎨 **`location_color_scheme`** — Color palette and atmosphere for a specific location.
- 🔉 **`location_sound_profile`** — Acoustic identity of a place — room tone, ambience, character.

**Performance Corpus**
- 🎞️ **`performance_corpus`** — Project-level index of captured footage. Singleton per project. Only populated when shooting happens, but always queryable.
- 🎭 **`actor`** — Minimal actor entity. SCF is story-first, not a casting tracker — this entity captures only what the story format needs.
- 🎬 **`take`** — A single recorded take. May cross scenes (via take_scene junction).
- ✂️ **`clip`** — A meaningful within-scene segment of a take. Clips are by definition within-scene; cross-scene takes get cut into multiple clips.

**Workflow State**
- 📊 **`shot_coverage`** — Production state of each shot. Multiple records per shot, ordered by status_date, give a production timeline. Most recent is canonical.
- 🎛️ **`character_shot_override`** — Per-character deviation from the cascade for a specific shot. Versionable: only one active record per (shot, character). Multiple intents compose into a single record via override_types multiselect and the delta fields.


### Tier 3

*7 entities*

**Scene Detail**
- 💗 **`scene_emotional_target`** — Specific emotional goal and function for a scene.
- 🎨 **`scene_color_palette`** — Specific color design for a scene.
- 💡 **`lighting_design`** — Illumination approach for a scene.
- 🎶 **`scene_music_design`** — Music approach for a specific scene.
- 🏷️ **`tone_marker`** — Scene-specific tonal quality and atmosphere.
- 🛋️ **`set_dressing`** — Objects and arrangement populating a scene's location.
- 🎙️ **`dialogue_sound_design`** — How dialogue sounds in the world — recording aesthetic, processing.


### Tier 4

*9 entities*

**Thematic Tracking**
- 🔷 **`visual_motif`** — Recurring visual element that carries meaning.
- 🔔 **`sonic_motif`** — Recurring sound that carries meaning.
- 🔮 **`symbol`** — Object, image, sound, or action carrying meaning beyond the literal.
- 💭 **`conceptual_motif`** — Recurring idea, behavior, or verbal pattern that carries thematic weight.
- 🧊 **`subtext`** — Underlying meaning beneath surface action or dialogue.
- 🔗 **`thematic_connection`** — How a specific element connects to a theme.
- 🌈 **`color_symbolism`** — Thematic meanings assigned to specific colors in this story.
- 🎞️ **`color_script`** — Visual map of color progression through the story.
- 🎨 **`character_color_identity`** — Signature color language for a character. A directorial choice about how the character manifests visually — thematic, not fundamental.


### Tier 5

*4 entities*

**Thematic Tracking**
- 📈 **`emotional_arc`** — Overall emotional trajectory for the audience across the project.
- 💓 **`emotional_beat`** — Specific point on the audience emotional journey.
- 🧩 **`information_strategy`** — What the audience knows vs what characters know.
- 🪞 **`identification_strategy`** — How the audience relates to and identifies with characters.


### Tier 6

*26 entities*

**Production**
- 📷 **`shot`** — Specific camera setup within a scene.
- 🎯 **`shot_design`** — Framing, lens, focus, and movement specifications for a shot.
- 💬 **`shot_language`** — Meaning and intent conveyed through shot choices.
- 🗺️ **`scene_blocking`** — Physical arrangement and movement of characters through a scene.
- 👣 **`blocking_beat`** — Specific movement or position change within a scene.
- ⚔️ **`action_sequence`** — Extended physical action — fight, chase, dance, stunt.
- 💥 **`action_beat`** — Specific moment within an action sequence.
- ↔️ **`proxemic_design`** — Intentional use of interpersonal distance in a scene.
- 🤕 **`physical_state`** — Character's physical condition at a specific story point.
- 🗣️ **`vocal_state`** — Character's vocal condition at a specific story point.
- 🎭 **`physical_performance_beat`** — Specific physical moment or action in a performance.
- 🎤 **`vocal_beat`** — Specific vocal moment.
- 📜 **`line_delivery`** — Specific delivery instructions for a line of dialogue.
- 🥁 **`dialogue_rhythm`** — The musicality of conversation between characters in a scene.
- 😤 **`emotional_physicality`** — How a specific emotion manifests physically for a character.
- 😏 **`microexpression`** — Fleeting facial expression that reveals hidden emotion.
- 🏠 **`character_environment_physicality`** — How a character physically inhabits a specific location.
- 🤲 **`physical_relationship`** — How two characters physically relate.
- 📊 **`physical_relationship_evolution`** — How a physical relationship between characters changes at a specific scene.
- 💃 **`movement_choreography`** — Designed movement patterns — dance, ritual, work, sport.
- 🎼 **`musical_theme`** — Recurring melodic or harmonic idea — leitmotif.
- 🔈 **`sound_cue`** — Individual sound effect or designed sound placement.
- 🎵 **`music_cue`** — Individual music cue placement in a scene.
- 👂 **`sound_perspective`** — Point-of-view in sound — whose hearing, what techniques.
- 📢 **`voiceover_design`** — Non-diegetic or semi-diegetic speech design.
- 🔀 **`music_sound_relationship`** — How score and sound design interact.


---

## Schema conventions at a glance

Counts of which entities opt into the framework-standard flags. These flags inject standard fields (Lifecycle, External tabs) — see `schema_reference.md` for the per-entity breakdown.

| Flag | Entities | Injected fields |
|---|---|---|
| `versionable` (Versionable) | 2 | `parent_id`, `version_label`, `superseded_at`, `superseded_by_id` |
| `has_lifecycle_status` (Has lifecycle status) | 100 | `lifecycle_status` |
| `has_external_id` (Has external ID) | 8 | `external_id`, `external_id_namespace` |

---

## Entity reference graph

Which entities hold foreign keys to which. Self-references created by injected versionable fields (`parent_id`, `superseded_by_id`) are omitted — every versionable entity has them, so they're structural rather than semantic connectivity.

| Entity | Field | References |
|---|---|---|
| `action_beat` | `action_sequence_id` | `action_sequence` |
| `action_beat` | `character_id` | `character` |
| `action_beat` | `scene_id` | `scene` |
| `action_sequence` | `scene_id` | `scene` |
| `action_sequence_character` | `action_sequence_id` | `action_sequence` |
| `action_sequence_character` | `character_id` | `character` |
| `actor_character_role` | `actor_id` | `actor` |
| `actor_character_role` | `character_id` | `character` |
| `asset_relationship` | `asset_id` | `asset` |
| `blocking_beat` | `character_id` | `character` |
| `blocking_beat` | `scene_blocking_id` | `scene_blocking` |
| `bundle_asset` | `asset_id` | `asset` |
| `bundle_asset` | `bundle_id` | `bundle` |
| `character_appearance_profile` | `character_id` | `character` |
| `character_asset_binding` | `act_id` | `act` |
| `character_asset_binding` | `bundle_id` | `bundle` |
| `character_asset_binding` | `character_id` | `character` |
| `character_asset_binding` | `scene_range_end_id` | `scene` |
| `character_asset_binding` | `scene_range_start_id` | `scene` |
| `character_asset_binding` | `variant_id` | `character_variant` |
| `character_color_identity` | `character_id` | `character` |
| `character_environment_physicality` | `character_id` | `character` |
| `character_environment_physicality` | `location_id` | `location` |
| `character_relationship` | `character_a_id` | `character` |
| `character_relationship` | `character_b_id` | `character` |
| `character_shot_override` | `bundle_override_id` | `bundle` |
| `character_shot_override` | `character_id` | `character` |
| `character_shot_override` | `shot_id` | `shot` |
| `character_shot_override` | `variant_target_id` | `character_variant` |
| `character_variant` | `character_id` | `character` |
| `clip` | `beat_id` | `story_beat` |
| `clip` | `scene_id` | `scene` |
| `clip` | `take_id` | `take` |
| `clip_character` | `character_id` | `character` |
| `clip_character` | `clip_id` | `clip` |
| `costume` | `character_id` | `character` |
| `costume_progression` | `character_id` | `character` |
| `costume_scene` | `costume_id` | `costume` |
| `costume_scene` | `scene_id` | `scene` |
| `delivery_profile` | `character_id` | `character` |
| `dialogue_rhythm` | `character_a_id` | `character` |
| `dialogue_rhythm` | `character_b_id` | `character` |
| `dialogue_rhythm` | `scene_id` | `scene` |
| `dialogue_sound_design` | `scene_id` | `scene` |
| `emotional_beat` | `emotional_arc_id` | `emotional_arc` |
| `emotional_beat` | `scene_id` | `scene` |
| `emotional_beat` | `sequence_id` | `sequence` |
| `emotional_physicality` | `character_id` | `character` |
| `facial_expression_profile` | `character_id` | `character` |
| `identification_strategy` | `primary_identification_character_id` | `character` |
| `identity_anchor` | `asset_id` | `asset` |
| `identity_anchor` | `character_id` | `character` |
| `identity_anchor` | `variant_id` | `character_variant` |
| `information_strategy` | `scene_id` | `scene` |
| `lighting_design` | `scene_id` | `scene` |
| `lighting_design` | `shot_id` | `shot` |
| `line_delivery` | `character_id` | `character` |
| `line_delivery` | `scene_id` | `scene` |
| `location_color_scheme` | `location_id` | `location` |
| `location_design` | `location_id` | `location` |
| `location_sound_profile` | `location_id` | `location` |
| `location_variant` | `location_id` | `location` |
| `makeup_hair_design` | `character_id` | `character` |
| `makeup_hair_design` | `scene_id` | `scene` |
| `microexpression` | `character_id` | `character` |
| `microexpression` | `scene_id` | `scene` |
| `motif_manifestation` | `conceptual_motif_id` | `conceptual_motif` |
| `motif_manifestation` | `scene_id` | `scene` |
| `movement_choreography` | `scene_id` | `scene` |
| `music_cue` | `musical_theme_id` | `musical_theme` |
| `music_cue` | `scene_id` | `scene` |
| `music_sound_relationship` | `scene_id` | `scene` |
| `musical_theme` | `character_id` | `character` |
| `musical_theme` | `first_appearance_scene_id` | `scene` |
| `physical_character_profile` | `character_id` | `character` |
| `physical_habit` | `character_id` | `character` |
| `physical_performance_beat` | `character_id` | `character` |
| `physical_performance_beat` | `scene_id` | `scene` |
| `physical_relationship` | `character_a_id` | `character` |
| `physical_relationship` | `character_b_id` | `character` |
| `physical_relationship_evolution` | `physical_relationship_id` | `physical_relationship` |
| `physical_relationship_evolution` | `scene_id` | `scene` |
| `physical_state` | `character_id` | `character` |
| `physical_state` | `scene_id` | `scene` |
| `prop` | `associated_character` | `character` |
| `proxemic_design` | `scene_id` | `scene` |
| `scene` | `location_id` | `location` |
| `scene_blocking` | `scene_id` | `scene` |
| `scene_character` | `character_id` | `character` |
| `scene_character` | `scene_id` | `scene` |
| `scene_color_palette` | `scene_id` | `scene` |
| `scene_emotional_target` | `scene_id` | `scene` |
| `scene_music_design` | `scene_id` | `scene` |
| `scene_prop` | `prop_id` | `prop` |
| `scene_prop` | `scene_id` | `scene` |
| `scene_sequence` | `scene_id` | `scene` |
| `scene_sequence` | `sequence_id` | `sequence` |
| `sequence` | `act_id` | `act` |
| `set_dressing` | `location_id` | `location` |
| `set_dressing` | `scene_id` | `scene` |
| `shot` | `scene_id` | `scene` |
| `shot_coverage` | `shot_id` | `shot` |
| `shot_coverage` | `source_clip_id` | `clip` |
| `shot_coverage` | `source_take_id` | `take` |
| `shot_design` | `shot_id` | `shot` |
| `shot_language` | `shot_id` | `shot` |
| `sonic_motif` | `first_appearance_scene_id` | `scene` |
| `sonic_motif` | `related_visual_motif_id` | `visual_motif` |
| `sound_cue` | `scene_id` | `scene` |
| `sound_cue` | `shot_id` | `shot` |
| `sound_perspective` | `character_id` | `character` |
| `sound_perspective` | `scene_id` | `scene` |
| `story_beat` | `pov_character_id` | `character` |
| `story_beat` | `scene_id` | `scene` |
| `subtext` | `scene_id` | `scene` |
| `symbol` | `first_appearance_scene_id` | `scene` |
| `take` | `corpus_id` | `performance_corpus` |
| `take` | `shot_id` | `shot` |
| `take_scene` | `scene_id` | `scene` |
| `take_scene` | `take_id` | `take` |
| `thematic_connection` | `theme_id` | `theme` |
| `tone_marker` | `scene_id` | `scene` |
| `tone_marker` | `sequence_id` | `sequence` |
| `visual_motif_appearance` | `visual_motif_id` | `visual_motif` |
| `vocal_beat` | `character_id` | `character` |
| `vocal_beat` | `scene_id` | `scene` |
| `vocal_profile` | `character_id` | `character` |
| `vocal_state` | `character_id` | `character` |
| `vocal_state` | `scene_id` | `scene` |
| `voiceover_design` | `character_id` | `character` |

*4 injected self-references omitted: `bundle.parent_id`, `bundle.superseded_by_id`, `character_shot_override.parent_id`, `character_shot_override.superseded_by_id`.*

---

## Where to find more

- **Full field-level reference:** `docs/current/schema_reference.md`
- **Operational source of truth:** `entity_registry.py`
- **Design history:** `docs/design/` (dated design documents)
- **Active design work:** `docs/ai_context/active_design_work.md`
