import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// =============================================================================
// Line-type classifier (stateful, mirrors backend classification)
// =============================================================================

export type FountainLineType =
  | 'heading' | 'action' | 'character' | 'dialogue'
  | 'parenthetical' | 'transition' | 'blank'
  | 'section' | 'synopsis' | 'centered' | 'boneyard';

const HEADING_RE   = /^\.?(INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT|INT\.?\/EXT\.?|EXT\.?\/INT\.?|EST)[\.\s]/i;
const CHAR_RE      = /^[A-Z][A-Z\s0-9\(\)\-\.\']{1,}$/;
const PAREN_RE     = /^\s*\(.*\)\s*$/;
const TRANS_RE     = /^[A-Z\s]+TO:\s*$|^FADE (IN|OUT|TO BLACK):?\s*$|^SMASH CUT:\s*$/;
const SECTION_RE   = /^#{1,6}\s/;
const SYNOPSIS_RE  = /^=\s/;
const CENTERED_RE  = /^>\s.*\s<$/;
const BONEYARD_RE  = /^\/\*/;

export function classifyFountainLine(text: string, prevType: FountainLineType): FountainLineType {
  const trimmed = text.trim();
  if (!trimmed) return 'blank';
  if (BONEYARD_RE.test(trimmed)) return 'boneyard';
  if (SECTION_RE.test(trimmed))  return 'section';
  if (SYNOPSIS_RE.test(trimmed)) return 'synopsis';
  if (CENTERED_RE.test(trimmed)) return 'centered';
  if (HEADING_RE.test(trimmed))  return 'heading';
  if (TRANS_RE.test(trimmed))    return 'transition';
  if (prevType === 'blank' && CHAR_RE.test(trimmed) && !trimmed.startsWith('(')) return 'character';
  if ((prevType === 'character' || prevType === 'dialogue') && PAREN_RE.test(trimmed)) return 'parenthetical';
  if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') return 'dialogue';
  return 'action';
}

export function classifyAllLines(doc: { lines: number; line(n: number): { text: string } }): FountainLineType[] {
  const types: FountainLineType[] = [];
  let prev: FountainLineType = 'blank';
  for (let i = 1; i <= doc.lines; i++) {
    const t = classifyFountainLine(doc.line(i).text, prev);
    types.push(t);
    prev = t;
  }
  return types;
}

// =============================================================================
// Line decorations
// =============================================================================

const lineDeco: Record<FountainLineType, Decoration> = {
  heading:       Decoration.line({ class: 'cm-fountain-heading' }),
  action:        Decoration.line({ class: 'cm-fountain-action' }),
  character:     Decoration.line({ class: 'cm-fountain-character' }),
  dialogue:      Decoration.line({ class: 'cm-fountain-dialogue' }),
  parenthetical: Decoration.line({ class: 'cm-fountain-parenthetical' }),
  transition:    Decoration.line({ class: 'cm-fountain-transition' }),
  blank:         Decoration.line({ class: 'cm-fountain-blank' }),
  section:       Decoration.line({ class: 'cm-fountain-section' }),
  synopsis:      Decoration.line({ class: 'cm-fountain-synopsis' }),
  centered:      Decoration.line({ class: 'cm-fountain-centered' }),
  boneyard:      Decoration.line({ class: 'cm-fountain-boneyard' }),
};

// =============================================================================
// ViewPlugin
// =============================================================================

class FountainHighlighter {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }

  update(up: ViewUpdate) {
    if (up.docChanged || up.viewportChanged) {
      this.decorations = this.build(up.view);
    }
  }

  private build(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let prev: FountainLineType = 'blank';

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const type = classifyFountainLine(line.text, prev);
      builder.add(line.from, line.from, lineDeco[type]);
      prev = type;
    }

    return builder.finish();
  }
}

export const fountainHighlighter = ViewPlugin.fromClass(FountainHighlighter, {
  decorations: v => v.decorations,
});

// =============================================================================
// Theme
// =============================================================================

export const fountainTheme = EditorView.baseTheme({
  '.cm-fountain-heading': {
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: '1.5em',
    display: 'block',
  },
  '.cm-fountain-character': {
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: '1em',
    display: 'block',
    paddingLeft: '4em',
  },
  '.cm-fountain-dialogue': {
    paddingLeft: '2.5em',
    paddingRight: '2.5em',
    display: 'block',
  },
  '.cm-fountain-parenthetical': {
    paddingLeft: '3.5em',
    fontStyle: 'italic',
    display: 'block',
  },
  '.cm-fountain-transition': {
    textAlign: 'right',
    textTransform: 'uppercase',
    display: 'block',
  },
  '.cm-fountain-section': {
    fontWeight: 'bold',
    fontSize: '1.05em',
    display: 'block',
  },
  '.cm-fountain-synopsis': {
    fontStyle: 'italic',
    opacity: '0.6',
    display: 'block',
  },
  '.cm-fountain-centered': {
    textAlign: 'center',
    display: 'block',
  },
  '.cm-fountain-boneyard': {
    opacity: '0.4',
    display: 'block',
  },
});
