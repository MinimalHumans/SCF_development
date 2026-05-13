# SCF Conventions

*Cross-cutting rules that apply across the SCF schema. Authoritative — when conventions change, this is where they get updated, and tools (including the documentation generator) read from this document.*

For the conceptual overview of what SCF is and why, see `format_overview.md`. For the current state of the schema, see `schema_reference.md`.

---

## Versioning model

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

## Status field taxonomy

Four distinct axes track different concerns. Named separately to avoid collision and to keep the format honest about what's being measured.

### 1. `lifecycle_status` — cross-cutting "is this current?"

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

### 2. `production_status` — project-level production phase

Values: `development`, `pre_production`, `production`, `post_production`, `complete`.

Applied to: the `project` entity. Tracks the project's production phase, independent of whether the project record itself is `active`. A project in `post_production` could be in any lifecycle state.

### 3. `status` — writing-process state (scene/act/sequence)

Values: `outline`, `draft`, `revised`, `locked`, `cut`.

Applied to: `scene`, `act`, `sequence`. Tracks where each narrative unit is in the writing process. A locked scene is still active in the lifecycle sense; a draft scene is still active. The two axes are orthogonal.

### 4. Entity-specific status fields

Domain-specific verification or approval axes:

- `asset.approval_status` — `wip`, `pending`, `approved`, `final`
- `identity_anchor.canonical_status` — `verified`, `candidate`, `rejected`

These track concerns that are genuinely distinct from lifecycle. They stay as separate fields with their own enums.

### Multiple axes coexist

A single entity often has multiple status fields, each measuring a different axis:

- A `project` has `lifecycle_status` (is this record current?) and `production_status` (what phase?).
- An `asset` has `lifecycle_status` (is this record current?) and `approval_status` (has this been approved for use?).
- An `identity_anchor` has `lifecycle_status` and `canonical_status`.

Tools query the axis relevant to their job. Compressing axes into a single field would force false equivalences.

## Casing convention

**All enum values across the schema are lowercase.** Display layers may capitalize for UI; the stored value is canonical lowercase. This sidesteps "is this a display label or a value?" comparison bugs across tools.

Field names use `snake_case`. Entity names use `snake_case`. Reference fields are named `<entity>_id` (e.g. `character_id`, `scene_id`, `bundle_id`).

## Reference fields

All `*_id` fields are **integer foreign keys**. They reference rows in the target entity's table by primary key. Renaming an entity's `name` field does not break references — the integer ID is stable.

Reference field declarations in the entity registry specify the target entity:

```python
FieldDef("character_id", "Character", "reference",
         reference_entity="character", required=True)
```

SQL `FOREIGN KEY` constraints are not enforced in entity tables to allow flexible authoring (e.g. creating a relationship before its target exists). Tools should validate references but the format permits temporary inconsistency.

## Preservation over deletion

The schema favors lifecycle state transitions over physical deletion. A cut character isn't removed from the file; their `lifecycle_status` changes to `cut`. A superseded bundle isn't deleted; the new version supersedes it and the old version's `lifecycle_status` becomes `superseded`. A rejected identity anchor isn't deleted; its `canonical_status` changes to `rejected`.

Tools default to showing `active` records. They can opt into showing other states. They never need to handle missing entities — the file is the complete history.

The only legitimate reason to delete a record is privacy compliance (e.g. removing personal data on request). In all other cases, lifecycle transitions are the correct mechanism.

## Format-level versioning

The `_scf_meta` table carries a `schema_version` entry — a string declaring which entity registry version the file was authored against. Tools open a file, check schema version, and either proceed, migrate, or refuse with a clear message.

Schema versions follow semver-style conventions:

- **Major bumps** (e.g. 1.x → 2.0) for breaking changes: entities removed, fields renamed, semantics changed.
- **Minor bumps** (e.g. 1.0 → 1.1) for additive changes: new entity, new field, new enum value.

The changelog at `docs/history/changelog.md` records the version-to-design-document mapping.

## OMC posture

SCF is independent of MovieLabs OMC. SCF is **not** an OMC extension, **not** an OMC profile, and **not** dependent on OMC's release cycle or governance. Where SCF and OMC happen to mean the same thing, terminology alignment is welcome. Where they don't, SCF reserves the right to its own design.

