"""
SCF Entity Registry — Full Schema
====================================
This is the single source of truth for all entity types in the SCF format.
Adding a new entity type means adding an entry here — the database tables,
API routes, and UI forms are all generated from this registry automatically.

Schema derived from the Story State Framework (SSF) specification:
  - Layer Hierarchy (Vision / Performance / Creative)
  - ~100 entity types across all layers
  - Tiered population: Tier 0 (structural) through Tier 6 (production)

Entity categories use functional groupings for the editor sidebar:
  - Project, Story Entities, Story Structure, Vision, Connections (existing)
  - Creative Direction (project-level singletons)
  - Character Depth (per-character detail entities)
  - Location Depth (per-location detail entities)
  - Scene Detail (per-scene creative data)
  - Thematic Tracking (motifs, symbols, subtext)
  - Production (shot-level, execution, choreography)
  - Metadata (decisions, notes, assets)

Field types: text, textarea, integer, float, select, multiselect, boolean, json, reference
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FieldDef:
    """Definition of a single field on an entity."""
    name: str
    label: str
    field_type: str = "text"
    required: bool = False
    default: Any = None
    placeholder: str = ""
    options: list[str] | None = None
    reference_entity: str | None = None
    tab: str = "General"
    help_text: str = ""
    hidden: bool = False
    sql_type: str | None = None

    def get_sql_type(self) -> str:
        if self.sql_type:
            return self.sql_type
        return {
            "text": "TEXT",
            "textarea": "TEXT",
            "integer": "INTEGER",
            "float": "REAL",
            "select": "TEXT",
            "multiselect": "TEXT",
            "boolean": "INTEGER",
            "json": "TEXT",
            "reference": "INTEGER",
        }.get(self.field_type, "TEXT")


@dataclass
class EntityDef:
    """Definition of an entity type."""
    name: str
    label: str
    label_plural: str
    icon: str = "📄"
    name_field: str = "name"
    fields: list[FieldDef] = field(default_factory=list)
    parent_entity: str | None = None
    parent_field: str | None = None
    category: str = "Entities"
    description: str = ""
    sort_order: int = 0
    tier: int = 0               # 0=active in editor, 1+=schema-only (grayed out in UI)

    def get_tabs(self) -> list[str]:
        tabs = []
        for f in self.fields:
            if not f.hidden and f.tab not in tabs:
                tabs.append(f.tab)
        return tabs

    def get_fields_for_tab(self, tab: str) -> list[FieldDef]:
        return [f for f in self.fields if f.tab == tab]


# =============================================================================
# REGISTRY
# =============================================================================

ENTITY_REGISTRY: dict[str, EntityDef] = {}


def register(entity: EntityDef):
    ENTITY_REGISTRY[entity.name] = entity
    return entity


# #############################################################################
#
#  TIER 0 — STRUCTURAL FOUNDATION (existing entities, preserved + extended)
#
# #############################################################################

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
        FieldDef("setting_period", "Setting / Time Period", "text",
                 placeholder="e.g. Victorian England, Near-future Tokyo"),
        FieldDef("target_runtime", "Target Runtime (minutes)", "integer"),
        FieldDef("project_format", "Format", "select", options=[
            "Feature", "Series", "Short", "Commercial", "Other"
        ], help_text="The form factor of the project"),
        FieldDef("status", "Status", "select", options=[
            "Development", "Pre-Production", "Production", "Post-Production", "Complete"
        ], default="Development"),
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
        FieldDef("pronouns", "Pronouns", "text", placeholder="e.g. he/him, she/her, they/them"),
        FieldDef("occupation", "Occupation", "text"),
        FieldDef("status", "Status", "select",
                 options=["Active", "Draft", "Cut", "Archived"], default="Active"),
        FieldDef("summary", "Character Summary", "textarea",
                 placeholder="Brief description of who this character is"),

        # Backstory tab
        FieldDef("backstory", "Backstory", "textarea", tab="Backstory",
                 placeholder="Key events and history that shaped this character"),
        FieldDef("motivation", "Core Motivation", "textarea", tab="Backstory"),
        FieldDef("flaw", "Fatal Flaw", "text", tab="Backstory"),
        FieldDef("arc_description", "Character Arc", "textarea", tab="Backstory",
                 help_text="How does this character change throughout the story?"),
        FieldDef("internal_goal", "Internal Goal", "textarea", tab="Backstory",
                 placeholder="What does the character need emotionally/psychologically?"),
        FieldDef("external_goal", "External Goal", "textarea", tab="Backstory",
                 placeholder="What is the character actively trying to achieve?"),
        FieldDef("greatest_fear", "Greatest Fear", "textarea", tab="Backstory"),
        FieldDef("core_belief", "Core Belief", "textarea", tab="Backstory",
                 placeholder="The fundamental belief this character operates from"),
        FieldDef("education_level", "Education Level", "text", tab="Backstory"),
        FieldDef("skills_abilities", "Skills & Abilities", "textarea", tab="Backstory"),

        # Physical tab (Performance Layer)
        FieldDef("height", "Height", "text", tab="Physical",
                 placeholder="e.g. 5'10\", Tall, Average"),
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
        FieldDef("geography", "Geography / Region", "text",
                 placeholder="e.g. Northern California coast"),
        FieldDef("status", "Status", "select",
                 options=["Active", "Draft", "Cut", "Archived"], default="Active"),

        # Atmosphere tab
        FieldDef("mood", "Mood / Atmosphere", "textarea", tab="Atmosphere",
                 placeholder="What feeling does this place evoke?"),
        FieldDef("lighting", "Lighting", "textarea", tab="Atmosphere",
                 placeholder="e.g. Harsh fluorescent, Dappled sunlight through canopy"),
        FieldDef("color_palette", "Color Palette", "text", tab="Atmosphere",
                 placeholder="e.g. Warm ambers, desaturated greens"),
        FieldDef("time_of_day", "Typical Time of Day", "select", tab="Atmosphere",
                 options=["Dawn", "Morning", "Midday", "Afternoon", "Dusk", "Night", "Varies"]),
        FieldDef("weather", "Weather", "text", tab="Atmosphere"),

        # Sound tab
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
        FieldDef("story_function", "Story Function", "select", options=[
            "MacGuffin", "Character Extension", "Plot Device", "Symbol", "Atmosphere", "Other"
        ]),
        FieldDef("associated_character", "Primary Character", "reference",
                 reference_entity="character"),
        FieldDef("status", "Status", "select",
                 options=["Active", "Draft", "Cut", "Archived"], default="Active"),

        # Physical tab
        FieldDef("material", "Material", "text", tab="Physical",
                 placeholder="e.g. Tarnished silver, worn leather"),
        FieldDef("size", "Size", "text", tab="Physical",
                 placeholder="e.g. Palm-sized, 6 feet tall"),
        FieldDef("color", "Color", "text", tab="Physical"),
        FieldDef("condition", "Condition", "text", tab="Physical",
                 placeholder="e.g. Pristine, battle-worn, ancient"),
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
# Act (Story Structure)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="act",
    label="Act",
    label_plural="Acts",
    icon="🎭",
    category="Story Structure",
    sort_order=30,
    description="A major structural division of the story.",
    fields=[
        FieldDef("name", "Act Name", required=True,
                 placeholder="e.g. Act One, The Setup, Episode 1 Act A"),
        FieldDef("act_number", "Act Number", "integer",
                 placeholder="Position in the structure: 1, 2, 3..."),
        FieldDef("function", "Function", "textarea",
                 placeholder="What does this act do in the story?"),
        FieldDef("dramatic_question", "Dramatic Question", "textarea",
                 placeholder="The central question this act poses"),
        FieldDef("shift", "Shift", "textarea",
                 placeholder="What changes from the start to the end of this act?"),
        FieldDef("summary", "Summary", "textarea"),
        FieldDef("status", "Status", "select", options=[
            "Outline", "Draft", "Revised", "Locked"
        ], default="Outline"),
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
        FieldDef("act_id", "Act", "reference", reference_entity="act"),
        FieldDef("summary", "Summary", "textarea"),
        FieldDef("goal", "Goal", "textarea",
                 placeholder="What is being pursued in this sequence?"),
        FieldDef("conflict", "Conflict", "textarea",
                 placeholder="What stands in the way?"),
        FieldDef("outcome", "Outcome / Resolution", "textarea",
                 placeholder="How does the sequence resolve — success, failure, complication?"),
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
        FieldDef("int_ext", "Int/Ext", "select", options=[
            "Interior", "Exterior", "Int/Ext"
        ]),
        FieldDef("location_id", "Location", "reference", reference_entity="location"),
        FieldDef("time_of_day", "Time of Day", "select", options=[
            "Dawn", "Morning", "Midday", "Afternoon", "Dusk", "Night", "Continuous"
        ]),
        FieldDef("weather_conditions", "Weather", "text",
                 placeholder="e.g. Heavy rain, clear skies, fog"),
        FieldDef("season", "Season", "select", options=[
            "Spring", "Summer", "Autumn", "Winter", "Unspecified"
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

        # Emotional tab
        FieldDef("emotional_beat", "Emotional Beat", "textarea", tab="Emotional",
                 placeholder="What should the audience feel during this scene?"),
        FieldDef("tone", "Tone", "text", tab="Emotional",
                 placeholder="e.g. Tense, comedic, melancholic"),
        FieldDef("tension_level", "Tension Level (1-10)", "integer", tab="Emotional"),
        FieldDef("thematic_connection", "Thematic Connection", "textarea", tab="Emotional",
                 placeholder="How does this scene connect to the project's themes?"),

        # Technical tab
        FieldDef("visual_style", "Visual Style Notes", "textarea", tab="Technical",
                 placeholder="Camera style, lighting approach, color notes"),
        FieldDef("sound_design", "Sound Design Notes", "textarea", tab="Technical"),
        FieldDef("music_notes", "Music Notes", "textarea", tab="Technical"),
        FieldDef("estimated_duration", "Estimated Duration (seconds)", "integer", tab="Technical"),

        FieldDef("notes", "Notes", "textarea", tab="Notes"),
    ],
))

# ---------------------------------------------------------------------------
# Story Beat (Story Structure — sub-scene)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="story_beat",
    label="Story Beat",
    label_plural="Story Beats",
    icon="🎯",
    category="Story Structure",
    sort_order=42,
    description="A discrete narrative unit within a scene — a moment of change.",
    fields=[
        FieldDef("name", "Beat Name", required=True,
                 placeholder="e.g. Eleanor finds the letter"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene",
                 help_text="Required to be useful — assign before saving."),
        FieldDef("beat_order", "Order in Scene", "integer",
                 placeholder="1, 2, 3..."),
        FieldDef("beat_type", "Beat Type", "select", options=[
            "Setup", "Action", "Reaction", "Decision",
            "Discovery", "Revelation", "Reversal", "Payoff", "Other"
        ]),
        FieldDef("description", "Description", "textarea",
                 placeholder="What happens in this beat?"),
        FieldDef("purpose", "Purpose", "textarea",
                 placeholder="Why does this beat exist? What does it accomplish?"),
        FieldDef("value_shift", "Value Shift", "text",
                 placeholder="e.g. Hope → Despair, Trust → Doubt"),
        FieldDef("pov_character_id", "POV Character", "reference",
                 reference_entity="character",
                 help_text="Whose perspective is this beat from? (optional)"),
        FieldDef("notes", "Notes", "textarea"),
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
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
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
        FieldDef("sequence_id", "Sequence", "reference",
                 reference_entity="sequence", required=True),
        FieldDef("order_in_sequence", "Order in Sequence", "integer"),
    ],
))


# #############################################################################
#
#  TIER 1 — PROJECT-LEVEL CREATIVE DIRECTION
#  Singletons: one per project. Establishes the creative DNA.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Project Vision (Vision Layer — Director's Intent)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="project_vision",
    label="Project Vision",
    label_plural="Project Vision",
    icon="🔭",
    category="Creative Direction",
    sort_order=100,
    description="Overarching creative intent — why this story, what it means, what it should accomplish.",
    fields=[
        FieldDef("name", "Name", default="Project Vision", placeholder="Project Vision"),
        FieldDef("vision_statement", "Vision Statement", "textarea",
                 placeholder="Concise articulation of what the film is fundamentally about"),
        FieldDef("core_question", "Core Question", "textarea",
                 placeholder="The central question the film explores"),
        FieldDef("intended_audience_impact", "Intended Audience Impact", "textarea",
                 placeholder="What the film is trying to make the audience feel/think/understand"),
        FieldDef("unique_perspective", "Unique Perspective", "textarea",
                 placeholder="What angle this film brings to its subject"),
        FieldDef("why_tell_this_story", "Why Tell This Story", "textarea",
                 placeholder="Why this story needs to be told now"),
        FieldDef("what_makes_different", "What Makes It Different", "textarea",
                 placeholder="How it differs from others in its genre"),
        FieldDef("success_criteria", "Success Criteria", "textarea",
                 placeholder="What would make this film successful beyond metrics"),
        # Personal Connection tab
        FieldDef("personal_resonance", "Personal Resonance", "textarea", tab="Personal",
                 placeholder="Autobiographical elements, life experiences that connect"),
        FieldDef("emotional_stakes", "Emotional Stakes for Director", "textarea", tab="Personal"),
        FieldDef("artistic_growth_goals", "Artistic Growth Goals", "textarea", tab="Personal",
                 placeholder="What new territory this project explores"),
    ],
))

# ---------------------------------------------------------------------------
# Directorial Philosophy (Vision Layer — Director's Intent)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="directorial_philosophy",
    label="Directorial Philosophy",
    label_plural="Directorial Philosophy",
    icon="🎯",
    category="Creative Direction",
    sort_order=101,
    description="The director's approach to filmmaking on this project.",
    fields=[
        FieldDef("name", "Name", default="Directorial Philosophy"),
        FieldDef("filmmaking_philosophy", "Filmmaking Philosophy", "select", options=[
            "Auteur", "Collaborative", "Actor-Focused", "Visual-First",
            "Story-First", "Experiential"
        ]),
        FieldDef("technical_approach", "Technical Approach", "select", options=[
            "Naturalistic", "Stylized", "Mixed"
        ]),
        FieldDef("aesthetic_priorities", "Aesthetic Priorities", "json",
                 placeholder='["performance", "cinematography", "editing", "sound"]',
                 help_text="Ordered list — what matters most"),
        FieldDef("risk_tolerance", "Risk Tolerance", "select", options=[
            "Safe/Commercial", "Experimental", "Balanced"
        ]),
        FieldDef("audience_relationship", "Audience Relationship", "select", options=[
            "Accessible", "Challenging", "Hybrid"
        ]),
    ],
))

# ---------------------------------------------------------------------------
# Technical Specifications (not in original spec — format-level metadata)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="technical_specs",
    label="Technical Specs",
    label_plural="Technical Specs",
    icon="⚙️",
    category="Creative Direction",
    sort_order=102,
    description="Technical format specifications for the project.",
    fields=[
        FieldDef("name", "Name", default="Technical Specs"),
        FieldDef("aspect_ratio", "Aspect Ratio", "select", options=[
            "1.33:1 (Academy)", "1.66:1", "1.78:1 (16:9)", "1.85:1 (Flat)",
            "2.00:1 (Univisium)", "2.20:1 (70mm)", "2.35:1 (Scope)",
            "2.39:1 (Anamorphic)", "2.76:1 (Ultra Panavision)", "Variable", "Other"
        ]),
        FieldDef("resolution", "Resolution", "select", options=[
            "2K (2048x1080)", "2.8K", "3.4K", "4K (4096x2160)",
            "4.6K", "5.7K", "6K", "6.5K", "8K", "Other"
        ]),
        FieldDef("frame_rate", "Frame Rate", "select", options=[
            "23.976 fps", "24 fps", "25 fps", "29.97 fps", "30 fps",
            "48 fps", "60 fps", "Variable", "Other"
        ]),
        FieldDef("color_space", "Color Space / Gamut", "text",
                 placeholder="e.g. Rec.709, DCI-P3, ACES, Rec.2020"),
        FieldDef("recording_codec", "Recording Codec", "text",
                 placeholder="e.g. ARRIRAW, ProRes 4444, REDCODE"),
        FieldDef("delivery_format", "Delivery Format", "text",
                 placeholder="e.g. DCP 2K Scope, ProRes HQ 4K"),
        FieldDef("audio_format", "Audio Format", "text",
                 placeholder="e.g. 5.1 Surround, Dolby Atmos, Stereo"),
    ],
))

# ---------------------------------------------------------------------------
# Visual Identity (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="visual_identity",
    label="Visual Identity",
    label_plural="Visual Identity",
    icon="👁️",
    category="Creative Direction",
    sort_order=103,
    description="Overarching aesthetic vision — the film's visual DNA.",
    fields=[
        FieldDef("name", "Name", default="Visual Identity"),
        FieldDef("visual_statement", "Visual Statement", "textarea",
                 placeholder="Concise articulation of the film's look"),
        FieldDef("aesthetic_genre", "Aesthetic Genre", "select", options=[
            "Naturalistic", "Stylized", "Hyperreal", "Expressionistic",
            "Fantastical", "Hybrid"
        ]),
        FieldDef("design_era", "Design Era / Period", "text",
                 placeholder="e.g. 1970s New York, Near-future, Timeless"),
        FieldDef("visual_density", "Visual Density", "select", options=[
            "Minimalist", "Moderate", "Dense", "Maximalist"
        ]),
        FieldDef("textural_philosophy", "Textural Philosophy", "select", options=[
            "Clean/Pristine", "Lived-In", "Weathered", "Decayed"
        ]),
        FieldDef("visual_influences", "Visual Influences", "json", tab="Influences",
                 placeholder='["Edward Hopper paintings", "1970s paranoia thrillers", "Japanese wabi-sabi"]',
                 help_text="Art movements, films, photographers, cultural references"),
    ],
))

# ---------------------------------------------------------------------------
# Cinematographic Philosophy (Creative Layer — Cinematography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="cinematographic_philosophy",
    label="Cinematographic Philosophy",
    label_plural="Cinematographic Philosophy",
    icon="🎥",
    category="Creative Direction",
    sort_order=104,
    description="Overall approach to camera, movement, and visual storytelling.",
    fields=[
        FieldDef("name", "Name", default="Cinematographic Philosophy"),
        FieldDef("camera_personality", "Camera Personality", "select", options=[
            "Objective Observer", "Subjective Participant", "Omniscient Presence",
            "Character-Aligned"
        ]),
        FieldDef("movement_philosophy", "Movement Philosophy", "select", options=[
            "Static", "Fluid", "Motivated", "Expressive"
        ]),
        FieldDef("framing_philosophy", "Framing Philosophy", "select", options=[
            "Classical", "Dynamic", "Intimate", "Epic"
        ]),
        FieldDef("visual_consistency", "Visual Consistency", "select", options=[
            "Unified", "Varied", "Evolving"
        ]),
    ],
))

# ---------------------------------------------------------------------------
# Project Color Palette (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="project_color_palette",
    label="Project Color Palette",
    label_plural="Project Color Palette",
    icon="🎨",
    category="Creative Direction",
    sort_order=105,
    description="Overall color scheme and color rules for the entire project.",
    fields=[
        FieldDef("name", "Name", default="Project Color Palette"),
        FieldDef("primary_colors", "Primary Colors (3-5)", "json",
                 placeholder='[{"hex": "#2C3E50", "name": "Midnight Blue"}, {"hex": "#E74C3C", "name": "Alizarin"}]'),
        FieldDef("secondary_colors", "Secondary Colors", "json",
                 placeholder='[{"hex": "#95A5A6", "name": "Silver"}]'),
        FieldDef("accent_colors", "Accent Colors", "json",
                 placeholder='[{"hex": "#F39C12", "name": "Amber"}]'),
        FieldDef("restricted_colors", "Restricted Colors", "json",
                 placeholder='[{"hex": "#FF0000", "name": "Pure Red", "context": "reserved for blood"}]',
                 help_text="Colors to avoid or reserve for specific contexts"),
        FieldDef("saturation_philosophy", "Saturation Philosophy", "select", options=[
            "Highly Saturated", "Desaturated", "Mixed", "Neutral-Heavy"
        ]),
        FieldDef("value_structure", "Value Structure", "select", options=[
            "High Key", "Low Key", "Full Range", "Compressed"
        ]),
        FieldDef("color_evolution", "Color Evolution by Act", "textarea", tab="Evolution",
                 placeholder="How the palette shifts through the story"),
        FieldDef("color_relationships", "Color Relationships", "textarea", tab="Evolution",
                 placeholder="Complementary pairs, temperature contrasts, etc."),
    ],
))

# ---------------------------------------------------------------------------
# Project Tone (Vision Layer — Emotional Architecture)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="project_tone",
    label="Project Tone",
    label_plural="Project Tone",
    icon="🌡️",
    category="Creative Direction",
    sort_order=106,
    description="Overall tonal identity — the emotional temperature of the film.",
    fields=[
        FieldDef("name", "Name", default="Project Tone"),
        FieldDef("primary_tone", "Primary Tone", "text",
                 placeholder="e.g. Dramatic, Comedic, Thriller, Contemplative"),
        FieldDef("tone_blend", "Tone Blend", "json",
                 placeholder='[{"tone": "Drama", "ratio": 60}, {"tone": "Dark Comedy", "ratio": 30}]',
                 help_text="Genre tones present with approximate ratios"),
        FieldDef("lightest_moment", "Lightest Moments", "textarea",
                 placeholder="How light can the film get?"),
        FieldDef("darkest_moment", "Darkest Moments", "textarea",
                 placeholder="How dark can the film get?"),
        FieldDef("tonal_consistency", "Tonal Consistency", "select", options=[
            "Unified", "Varied", "Shifting"
        ]),
        FieldDef("reference_touchstones", "Reference Touchstones", "textarea",
                 placeholder="Other films with similar tone — what to emulate and avoid"),
    ],
))

# ---------------------------------------------------------------------------
# Pacing Strategy (Vision Layer — Emotional Architecture)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="pacing_strategy",
    label="Pacing Strategy",
    label_plural="Pacing Strategy",
    icon="⏱️",
    category="Creative Direction",
    sort_order=107,
    description="Rhythm and timing philosophy at the story level.",
    fields=[
        FieldDef("name", "Name", default="Pacing Strategy"),
        FieldDef("overall_pacing", "Overall Pacing", "select", options=[
            "Slow/Contemplative", "Moderate/Balanced", "Fast/Urgent", "Variable/Dynamic"
        ]),
        FieldDef("pacing_philosophy", "Pacing Philosophy", "textarea",
                 placeholder="What earns slow moments? What earns fast moments?"),
        FieldDef("breathing_room_strategy", "Breathing Room Strategy", "textarea",
                 placeholder="How and when to give the audience space to process"),
        FieldDef("key_acceleration_points", "Key Acceleration Points", "textarea",
                 placeholder="Where pacing deliberately speeds up"),
        FieldDef("key_deceleration_points", "Key Deceleration Points", "textarea",
                 placeholder="Where pacing deliberately slows down"),
    ],
))

# ---------------------------------------------------------------------------
# Sonic Identity (Creative Layer — Sound Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="sonic_identity",
    label="Sonic Identity",
    label_plural="Sonic Identity",
    icon="🔊",
    category="Creative Direction",
    sort_order=108,
    description="Overall approach to the film's sound world.",
    fields=[
        FieldDef("name", "Name", default="Sonic Identity"),
        FieldDef("sound_aesthetic", "Sound Aesthetic", "select", options=[
            "Naturalistic", "Heightened", "Stylized", "Surreal"
        ]),
        FieldDef("sonic_density", "Sonic Density", "select", options=[
            "Sparse", "Moderate", "Dense", "Overwhelming"
        ]),
        FieldDef("silence_philosophy", "Silence Philosophy", "textarea",
                 placeholder="How silence is used, when silence matters"),
        FieldDef("subjective_sound_approach", "Subjective Sound Approach", "textarea",
                 placeholder="When and how we hear a character's perspective"),
        FieldDef("sound_evolution", "Sound Evolution", "textarea",
                 placeholder="How the sonic world changes through the story"),
    ],
))

# ---------------------------------------------------------------------------
# Musical Identity (Creative Layer — Music)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="musical_identity",
    label="Musical Identity",
    label_plural="Musical Identity",
    icon="🎵",
    category="Creative Direction",
    sort_order=109,
    description="Overall approach to the film's music and score.",
    fields=[
        FieldDef("name", "Name", default="Musical Identity"),
        FieldDef("score_approach", "Score Approach", "select", options=[
            "Traditional Orchestral", "Electronic/Synthesized", "Hybrid",
            "Acoustic/Intimate", "Genre-Specific"
        ]),
        FieldDef("musical_tone", "Musical Tone", "select", options=[
            "Emotional Support", "Counterpoint", "Commentary", "Neutral/Ambient"
        ]),
        FieldDef("instrumentation_palette", "Instrumentation Palette", "textarea",
                 placeholder="Primary, secondary, and signature instruments"),
        FieldDef("score_density", "Score Density", "select", options=[
            "Wall-to-Wall", "Selective", "Sparse"
        ]),
        FieldDef("source_music_approach", "Source Music Approach", "textarea",
                 placeholder="Approach to diegetic music — how source relates to score"),
    ],
))

# ---------------------------------------------------------------------------
# Design Constraints (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="design_constraints",
    label="Design Constraints",
    label_plural="Design Constraints",
    icon="📐",
    category="Creative Direction",
    sort_order=110,
    description="Intentional boundaries that shape the visual world.",
    fields=[
        FieldDef("name", "Name", default="Design Constraints"),
        FieldDef("allowed_materials", "Allowed Materials", "json",
                 placeholder='["natural wood", "raw concrete", "rusted metal"]'),
        FieldDef("forbidden_materials", "Forbidden Materials", "json",
                 placeholder='["chrome", "neon", "plastic"]'),
        FieldDef("dominant_materials", "Dominant Materials", "text",
                 placeholder="Most prevalent materials in the world"),
        FieldDef("technology_level", "Technology Level", "text",
                 placeholder="What technology exists in this world"),
        FieldDef("technology_aesthetic", "Technology Aesthetic", "text",
                 placeholder="How technology looks and feels"),
        FieldDef("architectural_styles", "Architectural Styles", "text"),
        FieldDef("scale_rules", "Scale Rules", "select", options=[
            "Human Scale", "Intimate", "Monumental", "Mixed"
        ]),
        FieldDef("geometric_language", "Geometric Language", "select", options=[
            "Organic", "Angular", "Mixed"
        ]),
        FieldDef("lighting_constraints", "Lighting Constraints", "textarea",
                 placeholder="Available light sources, stylization rules"),
    ],
))

# ---------------------------------------------------------------------------
# Look Development (Creative Layer — Cinematography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="look_development",
    label="Look Development",
    label_plural="Look Development",
    icon="🖼️",
    category="Creative Direction",
    sort_order=111,
    description="Target visual look for the final image — grading and post direction.",
    fields=[
        FieldDef("name", "Name", default="Look Development"),
        FieldDef("contrast", "Contrast", "select", options=["Flat", "Normal", "High"]),
        FieldDef("saturation", "Saturation", "select",
                 options=["Desaturated", "Normal", "Vivid"]),
        FieldDef("color_bias", "Color Bias", "select",
                 options=["Warm", "Cool", "Neutral", "Tinted"]),
        FieldDef("highlight_handling", "Highlight Handling", "select",
                 options=["Preserved", "Blown", "Rolled-Off"]),
        FieldDef("shadow_handling", "Shadow Handling", "select",
                 options=["Crushed", "Lifted", "Detailed"]),
        FieldDef("grain_texture", "Grain / Texture", "select",
                 options=["Clean", "Subtle Grain", "Heavy Grain"]),
        FieldDef("on_set_lut", "On-Set LUT", "text", tab="LUTs"),
        FieldDef("editorial_lut", "Editorial LUT", "text", tab="LUTs"),
        FieldDef("final_grade_foundation", "Final Grade Foundation", "textarea", tab="LUTs"),
        FieldDef("reference_images", "Reference Images / Notes", "textarea", tab="References"),
    ],
))

# ---------------------------------------------------------------------------
# Coverage Philosophy (Creative Layer — Cinematography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="coverage_philosophy",
    label="Coverage Philosophy",
    label_plural="Coverage Philosophy",
    icon="📹",
    category="Creative Direction",
    sort_order=112,
    description="Approach to shooting and editorial coverage.",
    fields=[
        FieldDef("name", "Name", default="Coverage Philosophy"),
        FieldDef("coverage_style", "Coverage Style", "select", options=[
            "Master + Coverage", "Single Camera", "Multi-Camera",
            "Oner/Long Take", "Run-and-Gun", "Shot-List Driven"
        ]),
        FieldDef("editorial_approach", "Editorial Approach", "select", options=[
            "Cut-Friendly", "In-Camera Editing", "Improvised"
        ]),
        FieldDef("coverage_priorities", "Coverage Priorities", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Costume Design Philosophy (Creative Layer — Character Appearance)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="costume_design_philosophy",
    label="Costume Design Philosophy",
    label_plural="Costume Design Philosophy",
    icon="👗",
    category="Creative Direction",
    sort_order=113,
    description="Overall approach to wardrobe and costume design.",
    fields=[
        FieldDef("name", "Name", default="Costume Design Philosophy"),
        FieldDef("design_approach", "Design Approach", "select", options=[
            "Period-Accurate", "Period-Inspired", "Contemporary",
            "Timeless", "Stylized", "Fantastical"
        ]),
        FieldDef("silhouette_strategy", "Silhouette Strategy", "textarea",
                 placeholder="Dominant silhouettes, character differentiation through shape"),
        FieldDef("fabric_philosophy", "Fabric Philosophy", "select",
                 options=["Natural", "Synthetic", "Mixed"]),
        FieldDef("formality_spectrum", "Formality Spectrum", "textarea"),
        FieldDef("condition_philosophy", "Condition Philosophy", "textarea",
                 placeholder="Pristine to distressed — how wardrobe shows wear"),
    ],
))

# ---------------------------------------------------------------------------
# Material Palette (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="material_palette",
    label="Material Palette",
    label_plural="Material Palette",
    icon="🧱",
    category="Creative Direction",
    sort_order=114,
    description="Dominant materials and textures in the film's world.",
    fields=[
        FieldDef("name", "Name", default="Material Palette"),
        FieldDef("primary_materials", "Primary Materials", "json",
                 placeholder='["weathered oak", "tarnished brass", "raw linen"]'),
        FieldDef("secondary_materials", "Secondary Materials", "json"),
        FieldDef("accent_materials", "Accent Materials", "json"),
        FieldDef("forbidden_materials", "Forbidden Materials", "json"),
        FieldDef("material_storytelling", "Material Storytelling", "textarea",
                 placeholder="What materials reveal about characters and world"),
    ],
))

# ---------------------------------------------------------------------------
# Texture Philosophy (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="texture_philosophy",
    label="Texture Philosophy",
    label_plural="Texture Philosophy",
    icon="🪨",
    category="Creative Direction",
    sort_order=115,
    description="Approach to surface quality throughout the film.",
    fields=[
        FieldDef("name", "Name", default="Texture Philosophy"),
        FieldDef("texture_spectrum", "Texture Spectrum", "select",
                 options=["Smooth Dominance", "Rough Dominance", "Mixed"]),
        FieldDef("texture_contrast_strategy", "Texture Contrast Strategy", "textarea"),
        FieldDef("surface_finish_preference", "Surface Finish Preference", "textarea"),
        FieldDef("patina_aging_approach", "Patina & Aging Approach", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Color Temperature Strategy (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="color_temperature_strategy",
    label="Color Temperature Strategy",
    label_plural="Color Temperature Strategy",
    icon="🌡️",
    category="Creative Direction",
    sort_order=116,
    description="Warm/cool distribution across the story.",
    fields=[
        FieldDef("name", "Name", default="Color Temperature Strategy"),
        FieldDef("overall_approach", "Overall Approach", "select",
                 options=["Warm", "Cool", "Balanced", "Journey"]),
        FieldDef("warm_associations", "Warm Associations", "textarea",
                 placeholder="What warm tones mean in this story"),
        FieldDef("cool_associations", "Cool Associations", "textarea",
                 placeholder="What cool tones mean in this story"),
        FieldDef("temperature_contrast_points", "Temperature Contrast Points", "textarea"),
        FieldDef("day_scene_temperature", "Day Scene Temperature", "text"),
        FieldDef("night_scene_temperature", "Night Scene Temperature", "text"),
    ],
))


# #############################################################################
#
#  TIER 2 — CHARACTER DEPTH
#  Per-character structured data from Performance + Creative layers.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Character Relationship (replaces JSON blob with proper entity)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="character_relationship",
    label="Character Relationship",
    label_plural="Character Relationships",
    icon="🤝",
    category="Character Depth",
    sort_order=200,
    description="Relationship between two characters with dynamics and evolution.",
    fields=[
        FieldDef("name", "Relationship Label", placeholder="e.g. Father/Son, Rivals"),
        FieldDef("character_a_id", "Character A", "reference",
                 reference_entity="character", required=True),
        FieldDef("character_b_id", "Character B", "reference",
                 reference_entity="character", required=True),
        FieldDef("relationship_type", "Type", "select", options=[
            "Family", "Friend", "Enemy", "Lover", "Colleague",
            "Mentor/Mentee", "Rival", "Authority", "Other"
        ]),
        FieldDef("specific_relationship", "Specific Relationship", "text",
                 placeholder="e.g. estranged brothers, childhood sweethearts"),
        FieldDef("emotional_valence", "Emotional Valence", "select",
                 options=["Positive", "Negative", "Complex", "Neutral"]),
        FieldDef("power_dynamic", "Power Dynamic", "textarea"),
        FieldDef("relationship_arc", "Relationship Arc", "textarea",
                 placeholder="How does this relationship change through the story?"),
        FieldDef("history", "History", "textarea", tab="Background"),
        FieldDef("current_status", "Current Status", "text", tab="Background"),
    ],
))

# ---------------------------------------------------------------------------
# Character Color Identity (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="character_color_identity",
    label="Character Color Identity",
    label_plural="Character Color Identities",
    icon="🎨",
    category="Character Depth",
    sort_order=201,
    parent_entity="character",
    parent_field="character_id",
    description="Signature color language for a character.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Color Identity"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("primary_color_hex", "Primary Color (hex)", "text",
                 placeholder="#2C3E50"),
        FieldDef("primary_color_name", "Primary Color Name", "text",
                 placeholder="e.g. Midnight Blue"),
        FieldDef("secondary_colors", "Secondary Colors", "json",
                 placeholder='[{"hex": "#7F8C8D", "name": "Concrete Gray"}]'),
        FieldDef("how_manifests", "How Colors Manifest", "select", options=[
            "Wardrobe", "Accessories", "Environment", "Lighting", "Multiple"
        ]),
        FieldDef("why_these_colors", "Why These Colors", "textarea",
                 placeholder="Personality, plot, or thematic reasons for this palette"),
        FieldDef("consistency_level", "Consistency Level", "select",
                 options=["Always", "Usually", "Accent Only", "Metaphor Only"]),
        FieldDef("starting_colors", "Starting Colors", "text", tab="Evolution"),
        FieldDef("midpoint_shift", "Midpoint Shift", "text", tab="Evolution"),
        FieldDef("final_colors", "Final Colors", "text", tab="Evolution"),
        FieldDef("color_isolation", "Color Isolation", "select", tab="Evolution",
                 options=["Unique to Character", "Shared", "Contrasting with Another"]),
    ],
))

# ---------------------------------------------------------------------------
# Physical Character Profile (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="physical_character_profile",
    label="Physical Character Profile",
    label_plural="Physical Character Profiles",
    icon="🏃",
    category="Character Depth",
    sort_order=202,
    parent_entity="character",
    parent_field="character_id",
    description="Baseline physical existence — posture, movement, tension, energy.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Physicality"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        # Foundation
        FieldDef("posture", "Posture", "select", options=[
            "Upright", "Slouched", "Rigid", "Relaxed", "Asymmetric"
        ]),
        FieldDef("center_of_gravity", "Center of Gravity", "select",
                 options=["High", "Low", "Forward", "Back"]),
        FieldDef("tension_level", "Physical Tension Level", "select",
                 options=["Tense", "Relaxed", "Variable"]),
        FieldDef("energy_quality", "Energy Quality", "select",
                 options=["Kinetic", "Still", "Restless", "Contained"]),
        # Movement
        FieldDef("movement_speed", "Movement Speed", "select", tab="Movement",
                 options=["Quick", "Slow", "Deliberate", "Erratic"]),
        FieldDef("movement_fluidity", "Movement Fluidity", "select", tab="Movement",
                 options=["Smooth", "Jerky", "Graceful", "Awkward"]),
        FieldDef("movement_economy", "Movement Economy", "select", tab="Movement",
                 options=["Efficient", "Wasteful", "Precise", "Sloppy"]),
        FieldDef("movement_weight", "Movement Weight", "select", tab="Movement",
                 options=["Light", "Heavy", "Grounded", "Floating"]),
        # Presence
        FieldDef("spatial_presence", "Spatial Presence", "select", tab="Presence",
                 options=["Takes Up Space", "Minimizes Self"]),
        FieldDef("physical_comfort", "Physical Comfort", "select", tab="Presence",
                 options=["At Home in Body", "Disconnected"]),
        FieldDef("coordination_level", "Coordination Level", "text", tab="Presence"),
        # History
        FieldDef("physical_training_visible", "Physical Training Visible", "textarea",
                 tab="History", placeholder="e.g. Athlete, dancer, soldier — how it shows"),
        FieldDef("physical_neglect_visible", "Physical Neglect Visible", "textarea",
                 tab="History"),
        FieldDef("injuries_visible_in_movement", "Injuries Visible in Movement", "textarea",
                 tab="History"),
    ],
))

# ---------------------------------------------------------------------------
# Vocal Profile (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="vocal_profile",
    label="Vocal Profile",
    label_plural="Vocal Profiles",
    icon="🗣️",
    category="Character Depth",
    sort_order=203,
    parent_entity="character",
    parent_field="character_id",
    description="Baseline vocal identity — how a character sounds.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Voice"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        # Voice Qualities
        FieldDef("pitch_range", "Pitch Range", "select",
                 options=["High", "Low", "Middle", "Variable"]),
        FieldDef("timbre", "Timbre", "select",
                 options=["Warm", "Nasal", "Resonant", "Thin", "Gravelly"]),
        FieldDef("volume_tendency", "Volume Tendency", "select",
                 options=["Loud", "Soft", "Variable"]),
        FieldDef("breathiness_level", "Breathiness", "select",
                 options=["None", "Slight", "Moderate", "Heavy"]),
        # Speech Patterns
        FieldDef("pace", "Pace", "select", tab="Speech",
                 options=["Fast", "Slow", "Measured", "Variable"]),
        FieldDef("rhythm", "Rhythm", "select", tab="Speech",
                 options=["Regular", "Syncopated", "Halting"]),
        FieldDef("articulation", "Articulation", "select", tab="Speech",
                 options=["Precise", "Mumbled", "Clipped", "Drawled"]),
        FieldDef("fluency", "Fluency", "select", tab="Speech",
                 options=["Smooth", "Stuttered", "Filled Pauses"]),
        # Accent/Dialect
        FieldDef("regional_markers", "Regional Markers", "text", tab="Accent",
                 placeholder="e.g. Southern US, Cockney, Midwestern"),
        FieldDef("class_markers", "Class Markers", "text", tab="Accent"),
        FieldDef("educational_markers", "Educational Markers", "text", tab="Accent"),
        FieldDef("accent_authenticity", "Accent Authenticity", "select", tab="Accent",
                 options=["Native", "Acquired", "Affected"]),
        # Verbal Habits
        FieldDef("filler_words", "Filler Words", "json", tab="Habits",
                 placeholder='["like", "um", "you know"]'),
        FieldDef("catch_phrases", "Catch Phrases", "json", tab="Habits",
                 placeholder='["fair enough", "listen here"]'),
        FieldDef("verbal_tics", "Verbal Tics", "json", tab="Habits",
                 placeholder='["clears throat before lying", "trailing off when unsure"]'),
    ],
))

# ---------------------------------------------------------------------------
# Delivery Profile (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="delivery_profile",
    label="Delivery Profile",
    label_plural="Delivery Profiles",
    icon="🎭",
    category="Character Depth",
    sort_order=204,
    parent_entity="character",
    parent_field="character_id",
    description="How a character generally delivers lines — style, access, subtext.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Delivery"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("delivery_style", "Delivery Style", "select", options=[
            "Naturalistic", "Theatrical", "Minimalist", "Mannered"
        ]),
        FieldDef("emotional_access", "Emotional Access", "select",
                 options=["Available", "Controlled", "Variable"]),
        FieldDef("subtext_playing", "Subtext Playing", "select",
                 options=["Plays Clearly", "Hides", "Unaware"]),
        FieldDef("listening_behavior", "Listening Behavior", "textarea",
                 placeholder="How character listens — active, distracted, evaluating"),
        FieldDef("interruption_tendencies", "Interruption Tendencies", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Facial Expression Profile (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="facial_expression_profile",
    label="Facial Expression Profile",
    label_plural="Facial Expression Profiles",
    icon="😐",
    category="Character Depth",
    sort_order=205,
    parent_entity="character",
    parent_field="character_id",
    description="Face as performance instrument — baseline expressions, eye/mouth behavior.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Expressions"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("resting_face", "Resting Face", "textarea",
                 placeholder="What does the face do naturally at rest?"),
        FieldDef("expressiveness_level", "Expressiveness Level", "select",
                 options=["Mobile", "Controlled", "Flat"]),
        FieldDef("asymmetries", "Asymmetries", "text"),
        FieldDef("eye_contact_patterns", "Eye Contact Patterns", "textarea", tab="Eyes",
                 placeholder="Holds, avoids, challenges"),
        FieldDef("gaze_direction_tendencies", "Gaze Direction Tendencies", "textarea",
                 tab="Eyes"),
        FieldDef("blink_rate_variations", "Blink Rate Variations", "text", tab="Eyes"),
        FieldDef("mouth_tension_patterns", "Mouth Tension Patterns", "textarea", tab="Mouth"),
        FieldDef("smile_authenticity", "Smile Authenticity", "textarea", tab="Mouth",
                 placeholder="Genuine vs performed, asymmetric, delayed"),
    ],
))

# ---------------------------------------------------------------------------
# Character Appearance Profile (Creative Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="character_appearance_profile",
    label="Character Appearance Profile",
    label_plural="Character Appearance Profiles",
    icon="👤",
    category="Character Depth",
    sort_order=206,
    parent_entity="character",
    parent_field="character_id",
    description="Complete visual design — silhouette, distinction, evolution.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Appearance"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("body_type", "Body Type", "text"),
        FieldDef("height_proportions", "Height / Proportions", "text"),
        FieldDef("age_appearance", "Age Appearance", "text",
                 placeholder="How old do they look (may differ from actual age)?"),
        FieldDef("skin_tone", "Skin Tone", "text", tab="Appearance"),
        FieldDef("grooming_level", "Grooming Level", "text", tab="Appearance"),
        FieldDef("visual_distinction", "Visual Distinction", "textarea", tab="Identity",
                 placeholder="What makes this character visually distinct at a glance?"),
        FieldDef("silhouette_description", "Silhouette Description", "textarea", tab="Identity",
                 placeholder="Recognizable shape in outline"),
        FieldDef("visual_shorthand", "Visual Shorthand", "textarea", tab="Identity",
                 placeholder="Instant visual read — what do you see first?"),
        FieldDef("appearance_evolution", "Appearance Evolution", "textarea", tab="Evolution",
                 placeholder="How appearance changes through the story and what changes signify"),
    ],
))

# ---------------------------------------------------------------------------
# Costume (Creative Layer — Character Appearance)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="costume",
    label="Costume",
    label_plural="Costumes",
    icon="👔",
    category="Character Depth",
    sort_order=207,
    parent_entity="character",
    parent_field="character_id",
    description="A specific wardrobe look for a character.",
    fields=[
        FieldDef("name", "Costume Name", required=True,
                 placeholder="e.g. Eleanor's Work Outfit, Marcus's Disguise"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        # Design
        FieldDef("description", "Description", "textarea"),
        FieldDef("silhouette", "Silhouette", "text"),
        FieldDef("key_garments", "Key Garments", "json",
                 placeholder='["navy wool overcoat", "white cotton shirt", "brown leather boots"]'),
        FieldDef("layers", "Layers", "textarea"),
        FieldDef("accessories", "Accessories", "json",
                 placeholder='["pocket watch", "leather satchel"]'),
        # Color
        FieldDef("primary_color_hex", "Primary Color (hex)", "text", tab="Color",
                 placeholder="#2C3E50"),
        FieldDef("primary_color_name", "Primary Color Name", "text", tab="Color"),
        FieldDef("secondary_colors", "Secondary Colors", "json", tab="Color"),
        # Material
        FieldDef("fabrics", "Fabrics", "textarea", tab="Material"),
        FieldDef("texture_qualities", "Texture Qualities", "textarea", tab="Material"),
        # Condition & Meaning
        FieldDef("condition", "Condition", "select", tab="Narrative",
                 options=["New", "Worn", "Distressed"]),
        FieldDef("what_reveals", "What It Reveals", "textarea", tab="Narrative",
                 placeholder="What does this costume say about the character?"),
        FieldDef("emotional_state_reflected", "Emotional State Reflected", "textarea",
                 tab="Narrative"),
        FieldDef("social_signals", "Social/Economic Signals", "textarea", tab="Narrative"),
        FieldDef("continuity_notes", "Continuity Notes", "textarea", tab="Notes"),
    ],
))

# ---------------------------------------------------------------------------
# Costume-Scene Junction
# ---------------------------------------------------------------------------
register(EntityDef(
    name="costume_scene",
    label="Costume-Scene",
    label_plural="Costume-Scenes",
    icon="🔗",
    category="Connections",
    sort_order=63,
    description="Links a costume to the scenes where it appears.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("costume_id", "Costume", "reference",
                 reference_entity="costume", required=True),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("condition_in_scene", "Condition in Scene", "text"),
        FieldDef("notes", "Notes", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Costume Progression (Creative Layer — Character Appearance)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="costume_progression",
    label="Costume Progression",
    label_plural="Costume Progressions",
    icon="📈",
    category="Character Depth",
    sort_order=208,
    parent_entity="character",
    parent_field="character_id",
    description="How wardrobe evolves through the story arc.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor's Wardrobe Arc"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("starting_wardrobe", "Starting Wardrobe", "textarea"),
        FieldDef("starting_meaning", "Starting Meaning", "textarea"),
        FieldDef("progression_stages", "Progression Stages", "json",
                 placeholder='[{"trigger": "job loss", "change": "formality drops", "meaning": "masks falling"}]'),
        FieldDef("color_evolution", "Color Evolution", "textarea"),
        FieldDef("formality_evolution", "Formality Evolution", "textarea"),
        FieldDef("condition_evolution", "Condition Evolution", "textarea"),
        FieldDef("symbolic_meaning", "Symbolic Meaning", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Makeup & Hair Design (Creative Layer — Character Appearance)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="makeup_hair_design",
    label="Makeup & Hair Design",
    label_plural="Makeup & Hair Designs",
    icon="💇",
    category="Character Depth",
    sort_order=209,
    parent_entity="character",
    parent_field="character_id",
    description="Non-costume appearance: makeup, hair, prosthetics.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor - Baseline, Eleanor - Post-Fight"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("scene_id", "Scene (if scene-specific)", "reference",
                 reference_entity="scene"),
        FieldDef("makeup_approach", "Makeup Approach", "select", options=[
            "Naturalistic", "Beauty", "Character", "Special Effects"
        ]),
        FieldDef("makeup_details", "Makeup Details", "textarea"),
        FieldDef("hair_style", "Hair Style", "text", tab="Hair"),
        FieldDef("hair_condition", "Hair Condition", "text", tab="Hair"),
        FieldDef("hair_notes", "Hair Notes", "textarea", tab="Hair"),
        FieldDef("prosthetics", "Prosthetics", "textarea", tab="Effects"),
        FieldDef("aging_effects", "Aging Effects", "textarea", tab="Effects"),
        FieldDef("injury_effects", "Injury Effects", "textarea", tab="Effects"),
    ],
))

# ---------------------------------------------------------------------------
# Character Variant (Base Entity extension)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="character_variant",
    label="Character Variant",
    label_plural="Character Variants",
    icon="🔀",
    category="Character Depth",
    sort_order=210,
    parent_entity="character",
    parent_field="character_id",
    description="Specific state or version of a character (e.g. Young Eleanor, Angry Marcus).",
    fields=[
        FieldDef("name", "Variant Name", required=True,
                 placeholder="e.g. Young Eleanor, Marcus in Disguise"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("physical_differences", "Physical Differences", "textarea"),
        FieldDef("emotional_state", "Emotional State", "textarea"),
        FieldDef("context", "Context", "textarea",
                 placeholder="When/why this variant appears"),
        FieldDef("duration_type", "Duration", "select",
                 options=["Temporary", "Permanent"]),
    ],
))


# #############################################################################
#
#  TIER 2 — LOCATION DEPTH
#  Per-location structured data from Creative Layer.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Location Design (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="location_design",
    label="Location Design",
    label_plural="Location Designs",
    icon="🏗️",
    category="Location Depth",
    sort_order=300,
    parent_entity="location",
    parent_field="location_id",
    description="Detailed visual design — architecture, materials, spatial layout.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. The Old Mill — Design"),
        FieldDef("location_id", "Location", "reference",
                 reference_entity="location", required=True),
        FieldDef("design_concept", "Design Concept", "textarea",
                 placeholder="Core design idea for this location"),
        FieldDef("visual_metaphor", "Visual Metaphor", "textarea",
                 placeholder="What does this place represent visually?"),
        FieldDef("emotional_target", "Emotional Target", "textarea",
                 placeholder="What feeling should this location evoke?"),
        # Architecture
        FieldDef("period_style", "Period / Style", "text", tab="Architecture"),
        FieldDef("condition", "Condition", "select", tab="Architecture",
                 options=["Pristine", "Maintained", "Neglected", "Ruined"]),
        FieldDef("scale", "Scale", "select", tab="Architecture",
                 options=["Intimate", "Domestic", "Commercial", "Monumental"]),
        FieldDef("geometry", "Geometry", "select", tab="Architecture",
                 options=["Organic", "Angular", "Chaotic", "Ordered"]),
        # Materials
        FieldDef("dominant_materials", "Dominant Materials", "textarea", tab="Materials"),
        FieldDef("secondary_materials", "Secondary Materials", "textarea", tab="Materials"),
        FieldDef("texture_quality", "Texture Quality", "textarea", tab="Materials"),
        FieldDef("surface_finish", "Surface Finish", "textarea", tab="Materials"),
        # Spatial
        FieldDef("spatial_description", "Spatial Layout", "textarea", tab="Spatial"),
        FieldDef("sight_lines", "Sight Lines", "textarea", tab="Spatial"),
        FieldDef("key_focal_points", "Key Focal Points", "textarea", tab="Spatial"),
        # Lighting
        FieldDef("natural_light_sources", "Natural Light Sources", "textarea", tab="Lighting"),
        FieldDef("practical_light_sources", "Practical Light Sources", "textarea",
                 tab="Lighting"),
        FieldDef("light_quality", "Light Quality", "textarea", tab="Lighting"),
    ],
))

# ---------------------------------------------------------------------------
# Location Variant
# ---------------------------------------------------------------------------
register(EntityDef(
    name="location_variant",
    label="Location Variant",
    label_plural="Location Variants",
    icon="🔀",
    category="Location Depth",
    sort_order=301,
    parent_entity="location",
    parent_field="location_id",
    description="Modified state of a location (e.g. Night version, After fire).",
    fields=[
        FieldDef("name", "Variant Name", required=True,
                 placeholder="e.g. Warehouse - Night, Apartment - After Fire"),
        FieldDef("location_id", "Location", "reference",
                 reference_entity="location", required=True),
        FieldDef("physical_differences", "Physical Differences", "textarea"),
        FieldDef("lighting_differences", "Lighting Differences", "textarea"),
        FieldDef("emotional_shift", "Emotional Shift", "textarea"),
        FieldDef("time_context", "Time / Story Context", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Location Color Scheme (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="location_color_scheme",
    label="Location Color Scheme",
    label_plural="Location Color Schemes",
    icon="🎨",
    category="Location Depth",
    sort_order=302,
    parent_entity="location",
    parent_field="location_id",
    description="Color palette and atmosphere for a specific location.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. The Old Mill — Colors"),
        FieldDef("location_id", "Location", "reference",
                 reference_entity="location", required=True),
        FieldDef("dominant_colors", "Dominant Colors", "json",
                 placeholder='[{"hex": "#8B7355", "name": "Aged Oak"}]'),
        FieldDef("color_motivation", "Color Motivation", "select",
                 options=["Period", "Character", "Symbolic", "Practical"]),
        FieldDef("color_atmosphere", "Color Atmosphere", "select",
                 options=["Warm", "Cool", "Neutral", "Colorful"]),
        FieldDef("color_intensity", "Color Intensity", "select",
                 options=["Saturated", "Desaturated", "Mixed"]),
        FieldDef("character_location_interaction", "Character-Location Color Interaction",
                 "select", options=["Match", "Contrast", "Transform"]),
    ],
))

# ---------------------------------------------------------------------------
# Location Sound Profile (Creative Layer — Sound Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="location_sound_profile",
    label="Location Sound Profile",
    label_plural="Location Sound Profiles",
    icon="🔉",
    category="Location Depth",
    sort_order=303,
    parent_entity="location",
    parent_field="location_id",
    description="Acoustic identity of a place — room tone, ambience, character.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. The Old Mill — Sound"),
        FieldDef("location_id", "Location", "reference",
                 reference_entity="location", required=True),
        FieldDef("room_tone", "Room Tone", "textarea",
                 placeholder="The sound of the space itself"),
        FieldDef("reverb_quality", "Reverb / Reflection", "textarea"),
        FieldDef("resonance", "Resonance Characteristics", "textarea"),
        FieldDef("constant_sounds", "Constant Sounds", "json", tab="Ambience",
                 placeholder='["hum of machinery", "dripping water", "wind through cracks"]'),
        FieldDef("variable_sounds", "Variable Sounds", "textarea", tab="Ambience"),
        FieldDef("characteristic_sounds", "Characteristic Sounds", "textarea", tab="Ambience",
                 placeholder="What makes this place sonically unique"),
        FieldDef("sonic_perspective", "Sonic Perspective", "textarea", tab="Ambience",
                 placeholder="Interior/exterior, open/enclosed, near/distant"),
    ],
))


# #############################################################################
#
#  TIER 3 — SCENE DETAIL
#  Per-scene creative data from Vision + Creative layers.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Scene Emotional Target (Vision Layer — Emotional Architecture)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_emotional_target",
    label="Scene Emotional Target",
    label_plural="Scene Emotional Targets",
    icon="💗",
    category="Scene Detail",
    sort_order=400,
    parent_entity="scene",
    parent_field="scene_id",
    description="Specific emotional goal and function for a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Emotional Target"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("primary_emotion", "Primary Emotion", "text", required=True,
                 placeholder="e.g. Terror, Relief, Joy, Dread"),
        FieldDef("primary_intensity", "Intensity (1-10)", "integer"),
        FieldDef("secondary_emotions", "Secondary Emotions", "json",
                 placeholder='["anxiety", "hope"]'),
        FieldDef("emotional_function", "Emotional Function", "select", options=[
            "Setup", "Build", "Release", "Shift", "Sustain"
        ]),
        FieldDef("audience_character_relationship", "Audience-Character Relationship",
                 "select", options=["Empathy", "Sympathy", "Antipathy", "Observation"]),
        FieldDef("contrast_with_previous", "Contrast with Previous Scene", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Scene Color Palette (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_color_palette",
    label="Scene Color Palette",
    label_plural="Scene Color Palettes",
    icon="🎨",
    category="Scene Detail",
    sort_order=401,
    parent_entity="scene",
    parent_field="scene_id",
    description="Specific color design for a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Colors"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("dominant_colors", "Dominant Colors (1-3)", "json",
                 placeholder='[{"hex": "#4A5568", "name": "Gray-Blue", "pct": 40}]'),
        FieldDef("color_harmony_type", "Color Harmony Type", "select", options=[
            "Monochromatic", "Analogous", "Complementary", "Triadic", "Split-Complementary"
        ]),
        FieldDef("color_source_distribution", "Color Source Distribution", "textarea",
                 placeholder="Where colors come from: lighting %, wardrobe %, design %, props %"),
        FieldDef("color_contrast_level", "Color Contrast Level", "select",
                 options=["Low", "Medium", "High"]),
        FieldDef("focal_color", "Focal / Hero Color", "text",
                 placeholder="The one color that draws the eye"),
        FieldDef("grading_notes", "Color Grading Notes", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Lighting Design (Creative Layer — Cinematography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="lighting_design",
    label="Lighting Design",
    label_plural="Lighting Designs",
    icon="💡",
    category="Scene Detail",
    sort_order=402,
    parent_entity="scene",
    parent_field="scene_id",
    description="Illumination approach for a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Lighting"),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene", required=True),
        FieldDef("shot_id", "Shot (optional)", "reference", reference_entity="shot"),
        FieldDef("lighting_style", "Lighting Style", "select", options=[
            "Naturalistic", "Stylized", "High Key", "Low Key", "Chiaroscuro"
        ]),
        FieldDef("contrast_ratio", "Contrast Ratio", "text", placeholder="e.g. 4:1, 2:1"),
        FieldDef("overall_mood", "Overall Mood", "text"),
        FieldDef("light_quality", "Overall Light Quality", "select",
                 options=["Hard", "Soft", "Mixed"]),
        # Key light
        FieldDef("key_source", "Key Light Source", "text", tab="Key Light",
                 placeholder="e.g. Window camera-left, practial desk lamp"),
        FieldDef("key_direction", "Key Direction", "text", tab="Key Light"),
        FieldDef("key_quality", "Key Quality", "select", tab="Key Light",
                 options=["Hard", "Soft"]),
        FieldDef("key_color_temperature", "Key Color Temperature (K)", "integer",
                 tab="Key Light", placeholder="e.g. 5600"),
        # Fill and other
        FieldDef("fill_ratio", "Fill Ratio", "text", tab="Fill & Other",
                 placeholder="e.g. 2:1 to key"),
        FieldDef("fill_quality", "Fill Quality", "text", tab="Fill & Other"),
        FieldDef("fill_color_temperature", "Fill Color Temp (K)", "integer",
                 tab="Fill & Other"),
        FieldDef("backlight_notes", "Back/Rim/Hair Light", "textarea", tab="Fill & Other"),
        FieldDef("practical_lights", "Practical Lights", "textarea", tab="Fill & Other",
                 placeholder="What's visible in scene, how practicals motivate lighting"),
        FieldDef("ambient_light", "Ambient Light", "textarea", tab="Fill & Other"),
        FieldDef("lighting_evolution", "Lighting Evolution Through Scene", "textarea",
                 tab="Fill & Other"),
    ],
))

# ---------------------------------------------------------------------------
# Scene Music Design (Creative Layer — Music)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_music_design",
    label="Scene Music Design",
    label_plural="Scene Music Designs",
    icon="🎶",
    category="Scene Detail",
    sort_order=403,
    parent_entity="scene",
    parent_field="scene_id",
    description="Music approach for a specific scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Music"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("music_presence", "Music Presence", "select",
                 options=["Score", "Source", "None", "Mixed"]),
        FieldDef("emotional_function", "Emotional Function", "select",
                 options=["Support", "Anticipate", "Counterpoint", "Neutral"]),
        FieldDef("entry_point", "Entry Point", "text",
                 placeholder="When music enters the scene"),
        FieldDef("build_evolution", "Build / Evolution", "textarea"),
        FieldDef("peak", "Peak", "text"),
        FieldDef("exit_point", "Exit Point", "text"),
        FieldDef("themes_used", "Themes Used", "json",
                 placeholder='["Eleanor Theme — piano variation", "Danger motif"]'),
        FieldDef("source_music_description", "Source Music Description", "textarea",
                 tab="Source Music"),
        FieldDef("lyrics_relevance", "Lyrics Relevance", "textarea", tab="Source Music"),
    ],
))

# ---------------------------------------------------------------------------
# Tone Marker (Vision Layer — Emotional Architecture)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="tone_marker",
    label="Tone Marker",
    label_plural="Tone Markers",
    icon="🏷️",
    category="Scene Detail",
    sort_order=404,
    description="Scene-specific tonal quality and atmosphere.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Tone"),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene"),
        FieldDef("sequence_id", "Sequence", "reference", reference_entity="sequence"),
        FieldDef("tone_descriptor", "Tone Descriptor", "text",
                 placeholder="e.g. Comedic, Suspenseful, Whimsical, Raw"),
        FieldDef("intensity", "Intensity", "select",
                 options=["Light", "Moderate", "Heavy"]),
        FieldDef("genre_elements", "Genre Elements Active", "text",
                 placeholder="e.g. Horror elements, rom-com beats"),
        FieldDef("mood_atmosphere", "Mood / Atmosphere", "textarea"),
        FieldDef("pacing_expectation", "Pacing Expectation", "textarea"),
        FieldDef("tonal_shift", "Tonal Shift Notes", "textarea",
                 placeholder="How tone differs from surrounding material, and why"),
    ],
))

# ---------------------------------------------------------------------------
# Set Dressing (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="set_dressing",
    label="Set Dressing",
    label_plural="Set Dressings",
    icon="🛋️",
    category="Scene Detail",
    sort_order=405,
    description="Objects and arrangement populating a scene's location.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Set Dressing"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("location_id", "Location", "reference", reference_entity="location"),
        FieldDef("hero_objects", "Hero Objects", "json",
                 placeholder='["skateboard by door", "half-empty bottle of bourbon"]',
                 help_text="Story-significant objects"),
        FieldDef("atmospheric_objects", "Atmospheric Objects", "textarea",
                 placeholder="Mood-creating objects"),
        FieldDef("practical_objects", "Practical Objects", "textarea",
                 placeholder="Actor-interactive objects"),
        FieldDef("background_fill", "Background Fill", "textarea"),
        FieldDef("sightline_management", "Sightline Management", "textarea"),
        FieldDef("continuity_requirements", "Continuity Requirements", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Dialogue Sound Design (Creative Layer — Auditory)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="dialogue_sound_design",
    label="Dialogue Sound Design",
    label_plural="Dialogue Sound Designs",
    icon="🎙️",
    category="Scene Detail",
    sort_order=406,
    description="How dialogue sounds in the world — recording aesthetic, processing.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Dialogue — Project Default"),
        FieldDef("scene_id", "Scene (optional — null for project-level)", "reference",
                 reference_entity="scene"),
        FieldDef("recording_aesthetic", "Recording Aesthetic", "select",
                 options=["Clean/Studio", "Production Audio", "Stylized"]),
        FieldDef("acoustic_environment", "Acoustic Environment", "textarea"),
        FieldDef("dialogue_clarity", "Dialogue Clarity", "select",
                 options=["Always Clear", "Sometimes Obscured", "Deliberately Muddy"]),
        FieldDef("dialogue_layering", "Dialogue Layering", "textarea",
                 placeholder="Overlapping conversations, background walla"),
        FieldDef("processing_notes", "Processing Notes", "textarea",
                 placeholder="Phone/radio effects, distortion, stylized treatment"),
    ],
))


# #############################################################################
#
#  TIER 4 — THEMATIC TRACKING
#  Motifs, symbols, subtext — the cross-cutting meaning layer.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Visual Motif (Creative Layer — World Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="visual_motif",
    label="Visual Motif",
    label_plural="Visual Motifs",
    icon="🔷",
    category="Thematic Tracking",
    sort_order=500,
    description="Recurring visual element that carries meaning (shape, pattern, material, object).",
    fields=[
        FieldDef("name", "Motif Name", required=True,
                 placeholder="e.g. Windows, Circular Shapes, Rust"),
        FieldDef("motif_type", "Motif Type", "select", options=[
            "Shape/Form", "Pattern", "Material", "Architectural Element",
            "Object", "Natural Element"
        ]),
        FieldDef("symbolic_meaning", "Symbolic Meaning", "textarea",
                 placeholder="What this motif represents thematically"),
        FieldDef("emotional_associations", "Emotional Associations", "textarea"),
        FieldDef("evolution_description", "Evolution Through Story", "textarea"),
        FieldDef("placement_strategy", "Placement Strategy", "textarea",
                 placeholder="Where, how often, how subtle"),
        FieldDef("subtlety_level", "Subtlety Level", "select",
                 options=["Obvious", "Noticeable", "Subtle", "Hidden"]),
    ],
))

# ---------------------------------------------------------------------------
# Visual Motif Appearance (junction)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="visual_motif_appearance",
    label="Visual Motif Appearance",
    label_plural="Visual Motif Appearances",
    icon="🔗",
    category="Connections",
    sort_order=64,
    description="Where a visual motif manifests (in a location, prop, costume, or scene).",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("visual_motif_id", "Visual Motif", "reference",
                 reference_entity="visual_motif", required=True),
        FieldDef("entity_type", "Entity Type", "select",
                 options=["Location", "Prop", "Costume", "Scene", "Shot"]),
        FieldDef("entity_id", "Entity ID", "integer"),
        FieldDef("manifestation_notes", "Manifestation Notes", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Sonic Motif (Creative Layer — Sound Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="sonic_motif",
    label="Sonic Motif",
    label_plural="Sonic Motifs",
    icon="🔔",
    category="Thematic Tracking",
    sort_order=501,
    description="Recurring sound that carries meaning.",
    fields=[
        FieldDef("name", "Motif Name", required=True,
                 placeholder="e.g. Train Horn, Heartbeat, Wind Chimes"),
        FieldDef("sound_description", "Sound Description", "textarea",
                 placeholder="What it sounds like"),
        FieldDef("symbolic_meaning", "Symbolic Meaning", "textarea"),
        FieldDef("first_appearance_scene_id", "First Appearance Scene", "reference",
                 reference_entity="scene"),
        FieldDef("recurrence_pattern", "Recurrence Pattern", "textarea"),
        FieldDef("evolution_description", "Evolution Through Story", "textarea"),
        FieldDef("related_visual_motif_id", "Related Visual Motif", "reference",
                 reference_entity="visual_motif"),
    ],
))

# ---------------------------------------------------------------------------
# Symbol (Vision Layer — Subtext & Symbolism)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="symbol",
    label="Symbol",
    label_plural="Symbols",
    icon="🔮",
    category="Thematic Tracking",
    sort_order=502,
    description="Object, image, sound, or action carrying meaning beyond the literal.",
    fields=[
        FieldDef("name", "Symbol Name", required=True,
                 placeholder="e.g. The Compass, Red Door, Rain"),
        FieldDef("symbol_type", "Symbol Type", "select", options=[
            "Object", "Image", "Sound", "Color", "Location", "Action", "Character"
        ]),
        FieldDef("literal_function", "Literal Function", "textarea",
                 placeholder="What it is/does in the story on the surface"),
        FieldDef("symbolic_meaning_primary", "Primary Symbolic Meaning", "textarea"),
        FieldDef("symbolic_meaning_secondary", "Secondary Meaning", "textarea"),
        FieldDef("meaning_evolution", "Meaning Evolution", "textarea",
                 placeholder="How meaning changes through the story"),
        FieldDef("first_appearance_scene_id", "First Appearance Scene", "reference",
                 reference_entity="scene"),
    ],
))

# ---------------------------------------------------------------------------
# Conceptual Motif (Vision Layer — Thematic Framework)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="conceptual_motif",
    label="Conceptual Motif",
    label_plural="Conceptual Motifs",
    icon="💭",
    category="Thematic Tracking",
    sort_order=503,
    description="Recurring idea, behavior, or verbal pattern that carries thematic weight.",
    fields=[
        FieldDef("name", "Motif Name", required=True,
                 placeholder="e.g. Failed Promises, Looking Away, 'Fair enough'"),
        FieldDef("motif_type", "Motif Type", "select",
                 options=["Conceptual", "Behavioral", "Verbal", "Situational"]),
        FieldDef("thematic_meaning", "Thematic Meaning", "textarea"),
        FieldDef("evolution_description", "Evolution / Transformation", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Motif Manifestation (junction: where conceptual motifs appear)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="motif_manifestation",
    label="Motif Manifestation",
    label_plural="Motif Manifestations",
    icon="🔗",
    category="Connections",
    sort_order=65,
    description="Where a conceptual motif manifests in the story.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("conceptual_motif_id", "Conceptual Motif", "reference",
                 reference_entity="conceptual_motif", required=True),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene"),
        FieldDef("entity_type", "Domain", "select",
                 options=["Dialogue", "Action", "Visual", "Audio"]),
        FieldDef("entity_id", "Entity ID", "integer"),
        FieldDef("manifestation_description", "Description", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Subtext Layer (Vision Layer — Subtext & Symbolism)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="subtext",
    label="Subtext",
    label_plural="Subtext Layers",
    icon="🧊",
    category="Thematic Tracking",
    sort_order=504,
    description="Underlying meaning beneath surface action or dialogue.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Dinner Conversation"),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene"),
        FieldDef("surface_level", "Surface Level", "textarea", required=True,
                 placeholder="What appears to be happening"),
        FieldDef("subtext_level", "Subtext Level", "textarea", required=True,
                 placeholder="What is actually happening underneath"),
        FieldDef("gap_size", "Gap Between Surface and Subtext", "select",
                 options=["Small", "Moderate", "Large"]),
        FieldDef("character_awareness", "Character Awareness", "select",
                 options=["Aware", "Unaware", "Mixed"]),
        FieldDef("audience_access", "Audience Access", "select",
                 options=["First Viewing", "Repeat Viewing", "Analysis"]),
        FieldDef("purpose", "Subtext Purpose", "select", options=[
            "Dramatic Irony", "Character Revelation", "Thematic Depth",
            "Foreshadowing", "Emotional Complexity"
        ]),
    ],
))

# ---------------------------------------------------------------------------
# Thematic Connection (Vision Layer — links any entity to a theme)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="thematic_connection",
    label="Thematic Connection",
    label_plural="Thematic Connections",
    icon="🔗",
    category="Thematic Tracking",
    sort_order=505,
    description="How a specific element connects to a theme.",
    fields=[
        FieldDef("name", "Display Name", placeholder="e.g. Eleanor → Redemption"),
        FieldDef("theme_id", "Theme", "reference",
                 reference_entity="theme", required=True),
        FieldDef("entity_type", "Connected Entity Type", "select", options=[
            "Character", "Scene", "Location", "Prop", "Costume",
            "Visual Motif", "Sonic Motif", "Symbol"
        ]),
        FieldDef("entity_id", "Connected Entity ID", "integer", required=True),
        FieldDef("nature_of_connection", "Nature of Connection", "select", options=[
            "Embodies", "Explores", "Represents", "Challenges", "Resolves"
        ]),
        FieldDef("subtlety_level", "Subtlety Level", "select",
                 options=["On-the-Nose", "Clear", "Subtle", "Hidden"]),
        FieldDef("intended_perception", "Intended Perception", "select", options=[
            "Must Recognize", "Enhances if Recognized", "Reward for Careful Viewing"
        ]),
    ],
))

# ---------------------------------------------------------------------------
# Color Symbolism (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="color_symbolism",
    label="Color Symbolism",
    label_plural="Color Symbolism",
    icon="🌈",
    category="Thematic Tracking",
    sort_order=506,
    description="Thematic meanings assigned to specific colors in this story.",
    fields=[
        FieldDef("name", "Color Name", required=True, placeholder="e.g. Deep Red"),
        FieldDef("color_hex", "Color (hex)", "text", placeholder="#8B0000"),
        FieldDef("primary_symbolism", "Primary Symbolism", "textarea"),
        FieldDef("secondary_symbolism", "Secondary Symbolism", "textarea"),
        FieldDef("emotional_positive", "Positive Emotional Association", "textarea"),
        FieldDef("emotional_negative", "Negative Emotional Association", "textarea"),
        FieldDef("evolution_through_story", "Evolution Through Story", "textarea"),
        FieldDef("cultural_context", "Cultural Context", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Color Script (Creative Layer — Color)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="color_script",
    label="Color Script",
    label_plural="Color Scripts",
    icon="🎞️",
    category="Thematic Tracking",
    sort_order=507,
    description="Visual map of color progression through the story.",
    fields=[
        FieldDef("name", "Name", default="Color Script"),
        FieldDef("format", "Format", "select",
                 options=["Strip", "Grid", "Timeline"]),
        FieldDef("granularity", "Granularity", "select",
                 options=["Per Scene", "Per Sequence", "Per Act"]),
        FieldDef("progression_description", "Color Progression Description", "textarea"),
        FieldDef("key_color_moments", "Key Color Moments", "textarea",
                 placeholder="Dramatic color shifts and their story significance"),
        FieldDef("arc_shape", "Color Arc Shape", "select",
                 options=["Linear", "Cyclical", "Transformative", "Oscillating"]),
        FieldDef("emotional_mapping", "Emotional Color Mapping", "textarea"),
    ],
))


# #############################################################################
#
#  TIER 5 — EMOTIONAL ARCHITECTURE
#  Project-wide and per-scene emotional design.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Emotional Arc (Vision Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="emotional_arc",
    label="Emotional Arc",
    label_plural="Emotional Arcs",
    icon="📈",
    category="Thematic Tracking",
    sort_order=510,
    description="Overall emotional trajectory for the audience across the project.",
    fields=[
        FieldDef("name", "Name", default="Audience Emotional Arc"),
        FieldDef("opening_emotional_state", "Opening Emotional State", "textarea",
                 placeholder="Where the audience begins emotionally"),
        FieldDef("closing_emotional_state", "Closing Emotional State", "textarea",
                 placeholder="Where the audience should end"),
        FieldDef("emotional_shape", "Emotional Shape", "select", options=[
            "Rising Action", "Oscillating", "Descent", "Transformation"
        ]),
        FieldDef("lingering_feelings", "Lingering Feelings", "textarea",
                 placeholder="What the audience carries out of the theater"),
    ],
))

# ---------------------------------------------------------------------------
# Emotional Beat (Vision Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="emotional_beat",
    label="Emotional Beat",
    label_plural="Emotional Beats",
    icon="💓",
    category="Thematic Tracking",
    sort_order=511,
    description="Specific point on the audience emotional journey.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Act 2 — Hope Crushed"),
        FieldDef("emotional_arc_id", "Emotional Arc", "reference",
                 reference_entity="emotional_arc"),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene"),
        FieldDef("sequence_id", "Sequence", "reference", reference_entity="sequence"),
        FieldDef("beat_order", "Beat Order", "integer", required=True),
        FieldDef("target_emotion", "Target Emotion", "text", required=True,
                 placeholder="e.g. Dread, Relief, Joy"),
        FieldDef("intensity", "Intensity (1-10)", "integer"),
        FieldDef("beat_trigger", "Trigger", "textarea",
                 placeholder="What causes this emotional shift"),
    ],
))

# ---------------------------------------------------------------------------
# Information Strategy (Vision Layer — Audience Manipulation)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="information_strategy",
    label="Information Strategy",
    label_plural="Information Strategies",
    icon="🧩",
    category="Thematic Tracking",
    sort_order=512,
    description="What the audience knows vs what characters know — suspense and surprise.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Knowledge State"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("knowledge_asymmetry", "Knowledge Asymmetry", "select", options=[
            "Dramatic Irony", "Mystery", "Parallel Knowledge", "Shifting"
        ]),
        FieldDef("information_withheld", "Information Withheld", "textarea"),
        FieldDef("reveal_timing", "Reveal Timing", "textarea"),
        FieldDef("suspense_approach", "Suspense Approach", "textarea"),
        FieldDef("surprise_setup", "Surprise / Plant-and-Payoff", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Identification Strategy (Vision Layer — Audience Manipulation)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="identification_strategy",
    label="Identification Strategy",
    label_plural="Identification Strategies",
    icon="🪞",
    category="Thematic Tracking",
    sort_order=513,
    description="How the audience relates to and identifies with characters.",
    fields=[
        FieldDef("name", "Name", default="Audience Identification Strategy"),
        FieldDef("primary_identification_character_id", "Primary Identification Character",
                 "reference", reference_entity="character"),
        FieldDef("how_identification_created", "How Identification is Created", "textarea"),
        FieldDef("identification_shifts", "Identification Shifts", "textarea",
                 placeholder="Does identification change through the story? When and why?"),
        FieldDef("empathy_targets", "Empathy Targets", "json",
                 placeholder='["Eleanor", "young Marcus"]',
                 help_text="Characters we should feel for"),
        FieldDef("distance_targets", "Distance Targets", "json",
                 placeholder='["The Senator"]',
                 help_text="Characters we should observe from distance"),
        FieldDef("moral_alignment_approach", "Moral Alignment Approach", "textarea"),
    ],
))


# #############################################################################
#
#  TIER 6 — PRODUCTION (Shot-level, Performance Execution, Choreography)
#  Complete but expected to be populated later in the authoring process.
#
# #############################################################################

# ---------------------------------------------------------------------------
# Shot (Base Entity — Structural)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="shot",
    label="Shot",
    label_plural="Shots",
    icon="📷",
    category="Production",
    sort_order=600,
    parent_entity="scene",
    parent_field="scene_id",
    description="Specific camera setup within a scene.",
    fields=[
        FieldDef("name", "Shot Number/Name", required=True, placeholder="e.g. 23A"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("duration", "Duration (seconds)", "integer"),
        FieldDef("coverage_type", "Coverage Type", "select",
                 options=["Primary", "Alt Angle", "Cutaway", "Insert", "Establishing"]),
        FieldDef("technical_requirements", "Technical Requirements", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Shot Design (Creative Layer — Cinematography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="shot_design",
    label="Shot Design",
    label_plural="Shot Designs",
    icon="🎯",
    category="Production",
    sort_order=601,
    parent_entity="shot",
    parent_field="shot_id",
    description="Framing, lens, focus, and movement specifications for a shot.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Shot 23A — Design"),
        FieldDef("shot_id", "Shot", "reference", reference_entity="shot", required=True),
        # Framing
        FieldDef("framing_type", "Framing Type", "select", options=[
            "EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU", "Insert", "OTS", "POV"
        ]),
        FieldDef("angle", "Angle", "select", options=[
            "Eye Level", "High", "Low", "Dutch", "Overhead", "Worm's Eye"
        ]),
        FieldDef("composition", "Composition", "text",
                 placeholder="e.g. Rule of thirds, centered, symmetrical"),
        FieldDef("subject_placement", "Subject Placement", "text"),
        FieldDef("depth_composition", "Depth Composition", "textarea",
                 placeholder="Foreground / midground / background elements"),
        # Lens
        FieldDef("focal_length", "Focal Length (mm)", "integer", tab="Lens"),
        FieldDef("aperture", "Aperture", "text", tab="Lens", placeholder="e.g. T2.8"),
        FieldDef("lens_choice_reason", "Lens Choice Reason", "textarea", tab="Lens"),
        # Focus
        FieldDef("focus_mode", "Focus Mode", "select", tab="Focus",
                 options=["Deep Focus", "Shallow Focus", "Rack Focus", "Split Diopter"]),
        FieldDef("primary_focus_subject", "Primary Focus Subject", "text", tab="Focus"),
        FieldDef("rack_focus_choreography", "Rack Focus Choreography", "textarea",
                 tab="Focus"),
        # Movement
        FieldDef("movement_type", "Movement Type", "select", tab="Movement", options=[
            "Static", "Pan", "Tilt", "Dolly", "Crane", "Handheld",
            "Steadicam", "Tracking", "Zoom", "Combined"
        ]),
        FieldDef("movement_speed", "Movement Speed", "text", tab="Movement"),
        FieldDef("movement_motivation", "Movement Motivation", "textarea", tab="Movement"),
        FieldDef("start_position", "Start Position", "text", tab="Movement"),
        FieldDef("end_position", "End Position", "text", tab="Movement"),
    ],
))

# ---------------------------------------------------------------------------
# Shot Language (Creative Layer — Cinematography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="shot_language",
    label="Shot Language",
    label_plural="Shot Language",
    icon="💬",
    category="Production",
    sort_order=602,
    parent_entity="shot",
    parent_field="shot_id",
    description="Meaning and intent conveyed through shot choices.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Shot 23A — Language"),
        FieldDef("shot_id", "Shot", "reference", reference_entity="shot", required=True),
        FieldDef("shot_intention", "Shot Intention", "select", options=[
            "Establishing", "Reaction", "POV", "Insert", "Emotional Emphasis",
            "Information Delivery"
        ]),
        FieldDef("shot_psychology", "Shot Psychology", "select", options=[
            "Intimate", "Distant", "Powerful", "Vulnerable", "Stable", "Unstable"
        ]),
        FieldDef("audience_relationship", "Audience Relationship", "select",
                 options=["Observer", "Participant", "Character Identification", "Omniscient"]),
    ],
))

# ---------------------------------------------------------------------------
# Scene Blocking (Performance Layer — Choreography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="scene_blocking",
    label="Scene Blocking",
    label_plural="Scene Blockings",
    icon="🗺️",
    category="Production",
    sort_order=610,
    parent_entity="scene",
    parent_field="scene_id",
    description="Physical arrangement and movement of characters through a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Blocking"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("opening_positions", "Opening Positions", "json",
                 placeholder='[{"character": "Eleanor", "position": "standing by window"}]'),
        FieldDef("closing_positions", "Closing Positions", "json"),
        FieldDef("spatial_storytelling", "Spatial Storytelling", "textarea",
                 placeholder="What blocking communicates about relationships and power"),
        FieldDef("blocking_notes", "Blocking Notes", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Blocking Beat (Performance Layer — Choreography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="blocking_beat",
    label="Blocking Beat",
    label_plural="Blocking Beats",
    icon="👣",
    category="Production",
    sort_order=611,
    description="Specific movement or position change within a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor crosses to door"),
        FieldDef("scene_blocking_id", "Scene Blocking", "reference",
                 reference_entity="scene_blocking", required=True),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("beat_order", "Beat Order", "integer", required=True),
        FieldDef("movement_description", "Movement Description", "textarea", required=True),
        FieldDef("character_motivation", "Character Motivation", "textarea"),
        FieldDef("story_motivation", "Story Motivation", "textarea"),
        FieldDef("timing", "Timing", "text"),
        FieldDef("quality", "Quality", "text",
                 placeholder="e.g. Quick, deliberate, hesitant"),
        FieldDef("meaning", "Meaning", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Action Sequence (Performance Layer — Choreography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="action_sequence",
    label="Action Sequence",
    label_plural="Action Sequences",
    icon="⚔️",
    category="Production",
    sort_order=612,
    description="Extended physical action — fight, chase, dance, stunt.",
    fields=[
        FieldDef("name", "Name", required=True, placeholder="e.g. Bar Fight, Rooftop Chase"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("action_type", "Action Type", "select", options=[
            "Fight/Combat", "Chase", "Physical Labor", "Athletic Performance",
            "Dance", "Stunt Sequence"
        ]),
        FieldDef("narrative_function", "Narrative Function", "textarea"),
        FieldDef("character_revelation", "Character Revelation", "textarea"),
        FieldDef("emotional_journey", "Emotional Journey", "textarea"),
        FieldDef("action_arc", "Action Arc", "textarea",
                 placeholder="Beginning → escalation → climax → resolution"),
        FieldDef("physical_vocabulary", "Physical Vocabulary / Style", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Action Sequence Character (junction)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="action_sequence_character",
    label="Action Sequence Character",
    label_plural="Action Sequence Characters",
    icon="🔗",
    category="Connections",
    sort_order=66,
    description="Links a character to an action sequence.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("action_sequence_id", "Action Sequence", "reference",
                 reference_entity="action_sequence", required=True),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("role_in_action", "Role in Action", "text"),
    ],
))

# ---------------------------------------------------------------------------
# Action Beat (Performance Layer — Choreography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="action_beat",
    label="Action Beat",
    label_plural="Action Beats",
    icon="💥",
    category="Production",
    sort_order=613,
    description="Specific moment within an action sequence.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor disarms attacker"),
        FieldDef("action_sequence_id", "Action Sequence", "reference",
                 reference_entity="action_sequence"),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene", required=True),
        FieldDef("character_id", "Character", "reference", reference_entity="character"),
        FieldDef("description", "Description", "textarea", required=True),
        FieldDef("beat_function", "Beat Function", "select",
                 options=["Story", "Character", "Spectacle", "Emotional"]),
        FieldDef("timing", "Timing", "text"),
        FieldDef("intensity", "Intensity (1-10)", "integer"),
        FieldDef("safety_requirements", "Safety Requirements", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Proxemic Design (Performance Layer — Spatial Dynamics)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="proxemic_design",
    label="Proxemic Design",
    label_plural="Proxemic Designs",
    icon="↔️",
    category="Production",
    sort_order=614,
    parent_entity="scene",
    parent_field="scene_id",
    description="Intentional use of interpersonal distance in a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Proxemics"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("starting_distance_zone", "Starting Distance Zone", "select",
                 options=["Intimate (0-18in)", "Personal (18in-4ft)",
                          "Social (4-12ft)", "Public (12ft+)"]),
        FieldDef("ending_distance_zone", "Ending Distance Zone", "select",
                 options=["Intimate (0-18in)", "Personal (18in-4ft)",
                          "Social (4-12ft)", "Public (12ft+)"]),
        FieldDef("distance_story", "Distance Story", "textarea",
                 placeholder="How distance changes and what the changes mean"),
        FieldDef("violations", "Violations", "textarea",
                 placeholder="When characters enter unexpected distance zones"),
        FieldDef("violation_purpose", "Violation Purpose", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Physical State (Performance Layer — per scene)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="physical_state",
    label="Physical State",
    label_plural="Physical States",
    icon="🤕",
    category="Production",
    sort_order=620,
    description="Character's physical condition at a specific story point.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — Scene 23"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("energy_level", "Energy Level", "select",
                 options=["Alert/Energized", "Tired/Depleted", "Wired/Anxious",
                          "Relaxed/Calm"]),
        FieldDef("physical_comfort", "Physical Comfort", "textarea"),
        FieldDef("intoxication_level", "Intoxication / Alteration", "select",
                 options=["Sober", "Slightly Intoxicated", "Heavily Intoxicated",
                          "Medicated", "Exhausted to Impairment"]),
        FieldDef("physical_needs", "Physical Needs", "textarea",
                 placeholder="Hunger, temperature, rest, desire"),
        FieldDef("current_injuries", "Current Injuries", "textarea"),
        FieldDef("illness_symptoms", "Illness Symptoms", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Vocal State (Performance Layer — per scene)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="vocal_state",
    label="Vocal State",
    label_plural="Vocal States",
    icon="🗣️",
    category="Production",
    sort_order=621,
    description="Character's vocal condition at a specific story point.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — Scene 23 Voice"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("physical_vocal_state", "Physical Vocal State", "select",
                 options=["Healthy", "Hoarse", "Strained", "Damaged"]),
        FieldDef("emotional_vocal_state", "Emotional Vocal State", "select",
                 options=["Controlled", "Emotional", "Confident", "Shaking"]),
        FieldDef("environmental_factors", "Environmental Factors", "textarea"),
        FieldDef("altered_state_effects", "Altered State Effects", "textarea",
                 placeholder="e.g. Intoxication slur, crying breaks, cold stuffiness"),
    ],
))

# ---------------------------------------------------------------------------
# Physical Performance Beat (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="physical_performance_beat",
    label="Physical Performance Beat",
    label_plural="Physical Performance Beats",
    icon="🎭",
    category="Production",
    sort_order=622,
    description="Specific physical moment or action in a performance.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — fingernail picking"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("beat_description", "Beat Description", "textarea", required=True),
        FieldDef("timing", "Timing", "text"),
        FieldDef("purpose", "Purpose", "textarea"),
        FieldDef("quality_notes", "Quality Notes", "text",
                 placeholder="e.g. Sharp, soft, sudden, gradual"),
        FieldDef("scale", "Scale", "select", options=["Large", "Small", "Subtle"]),
        FieldDef("relationship_to_dialogue", "Relationship to Dialogue", "select",
                 options=["Accompanies", "Replaces", "Contradicts", "Punctuates"]),
    ],
))

# ---------------------------------------------------------------------------
# Vocal Beat (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="vocal_beat",
    label="Vocal Beat",
    label_plural="Vocal Beats",
    icon="🎤",
    category="Production",
    sort_order=623,
    description="Specific vocal moment — a pause, sigh, voice break, volume shift.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — voice catches"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("beat_description", "Beat Description", "textarea", required=True),
        FieldDef("beat_type", "Beat Type", "select", options=[
            "Silence/Pause", "Non-Verbal Sound", "Quality Shift",
            "Volume Shift", "Tempo Shift"
        ]),
        FieldDef("timing", "Timing", "text"),
        FieldDef("purpose", "Purpose", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Line Delivery (Performance Layer — Vocal)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="line_delivery",
    label="Line Delivery",
    label_plural="Line Deliveries",
    icon="📜",
    category="Production",
    sort_order=624,
    description="Specific delivery instructions for a line of dialogue.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — 'I never said that'"),
        FieldDef("character_id", "Character", "reference", reference_entity="character"),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene"),
        FieldDef("line_text", "Line Text", "text",
                 placeholder="The line being directed"),
        FieldDef("emotional_quality", "Emotional Quality", "textarea"),
        FieldDef("tempo", "Tempo", "text"),
        FieldDef("volume", "Volume", "text"),
        FieldDef("emphasis_words", "Emphasis Words", "json",
                 placeholder='["never", "that"]'),
        FieldDef("pause_locations", "Pause Locations", "json",
                 placeholder='["before never", "after said"]'),
        FieldDef("subtext", "Subtext", "textarea"),
        FieldDef("operative_words", "Operative Words", "textarea"),
        FieldDef("physical_integration", "Physical Integration", "textarea",
                 placeholder="What the body does during this line"),
    ],
))

# ---------------------------------------------------------------------------
# Dialogue Rhythm (Performance Layer — Vocal Interaction)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="dialogue_rhythm",
    label="Dialogue Rhythm",
    label_plural="Dialogue Rhythms",
    icon="🥁",
    category="Production",
    sort_order=625,
    description="The musicality of conversation between characters in a scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Eleanor/Marcus Rhythm"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("character_a_id", "Character A", "reference",
                 reference_entity="character", required=True),
        FieldDef("character_b_id", "Character B", "reference",
                 reference_entity="character"),
        FieldDef("conversational_style", "Conversational Style", "select", options=[
            "Overlapping/Interrupting", "Turn-Taking/Polite", "Rapid Exchange",
            "Languid/Paused"
        ]),
        FieldDef("power_dynamics", "Power Dynamics", "textarea"),
        FieldDef("listening_indicators", "Listening Indicators", "textarea"),
        FieldDef("rhythm_evolution", "Rhythm Evolution Through Scene", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Emotional Physicality (Performance Layer — Body Language)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="emotional_physicality",
    label="Emotional Physicality",
    label_plural="Emotional Physicalities",
    icon="😤",
    category="Production",
    sort_order=630,
    description="How a specific emotion manifests physically for a character.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — Anger"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("emotion", "Emotion", "text", required=True, placeholder="e.g. Anger, Fear"),
        FieldDef("posture_changes", "Posture Changes", "textarea"),
        FieldDef("tension_location", "Tension Location", "text",
                 placeholder="e.g. Shoulders, jaw, hands"),
        FieldDef("breathing_pattern", "Breathing Pattern", "textarea"),
        FieldDef("expansion_contraction", "Expansion / Contraction", "select",
                 options=["Expanding", "Contracting"]),
        FieldDef("stillness_vs_movement", "Stillness vs Movement", "textarea"),
        FieldDef("visibility_level", "Visibility Level", "select",
                 options=["Obvious", "Subtle", "Hidden", "Leaked"]),
        FieldDef("control_level", "Control Level", "select",
                 options=["Conscious", "Unconscious", "Suppressed", "Overwhelming"]),
    ],
))

# ---------------------------------------------------------------------------
# Physical Habit (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="physical_habit",
    label="Physical Habit",
    label_plural="Physical Habits",
    icon="✋",
    category="Production",
    sort_order=631,
    parent_entity="character",
    parent_field="character_id",
    description="Recurring physical behavior — gesture, tic, comfort behavior.",
    fields=[
        FieldDef("name", "Habit Name", required=True,
                 placeholder="e.g. Picks at fingernails, Hair touching"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("description", "Description", "textarea"),
        FieldDef("body_parts_involved", "Body Parts Involved", "text"),
        FieldDef("habit_trigger", "Trigger", "textarea",
                 placeholder="What causes this behavior"),
        FieldDef("frequency", "Frequency", "select",
                 options=["Constant", "Frequent", "Occasional", "Rare/Situational"]),
        FieldDef("meaning", "Meaning", "textarea",
                 placeholder="What it communicates about the character"),
        FieldDef("character_awareness", "Character Awareness", "select",
                 options=["Aware", "Unaware", "Sometimes Aware"]),
    ],
))

# ---------------------------------------------------------------------------
# Microexpression (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="microexpression",
    label="Microexpression",
    label_plural="Microexpressions",
    icon="😏",
    category="Production",
    sort_order=632,
    description="Fleeting facial expression that reveals hidden emotion.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor — contempt flash"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("scene_id", "Scene", "reference", reference_entity="scene"),
        FieldDef("expression_type", "Expression Type", "text"),
        FieldDef("facial_region", "Facial Region", "text"),
        FieldDef("underlying_emotion", "Underlying (True) Emotion", "text"),
        FieldDef("displayed_emotion", "Displayed (Surface) Emotion", "text"),
        FieldDef("character_awareness", "Character Awareness", "select",
                 options=["Aware", "Unaware"]),
        FieldDef("audience_intended_to_catch", "Audience Intended to Catch?", "boolean"),
    ],
))

# ---------------------------------------------------------------------------
# Character-Environment Physicality (Performance Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="character_environment_physicality",
    label="Character-Environment Physicality",
    label_plural="Character-Environment Physicalities",
    icon="🏠",
    category="Production",
    sort_order=633,
    description="How a character physically inhabits a specific location.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor at the Mill"),
        FieldDef("character_id", "Character", "reference",
                 reference_entity="character", required=True),
        FieldDef("location_id", "Location", "reference",
                 reference_entity="location", required=True),
        FieldDef("how_enters_space", "How Character Enters", "textarea"),
        FieldDef("typical_position", "Typical Position", "textarea"),
        FieldDef("space_claiming_behavior", "Space Claiming Behavior", "textarea"),
        FieldDef("object_interaction_quality", "Object Interaction Quality", "textarea",
                 placeholder="Careful, careless, reverent, destructive"),
        FieldDef("territorial_behavior", "Territorial Behavior", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Physical Relationship (Performance Layer — Physical Interaction)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="physical_relationship",
    label="Physical Relationship",
    label_plural="Physical Relationships",
    icon="🤲",
    category="Production",
    sort_order=634,
    description="How two characters physically relate — distance, touch, mirroring, power.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor & Marcus — Physical Dynamic"),
        FieldDef("character_a_id", "Character A", "reference",
                 reference_entity="character", required=True),
        FieldDef("character_b_id", "Character B", "reference",
                 reference_entity="character", required=True),
        FieldDef("typical_distance", "Typical Distance", "select",
                 options=["Intimate", "Personal", "Social", "Public"]),
        FieldDef("who_controls_distance", "Who Controls Distance", "text"),
        FieldDef("touch_patterns", "Touch Patterns", "textarea"),
        FieldDef("touch_quality", "Touch Quality", "select",
                 options=["Gentle", "Aggressive", "Casual", "Charged"]),
        FieldDef("who_initiates_touch", "Who Initiates Touch", "text"),
        FieldDef("physical_mirroring", "Physical Mirroring", "textarea"),
        FieldDef("physical_power_dynamic", "Physical Power Dynamic", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Physical Relationship Evolution (Performance Layer — per scene)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="physical_relationship_evolution",
    label="Physical Relationship Evolution",
    label_plural="Physical Relationship Evolutions",
    icon="📊",
    category="Production",
    sort_order=635,
    description="How a physical relationship between characters changes at a specific scene.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Eleanor & Marcus — Scene 23"),
        FieldDef("physical_relationship_id", "Physical Relationship", "reference",
                 reference_entity="physical_relationship", required=True),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("distance_state", "Distance State", "text"),
        FieldDef("touch_state", "Touch State", "text"),
        FieldDef("mirroring_state", "Mirroring State", "text"),
        FieldDef("change_from_previous", "Change from Previous", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Movement Choreography (Performance Layer — Choreography)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="movement_choreography",
    label="Movement Choreography",
    label_plural="Movement Choreographies",
    icon="💃",
    category="Production",
    sort_order=636,
    description="Designed movement patterns — dance, ritual, work, sport.",
    fields=[
        FieldDef("name", "Name", required=True,
                 placeholder="e.g. Ballroom Dance, Assembly Line"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("choreography_type", "Choreography Type", "select", options=[
            "Dance (Formal)", "Dance (Social)", "Dance (Spontaneous)",
            "Ritual/Ceremony", "Work/Labor", "Sport/Game", "Synchronized Movement"
        ]),
        FieldDef("style", "Style", "textarea"),
        FieldDef("meaning", "Meaning", "textarea"),
        FieldDef("period_accuracy", "Period Accuracy", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Musical Theme (Creative Layer — Music)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="musical_theme",
    label="Musical Theme",
    label_plural="Musical Themes",
    icon="🎼",
    category="Production",
    sort_order=640,
    description="Recurring melodic or harmonic idea — leitmotif.",
    fields=[
        FieldDef("name", "Theme Name", required=True,
                 placeholder="e.g. Eleanor's Theme, Danger Motif"),
        FieldDef("theme_description", "Theme Description", "textarea",
                 placeholder="Melodic/harmonic character"),
        FieldDef("emotional_association", "Emotional Association", "textarea"),
        FieldDef("character_id", "Associated Character", "reference",
                 reference_entity="character"),
        FieldDef("concept_association", "Concept Association", "text",
                 placeholder="If theme represents an idea rather than character"),
        FieldDef("first_appearance_scene_id", "First Appearance Scene", "reference",
                 reference_entity="scene"),
        FieldDef("development_description", "Development Through Story", "textarea"),
        FieldDef("orchestration_variations", "Orchestration Variations", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Sound Cue (Creative Layer — Sound Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="sound_cue",
    label="Sound Cue",
    label_plural="Sound Cues",
    icon="🔈",
    category="Production",
    sort_order=641,
    description="Individual sound effect or designed sound placement.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Door slam — Scene 23"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("shot_id", "Shot", "reference", reference_entity="shot"),
        FieldDef("cue_type", "Cue Type", "select",
                 options=["SFX", "Foley", "Ambient", "Designed"]),
        FieldDef("description", "Description", "textarea"),
        FieldDef("source", "Source", "select", options=["On Screen", "Off Screen"]),
        FieldDef("volume_intensity", "Volume / Intensity", "text"),
        FieldDef("emotional_function", "Emotional Function", "textarea"),
        FieldDef("timing", "Timing", "text"),
        FieldDef("duration", "Duration (seconds)", "integer"),
    ],
))

# ---------------------------------------------------------------------------
# Music Cue (Creative Layer — Music)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="music_cue",
    label="Music Cue",
    label_plural="Music Cues",
    icon="🎵",
    category="Production",
    sort_order=642,
    description="Individual music cue placement in a scene.",
    fields=[
        FieldDef("name", "Cue Name", placeholder="e.g. 3M2 — Eleanor discovers truth"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("cue_type", "Cue Type", "select",
                 options=["Diegetic", "Non-Diegetic"]),
        FieldDef("genre_style", "Genre / Style", "text"),
        FieldDef("tempo_mood", "Tempo / Mood", "text"),
        FieldDef("emotional_purpose", "Emotional Purpose", "textarea"),
        FieldDef("musical_theme_id", "Musical Theme", "reference",
                 reference_entity="musical_theme"),
        FieldDef("instrumentation", "Instrumentation", "textarea"),
        FieldDef("volume_level", "Volume Level", "text"),
        FieldDef("source", "Source (if diegetic)", "text", tab="Source"),
    ],
))

# ---------------------------------------------------------------------------
# Sound Perspective (Creative Layer — Sound Design)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="sound_perspective",
    label="Sound Perspective",
    label_plural="Sound Perspectives",
    icon="👂",
    category="Production",
    sort_order=643,
    description="Point-of-view in sound — whose hearing, what techniques.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Scene 23 — Eleanor's Hearing"),
        FieldDef("scene_id", "Scene", "reference",
                 reference_entity="scene", required=True),
        FieldDef("character_id", "Character", "reference", reference_entity="character"),
        FieldDef("perspective_type", "Perspective Type", "select",
                 options=["Objective", "Subjective", "Omniscient"]),
        FieldDef("subjective_techniques", "Subjective Techniques", "textarea",
                 placeholder="Focus, muffling, internal sounds, memory sounds"),
        FieldDef("transition_triggers", "Transition Triggers", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Voiceover Design (Creative Layer — Auditory)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="voiceover_design",
    label="Voiceover Design",
    label_plural="Voiceover Designs",
    icon="📢",
    category="Production",
    sort_order=644,
    description="Non-diegetic or semi-diegetic speech design.",
    fields=[
        FieldDef("name", "Name", default="Voiceover Design"),
        FieldDef("character_id", "Character (whose voice)", "reference",
                 reference_entity="character"),
        FieldDef("narration_type", "Narration Type", "select", options=[
            "Character Voice-Over", "Omniscient Narrator", "Internal Monologue"
        ]),
        FieldDef("acoustic_treatment", "Acoustic Treatment", "select",
                 options=["Intimate (close, dry)", "Distanced (room, space)", "Stylized"]),
        FieldDef("relationship_to_image", "Relationship to Image", "select",
                 options=["Complements", "Counterpoints", "Reveals"]),
        FieldDef("placement_in_mix", "Placement in Mix", "textarea"),
    ],
))

# ---------------------------------------------------------------------------
# Music-Sound Relationship (Creative Layer)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="music_sound_relationship",
    label="Music-Sound Relationship",
    label_plural="Music-Sound Relationships",
    icon="🔀",
    category="Production",
    sort_order=645,
    description="How score and sound design interact.",
    fields=[
        FieldDef("name", "Name", placeholder="e.g. Project Default or Scene 23"),
        FieldDef("scene_id", "Scene (optional)", "reference", reference_entity="scene"),
        FieldDef("hierarchy", "Hierarchy", "select", options=[
            "Music-Forward", "Sound-Forward", "Equal Partners", "Shifting"
        ]),
        FieldDef("blend_approach", "Blend Approach", "select",
                 options=["Clear Separation", "Blurred Boundaries", "Designed Interaction"]),
        FieldDef("combined_silence", "Combined Silence", "textarea",
                 placeholder="When both music and sound pull back, and the impact"),
    ],
))


# #############################################################################
#
#  METADATA — Decisions, Notes, Assets
#
# #############################################################################

# ---------------------------------------------------------------------------
# Creative Decision (Vision Layer — Decision Framework)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="creative_decision",
    label="Creative Decision",
    label_plural="Creative Decisions",
    icon="⚖️",
    category="Metadata",
    sort_order=800,
    description="Documented rationale for a creative choice.",
    fields=[
        FieldDef("name", "Decision Title", required=True,
                 placeholder="e.g. Why anamorphic lenses"),
        FieldDef("entity_type", "Related Entity Type", "text",
                 placeholder="e.g. character, scene, costume"),
        FieldDef("entity_id", "Related Entity ID", "integer"),
        FieldDef("decision_description", "Decision Description", "textarea", required=True),
        FieldDef("options_considered", "Options Considered", "json",
                 placeholder='["Option A description", "Option B description"]'),
        FieldDef("why_chosen", "Why This Option Chosen", "textarea"),
        FieldDef("what_sacrificed", "What Was Sacrificed", "textarea"),
        FieldDef("what_gained", "What Was Gained", "textarea"),
        FieldDef("confidence_level", "Confidence Level", "select",
                 options=["Certain", "Confident", "Uncertain", "Compromised"]),
    ],
))

# ---------------------------------------------------------------------------
# Collaboration Note (Vision Layer — Decision Framework)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="collaboration_note",
    label="Collaboration Note",
    label_plural="Collaboration Notes",
    icon="📝",
    category="Metadata",
    sort_order=801,
    description="Director's guidance to specific collaborators or domains.",
    fields=[
        FieldDef("name", "Note Title", required=True),
        FieldDef("entity_type", "Related Entity Type", "text"),
        FieldDef("entity_id", "Related Entity ID", "integer"),
        FieldDef("domain", "Domain / Area", "text",
                 placeholder="e.g. Cinematography, Costume, Sound"),
        FieldDef("note_text", "Note Text", "textarea", required=True),
        FieldDef("note_type", "Note Type", "select", options=[
            "Vision Communication", "Problem-Solving", "Permission-Granting",
            "Boundary-Setting", "Question-Posing"
        ]),
        FieldDef("priority", "Priority", "select",
                 options=["Critical", "Important", "Optional"]),
        FieldDef("response_expected", "Response Expected", "select",
                 options=["Execution", "Interpretation", "Options"]),
    ],
))

# ---------------------------------------------------------------------------
# Asset (external file reference)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="asset",
    label="Asset",
    label_plural="Assets",
    icon="📎",
    category="Metadata",
    sort_order=802,
    description="External file reference — image, model, audio, document.",
    fields=[
        FieldDef("name", "File Name", required=True),
        FieldDef("file_path", "File Path", "text", required=True),
        FieldDef("file_type", "File Type", "select", options=[
            "Image", "3D Model", "Audio", "Video", "Document", "Project File"
        ]),
        FieldDef("purpose", "Purpose", "select", options=[
            "Reference", "Concept", "Pre-Production", "Production", "Post-Production"
        ]),
        FieldDef("department", "Department", "text"),
        FieldDef("creator", "Creator", "text"),
        FieldDef("approval_status", "Approval Status", "select",
                 options=["WIP", "Pending", "Approved", "Final"]),
        FieldDef("resolution", "Resolution", "text", tab="Technical"),
        FieldDef("color_space", "Color Space", "text", tab="Technical"),
        FieldDef("duration", "Duration (seconds)", "integer", tab="Technical"),
        FieldDef("file_size", "File Size (bytes)", "integer", tab="Technical"),
    ],
))

# ---------------------------------------------------------------------------
# Asset Relationship (junction: how assets connect to entities)
# ---------------------------------------------------------------------------
register(EntityDef(
    name="asset_relationship",
    label="Asset Relationship",
    label_plural="Asset Relationships",
    icon="🔗",
    category="Connections",
    sort_order=67,
    description="Links an asset to any entity in the project.",
    fields=[
        FieldDef("name", "Display Name", hidden=True),
        FieldDef("asset_id", "Asset", "reference",
                 reference_entity="asset", required=True),
        FieldDef("entity_type", "Entity Type", "text", required=True,
                 placeholder="e.g. character, location, costume"),
        FieldDef("entity_id", "Entity ID", "integer", required=True),
        FieldDef("relationship_type", "Relationship Type", "select",
                 options=["Reference For", "Concept Of", "Generated From", "Variant Of"]),
        FieldDef("context_notes", "Context Notes", "textarea"),
    ],
))


# =============================================================================
# Tier Assignment — entities not yet fully active in the editor
# =============================================================================
# Tier 0 = fully active (original entities with editor support)
# Tier 1 = schema-defined, visible but marked as "in development"
_TIER_0_ENTITIES = {
    "project", "character", "location", "prop", "scene", "theme", "sequence",
    "act", "story_beat",
    "scene_character", "scene_prop", "scene_sequence",
}
for _name, _entity in ENTITY_REGISTRY.items():
    if _name not in _TIER_0_ENTITIES:
        _entity.tier = 1


# =============================================================================
# Utility functions
# =============================================================================

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
