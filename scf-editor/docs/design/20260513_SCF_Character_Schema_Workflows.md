# SCF Character Schema — Workflows in Practice

*Companion to the v2 redesign document. Each scenario walks through a concrete situation in the life of an SCF project, activating specific parts of the character schema. Together, the scenarios cover every entity, field group, and convention introduced in the redesign. Arcadia (a western with werewolves set in 1880s Oregon, protagonist Snapper Cade) is the running example.*

The scenarios are ordered chronologically from a project's perspective: a project that starts in early development, accumulates pre-vis material, transitions through casting and a shoot, and ends in post with handoff to a production vendor. You don't have to read them in order — each one notes what schema pieces it demonstrates — but they build on one another, and a later scenario will sometimes reference a record created in an earlier one.

## Notational convention

All `*_id` fields in the schema are **integer foreign keys**, not strings. The actual stored value is an integer pointing at a row in the referenced entity's table. This matters because integer IDs are stable across name changes — if "Snapper Cade" gets renamed to "Cade Reilly" mid-project, only `character.name` changes, and every reference (`character_id` in bundles, anchors, overrides, junctions) stays valid because the integer id is unchanged.

For readability in this document, the code blocks use shorthand names instead of literal integer values. So `character_id = Snapper` should be read as "the integer id of the character record whose name is currently Snapper." The first time a record is introduced in a scenario, the shorthand is what gives it identity. The format stores an integer.

---

## Scenario 1 — Project setup and character authoring

**Activates:** `project`, `project.workflow_mode`, `project.production_status`, slimmed `character` entity, `character.casting_status`, `character.lifecycle_status`, Tier 2 description entities (`physical_character_profile`, `vocal_profile`, `character_appearance_profile`), the lifecycle_status taxonomy in its simplest form.

It's early development on Arcadia. No actors cast, no shoot planned yet. You're writing, and you'll use some generative pre-vis to support the writing process. Your tool creates the project:

```
project:
  name = "Arcadia"
  workflow_mode = "generation_first"
  production_status = "development"
  lifecycle_status = "active"
```

You start authoring the protagonist. The character entity is now lean — it carries identity, narrative function, and backstory only:

```
character:
  name = "Snapper Cade"
  role = "protagonist"
  archetype = "Reluctant Wolf, Haunted Man"
  age = "42"
  gender = "male"
  pronouns = "he/him"
  occupation = "Pinkerton detective, formerly Confederate scout"
  summary = "..."
  backstory = "Born Tennessee 1838. Confederate scout, ..."
  motivation = "..."
  flaw = "Will not look at what he's become"
  arc_description = "..."
  internal_goal = "..."
  external_goal = "..."
  greatest_fear = "..."
  core_belief = "Some kinds of wrong can't be put right"
  casting_status = "tbd"
  lifecycle_status = "active"
```

Note what's *not* on the character anymore. No height, build, hair color, eye color. No voice quality, accent, vocal habits. No wardrobe notes. Most of those have moved to Tier 2 entities where they live properly (physical, vocal, appearance, costume). Color associations have moved further out — to Tier 4 (Thematic Tracking), in `character_color_identity` — because color identity is a directorial/thematic choice, not a fundamental character property. See the note further down.

You author the Tier 2 description entities. Each is descriptive — what you intend, not what you have:

```
physical_character_profile:
  character_id = Snapper
  posture = "upright but heavy"
  center_of_gravity = "low"
  tension_level = "contained"
  energy_quality = "still"
  movement_speed = "deliberate"
  movement_weight = "heavy"
  lifecycle_status = "active"

vocal_profile:
  character_id = Snapper
  pitch_range = "low"
  timbre = "gravelly"
  pace = "slow"
  articulation = "drawled"
  regional_markers = "Tennessee, eastern"
  class_markers = "rural, undereducated"
  filler_words = ["I reckon", "well now"]
  verbal_tics = ["clears throat before lying", "trails off when unsure"]
  lifecycle_status = "active"

character_appearance_profile:
  character_id = Snapper
  body_type = "tall and heavy, weight settled"
  age_appearance = "early 40s, weathered"
  visual_distinction = "scar across left forearm; left eye slightly hooded"
  silhouette_description = "wide shoulders, slight forward lean, long coat that sweeps"
  visual_shorthand = "the man at the edge of the bar who hasn't looked up"
  lifecycle_status = "active"
```

That's the identity layer fully populated. Nothing here references media — these are pure descriptions of what Snapper is meant to look, sound, and move like. Generation tools can read this directly and produce reasonable output. The reference media comes in Scenario 2.

You may notice the absence of any color identity for Snapper at this stage. The `character_color_identity` entity lives in Tier 4 (Thematic Tracking), not Tier 2 (Character Depth), because color identity is a directorial choice about how a character manifests visually — closer to thematic motif than to fundamental character description. If Arcadia leans into color as a thematic device (the wolf-color earth-tone palette around Snapper, say), that decision gets authored later in Tier 4 alongside other color entities. The character itself is complete without it.

**Note on the status taxonomy in this scenario:** `project.production_status = "development"` tracks the project's production phase (orthogonal to lifecycle). `project.lifecycle_status = "active"` tracks the project record's currency. `character.lifecycle_status = "active"` tracks Snapper's currency in the work. Three different axes, three different fields, all populated here for clarity. The character entity has no `status` field — that field name is reserved for the writing-process axis on scene/act/sequence, which Snapper isn't.

---

## Scenario 2 — The first identity reference (bundles, bindings, anchors)

