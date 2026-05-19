# SCF Character Schema Redesign — Dual-Workflow Proposal (v2)

*Consolidated design document. Folds in the resolutions to the v1 open questions and adds OMC interop posture. Designed to support both performance-first (Rango-style: shoot and edit, then generate) and generation-first (everything synthesized from authored description) workflows from the same schema, without backward compatibility constraints.*

---

## Why this redesign

The current `character` entity is doing too many jobs. It carries identity (name, role, archetype), description (height, build, voice quality), narrative function (motivation, arc, fear), and informal media references (color associations, default wardrobe). Tier 2 entities — `physical_character_profile`, `vocal_profile`, `costume`, etc. — duplicate much of this descriptive data with proper structure. The base entity has become a bag of redundancies, and there's no clean place to attach the actual media that makes a character generatable.

More fundamentally, the schema today assumes a single workflow: author the description, then a downstream tool generates from text. But film production splits along a clear axis:

- **Performance-first** workflows (Rango, Tintin, animated features with reference shoots, AI-augmented live action) capture performances first. Voice, gesture, timing, eye-lines, and chemistry between actors all exist as recorded media before generation enters the pipeline. Most authored character data becomes redundant in the face of this footage.
- **Generation-first** workflows (current AI shorts, fully synthetic content, pre-vis with no actors) start from authored description. Every facet of the character must be specified or inferred because nothing was captured.

Both will exist. Many projects will be hybrid. A format-first system needs to handle both cleanly, and ideally let a single project shift between them as production evolves — pre-vis a scene generatively, shoot it later, then regenerate the world around the captured performance.

This redesign proposes a four-layer character architecture that separates concerns cleanly and treats captured media as a first-class citizen of the format.

---

## Design principles

**Identity is description; media is reference.** The character entity describes who someone is. The media that makes them generatable is referenced through a separate, conditional system. Mixing them — as the current schema does — couples description to generation tooling and makes the format brittle.

**Tool-agnostic media bundles.** No "LoRA field." No "reference image slot." Instead, named bundles of assets with declared intent (`visual_identity`, `voice_identity`, `motion`, `behavior`, `performance`, `surface`, `environment`) and structured format hints. A LoRA-training tool consumes a `visual_identity` bundle the way it likes; an ID-conditioning tool consumes the same bundle differently; a future world-model consumes the video assets in it. The format describes what's available; the tool decides how to use it.

**Conditional binding.** A character isn't a single visual identity. Snapper as a young man, Snapper after the bar fight, Snapper transformed mid-scene — these need distinct media references. Bindings carry the conditions under which a bundle applies (variant, physical state, vocal state, scene range, act).

**Performance corpus as canonical when present.** When footage exists, it *is* the character data. The schema indexes it for queryability without duplicating it as authored text.

**Workflow declared, exceptions explicit.** The project announces its dominant workflow. Per-shot deviations — captured shots in a generation-first project, generated inserts in a performance-first project — are recorded explicitly so tools know what to expect.

**Preserve information, never destroy.** Source assets stay intact and uncropped. Crops, frame extractions, and time-range selections are recorded as scoping metadata on references, not as new derived assets. Tools transform at query time. This applies to anchors, version supersession, and lifecycle state.

**Format defines lineage; tools define policy.** Version chains, lifecycle states, and supersession relationships are structural and live in the format. When to version, who can promote, what triggers a bump, and approval policy live in the tool. SCF gives tools the substrate to implement any policy; it doesn't impose one.

**Single active record per logical slot.** Where the format permits multiple records covering the same conceptual position (versions of a bundle, overrides on a shot+character), exactly one is `active` at a time. Predecessors are preserved with `superseded` status. Tools default to active; can opt into history.

**Generalizable bundle pattern.** The bundle and binding pattern designed here for characters will extend to props and locations later, without further schema invention. This is the first appearance of a format primitive that should appear elsewhere.

**Story-first, production-aware, never production-tracking.** SCF describes what the story needs. It addresses production data when production data is part of the story's truth (corpus, actors, takes). It does not model contracts, scheduling, vendor relationships, or approval workflows. Those belong in OMC and the production tools that consume SCF.

---

## Versioning and lifecycle — schema-wide conventions

Before describing the four layers, the cross-cutting versioning model needs to be set out, because it applies to multiple entities below.

### Versionable entities

Some entities participate in version chains. They get five additional fields automatically through a `versionable=True` flag on `EntityDef`, ensuring consistent shape across all participating entities:

| Field | Notes |
|---|---|
| `parent_id` | self-referential, optional. Null = original/root version. |
| `version_label` | free text for human display, tool-managed. e.g. "v1.2", "approved-final", "pre-cast" |
| `lifecycle_status` | the standard enum below |
| `superseded_at` | timestamp, set when a successor is promoted to active |
| `superseded_by_id` | self-referential, optional. Reverse pointer for query convenience (technically derivable but cheap to maintain). |

Branching is not supported. Each entity has at most one `parent_id` and at most one currently-`active` descendant. Linear chains only.

### Standard `lifecycle_status` enum

The cross-cutting state field used by versionable entities *and* by other entities where lifecycle state matters. Versionability and lifecycle state are related but separable — every versionable entity needs `lifecycle_status`, but non-versionable entities can also use it where lifecycle state is the right axis. The enum:

- `active` — current, in use
- `draft` — work in progress, not yet promoted
- `superseded` — replaced by a newer version (set automatically when a child version is promoted; only meaningful on versionable entities)
- `deprecated` — explicitly marked as no longer preferred, but kept for reference (different from superseded — nothing necessarily replaced it)
- `cut` — intentionally removed from the work but preserved
- `archived` — historical, not actively maintained

Tools default to showing `active` records. They can opt-in to showing others. They never need to handle missing entities — preservation over deletion is the rule.

### Status field taxonomy

The schema has three distinct axes that fields like "status" can track. Treating them as separate fields with distinct names keeps the format honest about what's being measured:

1. **`lifecycle_status`** — the cross-cutting "is this the current record?" axis. Uses the standard enum above. Applied to versionable entities (where it also drives the active/superseded distinction) and to other entities where lifecycle state is the relevant axis (character, prop, location). This replaces the existing `status` fields on character, prop, and location.

