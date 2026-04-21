# Semantic Screenplay IDE — Specification v0.3

> **Context:** This document specifies a React implementation of the Screenplay IDE. It is designed as a feature-complete upgrade to the existing Scene Editor (`scene_editor.md`). All backend API routes, the SQLite schema, and the `screenplay_lines` storage model are inherited from that editor and extended — not replaced. Where this spec is silent on a behaviour, the existing editor's behaviour applies.

---

## 1. Core Philosophy: The Semantic Script

This IDE treats every element of a script as a **Database Entity**. The goal is to bridge creative writing and production data (VFX, prop lists, cast tracking). The tool is **single-user and single-session** — there is no concurrent editing, and no conflict-resolution system is required.

The key upgrade over the existing editor is an **entity state machine**: rather than silently auto-creating all entities on save, the IDE distinguishes between entities the user has deliberately linked to a DB record (Committed) and text that merely looks like an entity but has not yet been resolved (Staged). This gives writers the freedom to type freely while giving production coordinators confidence that every underlined name is a real DB record.

### Entity State Machine

Entities (Locations, Characters, Props) exist in two states:

| State | Visual Indicator | Database Status | How it's created |
| :--- | :--- | :--- | :--- |
| **Staged** | Dotted underline | Local only; temporary ID | User types a name and exits autocomplete without selecting a DB record |
| **Committed** | Solid underline | Permanent DB record with unique ID | User selects an existing record *or* chooses "Create new" from autocomplete |

- **Faint background tinting:** Blue = Locations, Green = Characters, Purple = Props.
- **Prop renames** propagate immediately across the script since the tool is single-user — there is no stale-reference problem.
- **Auto-linking by exact match:** If the user types a name that exactly matches a committed entity already in the DB (case-insensitive), the system silently upgrades it to a committed link without requiring autocomplete interaction.

### Relationship to the Existing Auto-Create Behaviour

The existing editor auto-creates characters and locations on every save. The IDE **preserves this behaviour for committed entities** — a committed character cue still triggers entity creation and `scene_character` junction updates on save. Staged entities, however, are not auto-created; they remain local until the user promotes them. This is a strict superset: a script with no staged entities behaves identically to the existing editor.

---

## 2. Autocomplete & Entity Commitment

This is the primary mechanism for creating and linking entities. The same flow applies to **Characters, Locations, and Props**.

### Trigger Conditions

- **Characters:** Any text on a Character-mode line.
- **Locations:** The location segment of a scene heading (after `INT.`, `EXT.`, or `INT./EXT.`).
- **Props:** `Ctrl+P` with a text selection, or `Ctrl+P` with no selection to insert.

### Autocomplete Flow

1. As the user types (e.g., `bob`), the system queries the DB for fuzzy-prefix matches and displays a dropdown.
2. The dropdown shows ranked matches (e.g., `Bobby`, `Bob Odenkirk`) followed by a **"Create 'bob'"** option at the bottom.
3. **Tab** or **Enter** selects the highlighted item.
4. Selecting an existing record: entity becomes **Committed** immediately.
5. Selecting **"Create 'bob'"**: a new DB record is created and the entity becomes **Committed** immediately.
6. **Escape** or **double-Space**: dismisses the dropdown. The text remains **Staged** (dotted underline, local temporary ID). This allows the user to finish typing a multi-word name (e.g., `Bob Odenkirk`) before the system can offer the right match.

The autocomplete dropdown supports keyboard navigation (↑/↓ to select, Enter/Tab to accept, Escape to dismiss) — matching the existing editor's dropdown behaviour.

### Staged Entity Lifecycle

- A staged entity has a local temporary ID attached to its text range.
- The user can promote a staged entity to committed at any time by placing the cursor on it and pressing `Ctrl+P` (or the appropriate entity shortcut) to re-invoke autocomplete.
- Staged entities are **never automatically committed** by saving. They persist as staged until the user explicitly promotes them.

### Exact-Name Auto-linking

When a user finishes typing a token (i.e., moves off the line or exits the entity entry mode) and the typed string is an **exact, case-insensitive match** for a committed entity of the correct type, the system automatically upgrades it to a committed link. No prompt is shown. This prevents duplicate staging of already-known entities.

---

## 3. Screenplay Format

The editor targets the **Fountain** screenplay format. Every line has a classified type, stored in the `line_type` column of `screenplay_lines`. The full type set is inherited from the existing editor:

| Type | Description | Display |
| :--- | :--- | :--- |
| `heading` | Scene heading (`INT. LOCATION - DAY`) | Bold, uppercase |
| `action` | Action/description text | Normal |
| `character` | Character cue (uppercase name, optional `(V.O.)` / `(O.S.)`) | Centered, uppercase |
| `dialogue` | Dialogue following a character cue | Indented |
| `parenthetical` | Stage direction in parentheses | Italic, indented |
| `transition` | `CUT TO:`, `FADE OUT:`, etc. | Right-aligned, uppercase |
| `blank` | Structural whitespace (stripped on save, rendered via CSS) | — |
| `section` | `# Act One` section markers | Styled header |
| `synopsis` | `= Brief scene summary` | Italic, muted |
| `centered` | `> Centered text <` | Centered |
| `title_page` | `Title:`, `Author:`, etc. key-value metadata | Metadata block |
| `boneyard` | `/* commented out */` | Muted |

Classification is stateful: `character` lines implicitly make the next non-blank line `dialogue`. On import or large paste, the classifier automatically corrects character/dialogue sequence mismatches (dialogue pair repair, inherited from the existing editor).

---

## 4. Keyboard & Input Schema

### The Mode Carousel (Blank Line `Tab` Logic)

On an empty line, `Tab` cycles through the five modes inherited from the existing editor, extended with the dual-dialogue shortcut:

```
Description → Scene → Character → Dialogue → Transition → (back to Description)
```

| Mode | Behaviour |
| :--- | :--- |
| `description` | Plain action text |
| `scene` | Auto-uppercases input; inserts heading structure; triggers `INT.`/`EXT.` Tab-completion |
| `character` | Auto-uppercases input; next line becomes dialogue; triggers character autocomplete |
| `dialogue` | Indented dialogue block |
| `transition` | Auto-uppercases; right-aligned |

**Double-Enter shortcut:** pressing Enter twice quickly inserts a new scene heading line (inherited from existing editor).

### Scene Headings

- Typing `I` or `E` on a fresh line (or entering Scene mode) offers `INT.` / `EXT.` / `INT./EXT.` via Tab-completion.
- Once the prefix is confirmed, the cursor enters **Location Mode**: the autocomplete system queries the location DB, and the staged/committed flow (§2) applies.
- After the location segment, a ` - ` separator is inserted and time-of-day suggestions are offered: `DAY`, `NIGHT`, `MORNING`, `AFTERNOON`, `EVENING`, `DUSK`, `DAWN`, `CONTINUOUS` (inherited from existing editor).

### Dual Dialogue

- On a Character-mode line with a name already entered, pressing `Tab` adds a second character name to the same line for side-by-side dialogue.
- A third `Tab` adds a third character slot (if supported by the renderer).
- Pressing `Enter` from the character line exits into normal dialogue entry — one dialogue block per character column.
- Exiting dual dialogue: pressing `Enter` at the end of all dialogue blocks returns to Description mode.

### Props

- **`Ctrl+P` with selection:** Opens the "Link to Prop" autocomplete using the selected text as the seed query.
- **`Ctrl+P` with no selection:** Opens a prop-search autocomplete to insert a known or new prop inline.
- Same staged/committed flow as characters and locations.

### Global Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+S` | Save to draft slot (see §7) |
| `Ctrl+Enter` | Insert manual page break |
| `Ctrl+Z` | Undo (see §6) |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+F` | Entity-aware find (see §9) |

---

## 5. UI & Structural Hierarchy

The interface is divided into three resizable panels. Panel widths are persisted in `localStorage`. Panels are resizable via drag handles (inherited from existing editor).

### Left Panel: Production Navigator

Combines the existing editor's **Entity Tree** with a new **Act grouping** layer:

```
▾ Script Title
  ▾ Act 1           ← navigator-only grouping; no in-text marker
    ▾ Scene 1 — INT. KITCHEN - DAY
        CHARACTERS: Bob, Alice
        PROPS: Coffee mug, Newspaper
    ▾ Scene 2 — EXT. STREET - NIGHT
        CHARACTERS: Bob
  ▾ Act 2
    ...
  ─ (ungrouped scenes below)
