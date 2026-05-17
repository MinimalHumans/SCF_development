# SCF Prop & Location Schema Redesign — Dual-Workflow Proposal (v1)

*Companion to the character v2 redesign (`20260513_SCF_Character_Schema_Redesign.md`). Extends the bundle pattern, the resolution cascade, and the workflow-state machinery from characters to props and locations. Like the character redesign, designed without backward compatibility constraints — schema break treated as inherent to the work.*

---

## Why this redesign

The character v2 redesign established a structural template — Identity / Asset Reference / Workflow State plus a shared Performance Corpus — and explicitly named props and locations as the next entities to receive the same treatment. The bundle entity already carries `surface` and `environment` as intent values waiting to be used. This document proposes the prop and location side.

Principled parity, not mechanical parity. Characters were driven by one animating tension: performance-first versus generation-first as competing workflows, with the cascade abstracting both. Props and locations share that abstraction but bring different secondary tensions of their own:

- **Props** sit on a *realization spectrum* (sourced / built / scanned / hybrid / generated_only). Hybrid combinations are common and varied — a practical gun with VFX muzzle flash, a scanned car with CG damage, a sourced object composited onto a plate-replaced background, a miniature combined with a partial practical build. The shot-level mid-state variability that earned `character_shot_override` its keep is rarer for props — they tend to have stable states per scene or per beat, not per shot. But continuity-state variation across scenes (the locket closed / open / broken) is a first-class concern.

- **Locations** sit on a *capture-vs-construction spectrum* (real_location / built / plate_captured / virtual_set / hybrid / generated_only). Plate photography is the location's natural "captured live" mode. Crucially, location state changes happen *between scenes*, not within them — the bar before and after the fight is two location_variants, not a per-shot override. Within a scene, location data is stable.

Both entities adopt the same cascade as characters but bind differently. Both gain a polymorphic anchor mechanism. Both stay out of the performance-corpus business — the existing corpus is shared infrastructure, not duplicated.

---

## What carries over unchanged

The character v2 redesign locked in a set of cross-cutting conventions. This redesign inherits them and the entities introduced here participate in them. Listed here for context, fully specified in `conventions.md`:

- **Versioning model.** `versionable=True` flag on `EntityDef` injects the five-field version chain (`parent_id`, `version_label`, `lifecycle_status`, `superseded_at`, `superseded_by_id`). Linear chains only, no branching, single active record per logical slot.
- **`lifecycle_status` enum.** `active` / `draft` / `superseded` / `deprecated` / `cut` / `archived`. Both `prop` and `location` adopt this in place of their existing `status` field (the values were already a subset).
- **Casing convention.** All enum values lowercase except for acronyms and proper nouns. Display layers capitalize for UI; stored values are canonical lowercase.
- **Reference fields.** Integer foreign keys, named `<target>_id`, target declared in `FieldDef.reference_entity`.
- **Preservation over deletion.** Lifecycle state transitions over physical deletion.
- **OMC posture.** Independent, not an OMC profile. Optional `external_id` / `external_id_namespace` on bridgeable entities. Both `prop` and `location` join the list of entities with `has_external_id=True`. The bridgeable-entities sentence in `conventions.md` should be updated to include `prop` and `location` as part of this redesign.

---

## Bundle pattern extensions

The `bundle` entity itself remains structurally unchanged. Two adjustments are needed to extend its reach.

### New intent value: `acoustic`

The current intent enum is `visual_identity`, `voice_identity`, `motion`, `behavior`, `performance`, `surface`, `environment`, `other`. Locations need a first-class modality for room tone, reverb impulse responses, ambient texture, and acoustic identity — distinct from `voice_identity` (which is character-vocal-specific) and from `environment` (which becomes the spatial/visual environmental reference). Adding `acoustic` cleanly closes that gap.

Final intent enum:

| Intent | Description | Typical entity |
|---|---|---|
| `visual_identity` | Face/body/object identity locking | character, prop |
| `voice_identity` | Voice cloning material | character |
| `motion` | Body/gesture data | character |
| `behavior` | Decision/reaction corpora, character LLM training | character |
| `performance` | Multimodal captured performance | character |
| `surface` | Material/texture detail | character, prop, location |
| `environment` | Spatial/visual environmental reference | location |
| `acoustic` | Room tone, reverb, ambience, acoustic identity | location |
| `other` | Escape hatch — flag for promotion | — |