2. **`production_status`** — project-level production phase axis. Tracks where the project sits in its overall lifecycle as a piece of work being made: `development`, `pre_production`, `production`, `post_production`, `complete`. Renamed from the existing `project.status` field to avoid collision with axis (3) below. A project being in `pre_production` says nothing about whether anything is `draft` or `active` — these are orthogonal.

3. **`status`** (writing-process) — "where is this in the writing process?" axis on scene, act, and sequence. Values: `outline`, `draft`, `revised`, `locked`, `cut`. This stays as its own enum because it measures something different from lifecycle — a locked scene is still active; a draft scene is still active. The two axes are orthogonal.

4. **Entity-specific status fields** — `asset.approval_status` (`wip`, `pending`, `approved`, `final`), `identity_anchor.canonical_status` (`verified`, `candidate`, `rejected`), and similar. These track domain-specific verification or approval axes that are genuinely distinct from lifecycle. They stay as separate fields with their own enums. Forcing them onto a shared vocabulary would lose real information.

The four categories can coexist on the same entity. A character has `lifecycle_status` (active/draft/cut/etc.). A scene has both `lifecycle_status` (not currently, but could be added if needed) and `status` (outline/draft/revised/locked/cut) — different axes. An asset has `lifecycle_status` and `approval_status` — different axes. The project has `lifecycle_status` and `production_status` — different axes.

**Casing convention.** All enum values across the schema are lowercase. The existing TitleCase values (`Active`, `Draft`, `Outline`, etc.) are being normalized to lowercase as part of this redesign. Display layers can capitalize for UI; the stored value is canonical lowercase. This sidesteps "is this a display label or a value?" comparison bugs across tools.

**Cleanup applied as part of this redesign:**

- `character.status`, `prop.status`, `location.status` → renamed to `lifecycle_status`, using the standard enum (their previous values `Active`/`Draft`/`Cut`/`Archived` map to `active`/`draft`/`cut`/`archived` — a strict subset of the new enum).
- `project.status` → renamed to `production_status`. Values lowercased: `development`, `pre_production`, `production`, `post_production`, `complete`. The rename avoids the field-name collision with scene/act/sequence's writing-process `status`.
- `scene.status`, `act.status`, `sequence.status` → keep `status` as the field name, lowercased values. `cut` added to act and sequence (was missing). Final enum: `outline`, `draft`, `revised`, `locked`, `cut` for all three.
- `take.usable`, `clip.usable` (booleans) → replaced by `lifecycle_status`. The previous boolean concept maps to `active` vs `cut`/`archived`.
- `asset.approval_status` → values lowercased: `wip`, `pending`, `approved`, `final`. Stays as its own field.
- `identity_anchor.canonical_status` → already lowercase. Stays as its own field.

### Format-level versioning

The `_scf_meta` table carries a `schema_version` entry — a string declaring which entity registry version the file was authored against. Tools open a file, check schema version, and either proceed, migrate, or refuse. This is independent of entity-level versioning; it's the format announcing its own identity as the registry evolves.

---

## OMC interoperability

SCF is an independent format. MovieLabs OMC is a production-workflow interchange standard; the two have overlapping concepts but separate models, separate governance, and separate release cycles. SCF does not adopt OMC as a base, does not extend it as a profile, and does not track its roadmap as a dependency. Where SCF and OMC happen to mean the same thing, terminology alignment is welcome — but only when alignment serves SCF's design, not when it constrains it.

This posture has two consequences:

- **Iteration speed.** SCF can change shape as creative-tooling needs change. OMC's pace is appropriate for industry consortia and studio operations; SCF's pace needs to match indie filmmakers and AI-augmented production where the ground shifts monthly.
- **Mental model independence.** SCF's design serves directors, writers, and creative authors. Some of OMC's choices reflect production-tracking priorities that don't map cleanly to creative authoring workflows. SCF reserves the right to disagree.

### External identifiers

Entities that may need to be addressed by external systems (OMC, EIDR, production databases, asset management) carry two optional fields:

| Field | Notes |
|---|---|
| `external_id` | identifier in an external system |
| `external_id_namespace` | which system the identifier belongs to. e.g. `omc`, `eidr`, `shotgrid:project_42` |

These appear on: `project`, `asset`, `actor`, `character`, `scene`, `shot`, `take`, `clip`. Authoring tools don't need to fill them in. Tools that bridge SCF and an external system populate them to maintain identity across handoffs. The mechanism is generic — it serves OMC interop but is not OMC-specific.

### Terminology and structure alignment

Where SCF and OMC naturally describe the same concept, SCF uses the same or compatible term. This is mostly already the case — `Scene`, `Shot`, `Asset` are shared. SCF's `bundle` maps reasonably to OMC's `AssetGroup`. SCF's version+state model is compatible with OMC's version+state distinction. These convergences are noted but not constraints — if SCF's design needs to diverge, it diverges.

| SCF | OMC analog | Note |
|---|---|---|
| `project` | Creative Work | Compatible; SCF richer on creative side. |
| `actor` | Participant (cast subset) | SCF specialized narrower; OMC's Participant covers crew too. |
| `asset` | Asset | Compatible. |
| `bundle` | AssetGroup (approximate) | Similar shape; SCF's `intent` enum has no direct OMC equivalent. |
| `character` | Narrative Character | Both exist; SCF model is substantially richer. |
| `scene`, `shot` | Scene, Shot | Compatible. |
| `take`, `clip` | (OMC v3.0 modeling underway) | SCF's structure designed for story-aware indexing; alignment if OMC's emerging model fits. |

### What SCF does not do

SCF does not adopt OMC's identifier scheme, does not implement OMC's base classes, does not follow OMC's governance, and does not require OMC-aware tools to consume it. A tool that knows nothing about OMC can author and read SCF files in full. The OMC mention in this design is informational: it tells implementers that SCF data *can* bridge to OMC consumers via the external_id mechanism if needed, and that SCF won't deliberately use vocabulary that conflicts with OMC where the concepts genuinely overlap. That's the limit.

---

## The four layers

### Layer 1 — Identity (description only)

What the character *is*, narratively and personally. No media, no presentation specifics.

