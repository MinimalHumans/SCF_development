# SCF Schema Snapshot

*Compact reference for orientation. Auto-generated from `entity_registry.py` on 2026-05-19 UTC. For full field-level detail, see `schema_reference.md`.*

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

Domain-specific axes — verification, approval, production realization. Each tracks a concern genuinely distinct from lifecycle.

| Field | Values | Meaning |
|---|---|---|
| `asset.approval_status` | `wip`, `pending`, `approved`, `final` | Review state for an asset. |
| `entity_anchor.canonical_status` | `verified`, `candidate`, `rejected` | Whether an anchor has been confirmed as canonical reference. |
| `character.casting_status` | `tbd`, `cast`, `actor_as_character`, `digital_double`, `generated_only` | Whether and how a character has a real-world actor anchor. |
| `prop.realization_status` | `tbd`, `sourced`, `built`, `scanned`, `hybrid`, `generated_only` | How the prop will exist in the final work. |
| `location.realization_status` | `tbd`, `real_location`, `built`, `plate_captured`, `virtual_set`, `hybrid`, `generated_only` | How the location will be realized. |

The `casting_status` / `realization_status` family is a "how will this entity be brought into existence?" axis that drives downstream tool expectations: a `casting_status=generated_only` character needs a complete `visual_identity` bundle; a `realization_status=real_location` location may have plate captures rather than asset bindings; a `realization_status=hybrid` prop combines methods (sourced base + built modification, scanned then sculpted, etc.). The format records the intent; tools interpret it.

These all stay as separate fields with their own enums.

#### Multiple axes coexist

A single entity often has multiple status fields, each measuring a different axis:

- A `project` has `lifecycle_status` (is this record current?) and `production_status` (what phase?).
- An `asset` has `lifecycle_status` (is this record current?) and `approval_status` (has this been approved for use?).
- An `entity_anchor` has `lifecycle_status` and `canonical_status`.
- A `character` has `lifecycle_status` and `casting_status`.
- A `prop` or `location` has `lifecycle_status` and `realization_status`.

Tools query the axis relevant to their job. Compressing axes into a single field would force false equivalences.

### Casing convention

**All enum values across the schema are lowercase**, with two carve-outs for legibility:

- **Acronyms stay uppercase.** Camera framing acronyms (`EWS`, `WS`, `MS`, `MCU`, `CU`, `ECU`, `OTS`, `POV`), color spaces (`Rec.709`, `DCI-P3`), standards (`ACES`, `DCP`, `BVH`), resolution tokens (`2K`, `4K`, `8K`), mixed-case proper nouns (`ProRes`, `ARRIRAW`, `REDCODE`, `ARRI`, `Dolby`, `Atmos`, `Stereo`), and short domain acronyms (`TBD`, `VFX`). The principle: when a token is a domain acronym or proper noun that everyone in film/VFX writes a specific way, we honor that — strict lowercase would harm legibility (`mcu` reads worse than `MCU`).
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

### Polymorphism patterns

Some fields need to reference "an entity, of some type". SCF uses two patterns for this, with deliberately different naming conventions so the distinction is visible at the field name.

#### Constrained polymorphism (`subject_*` naming)

The target set is fixed at the format level. Tools switch exhaustively on the type. Naming pattern:

| Field | Notes |
|---|---|
| `subject_type` | hard-coded enum, closed. e.g. `character`, `prop`, `location`. |
| `subject_id` | integer FK into the table named by `subject_type`. |
| `subject_variant_id` (optional) | integer FK into the `<subject_type>_variant` table for this subject. |

Used by: `entity_anchor`.

The closed enum is the point: anyone reading the schema knows the complete list of valid `subject_type` values, tools can statically check coverage, and new target types require a deliberate schema change rather than appearing organically.

#### Open polymorphism (`entity_*` naming)

The target set is genuinely heterogeneous or unbounded. Tools handle the types they recognize and pass others through. Naming pattern:

| Field | Notes |
|---|---|
| `entity_type` | free string. Sometimes restricted by enum in the registry for documentation, but treated as open at the format level. |
| `entity_id` | integer FK into the table named by `entity_type`. |