The mapping above is illustrative, not enforced. A prop bundle with `intent = visual_identity` is legitimate; a character bundle with `intent = surface` (skin micro-detail) is the example the character redesign already used.

### `intended_consumers` becomes broader

The character redesign used `["image_gen", "video_gen", "voice_clone", "world_model"]` as example values. Prop and location bundles will commonly add `["material_gen", "shader_gen", "world_model", "environment_gen", "audio_ambience"]`. No schema change — `intended_consumers` is JSON, the values are guidance, not constraint.

---

## Shared performance corpus — no new entities

Characters earned their own corpus layer because characters are *performed*. Props and locations are not. They are either captured incidentally inside character takes (a prop in an actor's hand; a location framing a scene) or captured separately (a plate of a building; a 360 reference scan of a set). Both cases are already covered by existing corpus structures with one small addition.

**Plates as clips.** A location plate is a `clip` with `clip_type = atmospheric`. The enum already includes that value. No structural change.

**Plate-style takes.** A plate shoot is a `take` like any other. The `take_scene` junction can link it to one or many scenes (a wide establishing plate may cover many scenes set at that location). The existing `coverage_completeness = incidental` value on `take_scene` handles plates that catch a scene in passing.

**Featured props in takes.** New junction:

### `clip_prop` (junction)

| Field | Notes |
|---|---|
| `clip_id`, `prop_id` | required |
| `role_in_clip` | select: `featured`, `supporting`, `background` |
| `notes` | |

Parallel to `clip_character`. Trivially supports "every clip featuring the locket" queries — useful for both production review and for assembling training sets that lock prop identity across generation.

**No `clip_location` junction.** A clip already knows its scene (`clip.scene_id`), and a scene already knows its location (`scene.location_id`). The relationship is fully chained.

### Plate shoots and location capture: a note

A pure plate shoot — going out to a location without actors and capturing references and establishing material — is a corpus event. The author creates `take` records (one per plate) under the same `performance_corpus`, links each to scenes via `take_scene` with whatever completeness fits (often `incidental` for wide plates), and creates a `clip` per usable segment with `clip_type = atmospheric`. The `clip` is then available as a `source_clip_id` on a `shot_coverage` record where appropriate. Same structures, no new entities.

---

## Generalized anchor — `entity_anchor`

The existing `identity_anchor` is character-specific (typed `character_id`, optional typed `variant_id`). Anchors are otherwise structurally uniform: a pointer into a source asset with optional spatial/temporal scoping and a canonical-status field. Their purpose — mark known-good canonical references for both generation conditioning and QA verification — applies equally to props and locations.

Rather than create three near-identical entities, generalize.

### `entity_anchor` (renamed from `identity_anchor`)

| Field | Notes |
|---|---|
| `name` | display label |
| `subject_type` | select, required: `character`, `prop`, `location` |
| `subject_id` | integer, required (polymorphic reference into the named subject_type's table) |
| `subject_variant_id` | integer, optional (polymorphic — points at `character_variant`, `prop_variant`, or `location_variant` matching the subject_type) |
| `anchor_type` | select: `visual`, `audio`, `motion` |
| `asset_id` | required → asset |
| `frame_number` | optional |
| `timecode` | optional |
| `region_box` | json, optional |
| `region_label` | optional |
| `audio_offset_start_sec` | optional |
| `audio_offset_end_sec` | optional |
| `condition_description` | textarea |
| `physical_state` | text (character/prop) |
| `vocal_state` | text (character) |
| `environmental_state` | text (location — e.g. "midday clear", "post-rain dusk") |
| `canonical_status` | select: `verified`, `candidate`, `rejected` |
| `lifecycle_status` | standard enum |
| `notes` | textarea |

**Two-pattern polymorphism — why `subject_type` here, not `entity_type`.** The polymorphic reference naming in this entity is deliberately distinct from the existing `entity_type` + `entity_id` convention used in `asset_relationship`, `visual_motif_appearance`, `motif_manifestation`, and `thematic_connection`. Those represent **open polymorphism** — any registered entity could in principle be referenced, the discriminator's enum is open and grows as the schema does. The anchor's `subject_type` is **constrained polymorphism** — a hard, closed enum of three values (`character`, `prop`, `location`) that doesn't extend further. The naming difference signals the contract: tools encountering `subject_type` can switch on it exhaustively; tools encountering `entity_type` must handle values they may not recognize.

This is now a documented convention in `conventions.md` (updated as part of this redesign):
- **Open polymorphism:** field names `entity_type` (free text / open enum) + `entity_id` (integer).
- **Constrained polymorphism:** field names use role-specific naming with a hard closed enum. For the anchor: `subject_type` + `subject_id` + `subject_variant_id`. Future constrained-polymorphism entities adopt this pattern with their own role-appropriate prefix.

No existing entities need renaming — the existing four uses are genuinely open polymorphism, and the new anchor is genuinely constrained, so each lands in its right convention.

State filters become *subject-aware*: `physical_state` applies for character and prop; `vocal_state` only for character; `environmental_state` only for location. The fields are all optional and only the relevant ones get populated. Tools filtering by subject_type already know which state fields are meaningful.

**Migration note.** Anchors previously created against characters keep working — the rename is a column/field rename plus the addition of `subject_type = "character"` to existing rows. Treated as a schema break in the same wave as the rest of this redesign.

---

## Prop redesign

### `prop` (slimmed, option c)

Current prop carries: identity (name, prop_type, description), narrative (narrative_significance, story_function, associated_character), a Physical tab (material, size, color, condition, physical_notes), and a Story tab (first_appearance, key_moments, symbolism). The slim moves the Physical tab into a new `prop_surface_profile`. Everything else stays.

**Survives:**
- `name`, `prop_type`, `description`
- `narrative_significance`, `story_function`, `associated_character`
- Story tab: `first_appearance`, `key_moments`, `symbolism`, `notes`

**Removed (now lives in `prop_surface_profile`):**
- `material`, `size`, `color`, `condition`, `physical_notes`

**Modified:**
- `status` → renamed to `lifecycle_status` (uses the standard enum). Existing values map cleanly.

**Added:**

| Field | Type | Notes |
|---|---|---|
| `realization_status` | select | `tbd`, `sourced`, `built`, `scanned`, `hybrid`, `generated_only`. Signals how this prop is realized in the production. Drives downstream tool expectations. |
| `external_id` | text | Optional. For OMC and other external bridging. |
| `external_id_namespace` | text | Optional. |

The `hybrid` value covers any prop realized through multiple combined methods. A practical gun with VFX muzzle flash. A scanned car with CG damage. A practical creature head with a CG body extension. A sourced object composited onto a plate-replaced background. A miniature combined with a partial practical build. The schema doesn't enumerate the specific combination — that detail lives in the prop's description, in bundle provenance, and in any `prop_shot_override` records. Tools resolving prop visual identity for a hybrid prop typically pull both captured material *and* the relevant bundles, layered.

### `prop_surface_profile` (NEW, Tier 2)

The new Tier 2 description entity, parallel in role to `character_appearance_profile`. Holds the descriptive physical baseline that bundles will reference media against.

| Field | Notes |
|---|---|
| `name` | display label |
| `prop_id` | required → prop |
| `material` | text — primary material (e.g. "Tarnished silver", "Worn leather") |
| `secondary_materials` | text |
| `size` | text |
| `weight_impression` | text (e.g. "heavier than it looks", "deceptively light") |
| `primary_color_hex` | text, tab=Color |
| `primary_color_name` | text, tab=Color |
| `secondary_colors` | json, tab=Color |
| `surface_finish` | select, tab=Surface — `matte`, `satin`, `gloss`, `worn`, `polished`, `pitted` |
| `texture_quality` | textarea, tab=Surface |
| `baseline_condition` | text, tab=Condition — the prop's default state. State changes belong in `prop_variant`. |
| `wear_pattern` | textarea, tab=Condition |
| `aging_notes` | textarea, tab=Condition |
| `visual_distinction` | textarea, tab=Identity — the silhouette / shorthand of this prop |
| `lifecycle_status` | standard enum |
| `notes` | textarea |

Note the `condition` field on prop is replaced by two ideas: a `baseline_condition` on the surface profile (the default state), and `prop_variant` records (alternate states). The split mirrors how character description and character_variant relate.

### `prop_variant` (NEW, Tier 2)

Parallel to `character_variant`. Represents an alternate state of the same prop — the locket open versus closed versus broken, the gun clean versus fired versus blood-spattered, the letter folded versus crumpled versus torn.

| Field | Notes |
|---|---|
| `name` | required, e.g. "Locket — open" |
| `prop_id` | required → prop |
| `physical_differences` | textarea — what's different from baseline |
| `state_trigger` | textarea — what causes this variant to appear |
| `context` | textarea — when/where in the story this variant manifests |
| `lifecycle_status` | standard enum |
| `notes` | textarea |

Conceptually replaces what was previously buried in prop.condition (free text) and ad-hoc descriptions inside scene_prop.usage_note. Continuity tools can now query the prop's variant history through the story.

### `prop_asset_binding` (NEW, Tier 2)

Parallel to `character_asset_binding`. Applies a bundle to a prop under specific conditions.

| Field | Notes |
|---|---|
| `name` | display label |
| `prop_id` | required → prop |
| `bundle_id` | required → bundle |
| `is_baseline` | boolean, default false — true for the unconditional default |
| `precedence` | integer, default 0 — higher wins on conflict |
| `variant_id` | optional → `prop_variant` (tab=Conditions) |
| `scene_range_start_id` | optional → scene (tab=Conditions) |
| `scene_range_end_id` | optional → scene (tab=Conditions) |
| `act_id` | optional → act (tab=Conditions) |
| `conditions_json` | json, tab=Conditions — catch-all |
| `lifecycle_status` | standard enum |
| `notes` | textarea |

A prop typically has fewer bindings than a character: a baseline visual identity bundle, possibly a surface bundle for material detail, and one or more variant-specific bundles (the broken locket has its own visual reference set).

### `prop_shot_override` (NEW, versionable, Tier 2)

Parallel to `character_shot_override`. Per-prop deviation for a specific shot. Single active record per (shot, prop). Versionable for history preservation.

Included for **structural parity** with characters, even though use will be rarer. The cases where this earns its keep are mid-shot state transitions (the gun firing, the locket falling open during the shot, the letter being torn) where the prop's state changes within a captured or generated shot in a way that needs explicit recording.

| Field | Notes |
|---|---|
| `name` | display label |
| `shot_id` | required → shot |
| `prop_id` | required → prop |
| `override_types` | multiselect: `state_change`, `damage`, `transformation`, `vfx_enhancement`, `other` |
| `bundle_override_id` | optional → bundle — use instead of cascade |
| `variant_target_id` | optional → `prop_variant` |
| `visual_delta` | textarea, tab=Deltas |
| `surface_delta` | textarea, tab=Deltas — material/finish deviation |
| `motion_delta` | textarea, tab=Deltas — how it moves/breaks in this shot |
| `progression_axis` | text, tab=Progression — same generalized progression pattern as characters |
| `progression_value` | float 0-1, tab=Progression |
| `notes` | textarea |
| *(versionable fields)* | auto-injected: `parent_id`, `version_label`, `superseded_at`, `superseded_by_id` |

Constraint: at most one record per (shot_id, prop_id) with `lifecycle_status = active`. Same single-active-record invariant as character overrides.

---

## Location redesign

### `location` (slimmed aggressively)

Locations already have a populated Tier 2 layer: `location_design` (architecture, materials, spatial layout, lighting sources), `location_color_scheme` (dominant colors, atmosphere, intensity), `location_sound_profile` (room tone, reverb, ambience), and `location_variant` (modified states). The current location base entity duplicates significant portions of each. This is the same problem character had pre-redesign, and the answer is the same: slim the base, move descriptive fields to the Tier 2 entities where they properly belong.

**Survives:**
- `name`, `location_type` (interior / exterior / int_ext / virtual / abstract), `time_period`, `geography`
- `setting` (high-level narrative description of what the place is)
- `key_features` (top-level enumeration — distinct from set_dressing)
- `notes`

**Removed (moved to existing Tier 2 entities):**
- Atmosphere tab — `mood`, `lighting`, `color_palette`, `time_of_day`, `weather` → `location_design` (for architectural lighting context) and `location_color_scheme` (for color). The `time_of_day` and `weather` fields specifically should move to `location_variant` where they belong as state axes — see note below.
- Sound tab — `ambient_sound`, `sound_notes` → `location_sound_profile`. Already exists, currently underused because the base entity duplicates its purpose.
- `props_present` — was always a stopgap; the `scene_prop` junction and (where appropriate) `set_dressing` cover this properly.

**Modified:**
- `status` → renamed to `lifecycle_status`. (Note: the existing schema doesn't currently have a `status` field on location, but Phase 1C is expected to align this. This redesign assumes the lifecycle_status injection happens as part of the wave.)

**Added:**

| Field | Type | Notes |
|---|---|---|
| `realization_status` | select | `tbd`, `real_location`, `built`, `plate_captured`, `virtual_set`, `hybrid`, `generated_only`. |
| `external_id` | text | Optional. For OMC bridging. |
| `external_id_namespace` | text | Optional. |

The `hybrid` value mirrors the prop enum and covers any location realized through multiple combined methods: a practical set with a CG extension, a plate-captured exterior with a matte-painted skyline, a virtual_set LED wall combined with a built foreground, a real location with significant set-dressing replacement, a built interior with plate replacement through the windows. The schema doesn't enumerate which methods are combined — that lives in the location description, the bundle provenance, and any `location_shot_override` records. Tools resolving location visual for a hybrid location typically pull both captured material *and* the relevant bundles, layered.

`real_location` covers fully practical realization — a found place shot in-camera as the actual location. Normal production interventions (lighting, set dressing, atmospheric smoke, replaced signage) don't disqualify a location from `real_location`; the distinction is whether the location itself is found-and-shot versus built / virtual / generated. The line between `real_location` and `hybrid` is whether digital augmentation is significant enough that downstream tools need to know about it.

### Note on time_of_day, weather, and lighting state

These three axes currently sit on the location base entity (or duplicated across Tier 2 entities) and serve as both "default" and "variant" simultaneously, which is muddled. The clean answer:

- A location's *typical* time-of-day, lighting, and weather belong on a baseline `location_variant` (with `is_baseline = true` — see proposal below).
- *Alternate* time-of-day, lighting, and weather become additional `location_variant` records.
- `scene.time_of_day`, `scene.weather_conditions`, `scene.season` remain — those are scene-specific facts about when the scene happens. A scene set in a location at night uses the night variant of the location.

This is a small redesign of `location_variant` to support the variant pattern more cleanly:

**`location_variant` modifications:**

Add `is_baseline` (boolean, default false) so that exactly one variant per location can be marked as the unconditional default. Add structured state fields for the dimensions that previously lived ad-hoc:

| Added field | Notes |
|---|---|
| `is_baseline` | boolean, default false |
| `time_of_day` | select: `dawn`, `morning`, `midday`, `afternoon`, `dusk`, `night`, `varies` |
| `weather` | text |
| `season` | select: `spring`, `summer`, `autumn`, `winter`, `unspecified` |
| `post_event_state` | text — e.g. "after the fire", "during the festival", "abandoned" |

Existing fields (`physical_differences`, `lighting_differences`, `emotional_shift`, `time_context`) stay.

### `location_asset_binding` (NEW, Tier 2)

Parallel to `character_asset_binding` and `prop_asset_binding`. Conditions on variant and scene range as the others, plus a couple of location-specific filters that earn their place.

| Field | Notes |
|---|---|
| `name` | display label |
| `location_id` | required → location |
| `bundle_id` | required → bundle |
| `is_baseline` | boolean, default false |
| `precedence` | integer, default 0 |
| `variant_id` | optional → `location_variant` (tab=Conditions) |
| `scene_range_start_id` | optional → scene (tab=Conditions) |
| `scene_range_end_id` | optional → scene (tab=Conditions) |
| `act_id` | optional → act (tab=Conditions) |
| `time_of_day_filter` | optional text (tab=Conditions) — matches scene.time_of_day for bindings scoped to specific times |
| `conditions_json` | json, tab=Conditions |
| `lifecycle_status` | standard enum |
| `notes` | textarea |

A typical location will have several bindings: a baseline `environment` bundle (the spatial/visual default), a baseline `acoustic` bundle (room tone), often a separate `surface` bundle (material details for the architecture), and variant-scoped versions of any of those for night, post-event states, etc.

### `location_shot_override` (NEW, versionable, Tier 2)

Per-shot deviation for a specific location. Single active record per (shot, location). Versionable.

Included for **structural parity** with characters and props, with the explicit expectation it will be rare in practice. Most location deviations live at the scene level (and are handled by `location_variant` plus binding scope). The cases where shot-level override does earn its keep: a single shot in a scene needs a CG element added to the existing location (a magical creature appears in the corner of the room), or a particular shot needs the extension area treated differently from the rest of the scene (a wider crane shot reveals territory not covered by other shots).

| Field | Notes |
|---|---|
| `name` | display label |
| `shot_id` | required → shot |
| `location_id` | required → location |
| `override_types` | multiselect: `extension_change`, `lighting_change`, `weather_change`, `vfx_addition`, `other` |
| `bundle_override_id` | optional → bundle |
| `variant_target_id` | optional → `location_variant` |
| `visual_delta` | textarea, tab=Deltas |
| `acoustic_delta` | textarea, tab=Deltas |
| `lighting_delta` | textarea, tab=Deltas |
| `progression_axis` | text, tab=Progression |
| `progression_value` | float 0-1, tab=Progression |
| `notes` | textarea |
| *(versionable fields)* | auto-injected |

Same single-active-record constraint as character and prop overrides.

---

## The resolution cascade per entity

The character cascade has five steps walked per-modality. Props and locations adopt the same shape with entity-appropriate substitutions. Stated explicitly:

### Prop cascade

A tool generating prop visual for shot 47C walks:

1. Check `prop_shot_override` for (47C, prop, active). If `bundle_override_id` set and bundle `intent` matches the requested modality, use it.
2. Check `shot_coverage` for shot 47C. If `coverage_state = captured_live` and `source_clip_id` set, and the captured clip provides usable data for this modality (visual capture for visual generation, sync audio for any audio-modality prop reference), pull from the clip. For props on a `hybrid` realization, this step typically *partially* short-circuits — the captured material covers the practical/captured portion; bundles via step 3 cover whatever's combined on top.
3. Resolve `prop_asset_binding` for the prop, filtered by scene 47, variant (if specified), active status, and bundle `intent` matching the modality. Pick highest-precedence match.
4. Fall back to bindings with looser scope: drop scene range, then variant filter, fall to `is_baseline=true`.
5. For verification, pull `entity_anchor` records where `subject_type = "prop"`, `subject_id` matches, `canonical_status = verified`, and `lifecycle_status = active`.

### Location cascade

A tool generating location visual for shot 47C walks:

1. Check `location_shot_override` for (47C, location, active). If `bundle_override_id` set and bundle `intent` matches the requested modality, use it. (Expected to be rare.)
2. Check `shot_coverage` for shot 47C. If `coverage_state = captured_live`, use the source clip. For `coverage_state = hybrid_live_plate` (existing enum value, exactly the location-hybrid case), the plate is the foundation and bundles via step 3 cover the extension. The exact split between plate and extension is described in `shot_coverage.generation_required` and elaborated in any active `location_shot_override`.
3. Resolve `location_asset_binding` for the location, filtered by the scene's act, scene range, variant matching scene's time-of-day/weather/state, active status, and bundle `intent` matching the modality. Pick highest-precedence match.
4. Fall back: drop time-of-day filter, then variant filter, fall to `is_baseline = true`.
5. For verification, pull `entity_anchor` records where `subject_type = "location"`, `subject_id` matches, `canonical_status = verified`.

The per-modality split applies the same way: an audio tool generating ambience for a scene walks for `intent = acoustic` bundles, independent of whatever a visual tool resolves. A `hybrid` prop or `hybrid` location will commonly land at *both* step 2 (the captured material) and step 3 (the supplementing bundle) and the tool layers the two — same composition pattern characters use for captured-with-override shots.

### Inheritance and scene-level resolution for locations

One additional consideration: a location's cascade is normally evaluated *per scene*, not per shot, because location data is stable across the shots of a scene. Tools doing scene-level work (set previs, ambience layout) walk the cascade with the scene's location and variant, not a specific shot. Tools doing shot-level work (final image generation, shot-specific environment) still walk the cascade with the shot context, which falls through naturally to scene-level binding resolution. The cascade doesn't change — only the context the tool walks with does.

---

## Worked example — Arcadia sheriff's office

A small worked example demonstrating prop and location use together. Pulled from the same Arcadia / Snapper / Hannah interrogation scene the character workflows doc used in Scenarios 4 and 5.

**Location: Sheriff's Office (scene 23, daytime; scene 31, nighttime after fight).**

```
location:
  name = "Carbon Crossing Sheriff's Office"
  location_type = "interior"
  setting = "Single-room frontier sheriff's office, jail cell at the back. ..."
  time_period = "1882"
  geography = "Carbon Crossing, Oregon Territory"
  realization_status = "hybrid"  // shot at Babelsberg + CG window/courtyard extension
  lifecycle_status = "active"
```

```
location_variant (baseline):
  name = "Sheriff's Office — midday"
  location_id = sheriffs_office
  is_baseline = true
  time_of_day = "midday"
  weather = "clear"
  season = "summer"
  post_event_state = null
  lifecycle_status = "active"

location_variant:
  name = "Sheriff's Office — post-fight night"
  location_id = sheriffs_office
  is_baseline = false
  time_of_day = "night"
  weather = "drizzle"
  post_event_state = "broken window, overturned desk, blood on the floor"
  lifecycle_status = "active"
```

Three bundles bound:

```
bundle: "Sheriff's Office — environment baseline"  // intent: environment
bundle: "Sheriff's Office — surface details"       // intent: surface
bundle: "Sheriff's Office — interior acoustic"     // intent: acoustic

location_asset_binding (×3):
  is_baseline = true for each
  precedence = 0
```

A separate variant-scoped binding for the post-fight night version:

```
bundle: "Sheriff's Office — post-fight night environment"  // intent: environment

location_asset_binding:
  location_id = sheriffs_office
  bundle_id = post-fight-night-environment
  variant_id = post_fight_night
  precedence = 10
```

**Prop: Sheriff's Star Badge.**

```
prop:
  name = "Sheriff Riley's star badge"
  prop_type = "hand prop"
  description = "Six-point silver star, deputy-of-the-territory standard issue, dented."
  realization_status = "sourced"
  lifecycle_status = "active"

prop_surface_profile:
  prop_id = sheriff_badge
  material = "tarnished silver"
  size = "palm-sized, 2.5 inches across"
  primary_color_hex = "#9C9489"
  primary_color_name = "tarnished silver"
  surface_finish = "worn"
  texture_quality = "fine engraving worn smooth at points by decades of pocket-handling"
  baseline_condition = "dented at one point, scratched across the face"
  visual_distinction = "one of six points slightly bent"
  lifecycle_status = "active"

prop_variant:
  name = "Sheriff's badge — blood-darkened"
  prop_id = sheriff_badge
  physical_differences = "dried blood across the face, dulling the engraving"
  state_trigger = "the bar fight in scene 31"
  context = "Scene 31 onward through end of Act 2"
```

Two bundles bound — the clean baseline (sourced and photographed on shoot) and the blood-darkened variant (CG enhancement over the same physical prop):

```
prop_asset_binding (baseline):
  prop_id = sheriff_badge
  bundle_id = badge_clean_visual
  is_baseline = true
  precedence = 0

prop_asset_binding (variant):
  prop_id = sheriff_badge
  bundle_id = badge_blood_darkened_visual
  variant_id = blood_darkened
  scene_range_start_id = scene_31
  precedence = 10
```

In scene 47C the badge is on Snapper's coat. The captured clip contains the badge along with Snapper. A tool generating the prop's visual walks the cascade:

1. No `prop_shot_override` for (47C, badge). → step 2.
2. `shot_coverage` for 47C: `coverage_state = hybrid_generated_extension` (the transformation-overlay shot from character Scenario 6), `source_clip_id` set. Captured clip contains the badge. → step 2 partially short-circuits: the captured material is the baseline answer.
3. But scene 47 is in Act 2 post-fight, so the blood-darkened binding (`scene_range_start_id = scene_31`, matches scene 47) is also active. → step 3 contributes the blood-darkened bundle for the overlay.

The tool composes: captured badge from the live clip + blood-darkened surface treatment from the bundle. Same composition pattern as character's hybrid shots.

---

## Generalization signal

The bundle-binding-anchor-override pattern is now exercised by three different entity types — character, prop, location — with the same structural shape and different binding-condition fields. The fourth and fifth entity types likely to receive it eventually (with deeper redesigns): costume (clean / damaged / specific scene versions) and possibly creature/vehicle if those become first-class entities. Each would follow the same recipe:

1. Slim the base entity to identity + narrative function (where descriptive duplication exists).
2. Add `lifecycle_status` and `external_id` if appropriate.
3. Add a realization-status enum naming the production-realization spectrum.
4. Create or recognize Tier 2 description entities as the descriptive home.
5. Create `<entity>_variant` for state variation.
6. Create `<entity>_asset_binding` with entity-appropriate condition filters.
7. Create `<entity>_shot_override` (versionable, single-active per (shot, entity)).
8. Anchors handled by the polymorphic `entity_anchor`.
9. Cascade walks the same five steps with entity-appropriate substitutions.

The recipe is now the format primitive.

---

## What's deliberately deferred

Held back for subsequent passes — the goal of this draft is to lock the structural proposal:

- **Costume bundle pattern.** Costumes (clean / blood-spattered / variant) are the next obvious candidate. Separate redesign pass.
- **Migration mechanics.** No back-compat machinery, treated as a schema break in the same wave as the character v2 changes. The 1C cleanup sweep handles the location atmosphere/sound field migrations.
- **Worked-examples companion document.** The character v2 design got a full Workflows companion (`20260513_SCF_Character_Schema_Workflows.md`) with ten scenarios. A parallel prop/location workflows document is the next deliverable after structural sign-off.
- **OMC mapping table.** Same posture as character v2 — external_id mechanism in place, mapping is a companion doc, not in the schema.
- **Registry-ready Python.** Field-by-field `EntityDef` definitions, tab assignments, options lists, and SQL implications come after the structural shape is approved.
- **Editor UI implications.** Particularly the Reference tab (currently bound to `entity_images` which is the primitive bundle-like system) — retiring `entity_images` in favor of bundles is a separable transition.
- **Plate corpus conventions.** A short pattern document on how to model dedicated plate shoots versus plates captured incidentally during principal photography — useful but not blocking.

---

## Decisions locked in this draft

For reference, the eight decisions from our pre-draft discussion as implemented:

1. **Performance corpus stays one shared layer.** `clip_prop` junction added. No `clip_location`. Plates as `clip_type = atmospheric`.
2. **Location aggressively slimmed; prop option (c).** Location atmosphere/lighting/color/sound fields move to existing Tier 2 entities. Prop gets one new Tier 2 (`prop_surface_profile`) and the Physical-tab fields move there; rest of prop stays.
3. **`acoustic` added to bundle intent enum.** `surface` and `environment` already present; the trio now covers location's three primary modalities.
4. **`prop_variant` added.** `location_variant` extended with `is_baseline`, structured state fields.
5. **Polymorphic `entity_anchor`.** Replaces `identity_anchor`. Uses `subject_type` + `subject_id` + `subject_variant_id` (constrained polymorphism — closed enum of three values), deliberately distinct from the open-polymorphism `entity_type` + `entity_id` convention used elsewhere in the schema. Two-pattern polymorphism documented in `conventions.md` as part of this redesign.
6. **Entity-specific bindings and overrides.** `prop_asset_binding`, `prop_shot_override`, `location_asset_binding`, `location_shot_override`. The location override is kept for parity despite rare use.
7. **Realization-status enums aligned across entities.** Props: `tbd / sourced / built / scanned / hybrid / generated_only`. Locations: `tbd / real_location / built / plate_captured / virtual_set / hybrid / generated_only`. Both entities use a single `hybrid` value for "combined methods" rather than naming specific combinations; the specifics live in description fields, bundle provenance, and override records.
8. **`clip_prop` junction added.** No `clip_location`.