- `character` (slimmed)
- `character_variant` (existing, modified — see below)
- The Tier 2 description entities (`physical_character_profile`, `vocal_profile`, `delivery_profile`, `facial_expression_profile`, `character_appearance_profile`, `costume`, `costume_progression`, `makeup_hair_design`, `physical_habit`, `character_relationship`) — unchanged structurally, but now understood as descriptive only. They tell a tool *what to aim for*; they don't carry the media that helps it get there.

Note: `character_color_identity` was previously listed under Tier 2 (Character Depth). This redesign moves it to Tier 4 (Thematic Tracking) alongside the other color entities (`color_symbolism`, `color_script`, `color_temperature_strategy`). The reasoning: color identity describes a *directorial choice* about how a character manifests visually, more akin to color_symbolism than to physical or vocal profile. A character isn't more or less the same character with a different color identity; it's a thematic/representational decision layered over the character. Tier 4 is the right home.

### Layer 2 — Asset reference (the bundle pattern)

Tool-agnostic mechanism for attaching media to characters under conditions.

- `bundle` — named, intent-typed collection of assets (versionable)
- `bundle_asset` — junction linking assets into a bundle with role and order
- `character_asset_binding` — applies a bundle to a character under specific conditions
- `identity_anchor` — known-good single-frame canonical references for QA and locking

### Layer 3 — Performance corpus

Project-level index of captured footage. Only populated when shooting happens, but always queryable.

- `performance_corpus` — project-level singleton describing the body of capture
- `actor` — project-level minimal entity
- `actor_character_role` — junction (actors and characters with role context)
- `take` — a single recorded take
- `take_scene` — junction (takes can cross scenes)
- `clip` — a meaningful within-scene segment of a take
- `clip_character` — junction (which characters appear in which clips)

### Layer 4 — Workflow state

Declares the production stance and tracks per-shot deviations.

- `project.workflow_mode` — added field on project
- `shot_coverage` — production state of each shot, with history
- `character_shot_override` — per-character deviations (versionable, single active per shot+character)

---

## Layer 1 — Identity (slimmed)

### `character` (modified)

The base entity becomes the irreducible "who." Aggressive trim removes everything that lives properly elsewhere.

**Survives:**
- `name`, `role`, `archetype`, `pronouns`, `gender`, `occupation`, `summary`
- `age` (canonical/story-present age)
- All Backstory-tab fields: `backstory`, `motivation`, `flaw`, `arc_description`, `internal_goal`, `external_goal`, `greatest_fear`, `core_belief`, `education_level`, `skills_abilities`

**Removed (now lives in proper Tier 2 entities):**
- `height`, `build`, `hair`, `eyes`, `distinguishing_features`, `movement_style`, `physical_notes` → `physical_character_profile` and `character_appearance_profile`
- `voice_quality`, `speech_pattern`, `accent`, `vocal_habits` → `vocal_profile`
- `default_wardrobe`, `wardrobe_notes` → `costume`
- `color_associations` → `character_color_identity`
- `relationships_json` → `character_relationship` (already exists; the JSON blob was always a stopgap)

**Modified:**
- `status` → renamed to `lifecycle_status`, using the standard enum (per the status field taxonomy in the versioning section). Character is not versionable, but it adopts `lifecycle_status` because the cross-cutting lifecycle axis is the right fit for character state.

**Added:**

| Field | Type | Notes |
|---|---|---|
| `casting_status` | select | `tbd`, `cast`, `actor_as_character`, `digital_double`, `generated_only`. Cheap signal for whether this character has a real-world actor anchor. Drives downstream expectations. |
| `external_id` | text | Optional. For OMC and other external system bridging. |
| `external_id_namespace` | text | Optional. Identifies the source system. |

**Why aggressive trim:** the duplications between `character.height` and `physical_character_profile.height` are a footgun in a format-first system. Two places to update, ambiguity for tools about which is canonical, and divergence is inevitable. With Tier 2 entities now being treated as the right home for descriptive data, the base entity should stop pretending to also be one.

### Tier 2 entities — unchanged structurally

These stay as defined in the current registry. Their *interpretation* changes: they describe; they don't reference media. A `vocal_profile` says "Eleanor has a low timbre, measured pace, slight Cornish lilt"; it does not contain or point to voice clones. Voice clones live in bundles, bound to Eleanor (and her variants and states) through `character_asset_binding`.

Where Tier 2 entities have existing `status` fields (typically following the character/prop/location pattern), they're renamed to `lifecycle_status` for consistency with the cross-cutting taxonomy. No other structural changes.

### `character_variant` (minor modification)

Structurally unchanged in this redesign, with one removal: the `duration_type` field (current values: `Temporary`, `Permanent`) is removed. Its semantics aren't sharp enough to be useful — the line between "permanent alternate self" (Young/Old) and "temporary state" (Drunk/Wounded) is blurry in middle cases. The field is removed pending a proper character_variant redesign pass, where the underlying distinction (life stage vs alternate identity vs situational state) can be modeled more clearly. Until then, the variant's purpose lives in its `name`, `context`, and `physical_differences` fields.

---

## Layer 2 — Asset reference (the bundle pattern)

### `bundle` (versionable)

The unit of tool-agnostic media reference. Generalizes beyond characters; the same entity will serve props and locations later without redesign.

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | e.g. "Snapper — Production Identity" |
| `intent` | select (hard enum) | `visual_identity`, `voice_identity`, `motion`, `behavior`, `performance`, `surface`, `environment`, `other` |
| `description` | textarea | What this bundle is for |
| `coverage_summary` | textarea | What's covered in plain language: angles, expressions, phoneme set, lighting conditions, motion vocabulary |
| `format_hints` | json | Structured metadata tools can read without prescribing pipeline. Conventional keys: `frame_count`, `view_angles_covered`, `lighting_conditions`, `audio_duration_sec`, `phonemes_covered`, `motion_categories`, `resolution_max`, `audio_sample_rate` |
| `intended_consumers` | json | Optional hints: `["image_gen", "video_gen", "voice_clone", "world_model"]` — guidance, not constraint |
| `provenance` | textarea | How it was assembled — shoot session, curated set, generated reference |
| `notes` | textarea | |
| *(versionable fields)* | | `parent_id`, `version_label`, `lifecycle_status`, `superseded_at`, `superseded_by_id` added automatically |