Used by: `asset_relationship` (any entity), `visual_motif_appearance` (location/prop/costume/scene/shot), `motif_manifestation` (dialogue/action/visual/audio domains), `thematic_connection` (various story entities).

The open variant is appropriate when the entity type is incidental to the relationship — an asset can relate to anything; a motif can manifest anywhere — and forcing a closed enum would be a maintenance burden.

#### Choosing which to use

When adding a polymorphic reference, prefer **constrained** unless the target set is genuinely open. Constrained is friendlier to tools and to readers of the schema. Open is honest about cases where the set really does vary.

The two patterns deliberately share neither a field name nor a naming root — `subject_*` vs `entity_*` — so the choice is visible at every reference site.

#### Polymorphic references in the doc generator

Both patterns store the FK as a plain integer (not a `reference`-type field, since the target table varies), so polymorphic references don't appear in `schema_reference.md`'s reference graph. They're documented in the per-entity field tables via `help_text`, and as a category here. If the reference graph ever grows a "Polymorphic references" subsection, the source for it is the `<base>_type` + `<base>_id` field pair pattern.

### Preservation over deletion

The schema favors lifecycle state transitions over physical deletion. A cut character isn't removed from the file; their `lifecycle_status` changes to `cut`. A superseded bundle isn't deleted; the new version supersedes it and the old version's `lifecycle_status` becomes `superseded`. A rejected entity anchor isn't deleted; its `canonical_status` changes to `rejected`.

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

These appear on: `project`, `asset`, `actor`, `character`, `prop`, `location`, `scene`, `shot`, `take`, `clip`. Authoring tools don't need to fill them in. Tools that bridge SCF and an external system populate them to maintain identity across handoffs.

The mechanism is generic. It serves OMC interop but is not OMC-specific.

#### What SCF does not do

SCF does not adopt OMC's identifier scheme, does not implement OMC's base classes, does not follow OMC's governance, and does not require OMC-aware tools to consume it. A tool that knows nothing about OMC can author and read SCF files in full.

### The bundle pattern (character cluster)

For media references on characters, the schema uses a tool-agnostic bundle pattern. The same pattern extends to props and locations — see the next section for the deltas.

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
| `surface` | material/texture detail (skin micro, fabric weave, prop material) |
| `environment` | for locations: spatial/environmental references |
| `acoustic` | non-character sound profiles (location ambience, prop sounds, ensemble beds) |
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

#### Entity anchors

Distinct from bundles, anchors mark known-good single frames or audio segments as canonical references. Used for both ID-locking inputs and output verification (QA). Anchors point into source assets with optional spatial scoping (`region_box`) and temporal scoping (`frame_number`, `timecode`, audio offset). Source assets stay whole and uncropped — anchors describe how to interpret them.

The `entity_anchor` entity (formerly `identity_anchor`) uses constrained polymorphism — `subject_type` (closed enum: `character`, `prop`, `location`) + `subject_id` + optional `subject_variant_id`. The same anchor mechanism serves all three subject types; what's anchored is whatever the `subject_type` names. See [Polymorphism patterns](#polymorphism-patterns) above.

#### Resolution cascade

A tool generating any character in any shot walks a deterministic cascade:

1. Check `character_shot_override` for (shot, character, active). If `bundle_override_id` is set and the bundle matches the requested modality, use it.
2. Check `shot_coverage` (most recent by status_date). If `coverage_state` is `captured_live` and the captured source provides usable data for the requested modality, use it.
3. Resolve `character_asset_binding` for the character, filtered by scene/variant/state and bundle `intent` matching the requested modality. Pick highest-precedence match.
4. Fall back to bindings with looser scope: drop state filter, then variant filter, then fall to `is_baseline=true`.
5. For verification, pull `entity_anchor` records (with `subject_type=character`) matching the same conditions and modality.

**The cascade operates per-modality.** Visual, voice, motion, and behavior are resolved independently. A tool requesting one modality filters by bundle `intent`. Step 2 (captured live) short-circuits only when the captured source provides usable data for that modality.

