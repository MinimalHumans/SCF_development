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


# ---------------------------------------------------------------------------
# Auto-injected fields — driven by EntityDef flags
# ---------------------------------------------------------------------------
# The registry's __post_init__ injects standard fields into any EntityDef
# whose corresponding flag is True. This map is the doc generator's
# knowledge of that injection — it must stay in sync with entity_registry.py.
#
# If injection rules change in the registry, update this map. The script
# uses this knowledge to:
#   1. Mark which fields are injected vs. declared in the per-entity tables
#   2. Annotate flags in the entity meta tables
#   3. Filter injected self-references from the reference graph
#     (since they're structural, not semantic connectivity)

INJECTED_FIELDS: dict[str, tuple[str, str]] = {
    # field_name: (flag_attribute, short_label)
    "parent_id":             ("versionable",          "versionable"),
    "version_label":         ("versionable",          "versionable"),
    "superseded_at":         ("versionable",          "versionable"),
    "superseded_by_id":      ("versionable",          "versionable"),
    "lifecycle_status":      ("has_lifecycle_status", "lifecycle"),
    "external_id":           ("has_external_id",      "external"),
    "external_id_namespace": ("has_external_id",      "external"),
}

# Flags surfaced in entity meta tables. Order matters — this is the
# display order in the meta block.
ENTITY_FLAGS: list[tuple[str, str]] = [
    ("versionable",          "Versionable"),
    ("has_lifecycle_status", "Has lifecycle status"),
    ("has_external_id",      "Has external ID"),
]


def injection_source(f: FieldDef, e: EntityDef) -> str | None:
    """If this field was auto-injected for this entity, return its short label.
    Otherwise return None (it's an entity-declared field)."""
    info = INJECTED_FIELDS.get(f.name)
    if not info:
        return None
    flag_attr, label = info
    if getattr(e, flag_attr, False):
        return label
    return None


def split_fields(e: EntityDef) -> tuple[list[FieldDef], list[FieldDef], list[FieldDef]]:
    """Split an entity's fields into (declared_visible, injected_visible, hidden).
    Injected fields are detected by name + flag presence."""
    declared: list[FieldDef] = []
    injected: list[FieldDef] = []
    hidden: list[FieldDef] = []
    for f in e.fields:
        if f.hidden:
            hidden.append(f)
        elif injection_source(f, e):
            injected.append(f)
        else:
            declared.append(f)
    return declared, injected, hidden


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
    """Count declared, non-hidden fields only. Injected fields are framework-
    standard and counted separately in the reference summary."""
    return sum(
        1 for f in e.fields
        if not f.hidden and injection_source(f, e) is None
    )


