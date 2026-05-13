#!/usr/bin/env python3
"""
generate_schema_docs.py

Auto-generates schema documentation from entity_registry.py.

Produces two documents from a single source of truth:
  - schema_reference.md  — comprehensive: every entity, every field, every option
  - schema_snapshot.md   — compact: orientation-focused, suitable for AI sessions

Both documents embed cross-cutting conventions (versioning, status taxonomy,
reference field semantics, OMC posture, bundle pattern) from a separate
file: docs/current/conventions.md. That file is the canonical authority on
conventions; this script just embeds its content with heading levels
demoted to fit under a parent section header.

USAGE
-----
From the SCF project root (where entity_registry.py is importable):

    python scripts/generate_schema_docs.py --reference docs/current/schema_reference.md
    python scripts/generate_schema_docs.py --snapshot docs/ai_context/schema_snapshot.md
    python scripts/generate_schema_docs.py --both  # writes both to default paths

Default output paths:
    --reference  → docs/current/schema_reference.md
    --snapshot   → docs/ai_context/schema_snapshot.md

Default conventions input:
    --conventions → docs/current/conventions.md

The script imports entity_registry.py at runtime. Ensure it's on sys.path.
By default the script adds the project root (parent of the scripts/ directory)
to sys.path, which works if you keep this script at scripts/generate_schema_docs.py
and entity_registry.py at the project root.

If conventions.md is missing, the script fails with a clear error. Create
the file or pass --conventions PATH to specify a different location.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


# ---------------------------------------------------------------------------
# Path setup — make entity_registry.py importable
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # assumes script lives at <project>/scripts/
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from entity_registry import (
        ENTITY_REGISTRY,
        EntityDef,
        FieldDef,
        get_entities_by_category,
    )
except ImportError as e:
    sys.stderr.write(
        f"ERROR: could not import entity_registry from {PROJECT_ROOT}\n"
        f"       {e}\n"
        f"       Make sure this script is at <project>/scripts/ and that\n"
        f"       entity_registry.py is at <project>/, or adjust sys.path.\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Cross-cutting conventions — loaded from disk
# ---------------------------------------------------------------------------
# Conventions are authored in docs/current/conventions.md and read by this
# script. That file is the canonical source; this script just embeds its
# content into the generated reference and snapshot documents.
#
# When embedding, we strip conventions.md's standalone-doc preamble (the H1
# title and intro paragraph before the first '---' separator) and demote all
# remaining headings by one level. This way conventions.md works as a
# standalone document with its own H1, and also embeds cleanly under a
# parent document's section heading without colliding heading levels.

DEFAULT_CONVENTIONS_PATH = PROJECT_ROOT / "docs" / "current" / "conventions.md"


def demote_headings(md: str, levels: int = 1) -> str:
    """Demote markdown headings by `levels`. Skips fenced code blocks."""
    lines = md.split("\n")
    out = []
    in_code_block = False
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
        if not in_code_block and line.startswith("#"):
            count = 0
            for c in line:
                if c == "#":
                    count += 1
                else:
                    break
            if 0 < count <= 6 - levels:
                line = "#" * (count + levels) + line[count:]
        out.append(line)
    return "\n".join(out)


def load_conventions(path: Path) -> str:
    """Load conventions.md content, strip standalone-doc preamble, demote headings.

    Returns content ready to embed under a parent '## Cross-cutting conventions'
    section. Strips everything before the first '---' separator (the H1 and intro)
    if present; otherwise returns the full content. Demotes all headings by 1.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"conventions.md not found at {path}. "
            f"Either create the file or pass --conventions PATH to specify a "
            f"different location."
        )
    raw = path.read_text(encoding="utf-8")

    # Strip standalone-doc preamble: everything up to and including the first
    # '---' on its own line. If no '---' exists, take the whole file.
    lines = raw.split("\n")
    body_start = 0
    for i, line in enumerate(lines):
        if line.strip() == "---":
            body_start = i + 1
            break
    body = "\n".join(lines[body_start:]).lstrip("\n")

    return demote_headings(body, levels=1)