The cascade enables performance-first projects (live action, generation augmenting) and generation-first projects (fully synthetic) to use the same query patterns. They simply land at different steps.

The same cascade shape applies to props and locations — just with `prop_shot_override` / `prop_asset_binding` / `entity_anchor(subject_type=prop)`, and `location_shot_override` / `location_asset_binding` / `entity_anchor(subject_type=location)`. See the next section.

### Extending the bundle pattern: props and locations

The bundle pattern was designed on the character cluster. It extends symmetrically to props and locations with the deltas below.

#### Parallel per-subject families

The pattern's per-entity entities have parallel names:

| Subject | Variant | Asset binding | Shot override |
|---|---|---|---|
| `character` | `character_variant` | `character_asset_binding` | `character_shot_override` |
| `prop` | `prop_variant` | `prop_asset_binding` | `prop_shot_override` |
| `location` | `location_variant` | `location_asset_binding` | `location_shot_override` |

All three rows follow the same structure: variants describe modified states of the subject; bindings apply bundles under conditions; overrides record per-shot deviations from the binding cascade. The resolution cascade operates per-modality for each subject independently.

`entity_anchor` serves all three subject types via constrained polymorphism — one anchor table, three valid `subject_type` values.

#### Location-specific simplification

Where character has a deep stack of description entities (`physical_character_profile`, `vocal_profile`, `character_appearance_profile`, `costume`, `makeup_hair_design`, etc.), location's depth is much thinner. Atmosphere, lighting, color, and sound for a location are already covered by existing scene-level and Tier 2 entities — `scene_color_palette`, `lighting_design`, `scene_music_design`, `set_dressing`, `dialogue_sound_design`, `location_color_scheme`, `location_sound_profile`, `location_design`. The slimmed `location` entity carries only what's intrinsic to the place across all scenes: name, type, setting, geography, time period, realization status, and a baseline `notes` field.

#### Prop surface profile

Props get one additional Tier 2 description entity beyond the parallels above: `prop_surface_profile`. This holds the surface and material qualities that an artist or a generative tool needs to render the prop consistently (material, finish, wear, response to light). Other prop description axes are folded into the existing prop entity's main fields.

#### Plates and the performance corpus

The performance corpus stays as one shared layer regardless of subject type. There is no `prop_performance_corpus` or `location_performance_corpus` — all captured footage lives in one `performance_corpus`, organized into `take` → `clip`. A clip whose primary purpose is a plate or atmospheric capture is modeled as `clip` with `clip_type=atmospheric`. Props that appear in a clip are linked via the `clip_prop` junction; locations that appear in a clip are reached via the clip's `scene_id` (and the scene's `location_id`), so no separate `clip_location` junction exists.

#### Realization status enums

Each subject's `realization_status` enum has its own values (see Status field taxonomy §4) but a shared shape:

- `tbd` — not yet decided
- `generated_only` — exists only as model output
- `hybrid` — combined methods (live + synthesized, or any other multi-method realization)
- A small number of subject-specific "fully realized" values: `cast` for character; `sourced` / `built` / `scanned` for prop; `real_location` / `built` / `plate_captured` / `virtual_set` for location

Tools can switch on the status to gate workflow expectations: a `generated_only` subject needs a complete bundle stack; a `real_location` or `cast` subject can rely on captured material at step 2 of the cascade; `hybrid` is the signal that both paths contribute.

### Naming conventions for new entities

When adding new entities to the registry, follow these conventions:

