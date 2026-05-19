# SCF MCP Server — Design Proposal (v1)

*A read-first MCP server exposing the SCF format as queryable, structured context for AI assistants. Treats the existing FastAPI backend, query functions, and schema registry as the working substrate — the server is a thin protocol layer, not a parallel system. Designed to let Claude work on a `.scf` project as a first-class authoring partner instead of as a thing the user describes in prose.*

---

## Why this proposal exists

SCF's animating thesis is that creative intent should be structured data — that a sufficient corpus of `.scf` files constitutes ideal training and runtime context for AI-augmented filmmaking. The format is now most of the way there: 96 entities across seven tiers, the bundle/binding/anchor pattern across characters, props, and locations, a deterministic resolution cascade, format-level versioning, OMC interop hooks.

What's missing is the *interface*. Right now, working on a project with Claude means manually pasting JSON, describing characters in prose, copying screenplay text, or uploading the database file and asking the model to read SQLite (which it can't reliably do at any scale). The structured data the format exists to provide is locked behind copy-paste.

The Model Context Protocol — Anthropic's open standard for AI-to-tool integration, released late 2024 — is the right interface for this. It lets a server expose tools and resources to any MCP-aware host (Claude Desktop, Claude Code, Cursor, the API directly, more coming), with a uniform protocol the model already understands how to use. One server, multiple clients, schema-aware tool calls.

**Why MCP specifically, not alternatives.** The other paths considered:

- *Custom Anthropic API integration.* Works for one host (Claude). Locks the work to one client. Doesn't compose with the growing MCP ecosystem.
- *OpenAPI + per-client adapters.* General-purpose REST is right for many use cases, but not for LLM consumption — OpenAPI specs aren't structured for the "model reads tool descriptions to decide when to call" pattern that MCP makes first-class.
- *File uploads + prose description.* The current de facto path. Doesn't scale, loses round-trip interactivity, and wastes the structured-data thesis.
- *Wait for the ecosystem to mature.* MCP is young (~18 months) but Anthropic-backed, with a healthy SDK, growing reference servers, and adoption across multiple hosts. The maturity argument cuts both ways — early adopters shape the patterns.

MCP wins because it's the only path where the work compounds across hosts and survives ecosystem changes. The investment is in tool design (which is the real work anyway); the protocol shell is replaceable.

This document proposes a phased build: a read-first server covering the highest-value queries, deferred write operations, and a tool surface designed around intent shapes rather than CRUD primitives.

---

## Goals and non-goals

### Goals

