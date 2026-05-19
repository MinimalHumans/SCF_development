# SCF Roadmap

*Forward-looking planning doc. For what SCF is, see `format_overview.md`. For the current schema, see `schema_snapshot.md` and `schema_reference.md`. For cross-cutting rules, see `conventions.md`. For the design history behind the recent redesigns, see the dated design docs under `docs/design/`.*

*This supersedes `20260427_SCF_Schema_Roadmap.md`, which is retained for historical reference. The April doc was doing several jobs (conceptual intro, schema reference, layer mapping, editor phases) that have since migrated to the current docs listed above; what remains here is the planning content.*

---

## Where we are

The schema has just absorbed two large redesigns. **Character v2** (`docs/design/20260513_SCF_Character_Schema_Redesign.md`) introduced the bundle / binding / anchor / shot-override pattern, the performance corpus cluster, the four-axis status taxonomy, format-level versioning, and the OMC interop posture. **Prop & Location** (`docs/design/20260516_SCF_Prop_Location_Schema_Redesign.md`) extended that pattern symmetrically to props and locations, generalized `identity_anchor` → `entity_anchor` with constrained polymorphism, added `prop_variant` and `prop_surface_profile`, parallel asset bindings and shot overrides, slimmed both base entities, and added the `acoustic` bundle intent.

The registry currently defines ~96 entities across seven tiers (0–6), with Tier 5 housing Audience / Emotional Architecture and Tier 6 housing Production. The editor exposes Tier 0 with full CRUD, screenplay editing, query explorer, and a reference-images system that predates bundles.

Work ahead splits into three streams: **landing the recent redesigns** (registry + editor), **exposing the rest of the existing schema** in the editor, and **future format and platform work**.

---

## Stream 1 — Landing the recent redesigns

This is the active body of work and gates most of the rest. The design docs are signed off; what remains is implementation and a parallel workflows companion.

### 1A. Registry alignment

Both design docs explicitly deferred "Registry-ready Python." Field definitions, options lists, tab assignments, and SQL implications need to land in `entity_registry.py` in one wave, treated as a schema break (no migration machinery — the format is still pre-production).

The shopping list:

- Slim `character`, `prop`, `location` base entities per the redesigns; rename their `status` field to `lifecycle_status`.
- Rename `project.status` → `production_status`. Lowercase all enum values across the schema. Replace `take.usable` / `clip.usable` booleans with `lifecycle_status`.
- Add the new entities: `bundle`, `bundle_asset`, `character_asset_binding`, `prop_asset_binding`, `location_asset_binding`, `entity_anchor` (renamed from `identity_anchor`), `performance_corpus`, `actor`, `actor_character_role`, `take`, `take_scene`, `clip`, `clip_character`, `clip_prop`, `shot_coverage`, `character_shot_override`, `prop_shot_override`, `location_shot_override`, `prop_surface_profile`, `prop_variant`.
- Add new fields on existing entities: `character.casting_status`; `prop.realization_status`; `location.realization_status`; `project.workflow_mode`; `is_baseline` + structured state fields on `location_variant`; `external_id` / `external_id_namespace` on the bridgeable-entity list (now including prop and location).
- Add `acoustic` to the bundle intent enum.
- Move `character_color_identity` from Tier 2 to Tier 4 (intentional — color identity is a directorial choice closer to color_symbolism than to physical/vocal profile).
- Remove `character_variant.duration_type` pending the variant redesign noted under decisions below.
- Flag the appropriate entities as `versionable` so the standard version-chain fields (`parent_id`, `version_label`, `superseded_at`, `superseded_by_id`) are auto-injected: `bundle`, `asset`, `character_shot_override`, `prop_shot_override`, `location_shot_override`.

`schema_reference.md` and `schema_snapshot.md` regenerate from the registry, so the doc generator picks this up automatically. The changelog at `docs/history/changelog.md` should get a 1.x → 2.0 entry naming this wave.

### 1B. Prop & Location workflows companion doc

Character v2 ships with a 10-scenario workflows companion (`20260513_SCF_Character_Schema_Workflows.md`) that exercises every entity introduced. The prop/location side needs the parallel deliverable. Scenarios worth covering: a hybrid-realized prop with a mid-shot state change (the gun firing, the locket falling open), a plate-captured location with a CG extension, `clip_prop` queries for "every clip featuring the locket," scene-level cascade resolution versus shot-level, `entity_anchor` with `subject_type` ∈ {prop, location}, and time-of-day variants of locations resolving through `location_variant.is_baseline` plus structured state filters.