- **Entity names:** `snake_case` singular. e.g. `character_variant`, `entity_anchor`, `performance_corpus`.
- **Junction entities:** noun-noun, indicating what's being connected. e.g. `scene_character`, `clip_character`, `clip_prop`, `actor_character_role`.
- **Field names:** `snake_case`. Reference fields are `<target>_id`.
- **Polymorphic references:** `subject_*` for constrained polymorphism, `entity_*` for open. See [Polymorphism patterns](#polymorphism-patterns).
- **Enum values:** lowercase, underscored if multi-word. e.g. `actor_as_character`, `hybrid_generated_extension`.
- **Categories:** human-readable Title Case. e.g. `"Character Depth"`, `"Thematic Tracking"`, `"Prop Depth"`.

#### Parallel entity families

When extending a pattern to multiple subject types, use parallel naming. The names should be derivable rather than invented.

| Pattern | Examples |
|---|---|
| `<subject>_variant` | `character_variant`, `prop_variant`, `location_variant` |
| `<subject>_asset_binding` | `character_asset_binding`, `prop_asset_binding`, `location_asset_binding` |
| `<subject>_shot_override` | `character_shot_override`, `prop_shot_override`, `location_shot_override` |
| `<subject>_<aspect>_profile` | `physical_character_profile`, `vocal_profile`, `prop_surface_profile`, `location_sound_profile` |
| `clip_<subject>` (junction) | `clip_character`, `clip_prop` |

Parallel naming reads predictably and makes it obvious where the pattern applies. When a new subject type adopts the pattern, the entity names follow from the convention rather than from a fresh design decision.

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

*25 entities*

**Connections**
- 🔗 **`scene_character`** — Links a character to a scene with role information.
- 🔗 **`scene_prop`** — Links a prop to a scene with usage details.
- 🔗 **`scene_sequence`** — Links a scene to a sequence with ordering.
- 🔗 **`costume_scene`** — Links a costume to the scenes where it appears.
- 🔗 **`visual_motif_appearance`** — Where a visual motif manifests (in a location, prop, costume, or scene). Open polymorphism — entity_type is open-ended.
- 🔗 **`motif_manifestation`** — Where a conceptual motif manifests in the story. Open polymorphism — entity_type is open-ended.
- 🔗 **`action_sequence_character`** — Links characters to action sequences with their role.
- 🔗 **`asset_relationship`** — Links an asset to an entity it documents or references. Open polymorphism — entity_type is open-ended.
- 🔗 **`bundle_asset`** — Junction: assets that compose a bundle.
- 🔗 **`actor_character_role`** — Junction: actor + character + role type.
- 🔗 **`take_scene`** — Junction: scenes covered by a take. Takes can cross scenes.
- 🔗 **`clip_character`** — Junction: characters present in a clip with their role.
- 🔗 **`clip_prop`** — Junction: props present in a clip with their role. Parallel to clip_character. Supports queries like 'every clip featuring the locket' — useful for production review and for assembling prop-identity training sets.

**Metadata**
- ✅ **`creative_decision`** — A recorded creative decision with rationale.
- 💬 **`collaboration_note`** — Notes for or from collaborators.
- 📎 **`asset`** — Reference asset (image, audio, video, document). The atomic unit that bundles compose. Versionable — supports asset version chains.

**Project**
- 🎬 **`project`** — The root container for an SCF story project.

**Story Entities**
- 👤 **`character`** — A character in the story. Identity and narrative function only — physical/vocal/wardrobe details live in Tier 2 description entities.
- 📍 **`location`** — A location where story events take place. Identity and narrative function only — architectural/visual detail lives in location_design, color in location_color_scheme, sound in location_sound_profile, and state variation (time-of-day, weather, post-event) in location_variant.
- 🔧 **`prop`** — A significant object in the story. Identity, narrative function, and story moments — surface/material detail lives in prop_surface_profile, state variation (clean/damaged/symbolic) in prop_variant.

**Story Structure**
- 🎭 **`act`** — A major structural division of the story.
- 📑 **`sequence`** — A group of related scenes forming a narrative unit.
- 🎬 **`scene`** — A single scene in the story.
- 🎯 **`story_beat`** — A discrete narrative unit within a scene — a moment of change.

**Vision**
- 💡 **`theme`** — A thematic element that runs through the story.


### Tier 1

*17 entities*

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


### Tier 2

*30 entities*

**Asset Reference**
- 📦 **`bundle`** — Named, intent-typed collection of assets. Tool-agnostic media reference primitive used by the character cluster (and now by props and locations). Versionable — participates in linear version chains.
- 🎚️ **`character_asset_binding`** — Applies a bundle to a character under specific conditions.
- 📍 **`entity_anchor`** — Known-good single frame, audio segment, or motion sample marked as canonical reference for a character, prop, or location. Used for both ID-locking inputs and output verification. Points into source assets without modifying them. Uses constrained polymorphism — subject_type is a hard closed enum (character / prop / location).
- 🎚️ **`prop_asset_binding`** — Applies a bundle to a prop under specific conditions (variant, scene range, act). Tools walk the prop resolution cascade and use bindings to find the right media for a prop in a given scene/state.
- 🎚️ **`location_asset_binding`** — Applies a bundle to a location under specific conditions (variant, scene range, act, time-of-day). Tools walk the location resolution cascade and use bindings to find the right media for a location.

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
- 🔀 **`character_variant`** — Specific state or version of a character (e.g. Young Eleanor, Angry Marcus).
- ✋ **`physical_habit`** — Recurring physical behavior — gesture, tic, comfort behavior.

**Location Depth**
- 🏗️ **`location_design`** — Detailed visual design — architecture, materials, spatial layout.
- 🔀 **`location_variant`** — Modified state of a location (e.g. Night version, After fire). Includes structured state axes (time-of-day, weather, season, post-event state) that previously lived on the location base entity. Exactly one variant per location should be marked is_baseline = true.
- 🎨 **`location_color_scheme`** — Color palette and atmosphere for a specific location.
- 🔉 **`location_sound_profile`** — Acoustic identity of a place — room tone, ambience, character.

**Performance Corpus**
- 🎞️ **`performance_corpus`** — Project-level index of captured footage.
- 🎭 **`actor`** — Minimal actor entity. SCF is story-first, not a casting tracker — this entity captures only what the story format needs.
- 🎬 **`take`** — A single recorded take. May cross scenes (via take_scene junction).
- ✂️ **`clip`** — A meaningful within-scene segment of a take. Plates are clips with clip_type=atmospheric.

**Prop Depth**
- 🪙 **`prop_surface_profile`** — Surface, material, and physical-presence detail for a prop. Holds the descriptive baseline that surface and visual bundles reference. State variation (clean vs damaged) belongs in prop_variant.
- 🔀 **`prop_variant`** — Specific state or version of a prop (e.g. Locket open, Gun blood-spattered, Letter torn). Tools bind state-specific bundles to a prop variant; the cascade resolves the right bundle for the right state.

**Workflow State**
- 📊 **`shot_coverage`** — Production state of each shot. Multiple records per shot, ordered by status_date, give a production timeline. Most recent is canonical.
- 🎛️ **`character_shot_override`** — Per-character deviation from the cascade for a specific shot. Versionable: only one active record per (shot, character). Multiple intents compose into a single record via override_types multiselect and the delta fields.
- 🎛️ **`prop_shot_override`** — Per-prop deviation from the cascade for a specific shot. Versionable: only one active record per (shot, prop). Earns its keep for mid-shot state transitions (gun firing, locket falling open) and shot-specific VFX enhancement.
- 🎛️ **`location_shot_override`** — Per-location deviation from the cascade for a specific shot. Versionable: only one active record per (shot, location). Most location deviations belong at scene level (location_variant); this entity is for genuinely shot-specific cases (VFX additions, shot reveals beyond standard coverage).


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
- 🔗 **`thematic_connection`** — How a specific element connects to a theme. Open polymorphism — entity_type is open-ended.
- 🌈 **`color_symbolism`** — Thematic meanings assigned to specific colors in this story.
- 🎞️ **`color_script`** — Visual map of color progression through the story.
- 🎨 **`character_color_identity`** — Signature color language for a character. A directorial choice about how the character manifests visually — thematic, not fundamental.


### Tier 5

*4 entities*

**Thematic Tracking**
- 📈 **`emotional_arc`** — Overall emotional trajectory for the audience across the project.
- 💓 **`emotional_beat`** — Specific point on the audience emotional journey.
- 🧩 **`information_strategy`** — What the audience knows vs what characters know.
- 🎯 **`identification_strategy`** — How the audience aligns with characters in a scene.


### Tier 6

*26 entities*

**Production**
- 🎥 **`shot`** — A single camera setup within a scene.
- 📐 **`shot_design`** — Detailed visual composition for a shot.
- 🗣️ **`shot_language`** — How shots communicate meaning — visual vocabulary for a scene.
- 🗺️ **`scene_blocking`** — Physical staging of characters and movement within the scene.
- 📍 **`blocking_beat`** — Discrete blocking moment within a scene.
- 💥 **`action_sequence`** — Choreographed action sequence — fight, chase, stunt.
- ⚡ **`action_beat`** — Discrete moment within an action sequence.
- 📏 **`proxemic_design`** — Use of physical distance between characters as meaning.
- 🌡️ **`physical_state`** — Modulation of a character's baseline physicality in a specific moment.
- 🎤 **`vocal_state`** — Modulation of a character's baseline vocal profile in a specific moment.
- 🏃 **`physical_performance_beat`** — A specific physical performance moment within a scene.
- 💬 **`vocal_beat`** — A specific vocal performance moment within a scene.
- 🗨️ **`line_delivery`** — Specific direction for how a line should be delivered.
- 🎼 **`dialogue_rhythm`** — Conversational pacing and interaction patterns in a scene.
- 💢 **`emotional_physicality`** — How emotion manifests in the body.
- 👁️ **`microexpression`** — Brief involuntary facial expression revealing inner state.
- 🏞️ **`character_environment_physicality`** — How a character physically interacts with their environment.
- 🤝 **`physical_relationship`** — Physical dimension of a relationship between characters.
- 📈 **`physical_relationship_evolution`** — How a physical relationship changes across the story.
- 💃 **`movement_choreography`** — Choreographed movement design for a scene or sequence.
- 🎼 **`musical_theme`** — Recurring musical phrase associated with a character, place, or idea.
- 🔊 **`sound_cue`** — A specific sound element placement.
- 🎵 **`music_cue`** — A specific music placement and its function.
- 👂 **`sound_perspective`** — POV approach to sound — whose ears are we using?
- 🎙️ **`voiceover_design`** — Narration / inner-voice approach for the project or scene.
- 🎚️ **`music_sound_relationship`** — How music and sound design interact in a scene.


---

## Schema conventions at a glance

Counts of which entities opt into the framework-standard flags. These flags inject standard fields (Lifecycle, External tabs) — see `schema_reference.md` for the per-entity breakdown.

| Flag | Entities | Injected fields |
|---|---|---|
| `versionable` (Versionable) | 5 | `parent_id`, `version_label`, `superseded_at`, `superseded_by_id` |
| `has_lifecycle_status` (Has lifecycle status) | 106 | `lifecycle_status` |
| `has_external_id` (Has external ID) | 10 | `external_id`, `external_id_namespace` |

---

## Entity reference graph

Which entities hold foreign keys to which. Self-references created by injected versionable fields (`parent_id`, `superseded_by_id`) are omitted — every versionable entity has them, so they're structural rather than semantic connectivity.

| Entity | Field | References |
|---|---|---|
| `action_beat` | `action_sequence_id` | `action_sequence` |
| `action_sequence` | `scene_id` | `scene` |
| `action_sequence_character` | `action_sequence_id` | `action_sequence` |
| `action_sequence_character` | `character_id` | `character` |
| `actor_character_role` | `actor_id` | `actor` |
| `actor_character_role` | `character_id` | `character` |
| `asset_relationship` | `asset_id` | `asset` |
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
| `clip_prop` | `clip_id` | `clip` |
| `clip_prop` | `prop_id` | `prop` |
| `costume` | `character_id` | `character` |
| `costume_progression` | `character_id` | `character` |
| `costume_scene` | `costume_id` | `costume` |
| `costume_scene` | `scene_id` | `scene` |
| `delivery_profile` | `character_id` | `character` |
| `dialogue_rhythm` | `scene_id` | `scene` |
| `dialogue_sound_design` | `scene_id` | `scene` |
| `emotional_beat` | `emotional_arc_id` | `emotional_arc` |
| `emotional_beat` | `scene_id` | `scene` |
| `emotional_beat` | `sequence_id` | `sequence` |
| `emotional_physicality` | `character_id` | `character` |
| `entity_anchor` | `asset_id` | `asset` |
| `facial_expression_profile` | `character_id` | `character` |
| `identification_strategy` | `primary_identification` | `character` |
| `identification_strategy` | `scene_id` | `scene` |
| `identification_strategy` | `secondary_identification` | `character` |
| `information_strategy` | `scene_id` | `scene` |
| `lighting_design` | `scene_id` | `scene` |
| `lighting_design` | `shot_id` | `shot` |
| `line_delivery` | `character_id` | `character` |
| `line_delivery` | `scene_id` | `scene` |
| `location_asset_binding` | `act_id` | `act` |
| `location_asset_binding` | `bundle_id` | `bundle` |
| `location_asset_binding` | `location_id` | `location` |
| `location_asset_binding` | `scene_range_end_id` | `scene` |
| `location_asset_binding` | `scene_range_start_id` | `scene` |
| `location_asset_binding` | `variant_id` | `location_variant` |
| `location_color_scheme` | `location_id` | `location` |
| `location_design` | `location_id` | `location` |
| `location_shot_override` | `bundle_override_id` | `bundle` |
| `location_shot_override` | `location_id` | `location` |
| `location_shot_override` | `shot_id` | `shot` |
| `location_shot_override` | `variant_target_id` | `location_variant` |
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
| `physical_character_profile` | `character_id` | `character` |
| `physical_habit` | `character_id` | `character` |
| `physical_performance_beat` | `character_id` | `character` |
| `physical_performance_beat` | `scene_id` | `scene` |
| `physical_relationship` | `character_a_id` | `character` |
| `physical_relationship` | `character_b_id` | `character` |
| `physical_relationship_evolution` | `physical_relationship_id` | `physical_relationship` |
| `physical_state` | `character_id` | `character` |
| `physical_state` | `scene_id` | `scene` |
| `physical_state` | `shot_id` | `shot` |
| `prop` | `associated_character` | `character` |
| `prop_asset_binding` | `act_id` | `act` |
| `prop_asset_binding` | `bundle_id` | `bundle` |
| `prop_asset_binding` | `prop_id` | `prop` |
| `prop_asset_binding` | `scene_range_end_id` | `scene` |
| `prop_asset_binding` | `scene_range_start_id` | `scene` |
| `prop_asset_binding` | `variant_id` | `prop_variant` |
| `prop_shot_override` | `bundle_override_id` | `bundle` |
| `prop_shot_override` | `prop_id` | `prop` |
| `prop_shot_override` | `shot_id` | `shot` |
| `prop_shot_override` | `variant_target_id` | `prop_variant` |
| `prop_surface_profile` | `prop_id` | `prop` |
| `prop_variant` | `prop_id` | `prop` |
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
| `shot_language` | `scene_id` | `scene` |
| `sonic_motif` | `first_appearance_scene_id` | `scene` |
| `sonic_motif` | `related_visual_motif_id` | `visual_motif` |
| `sound_cue` | `scene_id` | `scene` |
| `sound_cue` | `shot_id` | `shot` |
| `sound_perspective` | `pov_character_id` | `character` |
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
| `vocal_state` | `shot_id` | `shot` |
| `voiceover_design` | `character_id` | `character` |
| `voiceover_design` | `scene_id` | `scene` |

*10 injected self-references omitted: `asset.parent_id`, `asset.superseded_by_id`, `bundle.parent_id`, `bundle.superseded_by_id`, `character_shot_override.parent_id`, `character_shot_override.superseded_by_id`, `location_shot_override.parent_id`, `location_shot_override.superseded_by_id`, `prop_shot_override.parent_id`, `prop_shot_override.superseded_by_id`.*

---

## Where to find more

- **Full field-level reference:** `docs/current/schema_reference.md`
- **Operational source of truth:** `entity_registry.py`
- **Design history:** `docs/design/` (dated design documents)
- **Active design work:** `docs/ai_context/active_design_work.md`
