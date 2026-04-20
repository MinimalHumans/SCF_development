# Story State Framework — Layer Hierarchy

## Overview

The Story State Framework deconstructs a film into its fundamental components—the DNA that makes up the complete work. Rather than mirroring traditional production department structures, SSF organizes creative decisions by their *function* in the final film.

This hierarchy enables:
- Consistent creative intent across all decisions
- Complete context for AI-assisted generation and evaluation
- Queryable relationships between any elements
- Preservation of creative rationale at every level

---

## THE THREE PRIMARY LAYERS

### VISION LAYER
**The "Why"**

This layer captures the intent, meaning, and emotional architecture behind every creative decision. It documents the director's vision, thematic connections, philosophical framework, and emotional targets. This enables consistent interpretation across all other layers, preserves creative intent for future reference, and provides AI systems with the conceptual context needed to generate content that aligns with the director's vision.

**Sub-layers:**
- **Director's Intent** — Vision statement, creative philosophy, personal connection, decision rationale
- **Thematic Framework** — Themes, subtext, symbolism, conceptual motifs
- **Emotional Architecture** — Audience journey, emotional targets, tone markers, feeling progression

---

### PERFORMANCE LAYER
**Characters Come Alive**

This layer captures how characters exist and behave—the nuanced physical and vocal elements that bring them to life. It enables consistent character portrayal across shots, provides detailed performance context, and gives collaborators and AI systems complete information for generating or evaluating character depictions.

**Sub-layers:**
- **Physical Performance** — Body language, movement, gesture, expression, micro-expressions, physicality
- **Vocal Performance** — Voice characteristics, delivery style, speech patterns, accent, rhythm
- **Choreography** — Blocking, spatial relationships, action design, dance, movement through space

---

### CREATIVE LAYER
**The Sensory World**

This layer captures all visual and auditory design decisions that shape what the audience experiences. It encompasses everything the audience sees and hears—documenting aesthetic philosophy, material choices, color storytelling, camera language, sound design, and musical expression that create the film's complete sensory identity.

**Visual Sub-layers:**
- **World Design** — Locations, architecture, props, set dressing, graphic design, material palette
- **Character Appearance** — Costume, makeup, hair, prosthetics, physical character design
- **Color** — Palette, symbolism, psychology, temperature, evolution through story
- **Cinematography** — Framing, composition, camera movement, lenses, lighting, visual language

**Auditory Sub-layers:**
- **Dialogue** — Spoken word as sound element (distinct from performance delivery)
- **Sound Design** — Environmental audio, sound effects, acoustic reality, silence
- **Music** — Score, source music, themes, leitmotifs, emotional underscore

---

## LAYER RELATIONSHIPS

The three primary layers are deeply interconnected:

```
VISION LAYER
    ↓ informs
PERFORMANCE LAYER ←→ CREATIVE LAYER
         ↘         ↙
          FINAL FILM
```

- **Vision → Performance:** Director's intent shapes how characters should feel, what their emotional journey is, what truth the performance must convey
- **Vision → Creative:** Thematic framework determines visual motifs, color symbolism, sound design choices
- **Performance ↔ Creative:** Character appearance influences physical performance; choreography works with cinematography; vocal performance interacts with sound design

Every entity in any layer can link to entities in other layers, creating a rich web of meaningful connections.

---

## DOCUMENT STRUCTURE

Each layer document follows a consistent pattern:

1. **Overview** — Purpose and scope of the layer
2. **Philosophy/Approach Entities** — High-level guiding principles
3. **Specific Design Entities** — Detailed specifications
4. **Relationship Definitions** — How entities connect within and across layers
5. **Query Examples** — Demonstrating how to retrieve meaningful context

---

## BASE ENTITIES

Beneath the layer system, SSF maintains **Base Entities** that provide the structural foundation:

- **Project** — Top-level container
- **Act / Sequence / Scene / Shot / Take** — Structural hierarchy
- **Character** — Core character definitions
- **Location** — Place definitions
- **Prop** — Object definitions
- **Asset** — External file references
- **Production Metadata** — Notes, versions, approvals, tags

These base entities are *referenced by* the layer system but exist independently, allowing any entity to be connected to vision, performance, and creative decisions as needed.

---

## EXPANDABILITY

This framework is designed for extension. Additional sub-layers can be added as needed:
- VFX Design (under Creative > Visual)
- Creature Design (under Creative > Visual)
- World-Building Rules (under Vision or Creative)
- Interactive/Game-Specific Layers

Each extension follows the same pattern: define entities, attributes, and relationships to existing entities across all layers.