### 1C. Editor exposure of the new entities

New entities will appear in the entity tree automatically once registered, but several need deliberate UI work beyond generic CRUD:

- **Bundle authoring.** Bundles need a composition view: drag assets in, set `role_in_bundle` per asset, edit `format_hints` and `intended_consumers` as structured JSON, pick `intent` from the closed enum. The existing entity form renderer won't handle this without specialization.
- **Binding panels.** `character_asset_binding`, `prop_asset_binding`, `location_asset_binding` belong on the parent entity's Reference tab as inline link panels with editable conditions (variant, scene range, precedence, `is_baseline`). This is an extension of the existing `link_panel.html` pattern.
- **Entity anchor frame selection.** Anchors need a way to pick a frame within a video asset and draw a `region_box`. Out of scope for a first pass — fall back to numeric `frame_number` + JSON `region_box` entry, leave the visual picker for later.
- **Shot overrides.** `character_shot_override`, `prop_shot_override`, `location_shot_override` are shot-scoped and versionable. Probably surface them on the shot detail view rather than as standalone tree entries — they don't read well in isolation from their shot.
- **Performance corpus authoring.** Take/clip data is heavy. Lowest-friction first pass is plain CRUD plus the `clip` → `screenplay_lines` linkage hooked into the screenplay editor (click a line → list of clips covering it). Postpone any specialized timeline UI.
- **High-signal status surfacing.** `project.workflow_mode`, `character.casting_status`, `prop.realization_status`, `location.realization_status` drive what tools expect to find. Surface these prominently on the relevant entity headers — they're the at-a-glance "what kind of project / character / prop / location is this" fields.

The screenplay editor already does most of what Stream 1 needs from it (line types, prop tagging, version drawer). No major rework there beyond hooking the new `clip` → `screenplay_lines` linkage in.

### 1D. Retire `entity_images` in favor of bundles

The current Reference tab uses `entity_images`, which is a primitive bundle-like system. Migration paths:

- **Hard cutover.** Drop `entity_images` entirely, write a one-shot migration that turns each entity's existing images into a single `visual_identity` bundle with a baseline binding. Clean state on the other side; one migration to test.
- **Phased.** Keep `entity_images` working alongside bundles. New uploads go through bundles; existing entity_images data stays accessible until reauthored. Two code paths in the editor for some time.

Hard cutover is cleaner if the migration is tested against the projects that currently exist. Phased buys time but accumulates the kind of dual-system debt that becomes harder to retire the longer it lives. Open decision — leaning hard cutover given the pre-production status of the format, but the projects in flight at the moment of cutover matter to that call.

---

## Stream 2 — Exposing the rest of the existing schema

The original roadmap's Phases 2–6 mapped to entities that already existed. Most of those entities are still un-exposed in the editor. Restated as what's outstanding, with the calls out for what's actually unclear:

**Tier 1 (Creative Direction) — singletons UI.** 17 project-level singletons. Pattern: the "+" button creates the singleton, subsequent clicks edit. Most are textareas plus a few select fields; the existing form renderer handles them. `project_color_palette` and `color_temperature_strategy` warrant color-picker UI eventually; text/hex is fine initially. Lightest lift in Stream 2.

**Tier 2 (Character & Location Depth) — child-entity authoring.** Per-entity detail records. Open UX question worth deciding before building: surface as sub-sections on the parent entity's edit form, or as separate tree entries grouped under the parent? Likely mixed — the descriptive singletons (`physical_character_profile`, `vocal_profile`, `prop_surface_profile`) read naturally as parent-form sub-sections; the multi-record ones (`costume`, `character_variant`, `prop_variant`, `location_variant`) work better as separate tree entries with a clear link to their parent.

**Tier 3 (Scene Detail) — per-scene creative data.** Hangs naturally off the scene editor. Some entities (`scene_color_palette`, `lighting_design`) could justify visual feedback in the form — color swatches, lighting diagrams — but plain forms are fine for v1.

**Tier 4 (Thematic Tracking) — motifs, symbols, color entities.** `thematic_connection`, `visual_motif_appearance`, `motif_manifestation` use open polymorphism (`entity_type` + `entity_id`). The editor needs a polymorphic entity picker: select type → autocomplete-pick instance within that type. This widget will get reused across all open-polymorphism fields, so worth doing once well.