**On the intent enum.** Hard enum gives tool authors something stable to switch on. The seven specific values cover what current and near-future tools consume:
- `visual_identity` — face/body locking (photos, video stills)
- `voice_identity` — voice cloning material (clean audio, varied delivery)
- `motion` — body/gesture data (mocap, video clips, gait recordings)
- `behavior` — decision/reaction corpora, character LLM training data
- `performance` — multimodal captured performance (video with sync sound)
- `surface` — material/texture detail (skin micro, fabric weave)
- `environment` — placeholder for when this pattern extends to locations

`other` is the escape hatch. It exists, but it's a flag for "we should add a real value here," not an invitation to abuse. Tools can switch on the seven specific values and treat `other` as opaque.

### `bundle_asset` (junction)

| Field | Notes |
|---|---|
| `bundle_id`, `asset_id` | required |
| `role_in_bundle` | text, e.g. "front view neutral", "phoneme /θ/", "anger reaction take 3" |
| `order` | integer |
| `notes` | |

### `character_asset_binding`

The conditional scope layer. Says *when* a bundle applies to a character. This is what makes "Eleanor in Act 3" visually distinct from "Eleanor in Act 1" without requiring two separate `character` entities.

| Field | Notes |
|---|---|
| `name` | display label, e.g. "Snapper baseline visual" |
| `character_id` | required |
| `bundle_id` | required |
| `variant_id` | optional → `character_variant` |
| `physical_state_filter` | optional text — matches against `physical_state.energy_level` etc. |
| `vocal_state_filter` | optional text |
| `scene_range_start_id`, `scene_range_end_id` | optional → scene |
| `act_id` | optional → act (alternative coarser scope) |
| `conditions_json` | catch-all for tool-specific filters |
| `is_baseline` | boolean — true for the unconditional default for this character |
| `precedence` | integer — higher wins on conflict |
| `lifecycle_status` | standard enum |
| `notes` | |

A character will typically have several bindings: a baseline visual identity, a baseline voice identity, then more specific ones layered on (Old variant binding, exhausted-state binding, post-fight binding). Resolution is described in the cascade section below.

### `identity_anchor`

Distinct from bundles because anchors have a verification role: known-good single frames or clips marked as canonical truth for a character under specific conditions. Used both as ID-locking inputs *and* as QA targets to verify generated output hasn't drifted.

The anchor is a pointer into a source asset with optional spatial and temporal scoping. Source assets stay uncropped and complete; the anchor describes how to interpret them. This pattern holds across all media types — image, video, audio.

| Field | Notes |
|---|---|
| `name` | |
| `character_id` | required |
| `variant_id` | optional |
| `anchor_type` | select: `visual`, `audio`, `motion` |
| `asset_id` | required → asset (kept whole and uncropped) |
| `frame_number` | for video/motion assets, optional |
| `timecode` | alternative to frame_number, optional |
| `region_box` | json: `{x, y, w, h}` — optional spatial crop within frame |
| `region_label` | optional text — author's note on what the box represents (e.g. "face only", "head and shoulders") |
| `audio_offset_start_sec` | for audio anchors, optional |
| `audio_offset_end_sec` | for audio anchors, optional |
| `condition_description` | textarea — when this anchor is valid |
| `physical_state` | text |
| `vocal_state` | text |
| `canonical_status` | select: `verified`, `candidate`, `rejected` |
| `lifecycle_status` | standard enum |
| `notes` | |

A bundle says "here's a body of media to learn from"; an anchor says "this exact moment is unimpeachably him." Tools doing crops, frame extractions, and audio range selections happen at query time — the format never destroys source information.

The same source asset can be referenced by multiple anchors (one frame containing two characters yields two anchors with different region_boxes). This preserves the semantic link "these two anchors are the same moment," which is queryable for free and useful as conditioning context for character-pair generation.

---

## Layer 3 — Performance corpus

Only populated for projects with captured material, but the structure exists for any project — it's how the format announces "this content was performed, here's how it's indexed."

### `performance_corpus` (project-level singleton)

| Field | Notes |
|---|---|
| `name` | default "Performance Corpus" |
| `shoot_dates_start` | |
| `shoot_dates_end` | |
| `shoot_locations` | textarea |
| `camera_metadata` | textarea — sensors, codec, color space |
| `audio_metadata` | textarea — sample rate, mic config, boom/lav setup |
| `coverage_completeness` | select: `planned`, `in_production`, `principal_complete`, `pickups_complete`, `complete` |
| `corpus_notes` | textarea |

Note: actor-character mapping moved out of this entity (was a JSON blob) to proper `actor` + `actor_character_role` entities below.

### `actor` (project-level)

Minimal. The format does not try to be a casting tracker.

| Field | Notes |
|---|---|
| `name` | required |
| `notes` | textarea |
| `external_id` | optional — for OMC Participant or other external system bridging |
| `external_id_namespace` | optional |

### `actor_character_role` (junction)

Where the actual relationship information lives. Handles all combinations: one actor playing multiple characters, multiple actors playing one character (principal, body double, voice double, ADR, motion capture, etc.).

| Field | Notes |
|---|---|
| `actor_id` | required |
| `character_id` | required |
| `role_type` | select: `principal`, `body_double`, `stunt_double`, `voice_double`, `adr`, `motion_capture`, `reference_only`, `other` |
| `scope` | select: `whole_project`, `specific_scenes`, `specific_takes` |
| `scope_details` | textarea — when scope isn't whole_project |
| `lifecycle_status` | standard enum |
| `notes` | |

### `take`

A single recorded take. Takes can cross scenes (oners, walk-and-talks), so scene linkage is via junction.

| Field | Notes |
|---|---|
| `name` | slate id, e.g. "23A-3" |
| `corpus_id` | required |
| `shot_id` | optional |
| `take_number` | integer |
| `date_recorded` | |
| `duration_seconds` | |
| `timecode_start`, `timecode_end` | |
| `camera_designation` | text — A cam, B cam, witness |
| `lens_info` | text |
| `recording_format` | text |
| `preferred` | boolean — director's pick |
| `lifecycle_status` | standard enum (replaces previous `usable` boolean) |
| `external_id`, `external_id_namespace` | optional |
| `notes` | |