def count_injected_fields(e: EntityDef) -> int:
    return sum(1 for f in e.fields if injection_source(f, e))


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
    total_injected = sum(count_injected_fields(e) for e in registry.values())
    categories = get_entities_by_category()
    flag_counts = {
        attr: sum(1 for e in registry.values() if getattr(e, attr, False))
        for attr, _ in ENTITY_FLAGS
    }
    parts.append("## Summary\n")
    parts.append(f"- **Total entities:** {total_entities}")
    parts.append(f"- **Total declared visible fields:** {total_fields}")
    parts.append(f"- **Total auto-injected fields:** {total_injected} "
                 f"(from `versionable` / `has_lifecycle_status` / `has_external_id` flags)")
    parts.append(f"- **Categories:** {len(categories)}")
    for attr, label in ENTITY_FLAGS:
        parts.append(f"- **{label}:** {flag_counts[attr]} entities")
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
    # Flags — only render rows for flags that are True, to keep noise down
    for flag_attr, flag_label in ENTITY_FLAGS:
        if getattr(e, flag_attr, False):
            meta_rows.append((flag_label, "yes"))

    lines.append("| Meta | Value |")
    lines.append("|---|---|")
    for k, v in meta_rows:
        lines.append(f"| {k} | {md_escape(v)} |")
    lines.append("")

    # Split fields into declared / injected / hidden
    declared_fields, injected_fields, hidden_fields = split_fields(e)

    def render_field_row(f: FieldDef) -> str:
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
        return f"| `{f.name}` | {type_str} | {req} | {default} | {tab} | {md_escape(desc)} |"

    if declared_fields:
        lines.append("**Declared fields:**\n")
        lines.append("| Field | Type | Required | Default | Tab | Description |")
        lines.append("|---|---|---|---|---|---|")
        for f in declared_fields:
            lines.append(render_field_row(f))
        lines.append("")

    if injected_fields:
        # Group by injection source so the section reads cleanly
        by_source: dict[str, list[FieldDef]] = {}
        for f in injected_fields:
            src = injection_source(f, e) or "?"
            by_source.setdefault(src, []).append(f)
        source_order = ["versionable", "lifecycle", "external"]
        ordered_sources = [s for s in source_order if s in by_source] + \
                          [s for s in by_source if s not in source_order]

        lines.append("**Auto-injected fields** "
                     "(added by registry flags — see *Cross-cutting conventions*):\n")
        lines.append("| Field | Type | Required | Default | Tab | Source | Description |")
        lines.append("|---|---|---|---|---|---|---|")
        for src in ordered_sources:
            for f in by_source[src]:
                # Insert the source column into the standard row
                base = render_field_row(f)
                # base is "| name | type | req | default | tab | desc |"
                # Insert src before the description (last cell).
                parts_row = base.rsplit("|", 2)  # split off the trailing "| desc |"
                head, desc_cell, tail = parts_row[0], parts_row[1], parts_row[2]
                lines.append(f"{head}| `{src}` |{desc_cell}|{tail}")
        lines.append("")

    if hidden_fields:
        lines.append("**Hidden fields** (not shown in editor UI):\n")
        for f in hidden_fields:
            inj = injection_source(f, e)
            suffix = f" — injected by `{inj}`" if inj else ""
            lines.append(f"- `{f.name}` ({field_type_display(f)}){suffix}")
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

    # Schema conventions at a glance — flag aggregates and tier counts
    parts.append("## Schema conventions at a glance\n")
    parts.append(
        "Counts of which entities opt into the framework-standard flags. "
        "These flags inject standard fields (Lifecycle, External tabs) — "
        "see `schema_reference.md` for the per-entity breakdown.\n"
    )
    parts.append("| Flag | Entities | Injected fields |")
    parts.append("|---|---|---|")
    flag_field_summary = {
        "versionable": "`parent_id`, `version_label`, `superseded_at`, `superseded_by_id`",
        "has_lifecycle_status": "`lifecycle_status`",
        "has_external_id": "`external_id`, `external_id_namespace`",
    }
    for attr, label in ENTITY_FLAGS:
        n = sum(1 for e in registry.values() if getattr(e, attr, False))
        fields = flag_field_summary.get(attr, "—")
        parts.append(f"| `{attr}` ({label}) | {n} | {fields} |")
    parts.append("")
    parts.append("---\n")

    # Reference graph — which entities reference which
    parts.append("## Entity reference graph\n")
    parts.append(
        "Which entities hold foreign keys to which. Self-references created "
        "by injected versionable fields (`parent_id`, `superseded_by_id`) are "
        "omitted — every versionable entity has them, so they're structural "
        "rather than semantic connectivity.\n"
    )
    refs: list[tuple[str, str, str]] = []
    skipped_self_refs: list[str] = []
    for e in registry.values():
        for f in e.fields:
            if f.field_type == "reference" and f.reference_entity:
                # Skip injected self-references (always parent_id /
                # superseded_by_id from the versionable flag).
                inj = injection_source(f, e)
                if inj and f.reference_entity == e.name:
                    skipped_self_refs.append(f"`{e.name}.{f.name}`")
                    continue
                refs.append((e.name, f.name, f.reference_entity))
    if refs:
        parts.append("| Entity | Field | References |")
        parts.append("|---|---|---|")
        for src, fname, tgt in sorted(refs):
            self_marker = "  *(self)*" if src == tgt else ""
            parts.append(f"| `{src}` | `{fname}` | `{tgt}`{self_marker} |")
        parts.append("")
    if skipped_self_refs:
        parts.append(
            f"*{len(skipped_self_refs)} injected self-references omitted: "
            f"{', '.join(sorted(skipped_self_refs))}.*\n"
        )

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