### External identifiers

Entities that may be addressed by external systems (OMC, EIDR, production databases, asset management tools) carry two optional fields:

| Field | Notes |
|---|---|
| `external_id` | identifier in an external system |
| `external_id_namespace` | which system the identifier belongs to. e.g. `omc`, `eidr`, `shotgrid:project_42` |

These appear on: `project`, `asset`, `actor`, `character`, `scene`, `shot`, `take`, `clip`. Authoring tools don't need to fill them in. Tools that bridge SCF and an external system populate them to maintain identity across handoffs.

The mechanism is generic. It serves OMC interop but is not OMC-specific.

### What SCF does not do

SCF does not adopt OMC's identifier scheme, does not implement OMC's base classes, does not follow OMC's governance, and does not require OMC-aware tools to consume it. A tool that knows nothing about OMC can author and read SCF files in full.

## The bundle pattern (character cluster)

For media references on characters, the schema uses a tool-agnostic bundle pattern. The same pattern is intended to extend to props and locations.

### Bundle

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

### Bindings

A `character_asset_binding` applies a bundle to a character under specific conditions:

- Optional `variant_id` (which character variant this applies to)
- Optional state filters (physical state, vocal state)
- Optional scene range
- `is_baseline` flag for the unconditional default
- `precedence` integer for resolution priority

A character typically has several bindings: a baseline visual, a baseline voice, then more specific ones layered on (variant-specific, state-specific, scene-range-specific).

### Identity anchors

Distinct from bundles, anchors mark known-good single frames or audio segments as canonical references. Used for both ID-locking inputs and output verification (QA). Anchors point into source assets with optional spatial scoping (region_box) and temporal scoping (frame_number, timecode, audio offset). Source assets stay whole and uncropped — anchors describe how to interpret them.

### Resolution cascade

A tool generating any character in any shot walks a deterministic cascade:

1. Check `character_shot_override` for (shot, character, active). If `bundle_override_id` is set and the bundle matches the requested modality, use it.
2. Check `shot_coverage` (most recent by status_date). If `coverage_state` is `captured_live` and the captured source provides usable data for the requested modality, use it.
3. Resolve `character_asset_binding` for the character, filtered by scene/variant/state and bundle `intent` matching the requested modality. Pick highest-precedence match.
4. Fall back to bindings with looser scope: drop state filter, then variant filter, then fall to `is_baseline=true`.
5. For verification, pull `identity_anchor` records matching the same conditions and modality.

**The cascade operates per-modality.** Visual, voice, motion, and behavior are resolved independently. A tool requesting one modality filters by bundle `intent`. Step 2 (captured live) short-circuits only when the captured source provides usable data for that modality.

The cascade enables performance-first projects (live action, generation augmenting) and generation-first projects (fully synthetic) to use the same query patterns. They simply land at different steps.

## Naming conventions for new entities

When adding new entities to the registry, follow these conventions:

- **Entity names:** `snake_case` singular. e.g. `character_variant`, `identity_anchor`, `performance_corpus`.
- **Junction entities:** noun-noun, indicating what's being connected. e.g. `scene_character`, `clip_character`, `actor_character_role`.
- **Field names:** `snake_case`. Reference fields are `<target>_id`.
- **Enum values:** lowercase, underscored if multi-word. e.g. `actor_as_character`, `hybrid_generated_extension`.
- **Categories:** human-readable Title Case. e.g. `"Character Depth"`, `"Thematic Tracking"`.

## Notational conventions in documentation

In design documents and worked examples, code blocks may use entity names as shorthand for their integer IDs:

```
character_asset_binding:
  character_id = Snapper
  bundle_id = Snapper-baseline-visual
```

This is shorthand for "the integer id of the character record whose name is currently Snapper" and "the integer id of the bundle whose name is currently Snapper-baseline-visual". The format stores integers; the names are for human readability only. Renaming an entity in its `name` field doesn't break references because the integer ID is stable.

This convention is widely used in the design and workflow documents under `docs/design/`.