**Activates:** `asset` references, `bundle` (intent=visual_identity, format_hints, intended_consumers, provenance), `bundle_asset` junction with role_in_bundle, `character_asset_binding` with is_baseline, `identity_anchor` (visual type, region_box, region_label, canonical_status), the resolution cascade resolving at step 3.

You want to start generating pre-vis frames of Snapper. The Tier 2 description gets you part of the way, but you need actual reference imagery for the generator to lock onto a consistent look.

You curate 16 reference images — a mix of AI-generated test renders that captured the right "type" and a few photo studies you commissioned. You upload them as assets:

```
asset (×16):
  name = "snapper-ref-001.png"
  file_path = "sourcefiles/snapper/snapper-ref-001.png"
  file_type = "image"
  resolution = "2048x2048"
  lifecycle_status = "active"
  approval_status = "wip"
```

You group them into a bundle:

```
bundle:
  name = "Snapper — baseline visual"
  intent = "visual_identity"
  version_label = "v1"
  description = "Initial reference set establishing Snapper's appearance"
  coverage_summary = "8 angles (front, 3/4 L/R, profile L/R, back, 3/4 back L/R), two lighting conditions (high sun, indoor lamp), expression matrix: neutral × 8, smile × 2, anger × 2, exhaustion × 2, brooding × 2"
  format_hints = {
    "frame_count": 16,
    "view_angles_covered": ["front", "3/4-L", "3/4-R", "profile-L", "profile-R", "back", "3/4-back-L", "3/4-back-R"],
    "lighting_conditions": ["high_sun", "indoor_lamp"],
    "expressions": ["neutral", "smile", "anger", "exhaustion", "brooding"],
    "resolution_max": 2048
  }
  intended_consumers = ["image_gen", "video_gen"]
  provenance = "Curated mix of generated test renders and photo studies. Assembled March 2026."
  parent_id = null
  lifecycle_status = "active"
```

You connect each asset to the bundle, recording its role:

```
bundle_asset:
  bundle_id = Snapper-baseline-visual
  asset_id = snapper-ref-001
  role_in_bundle = "front view neutral, high sun"
  order = 1

  ... (×16 entries, each with descriptive role_in_bundle)
```

The bundle now exists, but it's not yet *attached* to Snapper. That's the binding's job:

```
character_asset_binding:
  name = "Snapper baseline visual"
  character_id = Snapper
  bundle_id = Snapper-baseline-visual
  is_baseline = true
  precedence = 0
  lifecycle_status = "active"
  (no variant_id, no state filters, no scene range — it's the unconditional default)
```

You also mark three of the 16 frames as canonical identity anchors. These are the "this is unimpeachably him" reference points used both for ID-conditioning during generation and for QA verification of generated output:

```
identity_anchor:
  name = "Snapper front neutral verified"
  character_id = Snapper
  anchor_type = "visual"
  asset_id = snapper-ref-001
  region_box = {x: 420, y: 180, w: 480, h: 600}
  region_label = "face and shoulders"
  condition_description = "Neutral expression, even lighting, 3/4 distance"
  physical_state = "rested"
  vocal_state = null
  canonical_status = "verified"
  lifecycle_status = "active"
```

Two more anchors created for 3/4 view and profile, each with their own region_box. The source asset is never cropped or modified — `region_box` describes how to interpret it, leaving the original information intact.

**The cascade in action.** A pre-vis tool now generates Snapper for scene 12 (a wide shot, no special conditions):

1. Check `character_shot_override` for (scene 12 shot, Snapper, active) → none exists, fall through.
2. Check `shot_coverage` for the shot → state is "generated" (project is generation_first), no source clip to short-circuit on, fall through.
3. Resolve `character_asset_binding` for Snapper filtered by scene 12, variant null, no states. Find "Snapper baseline visual" — `is_baseline=true` matches, no conflicting filters. Return that bundle.
4. (Step 4 fallback unnecessary — step 3 resolved.)
5. For verification, pull `identity_anchor` records for Snapper where canonical_status=verified, lifecycle_status=active. Return the three anchors.

The tool reads `bundle.intended_consumers`, sees `image_gen`, knows the bundle is appropriate. It walks `bundle_asset` to find the 16 assets and their roles. It pulls the three identity_anchors for face comparison after generation. None of this required the format to know what tool was consuming the data or what technique it used internally.

---

## Scenario 3 — Variants and conditional bindings

**Activates:** `character_variant`, additional `bundle` records, `character_asset_binding` with `variant_id` and `precedence`, the cascade resolving by specificity.

Arcadia has flashbacks to Snapper as a young Confederate scout. The visual is different enough that you need a separate reference set.

You create a variant:

```
character_variant:
  name = "Snapper — Young (1865)"
  character_id = Snapper
  physical_differences = "Same height. Less weight (around 185 lbs). Cleaner shaven. Less weathered skin. Posture not yet collapsed."
  emotional_state = "Still believing. Pre-disillusionment."
  context = "Flashbacks to wartime, 1864-1865"
  lifecycle_status = "active"
```

You curate a new set of reference images for the young Snapper — 8 frames covering similar angles but with the leaner physicality and period-correct facial hair:

```
bundle:
  name = "Snapper Young — visual"
  intent = "visual_identity"
  version_label = "v1"
  coverage_summary = "8 angles of Snapper at 24-25, in Confederate uniform. Cleaner skin, full beard, less weight, upright posture."
  format_hints = {
    "frame_count": 8,
    "view_angles_covered": ["front", "3/4-L", "3/4-R", "profile-L", "profile-R", "back", "high-angle", "low-angle"],
    "lighting_conditions": ["high_sun", "campfire"],
    "expressions": ["neutral", "watchful", "exhausted"],
    "resolution_max": 2048
  }
  intended_consumers = ["image_gen", "video_gen"]
  parent_id = null
  lifecycle_status = "active"
```