### `take_scene` (junction)

| Field | Notes |
|---|---|
| `take_id`, `scene_id` | required |
| `order_in_take` | integer — which scene comes first in the take |
| `coverage_completeness` | select: `partial`, `complete`, `incidental` — incidental for crossings or passes that catch a scene without trying to cover it |
| `notes` | |

### `clip`

A meaningful within-scene segment of a take. Clips are by definition within-scene; if a take crosses scenes, you cut multiple clips from it. Clips can link directly into `screenplay_lines` for dialogue coverage, making the screenplay editor a natural index into the footage.

| Field | Notes |
|---|---|
| `name` | |
| `take_id` | required |
| `clip_in_timecode`, `clip_out_timecode` | |
| `duration_seconds` | |
| `scene_id` | required |
| `screenplay_line_start_id` | optional → `screenplay_lines` |
| `screenplay_line_end_id` | optional → `screenplay_lines` |
| `beat_id` | optional → `story_beat` |
| `clip_type` | select: `dialogue`, `action`, `reaction`, `transition`, `insert`, `atmospheric` |
| `lifecycle_status` | standard enum (replaces previous `usable` boolean) |
| `external_id`, `external_id_namespace` | optional |
| `notes` | |

### `clip_character` (junction)

| Field | Notes |
|---|---|
| `clip_id`, `character_id` | required |
| `role_in_clip` | select: `featured`, `supporting`, `background` |
| `notes` | |

This trivially supports queries like "every clip with Snapper and Hannah together" — fundamental for both production review and for assembling training sets for character-pair generation.

---

## Layer 4 — Workflow state

### `project.workflow_mode` (added field on existing `project` entity)

| Field | Notes |
|---|---|
| `workflow_mode` | select: `performance_first`, `generation_first`, `hybrid` |

Project-level declaration. Tools can branch on this without scanning the file. A performance-first project signals "expect a populated corpus and shot_coverage records pointing into it"; generation-first signals "expect bindings doing the work." Hybrid says both will appear, so check per-shot. No coarser scope (sequence, act) is provided — the per-shot `coverage_state` carries the truth, and intermediate scopes would create sync hazards.

### `shot_coverage`

History-tracking. As production progresses, a shot may go through multiple coverage states. Multiple `shot_coverage` records per shot, ordered by `status_date`, give a production timeline.

| Field | Notes |
|---|---|
| `name` | |
| `shot_id` | required |
| `coverage_state` | select: `planned`, `captured_live`, `generated`, `hybrid_live_plate`, `hybrid_generated_extension`, `reshoot_needed`, `pickup_scheduled`, `final` |
| `source_take_id` | optional → take |
| `source_clip_id` | optional → clip |
| `generation_required` | textarea — what needs to be generated to complete |
| `override_summary` | textarea — high-level deviation summary, with detail in `character_shot_override` |
| `status_date` | for ordering history |
| `decided_by` | text |
| `lifecycle_status` | standard enum |
| `notes` | |

### `character_shot_override` (versionable)

Per character per shot. When a generated frame deviates from what was captured (or from the default cascade), this records the deviation. A shot might have one character overridden and another not.

**Single active override per (shot, character).** If multiple intents need to coexist (e.g. aging and transformation), they compose into a single record's `override_types` and delta fields. History is preserved through the version chain — superseded overrides remain in the file, marked with the standard `lifecycle_status`, but only the active one resolves in the cascade.

| Field | Notes |
|---|---|
| `name` | |
| `shot_id` | required |
| `character_id` | required |
| `override_types` | multiselect: `aging`, `de_aging`, `prosthetic`, `body_change`, `voice_change`, `motion_change`, `identity_swap`, `transformation`, `other` |
| `visual_delta` | textarea |
| `vocal_delta` | textarea |
| `motion_delta` | textarea |
| `bundle_override_id` | optional → bundle (use this bundle instead of the default cascade) |
| `variant_target_id` | optional → `character_variant` |
| `progression_axis` | optional text — names a project-defined progression dimension this override participates in. e.g. `transformation`, `aging`, `decay`, `corruption`. Free text because the axes are project-specific. |
| `progression_value` | optional float 0–1 — where on the named axis this shot sits. Authors define what the endpoints mean for each axis. |
| `notes` | |
| *(versionable fields)* | | `parent_id`, `version_label`, `lifecycle_status`, `superseded_at`, `superseded_by_id` added automatically |

Constraint: at most one record per (shot_id, character_id) with `lifecycle_status = active`.

**On the progression fields.** The earlier draft of this design had a `transformation_progress` field, which leaked Arcadia-specific concerns into a general-purpose entity. The replacement — `progression_axis` (text) and `progression_value` (float 0–1) — generalizes the concept. Projects with a transformation arc can use `progression_axis = "transformation"`. Projects with an aging arc can use `progression_axis = "aging"`. Other projects might track `corruption`, `decay`, `wear`, `awakening`, or any narrative axis where smooth progression across shots is a continuity concern. The axis name is project-defined (text, not enum); the value is normalized 0–1 with author-defined endpoints. Tools doing continuity QA can sort shots by progression_value within a named axis and flag jumps. Tools that don't care can ignore both fields.

---

## The resolution cascade

This is the payoff. A tool generating any character in any shot walks a single deterministic cascade. Performance-first and generation-first projects use the same query; they just land at different steps.

**The cascade operates per-modality.** A tool consults the cascade for the specific modality it cares about — visual, voice, motion, or behavior. These are resolved independently. The reason is that a single shot can legitimately mix sources across modalities: visual from captured live footage, voice from ADR, motion from a stunt double, behavior from a character LLM. Forcing all modalities to resolve from the same source would lose this flexibility.

When walking the cascade, the tool filters bundles by their `intent` field. A visual generation tool consults bundles with `intent = visual_identity`; a voice generation tool consults bundles with `intent = voice_identity`; etc. Step 2 (captured live source) short-circuits only for the modality whose data the captured clip provides — typically visual and possibly voice for a live-action take, but a voice generation tool resolving against a scene with active ADR bindings will skip past step 2 to step 3, finding the ADR bundle by precedence.

