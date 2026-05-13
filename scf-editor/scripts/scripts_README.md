# SCF Documentation Scripts

This directory contains scripts that maintain SCF's documentation.

## `generate_schema_docs.py`

Auto-generates two markdown documents from `entity_registry.py` and `docs/current/conventions.md`:

- **`docs/current/schema_reference.md`** — comprehensive: every entity, every field, every option, every reference. Long. Use as the canonical "what is the schema right now?" reference.
- **`docs/ai_context/schema_snapshot.md`** — compact: orientation-focused. Drop into an AI session to prime context without dumping the codebase.

Both documents include the same cross-cutting conventions section (versioning model, status taxonomy, reference field semantics, OMC posture, bundle pattern). The conventions content is **read from `docs/current/conventions.md`** at generation time — that file is the canonical authority on conventions. When you update conventions there and regenerate, both the reference and the snapshot pick up the change.

The reference doc adds full field-level tables per entity; the snapshot doc adds tier-grouped entity summaries and a reference graph.

### Project layout expected

```
<project root>/
  entity_registry.py
  scripts/
    generate_schema_docs.py     ← this script
    README.md                    ← this file
  docs/
    current/
      conventions.md             ← canonical conventions, hand-authored
      schema_reference.md        ← auto-generated from registry + conventions
      format_overview.md         ← hand-authored
    ai_context/
      schema_snapshot.md         ← auto-generated from registry + conventions
      active_design_work.md      ← hand-authored
    design/                      ← dated design documents
    history/                     ← changelog
```

The script assumes it lives at `scripts/generate_schema_docs.py` and that `entity_registry.py` is at the project root. It adds the project root to `sys.path` automatically. If your layout differs, edit the `SCRIPT_DIR` / `PROJECT_ROOT` constants near the top of the script.

### Inputs and outputs

| Input | Path |
|---|---|
| Entity registry | `entity_registry.py` (project root) |
| Conventions | `docs/current/conventions.md` |

| Output | Default path |
|---|---|
| Schema reference | `docs/current/schema_reference.md` |
| Schema snapshot | `docs/ai_context/schema_snapshot.md` |

### Running the script (Windows PowerShell)

Open PowerShell, navigate to the project root, and run one of:

```powershell
# Generate both documents at their default paths
python .\scripts\generate_schema_docs.py --both

# Generate just the reference (default path: docs\current\schema_reference.md)
python .\scripts\generate_schema_docs.py --reference

# Generate just the snapshot (default path: docs\ai_context\schema_snapshot.md)
python .\scripts\generate_schema_docs.py --snapshot

# Generate to a custom path
python .\scripts\generate_schema_docs.py --reference C:\some\other\path.md

# Use a non-default conventions file
python .\scripts\generate_schema_docs.py --both --conventions C:\custom\conventions.md
```

If `python` doesn't resolve to a Python 3.10+ install on your system, substitute `py -3` (the standard Windows launcher):

```powershell
py -3 .\scripts\generate_schema_docs.py --both
```

The script needs no external dependencies — standard library only. Python 3.10 or newer is required (for the `|` union type syntax used in entity_registry.py).

### Typical workflow

After making changes to `entity_registry.py` or `conventions.md`:

```powershell
# Regenerate both docs
py -3 .\scripts\generate_schema_docs.py --both

# Review the changes
git diff docs/

# Commit
git add entity_registry.py docs/
git commit -m "schema: <describe change>"
```

If you have a pre-commit hook, you can have it run the generator automatically — but doing it manually as part of the commit is fine for now, and avoids surprising re-generation when you don't want it.

### How conventions are embedded

`conventions.md` is a standalone document with its own H1 title (`# SCF Conventions`) and intro paragraph. When the script embeds its content into the reference or snapshot, it:

1. Strips everything before the first `---` separator (the standalone-doc preamble).
2. Demotes all remaining markdown headings by one level (`##` → `###`, etc.).
3. Wraps the content in a `## Cross-cutting conventions` section header with a source attribution line.

This way `conventions.md` reads naturally as a standalone document *and* embeds cleanly under a parent section header in the generated docs. If you reorganize `conventions.md`, the only requirement is to keep the `---` separator between the standalone preamble and the rule content.

### Output sizing

For the current Arcadia/SCF registry (~100 entities), expect:

- `schema_reference.md` — roughly 80–150 KB depending on field count and conventions length
- `schema_snapshot.md` — roughly 25–35 KB

The snapshot is small enough to drop into any AI session comfortably. The reference is fine as a project document but probably too long to paste into a session in full — link to it or paste relevant sections.

### Error handling

If `conventions.md` is missing, the script exits with code 1 and a clear message. Either create the file at the expected path or pass `--conventions PATH` to specify a different location.

If `entity_registry.py` can't be imported, the script exits with code 1 and a message pointing at the expected layout.

### Future enhancements (not implemented yet)

- Generating a third document: per-entity SQL DDL preview (useful for confirming schema changes before they hit a real database)
- Markdown linting / link checking
- Optional JSON export of the registry for tooling that prefers structured data over markdown
- Pre-commit hook integration

None of these block the current workflow. Add them if and when the need is concrete.