def render_conventions_section(conventions_body: str) -> str:
    """Wrap conventions content in a section header for embedding."""
    return (
        "## Cross-cutting conventions\n\n"
        "*Source: `conventions.md` — the canonical authority. "
        "This section is reproduced from that file.*\n\n"
        f"{conventions_body}\n"
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def md_escape(s: str | None) -> str:
    """Escape pipe characters so they don't break markdown tables."""
    if s is None:
        return ""
    return s.replace("|", "\\|").replace("\n", " ").strip()


def field_type_display(f: FieldDef) -> str:
    """Human-readable field type description."""
    base = f.field_type
    if f.field_type == "reference" and f.reference_entity:
        return f"reference → `{f.reference_entity}`"
    if f.field_type == "select" and f.options:
        return "select"
    if f.field_type == "multiselect" and f.options:
        return "multiselect"
    return base


def field_options_display(f: FieldDef) -> str:
    """Render select/multiselect options inline."""
    if f.field_type in ("select", "multiselect") and f.options:
        opts = ", ".join(f"`{o}`" for o in f.options)
        return opts
    return ""


def entity_summary_line(e: EntityDef) -> str:
    """Short one-line summary for snapshot lists."""
    icon = e.icon + " " if e.icon else ""
    return f"{icon}**`{e.name}`** — {e.description or '(no description)'}"


def count_fields(e: EntityDef) -> int:
    return len([f for f in e.fields if not f.hidden])


# ---------------------------------------------------------------------------
# Reference doc — comprehensive
# ---------------------------------------------------------------------------

def render_reference(registry: dict[str, EntityDef], conventions_body: str) -> str:
    """Render the comprehensive schema reference.

    `conventions_body` is the already-processed conventions content (preamble
    stripped, headings demoted) ready for embedding as a section.
    """
    parts: list[str] = []
    parts.append("# SCF Schema Reference\n")
    parts.append(
        f"*Auto-generated from `entity_registry.py` on "
        f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')} UTC. "
        f"Do not edit by hand — re-run `scripts/generate_schema_docs.py` instead.*\n"
    )
    parts.append("---\n")

    # Summary stats
    total_entities = len(registry)
    total_fields = sum(count_fields(e) for e in registry.values())
    categories = get_entities_by_category()
    parts.append("## Summary\n")
    parts.append(f"- **Total entities:** {total_entities}")
    parts.append(f"- **Total visible fields:** {total_fields}")
    parts.append(f"- **Categories:** {len(categories)}")
    parts.append("")
    parts.append("---\n")

    # Table of contents
    parts.append("## Table of contents\n")
    for cat, ents in categories.items():
        slug = cat.lower().replace(" ", "-")
        parts.append(f"- [{cat}](#category-{slug}) ({len(ents)} entities)")
    parts.append("")
    parts.append("---\n")

    # Cross-cutting conventions (from conventions.md)
    parts.append(render_conventions_section(conventions_body))
    parts.append("\n---\n")

    # Entities by category
    parts.append("## Entities\n")
    for cat, ents in categories.items():
        slug = cat.lower().replace(" ", "-")
        parts.append(f"### Category: {cat}\n")
        parts.append(f"<a id='category-{slug}'></a>\n")
        for e in ents:
            parts.append(render_entity_full(e))
        parts.append("---\n")

    return "\n".join(parts)


def render_entity_full(e: EntityDef) -> str:
    """Render full detail for a single entity."""
    lines: list[str] = []
    icon = e.icon + " " if e.icon else ""
    lines.append(f"#### {icon}`{e.name}` — {e.label}\n")

    if e.description:
        lines.append(f"{e.description}\n")

    meta_rows: list[tuple[str, str]] = []
    meta_rows.append(("Plural label", e.label_plural))
    meta_rows.append(("Category", e.category))
    meta_rows.append(("Tier", str(e.tier)))
    meta_rows.append(("Sort order", str(e.sort_order)))
    if e.parent_entity:
        meta_rows.append(("Parent entity", f"`{e.parent_entity}` via `{e.parent_field}`"))
    if e.name_field and e.name_field != "name":
        meta_rows.append(("Display field", f"`{e.name_field}`"))

    lines.append("| Meta | Value |")
    lines.append("|---|---|")
    for k, v in meta_rows:
        lines.append(f"| {k} | {md_escape(v)} |")
    lines.append("")

    # Fields table
    visible_fields = [f for f in e.fields if not f.hidden]
    hidden_fields = [f for f in e.fields if f.hidden]

    if visible_fields:
        lines.append("**Fields:**\n")
        lines.append("| Field | Type | Required | Default | Tab | Description |")
        lines.append("|---|---|---|---|---|---|")
        for f in visible_fields:
            type_str = field_type_display(f)
            opts = field_options_display(f)
            if opts:
                type_str = f"{type_str}<br/>options: {opts}"
            req = "yes" if f.required else ""
            default = f"`{f.default}`" if f.default is not None else ""
            tab = f.tab or "General"
            desc_parts: list[str] = []
            if f.label and f.label != f.name:
                desc_parts.append(f"*{f.label}*")
            if f.placeholder:
                desc_parts.append(f"placeholder: {f.placeholder}")
            if f.help_text:
                desc_parts.append(f.help_text)
            desc = " — ".join(desc_parts) if desc_parts else ""
            lines.append(
                f"| `{f.name}` | {type_str} | {req} | {default} | {tab} | {md_escape(desc)} |"
            )
        lines.append("")

    if hidden_fields:
        lines.append("**Hidden fields** (not shown in editor UI):\n")
        for f in hidden_fields:
            lines.append(f"- `{f.name}` ({field_type_display(f)})")
        lines.append("")

    # Tabs summary if more than one
    tabs = e.get_tabs()
    if len(tabs) > 1:
        lines.append(f"**Tabs:** {', '.join(f'`{t}`' for t in tabs)}\n")

    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Snapshot doc — compact, AI-priming
# ---------------------------------------------------------------------------

def render_snapshot(registry: dict[str, EntityDef], conventions_body: str) -> str:
    """Render the compact schema snapshot for AI session priming.

    `conventions_body` is the already-processed conventions content (preamble
    stripped, headings demoted) ready for embedding as a section.
    """
    parts: list[str] = []
    parts.append("# SCF Schema Snapshot\n")
    parts.append(
        f"*Compact reference for orientation. Auto-generated from "
        f"`entity_registry.py` on {datetime.now(timezone.utc).strftime('%Y-%m-%d')} UTC. "
        f"For full field-level detail, see `schema_reference.md`.*\n"
    )

    parts.append("## What SCF is\n")
    parts.append(
        "SCF (Story Context Framework) is a structured data format for describing "
        "films and other narrative works. It captures creative intent — story "
        "structure, character, location, theme, performance, visual and sonic "
        "design — at sufficient density that generative tools, production tools, "
        "and analytical tools can all consume the same file. Storage is SQLite; "
        "every entity has its own table; relationships are foreign keys.\n"
    )
    parts.append(
        "The format is tool-agnostic. It describes what's true about a story; "
        "tools decide how to use that data. A `.scf` file is useful at 5% "
        "populated and grows richer with authoring.\n"
    )

    parts.append("---\n")
    parts.append(render_conventions_section(conventions_body))
    parts.append("\n---\n")

    # Tier-grouped summary
    parts.append("## Entities by tier\n")
    parts.append(
        "Tiers describe the natural order of population. Tier 0 entities are "
        "the structural foundation; higher tiers add increasing depth. All "
        "tiers exist in every project file; tiers indicate priority, not "
        "feature gates.\n"
    )

    by_tier: dict[int, list[EntityDef]] = {}
    for e in registry.values():
        by_tier.setdefault(e.tier, []).append(e)

    for tier in sorted(by_tier.keys()):
        ents = sorted(by_tier[tier], key=lambda x: (x.category, x.sort_order))
        parts.append(f"### Tier {tier}\n")
        parts.append(
            f"*{len(ents)} entities*\n"
        )
        # Group by category within tier
        by_cat: dict[str, list[EntityDef]] = {}
        for e in ents:
            by_cat.setdefault(e.category, []).append(e)
        for cat, cat_ents in by_cat.items():
            parts.append(f"**{cat}**")
            for e in cat_ents:
                parts.append(f"- {entity_summary_line(e)}")
            parts.append("")
        parts.append("")

    parts.append("---\n")

    # Reference graph — which entities reference which
    parts.append("## Entity reference graph\n")
    parts.append(
        "Which entities hold foreign keys to which. Useful for understanding "
        "the schema's connectivity at a glance.\n"
    )
    refs: list[tuple[str, str, str]] = []
    for e in registry.values():
        for f in e.fields:
            if f.field_type == "reference" and f.reference_entity:
                refs.append((e.name, f.name, f.reference_entity))
    if refs:
        parts.append("| Entity | Field | References |")
        parts.append("|---|---|---|")
        for src, fname, tgt in sorted(refs):
            parts.append(f"| `{src}` | `{fname}` | `{tgt}` |")
        parts.append("")

    parts.append("---\n")
    parts.append("## Where to find more\n")
    parts.append(
        "- **Full field-level reference:** `docs/current/schema_reference.md`\n"
        "- **Operational source of truth:** `entity_registry.py`\n"
        "- **Design history:** `docs/design/` (dated design documents)\n"
        "- **Active design work:** `docs/ai_context/active_design_work.md`\n"
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

DEFAULT_REFERENCE_PATH = PROJECT_ROOT / "docs" / "current" / "schema_reference.md"
DEFAULT_SNAPSHOT_PATH = PROJECT_ROOT / "docs" / "ai_context" / "schema_snapshot.md"


def write_doc(content: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    size_kb = len(content.encode("utf-8")) / 1024
    print(f"  wrote {path}  ({size_kb:.1f} KB)")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate SCF schema documentation from entity_registry.py"
    )
    parser.add_argument(
        "--reference",
        nargs="?",
        const=str(DEFAULT_REFERENCE_PATH),
        default=None,
        help=f"generate the comprehensive schema reference "
             f"(default path: {DEFAULT_REFERENCE_PATH})",
    )
    parser.add_argument(
        "--snapshot",
        nargs="?",
        const=str(DEFAULT_SNAPSHOT_PATH),
        default=None,
        help=f"generate the compact schema snapshot "
             f"(default path: {DEFAULT_SNAPSHOT_PATH})",
    )
    parser.add_argument(
        "--both",
        action="store_true",
        help="generate both documents at their default paths",
    )
    parser.add_argument(
        "--conventions",
        type=str,
        default=str(DEFAULT_CONVENTIONS_PATH),
        help=f"path to conventions.md (default: {DEFAULT_CONVENTIONS_PATH})",
    )
    args = parser.parse_args()

    if not (args.reference or args.snapshot or args.both):
        parser.print_help()
        sys.stderr.write(
            "\nNo output specified. Use --reference, --snapshot, or --both.\n"
        )
        return 1

    print(f"Reading entity registry from {PROJECT_ROOT}/entity_registry.py")
    print(f"  found {len(ENTITY_REGISTRY)} entities")

    conventions_path = Path(args.conventions)
    print(f"Reading conventions from {conventions_path}")
    try:
        conventions_body = load_conventions(conventions_path)
    except FileNotFoundError as e:
        sys.stderr.write(f"\nERROR: {e}\n")
        return 1
    conv_kb = len(conventions_body.encode("utf-8")) / 1024
    print(f"  loaded {conv_kb:.1f} KB of conventions content")
    print("")

    if args.both:
        ref_path = DEFAULT_REFERENCE_PATH
        snap_path = DEFAULT_SNAPSHOT_PATH
    else:
        ref_path = Path(args.reference) if args.reference else None
        snap_path = Path(args.snapshot) if args.snapshot else None

    if ref_path is not None:
        print("Generating reference document...")
        write_doc(render_reference(ENTITY_REGISTRY, conventions_body), ref_path)

    if snap_path is not None:
        print("Generating snapshot document...")
        write_doc(render_snapshot(ENTITY_REGISTRY, conventions_body), snap_path)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