- Expose SCF's structured data to Claude (and other MCP hosts) in a form the model can use directly, without the user describing the project in prose.
- Make the resolution cascade — SCF's marquee query — addressable as a single tool call.
- Make scene context, character profiles, and screenplay segments retrievable in shapes designed for LLM consumption (one call returns enough; the model doesn't have to compose four lookups).
- Stay close to the existing codebase. The MCP server is a thin layer over `queries.py`, `database.py`, and the screenplay/images APIs. No parallel data access layer.
- Keep tool descriptions current with the evolving schema by reading from the entity registry at server startup.

### Non-goals (for v1)

- **No write operations.** A read-only first cut sidesteps the entire class of "the model edited my project wrong" failures. Writes are a separate proposal.
- **No multi-project serving.** One `.scf` per server instance, set in config. Multi-project needs auth, project switching, and scoping — none of which is needed for solo authoring.
- **No remote hosting.** Local stdio transport. Remote deployment is a separate concern with its own auth and security shape.
- **No specialized UI.** The host (Claude Desktop, etc.) is the UI. The server is a backend.
- **No replacement for the editor.** The SCF Editor is the authoring tool. The MCP server is the *consumption* tool — for reading and reasoning about the project, not for editing it.

---

## Design principles

**Tools are intent-shaped, not CRUD-shaped.** `get_scene_context(scene_id)` is a better tool than four separate tools the model has to compose into "everything about scene 23." The model handles a small set of well-described, intent-shaped tools much better than a wide set of low-level primitives. CRUD has a place — `list_entities` and `get_entity` exist for cases where no specific intent fits — but they're the floor, not the surface.

**Tool descriptions are the API.** The text in each tool's description is what the model reads when deciding whether to call it. Specific, grounded in the vocabulary users will use, including examples of when it's the right choice. This is writing for the model as audience. It takes iteration; the first description is rarely the right one.

**Schema-current by construction.** The entity registry is the source of truth. Tool parameter schemas, entity type enums, field name validation — all derived from the registry at server startup, not hand-coded. When entities are added or renamed, the server picks them up automatically. The alternative — hand-maintained tool definitions — drifts within weeks.

**Composition over explosion.** Don't expose 50 tools when 15 well-designed ones cover the surface. The model picks the right tool by reading descriptions; descriptions get harder to disambiguate as the surface grows. Prefer parameter richness over tool proliferation.

**Cascade resolution is the marquee.** The cascade is the format's unique offering. No other tool, format, or workflow exposes it. The cascade tool should be the cleanest, best-described, most prominent tool in the surface.

**Read-only is a feature, not a limitation.** Removing the entire class of write-related risk from v1 lets the tool surface settle without urgency. Patterns established under read-only constraints — what the model finds useful, what it overuses, what it misuses — inform what writes should and shouldn't exist later.

**The format's documentation is part of the server.** `conventions.md`, `format_overview.md`, `schema_snapshot.md` exposed as MCP resources mean Claude can ground its tool calls in current format knowledge. The model already knows English; what it needs is the project's structure.

---

## Architecture

### Process shape

The MCP server is a separate Python process, launched by the MCP host (Claude Desktop, Claude Code, etc.) over stdio. It imports the existing SCF codebase — `entity_registry.py`, `database.py`, `queries.py`, `screenplay_db.py` — and opens a `.scf` file directly via SQLite. The FastAPI server doesn't need to be running.

Three reasons for sidecar-style architecture rather than wrapping the HTTP API:

- **No port management.** The host launches the server as a subprocess; communication is over stdin/stdout. No "is the FastAPI server running on port 8000?" coordination.
- **No HTTP round-trip overhead.** Direct function calls into the existing query layer.
- **Independent lifecycle.** The MCP server can run when the FastAPI editor isn't, and vice versa. They share the same `.scf` file; SQLite handles the concurrency.

The cost is some duplication of route handler logic — `main.py`'s CRUD endpoints and the MCP server's `get_entity` tool both call `database.get_entity()`, with slightly different output shaping. Acceptable; the shared underlying functions are the real surface.

```
┌─────────────────────────┐
│  Claude Desktop (host)  │
└──────────┬──────────────┘
           │ stdio (JSON-RPC)
           │
┌──────────▼──────────────┐
│  scf-mcp (server)       │
│  - tool implementations │
│  - resource handlers    │
└──────────┬──────────────┘
           │ direct function calls
           │
┌──────────▼──────────────┐
│  SCF Python codebase    │
│  - entity_registry      │
│  - database.py          │
│  - queries.py           │
│  - screenplay_db.py     │
└──────────┬──────────────┘
           │ sqlite3
           │
┌──────────▼──────────────┐
│  project.scf (SQLite)   │
└─────────────────────────┘
```

### Project scoping

The server is configured with the path to one `.scf` file at startup. Switching projects = restarting the server with different config. The host (e.g. Claude Desktop) supports multiple server configurations; users can have several SCF servers configured for different projects and enable the relevant one.

Two alternatives considered and rejected for v1:

- *Server reads a "currently active project" file the editor maintains.* Tempting — keeps the editor and Claude in sync. But it introduces a hidden coupling and a failure mode (the file gets out of sync). Restart-to-switch is honest about what's happening.
- *Server takes a project path as a tool parameter on every call.* Pushes the burden onto the model, which doesn't know what projects exist. Worse UX.

When (or if) the server goes remote / multi-tenant, this design needs rethinking. For solo local use, configuration-at-startup is right.

### Code organization

```
scf-mcp/
  server.py              # MCP server entry point, tool/resource registration
  tools/
    entities.py          # get_entity, list_entities, list_entity_types
    context.py           # get_scene_context, get_character_profile
    cascade.py           # resolve_cascade (the marquee)
    screenplay.py        # query_screenplay, find_clips_covering_line
    queries.py           # find_clips, find_appearances, predefined queries
  resources/
    docs.py              # serve conventions.md, format_overview.md, etc.
    project.py           # project, scene, character resources
  schema/
    introspect.py        # build tool param schemas from entity_registry
  config.py              # server config (project path, options)
  __main__.py            # CLI entry: python -m scf_mcp <path-to-scf>
```

Lives in the existing repo as a sibling to the FastAPI app, sharing imports. Optionally extractable to a separate package later if multi-repo distribution becomes useful.

---

## The tool surface

Organized by category. Numbers are deliberate — about 15 tools at full v1, designed so the model can hold them all in mind. Each tool gets a description, parameter shape, return shape, and a note on when the model should reach for it. The descriptions below are sketches; the actual server descriptions need iteration based on real usage.

### Discovery and orientation

These tools let the model figure out what's in the project before drilling in.

#### `get_project_overview()`

**Description:** Return high-level project information: name, logline, genre, `workflow_mode` (performance_first / generation_first / hybrid), `production_status`, counts of major entity types (characters, scenes, locations, etc.). Use this when starting work on a project to orient. Returns a small structured summary, not a full data dump.

**Returns:** project metadata + counts dict.

**When to use:** First call in most sessions. Cheap, broad, anchors what's available.

#### `list_entity_types()`

**Description:** Return every entity type defined in this project's schema, grouped by category and tier, with a one-line description of each. Use when you need to know what kinds of structured data the project contains before deciding what to query.

**Returns:** list of `{entity_type, category, tier, description, count}` records.

**When to use:** When the user asks about something whose entity type isn't obvious, or when planning what to fetch.

### Reading entities

The CRUD-shaped floor of the surface. Used when no specific intent tool fits.

#### `list_entities(entity_type, filters?, limit?, sort?)`

**Description:** List entities of a given type with optional filtering and sorting. Filters are field=value pairs that compile to SQL WHERE clauses. Use for queries like "all characters with `casting_status = generated_only`" or "all scenes in act 2." Returns a compact list — for full entity details on a single record, use `get_entity` instead.

**Returns:** list of entity summaries (`{id, name, key_fields}`). Default limit 50.

**Parameter schema:** `entity_type` validated against the entity registry; `filters` validated against the entity's defined fields.

#### `get_entity(entity_type, id_or_name, include_relations?)`

**Description:** Fetch a single entity by ID or by name (the editor's two natural addresses). Optionally include directly-related records — for a character, that includes their variants, bundles via bindings, and Tier 2 description entities; for a scene, the characters/props/beats/etc. present. Use when you need the full picture of one record, not a summary.

**Returns:** full entity record + optional relations dict.

#### `find_appearances(entity_type, entity_id)`

**Description:** Find every place a given entity appears in the story — for a character: scenes they're in, shots featuring them, beats they participate in, clips they're in. For a prop: same. For a location: scenes set there. The reverse-lookup query the entity tree's "Appears In" section answers.

**Returns:** structured list of appearances, grouped by appearance type.

### Context assembly — the payoff tools

These are the intent-shaped tools that justify having an MCP server at all. Each call returns enough that the model doesn't need to compose multiple lookups.

#### `get_scene_context(scene_id, depth?)`

**Description:** Return everything relevant to a single scene: the scene record itself, the location and its current variant, characters present (with role from `scene_character`), props (with usage from `scene_prop`), story beats in order, the scene's Tier 3 detail entities (`scene_emotional_target`, `scene_color_palette`, `lighting_design`, `scene_music_design`, `tone_marker`, `set_dressing`, `dialogue_sound_design`), and the corresponding screenplay text. Use when reasoning about a scene as a unit — drafting prose about it, generating prompts for it, answering questions about what happens.

**Returns:** structured scene context dict (~50–200 fields depending on population).

**`depth` parameter:** `summary` (just the scene + key references), `standard` (default, scene + Tier 3 + screenplay), `full` (everything including Tier 4 motif manifestations and emotional beats touching this scene).

#### `get_character_profile(character_id, include_bundles?)`

**Description:** Return everything that defines a character — base record, all Tier 2 description entities (`physical_character_profile`, `vocal_profile`, `delivery_profile`, `facial_expression_profile`, `character_appearance_profile`, `costume_progression`, `makeup_hair_design`, `physical_habit`), `character_color_identity` from Tier 4, variants, relationships, costumes, and optionally a summary of bundles bound to them. Use when reasoning about a character holistically.

**Returns:** layered character profile.

#### `resolve_cascade(shot_id, subject_type, subject_id, modality)`

**Description:** Walk SCF's resolution cascade for a given (shot, subject, modality) tuple and return what should be used to generate or reference this subject in this shot for this modality. This is SCF's central query — it composes shot overrides, captured-live coverage, and bundle bindings into a single answer.

The cascade has five steps:
1. Check `<subject>_shot_override` for an active override with `bundle_override_id`.
2. Check `shot_coverage` for captured-live material that provides the requested modality.
3. Resolve `<subject>_asset_binding` filtered by scene, variant, state, and bundle intent.
4. Fall back to baseline bindings.
5. Pull `entity_anchor` records for verification (always returned regardless of primary resolution).

Returns which step resolved, the primary source (bundle + assets, or captured clip), any compositional notes for hybrid shots, and verification anchors. Use this whenever you need to know what reference material to use for a character/prop/location in a specific shot. `subject_type` must be `character`, `prop`, or `location`. `modality` filters bundle intent (visual_identity, voice_identity, motion, behavior, surface, environment, acoustic).

**Returns:**
```
{
  "resolved_at_step": 3,
  "step_description": "binding cascade resolved to variant-scoped bundle",
  "primary_source": {
    "type": "bundle",
    "bundle": {bundle record},
    "binding": {binding record showing why this bundle won},
    "assets": [{asset record, role_in_bundle}, ...]
  },
  "captured_contribution": null | {clip record + note},
  "active_override": null | {override record},
  "verification_anchors": [{entity_anchor records}],
  "composition_note": "Single source: bundle. No captured material contributing." | "..."
}
```

**This is the most important tool in the surface.** Worth the most description-writing iteration.

#### `get_story_structure()`

**Description:** Return the structural skeleton of the story — acts, sequences, scenes in order — with each scene's location, status, and a one-line summary. Use to orient on story shape, find scenes by description, or reason about pacing and structure.

**Returns:** nested act → sequence → scene structure.

### Cross-cutting queries

The Query Explorer's predefined queries, exposed as tools. These are the high-value cross-entity questions worth surfacing as intent-shaped tools rather than asking the model to compose them.

#### `find_clips(filters)`

**Description:** Find clips matching constraints — characters present (one or more, with AND semantics), prop featured, scene, screenplay line range, clip type, take. Use for queries like "every clip with Snapper and Hannah together," "every clip featuring the locket," "every clip covering lines 340–380."

**Returns:** list of clips with parent take + scene context.

#### `character_journey(character_id)`

**Description:** Return a character's arc across the story — every scene they appear in, in order, with their role and beats. The character journey predefined query.

#### `location_breakdown(location_id)`

**Description:** Return everything at a location — scenes set there, props recurring there, characters frequent there, atmospheric design and sound profile. The location breakdown predefined query.

#### `character_crossover()`

**Description:** Return scenes where multiple specific characters share screen time. Use for relationship analysis or "where do they meet?" queries.

### Screenplay tools

#### `query_screenplay(scene_id?, line_range?, character_id?)`

**Description:** Return screenplay text in context. Filter by scene, by line range, or by character (every line spoken by character X). Returns structured screenplay lines (type-tagged) plus their entity references. Use when you need the actual dialogue or action text, not just a description of what happens.

**Returns:** list of `{line_id, type, content, scene_id, character_id, ...}`.

#### `find_clips_covering_line(line_id)`

**Description:** Find every take/clip that covers a given screenplay line — the reverse of the screenplay editor's clip linking. Use to find footage for specific lines.

---

## Resources

Resources are addressable read-only views the host can pull into context, either on user reference (`@scene23` style) or proactively. Different from tools in that they're passive — the host or user invokes them, the model doesn't call them.

### Project resources

- `scf://project` — project overview as a markdown document
- `scf://scene/{id}` — full scene context (calls `get_scene_context` internally)
- `scf://character/{id}` — full character profile
- `scf://location/{id}` — location with breakdown
- `scf://prop/{id}` — prop with variants and bindings
- `scf://shot/{id}` — shot with coverage, overrides, and cascade resolution summary
- `scf://screenplay` — full screenplay as Fountain
- `scf://screenplay/scene/{id}` — screenplay segment for one scene

### Format documentation resources

Critical for grounding the model's tool use in current format knowledge.

- `scf://docs/format-overview` — serves `format_overview.md`
- `scf://docs/conventions` — serves `conventions.md`
- `scf://docs/schema-snapshot` — serves the auto-generated `schema_snapshot.md`
- `scf://docs/schema-reference` — serves the auto-generated `schema_reference.md` (large)

The format-documentation resources are the answer to "how does the model know the schema?" without hardcoding it. When the schema changes, the doc generator regenerates the snapshot, and the resource serves the updated version automatically.

---

## Schema awareness — how tools stay current

The entity registry is the source of truth. The server reads it at startup and uses it to:

- **Validate `entity_type` parameters.** A tool call with `entity_type=charactor` (typo) gets rejected with a list of valid values.
- **Validate filter field names.** `list_entities('character', filters={'casting_status': 'cast'})` validates that `casting_status` is a field on character.
- **Build tool parameter enums.** `entity_type` parameter has a Literal/enum type matching the current registry.
- **Generate tool descriptions partially from registry.** E.g. `list_entity_types` returns descriptions read straight from `EntityDef.description`. The doc snapshots also flow into resource bodies.

When the registry changes (entity added, renamed, fields added):

- Tool parameter schemas update automatically on server restart.
- The `scf://docs/schema-snapshot` resource updates automatically (regenerated by `scripts/generate_schema_docs.py`).
- Hand-written tool descriptions (the long ones) do *not* update — they're written by humans and need editing when entities change shape enough that the description is stale. This is acceptable; the snapshot resource is the comprehensive truth, the tool descriptions are the high-signal summaries.

**The trade-off this captures:** static tool descriptions risk drift; fully-generated tool descriptions don't read well to the model. The hybrid — static framing, registry-derived enums and validation, resource-served comprehensive schema — gets the best of both.

---

## Worked examples

### Example 1 — Drafting prose about a scene

User in Claude Desktop: *"Write a short paragraph describing the visual mood of scene 23 of Arcadia."*

Claude:
1. Calls `get_scene_context(scene_id=23)` — receives scene record, location ("Carbon Crossing Sheriff's Office"), the active baseline `location_variant` (midday, summer), `scene_color_palette` (dominant amber and tarnished slate, low saturation), `lighting_design` (high-contrast practical light from one west-facing window, otherwise gloom), `tone_marker` (oppressive, contained menace), characters present (Snapper, Hannah), beats in order.
2. Writes the paragraph, grounded in the actual color/lighting/tone data the project author wrote, with specific references rather than generic atmosphere.

No copy-paste. The structured data the format exists to provide does what it was designed to do.

### Example 2 — Prompt assembly for image generation

User: *"I want to generate a still of Snapper in shot 47C. Pull together what I'd need."*

Claude:
1. Calls `resolve_cascade(shot_id=47C, subject_type='character', subject_id=Snapper, modality='visual')`. Receives: resolved at step 1 (active override). Primary source: bundle `Snapper — partial transformation`, assets enumerated. Active override: `character_shot_override` with `progression_axis=transformation`, `progression_value=0.15`, visual_delta describing faint amber catch in eyes, no hair growth, brow ridge unchanged. Verification anchors: three verified visual anchors of Snapper.
2. Calls `get_scene_context(scene_id=47)` for environmental context — location, color palette, lighting.
3. Composes a prompt block including: the bundle's `coverage_summary` and asset list, the override's visual delta, the scene's color and lighting, and a list of verification anchors to QA the output against.

What was a 30-minute "go gather all this" task before becomes a single conversational request.

### Example 3 — Continuity question

User: *"Does the locket appear in scene 31? And what state is it in?"*

Claude:
1. Calls `list_entities('prop', filters={'name': 'locket'})` to find the locket. Resolves to prop ID.
2. Calls `find_appearances('prop', locket_id)` to see scenes. Confirms scene 31 is in the list.
3. Calls `resolve_cascade(shot_id=<any shot in scene 31>, subject_type='prop', subject_id=locket, modality='visual')`. Receives: variant-scoped binding wins, `variant_id` resolves to `prop_variant.name = "Locket — broken"`.
4. Answers: "Yes, the locket appears in scene 31 — in its broken variant (the binding scoped to scene 31 onward uses the 'broken' prop_variant). The break happens between scenes 29 and 31, per the variant's `state_trigger`."

This is the format's structured data answering a question that would otherwise live in the author's head.

### Example 4 — Reading the project as a new collaborator

A VFX supervisor opens the project for the first time, wanting to understand what they're walking into.

User: *"Give me a one-page brief on this project — what it is, where it stands, what the major creative decisions are."*

Claude:
1. Calls `get_project_overview()` — receives name, logline, workflow_mode, production_status, counts.
2. Calls `list_entities('character', filters={'role': 'protagonist'})`, then `get_character_profile` on the result.
3. Reads `scf://docs/format-overview` (resource) for context on what kind of file this is.
4. Calls a few Tier 1 entity fetches: `visual_identity`, `cinematographic_philosophy`, `project_tone`, `sonic_identity`.
5. Calls `get_story_structure()` for shape.
6. Writes a one-page brief.

The new collaborator gets to a working understanding of the project in five minutes of conversation rather than an afternoon of document reading.

---

## Phased delivery

The smallest viable server first, expanding based on actual use. Each phase is independently shippable.

### Phase 1 — Minimum viable (1 weekend)

Five read tools, four resources, no parameter validation beyond basics. Goal: prove the loop works end-to-end with one project loaded in Claude Desktop.

- Tools: `get_project_overview`, `list_entities`, `get_entity`, `get_scene_context`, `query_screenplay`.
- Resources: `scf://project`, `scf://scene/{id}`, `scf://character/{id}`, `scf://docs/format-overview`.
- Hardcoded project path. No schema-derived validation yet.

### Phase 2 — Cascade and context (1 week)

Add the marquee tools.

- `resolve_cascade` — the central new tool, including all five steps and all subject types.
- `get_character_profile`, `get_story_structure`.
- `find_appearances`.
- Resources: shot, prop, location resources; schema-snapshot resource.
- Begin description iteration based on Phase 1 usage observations.

### Phase 3 — Query depth and schema awareness (1–2 weeks)

- The predefined query tools: `find_clips`, `character_journey`, `location_breakdown`, `character_crossover`.
- `find_clips_covering_line`.
- Schema-derived parameter validation across all tools.
- Resource: `scf://docs/conventions`, `scf://docs/schema-reference`.
- Description revision pass based on accumulated usage.

### Phase 4 — Write operations (separate proposal)

Not in this document. Writing through an MCP server needs its own design pass covering: confirmation patterns (propose-then-commit vs direct), undo, dry-run output, audit logging, lifecycle-aware change semantics (a model should never overwrite an active record; it should supersede it). Estimated effort: at least as much as Phases 1–3 combined.

---

## Open decisions

### Cascade tool: monolithic vs composable

`resolve_cascade` as designed is a single tool that walks all five steps and returns a composed answer. Alternative: expose the five steps as separate tools (`get_active_override`, `get_shot_coverage`, `resolve_bindings`, `get_baseline_binding`, `get_verification_anchors`) and let the model compose them.

The monolithic version is easier for the model to use correctly and produces consistent output. The composable version is more flexible but requires the model to compose them in the right order and handle the per-modality short-circuit logic itself.

Leaning monolithic for v1 — the cascade is a deterministic algorithm, not something the model should be reimplementing. If specific use cases emerge for individual steps, add them as additional tools later. Erring toward "model has fewer decisions to make" is the right default.

### Returning full assets vs asset references

Cascade resolution returns asset records. Those include file paths. The path is on the user's filesystem; the host can't display the image directly, but the model can mention it, and an external tool could pick up the path.

Options:
- *Return path only.* Smallest payload, model can't inspect images.
- *Return path + dimensions + format hints.* Default. Model has enough to describe but can't see.
- *Return base64-encoded image data.* Largest payload, model can actually see the references via vision. Useful for visual-identity bundles especially.

Phase 1 returns path + metadata. Phase 2 or 3 could add an option to inline base64 for vision-capable models when the user's request needs it (e.g. "verify this generated frame matches the canonical anchor" — useful only if the model can see both).

### Multi-project switching

For v1, restart-to-switch. If usage shows the friction is high, add a `set_project(path)` tool that swaps the open database. Pushed back because: (a) it complicates the server's state model, (b) it raises auth concerns once paths can be passed in, (c) most workflows are "open one project, work on it for a session."

### Schema-derived tool descriptions

Currently the design has hand-written tool descriptions with registry-derived enums and validation. Alternative: generate the entire description from entity metadata.

Generated descriptions risk reading poorly to the model (they tend toward technical and underspecified). Hand-written descriptions risk drift. The hybrid is the chosen path, but if drift turns out to be a bigger problem than expected, more of the description could come from registry data — entity descriptions, category descriptions, field descriptions are all already authored in the registry.

### Resource freshness

Resources are computed on each request. For a small project this is fine. For large projects with deep `get_scene_context` calls, there's a case for caching. Deferred — measure first, optimize if needed.

### Logging and observability

The MCP server runs in the user's environment, calling functions that touch their data. Some level of logging is good (errors, slow queries) but it can't leak project content to anywhere external. Local file logging by default; opt-in for anything more. Worth spelling out before shipping.

---

## What's deliberately deferred

- **Write tools.** Separate proposal, gated on Phase 1–3 yielding usage patterns that inform what writes should look like.
- **Remote/HTTP transport.** Local stdio is right for solo authoring. Remote needs auth, multi-tenancy, project isolation — all separable concerns.
- **Authentication.** Local server doesn't need it. Remote will.
- **Multi-project serving.** One server per project for v1.
- **A "watching" mode** where the server notifies on changes. Useful for cross-host collaboration; not a v1 concern.
- **Cross-project queries.** "Find every Arcadia-like project I've made." Requires a project index that doesn't exist.
- **Image-aware tools.** Tools that take an image and return SCF data (e.g. "find the anchor most similar to this generated frame"). Genuinely useful but a different problem class.
- **Performance tuning.** The server design assumes projects up to a few thousand entities — comfortable for SQLite, comfortable for tool response sizes. Larger projects may need pagination, query result streaming, or selective field inclusion. Address when it becomes real.
- **An MCP server for Brainboard.** Different project, different proposal.

---

## Why this is the right next thing

SCF's format-first thesis says structured creative data should be accessible to AI tools. The schema makes the data structured. The editor makes it authorable. What's missing is the conduit from "structured authored data" to "AI tool consuming it." MCP is that conduit, designed exactly for this problem, with one weekend's worth of plumbing to get the loop closed.

Once the loop is closed, the work that follows is iterative — better tools, deeper context assembly, eventually writes — and each piece compounds. Right now the gap is binary: either you can ask Claude about your project conversationally with its structure intact, or you can't. Closing that gap is more valuable than any single tool added afterward.

The risk of waiting is that the patterns get set in tools that aren't designed for SCF — generic Claude integrations, ChatGPT custom GPTs, copy-paste rituals — and SCF becomes one of many formats that's structured but not actually consumed structurally. Building the server early shapes how SCF is used; building it late means SCF inherits whatever the ecosystem decided in the meantime.
