# Story State Framework (SSF) - Database Schema

## Overview

This schema organizes all entities according to the SSF Layer Hierarchy:

1. **Base Entities** - Structural foundation (Project, Story Structure, Characters, Locations, Props, Assets, Metadata)
2. **Vision Layer** - The "why" (Director's Intent, Thematic Framework, Emotional Architecture)
3. **Performance Layer** - Characters come alive (Physical Performance, Vocal Performance, Choreography)
4. **Creative Layer** - The sensory world
   - **Visual**: World Design, Character Appearance, Color, Cinematography
   - **Auditory**: Dialogue (as sound), Sound Design, Music

---

# BASE ENTITIES

These provide the structural foundation that all layers reference.

## Story Structure

```sql
-- Root container for entire project
CREATE TABLE Project (
    project_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    version TEXT,
    status TEXT, -- development, pre-production, production, post-production, complete
    format TEXT, -- feature, series, short, commercial
    genre TEXT,
    total_runtime INTEGER, -- minutes
    logline TEXT,
    description TEXT,
    creation_date TIMESTAMP,
    last_modified TIMESTAMP
);

-- Major story divisions
CREATE TABLE Act (
    act_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    act_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    page_start INTEGER,
    page_end INTEGER,
    story_function TEXT, -- setup, confrontation, resolution
    key_turning_points TEXT,
    estimated_duration INTEGER,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Groups of scenes with unified dramatic purpose
CREATE TABLE Sequence (
    sequence_id INTEGER PRIMARY KEY,
    act_id INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    dramatic_function TEXT,
    story_purpose TEXT,
    page_start INTEGER,
    page_end INTEGER,
    estimated_duration INTEGER,
    emotional_arc TEXT,
    FOREIGN KEY (act_id) REFERENCES Act(act_id)
);

-- Fundamental unit: single time and place
CREATE TABLE Scene (
    scene_id INTEGER PRIMARY KEY,
    sequence_id INTEGER NOT NULL,
    scene_number TEXT NOT NULL,
    title TEXT,
    int_ext TEXT, -- INT, EXT, INT/EXT
    location_id INTEGER,
    time_of_day TEXT,
    page_number INTEGER,
    estimated_duration INTEGER, -- seconds
    story_beat TEXT,
    weather_conditions TEXT,
    season TEXT,
    FOREIGN KEY (sequence_id) REFERENCES Sequence(sequence_id),
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);

-- Specific camera setup within scene
CREATE TABLE Shot (
    shot_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    shot_number TEXT NOT NULL,
    duration INTEGER,
    coverage_type TEXT, -- primary, alt angle, cutaway
    technical_requirements TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Individual recorded attempt
CREATE TABLE Take (
    take_id INTEGER PRIMARY KEY,
    shot_id INTEGER NOT NULL,
    take_number INTEGER NOT NULL,
    version TEXT,
    approval_status TEXT, -- selected, alternate, rejected
    technical_notes TEXT,
    performance_notes TEXT,
    timestamp TIMESTAMP,
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id)
);
```

## Character Base

```sql
-- Core character entity
CREATE TABLE Character (
    character_id INTEGER PRIMARY KEY,
    name_full TEXT NOT NULL,
    name_nickname TEXT,
    name_alias TEXT,
    role_level TEXT, -- lead, supporting, minor, background, cameo
    age INTEGER,
    gender TEXT,
    pronouns TEXT,
    height TEXT,
    build TEXT,
    ethnicity TEXT,
    distinguishing_features TEXT,
    personality_traits TEXT,
    character_archetype TEXT,
    internal_goal TEXT,
    external_goal TEXT,
    character_flaw TEXT,
    greatest_fear TEXT,
    core_belief TEXT,
    character_arc_description TEXT,
    backstory TEXT,
    motivations TEXT,
    education_level TEXT,
    occupation TEXT,
    skills_abilities TEXT,
    quirks_habits TEXT
);

-- Specific states/versions of character
CREATE TABLE Character_Variant (
    variant_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    variant_name TEXT NOT NULL, -- "Angry Flippy", "Young Sarah"
    physical_differences TEXT,
    emotional_state TEXT,
    context TEXT,
    duration_type TEXT, -- temporary, permanent
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Junction: Character appears in Scene/Shot
CREATE TABLE Character_Appearance (
    appearance_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER,
    shot_id INTEGER,
    variant_id INTEGER,
    screen_time_percentage INTEGER,
    prominence_level TEXT, -- foreground, mid-ground, background
    entry_point TEXT,
    exit_point TEXT,
    continuity_notes TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id),
    FOREIGN KEY (variant_id) REFERENCES Character_Variant(variant_id)
);

-- Relationships between characters
CREATE TABLE Character_Relationship (
    relationship_id INTEGER PRIMARY KEY,
    character_a_id INTEGER NOT NULL,
    character_b_id INTEGER NOT NULL,
    relationship_type TEXT, -- family, friend, enemy, lover, colleague
    specific_relationship TEXT, -- father/son, best friends, rivals
    emotional_valence TEXT, -- positive, negative, complex
    relationship_arc TEXT,
    power_dynamic TEXT,
    history TEXT,
    current_status TEXT,
    FOREIGN KEY (character_a_id) REFERENCES Character(character_id),
    FOREIGN KEY (character_b_id) REFERENCES Character(character_id)
);
```

## Location Base

```sql
-- Physical place where action occurs
CREATE TABLE Location (
    location_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT, -- interior, exterior, INT/EXT
    general_description TEXT,
    size_scale TEXT,
    time_period_details TEXT,
    cultural_context TEXT,
    geographic_region TEXT
);

-- Modified state of location
CREATE TABLE Location_Variant (
    location_variant_id INTEGER PRIMARY KEY,
    location_id INTEGER NOT NULL,
    variant_name TEXT NOT NULL,
    physical_differences TEXT,
    context TEXT,
    time_of_day_notes TEXT,
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);
```

## Prop Base

```sql
-- Physical object in story
CREATE TABLE Prop (
    prop_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    significance_level TEXT, -- hero, featured, set_dressing
    size_dimensions TEXT,
    story_function TEXT, -- macguffin, character_extension, plot_device, symbol
    quantity_needed INTEGER
);

-- Different state of prop
CREATE TABLE Prop_Variant (
    prop_variant_id INTEGER PRIMARY KEY,
    prop_id INTEGER NOT NULL,
    variant_name TEXT NOT NULL,
    physical_differences TEXT,
    condition_change TEXT,
    context TEXT,
    FOREIGN KEY (prop_id) REFERENCES Prop(prop_id)
);

-- Props present in scene
CREATE TABLE Prop_Scene_Presence (
    presence_id INTEGER PRIMARY KEY,
    prop_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    variant_id INTEGER,
    placement_notes TEXT,
    continuity_notes TEXT,
    FOREIGN KEY (prop_id) REFERENCES Prop(prop_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (variant_id) REFERENCES Prop_Variant(prop_variant_id)
);
```

## Asset Management

```sql
-- External files
CREATE TABLE Asset (
    asset_id INTEGER PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL, -- image, 3d_model, audio, video, document, project_file
    creation_date TIMESTAMP,
    version TEXT,
    file_size INTEGER,
    resolution TEXT,
    duration INTEGER,
    color_space TEXT,
    approval_status TEXT, -- wip, pending, approved, final
    purpose TEXT, -- reference, concept, pre-production, production, post-production
    department TEXT,
    creator TEXT
);

-- How assets relate to entities
CREATE TABLE Asset_Relationship (
    asset_relationship_id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL, -- character, location, prop, costume, scene, shot
    entity_id INTEGER NOT NULL,
    relationship_type TEXT, -- reference_for, concept_of, generated_from, variant_of
    context_notes TEXT,
    FOREIGN KEY (asset_id) REFERENCES Asset(asset_id)
);
```

## Metadata

```sql
-- Annotations on any entity
CREATE TABLE Note (
    note_id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    author TEXT,
    date_created TIMESTAMP,
    type TEXT, -- creative, technical, continuity, approval, question
    priority TEXT, -- low, medium, high, critical
    status TEXT, -- open, in-progress, resolved
    parent_note_id INTEGER,
    FOREIGN KEY (parent_note_id) REFERENCES Note(note_id)
);

-- Version control
CREATE TABLE Version (
    version_id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    version_number TEXT,
    date_created TIMESTAMP,
    author TEXT,
    change_description TEXT,
    rationale TEXT,
    previous_version_id INTEGER,
    FOREIGN KEY (previous_version_id) REFERENCES Version(version_id)
);

-- Formal sign-off
CREATE TABLE Approval (
    approval_id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    version_id INTEGER,
    status TEXT, -- draft, pending, approved, approved_with_notes, rejected
    approver TEXT,
    date_timestamp TIMESTAMP,
    comments TEXT,
    FOREIGN KEY (version_id) REFERENCES Version(version_id)
);

-- Flexible categorization
CREATE TABLE Tag (
    tag_id INTEGER PRIMARY KEY,
    tag_name TEXT NOT NULL,
    category TEXT, -- genre, mood, status, department, priority
    color TEXT,
    description TEXT
);

-- Junction: Tags applied to entities
CREATE TABLE Entity_Tag (
    entity_tag_id INTEGER PRIMARY KEY,
    tag_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    FOREIGN KEY (tag_id) REFERENCES Tag(tag_id)
);
```

---

# VISION LAYER

The "why" behind every creative decision.

## Director's Intent

```sql
-- Overall creative vision
CREATE TABLE Project_Vision (
    project_vision_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    vision_statement TEXT NOT NULL,
    core_question TEXT,
    intended_audience_impact TEXT,
    unique_perspective TEXT,
    why_tell_this_story TEXT,
    what_makes_different TEXT,
    success_criteria TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Director's filmmaking approach
CREATE TABLE Directorial_Philosophy (
    directorial_philosophy_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    filmmaking_philosophy TEXT, -- auteur, collaborative, actor-focused, visual-first
    technical_approach TEXT, -- naturalistic, stylized, mixed
    aesthetic_priorities TEXT, -- JSON ordered list
    risk_tolerance TEXT, -- safe, experimental, balanced
    audience_relationship TEXT, -- accessible, challenging, hybrid
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Personal connection to material
CREATE TABLE Directors_Personal_Connection (
    personal_connection_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    personal_resonance TEXT,
    emotional_stakes TEXT,
    artistic_growth_goals TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Why a creative choice was made
CREATE TABLE Creative_Decision (
    creative_decision_id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    decision_description TEXT NOT NULL,
    options_considered TEXT, -- JSON array
    why_chosen TEXT,
    what_sacrificed TEXT,
    what_gained TEXT,
    confidence_level TEXT -- certain, confident, uncertain, compromised
);

-- Director's guidance for specific areas
CREATE TABLE Collaboration_Note (
    collaboration_note_id INTEGER PRIMARY KEY,
    entity_type TEXT,
    entity_id INTEGER,
    domain TEXT, -- what area note addresses
    note_text TEXT NOT NULL,
    note_type TEXT, -- vision, problem_solving, permission, boundary, question
    priority TEXT,
    response_expected TEXT -- execution, interpretation, collaboration, options
);
```

## Thematic Framework

```sql
-- Central idea explored
CREATE TABLE Theme (
    theme_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    theme_name TEXT,
    theme_statement TEXT NOT NULL,
    full_description TEXT,
    questions_asked TEXT,
    perspectives_presented TEXT,
    priority TEXT, -- primary, secondary, tertiary
    approach TEXT, -- didactic, exploratory, dialectical, ambiguous
    target_understanding TEXT, -- obvious, discoverable, subtle, subconscious
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- How element connects to theme
CREATE TABLE Thematic_Connection (
    thematic_connection_id INTEGER PRIMARY KEY,
    theme_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    nature_of_connection TEXT, -- embodies, explores, represents, challenges, resolves
    subtlety_level TEXT,
    intended_perception TEXT,
    FOREIGN KEY (theme_id) REFERENCES Theme(theme_id)
);

-- Underlying meaning
CREATE TABLE Subtext (
    subtext_id INTEGER PRIMARY KEY,
    scene_id INTEGER,
    dialogue_id INTEGER,
    action_beat_id INTEGER,
    surface_level TEXT NOT NULL,
    subtext_level TEXT NOT NULL,
    gap_size TEXT, -- small, moderate, large
    character_awareness TEXT, -- aware, unaware, mixed
    audience_access TEXT, -- first_viewing, repeat_viewing, analysis
    purpose TEXT, -- dramatic_irony, character_revelation, thematic_depth, foreshadowing
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Objects/images/sounds carrying meaning
CREATE TABLE Symbol (
    symbol_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT, -- object, image, sound, color, location, action, character
    literal_function TEXT,
    symbolic_meaning_primary TEXT,
    symbolic_meaning_secondary TEXT,
    meaning_evolution TEXT,
    first_appearance_scene_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (first_appearance_scene_id) REFERENCES Scene(scene_id)
);

-- Recurring conceptual patterns
CREATE TABLE Conceptual_Motif (
    conceptual_motif_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    motif_name TEXT NOT NULL,
    motif_type TEXT, -- conceptual, behavioral, verbal, situational
    thematic_meaning TEXT,
    evolution_description TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Junction: Where motifs manifest
CREATE TABLE Motif_Manifestation (
    manifestation_id INTEGER PRIMARY KEY,
    conceptual_motif_id INTEGER NOT NULL,
    scene_id INTEGER,
    entity_type TEXT, -- dialogue, action, visual, audio
    entity_id INTEGER,
    manifestation_description TEXT,
    FOREIGN KEY (conceptual_motif_id) REFERENCES Conceptual_Motif(conceptual_motif_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);
```

## Emotional Architecture

```sql
-- Overall emotional trajectory
CREATE TABLE Emotional_Arc (
    emotional_arc_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    opening_emotional_state TEXT,
    closing_emotional_state TEXT,
    emotional_shape TEXT, -- rising, oscillating, descent, transformation
    lingering_feelings TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Emotional journey stages
CREATE TABLE Emotional_Beat (
    emotional_beat_id INTEGER PRIMARY KEY,
    emotional_arc_id INTEGER NOT NULL,
    sequence_id INTEGER,
    scene_id INTEGER,
    beat_order INTEGER NOT NULL,
    target_emotion TEXT NOT NULL,
    intensity INTEGER, -- 1-10
    trigger TEXT,
    FOREIGN KEY (emotional_arc_id) REFERENCES Emotional_Arc(emotional_arc_id),
    FOREIGN KEY (sequence_id) REFERENCES Sequence(sequence_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Specific emotional goal for scene
CREATE TABLE Scene_Emotional_Target (
    scene_emotional_target_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL UNIQUE,
    primary_emotion TEXT NOT NULL,
    primary_intensity INTEGER, -- 1-10
    secondary_emotions TEXT, -- JSON array
    emotional_function TEXT, -- setup, build, release, shift, sustain
    audience_character_relationship TEXT, -- empathy, sympathy, antipathy, observation
    contrast_with_previous TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Overall tonal identity
CREATE TABLE Project_Tone (
    project_tone_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    primary_tone TEXT,
    tone_blend TEXT, -- JSON array of tones and ratios
    lightest_moment TEXT,
    darkest_moment TEXT,
    tonal_consistency TEXT, -- unified, varied, shifting
    reference_touchstones TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Scene-specific tone
CREATE TABLE Tone_Marker (
    tone_marker_id INTEGER PRIMARY KEY,
    scene_id INTEGER,
    sequence_id INTEGER,
    tone_descriptor TEXT,
    intensity TEXT, -- light, moderate, heavy
    genre_elements TEXT,
    mood_atmosphere TEXT,
    pacing_expectation TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (sequence_id) REFERENCES Sequence(sequence_id)
);

-- Pacing intent
CREATE TABLE Pacing_Strategy (
    pacing_strategy_id INTEGER PRIMARY KEY,
    project_id INTEGER,
    sequence_id INTEGER,
    overall_pacing TEXT, -- slow, moderate, fast, variable
    pacing_philosophy TEXT,
    breathing_room_strategy TEXT,
    key_acceleration_points TEXT,
    key_deceleration_points TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (sequence_id) REFERENCES Sequence(sequence_id)
);

-- Audience knowledge management
CREATE TABLE Information_Strategy (
    information_strategy_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    knowledge_asymmetry TEXT, -- dramatic_irony, mystery, parallel, shifting
    information_withheld TEXT,
    reveal_timing TEXT,
    suspense_approach TEXT,
    surprise_setup TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- How audience relates to characters
CREATE TABLE Identification_Strategy (
    identification_strategy_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    primary_identification_character_id INTEGER,
    how_identification_created TEXT,
    identification_shifts TEXT,
    empathy_targets TEXT, -- JSON array of character_ids
    distance_targets TEXT, -- JSON array of character_ids
    moral_alignment_approach TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (primary_identification_character_id) REFERENCES Character(character_id)
);
```

---

# PERFORMANCE LAYER

How characters exist and behave.

## Physical Performance

```sql
-- Baseline physical existence
CREATE TABLE Physical_Character_Profile (
    physical_profile_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL UNIQUE,
    -- Posture & Foundation
    posture TEXT, -- upright, slouched, rigid, relaxed, asymmetric
    center_of_gravity TEXT, -- high, low, forward, back
    tension_level TEXT, -- tense, relaxed, variable
    energy_quality TEXT, -- kinetic, still, restless, contained
    -- Movement Quality
    movement_speed TEXT, -- quick, slow, deliberate, erratic
    movement_fluidity TEXT, -- smooth, jerky, graceful, awkward
    movement_economy TEXT, -- efficient, wasteful, precise, sloppy
    movement_weight TEXT, -- light, heavy, grounded, floating
    -- Physical Confidence
    spatial_presence TEXT, -- takes_up_space, minimizes_self
    physical_comfort TEXT, -- at_home_in_body, disconnected
    coordination_level TEXT,
    -- Physical History
    physical_training_visible TEXT,
    physical_neglect_visible TEXT,
    injuries_visible_in_movement TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Physical habits and gestures
CREATE TABLE Physical_Habit (
    physical_habit_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    habit_name TEXT NOT NULL,
    description TEXT,
    body_parts_involved TEXT,
    trigger TEXT,
    frequency TEXT,
    meaning TEXT,
    character_awareness TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Character's physical condition at story point
CREATE TABLE Physical_State (
    physical_state_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    energy_level TEXT, -- alert, tired, wired, relaxed
    physical_comfort TEXT,
    intoxication_level TEXT,
    physical_needs TEXT, -- hunger, temperature, rest
    current_injuries TEXT,
    illness_symptoms TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- How emotions manifest physically
CREATE TABLE Emotional_Physicality (
    emotional_physicality_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    emotion TEXT NOT NULL,
    posture_changes TEXT,
    tension_location TEXT,
    breathing_pattern TEXT,
    expansion_contraction TEXT, -- expanding, contracting
    stillness_vs_movement TEXT,
    visibility_level TEXT, -- obvious, subtle, hidden, leaked
    control_level TEXT, -- conscious, unconscious, suppressed, overwhelming
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Facial expression patterns
CREATE TABLE Facial_Expression_Profile (
    facial_expression_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    resting_face TEXT,
    expressiveness_level TEXT, -- mobile, controlled, flat
    asymmetries TEXT,
    -- Eye Behavior
    eye_contact_patterns TEXT,
    gaze_direction_tendencies TEXT,
    blink_rate_variations TEXT,
    -- Mouth Behavior
    mouth_tension_patterns TEXT,
    smile_authenticity TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Fleeting expressions
CREATE TABLE Microexpression (
    microexpression_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER,
    dialogue_id INTEGER,
    expression_type TEXT,
    duration_ms INTEGER,
    facial_region TEXT,
    underlying_emotion TEXT,
    displayed_emotion TEXT,
    character_awareness TEXT,
    audience_intended_to_catch BOOLEAN,
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);
```

## Physical Interaction

```sql
-- Physical relationship between characters
CREATE TABLE Physical_Relationship (
    physical_relationship_id INTEGER PRIMARY KEY,
    character_a_id INTEGER NOT NULL,
    character_b_id INTEGER NOT NULL,
    typical_distance TEXT, -- intimate, personal, social, public
    who_controls_distance TEXT,
    touch_patterns TEXT,
    touch_quality TEXT, -- gentle, aggressive, casual, charged
    who_initiates_touch TEXT,
    physical_mirroring TEXT,
    physical_power_dynamic TEXT,
    FOREIGN KEY (character_a_id) REFERENCES Character(character_id),
    FOREIGN KEY (character_b_id) REFERENCES Character(character_id)
);

-- How physical relationship evolves
CREATE TABLE Physical_Relationship_Evolution (
    evolution_id INTEGER PRIMARY KEY,
    physical_relationship_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    distance_state TEXT,
    touch_state TEXT,
    mirroring_state TEXT,
    change_from_previous TEXT,
    FOREIGN KEY (physical_relationship_id) REFERENCES Physical_Relationship(physical_relationship_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- How character inhabits space
CREATE TABLE Character_Environment_Physicality (
    char_env_physical_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    how_enters_space TEXT,
    typical_position TEXT,
    space_claiming_behavior TEXT,
    object_interaction_quality TEXT,
    territorial_behavior TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);

-- Specific physical moment
CREATE TABLE Physical_Performance_Beat (
    physical_beat_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    shot_id INTEGER,
    dialogue_id INTEGER,
    beat_description TEXT NOT NULL,
    timing TEXT,
    purpose TEXT,
    quality_notes TEXT, -- sharp, soft, sudden, gradual
    scale TEXT, -- large, small, subtle
    relationship_to_dialogue TEXT, -- accompanies, replaces, contradicts, punctuates
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id)
);
```

## Vocal Performance

```sql
-- Baseline vocal identity
CREATE TABLE Vocal_Profile (
    vocal_profile_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL UNIQUE,
    -- Voice Qualities
    pitch_range TEXT, -- high, low, middle, variable
    timbre TEXT, -- warm, nasal, resonant, thin, gravelly
    volume_tendency TEXT,
    breathiness_level TEXT,
    -- Speech Patterns
    pace TEXT, -- fast, slow, measured, variable
    rhythm TEXT, -- regular, syncopated, halting
    articulation TEXT, -- precise, mumbled, clipped, drawled
    fluency TEXT, -- smooth, stuttered, filled_pauses
    -- Accent/Dialect
    regional_markers TEXT,
    class_markers TEXT,
    educational_markers TEXT,
    accent_authenticity TEXT, -- native, acquired, affected
    -- Verbal Habits
    filler_words TEXT, -- JSON array
    catch_phrases TEXT, -- JSON array
    verbal_tics TEXT, -- JSON array
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Voice at specific story point
CREATE TABLE Vocal_State (
    vocal_state_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    physical_vocal_state TEXT, -- healthy, hoarse, strained
    emotional_vocal_state TEXT, -- controlled, emotional, confident
    environmental_factors TEXT,
    altered_state_effects TEXT, -- intoxication, illness, crying
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- How character generally delivers lines
CREATE TABLE Delivery_Profile (
    delivery_profile_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL UNIQUE,
    delivery_style TEXT, -- naturalistic, theatrical, minimalist, mannered
    emotional_access TEXT, -- available, controlled, variable
    subtext_playing TEXT, -- plays_clearly, hides, unaware
    listening_behavior TEXT,
    interruption_tendencies TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Specific line delivery
CREATE TABLE Line_Delivery (
    line_delivery_id INTEGER PRIMARY KEY,
    dialogue_id INTEGER NOT NULL,
    emotional_quality TEXT,
    tempo TEXT,
    volume TEXT,
    emphasis_words TEXT, -- JSON array
    pause_locations TEXT, -- JSON array
    breath_points TEXT,
    subtext TEXT,
    operative_words TEXT,
    physical_integration TEXT,
    FOREIGN KEY (dialogue_id) REFERENCES Dialogue_Line(dialogue_id)
);

-- Specific vocal moment
CREATE TABLE Vocal_Beat (
    vocal_beat_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    dialogue_id INTEGER,
    beat_description TEXT NOT NULL,
    beat_type TEXT, -- silence, non_verbal_sound, quality_shift, volume_shift, tempo_shift
    timing TEXT,
    purpose TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Musicality of conversation
CREATE TABLE Dialogue_Rhythm (
    dialogue_rhythm_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    character_a_id INTEGER NOT NULL,
    character_b_id INTEGER,
    conversational_style TEXT, -- overlapping, turn_taking, rapid, languid
    power_dynamics TEXT,
    listening_indicators TEXT,
    rhythm_evolution TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (character_a_id) REFERENCES Character(character_id),
    FOREIGN KEY (character_b_id) REFERENCES Character(character_id)
);
```

## Choreography

```sql
-- Scene blocking
CREATE TABLE Scene_Blocking (
    scene_blocking_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL UNIQUE,
    opening_positions TEXT, -- JSON describing character positions
    closing_positions TEXT,
    spatial_storytelling TEXT,
    blocking_notes TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Specific movement/position change
CREATE TABLE Blocking_Beat (
    blocking_beat_id INTEGER PRIMARY KEY,
    scene_blocking_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    beat_order INTEGER NOT NULL,
    movement_description TEXT NOT NULL,
    character_motivation TEXT,
    story_motivation TEXT,
    timing TEXT,
    quality TEXT,
    meaning TEXT,
    FOREIGN KEY (scene_blocking_id) REFERENCES Scene_Blocking(scene_blocking_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Extended physical action
CREATE TABLE Action_Sequence (
    action_sequence_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    action_type TEXT, -- fight, chase, labor, athletic, dance, stunt
    narrative_function TEXT,
    character_revelation TEXT,
    emotional_journey TEXT,
    action_arc TEXT, -- beginning, escalation, climax, resolution
    physical_vocabulary TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Junction: Characters in action sequence
CREATE TABLE Action_Sequence_Character (
    action_sequence_character_id INTEGER PRIMARY KEY,
    action_sequence_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    role_in_action TEXT,
    FOREIGN KEY (action_sequence_id) REFERENCES Action_Sequence(action_sequence_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Specific moment in action
CREATE TABLE Action_Beat (
    action_beat_id INTEGER PRIMARY KEY,
    action_sequence_id INTEGER,
    scene_id INTEGER NOT NULL,
    shot_id INTEGER,
    character_id INTEGER,
    description TEXT NOT NULL,
    beat_function TEXT, -- story, character, spectacle, emotional
    timing TEXT,
    intensity INTEGER, -- 1-10
    safety_requirements TEXT,
    FOREIGN KEY (action_sequence_id) REFERENCES Action_Sequence(action_sequence_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Proxemic design
CREATE TABLE Proxemic_Design (
    proxemic_design_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    starting_distance_zone TEXT, -- intimate, personal, social, public
    ending_distance_zone TEXT,
    distance_story TEXT,
    violations TEXT,
    violation_purpose TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Designed movement (dance, ritual, work)
CREATE TABLE Movement_Choreography (
    movement_choreography_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    choreography_type TEXT, -- dance_formal, dance_social, ritual, work, sport, synchronized
    style TEXT,
    meaning TEXT,
    period_accuracy TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);
```

---

# CREATIVE LAYER — VISUAL

Everything the audience sees.

## World Design

```sql
-- Overarching visual identity
CREATE TABLE Visual_Identity (
    visual_identity_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    visual_statement TEXT,
    aesthetic_genre TEXT, -- naturalistic, stylized, hyperreal, expressionistic, fantastical
    design_era TEXT,
    visual_density TEXT, -- minimalist, moderate, dense, maximalist
    textural_philosophy TEXT, -- clean, lived_in, weathered, decayed
    visual_influences TEXT, -- JSON array
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Design constraints/rules
CREATE TABLE Design_Constraints (
    design_constraints_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    allowed_materials TEXT, -- JSON array
    forbidden_materials TEXT, -- JSON array
    dominant_materials TEXT,
    technology_level TEXT,
    technology_aesthetic TEXT,
    architectural_styles TEXT,
    scale_rules TEXT,
    geometric_language TEXT, -- organic, angular, mixed
    lighting_constraints TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Recurring visual elements
CREATE TABLE Visual_Motif (
    visual_motif_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    motif_name TEXT NOT NULL,
    motif_type TEXT, -- shape, pattern, material, architectural, object, natural
    symbolic_meaning TEXT,
    evolution_description TEXT,
    placement_strategy TEXT,
    subtlety_level TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Junction: Where visual motifs appear
CREATE TABLE Visual_Motif_Appearance (
    appearance_id INTEGER PRIMARY KEY,
    visual_motif_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL, -- location, prop, costume, shot
    entity_id INTEGER NOT NULL,
    manifestation_notes TEXT,
    FOREIGN KEY (visual_motif_id) REFERENCES Visual_Motif(visual_motif_id)
);

-- Location visual design
CREATE TABLE Location_Design (
    location_design_id INTEGER PRIMARY KEY,
    location_id INTEGER NOT NULL UNIQUE,
    design_concept TEXT,
    visual_metaphor TEXT,
    emotional_target TEXT,
    -- Architectural Character
    period_style TEXT,
    condition TEXT, -- pristine, maintained, neglected, ruined
    scale TEXT,
    geometry TEXT, -- organic, angular, chaotic, ordered
    -- Materials
    dominant_materials TEXT,
    secondary_materials TEXT,
    texture_quality TEXT,
    surface_finish TEXT,
    -- Spatial
    spatial_description TEXT,
    sight_lines TEXT,
    key_focal_points TEXT,
    -- Lighting Environment
    natural_light_sources TEXT,
    practical_light_sources TEXT,
    light_quality TEXT,
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);

-- Set dressing for scene
CREATE TABLE Set_Dressing (
    set_dressing_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    hero_objects TEXT, -- JSON array of prop_ids
    atmospheric_objects TEXT,
    practical_objects TEXT,
    background_fill TEXT,
    sightline_management TEXT,
    continuity_requirements TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);

-- Prop visual design
CREATE TABLE Prop_Design (
    prop_design_id INTEGER PRIMARY KEY,
    prop_id INTEGER NOT NULL UNIQUE,
    design_concept TEXT,
    visual_inspiration TEXT,
    symbolic_meaning TEXT,
    -- Physical Specs
    materials TEXT,
    color_hex TEXT,
    color_name TEXT,
    texture_finish TEXT,
    condition TEXT,
    wear_patterns TEXT,
    -- Manufacturing (in-world)
    how_made TEXT,
    origin TEXT,
    age_history TEXT,
    FOREIGN KEY (prop_id) REFERENCES Prop(prop_id)
);

-- Graphic design in world
CREATE TABLE Graphic_Design (
    graphic_design_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    -- Typography
    primary_typefaces TEXT,
    typography_era TEXT,
    lettering_style TEXT, -- mechanical, hand_drawn, digital
    -- Signage
    sign_types TEXT,
    fabrication_aesthetic TEXT,
    signage_condition TEXT,
    -- In-World Branding
    brand_descriptions TEXT, -- JSON array
    packaging_style TEXT,
    document_design TEXT,
    -- Screens
    interface_style TEXT,
    screen_content_approach TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Material palette
CREATE TABLE Material_Palette (
    material_palette_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    primary_materials TEXT, -- JSON array
    secondary_materials TEXT,
    accent_materials TEXT,
    forbidden_materials TEXT,
    material_storytelling TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Texture philosophy
CREATE TABLE Texture_Philosophy (
    texture_philosophy_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    texture_spectrum TEXT, -- smooth, rough, mixed
    texture_contrast_strategy TEXT,
    surface_finish_preference TEXT,
    patina_aging_approach TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);
```

## Character Appearance

```sql
-- Complete visual design of character
CREATE TABLE Character_Appearance_Profile (
    appearance_profile_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL UNIQUE,
    -- Physical Design
    body_type TEXT,
    height_proportions TEXT,
    age_appearance TEXT,
    distinguishing_features TEXT,
    -- Baseline Appearance
    hair_style TEXT,
    hair_color TEXT,
    hair_texture TEXT,
    skin_tone TEXT,
    grooming_level TEXT,
    -- Visual Identity
    visual_distinction TEXT,
    silhouette_description TEXT,
    visual_shorthand TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Costume design philosophy
CREATE TABLE Costume_Design_Philosophy (
    costume_philosophy_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    design_approach TEXT, -- period_accurate, period_inspired, contemporary, timeless, stylized
    silhouette_strategy TEXT,
    fabric_philosophy TEXT, -- natural, synthetic, mixed
    formality_spectrum TEXT,
    condition_philosophy TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Specific costume
CREATE TABLE Costume (
    costume_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    costume_name TEXT,
    description TEXT,
    -- Design Elements
    silhouette TEXT,
    key_garments TEXT, -- JSON array
    layers TEXT,
    accessories TEXT, -- JSON array
    -- Color
    primary_color_hex TEXT,
    primary_color_name TEXT,
    secondary_colors TEXT, -- JSON array
    -- Material
    fabrics TEXT,
    texture_qualities TEXT,
    -- Condition
    condition TEXT, -- new, worn, distressed
    continuity_notes TEXT,
    -- Character Expression
    what_reveals TEXT,
    emotional_state_reflected TEXT,
    social_signals TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Junction: Which scenes costume appears
CREATE TABLE Costume_Scene (
    costume_scene_id INTEGER PRIMARY KEY,
    costume_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    condition_in_scene TEXT,
    notes TEXT,
    FOREIGN KEY (costume_id) REFERENCES Costume(costume_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Costume progression through story
CREATE TABLE Costume_Progression (
    costume_progression_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL UNIQUE,
    starting_wardrobe TEXT,
    starting_meaning TEXT,
    progression_stages TEXT, -- JSON array of {scene_id, costume_id, trigger, meaning}
    color_evolution TEXT,
    formality_evolution TEXT,
    condition_evolution TEXT,
    symbolic_meaning TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Makeup and hair design
CREATE TABLE Makeup_Hair_Design (
    makeup_hair_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER, -- NULL for baseline
    -- Makeup
    makeup_approach TEXT, -- naturalistic, beauty, character, sfx
    makeup_details TEXT,
    -- Hair
    hair_style TEXT,
    hair_condition TEXT,
    hair_notes TEXT,
    -- Effects
    prosthetics TEXT,
    aging_effects TEXT,
    injury_effects TEXT,
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);
```

## Color

```sql
-- Project color palette
CREATE TABLE Project_Color_Palette (
    project_palette_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    palette_name TEXT,
    primary_colors TEXT, -- JSON array of {hex, name}
    secondary_colors TEXT,
    accent_colors TEXT,
    restricted_colors TEXT,
    reserved_colors TEXT, -- JSON {color, context}
    color_relationships TEXT,
    saturation_philosophy TEXT,
    value_structure TEXT,
    color_evolution_by_act TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Sequence color palette
CREATE TABLE Sequence_Color_Palette (
    sequence_palette_id INTEGER PRIMARY KEY,
    sequence_id INTEGER NOT NULL UNIQUE,
    dominant_colors TEXT,
    color_temperature TEXT,
    saturation_level TEXT,
    difference_from_baseline TEXT,
    reason TEXT,
    transition_start TEXT,
    transition_end TEXT,
    FOREIGN KEY (sequence_id) REFERENCES Sequence(sequence_id)
);

-- Scene color palette
CREATE TABLE Scene_Color_Palette (
    scene_palette_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL UNIQUE,
    dominant_colors TEXT, -- JSON 1-3 colors
    color_harmony_type TEXT, -- monochromatic, analogous, complementary, etc.
    color_source_distribution TEXT, -- where colors come from
    color_contrast_level TEXT,
    focal_color TEXT,
    grading_notes TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Color script
CREATE TABLE Color_Script (
    color_script_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    format TEXT, -- strip, grid, timeline
    granularity TEXT, -- per_scene, per_sequence, per_act
    progression_description TEXT,
    key_color_moments TEXT,
    arc_shape TEXT, -- linear, cyclical, transformative, oscillating
    emotional_mapping TEXT,
    asset_id INTEGER, -- link to color script artwork
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (asset_id) REFERENCES Asset(asset_id)
);

-- Character color identity
CREATE TABLE Character_Color_Identity (
    color_identity_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL UNIQUE,
    primary_color_hex TEXT,
    primary_color_name TEXT,
    secondary_colors TEXT,
    how_manifests TEXT, -- wardrobe, accessories, environment
    why_these_colors TEXT,
    consistency_level TEXT, -- always, usually, accent, metaphor
    starting_colors TEXT,
    midpoint_shift TEXT,
    final_colors TEXT,
    color_isolation TEXT, -- unique, shared, contrasting
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Location color scheme
CREATE TABLE Location_Color_Scheme (
    location_color_id INTEGER PRIMARY KEY,
    location_id INTEGER NOT NULL UNIQUE,
    dominant_colors TEXT,
    color_motivation TEXT, -- period, character, symbolic, practical
    color_atmosphere TEXT, -- warm, cool, neutral, colorful
    color_intensity TEXT,
    character_location_interaction TEXT, -- match, contrast, transform
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);

-- Color symbolism definitions
CREATE TABLE Color_Symbolism (
    color_symbolism_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    color_hex TEXT NOT NULL,
    color_name TEXT,
    primary_symbolism TEXT,
    secondary_symbolism TEXT,
    emotional_positive TEXT,
    emotional_negative TEXT,
    evolution_through_story TEXT,
    cultural_context TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Color temperature strategy
CREATE TABLE Color_Temperature_Strategy (
    temperature_strategy_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    overall_approach TEXT, -- warm, cool, balanced, journey
    warm_associations TEXT,
    cool_associations TEXT,
    temperature_contrast_points TEXT,
    day_scene_temperature TEXT,
    night_scene_temperature TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);
```

## Cinematography

```sql
-- Cinematographic philosophy
CREATE TABLE Cinematographic_Philosophy (
    cinematographic_philosophy_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    camera_personality TEXT, -- objective, subjective, omniscient, character_aligned
    movement_philosophy TEXT, -- static, fluid, motivated, expressive
    framing_philosophy TEXT, -- classical, dynamic, intimate, epic
    visual_consistency TEXT, -- unified, varied, evolving
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Camera package
CREATE TABLE Camera_Package (
    camera_package_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    make_model TEXT NOT NULL,
    sensor_size TEXT,
    sensor_dimensions TEXT,
    native_iso INTEGER,
    dynamic_range INTEGER,
    color_science TEXT,
    recording_formats TEXT,
    frame_rates TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Lens set
CREATE TABLE Lens_Set (
    lens_set_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    set_name TEXT NOT NULL,
    focal_lengths TEXT, -- JSON array
    era_vintage TEXT,
    coverage_format TEXT,
    look_description TEXT,
    intended_aesthetic TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Individual lens
CREATE TABLE Lens (
    lens_id INTEGER PRIMARY KEY,
    lens_set_id INTEGER,
    manufacturer TEXT,
    lens_series TEXT,
    focal_length INTEGER,
    max_aperture REAL,
    -- Optical Characteristics
    sharpness_profile TEXT,
    contrast_characteristics TEXT,
    color_rendering TEXT,
    flare_characteristics TEXT,
    bokeh_quality TEXT,
    FOREIGN KEY (lens_set_id) REFERENCES Lens_Set(lens_set_id)
);

-- Shot design
CREATE TABLE Shot_Design (
    shot_design_id INTEGER PRIMARY KEY,
    shot_id INTEGER NOT NULL UNIQUE,
    -- Framing
    aspect_ratio TEXT,
    framing_type TEXT, -- EWS, WS, MS, MCU, CU, ECU, insert, OTS, POV
    angle TEXT, -- eye_level, high, low, dutch, overhead
    dutch_degrees REAL,
    subject_placement TEXT,
    headroom INTEGER,
    look_room INTEGER,
    depth_composition TEXT,
    -- Lens
    lens_id INTEGER,
    aperture TEXT,
    lens_choice_reason TEXT,
    -- Focus
    focus_mode TEXT, -- deep, shallow, rack, split
    depth_of_field TEXT,
    primary_focus_subject TEXT,
    rack_focus_choreography TEXT,
    -- Movement
    movement_type TEXT,
    movement_speed TEXT,
    movement_motivation TEXT,
    start_position TEXT,
    end_position TEXT,
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id),
    FOREIGN KEY (lens_id) REFERENCES Lens(lens_id)
);

-- Shot meaning/intent
CREATE TABLE Shot_Language (
    shot_language_id INTEGER PRIMARY KEY,
    shot_id INTEGER NOT NULL UNIQUE,
    shot_intention TEXT, -- establishing, reaction, POV, insert, emotional, information
    shot_psychology TEXT, -- intimate, distant, powerful, vulnerable, stable, unstable
    audience_relationship TEXT, -- observer, participant, identification, omniscient
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id)
);

-- Lighting design
CREATE TABLE Lighting_Design (
    lighting_design_id INTEGER PRIMARY KEY,
    scene_id INTEGER,
    shot_id INTEGER,
    -- Style
    lighting_style TEXT, -- naturalistic, stylized, high_key, low_key, chiaroscuro
    contrast_ratio TEXT,
    overall_mood TEXT,
    light_quality TEXT, -- hard, soft, mixed
    -- Key Light
    key_source TEXT,
    key_direction TEXT,
    key_quality TEXT,
    key_color_temperature INTEGER,
    -- Fill Light
    fill_ratio TEXT,
    fill_quality TEXT,
    fill_color_temperature INTEGER,
    -- Other Lights
    backlight_notes TEXT,
    practical_lights TEXT,
    ambient_light TEXT,
    -- Color
    lighting_color_palette TEXT,
    color_contrast TEXT,
    shadow_color TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id)
);

-- Look development
CREATE TABLE Look_Development (
    look_development_id INTEGER PRIMARY KEY,
    project_id INTEGER,
    scene_id INTEGER,
    look_name TEXT,
    -- Characteristics
    contrast TEXT, -- flat, normal, high
    saturation TEXT, -- desaturated, normal, vivid
    color_bias TEXT, -- warm, cool, neutral, tinted
    highlight_handling TEXT,
    shadow_handling TEXT,
    grain_texture TEXT,
    -- LUTs
    on_set_lut TEXT,
    editorial_lut TEXT,
    final_grade_foundation TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Coverage philosophy
CREATE TABLE Coverage_Philosophy (
    coverage_philosophy_id INTEGER PRIMARY KEY,
    project_id INTEGER,
    scene_id INTEGER,
    coverage_style TEXT, -- master_plus_coverage, single_camera, multi_camera, oner
    editorial_approach TEXT, -- cut_friendly, in_camera, improvised
    coverage_priorities TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);
```

---

# CREATIVE LAYER — AUDITORY

Everything the audience hears.

## Dialogue (as Sound)

```sql
-- Dialogue line (base content)
CREATE TABLE Dialogue_Line (
    dialogue_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    shot_id INTEGER,
    character_id INTEGER NOT NULL,
    line_number INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    language TEXT DEFAULT 'English',
    translation TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);

-- Dialogue sound design
CREATE TABLE Dialogue_Sound_Design (
    dialogue_sound_design_id INTEGER PRIMARY KEY,
    project_id INTEGER,
    scene_id INTEGER,
    recording_aesthetic TEXT, -- clean, production, stylized
    acoustic_environment TEXT,
    dialogue_clarity TEXT, -- always_clear, sometimes_obscured, deliberately_muddy
    dialogue_layering TEXT,
    processing_notes TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Voice-over/narration design
CREATE TABLE Voiceover_Design (
    voiceover_design_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    character_id INTEGER,
    narration_type TEXT, -- character_vo, omniscient, internal_monologue
    acoustic_treatment TEXT, -- intimate, distanced, stylized
    relationship_to_image TEXT, -- complements, counterpoints, reveals
    placement_in_mix TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);
```

## Sound Design

```sql
-- Sonic identity
CREATE TABLE Sonic_Identity (
    sonic_identity_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    sound_aesthetic TEXT, -- naturalistic, heightened, stylized, surreal
    sonic_density TEXT, -- sparse, moderate, dense, overwhelming
    silence_philosophy TEXT,
    subjective_sound_approach TEXT,
    sound_evolution TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Location sound profile
CREATE TABLE Location_Sound_Profile (
    location_sound_id INTEGER PRIMARY KEY,
    location_id INTEGER NOT NULL UNIQUE,
    room_tone TEXT,
    reverb_quality TEXT,
    resonance TEXT,
    constant_sounds TEXT, -- JSON array
    variable_sounds TEXT,
    characteristic_sounds TEXT,
    sonic_perspective TEXT,
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
);

-- Sound effects palette
CREATE TABLE Sound_Effects_Palette (
    sfx_palette_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    effect_category TEXT, -- hard_effects, backgrounds, foley, designed
    design_approach TEXT, -- realistic, enhanced, stylized, symbolic
    signature_sounds TEXT, -- JSON array
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Individual sound cue
CREATE TABLE Sound_Cue (
    sound_cue_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    shot_id INTEGER,
    cue_type TEXT, -- sfx, foley, ambient, designed
    description TEXT,
    source TEXT, -- on_screen, off_screen
    volume_intensity TEXT,
    emotional_function TEXT,
    timing TEXT,
    duration INTEGER,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id)
);

-- Sonic motif
CREATE TABLE Sonic_Motif (
    sonic_motif_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    motif_name TEXT NOT NULL,
    sound_description TEXT,
    symbolic_meaning TEXT,
    first_appearance_scene_id INTEGER,
    recurrence_pattern TEXT,
    evolution_description TEXT,
    related_visual_motif_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (first_appearance_scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (related_visual_motif_id) REFERENCES Visual_Motif(visual_motif_id)
);

-- Perspective/subjectivity in sound
CREATE TABLE Sound_Perspective (
    sound_perspective_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    character_id INTEGER,
    perspective_type TEXT, -- objective, subjective, omniscient
    subjective_techniques TEXT, -- focus, muffling, internal_sounds
    transition_triggers TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id)
);
```

## Music

```sql
-- Musical identity
CREATE TABLE Musical_Identity (
    musical_identity_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    score_approach TEXT, -- orchestral, electronic, hybrid, acoustic
    musical_tone TEXT, -- emotional_support, counterpoint, commentary, neutral
    instrumentation_palette TEXT,
    score_density TEXT, -- wall_to_wall, selective, sparse
    source_music_approach TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id)
);

-- Musical theme
CREATE TABLE Musical_Theme (
    musical_theme_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    theme_name TEXT NOT NULL,
    theme_description TEXT,
    emotional_association TEXT,
    character_id INTEGER, -- if character theme
    concept_association TEXT, -- if concept theme
    first_appearance_scene_id INTEGER,
    development_description TEXT,
    orchestration_variations TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (first_appearance_scene_id) REFERENCES Scene(scene_id)
);

-- Scene music design
CREATE TABLE Scene_Music_Design (
    scene_music_design_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    music_presence TEXT, -- score, source, none, mixed
    emotional_function TEXT, -- support, anticipate, counterpoint, neutral
    entry_point TEXT,
    build_evolution TEXT,
    peak TEXT,
    exit_point TEXT,
    themes_used TEXT, -- JSON array of musical_theme_ids
    source_music_description TEXT,
    lyrics_relevance TEXT,
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Music cue
CREATE TABLE Music_Cue (
    music_cue_id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    shot_id INTEGER,
    cue_name TEXT,
    cue_type TEXT, -- diegetic, non_diegetic
    genre_style TEXT,
    tempo_mood TEXT,
    emotional_purpose TEXT,
    musical_theme_id INTEGER,
    instrumentation TEXT,
    volume_level TEXT,
    start_time INTEGER,
    end_time INTEGER,
    source TEXT, -- if diegetic
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id),
    FOREIGN KEY (shot_id) REFERENCES Shot(shot_id),
    FOREIGN KEY (musical_theme_id) REFERENCES Musical_Theme(musical_theme_id)
);

-- Music-sound relationship
CREATE TABLE Music_Sound_Relationship (
    relationship_id INTEGER PRIMARY KEY,
    project_id INTEGER,
    scene_id INTEGER,
    hierarchy TEXT, -- music_forward, sound_forward, equal, shifting
    blend_approach TEXT, -- clear_separation, blurred, designed_interaction
    combined_silence TEXT,
    FOREIGN KEY (project_id) REFERENCES Project(project_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);
```

---

# JUNCTION TABLES & INDEXES

```sql
-- Theme expression in scenes
CREATE TABLE Theme_Scene_Expression (
    expression_id INTEGER PRIMARY KEY,
    theme_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    how_expressed TEXT,
    subtlety_level TEXT,
    FOREIGN KEY (theme_id) REFERENCES Theme(theme_id),
    FOREIGN KEY (scene_id) REFERENCES Scene(scene_id)
);

-- Prop interactions
CREATE TABLE Prop_Interaction (
    interaction_id INTEGER PRIMARY KEY,
    prop_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    action_beat_id INTEGER,
    action_performed TEXT,
    manner TEXT,
    significance TEXT,
    FOREIGN KEY (prop_id) REFERENCES Prop(prop_id),
    FOREIGN KEY (character_id) REFERENCES Character(character_id),
    FOREIGN KEY (action_beat_id) REFERENCES Action_Beat(action_beat_id)
);
```

## Key Indexes

```sql
-- Structure indexes
CREATE INDEX idx_act_project ON Act(project_id);
CREATE INDEX idx_sequence_act ON Sequence(act_id);
CREATE INDEX idx_scene_sequence ON Scene(sequence_id);
CREATE INDEX idx_scene_location ON Scene(location_id);
CREATE INDEX idx_shot_scene ON Shot(scene_id);
CREATE INDEX idx_take_shot ON Take(shot_id);

-- Character indexes
CREATE INDEX idx_character_appearance_character ON Character_Appearance(character_id);
CREATE INDEX idx_character_appearance_scene ON Character_Appearance(scene_id);
CREATE INDEX idx_character_relationship_a ON Character_Relationship(character_a_id);
CREATE INDEX idx_character_relationship_b ON Character_Relationship(character_b_id);

-- Vision layer indexes
CREATE INDEX idx_theme_project ON Theme(project_id);
CREATE INDEX idx_thematic_connection_theme ON Thematic_Connection(theme_id);
CREATE INDEX idx_emotional_beat_arc ON Emotional_Beat(emotional_arc_id);
CREATE INDEX idx_emotional_beat_scene ON Emotional_Beat(scene_id);

-- Performance layer indexes
CREATE INDEX idx_physical_habit_character ON Physical_Habit(character_id);
CREATE INDEX idx_physical_state_character ON Physical_State(character_id);
CREATE INDEX idx_physical_state_scene ON Physical_State(scene_id);
CREATE INDEX idx_physical_beat_scene ON Physical_Performance_Beat(scene_id);
CREATE INDEX idx_vocal_state_scene ON Vocal_State(scene_id);
CREATE INDEX idx_blocking_beat_blocking ON Blocking_Beat(scene_blocking_id);

-- Creative layer indexes
CREATE INDEX idx_visual_motif_project ON Visual_Motif(project_id);
CREATE INDEX idx_location_design_location ON Location_Design(location_id);
CREATE INDEX idx_costume_character ON Costume(character_id);
CREATE INDEX idx_costume_scene ON Costume_Scene(scene_id);
CREATE INDEX idx_scene_palette_scene ON Scene_Color_Palette(scene_id);
CREATE INDEX idx_shot_design_shot ON Shot_Design(shot_id);
CREATE INDEX idx_lighting_design_scene ON Lighting_Design(scene_id);
CREATE INDEX idx_sound_cue_scene ON Sound_Cue(scene_id);
CREATE INDEX idx_music_cue_scene ON Music_Cue(scene_id);

-- Asset/metadata indexes
CREATE INDEX idx_asset_relationship_asset ON Asset_Relationship(asset_id);
CREATE INDEX idx_asset_relationship_entity ON Asset_Relationship(entity_type, entity_id);
CREATE INDEX idx_note_entity ON Note(entity_type, entity_id);
CREATE INDEX idx_entity_tag_entity ON Entity_Tag(entity_type, entity_id);
```

---

# QUERY EXAMPLES

## Complete Scene Context (All Layers)

```sql
-- Get everything about Scene 23 across all layers
SELECT 
    s.*,
    
    -- VISION LAYER
    set_target.primary_emotion,
    set_target.primary_intensity,
    (SELECT json_group_array(json_object(
        'theme', t.theme_name,
        'how_expressed', tse.how_expressed
    ))
    FROM Theme_Scene_Expression tse
    JOIN Theme t ON tse.theme_id = t.theme_id
    WHERE tse.scene_id = s.scene_id) as themes,
    tm.tone_descriptor,
    tm.mood_atmosphere,
    
    -- PERFORMANCE LAYER
    sb.opening_positions,
    sb.closing_positions,
    pd.starting_distance_zone,
    pd.ending_distance_zone,
    
    -- CREATIVE LAYER - VISUAL
    l.name as location_name,
    ld.design_concept,
    ld.emotional_target,
    scp.dominant_colors,
    scp.color_harmony_type,
    lighting.lighting_style,
    lighting.contrast_ratio,
    
    -- CREATIVE LAYER - AUDITORY
    lsp.room_tone,
    lsp.characteristic_sounds,
    smd.music_presence,
    smd.emotional_function as music_function

FROM Scene s
LEFT JOIN Scene_Emotional_Target set_target ON s.scene_id = set_target.scene_id
LEFT JOIN Tone_Marker tm ON s.scene_id = tm.scene_id
LEFT JOIN Scene_Blocking sb ON s.scene_id = sb.scene_id
LEFT JOIN Proxemic_Design pd ON s.scene_id = pd.scene_id
LEFT JOIN Location l ON s.location_id = l.location_id
LEFT JOIN Location_Design ld ON l.location_id = ld.location_id
LEFT JOIN Scene_Color_Palette scp ON s.scene_id = scp.scene_id
LEFT JOIN Lighting_Design lighting ON s.scene_id = lighting.scene_id AND lighting.shot_id IS NULL
LEFT JOIN Location_Sound_Profile lsp ON l.location_id = lsp.location_id
LEFT JOIN Scene_Music_Design smd ON s.scene_id = smd.scene_id
WHERE s.scene_number = '23';
```

## Character Complete Profile (All Layers)

```sql
-- Get complete character across all layers
SELECT 
    c.*,
    
    -- VISION LAYER
    ci.what_reveals as character_intention,
    
    -- PERFORMANCE LAYER - Physical
    pcp.posture,
    pcp.movement_quality,
    pcp.energy_quality,
    fep.resting_face,
    fep.expressiveness_level,
    
    -- PERFORMANCE LAYER - Vocal
    vp.pitch_range,
    vp.timbre,
    vp.pace,
    vp.accent_authenticity,
    dp.delivery_style,
    
    -- CREATIVE LAYER - Appearance
    cap.silhouette_description,
    cap.visual_distinction,
    cci.primary_color_name,
    cci.why_these_colors,
    
    -- Scenes appearing in
    (SELECT json_group_array(s.scene_number)
    FROM Character_Appearance ca
    JOIN Scene s ON ca.scene_id = s.scene_id
    WHERE ca.character_id = c.character_id) as scene_appearances

FROM Character c
LEFT JOIN Character_Intention ci ON c.character_id = ci.character_id
LEFT JOIN Physical_Character_Profile pcp ON c.character_id = pcp.character_id
LEFT JOIN Facial_Expression_Profile fep ON c.character_id = fep.character_id
LEFT JOIN Vocal_Profile vp ON c.character_id = vp.character_id
LEFT JOIN Delivery_Profile dp ON c.character_id = dp.character_id
LEFT JOIN Character_Appearance_Profile cap ON c.character_id = cap.character_id
LEFT JOIN Character_Color_Identity cci ON c.character_id = cci.character_id
WHERE c.name_full = 'Flippy';
```

---

# SCHEMA SUMMARY

**Total Tables: ~100+**

**Layer Breakdown:**
- Base Entities: ~20 tables (Structure, Character, Location, Prop, Asset, Metadata)
- Vision Layer: ~15 tables (Director's Intent, Thematic Framework, Emotional Architecture)
- Performance Layer: ~20 tables (Physical, Vocal, Choreography)
- Creative Layer - Visual: ~25 tables (World Design, Character Appearance, Color, Cinematography)
- Creative Layer - Auditory: ~12 tables (Dialogue, Sound Design, Music)

**Key Design Principles:**
1. **Layer-Organized** — Tables grouped by SSF layer hierarchy
2. **Cross-Layer Linking** — Entities connect across layers via foreign keys
3. **Flexible Entity Linking** — Generic entity_type + entity_id pattern for universal connections
4. **JSON for Arrays** — Complex lists stored as JSON for flexibility
5. **Scene as Hub** — Most layer data links back to scenes as the fundamental unit
6. **Character-Centric** — Character is a key linking entity across all layers
7. **Version Control Ready** — Built-in versioning and approval workflows

This schema captures the complete SSF hierarchy: WHY (Vision), HOW characters exist (Performance), and WHAT audiences experience (Creative), creating a comprehensive "latent space" for AI-assisted filmmaking.
