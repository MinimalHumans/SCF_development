# SCF Schema Reference

*Auto-generated from `entity_registry.py` on 2026-05-19 UTC. Do not edit by hand — re-run `scripts/generate_schema_docs.py` instead.*

---

## Summary

- **Total entities:** 118
- **Total declared visible fields:** 1014
- **Total auto-injected fields:** 146 (from `versionable` / `has_lifecycle_status` / `has_external_id` flags)
- **Categories:** 16
- **Versionable:** 5 entities
- **Has lifecycle status:** 106 entities
- **Has external ID:** 10 entities

---

## Table of contents

- [Project](#category-project) (1 entities)
- [Story Entities](#category-story-entities) (3 entities)
- [Story Structure](#category-story-structure) (4 entities)
- [Vision](#category-vision) (1 entities)
- [Connections](#category-connections) (13 entities)
- [Metadata](#category-metadata) (3 entities)
- [Creative Direction](#category-creative-direction) (17 entities)
- [Character Depth](#category-character-depth) (11 entities)
- [Prop Depth](#category-prop-depth) (2 entities)
- [Asset Reference](#category-asset-reference) (5 entities)
- [Performance Corpus](#category-performance-corpus) (4 entities)
- [Workflow State](#category-workflow-state) (4 entities)
- [Location Depth](#category-location-depth) (4 entities)
- [Scene Detail](#category-scene-detail) (7 entities)
- [Thematic Tracking](#category-thematic-tracking) (13 entities)
- [Production](#category-production) (26 entities)

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
| `project_format` | select<br/>options: `feature`, `series`, `short`, `commercial`, `other` |  |  | General | *Format* |
| `production_status` | select<br/>options: `development`, `pre_production`, `production`, `post_production`, `complete` |  | `development` | General | *Production Status* — Project-level production phase axis. |
| `workflow_mode` | select<br/>options: `performance_first`, `generation_first`, `hybrid` |  | `generation_first` | General | *Workflow Mode* — Dominant production workflow stance. |
| `notes` | textarea |  |  | Notes | *Notes* |
| `vision_statement` | textarea |  |  | Vision | *Vision Statement* |
| `creative_philosophy` | textarea |  |  | Vision | *Creative Philosophy* |
| `themes` | json |  |  | Vision | *Core Themes* — placeholder: ["redemption", "identity", "power"] |

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
| `backstory` | textarea |  |  | Backstory | *Backstory* |
| `motivation` | textarea |  |  | Backstory | *Core Motivation* |
| `flaw` | text |  |  | Backstory | *Fatal Flaw* |
| `arc_description` | textarea |  |  | Backstory | *Character Arc* |
| `internal_goal` | textarea |  |  | Backstory | *Internal Goal* |
| `external_goal` | textarea |  |  | Backstory | *External Goal* |
| `greatest_fear` | textarea |  |  | Backstory | *Greatest Fear* |
| `core_belief` | textarea |  |  | Backstory | *Core Belief* |
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

A location where story events take place. Identity and narrative function only — architectural/visual detail lives in location_design, color in location_color_scheme, sound in location_sound_profile, and state variation (time-of-day, weather, post-event) in location_variant.

| Meta | Value |
|---|---|
| Plural label | Locations |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 20 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Location Name* — placeholder: e.g. The Old Mill |
| `location_type` | select<br/>options: `interior`, `exterior`, `int/ext`, `virtual`, `abstract` |  |  | General | *Type* |
| `setting` | textarea |  |  | General | *Setting Description* — placeholder: What does this place look and feel like? (narrative-level) |
| `time_period` | text |  |  | General | *Time Period* |
| `geography` | text |  |  | General | *Geography / Region* — placeholder: e.g. Northern California coast |
| `realization_status` | select<br/>options: `tbd`, `real_location`, `built`, `plate_captured`, `virtual_set`, `hybrid`, `generated_only` |  | `tbd` | General | *Realization Status* — How this location is realized in production. real_location = found and shot in-camera; built = constructed set; plate_captured = photographic plate only; virtual_set = LED wall / volumetric; hybrid = combined methods (practical + extension etc.); generated_only = fully synthetic. |
| `key_features` | textarea |  |  | Details | *Key Features* — placeholder: Notable objects, architecture, landmarks. Specific dressing belongs in set_dressing. |
| `notes` | textarea |  |  | Details | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Details`, `Lifecycle`, `External`


#### 🔧 `prop` — Prop

A significant object in the story. Identity, narrative function, and story moments — surface/material detail lives in prop_surface_profile, state variation (clean/damaged/symbolic) in prop_variant.

| Meta | Value |
|---|---|
| Plural label | Props |
| Category | Story Entities |
| Tier | 0 |
| Sort order | 30 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Prop Name* — placeholder: e.g. The Silver Compass |
| `prop_type` | select<br/>options: `hand prop`, `set dressing`, `vehicle`, `weapon`, `document`, `technology`, `clothing item`, `food/drink`, `other` |  |  | General | *Type* |
| `description` | textarea |  |  | General | *Description* — placeholder: What does this prop look like? |
| `realization_status` | select<br/>options: `tbd`, `sourced`, `built`, `scanned`, `hybrid`, `generated_only` |  | `tbd` | General | *Realization Status* — How this prop is realized in production. sourced = found / purchased real object; built = fabricated; scanned = real object digitally captured; hybrid = combined methods (practical + VFX, sourced + CG damage, plate replacement, miniature, etc.); generated_only = fully synthetic. |
| `narrative_significance` | textarea |  |  | General | *Narrative Significance* — placeholder: Why does this prop matter to the story? |
| `story_function` | select<br/>options: `macguffin`, `character extension`, `plot device`, `symbol`, `atmosphere`, `other` |  |  | General | *Story Function* |
| `associated_character` | reference → `character` |  |  | General | *Primary Character* |
| `first_appearance` | textarea |  |  | Story | *First Appearance* |
| `key_moments` | textarea |  |  | Story | *Key Moments* |
| `symbolism` | textarea |  |  | Story | *Symbolism* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Story`, `Notes`, `Lifecycle`, `External`


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
| `name` | text | yes |  | General | *Act Name* |
| `act_number` | integer |  |  | General | *Act Number* |
| `function` | textarea |  |  | General | *Function* |
| `dramatic_question` | textarea |  |  | General | *Dramatic Question* |
| `shift` | textarea |  |  | General | *Shift* |
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
| `name` | text | yes |  | General | *Sequence Name* |
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
| `name` | text | yes |  | General | *Scene Name / Slug* |
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
| `value_shift` | text |  |  | General | *Value Shift* |
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

Where a visual motif manifests (in a location, prop, costume, or scene). Open polymorphism — entity_type is open-ended.

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

Where a conceptual motif manifests in the story. Open polymorphism — entity_type is open-ended.

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


#### 🔗 `action_sequence_character` — Action Sequence-Character

Links characters to action sequences with their role.

| Meta | Value |
|---|---|
| Plural label | Action Sequence-Characters |
| Category | Connections |
| Tier | 0 |
| Sort order | 66 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `action_sequence_id` | reference → `action_sequence` | yes |  | General | *Action Sequence* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `role_in_action` | text |  |  | General | *Role in Action* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `asset_relationship` — Asset Relationship

Links an asset to an entity it documents or references. Open polymorphism — entity_type is open-ended.

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
| `entity_type` | text | yes |  | General | *Entity Type* — Open-ended — any entity name. |
| `entity_id` | integer | yes |  | General | *Entity ID* |
| `relationship_type` | select<br/>options: `reference`, `documentation`, `concept`, `inspiration`, `final`, `other` |  |  | General | *Relationship Type* |
| `notes` | textarea |  |  | General | *Notes* |

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
| `role_in_bundle` | text |  |  | General | *Role in Bundle* |
| `order` | integer |  |  | General | *Order* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


#### 🔗 `actor_character_role` — Actor-Character Role

Junction: actor + character + role type.

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
| `scope_details` | textarea |  |  | General | *Scope Details* |
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
| `order_in_take` | integer |  |  | General | *Order in Take* |
| `coverage_completeness` | select<br/>options: `partial`, `complete`, `incidental` |  | `complete` | General | *Coverage Completeness* |
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


#### 🔗 `clip_prop` — Clip-Prop

Junction: props present in a clip with their role. Parallel to clip_character. Supports queries like 'every clip featuring the locket' — useful for production review and for assembling prop-identity training sets.

| Meta | Value |
|---|---|
| Plural label | Clip-Props |
| Category | Connections |
| Tier | 0 |
| Sort order | 72 |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `clip_id` | reference → `clip` | yes |  | General | *Clip* |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `role_in_clip` | select<br/>options: `featured`, `supporting`, `background` |  | `featured` | General | *Role in Clip* |
| `notes` | textarea |  |  | General | *Notes* |

**Hidden fields** (not shown in editor UI):

- `name` (text)


---

### Category: Metadata

<a id='category-metadata'></a>

#### ✅ `creative_decision` — Creative Decision

A recorded creative decision with rationale.

| Meta | Value |
|---|---|
| Plural label | Creative Decisions |
| Category | Metadata |
| Tier | 0 |
| Sort order | 700 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Decision Name* |
| `decision_type` | select<br/>options: `casting`, `visual`, `narrative`, `technical`, `audio`, `design`, `structural`, `other` |  |  | General | *Decision Type* |
| `description` | textarea |  |  | General | *Description* |
| `rationale` | textarea |  |  | General | *Rationale* |
| `alternatives_considered` | textarea |  |  | General | *Alternatives Considered* |
| `affected_entities` | json |  |  | General | *Affected Entities* |
| `decision_date` | text |  |  | General | *Decision Date* |
| `decided_by` | text |  |  | General | *Decided By* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💬 `collaboration_note` — Collaboration Note

Notes for or from collaborators.

| Meta | Value |
|---|---|
| Plural label | Collaboration Notes |
| Category | Metadata |
| Tier | 0 |
| Sort order | 701 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Note Title* |
| `note_type` | select<br/>options: `for cinematographer`, `for production designer`, `for costume designer`, `for sound designer`, `for composer`, `for editor`, `for actors`, `general` |  |  | General | *Note Type* |
| `content` | textarea | yes |  | General | *Content* |
| `priority` | select<br/>options: `low`, `medium`, `high`, `critical` |  |  | General | *Priority* |
| `affected_entities` | json |  |  | General | *Affected Entities* |
| `author` | text |  |  | General | *Author* |
| `note_date` | text |  |  | General | *Date* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📎 `asset` — Asset

Reference asset (image, audio, video, document). The atomic unit that bundles compose. Versionable — supports asset version chains.

| Meta | Value |
|---|---|
| Plural label | Assets |
| Category | Metadata |
| Tier | 0 |
| Sort order | 702 |
| Versionable | yes |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Asset Name* |
| `asset_type` | select<br/>options: `image`, `audio`, `video`, `document`, `3d model`, `lookbook`, `reference photo`, `concept art`, `other` |  |  | General | *Asset Type* |
| `file_path` | text |  |  | General | *File Path / URL* |
| `description` | textarea |  |  | General | *Description* |
| `tags` | json |  |  | General | *Tags* |
| `source` | text |  |  | General | *Source / Credit* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `parent_id` | reference → `asset` |  |  | Lifecycle | `versionable` | *Parent Version* — Previous version in the chain. Null for root version. |
| `version_label` | text |  |  | Lifecycle | `versionable` | *Version Label* — placeholder: e.g. "v1.2", "approved-final" — Human-readable version identifier. Tool-managed. |
| `superseded_at` | timestamp |  |  | Lifecycle | `versionable` | *Superseded At* — Set when a successor version becomes active. |
| `superseded_by_id` | reference → `asset` |  |  | Lifecycle | `versionable` | *Superseded By* — Forward pointer to successor. Auto-set on supersession. |
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Notes`, `Lifecycle`, `External`


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
| `name` | text |  |  | General | *Relationship Label* |
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
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `height` | text |  |  | General | *Height* |
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
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `voice_quality` | text |  |  | General | *Voice Quality* |
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
| `name` | text |  |  | General | *Name* |
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
| `hair` | text |  |  | General | *Hair* |
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
| `name` | text | yes |  | General | *Costume Name* |
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

Specific state or version of a character (e.g. Young Eleanor, Angry Marcus).

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
| `name` | text | yes |  | General | *Variant Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `emotional_state` | textarea |  |  | General | *Emotional State* |
| `context` | textarea |  |  | General | *Context* |

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

### Category: Prop Depth

<a id='category-prop-depth'></a>

#### 🪙 `prop_surface_profile` — Prop Surface Profile

Surface, material, and physical-presence detail for a prop. Holds the descriptive baseline that surface and visual bundles reference. State variation (clean vs damaged) belongs in prop_variant.

| Meta | Value |
|---|---|
| Plural label | Prop Surface Profiles |
| Category | Prop Depth |
| Tier | 2 |
| Sort order | 220 |
| Parent entity | `prop` via `prop_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `material` | text |  |  | General | *Primary Material* — placeholder: e.g. "Tarnished silver", "Worn leather" |
| `secondary_materials` | text |  |  | General | *Secondary Materials* |
| `size` | text |  |  | General | *Size* — placeholder: e.g. Palm-sized, 6 feet tall |
| `weight_impression` | text |  |  | General | *Weight Impression* — placeholder: e.g. "heavier than it looks" |
| `primary_color_hex` | text |  |  | Color | *Primary Color (hex)* |
| `primary_color_name` | text |  |  | Color | *Primary Color Name* |
| `secondary_colors` | json |  |  | Color | *Secondary Colors* |
| `surface_finish` | select<br/>options: `matte`, `satin`, `gloss`, `worn`, `polished`, `pitted` |  |  | Surface | *Surface Finish* |
| `texture_quality` | textarea |  |  | Surface | *Texture Quality* |
| `baseline_condition` | text |  |  | Condition | *Baseline Condition* — The prop's default state. State changes belong in prop_variant. |
| `wear_pattern` | textarea |  |  | Condition | *Wear Pattern* |
| `aging_notes` | textarea |  |  | Condition | *Aging Notes* |
| `visual_distinction` | textarea |  |  | Identity | *Visual Distinction* — placeholder: The silhouette / shorthand of this prop |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Color`, `Surface`, `Condition`, `Identity`, `Notes`, `Lifecycle`


#### 🔀 `prop_variant` — Prop Variant

Specific state or version of a prop (e.g. Locket open, Gun blood-spattered, Letter torn). Tools bind state-specific bundles to a prop variant; the cascade resolves the right bundle for the right state.

| Meta | Value |
|---|---|
| Plural label | Prop Variants |
| Category | Prop Depth |
| Tier | 2 |
| Sort order | 221 |
| Parent entity | `prop` via `prop_id` |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Variant Name* — placeholder: e.g. "Locket — open", "Gun — fired" |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `state_trigger` | textarea |  |  | General | *State Trigger* — placeholder: What causes this variant to appear |
| `context` | textarea |  |  | General | *Context* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---

### Category: Asset Reference

<a id='category-asset-reference'></a>

#### 📦 `bundle` — Bundle

Named, intent-typed collection of assets. Tool-agnostic media reference primitive used by the character cluster (and now by props and locations). Versionable — participates in linear version chains.

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
| `name` | text | yes |  | General | *Bundle Name* |
| `intent` | select<br/>options: `visual_identity`, `voice_identity`, `motion`, `behavior`, `performance`, `surface`, `environment`, `acoustic`, `other` | yes |  | General | *Intent* — Hard enum. Tools switch on this to determine compatibility. acoustic added in Phase 1D for location ambience. |
| `description` | textarea |  |  | General | *Description* |
| `coverage_summary` | textarea |  |  | General | *Coverage Summary* |
| `format_hints` | json |  |  | Technical | *Format Hints* — placeholder: {"frame_count": 30, "lighting_conditions": [...]} |
| `intended_consumers` | json |  |  | Technical | *Intended Consumers* — placeholder: ["image_gen", "video_gen", "voice_clone", "world_model"] |
| `provenance` | textarea |  |  | Technical | *Provenance* |
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

Applies a bundle to a character under specific conditions.

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
| `name` | text |  |  | General | *Binding Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `bundle_id` | reference → `bundle` | yes |  | General | *Bundle* |
| `is_baseline` | boolean |  | `False` | General | *Is Baseline* |
| `precedence` | integer |  | `0` | General | *Precedence* |
| `variant_id` | reference → `character_variant` |  |  | Conditions | *Variant* |
| `physical_state_filter` | text |  |  | Conditions | *Physical State Filter* |
| `vocal_state_filter` | text |  |  | Conditions | *Vocal State Filter* |
| `scene_range_start_id` | reference → `scene` |  |  | Conditions | *Scene Range Start* |
| `scene_range_end_id` | reference → `scene` |  |  | Conditions | *Scene Range End* |
| `act_id` | reference → `act` |  |  | Conditions | *Act* |
| `conditions_json` | json |  |  | Conditions | *Additional Conditions* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Conditions`, `Notes`, `Lifecycle`


#### 📍 `entity_anchor` — Entity Anchor

Known-good single frame, audio segment, or motion sample marked as canonical reference for a character, prop, or location. Used for both ID-locking inputs and output verification. Points into source assets without modifying them. Uses constrained polymorphism — subject_type is a hard closed enum (character / prop / location).

| Meta | Value |
|---|---|
| Plural label | Entity Anchors |
| Category | Asset Reference |
| Tier | 2 |
| Sort order | 252 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Anchor Name* |
| `subject_type` | select<br/>options: `character`, `prop`, `location` | yes |  | General | *Subject Type* — Hard closed enum. Tools switch on this exhaustively. Distinct from the open-polymorphism entity_type used elsewhere. |
| `subject_id` | integer | yes |  | General | *Subject ID* — Polymorphic reference into the table named by subject_type. |
| `subject_variant_id` | integer |  |  | General | *Subject Variant ID* — Optional. Polymorphic reference into the matching variant table (character_variant / prop_variant / location_variant). |
| `anchor_type` | select<br/>options: `visual`, `audio`, `motion` | yes |  | General | *Anchor Type* |
| `asset_id` | reference → `asset` | yes |  | General | *Source Asset* |
| `frame_number` | integer |  |  | Scope | *Frame Number* |
| `timecode` | text |  |  | Scope | *Timecode* — placeholder: HH:MM:SS:FF |
| `region_box` | json |  |  | Scope | *Region Box* — placeholder: {"x": 420, "y": 180, "w": 480, "h": 600} |
| `region_label` | text |  |  | Scope | *Region Label* |
| `audio_offset_start_sec` | float |  |  | Scope | *Audio Offset Start (sec)* |
| `audio_offset_end_sec` | float |  |  | Scope | *Audio Offset End (sec)* |
| `condition_description` | textarea |  |  | Context | *Condition Description* |
| `physical_state` | text |  |  | Context | *Physical State* — Applies for character and prop subjects. |
| `vocal_state` | text |  |  | Context | *Vocal State* — Applies for character subjects. |
| `environmental_state` | text |  |  | Context | *Environmental State* — placeholder: e.g. "midday clear", "post-rain dusk" — Applies for location subjects. |
| `canonical_status` | select<br/>options: `verified`, `candidate`, `rejected` |  | `candidate` | General | *Canonical Status* — Verification axis distinct from lifecycle_status. |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Scope`, `Context`, `Notes`, `Lifecycle`


#### 🎚️ `prop_asset_binding` — Prop Asset Binding

Applies a bundle to a prop under specific conditions (variant, scene range, act). Tools walk the prop resolution cascade and use bindings to find the right media for a prop in a given scene/state.

| Meta | Value |
|---|---|
| Plural label | Prop Asset Bindings |
| Category | Asset Reference |
| Tier | 2 |
| Sort order | 253 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Binding Name* |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `bundle_id` | reference → `bundle` | yes |  | General | *Bundle* |
| `is_baseline` | boolean |  | `False` | General | *Is Baseline* |
| `precedence` | integer |  | `0` | General | *Precedence* |
| `variant_id` | reference → `prop_variant` |  |  | Conditions | *Variant* |
| `scene_range_start_id` | reference → `scene` |  |  | Conditions | *Scene Range Start* |
| `scene_range_end_id` | reference → `scene` |  |  | Conditions | *Scene Range End* |
| `act_id` | reference → `act` |  |  | Conditions | *Act* |
| `conditions_json` | json |  |  | Conditions | *Additional Conditions* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Conditions`, `Notes`, `Lifecycle`


#### 🎚️ `location_asset_binding` — Location Asset Binding

Applies a bundle to a location under specific conditions (variant, scene range, act, time-of-day). Tools walk the location resolution cascade and use bindings to find the right media for a location.

| Meta | Value |
|---|---|
| Plural label | Location Asset Bindings |
| Category | Asset Reference |
| Tier | 2 |
| Sort order | 254 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Binding Name* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `bundle_id` | reference → `bundle` | yes |  | General | *Bundle* |
| `is_baseline` | boolean |  | `False` | General | *Is Baseline* |
| `precedence` | integer |  | `0` | General | *Precedence* |
| `variant_id` | reference → `location_variant` |  |  | Conditions | *Variant* |
| `scene_range_start_id` | reference → `scene` |  |  | Conditions | *Scene Range Start* |
| `scene_range_end_id` | reference → `scene` |  |  | Conditions | *Scene Range End* |
| `act_id` | reference → `act` |  |  | Conditions | *Act* |
| `time_of_day_filter` | text |  |  | Conditions | *Time of Day Filter* — Matches scene.time_of_day for bindings scoped to specific times. |
| `conditions_json` | json |  |  | Conditions | *Additional Conditions* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Conditions`, `Notes`, `Lifecycle`


---

### Category: Performance Corpus

<a id='category-performance-corpus'></a>

#### 🎞️ `performance_corpus` — Performance Corpus

Project-level index of captured footage.

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
| `shoot_dates_start` | text |  |  | General | *Shoot Dates Start* |
| `shoot_dates_end` | text |  |  | General | *Shoot Dates End* |
| `shoot_locations` | textarea |  |  | General | *Shoot Locations* |
| `coverage_completeness` | select<br/>options: `planned`, `in_production`, `principal_complete`, `pickups_complete`, `complete` |  | `planned` | General | *Coverage Completeness* |
| `camera_metadata` | textarea |  |  | Technical | *Camera Metadata* |
| `audio_metadata` | textarea |  |  | Technical | *Audio Metadata* |
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
| `name` | text | yes |  | General | *Take Name / Slate* |
| `corpus_id` | reference → `performance_corpus` | yes |  | General | *Corpus* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `take_number` | integer |  |  | General | *Take Number* |
| `date_recorded` | text |  |  | General | *Date Recorded* |
| `duration_seconds` | integer |  |  | General | *Duration (seconds)* |
| `timecode_start` | text |  |  | General | *Timecode Start* |
| `timecode_end` | text |  |  | General | *Timecode End* |
| `preferred` | boolean |  | `False` | General | *Director's Pick* |
| `camera_designation` | text |  |  | Technical | *Camera* |
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

A meaningful within-scene segment of a take. Plates are clips with clip_type=atmospheric.

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
| `clip_in_timecode` | text |  |  | General | *Clip In* |
| `clip_out_timecode` | text |  |  | General | *Clip Out* |
| `duration_seconds` | integer |  |  | General | *Duration (seconds)* |
| `clip_type` | select<br/>options: `dialogue`, `action`, `reaction`, `transition`, `insert`, `atmospheric` |  |  | General | *Clip Type* |
| `screenplay_line_start_id` | integer |  |  | Screenplay | *Screenplay Line Start* |
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
| `generation_required` | textarea |  |  | General | *Generation Required* |
| `override_summary` | textarea |  |  | General | *Override Summary* — placeholder: High-level deviation summary — details in *_shot_override |
| `status_date` | text |  |  | General | *Status Date* — For ordering history. Most recent record is canonical. |
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
| `bundle_override_id` | reference → `bundle` |  |  | General | *Bundle Override* |
| `variant_target_id` | reference → `character_variant` |  |  | General | *Variant Target* |
| `visual_delta` | textarea |  |  | Deltas | *Visual Delta* |
| `vocal_delta` | textarea |  |  | Deltas | *Vocal Delta* |
| `motion_delta` | textarea |  |  | Deltas | *Motion Delta* |
| `progression_axis` | text |  |  | Progression | *Progression Axis* — placeholder: e.g. "transformation", "aging", "decay" |
| `progression_value` | float |  |  | Progression | *Progression Value (0-1)* |
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


#### 🎛️ `prop_shot_override` — Prop Shot Override

Per-prop deviation from the cascade for a specific shot. Versionable: only one active record per (shot, prop). Earns its keep for mid-shot state transitions (gun firing, locket falling open) and shot-specific VFX enhancement.

| Meta | Value |
|---|---|
| Plural label | Prop Shot Overrides |
| Category | Workflow State |
| Tier | 2 |
| Sort order | 272 |
| Versionable | yes |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Override Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `prop_id` | reference → `prop` | yes |  | General | *Prop* |
| `override_types` | multiselect<br/>options: `state_change`, `damage`, `transformation`, `vfx_enhancement`, `other` |  |  | General | *Override Types* |
| `bundle_override_id` | reference → `bundle` |  |  | General | *Bundle Override* |
| `variant_target_id` | reference → `prop_variant` |  |  | General | *Variant Target* |
| `visual_delta` | textarea |  |  | Deltas | *Visual Delta* |
| `surface_delta` | textarea |  |  | Deltas | *Surface Delta* — Material / finish deviation for this shot. |
| `motion_delta` | textarea |  |  | Deltas | *Motion Delta* — How the prop moves / breaks / behaves in this shot. |
| `progression_axis` | text |  |  | Progression | *Progression Axis* — placeholder: e.g. "damage", "wear", "transformation" |
| `progression_value` | float |  |  | Progression | *Progression Value (0-1)* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `parent_id` | reference → `prop_shot_override` |  |  | Lifecycle | `versionable` | *Parent Version* — Previous version in the chain. Null for root version. |
| `version_label` | text |  |  | Lifecycle | `versionable` | *Version Label* — placeholder: e.g. "v1.2", "approved-final" — Human-readable version identifier. Tool-managed. |
| `superseded_at` | timestamp |  |  | Lifecycle | `versionable` | *Superseded At* — Set when a successor version becomes active. |
| `superseded_by_id` | reference → `prop_shot_override` |  |  | Lifecycle | `versionable` | *Superseded By* — Forward pointer to successor. Auto-set on supersession. |
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Deltas`, `Progression`, `Notes`, `Lifecycle`


#### 🎛️ `location_shot_override` — Location Shot Override

Per-location deviation from the cascade for a specific shot. Versionable: only one active record per (shot, location). Most location deviations belong at scene level (location_variant); this entity is for genuinely shot-specific cases (VFX additions, shot reveals beyond standard coverage).

| Meta | Value |
|---|---|
| Plural label | Location Shot Overrides |
| Category | Workflow State |
| Tier | 2 |
| Sort order | 273 |
| Versionable | yes |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Override Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `override_types` | multiselect<br/>options: `extension_change`, `lighting_change`, `weather_change`, `vfx_addition`, `other` |  |  | General | *Override Types* |
| `bundle_override_id` | reference → `bundle` |  |  | General | *Bundle Override* |
| `variant_target_id` | reference → `location_variant` |  |  | General | *Variant Target* |
| `visual_delta` | textarea |  |  | Deltas | *Visual Delta* |
| `acoustic_delta` | textarea |  |  | Deltas | *Acoustic Delta* — Ambience / acoustic deviation for this shot. |
| `lighting_delta` | textarea |  |  | Deltas | *Lighting Delta* — Lighting deviation specific to this shot. |
| `progression_axis` | text |  |  | Progression | *Progression Axis* — placeholder: e.g. "decay", "construction", "weather_progression" |
| `progression_value` | float |  |  | Progression | *Progression Value (0-1)* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `parent_id` | reference → `location_shot_override` |  |  | Lifecycle | `versionable` | *Parent Version* — Previous version in the chain. Null for root version. |
| `version_label` | text |  |  | Lifecycle | `versionable` | *Version Label* — placeholder: e.g. "v1.2", "approved-final" — Human-readable version identifier. Tool-managed. |
| `superseded_at` | timestamp |  |  | Lifecycle | `versionable` | *Superseded At* — Set when a successor version becomes active. |
| `superseded_by_id` | reference → `location_shot_override` |  |  | Lifecycle | `versionable` | *Superseded By* — Forward pointer to successor. Auto-set on supersession. |
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

Modified state of a location (e.g. Night version, After fire). Includes structured state axes (time-of-day, weather, season, post-event state) that previously lived on the location base entity. Exactly one variant per location should be marked is_baseline = true.

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
| `is_baseline` | boolean |  | `False` | General | *Is Baseline* — True for the unconditional default variant for this location. |
| `time_of_day` | select<br/>options: `dawn`, `morning`, `midday`, `afternoon`, `dusk`, `night`, `varies` |  |  | State | *Time of Day* |
| `weather` | text |  |  | State | *Weather* |
| `season` | select<br/>options: `spring`, `summer`, `autumn`, `winter`, `unspecified` |  |  | State | *Season* |
| `post_event_state` | text |  |  | State | *Post-Event State* — placeholder: e.g. "after the fire", "during the festival", "abandoned" |
| `physical_differences` | textarea |  |  | General | *Physical Differences* |
| `lighting_differences` | textarea |  |  | General | *Lighting Differences* |
| `emotional_shift` | textarea |  |  | General | *Emotional Shift* |
| `time_context` | textarea |  |  | General | *Time / Story Context* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `State`, `Lifecycle`


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

How a specific element connects to a theme. Open polymorphism — entity_type is open-ended.

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
| `name` | text |  |  | General | *Name* |
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
| `audience_position` | select<br/>options: `ahead of characters`, `behind characters`, `with characters` |  |  | General | *Audience Position* |
| `information_layers` | textarea |  |  | General | *Information Layers* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎯 `identification_strategy` — Identification Strategy

How the audience aligns with characters in a scene.

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
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `primary_identification` | reference → `character` |  |  | General | *Primary Identification With* |
| `secondary_identification` | reference → `character` |  |  | General | *Secondary Identification With* |
| `audience_position` | select<br/>options: `with character`, `observing character`, `above character` |  |  | General | *Audience Position* |
| `identification_technique` | textarea |  |  | General | *Identification Technique* |
| `emotional_alignment` | textarea |  |  | General | *Emotional Alignment* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---

### Category: Production

<a id='category-production'></a>

#### 🎥 `shot` — Shot

A single camera setup within a scene.

| Meta | Value |
|---|---|
| Plural label | Shots |
| Category | Production |
| Tier | 6 |
| Sort order | 600 |
| Has lifecycle status | yes |
| Has external ID | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Shot Name / Number* — placeholder: e.g. 23A |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `shot_number` | text |  |  | General | *Shot Number* |
| `shot_order` | integer |  |  | General | *Order in Scene* |
| `shot_size` | select<br/>options: `extreme wide`, `wide`, `medium wide`, `medium`, `medium close-up`, `close-up`, `extreme close-up` |  |  | General | *Shot Size* |
| `camera_angle` | select<br/>options: `eye level`, `high angle`, `low angle`, `overhead`, `dutch`, `POV` |  |  | General | *Camera Angle* |
| `camera_movement` | select<br/>options: `static`, `pan`, `tilt`, `dolly`, `tracking`, `crane`, `handheld`, `steadicam`, `drone`, `zoom` |  |  | General | *Camera Movement* |
| `lens_choice` | text |  |  | General | *Lens* |
| `duration_seconds` | float |  |  | General | *Estimated Duration (seconds)* |
| `description` | textarea |  |  | General | *Shot Description* |
| `notes` | textarea |  |  | Notes | *Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |
| `external_id` | text |  |  | External | `external` | *External ID* — placeholder: identifier in external system — Optional. Identifier in an external system (OMC, EIDR, production DB, etc.). See conventions.md. |
| `external_id_namespace` | text |  |  | External | `external` | *External ID Namespace* — placeholder: e.g. "omc", "eidr", "shotgrid:project_42" — Which external system the identifier belongs to. |

**Tabs:** `General`, `Notes`, `Lifecycle`, `External`


#### 📐 `shot_design` — Shot Design

Detailed visual composition for a shot.

| Meta | Value |
|---|---|
| Plural label | Shot Designs |
| Category | Production |
| Tier | 6 |
| Sort order | 601 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `shot_id` | reference → `shot` | yes |  | General | *Shot* |
| `composition_type` | select<br/>options: `rule of thirds`, `centered`, `symmetrical`, `asymmetric`, `dynamic` |  |  | General | *Composition Type* |
| `frame_division` | textarea |  |  | General | *Frame Division* |
| `subject_placement` | textarea |  |  | General | *Subject Placement* |
| `negative_space` | textarea |  |  | General | *Negative Space Usage* |
| `depth_of_field` | select<br/>options: `shallow`, `medium`, `deep` |  |  | General | *Depth of Field* |
| `focus_strategy` | textarea |  |  | General | *Focus Strategy* |
| `color_emphasis` | textarea |  |  | General | *Color Emphasis* |
| `textural_emphasis` | textarea |  |  | General | *Textural Emphasis* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🗣️ `shot_language` — Shot Language

How shots communicate meaning — visual vocabulary for a scene.

| Meta | Value |
|---|---|
| Plural label | Shot Language |
| Category | Production |
| Tier | 6 |
| Sort order | 602 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `visual_strategy` | textarea |  |  | General | *Visual Strategy* |
| `shot_relationships` | textarea |  |  | General | *Shot Relationships* |
| `cutting_pattern` | textarea |  |  | General | *Cutting Pattern* |
| `rhythm` | select<br/>options: `fast`, `slow`, `varying`, `deliberate` |  |  | General | *Editorial Rhythm* |
| `transitions` | textarea |  |  | General | *Transition Approach* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🗺️ `scene_blocking` — Scene Blocking

Physical staging of characters and movement within the scene.

| Meta | Value |
|---|---|
| Plural label | Scene Blockings |
| Category | Production |
| Tier | 6 |
| Sort order | 603 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `staging_concept` | textarea |  |  | General | *Staging Concept* |
| `character_geography` | textarea |  |  | General | *Character Geography* |
| `blocking_evolution` | textarea |  |  | General | *Blocking Evolution Through Scene* |
| `camera_relationship` | textarea |  |  | General | *Camera Relationship to Action* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📍 `blocking_beat` — Blocking Beat

Discrete blocking moment within a scene.

| Meta | Value |
|---|---|
| Plural label | Blocking Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 604 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_blocking_id` | reference → `scene_blocking` | yes |  | General | *Scene Blocking* |
| `beat_order` | integer | yes |  | General | *Beat Order* |
| `description` | textarea |  |  | General | *Description* |
| `character_positions` | json |  |  | General | *Character Positions* |
| `movement_description` | textarea |  |  | General | *Movement Description* |
| `camera_position` | text |  |  | General | *Camera Position* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💥 `action_sequence` — Action Sequence

Choreographed action sequence — fight, chase, stunt.

| Meta | Value |
|---|---|
| Plural label | Action Sequences |
| Category | Production |
| Tier | 6 |
| Sort order | 605 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `sequence_type` | select<br/>options: `fight`, `chase`, `stunt`, `combat`, `athletic`, `physical comedy` |  |  | General | *Sequence Type* |
| `description` | textarea |  |  | General | *Description* |
| `style` | text |  |  | General | *Style* |
| `difficulty_level` | select<br/>options: `simple`, `moderate`, `complex`, `extreme` |  |  | General | *Difficulty Level* |
| `safety_concerns` | textarea |  |  | General | *Safety Concerns* |
| `stunt_requirements` | textarea |  |  | General | *Stunt Requirements* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### ⚡ `action_beat` — Action Beat

Discrete moment within an action sequence.

| Meta | Value |
|---|---|
| Plural label | Action Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 606 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `action_sequence_id` | reference → `action_sequence` | yes |  | General | *Action Sequence* |
| `beat_order` | integer | yes |  | General | *Beat Order* |
| `description` | textarea |  |  | General | *Description* |
| `characters_involved` | json |  |  | General | *Characters Involved* |
| `physical_action` | textarea |  |  | General | *Physical Action* |
| `camera_treatment` | text |  |  | General | *Camera Treatment* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📏 `proxemic_design` — Proxemic Design

Use of physical distance between characters as meaning.

| Meta | Value |
|---|---|
| Plural label | Proxemic Designs |
| Category | Production |
| Tier | 6 |
| Sort order | 607 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `opening_distances` | textarea |  |  | General | *Opening Distances* |
| `distance_evolution` | textarea |  |  | General | *Distance Evolution* |
| `intimate_distance_use` | textarea |  |  | General | *Intimate Distance Use* |
| `personal_distance_use` | textarea |  |  | General | *Personal Distance Use* |
| `social_distance_use` | textarea |  |  | General | *Social Distance Use* |
| `public_distance_use` | textarea |  |  | General | *Public Distance Use* |
| `distance_violations` | textarea |  |  | General | *Distance Violations* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🌡️ `physical_state` — Physical State

Modulation of a character's baseline physicality in a specific moment.

| Meta | Value |
|---|---|
| Plural label | Physical States |
| Category | Production |
| Tier | 6 |
| Sort order | 608 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `state_description` | textarea |  |  | General | *State Description* |
| `tension_modulation` | text |  |  | General | *Tension Modulation* |
| `energy_modulation` | text |  |  | General | *Energy Modulation* |
| `posture_modulation` | text |  |  | General | *Posture Modulation* |
| `movement_modulation` | text |  |  | General | *Movement Modulation* |
| `trigger` | textarea |  |  | General | *Trigger* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎤 `vocal_state` — Vocal State

Modulation of a character's baseline vocal profile in a specific moment.

| Meta | Value |
|---|---|
| Plural label | Vocal States |
| Category | Production |
| Tier | 6 |
| Sort order | 609 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `state_description` | textarea |  |  | General | *State Description* |
| `pitch_modulation` | text |  |  | General | *Pitch Modulation* |
| `volume_modulation` | text |  |  | General | *Volume Modulation* |
| `pace_modulation` | text |  |  | General | *Pace Modulation* |
| `articulation_modulation` | text |  |  | General | *Articulation Modulation* |
| `emotional_coloring` | textarea |  |  | General | *Emotional Coloring* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🏃 `physical_performance_beat` — Physical Performance Beat

A specific physical performance moment within a scene.

| Meta | Value |
|---|---|
| Plural label | Physical Performance Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 610 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `beat_order` | integer |  |  | General | *Beat Order* |
| `description` | textarea |  |  | General | *Description* |
| `physical_action` | textarea |  |  | General | *Physical Action* |
| `body_part_focus` | text |  |  | General | *Body Part Focus* |
| `emotional_subtext` | textarea |  |  | General | *Emotional Subtext* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💬 `vocal_beat` — Vocal Beat

A specific vocal performance moment within a scene.

| Meta | Value |
|---|---|
| Plural label | Vocal Beats |
| Category | Production |
| Tier | 6 |
| Sort order | 611 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `beat_order` | integer |  |  | General | *Beat Order* |
| `description` | textarea |  |  | General | *Description* |
| `line_or_sound` | textarea |  |  | General | *Line or Sound* |
| `delivery_quality` | text |  |  | General | *Delivery Quality* |
| `emotional_subtext` | textarea |  |  | General | *Emotional Subtext* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🗨️ `line_delivery` — Line Delivery

Specific direction for how a line should be delivered.

| Meta | Value |
|---|---|
| Plural label | Line Deliveries |
| Category | Production |
| Tier | 6 |
| Sort order | 612 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `line_text` | textarea | yes |  | General | *Line Text* |
| `emotional_target` | text |  |  | General | *Emotional Target* |
| `subtext` | textarea |  |  | General | *Subtext* |
| `emphasis_words` | json |  |  | General | *Emphasis Words* |
| `pace` | select<br/>options: `fast`, `slow`, `measured`, `varying` |  |  | General | *Pace* |
| `volume` | select<br/>options: `whisper`, `soft`, `normal`, `loud`, `shout` |  |  | General | *Volume* |
| `delivery_notes` | textarea |  |  | General | *Delivery Notes* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎼 `dialogue_rhythm` — Dialogue Rhythm

Conversational pacing and interaction patterns in a scene.

| Meta | Value |
|---|---|
| Plural label | Dialogue Rhythms |
| Category | Production |
| Tier | 6 |
| Sort order | 613 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `overall_rhythm` | select<br/>options: `staccato`, `legato`, `varying` |  |  | General | *Overall Rhythm* |
| `pause_pattern` | textarea |  |  | General | *Pause Pattern* |
| `overlap_pattern` | textarea |  |  | General | *Overlap Pattern* |
| `silence_pattern` | textarea |  |  | General | *Silence Pattern* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💢 `emotional_physicality` — Emotional Physicality

How emotion manifests in the body.

| Meta | Value |
|---|---|
| Plural label | Emotional Physicalities |
| Category | Production |
| Tier | 6 |
| Sort order | 614 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `emotion` | text | yes |  | General | *Emotion* |
| `body_manifestation` | textarea |  |  | General | *Body Manifestation* |
| `face_manifestation` | textarea |  |  | General | *Face Manifestation* |
| `voice_manifestation` | textarea |  |  | General | *Voice Manifestation* |
| `breathing_manifestation` | textarea |  |  | General | *Breathing Manifestation* |
| `intensity_level` | select<br/>options: `subtle`, `moderate`, `intense`, `overwhelming` |  |  | General | *Intensity Level* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 👁️ `microexpression` — Microexpression

Brief involuntary facial expression revealing inner state.

| Meta | Value |
|---|---|
| Plural label | Microexpressions |
| Category | Production |
| Tier | 6 |
| Sort order | 615 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `emotion_revealed` | text | yes |  | General | *Emotion Revealed* |
| `trigger` | textarea |  |  | General | *Trigger* |
| `description` | textarea |  |  | General | *Description* |
| `audience_visibility` | select<br/>options: `clearly seen`, `subtle`, `blink and miss` |  |  | General | *Audience Visibility* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🏞️ `character_environment_physicality` — Character-Environment Physicality

How a character physically interacts with their environment.

| Meta | Value |
|---|---|
| Plural label | Character-Environment Physicalities |
| Category | Production |
| Tier | 6 |
| Sort order | 616 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_id` | reference → `character` | yes |  | General | *Character* |
| `location_id` | reference → `location` | yes |  | General | *Location* |
| `comfort_level` | select<br/>options: `at home`, `comfortable`, `alert`, `uncomfortable`, `alien` |  |  | General | *Comfort Level* |
| `interaction_pattern` | textarea |  |  | General | *Interaction Pattern* |
| `spatial_use` | textarea |  |  | General | *Spatial Use* |
| `object_interaction` | textarea |  |  | General | *Object Interaction* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🤝 `physical_relationship` — Physical Relationship

Physical dimension of a relationship between characters.

| Meta | Value |
|---|---|
| Plural label | Physical Relationships |
| Category | Production |
| Tier | 6 |
| Sort order | 617 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `character_a_id` | reference → `character` | yes |  | General | *Character A* |
| `character_b_id` | reference → `character` | yes |  | General | *Character B* |
| `touch_comfort` | select<br/>options: `touching`, `tactile`, `reserved`, `avoidant` |  |  | General | *Touch Comfort* |
| `distance_preference` | text |  |  | General | *Distance Preference* |
| `eye_contact_pattern` | text |  |  | General | *Eye Contact Pattern* |
| `body_orientation` | text |  |  | General | *Body Orientation* |
| `mirroring_tendencies` | textarea |  |  | General | *Mirroring Tendencies* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 📈 `physical_relationship_evolution` — Physical Relationship Evolution

How a physical relationship changes across the story.

| Meta | Value |
|---|---|
| Plural label | Physical Relationship Evolutions |
| Category | Production |
| Tier | 6 |
| Sort order | 618 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `physical_relationship_id` | reference → `physical_relationship` | yes |  | General | *Physical Relationship* |
| `starting_state` | textarea |  |  | General | *Starting State* |
| `ending_state` | textarea |  |  | General | *Ending State* |
| `key_transition_points` | textarea |  |  | General | *Key Transition Points* |
| `driving_events` | textarea |  |  | General | *Driving Events* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 💃 `movement_choreography` — Movement Choreography

Choreographed movement design for a scene or sequence.

| Meta | Value |
|---|---|
| Plural label | Movement Choreographies |
| Category | Production |
| Tier | 6 |
| Sort order | 619 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `movement_concept` | textarea |  |  | General | *Movement Concept* |
| `rhythm_pattern` | textarea |  |  | General | *Rhythm Pattern* |
| `spatial_pattern` | textarea |  |  | General | *Spatial Pattern* |
| `ensemble_coordination` | textarea |  |  | General | *Ensemble Coordination* |
| `style_reference` | text |  |  | General | *Style Reference* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎼 `musical_theme` — Musical Theme

Recurring musical phrase associated with a character, place, or idea.

| Meta | Value |
|---|---|
| Plural label | Musical Themes |
| Category | Production |
| Tier | 6 |
| Sort order | 620 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Theme Name* |
| `theme_type` | select<br/>options: `character theme`, `place theme`, `idea theme`, `relationship theme`, `emotional theme` |  |  | General | *Theme Type* |
| `associated_entity` | text |  |  | General | *Associated Entity* |
| `description` | textarea |  |  | General | *Description* |
| `instrumentation` | text |  |  | General | *Instrumentation* |
| `variations` | textarea |  |  | General | *Variations Through Story* |
| `evolution_description` | textarea |  |  | General | *Evolution Description* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🔊 `sound_cue` — Sound Cue

A specific sound element placement.

| Meta | Value |
|---|---|
| Plural label | Sound Cues |
| Category | Production |
| Tier | 6 |
| Sort order | 621 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene* |
| `shot_id` | reference → `shot` |  |  | General | *Shot* |
| `sound_type` | select<br/>options: `ambient`, `effect`, `foley`, `design`, `stinger`, `dialogue`, `voiceover` |  |  | General | *Sound Type* |
| `description` | textarea |  |  | General | *Description* |
| `timing` | text |  |  | General | *Timing* |
| `duration` | text |  |  | General | *Duration* |
| `emotional_function` | textarea |  |  | General | *Emotional Function* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎵 `music_cue` — Music Cue

A specific music placement and its function.

| Meta | Value |
|---|---|
| Plural label | Music Cues |
| Category | Production |
| Tier | 6 |
| Sort order | 622 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text | yes |  | General | *Cue Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `cue_type` | select<br/>options: `score`, `source` |  |  | General | *Cue Type* |
| `entry_timing` | text |  |  | General | *Entry Timing* |
| `exit_timing` | text |  |  | General | *Exit Timing* |
| `duration_seconds` | integer |  |  | General | *Duration (seconds)* |
| `musical_theme_id` | reference → `musical_theme` |  |  | General | *Musical Theme* |
| `emotional_function` | textarea |  |  | General | *Emotional Function* |
| `dynamics` | textarea |  |  | General | *Dynamics* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 👂 `sound_perspective` — Sound Perspective

POV approach to sound — whose ears are we using?

| Meta | Value |
|---|---|
| Plural label | Sound Perspectives |
| Category | Production |
| Tier | 6 |
| Sort order | 623 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `perspective_type` | select<br/>options: `objective`, `subjective`, `shifting` |  |  | General | *Perspective Type* |
| `pov_character_id` | reference → `character` |  |  | General | *POV Character* |
| `spatial_logic` | textarea |  |  | General | *Spatial Logic* |
| `psychological_logic` | textarea |  |  | General | *Psychological Logic* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎙️ `voiceover_design` — Voiceover Design

Narration / inner-voice approach for the project or scene.

| Meta | Value |
|---|---|
| Plural label | Voiceover Designs |
| Category | Production |
| Tier | 6 |
| Sort order | 624 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` |  |  | General | *Scene (if scene-specific)* |
| `character_id` | reference → `character` |  |  | General | *Narrator Character* |
| `voiceover_type` | select<br/>options: `narrator`, `inner monologue`, `letter/diary`, `retrospective`, `future self` |  |  | General | *Voiceover Type* |
| `voiceover_function` | textarea |  |  | General | *Function* |
| `temporal_position` | select<br/>options: `concurrent`, `retrospective`, `prospective` |  |  | General | *Temporal Position* |
| `knowledge_position` | select<br/>options: `omniscient`, `limited`, `unreliable` |  |  | General | *Knowledge Position* |
| `relationship_to_image` | select<br/>options: `matches`, `counterpoint`, `expands` |  |  | General | *Relationship to Image* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


#### 🎚️ `music_sound_relationship` — Music-Sound Relationship

How music and sound design interact in a scene.

| Meta | Value |
|---|---|
| Plural label | Music-Sound Relationships |
| Category | Production |
| Tier | 6 |
| Sort order | 625 |
| Has lifecycle status | yes |

**Declared fields:**

| Field | Type | Required | Default | Tab | Description |
|---|---|---|---|---|---|
| `name` | text |  |  | General | *Name* |
| `scene_id` | reference → `scene` | yes |  | General | *Scene* |
| `relationship_type` | select<br/>options: `music dominant`, `sound dominant`, `integrated`, `alternating` |  |  | General | *Relationship Type* |
| `integration_approach` | textarea |  |  | General | *Integration Approach* |
| `dynamic_balance` | textarea |  |  | General | *Dynamic Balance* |
| `frequency_separation` | textarea |  |  | General | *Frequency Separation* |

**Auto-injected fields** (added by registry flags — see *Cross-cutting conventions*):

| Field | Type | Required | Default | Tab | Source | Description |
|---|---|---|---|---|---|---|
| `lifecycle_status` | select<br/>options: `active`, `draft`, `superseded`, `deprecated`, `cut`, `archived` |  | `active` | Lifecycle | `lifecycle` | *Lifecycle Status* — Cross-cutting record state. See conventions.md. |

**Tabs:** `General`, `Lifecycle`


---