A tool generating Snapper's *visual* for Shot 47B (variant: Old, state: exhausted) walks:

1. Check `character_shot_override` for (shot 47B, Snapper) where `lifecycle_status = active`. If `bundle_override_id` is set and the referenced bundle's intent matches the requested modality, use that bundle. Done.
2. Otherwise check `shot_coverage` for shot 47B (most recent record by `status_date`). If `coverage_state` is `captured_live` and `source_clip_id` is set, *and* the captured clip provides usable data for this modality (visual capture for visual generation, sync audio for voice generation if no overriding ADR binding exists), → pull the clip; the performance is the answer.
3. Otherwise resolve `character_asset_binding` for Snapper, filtered by scene 47, variant Old, state exhausted, `lifecycle_status = active`, and bundle `intent` matching the requested modality. Pick highest-precedence match.
4. Fall back to bindings with looser scope: drop state filter, then variant filter, then fall to `is_baseline=true`.
5. For verification (regardless of which step produced the answer), pull `identity_anchor` records matching the same conditions and modality where `canonical_status = verified` and `lifecycle_status = active` — these are QA references, not generation inputs.

A tool generating Snapper's *voice* for the same shot walks the same five steps, but filtering by voice-related bundles and anchors. The two walks are independent and can resolve at different steps. Visual might land at step 2 (use the captured footage) while voice lands at step 3 (use the ADR bundle).

Performance-first projects tend to land at step 2 for most modalities. Generation-first projects tend to land at step 3 across the board. Hybrid projects mix freely per shot and per modality. Same schema, same query, different population pattern.

---

## Worked examples

### Example A — Generation-first AI short

A creator producing a fully synthetic 10-minute piece. No actors, no shoot.

**Project:** `workflow_mode = generation_first`. Performance corpus exists structurally but stays empty.

**Character: Mira (protagonist).**

- `character` populated: name, role (Protagonist), archetype, summary, motivation, arc. `casting_status = generated_only`. `lifecycle_status = active`.
- `character_appearance_profile`, `physical_character_profile`, `vocal_profile` populated with descriptive fields. These tell tools what they're aiming for.
- `character_variant`: "Mira — Young" (flashbacks), "Mira — Final Form" (Act 3 transformation).

**Bundles for Mira:**

- Bundle "Mira baseline visual" (`intent: visual_identity`, `version_label: "v1"`, `lifecycle_status: active`)
  - 30 generated/curated reference images covering angles, expressions, lighting
  - `format_hints: {frame_count: 30, view_angles_covered: ["front", "3/4", "profile", "back"], lighting_conditions: ["neutral", "high-key", "low-key", "warm interior"]}`
  - `intended_consumers: ["image_gen", "video_gen"]`
- Bundle "Mira baseline voice" (`intent: voice_identity`)
  - 4 minutes of curated audio across emotional registers
  - `format_hints: {audio_duration_sec: 240, phonemes_covered: "complete", emotional_states: ["neutral", "tense", "joyful", "broken"]}`
- Bundle "Mira — young" (`intent: visual_identity`)
  - 12 reference images of Mira at age 14
  - Bound to her Young variant via a separate `character_asset_binding`

**Bindings:**

- Baseline visual binding: bundle "Mira baseline visual" → Mira, `is_baseline=true`, no filters
- Baseline voice binding: bundle "Mira baseline voice" → Mira, `is_baseline=true`
- Young visual binding: bundle "Mira — young" → Mira, `variant_id = Mira-Young`, `precedence=10`

**Shot coverage:** every shot is `coverage_state = generated`. No source clips.

**Versioning later:** during pickups, the author refines the visual bundle. They create "Mira baseline visual v2" with `parent_id` pointing at v1. v2 becomes `active`; v1 is automatically marked `superseded` with `superseded_by_id` pointing at v2. The cascade resolves to v2; v1 remains queryable for history but never returned in default queries.

When Tool X generates Shot 23 (Mira, Young variant): walks cascade, hits step 3, resolves to "Mira — young" binding (variant filter matches, precedence wins). Tool X reads the bundle's `format_hints` and `intended_consumers`, sees it's appropriate for image generation, pulls the 12 assets via `bundle_asset`, and proceeds. The format said nothing about LoRAs or any specific tool. Tool X could be a LoRA-trainer, an IP-Adapter-style ID conditioner, or something not yet invented.

### Example B — Rango-style: Arcadia shoot for the Snapper/Hannah dialogue scene

You shoot the Arcadia interrogation scene Rango-style: the actors playing Snapper and Hannah perform the scene on a Berlin stage with stand-in props. Multiple takes, multiple angles. The actor playing Snapper *is* the intended visual reference for the character — face, voice, performance all canonical.

**Project:** `workflow_mode = performance_first`.

**Character: Snapper.**

- `character` populated: identity, backstory, arc. `casting_status = actor_as_character`.
- Tier 2 description entities populated lightly — they describe directorial intent, but the corpus carries most of the character data implicitly.

**Actors:**

- `actor`: "Alex Mercer" (the principal performer)
- `actor`: "James Holt" (ADR voice work scheduled for post)
- `actor_character_role`: Alex → Snapper, `role_type: principal`, `scope: whole_project`
- `actor_character_role`: James → Snapper, `role_type: adr`, `scope: specific_scenes`, `scope_details: "Scenes 47-52, transformation sequence dialogue"`

**Performance corpus populated:**