The bundle is connected to its assets via `bundle_asset` (same pattern as before), and bound to Snapper *conditionally* on the variant:

```
character_asset_binding:
  name = "Snapper Young visual"
  character_id = Snapper
  bundle_id = Snapper-Young-visual
  variant_id = Snapper-Young
  is_baseline = false
  precedence = 10
  lifecycle_status = "active"
```

Note: precedence 10 vs the baseline's precedence 0. When both bindings are eligible, the higher-precedence one wins.

**Cascade behavior with variants.** Tool generates Snapper for shot 38 (a flashback, your screenplay/tool indicated variant=Snapper-Young when invoking generation):

1. No override → step 2.
2. shot_coverage state=generated → step 3.
3. Bindings filtered by Snapper, variant=Snapper-Young: two candidates match.
   - "Snapper Young visual" — variant_id matches, precedence 10
   - "Snapper baseline visual" — is_baseline=true (always matches as fallback), precedence 0
4. Higher precedence wins: Snapper-Young-visual returned.

Shot 12 (no variant indicated): the same lookup excludes "Snapper Young visual" because its variant_id filter doesn't satisfy. Only "Snapper baseline visual" matches. The cascade resolves correctly without variant overhead.

This is the binding system's main payoff: declaring conditions instead of duplicating characters. Snapper is one character with multiple references that surface contextually.

---

## Scenario 4 — The shoot brings the corpus online

**Activates:** `workflow_mode` transition, `actor`, `actor_character_role`, `performance_corpus`, `take`, `take_scene` junction, `clip`, `clip_character` junction, linkage to `screenplay_lines`, `casting_status` update.

Eighteen months of writing and pre-vis pass. You lock the screenplay. The project moves to pre-production, then to a two-week shoot in Berlin: stage at Studio Babelsberg for interiors, Brandenburg locations for exteriors. The workflow stance shifts:

```
project:
  workflow_mode = "hybrid"  // was "generation_first"
```

Actors are cast. You create their records — minimal, story-relevant only:

```
actor:
  name = "Markus Reinhardt"
  notes = "Principal cast for Snapper. Tennessee accent coach: ..."
  lifecycle_status = "active"

actor:
  name = "Sarah Chen"
  notes = "Principal cast for Hannah"
  lifecycle_status = "active"

actor:
  name = "James Holt"
  notes = "Scheduled for ADR voice work on transformation scenes"
  lifecycle_status = "active"

actor:
  name = "Marcus Vega"
  notes = "Stunt performer for physical action and stunt sequences"
  lifecycle_status = "active"
```

You map them to characters via the junction. One character can have multiple actors in different roles:

```
actor_character_role:
  actor_id = Markus Reinhardt
  character_id = Snapper
  role_type = "principal"
  scope = "whole_project"
  lifecycle_status = "active"

actor_character_role:
  actor_id = James Holt
  character_id = Snapper
  role_type = "adr"
  scope = "specific_scenes"
  scope_details = "Scenes 47-52, transformation sequence dialogue"
  lifecycle_status = "active"

actor_character_role:
  actor_id = Marcus Vega
  character_id = Snapper
  role_type = "stunt_double"
  scope = "specific_scenes"
  scope_details = "Scenes 31, 47, 52 — physical action"
  lifecycle_status = "active"

actor_character_role:
  actor_id = Sarah Chen
  character_id = Hannah
  role_type = "principal"
  scope = "whole_project"
  lifecycle_status = "active"
```

Character records update their casting status:

```
character[Snapper].casting_status = "cast"
character[Hannah].casting_status = "cast"
```

The performance corpus is created — a project-level singleton describing the body of capture:

```
performance_corpus:
  name = "Arcadia Principal Photography"
  shoot_dates_start = "2026-09-01"
  shoot_dates_end = "2026-09-19"
  shoot_locations = "Studio Babelsberg interiors; various Brandenburg locations for exteriors"
  camera_metadata = "ARRI Alexa Mini LF, anamorphic, ProRes 4444 XQ, ACES color pipeline"
  audio_metadata = "Booms for ambient and master coverage, lavs on principals, 48kHz/24bit, multi-channel"
  coverage_completeness = "in_production"
  corpus_notes = "..."
```

Scene 23 — Snapper interrogates Hannah in the sheriff's office. Day 5 of the shoot. Multiple takes captured:

```
take:
  name = "23A-1"
  corpus_id = arcadia-corpus
  shot_id = shot_23A
  take_number = 1
  date_recorded = "2026-09-05"
  duration_seconds = 218
  timecode_start = "10:32:14:00"
  timecode_end = "10:35:52:00"
  camera_designation = "A cam"
  preferred = false
  lifecycle_status = "active"

take:
  name = "23A-3"  // director's pick
  take_number = 3
  preferred = true
  lifecycle_status = "active"
  ... (other takes — 23A-2, 23B-1, 23B-2, 23C-1 — same structure)
```

Most takes cover a single scene. Take 23A-1 ran long and caught the start of scene 24 incidentally:

```
take_scene:
  take_id = 23A-1
  scene_id = 23
  order_in_take = 1
  coverage_completeness = "complete"

take_scene:
  take_id = 23A-1
  scene_id = 24
  order_in_take = 2
  coverage_completeness = "incidental"
```

