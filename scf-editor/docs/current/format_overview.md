# SCF Format Overview

*The Story Context Framework (SCF) is a structured data format for describing films and other narrative works. This document is the entry point for understanding what SCF is, why it exists, and how it's organized.*

For specific rules and conventions (status enums, versioning mechanics, reference field semantics), see `conventions.md`. For the current state of the schema, see `schema_reference.md` (auto-generated from `entity_registry.py`).

---

## What SCF is

SCF captures the complete creative intent behind a film: not just what happens (plot, characters, dialogue) but the design decisions behind every shot, every voice, every color choice, every recurring motif. It treats this information as queryable structured data rather than buried in scripts, treatments, mood boards, and the heads of a few key people.

A `.scf` file is a SQLite database with a defined entity schema. Every entity type has its own table. Every entity has a unique ID and timestamps. Relationships between entities are foreign keys. The schema is the contract; any tool that understands the schema can read and write SCF files.

SCF is to film storytelling what USD is to 3D scenes: a composable, addressable, tool-agnostic format that any application can read from or write to. A color pipeline reads the color entities. An image generator reads character appearance and location atmosphere. A dialogue tool reads vocal profiles and speech patterns. Each tool consumes the layer it needs and ignores the rest.

## Why SCF exists

Film production has many tools, and most of them care about a specific slice of the work. Screenplays live in Final Draft, Highland, or Fountain. Production tracking lives in ShotGrid, ftrack, or spreadsheets. Mood boards live in Milanote or Frame.io. Asset management lives in production servers and DAMs. Each captures a fragment of the truth; none of them carry the whole creative picture in a form other tools can consume.

This fragmentation hurts everywhere, but it hurts most in two places:

**At the boundary between creative authoring and generative tooling.** When an AI image generator needs to know what a character looks like, what a location feels like, what color a scene should be — that information lives in a document somewhere, written for human readers, not addressable by tools. A treatment describes a character's wardrobe in a paragraph; an image generator can read the paragraph but it can't query "what's this character wearing in scene 47?" without a human to parse the answer.

**At the boundary between creative intent and production execution.** A director's reasoning for a creative choice — why this lens, why this color, why this performance note — often lives only in conversations and meetings. Six months later in post, those reasons can be lost, leading to drift between the intended film and the finished one.

SCF addresses both by making creative intent structured, addressable, and shareable. It's not a replacement for any specific authoring tool — it's the interchange format that lets those tools talk to each other and to the AI tools that will increasingly augment production.

## What SCF is not

SCF is deliberately not:

- **A production tracker.** It doesn't model contracts, budgets, scheduling, vendor relationships, or approval workflows. Tools like ShotGrid, ftrack, and OMC-aware production systems exist for that.
- **A screenplay editor.** SCF includes screenplay structure (line-by-line storage, scene/act/sequence organization) but isn't trying to replace Final Draft as a writing tool. It can ingest and emit Fountain.
- **A DAM or media server.** Assets are referenced by path in SCF; the actual files live in whatever storage system makes sense for the project.
- **An opinionated AI tool wrapper.** SCF doesn't know or care about LoRAs, IP-Adapters, ElevenLabs, or any specific generation technique. It describes what the story is; tools decide how to generate from it.

## Design principles

**The schema is the product.** Tools come and go; the format must outlive them. Every concept has a stable schema definition with field-level types and relationships, documented and versioned. A tool that disappears doesn't take its data with it — another tool can pick up the file.

**Every concept is its own entity.** Visual Identity is not a tab on Project. It is its own table with its own fields, queryable and addressable independently. A tool that needs to know the project's aesthetic genre reads `visual_identity` without parsing unrelated Project fields. This mirrors USD's principle that materials, lights, cameras, and geometry are separate prims composed together, not attributes jammed onto geometry.

**Incremental population.** A `.scf` file is useful at 5% populated (just a project name, some characters, and scene headings) and becomes progressively richer as more entities are authored. No entity is required for the format to be valid. Empty tables are fine.

**Tool-agnostic media references.** Media doesn't live in entity fields. Instead, the format uses bundles — named, intent-typed collections of assets with structured format hints. A tool reads the bundle, decides if it can consume the assets, and proceeds. The format describes what's available; the tool decides how to use it.

**Context inheritance.** Project-level entities establish defaults that scene-level entities specialize. A tool generating output for a scene walks up the chain: scene-level → sequence-level → project-level, using the most specific data available. Inheritance is a consumption convention, not a database constraint.

**Preservation over deletion.** The schema favors lifecycle state transitions over physical deletion. A cut character isn't removed from the file; their `lifecycle_status` changes. A superseded version isn't deleted; the new version supersedes it. History is queryable by default.

**Format defines lineage; tools define policy.** Versioning structure (parent chains, supersession relationships, lifecycle states) lives in the format. When to version, who can promote, what triggers a bump, and approval policies live in the tool. SCF gives tools the substrate to implement any policy; it doesn't impose one.