```

**Acts are a navigator-only concept.** They have no counterpart in the main editor text and no `section` line is inserted. To create an Act:

1. Multi-select scenes in the navigator (Shift-click or Ctrl-click).
2. Right-click → **Group into Act**.
3. Name the act inline.

Acts can be renamed, reordered by drag-and-drop, and disbanded (scenes return to the root level).

**Clicking a scene item** scrolls the editor to that scene's heading. **Clicking a Character or Prop** under a scene scrolls to their first occurrence within that scene.

Act groupings are persisted in a new `scene_act_groups` table (see §8).

### Center: The Editor & Pagination

- **Auto-pagination:** Text reflows onto new pages at industry-standard line counts (approximately 55 lines per page, configurable). This is a display-only feature — page breaks are not stored in `screenplay_lines`.
- **Sticky header:** The current page number (e.g., `PAGE 14`) sticks to the top of the viewport as the user scrolls. Clicking it scrolls to the top of that page.
- **Gutter page numbers:** Clicking a page number in the gutter snaps that page to the top of the viewport.
- **Page breaks:** Manual breaks via `Ctrl+Enter`; auto-breaks are shown with a faint rule and are not editable.
- **Save indicator** (inherited from existing editor): toolbar shows `Unsaved •` / `Saving…` / `Saved ✓`.

### Right Panel: Entity Properties & Navigator

The right panel is context-sensitive. When the **cursor is within or adjacent to a committed entity**, it shows the Entity Properties view:

- **Prop:** Reference images, department notes, scene list.
- **Character:** Backstory fields, casting notes, scene list.
- **Location:** Set notes, department breakdowns.

**Refactoring actions available in this panel:**

- **Unlink:** Demotes the entity back to Staged. The text remains; the DB association is removed.
- **Modify Link:** Opens autocomplete to swap the current DB link for a different entity without changing the text.
- **Rename Entity:** (Committed entities only) Renames the DB record and propagates the new name across all occurrences in the script immediately.

When the **cursor is not inside an entity span**, the panel falls back to the **Navigator view** (inherited from existing editor):

- **Scene list:** Scene number, heading text, character count. Clicking scrolls the editor to that heading. A status bar shows the current scene and characters present.
- **Character list:** All characters with scene appearance counts. Clicking filters the scene list to only scenes that character appears in.
- **Location list:** All locations with scene counts. Clicking filters the scene list to only scenes at that location.

Filters are cleared by clicking the active filter again or pressing Escape.

---

## 6. Undo Model

### Scope

Undo covers both **text changes** and **entity state changes** (commit, unlink, rename). The undo stack is maintained in-memory for the session.

### Implementation

Use CodeMirror 6's built-in `HistoryField` for text changes, extended with a custom transaction annotation to attach entity state snapshots. Each undo step contains:

- The CodeMirror document diff (handled natively).
- A delta of the `EntityStateField` (the mapping of text ranges to entity IDs and states).

When `Ctrl+Z` is issued:

1. CodeMirror reverts the document diff.
2. The entity state delta is reversed: promoted entities revert to staged, newly created DB records are soft-deleted (flagged `deleted: true` in the DB, not physically removed), and renamed entities revert to their previous name.

**Soft deletes** are the key to safe DB undo. A "Create new entity" action writes to the DB immediately but is reversible because the record carries a `deleted` flag. The record is only permanently cleaned up on session end or explicit user action.

### Session Boundary

The undo stack is cleared when the user closes the script or logs out. There is no cross-session undo. The versioning system (§7) provides the coarser-grained recovery mechanism for work across sessions.

### Limits

Cap the in-memory undo stack at a reasonable depth (e.g., 500 steps or ~5MB of state deltas, whichever is hit first). When the cap is reached, the oldest entries are evicted. The user is informed once when the stack has been trimmed.

---

## 7. Save & Versioning

The IDE extends the existing editor's save and version system. The existing `PUT /api/screenplay-v2/save` full-replace behaviour is preserved; the IDE adds an autosave draft slot and an entity annotation layer on top.

### Autosave

- The script autosaves to a **draft slot** every 30 seconds (or on idle after 5 seconds of inactivity).
- The draft slot is a single overwriting record — it does not appear in the version history.
- Autosave persists the current `screenplay_lines` content **and** the entity annotation map (staged/committed states and span positions). It does not change entity states.

### Manual Save (`Ctrl+S`)

- Runs the same full-replace pipeline as the existing editor (`PUT /api/screenplay-v2/save`):
  1. Replaces all `screenplay_lines` rows for the project.
  2. Parses scene headings → extracts `int_ext`, `location`, `time_of_day`.
  3. Auto-creates any **committed** character or location entities (staged entities are skipped).
  4. Rebuilds the `scene_character` junction table from committed character cues only.
  5. Returns a sync summary (counts of created/updated scenes and entities, plus count of staged entities pending review).
- Persists the entity annotation map to `screenplay_line_annotations` (see §8).
- Does **not** create a version entry.
- Does **not** auto-commit staged entities.
- Updates the toolbar save indicator.

### Publish Version

- Explicit user action via "Publish" button in the toolbar or File menu.
- Calls `POST /api/screenplay-v2/publish` (existing endpoint), which creates a named, timestamped, immutable snapshot.
- The snapshot includes the entity annotation map so staged/committed state is preserved across versions.
- Staged entities are flagged in the version snapshot but remain staged — publishing does not commit them.
- The user may optionally add a version label (e.g., `"Draft 3 — director review"`).
- Each published version records: name, description, timestamp, scene count, character count, location count, staged entity count.

### Version History

- Accessible from a "History" panel or `GET /api/screenplay-v2/versions` (existing endpoint).
- Each version shows: timestamp, label, page count, staged entity count.
- **Restore** (`POST /api/screenplay-v2/restore/{version_id}`) replaces the current draft, `screenplay_lines`, and entity annotation map. The user is warned before restore.
- **Delete** (`DELETE /api/screenplay-v2/versions/{version_id}`) removes the snapshot.

---

## 8. Storage Model

### Canonical Source of Truth: `screenplay_lines`

The `screenplay_lines` table (existing schema) is the canonical form of all script content. Fountain text is never stored as a flat file. This replaces the custom `.scrn` format that was proposed in earlier versions of this spec.

The existing save pipeline (full replace on `Ctrl+S`) is retained exactly.

### Entity Annotation Extension

Entity span data (the staged/committed map) is stored in a new `screenplay_line_annotations` table rather than in the line text itself:

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | PK | Auto |
| `project_id` | FK | Project this annotation belongs to |
| `line_id` | FK → `screenplay_lines` | The line containing the span |
| `char_from` | int | Start character offset within the line's `content` |
| `char_to` | int | End character offset (exclusive) |
| `entity_type` | enum | `character`, `location`, `prop` |
| `entity_state` | enum | `staged`, `committed` |
| `entity_id` | int / null | FK to the relevant entity table; null if staged |
| `staged_local_id` | text / null | Temporary UUID for staged entities; null if committed |

Annotations are saved atomically with `screenplay_lines` on `Ctrl+S` and autosave. When a save replaces all `screenplay_lines` rows, all `screenplay_line_annotations` for that project are also replaced.

### Act Groupings Extension

Act groupings (navigator-only structure) are stored in a new `scene_act_groups` table:

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | PK | Auto |
| `project_id` | FK | |
| `act_name` | text | Display name (e.g., `"Act 1"`) |
| `act_order` | int | Position among acts |
| `scene_ids` | JSON array | Ordered list of `scenes.id` values in this act |

Ungrouped scenes are not referenced in this table and appear below the act groups in the navigator at their natural `scene_number` order.

### Soft Delete for Undo

All entity tables (`characters`, `locations`, `props`) gain a `deleted` boolean column (default `false`) to support entity-level undo (§6). A soft-deleted entity is excluded from all autocomplete queries and navigator lists. Records are permanently removed on session end or explicit user purge.

### Blank Line Handling

Blank lines are stripped on save and rendered via CSS margins, matching the existing editor's behaviour.

---

## 9. Search & Replace

The find system (`Ctrl+F`) is entity-aware:

- **Text search:** Standard substring/regex matching.
- **Entity search:** Filter by entity type (Character, Prop, Location) and state (Staged, Committed). Useful for finding all unlinked props before a production deadline.
- **Replace:** Text replace works as normal. If the replaced text was a committed entity span, the user is prompted: "This will unlink the entity. Proceed?"
- **Entity rename propagation** (via the right panel, not find/replace) is the recommended way to rename entities across the script.

---

## 10. Copy & Paste

Entity spans are treated as **rich text** — their metadata travels with the copied content.

### Copying

When the user copies a range containing entity spans, the clipboard carries both the plain text and a serialized form of any entity annotations within that range.

### Pasting

- **Within the same document:** Entity IDs are preserved exactly. Pasting a committed entity span creates another occurrence linked to the same DB record — this is correct and expected (the same character can appear many times).
- **Across documents (future):** Entity IDs are matched against the target document's DB. Exact ID matches are re-linked directly. Non-matching IDs are demoted to staged for user review.
- **Plain-text paste** (e.g., from an external source): Pasted text goes through the same exact-name auto-linking pass (§2) on entry — if a character name is recognized, it is silently committed.

---

## 11. Import & Export

### Fountain Import

A Fountain parser handles the initial import of existing `.fountain` files:

1. The parser identifies scene headings, character names, dialogue, and transitions via Fountain syntax rules.
2. After parsing, it runs the entity-linking pass: each detected character name and location is looked up in the DB.
3. Exact matches are auto-committed. Non-matches are created as staged.
4. The user is shown a post-import summary: *"12 characters linked, 3 staged (review needed), 8 locations linked, 1 staged."*
5. The imported script is saved into `screenplay_lines` via the standard save pipeline. The original `.fountain` file is not modified.

Known Fountain edge cases deferred for future specification: dual-dialogue (`^` suffix), forced elements, notes (`[[...]]`).

### Export

- **PDF:** Industry-standard screenplay formatting. Committed entities are rendered as plain text (no visual indicators). Auto-pagination (§5) defines page breaks.
- **Fountain:** A lossy export that strips entity annotations and act groupings. Useful for sharing with tools that consume `.fountain`. Staged/committed distinctions are lost.
- **Production Reports:** Scene breakdowns — prop lists, character lists, location lists — exported as PDF or CSV. Templates are configurable per production (deferred to a separate spec).

---

## 12. Entity Browser Integration

The IDE links into the existing Entity Browser (`/browse`) via query parameters, preserving all existing behaviour:

- Open the full scene detail editor for any scene.
- Open a character or location entity for detailed editing, including reference images (drag-and-drop gallery, lightbox viewer).
- Entity browser changes trigger a refresh of the left-panel production tree.

### Inline Relationship Linking (existing)

From the entity browser, relationships can be managed as chips:

| Relationship | Junction Table | Editable Fields |
| :--- | :--- | :--- |
| Scene ↔ Character | `scene_character` | `role_in_scene`, linking notes |
| Scene ↔ Prop | `scene_prop` | `significance`, `usage_note` |
| Scene ↔ Sequence | `scene_sequence` | order |

---

## 13. Query & Analytics

The existing Query Explorer is inherited unchanged. Pre-built queries remain accessible at `GET /api/query/{query-name}`:

| Query | Description |
| :--- | :--- |
| Character Journey | All scenes a character appears in, with roles and co-characters |
| Location Breakdown | All scenes at a location with characters and props |
| Scene Context | Full scene data: characters, props, emotional beat, visual/sound notes |
| Character Crossover | Scenes where two specific characters appear together |
| Project Stats | Entity counts, top characters by appearances, unused entities, **staged entity count** |

The Project Stats query gains a **staged entity count** field so production coordinators can see at a glance how many entities still need review.

---

## 14. Technical Implementation (CodeMirror 6)

### Parser (Lezer)

A custom Lezer grammar handles Fountain-style syntax:

- Scene headings, character lines, dialogue, parentheticals, transitions, and descriptions are distinct node types.
- Entity spans are a **separate layer** — they are not part of the Lezer grammar but are applied as decorations via `StateField`.

### StateField & Decorations

- **`EntityStateField`:** Maintains a `RangeSet` mapping text positions to `{ entityId, state, type }`. This field is updated on every document change via CodeMirror's transaction system, so entity links track their positions through insertions and deletions automatically.
- **Decorations:** `Decoration.mark` is used for underlines (dotted = staged, solid = committed) and faint background highlights. Decorations are derived from `EntityStateField` in a `ViewPlugin`.
- **Transaction annotations:** Custom annotations (e.g., `EntityCommitAnnotation`, `EntityUnlinkAnnotation`) are attached to transactions that change entity state. This is what allows the undo system (§6) to snapshot entity deltas alongside text deltas.

### The Staged Buffer

Staged entities live entirely within `EntityStateField` — they have temporary local IDs (e.g., `staged-uuid-xxxx`) and are never written to the DB until the user explicitly promotes them. There is no separate "buffer flush on Ctrl+S" step; the promotion is always a deliberate user action via autocomplete or the right panel. Staged IDs are persisted to `screenplay_line_annotations` on save with `entity_id = null` and `staged_local_id` set.

### Autocomplete Integration

The autocomplete system is implemented as a CodeMirror `CompletionSource`. It is invoked:

- Automatically while typing on Character, Location (post-`INT./EXT.`), and Prop lines.
- Manually via `Ctrl+P` for props.

The source queries the DB (debounced at ~150ms) via the existing autocomplete endpoints and returns ranked completions including the "Create new" option as a special entry. Selecting a completion dispatches a transaction with the appropriate `EntityCommitAnnotation`.

---

## 15. API Surface

All existing routes are inherited. New routes are marked **[new]**.

| Method | Route | Purpose |
| :--- | :--- | :--- |
| GET | `/api/screenplay-v2/load` | Load full screenplay + entity annotations for editor |
| PUT | `/api/screenplay-v2/save` | Save screenplay; skips staged entities in entity creation |
| POST | `/api/screenplay-v2/publish` | Create named version snapshot (includes annotation map) |
| POST | `/api/screenplay-v2/restore/{id}` | Restore version (restores annotation map too) |
| GET | `/api/screenplay-v2/versions` | List versions |
| GET | `/api/screenplay-v2/scenes` | Navigator scene list |
| GET | `/api/screenplay-v2/characters` | Navigator character list |
| GET | `/api/screenplay-v2/locations` | Navigator location list |
| GET | `/api/screenplay-v2/autocomplete-characters` | Character name suggestions (excludes soft-deleted) |
| GET | `/api/screenplay-v2/autocomplete-locations` | Location name suggestions (excludes soft-deleted) |
| GET | `/api/screenplay-v2/autocomplete-props` | Prop name suggestions (excludes soft-deleted) |
| POST | `/api/screenplay-v2/tag-prop` | Tag selected text as prop reference |
| GET | `/api/screenplay-v2/prop-tags` | List all prop tags |
| GET | `/api/query/{query-name}` | Run analytical query |
| POST | `/api/images/upload` | Upload reference image |
| GET | `/api/screenplay-v2/annotations` | **[new]** Load entity annotation map for a project |
| PUT | `/api/screenplay-v2/annotations` | **[new]** Save entity annotation map (called by autosave and Ctrl+S) |
| GET | `/api/screenplay-v2/act-groups` | **[new]** Load act groupings for left-panel navigator |
| PUT | `/api/screenplay-v2/act-groups` | **[new]** Save act groupings |
| POST | `/api/screenplay-v2/entity-commit` | **[new]** Promote a staged entity to committed (creates DB record if needed) |
| POST | `/api/screenplay-v2/entity-unlink` | **[new]** Demote a committed entity span back to staged |
| PATCH | `/api/screenplay-v2/entity-rename/{id}` | **[new]** Rename a committed entity and propagate across all annotations |
| DELETE | `/api/screenplay-v2/entity-soft-delete/{id}` | **[new]** Soft-delete an entity record (undo support) |
| DELETE | `/api/screenplay-v2/entity-purge/{id}` | **[new]** Permanently remove a soft-deleted entity |

---

## 16. State Persistence

| Mechanism | Data |
| :--- | :--- |
| `localStorage` | Tree collapse state, panel widths, sort preferences |
| `sessionStorage` | Scroll position before navigation |
| Server — `screenplay_lines` | All script content (canonical) |
| Server — `screenplay_line_annotations` | Entity span state (staged/committed, IDs, positions) |
| Server — `scene_act_groups` | Act groupings for the production navigator |
| Server — entity tables | Characters, locations, props (with soft-delete flag) |
| Server — version snapshots | Named, immutable version history including annotation maps |

---

## 17. Open Questions & Deferred Items

- **Page formatting rules:** Exact line-count-per-page rules, font and margin configuration, title page generation.
- **Production report templates:** What fields appear in prop/character/location breakdowns; configurable per production.
- **Fountain parser edge cases:** Dual-dialogue (`^` suffix), forced elements, notes (`[[...]]`).
- **Annotation position drift on server edits:** If `screenplay_lines` is modified outside the IDE (e.g., via the entity browser or a direct API call), `screenplay_line_annotations` character offsets may become stale. A reconciliation strategy is needed.
- **Auto-pagination font/margin spec:** The 55-line-per-page figure needs to be confirmed against industry-standard Courier 12pt margins to be reliable for PDF export.
- **Mobile / tablet support:** The current spec assumes a desktop keyboard-driven workflow. Touch input is not addressed.
- **Accessibility:** Keyboard navigation of the entity panels, screen reader compatibility of decorations.
- **Staged entity count in version snapshots:** Should restoring a version also restore the staged entity list, or should staged entities be treated as purely in-session state? Currently specified as restored; this may need review.