The editor reviews the takes and cuts them into clips — meaningful within-scene segments:

```
clip:
  name = "23A-3 main coverage"
  take_id = 23A-3
  clip_in_timecode = "10:42:08:12"
  clip_out_timecode = "10:43:44:23"
  duration_seconds = 96
  scene_id = 23
  screenplay_line_start_id = (line where Snapper enters and addresses Hannah)
  screenplay_line_end_id = (line where Hannah breaks)
  beat_id = beat_23_interrogation
  clip_type = "dialogue"
  lifecycle_status = "active"

clip:
  name = "23B-1 Hannah reaction"
  take_id = 23B-1
  clip_type = "reaction"
  ... etc
```

And who's in each clip:

```
clip_character:
  clip_id = 23A-3-main
  character_id = Snapper
  role_in_clip = "featured"

clip_character:
  clip_id = 23A-3-main
  character_id = Hannah
  role_in_clip = "featured"
```

The screenplay editor now becomes a natural index into the footage. Click a line in the screenplay → query for clips where `screenplay_line_start_id <= this_line <= screenplay_line_end_id` → see every take that covers that line. Click a character in the entity browser → query for `clip_character` records → see every clip featuring them. The query "every clip with Snapper and Hannah together" is one join.

---

## Scenario 5 — Coverage state and the cascade shifts

**Activates:** `shot_coverage` with history, `coverage_state` enum, `source_take_id` and `source_clip_id`, the cascade resolving at step 2 instead of step 3.

Each shot in the screenplay needs a `shot_coverage` record reflecting its production state. Earlier in pre-vis, you'd created planning records:

```
shot_coverage:  // April 2026 — pre-vis planning
  shot_id = shot_23A
  coverage_state = "planned"
  status_date = "2026-04-10"
  lifecycle_status = "active"
```

Now, after the shoot, you add a new shot_coverage record reflecting reality:

```
shot_coverage:  // After the shoot
  shot_id = shot_23A
  coverage_state = "captured_live"
  source_take_id = 23A-3
  source_clip_id = 23A-3-main
  status_date = "2026-09-15"
  decided_by = "editor + director, dailies review"
  lifecycle_status = "active"
```

Both records exist. The schema doesn't require deleting the planning record — `status_date` ordering means tools find the most recent. (You could optionally transition the older record to lifecycle_status="archived" to signal it's purely historical, but most-recent-wins works without it.)

**The cascade now short-circuits at step 2.** Tool generates shot 23A for the final film:

1. No `character_shot_override` for (23A, Snapper, active) → step 2.
2. `shot_coverage` for shot 23A, most recent by status_date: state=captured_live, source_clip_id=23A-3-main → return the clip.

The tool doesn't even consult bundles. The captured performance is the answer — Snapper as Markus performed him, no generation required. The identity_anchors might still be pulled for QA (confirming the clip's character read matches canonical), but the primary output is the live footage.

This is the format's central trick: same cascade query, same tools, same file — but performance-first projects spend most calls landing at step 2, while generation-first projects spend most calls at step 3. The cascade abstracts the workflow difference.

For shots that *weren't* captured (a planned cutaway that got skipped, a shot of empty landscape, a CG-only insert), shot_coverage stays at `generated` and the cascade falls through to step 3, returning bundles for those shots specifically. Mixed coverage within a single project resolves shot by shot.

---

## Scenario 6 — Overrides and the transformation sequence

**Activates:** `character_shot_override` (override_types multiselect, progression_axis and progression_value, bundle_override_id, visual/vocal/motion deltas), single-active-record constraint, versioning chain on overrides (parent_id, supersession), composing multiple intents into one record.

Shot 47C is the first shot where Snapper's transformation begins. The performance was captured live — Markus on stage doing the physical work, clenched and breath labored — but the visual transformation needs to be added generatively over the captured footage.

Shot coverage reflects the hybrid state:

```
shot_coverage:
  shot_id = shot_47C
  coverage_state = "hybrid_generated_extension"
  source_clip_id = clip_47C_1_main
  generation_required = "Transformation overlay starting at frame 1240: eyes shifting amber, faint hair at jawline, brow ridge prominence, posture pulled forward"
  status_date = "2026-10-22"
  lifecycle_status = "active"
```

For the character-specific deviation, a `character_shot_override`:

```
character_shot_override:
  name = "Snapper transformation early"
  shot_id = shot_47C
  character_id = Snapper
  override_types = ["transformation"]
  progression_axis = "transformation"
  progression_value = 0.30
  visual_delta = "Eyes shifting amber from frame 1240. Faint hair growth at jawline. Slight brow ridge prominence. Posture pulled forward, weight dropping."
  vocal_delta = "Voice register dropping. Breath becoming labored, less coordinated."
  motion_delta = "Hands clenching with new strength. Coordination loosening, more primal."
  bundle_override_id = bundle_Snapper_partial_transformation
  variant_target_id = null
  parent_id = null
  lifecycle_status = "active"
```

Note the `progression_axis` and `progression_value` — Arcadia uses `"transformation"` as a project-defined axis spanning 0.0 (fully human) to 1.0 (fully wolf). Other shots in the transformation arc will populate progression_value at 0.45, 0.6, 0.85, etc., creating a smoothly-orderable progression that continuity tools can sort and visualize. A different project might use `"aging"` or `"corruption"` or `"decay"` — the axis name is text, defined by the project.

**Cascade with override.** A visual generation tool generates shot 47C:

1. `character_shot_override` for (47C, Snapper, active) exists, `bundle_override_id` is set → use the partial-transformation bundle. The captured clip is still available via `shot_coverage.source_clip_id` as conditioning input — the override transforms the captured performance rather than replacing it.

(Voice generation, walking the same cascade independently, would resolve differently — see Scenario 7 for the per-modality split.)

**Editorial revision later.** Two weeks after the first cut, the director reviews 47C and decides the transformation should start more subtly — barely there. The first override was directionally wrong. You create a successor:

```
character_shot_override (v2):
  name = "Snapper transformation subtle"
  shot_id = shot_47C  // same
  character_id = Snapper  // same
  override_types = ["transformation"]
  progression_axis = "transformation"
  progression_value = 0.15  // reduced from 0.30
  visual_delta = "Faint amber catch in eyes only. No hair growth yet at this stage. Brow ridge unchanged. Posture still mostly human."
  vocal_delta = "Voice unchanged. Slightly more labored breath."
  motion_delta = "Hand tension only. No coordination loss yet."
  bundle_override_id = bundle_Snapper_partial_transformation_subtle
  parent_id = (v1 override id)
  lifecycle_status = "active"
```

Simultaneously the tool updates v1:

```
character_shot_override (v1):
  lifecycle_status = "superseded"  // changed from active
  superseded_at = "2026-11-04T14:22:00Z"
  superseded_by_id = (v2 override id)
```

Both records exist. The cascade returns only v2 (the active one). A history viewer walking backward through `parent_id` shows: v1 → v2, with timestamps and notes about why the change was made.

**The single-active invariant.** The schema enforces that at most one record per (shot_id, character_id) has `lifecycle_status = active`. If a tool were to attempt to insert a parallel active override — say, a different author adding their own transformation deviation for the same shot/character without going through the version chain — the database constraint would reject the write. This protects against tools producing ambiguous states where two overrides both claim authority. The supersession workflow is the only path to changing the active record.

**Composing intents.** Late in post, the colorist reviews 47C and notes that Snapper should also have fresh scrapes on his face from the fight in scene 46. This is a different intent than transformation (`other`, not `transformation`), but it applies to the same slot. Rather than try to create a parallel override (which the constraint would reject anyway), you compose into a successor:

```
character_shot_override (v3):
  parent_id = (v2 override id)
  override_types = ["transformation", "other"]  // composed
  progression_axis = "transformation"
  progression_value = 0.15  // unchanged
  visual_delta = "Faint amber catch in eyes only. No hair growth yet. Brow ridge unchanged. Posture still mostly human. PLUS: fresh scrapes on left cheek and jaw from scene 46 fight."
  vocal_delta = "Voice unchanged. Slightly more labored breath."
  motion_delta = "Hand tension only. Slight favoring of cut side."
  lifecycle_status = "active"
```

v2 is superseded to v3. The chain reads v1 → v2 → v3, three records preserved, one active. The author composed intent at authoring time — the format didn't impose merge semantics.

---

## Scenario 7 — Audio and motion specializations

**Activates:** `bundle.intent = "voice_identity"` and `"motion"`, audio `identity_anchor` (anchor_type=audio, audio_offset_start_sec/end_sec), motion `identity_anchor` (anchor_type=motion, frame_number), `actor_character_role` with role_type=adr and role_type=stunt_double, `character_asset_binding` with scene_range.

The transformation scenes need a vocal quality Markus doesn't have. James Holt is brought in for ADR — his voice carries more weight and growl. He records the transformation dialogue in a studio session.

A voice-identity bundle:

```
bundle:
  name = "Snapper — transformation ADR voice"
  intent = "voice_identity"
  version_label = "v1"
  description = "James Holt voicing Snapper for the transformation sequence — heavier, more guttural, less human"
  coverage_summary = "Full ADR session. James Holt voicing Snapper for scenes 47-52. Studio recording, denoised, leveled. Emotional range: pain, rage, exhaustion, loss-of-self."
  format_hints = {
    "audio_duration_sec": 1840,
    "phonemes_covered": "complete",
    "emotional_states": ["pain", "rage", "exhaustion", "loss-of-self"],
    "sample_rate": 48000,
    "channels": 1
  }
  intended_consumers = ["voice_clone", "video_gen"]
  provenance = "ADR session 2026-11-14, Studio Babelsberg, James Holt. Engineer: ..."
  parent_id = null
  lifecycle_status = "active"
```

Each take of the session is an asset, linked via `bundle_asset` with descriptive roles ("rage take 03 — pure register", "pain take 11 — wet vocal break", etc.).

Audio identity anchors mark canonical moments — pure-register reference points for voice locking:

```
identity_anchor:
  name = "Snapper ADR rage canonical"
  character_id = Snapper
  anchor_type = "audio"
  asset_id = adr_take_22
  audio_offset_start_sec = 12.4
  audio_offset_end_sec = 18.7
  condition_description = "Pure rage register, no distortion, ideal voice identity reference"
  physical_state = "transformation_advanced"
  vocal_state = "rage"
  canonical_status = "verified"
  lifecycle_status = "active"
```

The same source asset (the ADR take) is referenced by the anchor with a time range, never sliced into a new file. Tools extract the audio range at query time.

Binding scopes the ADR voice to the relevant scene range:

```
character_asset_binding:
  name = "Snapper transformation ADR voice"
  character_id = Snapper
  bundle_id = Snapper-transformation-ADR-voice
  scene_range_start_id = scene_47
  scene_range_end_id = scene_52
  is_baseline = false
  precedence = 20
  lifecycle_status = "active"
```