- `performance_corpus` with shoot dates, camera metadata, audio metadata
- `take` records: 23A-1, 23A-2, 23A-3, 23B-1, 23B-2, 23C-1 (different angles, different takes)
- `take_scene` linking each take to scene 23 (and 23A-1 also linked to scene 24 because the take ran long into the next scene's beat — `coverage_completeness: incidental`)
- `clip` records cutting each take into scene-bounded segments. Clip "23A-3 — main coverage" links to scene 23 and to `screenplay_line_start_id/end_id` covering Snapper's interrogation lines
- `clip_character` linking each clip to Snapper and Hannah with `role_in_clip = featured`

**Bundles for Snapper:**

- Bundle "Snapper — production identity" (`intent: visual_identity`)
  - 8 anchor frames pulled from preferred takes, varied angles and lighting
  - `provenance: "Curated from preferred takes 23A-3 and 18B-1, performed by Alex Mercer"`
  - `intended_consumers: ["image_gen", "video_gen"]`
- Bundle "Snapper — production voice" (`intent: voice_identity`)
  - Selected dialogue clips from the shoot
  - `provenance: "Lav recordings from preferred takes, denoised. Performer: Alex Mercer."`
- Bundle "Snapper — production performance" (`intent: performance`)
  - Full preferred takes, multimodal
  - `intended_consumers: ["video_gen", "world_model"]`
- Bundle "Snapper — ADR voice" (`intent: voice_identity`)
  - Studio recordings by James Holt for the transformation scenes
  - `provenance: "ADR session 2026-06-14, James Holt"`

**Identity anchors for Snapper:**

- 6 `identity_anchor` records: each points at a clip asset with frame_number specified, region_box cropping to the face, marked `canonical_status: verified`. Source clips remain whole — the anchors describe *into* them.

**Shot coverage:**

- Shot 47A: `coverage_state: captured_live`, `source_take_id: 23A-3`, `source_clip_id: 23A-3-main`
- Shot 47B: `coverage_state: captured_live`, `source_clip_id: 23B-1-reaction`
- Shot 47C (the werewolf transformation begins here): `coverage_state: hybrid_generated_extension`, `source_clip_id: 23C-1`, `generation_required: "Transformation overlay starting at frame 1240, eyes amber, jaw extension"`

**Character override on 47C:**

- `character_shot_override`: shot 47C, Snapper, `override_types: [transformation]`, `transformation_progress: 0.3`, `visual_delta: "Eye color shifting amber, faint hair growth at jawline, posture beginning to drop forward"`, `vocal_delta: "Voice dropping in register, breath becoming labored"`, `bundle_override_id` pointing to a "Snapper — partial transformation" bundle
- Single record. `lifecycle_status: active`. If post-production needs to layer additional intent later (e.g. "also add a wound from scene 46"), they create a successor: parent_id pointing at this record, `override_types: [transformation, other]`, deltas updated to describe both. New record becomes active; old becomes superseded but remains queryable.

When Tool Y generates Shot 47A (Snapper, no override): walks cascade, hits step 1 (no active override), step 2 (captured live, source clip set) → returns the live clip. The performance is the answer. Generation isn't even invoked.

When Tool Y generates Shot 47C: walks cascade, hits step 1 — active override exists with `bundle_override_id` set → uses the partial-transformation bundle, with the captured clip available as conditioning input via `source_clip_id`. The cascade gracefully composes captured material with overrides.

### Example C — Hybrid: pre-vis a scene generatively, then shoot it

You're pre-visualizing scene 12 of Arcadia before the actor playing Hannah is locked. Generate the scene from authored description; later, shoot it with the cast actor and replace the generated content.

**Phase 1 — Pre-vis (today):**

- Project: `workflow_mode = hybrid` (set early because you know shoots will happen)
- Hannah's `casting_status = tbd`
- A bundle "Hannah — provisional visual" with curated reference images approximating intended look. `version_label: "provisional"`. `lifecycle_status: active`.
- Binding: provisional bundle → Hannah, `is_baseline=true`
- All shots in scene 12: `shot_coverage` records with `coverage_state: generated`

Tool generates pre-vis. Cascade resolves at step 3, picks up the provisional bundle. Pre-vis ships.

**Phase 2 — Cast and shoot (3 months later):**

- `actor` "Sarah Chen" added; `actor_character_role`: Sarah → Hannah, `role_type: principal`
- Hannah's `casting_status` updates to `actor_as_character`
- Shoot happens; `take` and `clip` records added
- New bundle "Hannah — production identity" added with `parent_id` pointing at the provisional bundle. `version_label: "production-v1"`. The provisional bundle's `lifecycle_status` changes to `superseded`, `superseded_by_id` set to the new bundle. New bundle is `active`.
- New `shot_coverage` records added for scene 12 shots: `coverage_state: captured_live`, with source clips, `status_date` later than the original pre-vis records

The pre-vis `shot_coverage` records aren't deleted — they're part of the production history. The most recent record per shot is canonical. Tools generating now hit step 2 in the cascade and use captured material. The provisional bundle remains in the file as historical record but is overridden by the version chain.

**Phase 3 — Pickup needed for one shot:**

- Shot 12B looks great in the cut except for one moment where Hannah's reaction needs adjustment
- Add new `shot_coverage` for 12B: `coverage_state: hybrid_generated_extension`, `source_clip_id` still pointing to the captured clip, `generation_required: "Generate alternate facial reaction at clip mid-point, slightly more skeptical"`
- Add `character_shot_override` for (12B, Hannah): `override_types: [other]`, `visual_delta: "Eyebrow raise, slight head tilt at frame 340"`. `lifecycle_status: active`.

The captured clip is still the foundation; generation extends it. Same character, same bundles, additive override.

---

## What this gets you

**For tool builders:** a stable, declarative interface. A tool reads `bundle.intent`, `format_hints`, and `intended_consumers` to decide if it can consume a given bundle, then walks `bundle_asset` to pull what it needs. It never has to know whether the project is performance-first or generation-first; the cascade handles that. Versioning is consistent across versionable entities, so a tool that knows how to walk one version chain knows how to walk all of them.

**For authors:** a clean separation between description (what you intend) and reference (what you have). A character with rich Tier 2 descriptive entities and zero bundles is fine — generation tools have plenty of text to work from. A character with sparse Tier 2 entities but a fat performance corpus is also fine — the footage carries the data. Most projects will populate both. History is preserved automatically; nothing has to be deleted to be replaced.

**For production tracking:** `shot_coverage` becomes a production status board for free. "What's still un-shot? What's marked for reshoot? What's pending generation?" — all queryable from the existing structure.

**For production handoff:** OMC-aligned external_id fields on bridgeable entities mean the file can round-trip with production systems without losing identity. SCF doesn't replicate OMC's production model; it provides the upstream story-rich data and clean handoff points.

**For the SCF format's positioning:** this is the kind of design no current tool offers and no current format anticipates. Higgsfield Soul ID solves identity for one image at a time. World models ingest video without semantic structure. Production databases (ShotGrid, ftrack) track shots without understanding character variants or generative workflows. OMC standardizes production interchange but doesn't carry creative intent at this density. SCF as defined here describes character data with enough structure that today's identity-locking tools, today's video generators, tomorrow's world models, and tomorrow's character-LLM agents can all consume the same file and pull what they need — and hand off to OMC-speaking production tools cleanly.

**For Arcadia specifically:** the werewolf transformation problem — partial states, character integrity preserved across radical visual change, mid-transformation moments — is exactly what `transformation_progress` and bundle overrides per shot solve. The schema is Arcadia-aware without being Arcadia-specific.

---

## Generalization signal

The bundle pattern is intentionally generic. The same `bundle` entity, with intent values like `surface` and `environment`, will support:

- `prop_asset_binding` — bind material/surface bundles to props under condition (clean vs damaged vs symbolic)
- `location_asset_binding` — bind environment bundles to locations under condition (day vs night vs after-fire)

When that work happens, no new bundle infrastructure is needed. The pattern designed here for character is the format primitive for all media-rich entity references.

The versioning pattern (`versionable=True` on `EntityDef`) and standard `lifecycle_status` enum are similarly intended as schema-wide conventions. As other entities are revised or added, they should adopt these patterns rather than inventing new versioning or status systems.

---

## What's deliberately deferred

- **Generalizing binding to props/locations.** The pattern is designed to extend; the actual `prop_asset_binding` and `location_asset_binding` entities aren't in this proposal.
- **Retiring `entity_images`.** The existing reference image system is a primitive bundle. It can be retired in favor of bundles eventually; for now it works and is out of scope.
- **Editorial/cut representation.** Once footage is edited, you have an EDL relating clips to a final cut. That's its own structural concern, not character's.
- **Screenplay revisions vs corpus links.** When a line gets rewritten after shooting, what happens to the clip pointing at the old line? Worth thinking about, not blocking this design.
- **OMC export specification.** The external_id mechanism is in place; the actual mapping to OMC-JSON output is a companion document, not part of the schema.
- **Registry-ready Python.** This document is a structural proposal. The `EntityDef` definitions, the `versionable` flag implementation, full options lists, tab assignments, and SQL implications are the next pass — better to revise the shape now than after entity definitions and references are written.

---

## Appendix: Resolved questions from v1

Recap of design decisions that shape v2:

1. **Versioning model.** Format defines lineage (`parent_id`, `version_label`, `lifecycle_status`, `superseded_at`, `superseded_by_id`). Tools define policy (when to bump, who promotes, etc.). `versionable=True` flag on `EntityDef` adds the standard fields. Linear chains only, no branching. Standard `lifecycle_status` enum across the schema. Format-level `schema_version` in `_scf_meta`. Preservation over deletion as a foundational principle.

2. **Anchor crops.** Source assets stay whole and uncropped. `region_box` is optional spatial scoping with optional `region_label` for author intent. Symmetric treatment for video (`frame_number` / `timecode`) and audio (`audio_offset_start_sec` / `audio_offset_end_sec`). Tools transform at query time. Co-presence linking comes for free when multiple anchors share a source.

3. **Override stacking.** Single active `character_shot_override` per (shot, character). Multiple intents compose into one record's `override_types` and delta fields. Versioning chain preserves history. Format constraint: at most one record per (shot_id, character_id) with `lifecycle_status = active`.

4. **Actor placement.** Promoted from JSON blob to proper `actor` entity (project-level, minimal) plus `actor_character_role` junction. Handles all combinations of actor/character mapping including doubles, ADR, motion capture. SCF stays story-first; doesn't model contracts, scheduling, or vendor relationships.

5. **Workflow mode coarser scope.** Not added. Project-level `workflow_mode` plus per-shot `coverage_state` is sufficient. Sequence/act-level modes would be derived summaries and create sync hazards. Tools can compute them at query time.

6. **OMC posture.** SCF is independent — not an OMC extension, not an OMC profile, no dependence on OMC's release cycle or governance. Optional `external_id` / `external_id_namespace` fields on bridgeable entities serve OMC interop without committing to OMC compliance. Where SCF and OMC happen to mean the same thing, terminology alignment is welcome; where they don't, SCF reserves the right to its own design.

7. **Status field taxonomy.** Four distinct axes named separately: `lifecycle_status` (cross-cutting "is this current?"), `production_status` (project-level production phase, renamed from project.status to avoid collision), `status` (writing-process axis on scene/act/sequence), and entity-specific fields like `approval_status` and `canonical_status`. All enum values normalized to lowercase. `cut` added to act and sequence status enums for harmonization with scene. Existing `usable` booleans on take/clip replaced by `lifecycle_status`.

8. **Cascade per-modality.** The resolution cascade operates independently for each modality (visual, voice, motion, behavior). A tool requesting one modality filters bundles by `intent` and resolves against bundles/anchors of that intent. Step 2 (captured live) short-circuits only when the captured source provides usable data for the requested modality. This allows a single shot to mix visual capture with ADR voice with motion-capture motion across different bundles.

9. **Per-shot character override progression.** The `transformation_progress` field on `character_shot_override` (Arcadia-specific) was generalized to `progression_axis` (free text, project-defined) plus `progression_value` (float 0–1). Supports continuity tracking on any project-defined progression dimension without baking specific axes into the schema.

10. **`character_variant.duration_type` removed.** The Temporary/Permanent distinction wasn't sharp enough to be useful. Removed pending a proper `character_variant` redesign pass, where the underlying distinction (life stage vs alternate identity vs situational state) can be modeled more clearly.

11. **`character_color_identity` moved to Tier 4.** Was previously in Tier 2 (Character Depth); moved to Tier 4 (Thematic Tracking) alongside `color_symbolism`, `color_script`, `color_temperature_strategy`. Color identity is a directorial choice about how a character manifests visually, not a fundamental property of the character — Tier 4 is the right home conceptually and operationally.