**Tier 5 (Audience / Emotional Architecture) — `emotional_arc`, `emotional_beat`, `information_strategy`, `identification_strategy`.** Small tier (4 entities). Hangs off the project and per-scene views.

**Tier 6 (Production) — shot-level, performance execution, choreography.** Largest tier (26 entities). The current entity tree was built around story entities and probably doesn't scale gracefully to shot-by-shot authoring. A dedicated shot-centric view (one shot, all the per-shot entities in tabs or sections) would help, but is a substantial UI build. Worth doing only when there's a project being authored at this depth.

---

## Stream 3 — Future format and platform work

Things that aren't blocked on Stream 1 but should wait for it. Roughly in order of payoff.

### Context output / prompt generation

The format's payoff. Once the schema is populated, tools should be able to query across layers and emit structured context for downstream consumers — scene context dumps, character context dumps, cascade-walking endpoints that take (shot, character, modality) and return the resolved bundle plus anchors, prompt templates that concatenate entity fields into formatted prompts for image-gen / voice-gen / etc.

The cascade defined in the character v2 redesign is the query model; endpoints implementing it cleanly are the natural Stream-3 deliverable once Stream-1 is done. A small set of cascade endpoints is also what an MCP server (next) would expose.

### MCP server

The Claude ↔ SCF MCP integration explored earlier fits here. A read-only MCP server fronting the cascade endpoints plus entity CRUD plus screenplay queries lets Claude work with an SCF project as a first-class authoring partner — querying, reading, suggesting, drafting. The existing FastAPI routes give about 80% of what an MCP would need; the wrapping work is small.

### Next entity clusters

Pulling from the deferred lists in the two redesign docs:

- **Costume bundle pattern.** Costumes (clean / damaged / variant-specific) are the obvious next recipient of the bundle / binding / variant / override recipe. Same generalization steps the prop/location doc spells out. Likely the first entity to go through the recipe as a *third* application, which will test whether the recipe really has hit format-primitive status.
- **Creature, vehicle.** Currently not first-class entities. Promoting them follows the same recipe.
- **Sequence Color Palette.** Completes the project → sequence → scene color inheritance chain. Small addition.
- **Prop Design (distinct from Prop).** The SSF spec separates identity from design intent (manufacturing details, visual inspiration). Currently folded into the prop entity; could be separated when the need arises.
- **Graphic Design.** In-world typography, signage, screen content, branded elements. Not yet modeled.
- **Camera Package / Lens Set / Lens.** Production-tier entities the SSF spec defines. Probably wait until there's a real production using them.

### Editorial / cut representation

Once footage is edited, an EDL relates clips to a final cut. Its own structural concern, not character or prop. Own design pass when first needed.

### Screenplay revisions versus corpus links

When a line gets rewritten after shooting, what happens to the clip pointing at the old `screenplay_line_id`? Not blocking current work, but worth thinking about before the format is used on long-running productions where revisions outlast shoots. Probably needs the same `parent_id` / `lifecycle_status` treatment as other versionable entities.

### OMC export

The `external_id` mechanism is in place. The actual mapping to OMC-JSON output is a companion spec, not part of the schema. Useful as a Stream-3 deliverable when there's a real production handoff to test against.

### Format-level versioning enforcement

The `_scf_meta.schema_version` field is defined in the convention. Tooling that reads SCF files needs to check it and either proceed, migrate, or refuse with a clear message. Worth getting in before the first time a file authored against one registry version is opened by a tool built against another.

---

## Open decisions

- **`entity_images` retirement strategy** (Stream 1D). Hard cutover versus phased.
- **Character variant redesign.** `duration_type` was removed because Temporary/Permanent wasn't sharp enough. The underlying distinction (life stage / alternate identity / situational state) needs a model before Tier 2 character variant authoring lands.
- **Tier 2 UI presentation.** Sub-sections on parent forms versus separate tree entries — likely a mixed approach, but the rule for "which is which" should be decided before building rather than per-entity.
- **Whether to formalize the bundle recipe as schema-level scaffolding.** A `subject=True` entity flag could auto-inject the standard `<subject>_variant`, `<subject>_asset_binding`, `<subject>_shot_override` counterparts. Probably premature — wait until costume goes through the recipe and decide whether the boilerplate is genuinely repetitive enough to abstract, or whether the parallel-by-convention approach is the right level of magic.
- **Plate corpus conventions.** Short pattern doc on dedicated plate shoots versus plates captured incidentally during principal photography. Useful but not blocking.
