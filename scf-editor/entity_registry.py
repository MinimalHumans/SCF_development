"""
SCF Entity Registry
====================
This is the single source of truth for all entity types in the SCF Editor.
Adding a new entity type means adding an entry here — the database tables,
API routes, and UI forms are all generated from this registry automatically.

Field types: text, textarea, integer, float, select, multiselect, boolean, json, reference
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FieldDef:
    """Definition of a single field on an entity."""
    name: str
    label: str
    field_type: str = "text"          # text, textarea, integer, float, select, multiselect, boolean, json, reference
    required: bool = False
    default: Any = None
    placeholder: str = ""
    options: list[str] | None = None  # For select/multiselect
    reference_entity: str | None = None  # For reference fields — which entity type
    tab: str = "General"              # Which tab this field appears on
    help_text: str = ""
    hidden: bool = False              # If True, field exists in DB but not shown in forms
    sql_type: str | None = None       # Override auto-detected SQL type

    def get_sql_type(self) -> str:
        if self.sql_type:
            return self.sql_type
        return {
            "text": "TEXT",
            "textarea": "TEXT",
            "integer": "INTEGER",
            "float": "REAL",
            "select": "TEXT",
            "multiselect": "TEXT",  # stored as JSON array
            "boolean": "INTEGER",   # 0/1
            "json": "TEXT",
            "reference": "INTEGER",
        }.get(self.field_type, "TEXT")


@dataclass
class EntityDef:
    """Definition of an entity type."""
    name: str                          # Internal name (e.g. "character")
    label: str                         # Display name (e.g. "Character")
    label_plural: str                  # Plural display (e.g. "Characters")
    icon: str = "📄"                   # Emoji icon for tree view
    name_field: str = "name"           # Which field to use as display name
    fields: list[FieldDef] = field(default_factory=list)
    parent_entity: str | None = None   # For hierarchy (e.g. scene -> sequence)
    parent_field: str | None = None    # FK field name linking to parent
    category: str = "Entities"         # Grouping in the tree view
    description: str = ""
    sort_order: int = 0                # Display order within category

    def get_tabs(self) -> list[str]:
        """Return ordered unique tab names (skips tabs with only hidden fields)."""
        tabs = []
        for f in self.fields:
            if not f.hidden and f.tab not in tabs:
                tabs.append(f.tab)
        return tabs

    def get_fields_for_tab(self, tab: str) -> list[FieldDef]:
        return [f for f in self.fields if f.tab == tab]


# =============================================================================
# REGISTRY — Define all entity types here
# =============================================================================

ENTITY_REGISTRY: dict[str, EntityDef] = {}


def register(entity: EntityDef):
    """Register an entity type."""
    ENTITY_REGISTRY[entity.name] = entity
    return entity


# ---------------------------------------------------------------------------
# Project (root entity)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="project",
    label="Project",
    label_plural="Projects",
    icon="🎬",
    category="Project",
    sort_order=0,
    description="The root container for an SCF story project.",
    fields=[
        FieldDef("name", "Project Name", required=True, placeholder="e.g. My Feature Film"),
        FieldDef("logline", "Logline", "textarea", placeholder="A one-sentence summary of the story"),
        FieldDef("genre", "Genre", "select", options=[
            "Drama", "Comedy", "Thriller", "Sci-Fi", "Fantasy", "Horror",
            "Action", "Romance", "Documentary", "Animation", "Western", "Other"
        ]),
        FieldDef("tone", "Tone", "text", placeholder="e.g. Dark, whimsical, gritty"),
        FieldDef("setting_period", "Setting / Time Period", "text", placeholder="e.g. Victorian England, Near-future Tokyo"),
        FieldDef("target_runtime", "Target Runtime (minutes)", "integer"),
        FieldDef("status", "Status", "select", options=["Development", "Pre-Production", "Production", "Post-Production", "Complete"], default="Development"),
        FieldDef("notes", "Notes", "textarea", tab="Notes"),
        # Vision layer
        FieldDef("vision_statement", "Vision Statement", "textarea", tab="Vision",
                 help_text="The director's overarching vision for this project"),
        FieldDef("creative_philosophy", "Creative Philosophy", "textarea", tab="Vision"),
        FieldDef("themes", "Core Themes", "json", tab="Vision",
                 placeholder='["redemption", "identity", "power"]',
                 help_text="JSON array of thematic keywords"),
    ],
))

# ---------------------------------------------------------------------------
# Character
# ---------------------------------------------------------------------------
register(EntityDef(
    name="character",
    label="Character",
    label_plural="Characters",
    icon="👤",
    category="Story Entities",
    sort_order=10,
    description="A character in the story.",
    fields=[
        # General tab
        FieldDef("name", "Character Name", required=True, placeholder="e.g. Eleanor Vance"),
        FieldDef("role", "Role", "select", options=[
            "Protagonist", "Antagonist", "Supporting", "Minor", "Background", "Narrator"
        ]),
        FieldDef("archetype", "Archetype", "text", placeholder="e.g. The Mentor, The Trickster"),
        FieldDef("age", "Age", "text", placeholder="e.g. 34, Late 20s, Ageless"),
        FieldDef("gender", "Gender", "text"),
        FieldDef("occupation", "Occupation", "text"),
        FieldDef("status", "Status", "select", options=["Active", "Draft", "Cut", "Archived"], default="Active"),
        FieldDef("summary", "Character Summary", "textarea",
                 placeholder="Brief description of who this character is"),

        # Backstory tab
        FieldDef("backstory", "Backstory", "textarea", tab="Backstory",
                 placeholder="Key events and history that shaped this character"),
        FieldDef("motivation", "Core Motivation", "textarea", tab="Backstory"),
        FieldDef("flaw", "Fatal Flaw", "text", tab="Backstory"),
        FieldDef("arc_description", "Character Arc", "textarea", tab="Backstory",
                 help_text="How does this character change throughout the story?"),

        # Physical tab (Performance Layer)
        FieldDef("height", "Height", "text", tab="Physical", placeholder="e.g. 5'10\", Tall, Average"),
        FieldDef("build", "Build", "select", tab="Physical", options=[
            "Slim", "Athletic", "Average", "Stocky", "Heavy", "Muscular", "Frail", "Other"
        ]),
        FieldDef("hair", "Hair", "text", tab="Physical", placeholder="e.g. Long dark curls"),
        FieldDef("eyes", "Eyes", "text", tab="Physical"),
        FieldDef("distinguishing_features", "Distinguishing Features", "textarea", tab="Physical"),
        FieldDef("movement_style", "Movement Style", "textarea", tab="Physical",
                 help_text="How does this character move? Confident stride? Nervous shuffle?"),
        FieldDef("physical_notes", "Physical Notes", "textarea", tab="Physical"),

        # Voice tab (Performance Layer)
        FieldDef("voice_quality", "Voice Quality", "text", tab="Voice",
                 placeholder="e.g. Deep, gravelly, warm"),
        FieldDef("speech_pattern", "Speech Pattern", "textarea", tab="Voice",
                 placeholder="e.g. Speaks in short sentences. Avoids contractions."),
        FieldDef("accent", "Accent / Dialect", "text", tab="Voice"),
        FieldDef("vocal_habits", "Vocal Habits", "textarea", tab="Voice",
                 placeholder="e.g. Clears throat when nervous, laughs before bad news"),

        # Relationships tab
        FieldDef("relationships_json", "Key Relationships", "json", tab="Relationships",
                 placeholder='[{"character": "Marcus", "type": "rival", "notes": "childhood friends turned enemies"}]',
                 help_text="JSON array of relationship objects"),

        # Wardrobe tab (Audiovisual Layer)
        FieldDef("default_wardrobe", "Default Wardrobe", "textarea", tab="Wardrobe",
                 placeholder="Typical outfit and style"),
        FieldDef("wardrobe_notes", "Wardrobe Notes", "textarea", tab="Wardrobe"),
        FieldDef("color_associations", "Color Associations", "text", tab="Wardrobe",
                 placeholder="e.g. Always wears blue, red appears when angry"),
    ],
))

# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------
register(EntityDef(
    name="location",
    label="Location",
    label_plural="Locations",
    icon="📍",
    category="Story Entities",
    sort_order=20,
    description="A location where story events take place.",
    fields=[
        FieldDef("name", "Location Name", required=True, placeholder="e.g. The Old Mill"),
        FieldDef("location_type", "Type", "select", options=[
            "Interior", "Exterior", "Int/Ext", "Virtual", "Abstract"
        ]),
        FieldDef("setting", "Setting Description", "textarea",
                 placeholder="What does this place look and feel like?"),
        FieldDef("time_period", "Time Period", "text"),
        FieldDef("geography", "Geography / Region", "text", placeholder="e.g. Northern California coast"),
        FieldDef("status", "Status", "select", options=["Active", "Draft", "Cut", "Archived"], default="Active"),

        # Atmosphere tab (Audiovisual Layer)
        FieldDef("mood", "Mood / Atmosphere", "textarea", tab="Atmosphere",
                 placeholder="What feeling does this place evoke?"),
        FieldDef("lighting", "Lighting", "textarea", tab="Atmosphere",
                 placeholder="e.g. Harsh fluorescent, Dappled sunlight through canopy"),
        FieldDef("color_palette", "Color Palette", "text", tab="Atmosphere",
                 placeholder="e.g. Warm ambers, desaturated greens"),
        FieldDef("time_of_day", "Typical Time of Day", "select", tab="Atmosphere",
                 options=["Dawn", "Morning", "Midday", "Afternoon", "Dusk", "Night", "Varies"]),
        FieldDef("weather", "Weather", "text", tab="Atmosphere"),

        # Sound tab (Audiovisual Layer)
        FieldDef("ambient_sound", "Ambient Sound", "textarea", tab="Sound",
                 placeholder="e.g. Distant traffic, birdsong, mechanical hum"),
        FieldDef("sound_notes", "Sound Design Notes", "textarea", tab="Sound"),

        # Details tab
        FieldDef("key_features", "Key Features", "textarea", tab="Details",
                 placeholder="Notable objects, architecture, landmarks within this location"),
        FieldDef("props_present", "Props Typically Present", "textarea", tab="Details"),
        FieldDef("notes", "Notes", "textarea", tab="Details"),
    ],
))

# ---------------------------------------------------------------------------
# Prop
# ---------------------------------------------------------------------------
register(EntityDef(
    name="prop",
    label="Prop",
    label_plural="Props",
    icon="🔧",
    category="Story Entities",
    sort_order=30,
    description="A significant object in the story.",
    fields=[
        FieldDef("name", "Prop Name", required=True, placeholder="e.g. The Silver Compass"),
        FieldDef("prop_type", "Type", "select", options=[
            "Hand Prop", "Set Dressing", "Vehicle", "Weapon", "Document",
            "Technology", "Clothing Item", "Food/Drink", "Other"
        ]),
        FieldDef("description", "Description", "textarea",
                 placeholder="What does this prop look like?"),
        FieldDef("narrative_significance", "Narrative Significance", "textarea",
                 placeholder="Why does this prop matter to the story?"),
        FieldDef("associated_character", "Primary Character", "reference",
                 reference_entity="character", tab="General"),
        FieldDef("status", "Status", "select", options=["Active", "Draft", "Cut", "Archived"], default="Active"),

        # Physical tab
        FieldDef("material", "Material", "text", tab="Physical", placeholder="e.g. Tarnished silver, worn leather"),
        FieldDef("size", "Size", "text", tab="Physical", placeholder="e.g. Palm-sized, 6 feet tall"),
        FieldDef("color", "Color", "text", tab="Physical"),
        FieldDef("condition", "Condition", "text", tab="Physical", placeholder="e.g. Pristine, battle-worn, ancient"),
        FieldDef("physical_notes", "Physical Notes", "textarea", tab="Physical"),

        # Story tab
        FieldDef("first_appearance", "First Appearance", "textarea", tab="Story",
                 placeholder="When/where does this prop first appear?"),
        FieldDef("key_moments", "Key Moments", "textarea", tab="Story",
                 placeholder="Important scenes involving this prop"),
        FieldDef("symbolism", "Symbolism", "textarea", tab="Story"),
        FieldDef("notes", "Notes", "textarea", tab="Notes"),
    ],
))

# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene",
    label="Scene",
    label_plural="Scenes",
    icon="🎬",
    category="Story Structure",
    sort_order=40,
    description="A single scene in the story.",
    fields=[
        FieldDef("name", "Scene Name / Slug", required=True,
                 placeholder="e.g. INT. COFFEE SHOP - MORNING"),
        FieldDef("scene_number", "Scene Number", "integer"),
        # NEW: Int/Ext field for Fountain import (stores INT/EXT per-scene)
        FieldDef("int_ext", "Int/Ext", "select", options=[
            "Interior", "Exterior", "Int/Ext"
        ]),
        FieldDef("location_id", "Location", "reference", reference_entity="location"),
        FieldDef("time_of_day", "Time of Day", "select", options=[
            "Dawn", "Morning", "Midday", "Afternoon", "Dusk", "Night", "Continuous"
        ]),
        FieldDef("summary", "Scene Summary", "textarea",
                 placeholder="What happens in this scene?"),
        FieldDef("purpose", "Dramatic Purpose", "textarea",
                 placeholder="Why does this scene exist? What does it accomplish?"),
        FieldDef("status", "Status", "select", options=[
            "Outline", "Draft", "Revised", "Locked", "Cut"
        ], default="Outline"),

        # Characters tab
        FieldDef("characters_present", "Characters Present", "json", tab="Characters",
                 placeholder='["Eleanor", "Marcus"]',
                 help_text="JSON array of character names present in this scene",
                 hidden=True),
        FieldDef("character_dynamics", "Character Dynamics", "textarea", tab="Characters",
                 placeholder="Key interactions and tensions in this scene"),

        # Emotional tab (Vision Layer)
        FieldDef("emotional_beat", "Emotional Beat", "textarea", tab="Emotional",
                 placeholder="What should the audience feel during this scene?"),
        FieldDef("tone", "Tone", "text", tab="Emotional", placeholder="e.g. Tense, comedic, melancholic"),
        FieldDef("tension_level", "Tension Level (1-10)", "integer", tab="Emotional"),
        FieldDef("thematic_connection", "Thematic Connection", "textarea", tab="Emotional",
                 placeholder="How does this scene connect to the project's themes?"),

        # Technical tab (Audiovisual Layer)
        FieldDef("visual_style", "Visual Style Notes", "textarea", tab="Technical",
                 placeholder="Camera style, lighting approach, color notes"),
        FieldDef("sound_design", "Sound Design Notes", "textarea", tab="Technical"),
        FieldDef("music_notes", "Music Notes", "textarea", tab="Technical"),
        FieldDef("estimated_duration", "Estimated Duration (seconds)", "integer", tab="Technical"),

        FieldDef("notes", "Notes", "textarea", tab="Notes"),
    ],
))

# ---------------------------------------------------------------------------
# Theme (Vision Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="theme",
    label="Theme",
    label_plural="Themes",
    icon="💡",
    category="Vision",
    sort_order=50,
    description="A thematic element that runs through the story.",
    fields=[
        FieldDef("name", "Theme Name", required=True, placeholder="e.g. Redemption"),
        FieldDef("description", "Description", "textarea",
                 placeholder="What is this theme about? How does it manifest?"),
        FieldDef("motifs", "Associated Motifs", "json",
                 placeholder='["water imagery", "broken mirrors", "dawn/dusk transitions"]'),
        FieldDef("character_connections", "Character Connections", "textarea",
                 placeholder="Which characters embody or challenge this theme?"),
        FieldDef("scene_connections", "Key Scenes", "textarea",
                 placeholder="Scenes where this theme is most prominent"),
        FieldDef("evolution", "Thematic Evolution", "textarea",
                 placeholder="How does this theme develop across the story?"),
        FieldDef("notes", "Notes", "textarea", tab="Notes"),
    ],
))

# ---------------------------------------------------------------------------
# Sequence (Story Structure)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="sequence",
    label="Sequence",
    label_plural="Sequences",
    icon="📑",
    category="Story Structure",
    sort_order=35,
    description="A group of related scenes forming a narrative unit.",
    fields=[
        FieldDef("name", "Sequence Name", required=True, placeholder="e.g. The Heist"),
        FieldDef("sequence_number", "Sequence Number", "integer"),
        FieldDef("act", "Act", "select", options=["Act 1", "Act 2A", "Act 2B", "Act 3"]),
        FieldDef("summary", "Summary", "textarea"),
        FieldDef("purpose", "Dramatic Purpose", "textarea"),
        FieldDef("turning_point", "Turning Point", "textarea",
                 placeholder="What changes by the end of this sequence?"),
        FieldDef("status", "Status", "select", options=[
            "Outline", "Draft", "Revised", "Locked"
        ], default="Outline"),
        FieldDef("notes", "Notes", "textarea", tab="Notes"),
    ],
))


# ---------------------------------------------------------------------------
# Junction: Scene-Character
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_character",
    label="Scene-Character",
    label_plural="Scene-Characters",
    icon="🔗",
    category="Connections",
    sort_order=60,
    description="Links a character to a scene with role information.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene", required=True),
        FieldDef("character_id", "Character", "reference", reference_entity="character", required=True),
        FieldDef("role_in_scene", "Role in Scene", "select", options=[
            "Featured", "Supporting", "Background", "Mentioned", "Voiceover"
        ]),
        FieldDef("notes", "Notes", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Junction: Scene-Prop
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_prop",
    label="Scene-Prop",
    label_plural="Scene-Props",
    icon="🔗",
    category="Connections",
    sort_order=61,
    description="Links a prop to a scene with usage details.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene", required=True),
        FieldDef("prop_id", "Prop", "reference", reference_entity="prop", required=True),
        FieldDef("usage_note", "Usage Note", "text"),
        FieldDef("significance", "Significance", "select", options=[
            "Key", "Present", "Background", "Mentioned"
        ]),
    ],
))

# ---------------------------------------------------------------------------
# Junction: Scene-Sequence
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_sequence",
    label="Scene-Sequence",
    label_plural="Scene-Sequences",
    icon="🔗",
    category="Connections",
    sort_order=62,
    description="Links a scene to a sequence with ordering.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene", required=True),
        FieldDef("sequence_id", "Sequence", "reference", reference_entity="sequence", required=True),
        FieldDef("order_in_sequence", "Order in Sequence", "integer"),
    ],
))


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def get_entity(name: str) -> EntityDef | None:
    return ENTITY_REGISTRY.get(name)


def get_all_entities() -> dict[str, EntityDef]:
    return ENTITY_REGISTRY


def get_entities_by_category() -> dict[str, list[EntityDef]]:
    """Group entities by category, sorted by sort_order."""
    categories: dict[str, list[EntityDef]] = {}
    for entity in sorted(ENTITY_REGISTRY.values(), key=lambda e: e.sort_order):
        cat = entity.category
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(entity)
    return categories