**Independence from production standards.** SCF is not an OMC extension, not an OMC profile, not dependent on OMC's governance or release cycle. Where SCF and other formats happen to mean the same thing, terminology alignment is welcome. Where they don't, SCF reserves the right to its own design.

## How the schema is organized

### Layers (conceptual)

SCF's conceptual model has three layers, inherited from the SSF specification:

- **Vision Layer** — the *why*. Director's intent, themes, emotional architecture, audience manipulation strategies.
- **Performance Layer** — the *who and how* of the characters. Physical and vocal profiles, performance beats, choreography, physical interaction.
- **Creative Layer** — the *what* of the visual and sonic world. World design, character appearance, color, cinematography, sound design, music.

These layers describe the conceptual domains the schema covers. Every entity traces back to a specific layer and sub-layer. The layer model is documented in `schema_reference.md` per-entity.

### Categories (functional grouping)

The editor and reference documents organize entities by *functional category* — what you're working on — rather than by conceptual layer. This means "Character Depth" groups physical profile, vocal profile, costumes, and habits together, even though those span the Performance and Creative layers. Categories include:

- Project / Story Entities / Story Structure / Connections (the structural bones)
- Creative Direction (project-level singletons)
- Character Depth / Location Depth (per-entity detail)
- Scene Detail (per-scene creative data)
- Thematic Tracking (motifs, symbols, subtext, color identity)
- Production (shot-level, performance execution)
- Metadata (decisions, notes, assets)

### Tiers (population order)

Tiers describe the natural order of population during story development:

- **Tier 0** — Structural Foundation: project, characters, locations, scenes, story structure
- **Tier 1** — Creative Direction: project-level singletons (visual identity, color palette, tone, sonic identity)
- **Tier 2** — Character & Location Depth: per-entity structured detail
- **Tier 3** — Scene Detail: per-scene creative data
- **Tier 4** — Thematic Tracking: motifs, symbols, subtext, color identity
- **Tier 5** — Emotional Architecture: arcs and beats
- **Tier 6** — Production: shot-level, performance execution, choreography

Tiers are not access levels or feature gates. All tiers are available from day one. The tier system is a guide for authors (what to fill in first) and a compatibility contract for tools (what data you can expect at each stage of development).

## How files work

A `.scf` file is a SQLite 3 database containing:

- **Entity tables** — one per registered entity type. Each has `id`, `created_at`, `updated_at` plus entity-specific columns.
- **`_scf_meta`** — key/value metadata: format version, last update timestamp, schema version.
- **Screenplay tables** — `screenplay_lines` (line-by-line structured screenplay), `screenplay_title_page`, `screenplay_versions` and their child tables.
- **`entity_images`** — reference image metadata (files stored in `sourcefiles/` directory alongside the database).

The entity tables are auto-created from the entity registry on database initialization. Adding a new entity type to the registry creates the table on next open. Adding new fields to an existing entity triggers an `ALTER TABLE ADD COLUMN` migration.

Reference fields store integer IDs pointing to other entity tables. These are semantically foreign keys that tools should resolve. SQL `FOREIGN KEY` constraints are not enforced in the entity tables, to allow flexible authoring — but renaming an entity's `name` field doesn't break references because the integer ID is stable.

## The relationship to other formats

**USD (Universal Scene Description).** Conceptual ancestor. SCF borrows USD's design philosophy: composable, addressable, tool-agnostic, format-first. SCF is to story what USD is to 3D scenes.

**SSF (Story State Framework).** Direct ancestor. The original SSF specification defined the conceptual model — layers, sub-layers, ~100 entity definitions. SCF preserves the full SSF model but reorganizes it for practical authoring (functional categories instead of layer-by-layer organization) and adds the bundle pattern, performance corpus, and workflow infrastructure that SSF didn't include.

**Fountain.** Screenplay text format. SCF's screenplay editor can ingest Fountain and emit Fountain. Fountain is a serialization; SCF is a database.

**OMC (Open Media Creation).** MovieLabs' production-workflow interchange standard. SCF is independent of OMC. Optional `external_id` and `external_id_namespace` fields on bridgeable entities (project, asset, actor, character, scene, shot, take, clip) serve interop without committing to OMC compliance. See `conventions.md` for the OMC posture in detail.

## Where to go from here

- **Working with the format:** see `conventions.md` for the specific rules.
- **The current schema:** see `schema_reference.md` (auto-generated from `entity_registry.py`).
- **Design history:** see `docs/design/` for dated design documents capturing how specific clusters evolved.
- **Active design work:** see `docs/ai_context/active_design_work.md`.
- **AI session priming:** see `docs/ai_context/schema_snapshot.md` for the compact reference suitable for dropping into a chat.