The original Markus voice has its own bundle (created during the shoot's audio extraction), bound as baseline with precedence 0.

**Cascade for voice in scene 49 — per-modality resolution.** A tool generating dialogue audio for shot 49B is requesting the *voice* modality specifically. The cascade resolves independently per modality, so the voice walk is distinct from a visual walk over the same shot.

For voice on shot 49B:

1. No active `character_shot_override` with a `bundle_override_id` pointing at a voice bundle → fall through to step 2.
2. Check shot_coverage: shot 49B is `captured_live` with `source_clip_id` set, and the captured clip contains sync audio of Markus performing. *But* — the cascade asks whether the captured audio is the right voice source for this modality. The presence of an active voice binding with scene range covering 49 and precedence 20 (the ADR binding) signals that voice should resolve via bundles, not via capture. Step 2 does not short-circuit for voice; the cascade continues to step 3.
3. Resolve `character_asset_binding` for Snapper, scene 49, `intent = voice_identity`, `lifecycle_status = active`. Two candidates: "transformation ADR voice" (scene range matches, precedence 20) and baseline production voice (is_baseline, precedence 0). Higher precedence wins.
4. Return the ADR voice bundle.

Meanwhile, a tool generating *visual* for the same shot 49B walks its own cascade and resolves at step 2 — the captured clip is the answer for visual. Two tools, two modalities, two answers, same file. The visual modality uses Markus on screen; the voice modality uses James in ADR. The schema doesn't force one source per shot.

**Per-modality rule (general statement).** A tool consults the cascade for a specific modality (visual, voice, motion, behavior). When checking step 2 (captured live), the question is "does the captured source provide the right answer for *this modality*?" If a higher-precedence bundle binding exists at step 3 for this modality, the cascade routes there instead of short-circuiting at step 2. The captured clip is consulted for whichever modalities don't have overriding bundles, and ignored for those that do.

For motion bundles, similar logic. Marcus Vega (stunt double) is recorded performing physical action for Snapper in scenes 31, 47, 52:

```
bundle:
  name = "Snapper — stunt motion"
  intent = "motion"
  coverage_summary = "Stunt double Marcus Vega performing horse falls, fight choreography, rough physical action. Mocap suit data plus reference video."
  format_hints = {
    "motion_categories": ["horse_fall", "fight_close", "fight_distance", "running_wounded"],
    "duration_sec": 320,
    "mocap_format": "BVH"
  }
  intended_consumers = ["video_gen", "world_model", "animation_retarget"]
  provenance = "Mocap session 2026-09-22, plus reference video from shoot day 12"
```

A motion identity_anchor marks a canonical movement reference:

```
identity_anchor:
  name = "Snapper canonical 'rise from wound'"
  character_id = Snapper
  anchor_type = "motion"
  asset_id = mocap_take_15
  frame_number = 240
  condition_description = "Canonical movement: body weight realistic, asymmetric guard favoring wounded side, deliberate pacing, recovery breath"
  physical_state = "wounded"
  canonical_status = "verified"
  lifecycle_status = "active"
```

The actor_character_role for Marcus Vega scoped this in Scenario 4 — `role_type = "stunt_double"`, `scope = "specific_scenes"`, scope_details listing the scenes. Tools doing motion generation can correlate motion bundle provenance with this role to understand who performed what.

---

## Scenario 8 — Versioning over the project's life

**Activates:** `parent_id`, `version_label`, `lifecycle_status` transitions (draft → active, active → superseded), `superseded_at`, `superseded_by_id`, multi-tool versioning where tools have different policies but maintain the same lineage structure.

Throughout the project's life, bundles get refined. Each refinement is a new version of the bundle, chained by `parent_id`. The same pattern operates regardless of what tool authored the change.

**Tool A (your Berlin indie tool).** You're refining Snapper's baseline visual bundle. Some early reference frames are too generic; you want to replace them with better curated images. You create v2:

```
bundle:
  name = "Snapper — baseline visual"
  intent = "visual_identity"
  version_label = "v2"
  description = "Refined reference set. Replaced 4 generic frames with stronger character-specific studies."
  coverage_summary = "8 angles, two lighting conditions, expression matrix expanded with 'brooding' and 'restrained anger' registers."
  format_hints = { ... updated ... }
  intended_consumers = ["image_gen", "video_gen"]
  parent_id = (v1 bundle id)
  lifecycle_status = "draft"  // tool policy: new versions start as drafts
```

You curate the bundle_asset records pointing to the new set, preview generations using v2, and decide it's good. Click "Promote to active":

```
bundle (v2):
  lifecycle_status = "active"  // changed from draft

bundle (v1):
  lifecycle_status = "superseded"  // changed from active
  superseded_at = "2026-05-18T11:00:00Z"
  superseded_by_id = (v2 bundle id)
```

Cascade resolves to v2. v1 stays in the file as historical record. The binding (`character_asset_binding`) points to the lineage name, but tools resolve to whichever version is currently active.

**Tool B (a studio post-production tool, months later).** A small VFX studio in Munich receives the SCF file for the final phase. Their tool opens it and sees v2 is active. The lead engineer wants to refine the bundle further — better lighting matches for shots 47-52 specifically — but studio policy requires supervisor approval before going active.

The engineer creates v3:

```
bundle:
  version_label = "v3 — studio refinement"
  parent_id = (v2 bundle id)
  lifecycle_status = "draft"
```

Engineer assembles the curated set. Submits for review. The studio's tool might handle "pending review" in different ways:

- **Option A (strict to SCF):** keep lifecycle_status as "draft" until approval. Track the studio's internal review state in a tool-specific custom field, or in OMC tags if they're using OMC interop.
- **Option B (extend the enum locally):** the studio's local tool understands an extra state called "pending_review" not in the standard SCF enum. SCF-aware tools that read the file see a value they don't recognize, treat it as non-active (since it's not "active"), and the cascade ignores v3.

Either approach works because SCF's contract is just: `lifecycle_status = active` is the cascade-relevant state. What other states mean is up to the tool.

Once the supervisor approves:

```
bundle (v3):
  lifecycle_status = "active"

bundle (v2):
  lifecycle_status = "superseded"
  superseded_at = (approval timestamp)
  superseded_by_id = (v3 bundle id)
```

The format defined the lineage structure (parent_id, lifecycle_status states, supersession fields). The tools defined their policies (when to bump, who can promote, what review gates promotion). The same file works in both tools because the structural invariants hold across both.

**Tool C (a QA / audit tool).** Someone wants to see the full version history. The tool walks back through `parent_id` from the active record:

- v3 (active, created by Munich studio, dated December)
- v2 (superseded, your refinement, dated May)
- v1 (superseded, original creation, dated March)

Three records, full history, active record at v3. No special "history mode" in SCF — just a query over what's already structured.

The same versioning pattern operates on `character_shot_override` (demonstrated in Scenario 6). Any entity flagged `versionable=True` in the registry works this way.

---

## Scenario 9 — OMC handoff at production transition

**Activates:** `external_id`, `external_id_namespace` on bridgeable entities, the SCF-OMC mapping in practice.

Post-production handoff. A VFX vendor receives the SCF file and needs to track shots and assets through their OMC-compliant pipeline. The vendor's tooling speaks OMC natively; SCF's role is to provide the upstream story-rich data and accept production-state updates back.

You (or your tool) populate `external_id` fields on entities the vendor will need to address:

```
project:
  external_id = "cw:arcadia-2026"
  external_id_namespace = "omc"

character[Snapper]:
  external_id = "char-snapper-001"
  external_id_namespace = "omc"

actor[Markus Reinhardt]:
  external_id = "participant-mreinhardt"
  external_id_namespace = "omc"

scene[scene_47]:
  external_id = "scn-047"
  external_id_namespace = "omc"

shot[shot_47C]:
  external_id = "shot-047C-001"
  external_id_namespace = "omc"

take[take_47C_1]:
  external_id = "take-047C-001-T01"
  external_id_namespace = "omc"

clip[clip_47C_1_main]:
  external_id = "clip-047C-001-T01-A"
  external_id_namespace = "omc"

asset[...] (each delivered media file):
  external_id = "asset-..."
  external_id_namespace = "omc"
```

The vendor's OMC-aware tool reads the SCF file. For each entity with `external_id_namespace = "omc"`, it knows that entity is part of the production-side data model. It produces an OMC view:

- SCF `project` → OMC `CreativeWork` with the same identifier
- SCF `character` → OMC `NarrativeCharacter` (production-side reference; the story-rich SCF data flows into OMC's Tags / Annotations utility classes)
- SCF `actor` → OMC `Participant` (cast role)
- SCF `scene` → OMC `Scene`
- SCF `shot` → OMC `Shot`
- SCF `take`, `clip` → OMC's evolving post-pipeline structures (v3.0 and beyond)
- SCF `asset` → OMC `Asset`, with `bundle` mapping reasonably to OMC `AssetGroup`

The vendor's pipeline operates on the OMC view. Story-rich data (bundles, identity_anchors, character_shot_overrides) flows into OMC as tags or annotations — supplementary metadata that production tools can ignore but that survives the round-trip.

**Return handoff.** When the vendor returns the file with their work integrated:

- They may have updated `lifecycle_status` and `approval_status` on assets (e.g. final delivery state)
- They may have added new assets with their own external_ids in their namespace
- They populate any new fields agreed upon (delivery dates, file versions, etc.)
- The story-side data (character entities, bundles, narrative fields) is untouched — they don't have authority over creative changes

Lifecycle alignment works in SCF's favor here: SCF's split between version chain (parent_id, supersession) and state (lifecycle_status) maps directly onto OMC's version-vs-state distinction. Round-trip preservation works without semantic loss.

---

## Scenario 10 — The four status axes operating together

**Activates:** the full status field taxonomy (`lifecycle_status`, `production_status`, writing-process `status`, entity-specific status fields), the lowercase casing convention, all four axes operating on the same project simultaneously.

A mature project shows all four status axes active and independent. Here's a snapshot at mid-production:

```
project[Arcadia]:
  lifecycle_status = "active"           // project record is current
  production_status = "post_production"  // project is in post phase
  // (Different axes. Project record could be 'active' across any production phase.)

character[Snapper]:
  lifecycle_status = "active"
  // (character has no `status` field — uses lifecycle_status for its state axis)

character[Old Pete]:  // a minor character who got cut in the third pass
  lifecycle_status = "cut"
  // (still in the file, all their entity data intact, just not in the active work)

scene[scene_47]:
  lifecycle_status = "active"
  status = "locked"
  // active in the cut, writing process complete

scene[scene_19]:
  lifecycle_status = "active"
  status = "draft"
  // in the work, but writing still being refined

scene[scene_31_alt]:
  lifecycle_status = "cut"
  status = "outline"
  // never finished, removed from the work

asset[clip_47C_1_main_video]:
  lifecycle_status = "active"
  approval_status = "approved"
  // current and creative-approved

asset[snapper-ref-001]:  // an early curated image, superseded by v2 bundle
  lifecycle_status = "active"  // still around, still referenceable
  approval_status = "approved"
  // (the bundle that referenced it is superseded, but the asset itself remains)

identity_anchor[Snapper_front_neutral_v1]:
  lifecycle_status = "active"
  canonical_status = "verified"
  // current and canonically verified

identity_anchor[Snapper_front_smile_candidate]:
  lifecycle_status = "active"
  canonical_status = "candidate"
  // current but not yet verified as canonical — under review
```

Each axis measures something different:

- **The project being in `post_production` (production phase axis) is independent of being `active` (lifecycle axis).** The project record stays active across every production phase; the phase progresses linearly while lifecycle_status doesn't change.
- **Scene 47 being `locked` (writing axis) is independent of being `active` (lifecycle axis).** A locked scene can still be cut later if the story changes. An active scene might still be in draft state from the writing perspective.
- **An asset being `approved` (approval axis) is independent of being `active` (lifecycle axis).** An approved asset can be superseded later by a newer cut.
- **An anchor being `verified` (canonical axis) is independent of being `active` (lifecycle axis).** A verified anchor can be marked deprecated if a better anchor is found, while still being canonically verified for its time.

Tools query the axis that matters for their job:

| Question | Field | Filter |
|---|---|---|
| What phase is the project in? | `production_status` | `= post_production` |
| What characters are in the current story? | `lifecycle_status` | `= active` |
| What scenes still need writing? | `status` | `in (outline, draft, revised)` |
| What assets need creative approval? | `approval_status` | `= pending` |
| What anchors are reliable for QA? | `canonical_status` + `lifecycle_status` | `= verified` AND `= active` |
| What's the current voice bundle for Snapper? | `lifecycle_status` + binding cascade | `= active`, walk cascade |

Compressing all four axes into a single field would force false equivalences. Keeping them distinct keeps the format honest about what's being measured, and lets tools build the queries they actually need.

---

## Coverage matrix

Quick reference: which scenario activated which schema piece.

| Schema piece | Activated in |
|---|---|
| `project`, `workflow_mode` | Scenarios 1, 4 (transition to hybrid) |
| `character` (slimmed) | Scenario 1 |
| `character.casting_status` | Scenarios 1, 4 (transition tbd → cast) |
| `character_variant` | Scenario 3 |
| Tier 2 description entities (`physical_character_profile`, `vocal_profile`, etc.) | Scenario 1 |
| `bundle` (visual_identity) | Scenarios 2, 3, 8 (versioning) |
| `bundle` (voice_identity) | Scenario 7 |
| `bundle` (motion) | Scenario 7 |
| `bundle.format_hints`, `intended_consumers`, `provenance` | Scenario 2 |
| `bundle_asset` junction with `role_in_bundle` | Scenarios 2, 7 |
| `character_asset_binding` with `is_baseline` | Scenario 2 |
| `character_asset_binding` with `variant_id` + `precedence` | Scenario 3 |
| `character_asset_binding` with `scene_range_start_id` / `scene_range_end_id` | Scenario 7 |
| `identity_anchor` (visual, region_box, region_label) | Scenario 2 |
| `identity_anchor` (audio, audio_offset_start/end_sec) | Scenario 7 |
| `identity_anchor` (motion, frame_number) | Scenario 7 |
| `identity_anchor.canonical_status` | Scenarios 2, 10 |
| `performance_corpus` | Scenario 4 |
| `actor` | Scenario 4 |
| `actor_character_role` (principal, adr, stunt_double, etc.) | Scenarios 4, 7 |
| `take`, `take.preferred` | Scenario 4 |
| `take_scene` junction | Scenario 4 |
| `clip` | Scenario 4 |
| `clip` linkage to `screenplay_line_start_id` / `screenplay_line_end_id` | Scenario 4 |
| `clip_character` junction | Scenario 4 |
| `shot_coverage` | Scenarios 5, 6 |
| `shot_coverage.coverage_state` (captured_live) | Scenario 5 |
| `shot_coverage.coverage_state` (hybrid_generated_extension) | Scenario 6 |
| `shot_coverage` history (multiple records) | Scenario 5 |
| `character_shot_override` | Scenario 6 |
| `character_shot_override.override_types`, `bundle_override_id` | Scenario 6 |
| `character_shot_override.progression_axis` + `progression_value` | Scenario 6 |
| `character_shot_override` versioning chain | Scenario 6 |
| Single-active-record constraint | Scenario 6 |
| Cascade resolving at step 1 (override) | Scenario 6 |
| Cascade resolving at step 2 (captured) | Scenario 5 |
| Cascade resolving at step 3 (binding with precedence) | Scenarios 2, 3, 7 |
| Cascade fallback (step 4, baseline) | Scenario 3 |
| Per-modality cascade resolution | Scenario 7 |
| Bundle versioning (parent_id, version_label, supersession) | Scenario 8 |
| `lifecycle_status` (cross-cutting axis) | Scenarios 1, 8, 10 |
| `production_status` (project production phase axis) | Scenarios 1, 10 |
| `status` (writing-process axis) | Scenario 10 |
| Entity-specific status (`approval_status`, `canonical_status`) | Scenario 10 |
| Four-axis taxonomy operating together | Scenario 10 |
| `external_id`, `external_id_namespace` | Scenario 9 |
| OMC handoff and round-trip | Scenario 9 |

Every entity introduced in the v2 design document is exercised. Every cross-cutting convention (versioning, lifecycle, taxonomy, external IDs) is shown in operation.
