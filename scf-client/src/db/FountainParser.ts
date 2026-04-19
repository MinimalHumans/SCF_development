/**
 * Fountain Screenplay Parser for SCF
 * ====================================
 * Ported from scf-editor/fountain_parser.py
 */

export interface FountainCharacter {
  name: string;
  raw_name: string;
  description: string;
  hair: string;
  build: string;
  distinguishing_features: string;
  scenes: number[]; // 0-based
}

export interface FountainLocation {
  name: string;
  raw_headings: string[];
}

export interface FountainProp {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  context: string;
  first_scene: number;
  mention_count: number;
}

export interface FountainSceneCharacter {
  name: string;
  parentheticals: string[];
  has_dialogue: boolean;
}

export interface FountainScene {
  scene_number: number; // 1-based
  name: string;
  location_name: string;
  int_ext: string;
  time_of_day: string;
  summary: string;
  characters: FountainSceneCharacter[];
}

export interface FountainData {
  characters: FountainCharacter[];
  locations: FountainLocation[];
  scenes: FountainScene[];
  props: FountainProp[];
  title: string;
  author: string;
}

// =============================================================================
// Constants & Regexes
// =============================================================================

const SCENE_HEADING_RE = /^\.?(INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT|INT\.?\/EXT\.?|EXT\.?\/INT\.?|EST)[\.\s]+\s*(.+?)(?:\s*[-\.]\s*(DAY|NIGHT|MORNING|EARLY\s+MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|TWILIGHT|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS?\s+LATER|SAME\s+TIME|MANY\s+YEARS\s+AGO|YEARS\s+AGO|YEARS\s+LATER|YEARS\s+BEFORE|PRESENT\s+DAY|PRESENT))?(?:\s*[\.\s]*(?:B\+W|B&W))?(?:\s*[\(\[].*?[\)\]])*[\.\s]*$/i;

const SCENE_NUMBER_PREFIX_RE = /^\d+[A-Z]?\s*(?=INT|EXT|I\/E|EST)/i;

const CHAR_EXTENSION_RE = /(?:\s*\([^)]*\))+\s*$/i;

const PARENTHETICAL_RE = /^\s*\(.*\)\s*$/;
const TRANSITION_RE = /^[A-Z\s]+TO:\s*$/;

const INT_EXT_MAP: Record<string, string> = {
  "INT": "Interior", "EXT": "Exterior", "I/E": "Int/Ext",
  "INT./EXT": "Int/Ext", "INT/EXT": "Int/Ext",
  "EXT./INT": "Int/Ext", "EXT/INT": "Int/Ext",
  "EST": "Exterior",
};

const TIME_MAP: Record<string, string> = {
  "DAY": "Midday", "NIGHT": "Night", "MORNING": "Morning",
  "EVENING": "Dusk", "DAWN": "Dawn", "DUSK": "Dusk",
  "AFTERNOON": "Afternoon", "MIDDAY": "Midday",
  "CONTINUOUS": "Continuous", "LATER": "Continuous",
  "MOMENTS LATER": "Continuous", "MOMENT LATER": "Continuous",
  "SAME TIME": "Continuous",
  "TWILIGHT": "Dusk",
  "SUNSET": "Dusk",
  "SUNRISE": "Dawn",
  "PRESENT DAY": "",
  "PRESENT": "",
  "EARLY MORNING": "Dawn",
};

const NOT_CHARACTERS = new Set([
  "THE END", "FADE OUT", "FADE IN", "FADE TO BLACK", "FADE TO WHITE",
  "CUT TO", "SMASH CUT TO", "MATCH CUT TO", "JUMP CUT TO",
  "DISSOLVE TO", "WIPE TO", "IRIS IN", "IRIS OUT",
  "TITLE CARD", "SUPER", "SUPERIMPOSE", "CHYRON",
  "INTERCUT", "BACK TO SCENE", "CONTINUOUS", "LATER",
  "END CREDITS", "OPENING CREDITS", "CREDITS",
  "MONTAGE", "END MONTAGE", "SERIES OF SHOTS", "END SERIES",
  "FLASHBACK", "END FLASHBACK", "DREAM SEQUENCE", "END DREAM",
  "V.O.", "O.S.", "O.C.", "CONT'D", "PRE-LAP", "BEGIN", "END",
  "OMITTED", "CONTINUED", "MORE",
  "BLACK", "WHITE", "SILENCE", "DARKNESS", "MUSIC", "PAUSE",
  "OVER BLACK", "BACK ON DON",
  "MOMENTS LATER", "SOMETIME LATER", "YEARS LATER",
  "BEEP BEEP", "RING RING", "BANG BANG",
]);

const GROUP_CUE_PATTERNS = /'S\s+FAMILY|'S\s+FAMILY|'S\s+GROUP|'S\s+CREW|\bALL$|\bEVERYONE$|\bBOTH$|\bTOGETHER$/i;
const DUAL_CUE_SPLITTERS = [" AND ", " & ", " / "];

// =============================================================================
// Normalization
// =============================================================================

function normalizeEncoding(text: string): string {
  const replacements: Record<string, string> = {
    '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
    '\u2032': "'", '\u2035': "'",
    '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
    '\u2033': '"', '\u2036': '"',
    '\u2013': '-', '\u2014': '--', '\u2015': '--',
    '\u2026': '...',
    '\u00A0': ' ', '\u2002': ' ', '\u2003': ' ', '\u2009': ' ',
    '\u200B': '',
    '\uFFFD': "'",
    '\u0080': '',
    '\u0091': "'", '\u0092': "'",
    '\u0093': '"', '\u0094': '"',
    '\u0096': '-', '\u0097': '--',
    '\u0085': '...',
  };
  return text.split('').map(c => replacements[c] || c).join('');
}

function stripFountainFormatting(text: string): string {
  return text
    .replace(/\*{3}(.+?)\*{3}/g, '$1')
    .replace(/\*{2}(.+?)\*{2}/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .trim();
}

function parseTitlePage(lines: string[]): [string, string, number] {
  let title = "";
  let author = "";
  let i = 0;
  let inTitlePage = false;

  for (i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    const kvMatch = stripped.match(/^(Title|Author|Credit|Source|Draft date|Contact|Copyright)\s*:\s*(.*)/i);

    if (kvMatch) {
      inTitlePage = true;
      const key = kvMatch[1].toLowerCase();
      const value = kvMatch[2].trim();
      if (key === "title") {
        title = stripFountainFormatting(value);
      } else if (key === "author") {
        author = stripFountainFormatting(value);
      }
    } else if (inTitlePage && stripped === "") {
      return [title, author, i + 1];
    } else if (inTitlePage && (stripped.startsWith(" ") || stripped.startsWith("\t"))) {
      // ignore multiline values for now
    } else if (!inTitlePage && i === 0) {
      return ["", "", 0];
    } else {
      break;
    }
  }

  if (inTitlePage) {
    return [title, author, i + 1];
  }
  return ["", "", 0];
}

// =============================================================================
// Core Parser
// =============================================================================

export function parse(text: string): FountainData {
  text = normalizeEncoding(text);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const [title, author, contentStart] = parseTitlePage(lines);

  const result: FountainData = {
    characters: [],
    locations: [],
    scenes: [],
    props: [],
    title,
    author
  };

  let currentScene: FountainScene | null = null;
  let currentCharName: string | null = null;
  let inDialogue = false;
  let sceneIdx = -1;

  const charLookup: Record<string, FountainCharacter> = {};
  const locationLookup: Record<string, FountainLocation> = {};
  const actionLinesByScene: Record<number, string[]> = {};
  const charFirstSeenScene: Record<string, number> = {};
  const sceneCharMap: Record<number, Record<string, FountainSceneCharacter>> = {};
  const allActionText: [number, string][] = [];
  const sceneEvents: Record<number, [string, string][]> = {};
  const dualCueNotes: { names: string[], sceneIdx: number }[] = [];

  for (let lineNum = contentStart; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].replace(/\s+$/, '');

    if (line.trim() === '') {
      if (inDialogue) {
        inDialogue = false;
        currentCharName = null;
      }
      continue;
    }

    const sceneMatch = matchSceneHeading(line);
    if (sceneMatch) {
      const [intExtStr, locationBody, timeStr] = sceneMatch;
      inDialogue = false;
      currentCharName = null;
      sceneIdx++;

      const locationName = normalizeLocationName(locationBody);
      const intExt = INT_EXT_MAP[intExtStr.toUpperCase().replace(/\./g, '')] || "";
      const timeOfDay = timeStr ? (TIME_MAP[timeStr.toUpperCase()] || "") : "";

      const sceneName = line.replace(/\[\[scf:\w+:\d+\]\]/g, '').trim().replace(/^\./, '').trim();

      currentScene = {
        scene_number: sceneIdx + 1,
        name: sceneName,
        location_name: locationName,
        int_ext: intExt,
        time_of_day: timeOfDay,
        summary: "",
        characters: []
      };
      result.scenes.push(currentScene);
      actionLinesByScene[sceneIdx] = [];
      sceneCharMap[sceneIdx] = {};
      sceneEvents[sceneIdx] = [];

      const locKey = locationName.toLowerCase();
      if (!locationLookup[locKey]) {
        const loc: FountainLocation = { name: locationName, raw_headings: [] };
        locationLookup[locKey] = loc;
        result.locations.push(loc);
      }
      locationLookup[locKey].raw_headings.push(sceneName);
      continue;
    }

    if (currentScene === null) continue;

    if (line.trimStart().startsWith('!')) {
      inDialogue = false;
      currentCharName = null;
      const actionText = line.trimStart().slice(1).trim();
      if (actionText) {
        actionLinesByScene[sceneIdx].push(actionText);
        allActionText.push([sceneIdx, actionText]);
        sceneEvents[sceneIdx].push(["action", actionText]);
      }
      continue;
    }

    const stripped = line.trim();

    if (TRANSITION_RE.test(stripped)) {
      continue;
    }

    if (!inDialogue) {
      let cueCandidate = stripped;
      cueCandidate = cueCandidate.replace(/^@/, '');
      cueCandidate = cueCandidate.replace(/\^$/, '').trim();
      cueCandidate = cueCandidate.replace(/\\\*/g, '').trim();
      cueCandidate = cueCandidate.replace(/^\*+/, '').replace(/\*+$/, '').trim();
      cueCandidate = cueCandidate.replace(/\s*\[\[[^\]]*\]\]/g, '').trim();

      cueCandidate = cueCandidate.replace(/^\(CONT'?D?\)\s*/i, '').trim();

      if (/^\(CONTINUED\)/i.test(cueCandidate)) continue;
      if (cueCandidate.toUpperCase().startsWith('CONTINUED')) continue;

      if (isCharacterCue(cueCandidate)) {
        let cleanName = cueCandidate.replace(CHAR_EXTENSION_RE, '').trim();

        if (cleanName.includes('(')) {
          cleanName = cleanName.replace(/\([^)]*\)/g, '').trim();
          cleanName = cleanName.replace(/\s{2,}/g, ' ');
        }

        if (cleanName.length >= 2 && cleanName.toUpperCase() === cleanName) {
          if (NOT_CHARACTERS.has(cleanName)) continue;

          const dualResult = checkDualCue(cleanName);
          if (dualResult) {
            dualCueNotes.push({ names: dualResult, sceneIdx });
            inDialogue = true;
            currentCharName = null;
            continue;
          }

          currentCharName = titleCaseName(cleanName);
          inDialogue = true;

          if (!charLookup[currentCharName]) {
            const char: FountainCharacter = {
              name: currentCharName,
              raw_name: cleanName,
              description: "",
              hair: "",
              build: "",
              distinguishing_features: "",
              scenes: []
            };
            charLookup[currentCharName] = char;
            result.characters.push(char);
          }

          if (!charLookup[currentCharName].scenes.includes(sceneIdx)) {
            charLookup[currentCharName].scenes.push(sceneIdx);
          }

          if (charFirstSeenScene[currentCharName] === undefined) {
            charFirstSeenScene[currentCharName] = sceneIdx;
          }

          if (!sceneCharMap[sceneIdx][currentCharName]) {
            sceneCharMap[sceneIdx][currentCharName] = {
              name: currentCharName,
              parentheticals: [],
              has_dialogue: true
            };
          }

          sceneEvents[sceneIdx].push(["cue", currentCharName]);
          continue;
        }
      }
    }

    if (inDialogue && PARENTHETICAL_RE.test(line)) {
      const parenText = stripped.replace(/^\(|\)$/g, '').trim();
      if (currentCharName && sceneCharMap[sceneIdx]?.[currentCharName]) {
        sceneCharMap[sceneIdx][currentCharName].parentheticals.push(parenText);
      }
      continue;
    }

    if (inDialogue) {
      const inlineParen = line.match(/^\s*\(([^)]+)\)/);
      if (inlineParen) {
        const parenText = inlineParen[1].trim();
        if (currentCharName && sceneCharMap[sceneIdx]?.[currentCharName]) {
          sceneCharMap[sceneIdx][currentCharName].parentheticals.push(parenText);
        }
      }
      continue;
    }

    if (stripped) {
      inDialogue = false;
      currentCharName = null;
      actionLinesByScene[sceneIdx].push(stripped);
      allActionText.push([sceneIdx, stripped]);
      sceneEvents[sceneIdx].push(["action", stripped]);
    }
  }

  // Post-processing
  result.scenes.forEach((scene, idx) => {
    const lines = actionLinesByScene[idx] || [];
    if (lines.length) {
      scene.summary = lines.join(' ');
    }
    scene.characters = Object.values(sceneCharMap[idx] || {});
  });

  dualCueNotes.forEach(note => {
    note.names.forEach(rawName => {
      const tcName = titleCaseName(rawName);
      if (charLookup[tcName]) {
        const sidx = note.sceneIdx;
        if (!charLookup[tcName].scenes.includes(sidx)) {
          charLookup[tcName].scenes.push(sidx);
        }
        if (!sceneCharMap[sidx]?.[tcName]) {
          const scLink = { name: tcName, parentheticals: [], has_dialogue: true };
          if (!sceneCharMap[sidx]) sceneCharMap[sidx] = {};
          sceneCharMap[sidx][tcName] = scLink;
          result.scenes[sidx].characters.push(scLink);
        }
      }
    });
  });

  extractCharacterDescriptions(result.characters, charFirstSeenScene, actionLinesByScene, sceneEvents);
  dedupCompoundCharacters(result, charLookup, sceneCharMap);
  result.props = extractProps(allActionText, charLookup);

  return result;
}

// =============================================================================
// Helpers
// =============================================================================

function checkDualCue(name: string): string[] | null {
  if (GROUP_CUE_PATTERNS.test(name)) {
    const baseMatch = name.match(/^(.+?)('S\s+)/i);
    if (baseMatch) return [baseMatch[1].trim()];
    return [];
  }

  for (const splitter of DUAL_CUE_SPLITTERS) {
    if (name.includes(splitter)) {
      return name.split(splitter).map(p => p.trim()).filter(p => p);
    }
  }
  return null;
}

function dedupCompoundCharacters(result: FountainData, _charLookup: Record<string, FountainCharacter>, _sceneCharMap: Record<number, Record<string, FountainSceneCharacter>>) {
  const knownNames: Record<string, FountainCharacter> = {};
  result.characters.forEach(c => {
    knownNames[c.name.toLowerCase()] = c;
  });

  const VARIANT_PREFIXES = new Set([
    'young', 'old', 'older', 'elder', 'little', 'adult', 'baby',
    'teenage', 'teen', 'child', 'dr.', 'dr', 'professor', 'prof.',
    'captain', 'officer', 'detective', 'sergeant', 'sgt.',
    'king', 'queen', 'prince', 'princess', 'lord', 'lady',
    'uncle', 'aunt', 'cousin', 'sister', 'brother',
    'mr.', 'mrs.', 'ms.', 'miss', 'sir', 'madam',
  ]);

  const toRemove: FountainCharacter[] = [];

  for (const compound of result.characters) {
    const words = compound.name.split(/\s+/);
    if (words.length < 2) continue;
    if (compound.scenes.length > 3) continue;
    if (VARIANT_PREFIXES.has(words[0].toLowerCase())) continue;

    let bestSplit: [FountainCharacter, FountainCharacter] | null = null;
    for (let splitAt = 1; splitAt < words.length; splitAt++) {
      const left = words.slice(0, splitAt).join(' ').toLowerCase();
      const right = words.slice(splitAt).join(' ').toLowerCase();

      const leftChar = knownNames[left];
      const rightChar = knownNames[right];

      if (leftChar && rightChar && leftChar !== compound && rightChar !== compound && leftChar !== rightChar) {
        if (leftChar.scenes.length >= 2 || rightChar.scenes.length >= 2) {
          bestSplit = [leftChar, rightChar];
          break;
        }
      }
    }

    if (bestSplit) {
      const [leftChar, rightChar] = bestSplit;
      compound.scenes.forEach(sidx => {
        if (!leftChar.scenes.includes(sidx)) leftChar.scenes.push(sidx);
        if (!rightChar.scenes.includes(sidx)) rightChar.scenes.push(sidx);

        [leftChar, rightChar].forEach(char => {
          if (sidx < result.scenes.length) {
            const existingNames = new Set(result.scenes[sidx].characters.map(sc => sc.name));
            if (!existingNames.has(char.name)) {
              result.scenes[sidx].characters.push({ name: char.name, parentheticals: [], has_dialogue: true });
            }
          }
        });
      });
      toRemove.push(compound);
    }
  }

  toRemove.forEach(compound => {
    const idx = result.characters.indexOf(compound);
    if (idx !== -1) result.characters.splice(idx, 1);
    delete knownNames[compound.name.toLowerCase()];
  });
}

function matchSceneHeading(line: string): [string, string, string | null] | null {
  const stripped = line.trim();
  if (!stripped || stripped === '.' || /^\.+$/.test(stripped)) return null;

  let test = stripped.replace(/\*+$/, '').replace(/\\+$/, '').trim().replace(/\*+$/, '').trim();
  test = test.replace(/^\//, '');
  test = test.replace(SCENE_NUMBER_PREFIX_RE, '');

  let m = test.match(SCENE_HEADING_RE);
  if (m) return [m[1], m[2].trim().replace(/\.+$/, ''), m[3] || null];

  if (test.startsWith('.')) {
    const inner = test.slice(1).trim();
    m = inner.match(SCENE_HEADING_RE);
    if (m) return [m[1], m[2].trim().replace(/\.+$/, ''), m[3] || null];
  }

  return null;
}

function isCharacterCue(line: string): boolean {
  const stripped = line.trim();
  if (!stripped) return false;
  if (stripped.includes('>') || stripped.includes('<') || stripped.includes('_')) return false;
  if (stripped.startsWith('"') || stripped.startsWith("'")) return false;
  if (stripped.includes('!') && !stripped.endsWith('!')) return false;
  if (stripped.endsWith('!') && stripped.split(/\s+/).length > 1) return false;
  if (/^\d/.test(stripped)) return false;
  if (/[,\!:]$/.test(stripped)) return false;

  if (stripped.endsWith('.')) {
    const cleanEnd = stripped.replace(/\.+$/, '');
    const words = cleanEnd.split(/\s+/);
    const lastWord = words[words.length - 1]?.toUpperCase() || '';
    if (!['JR', 'SR', 'DR', 'MR', 'MRS', 'MS', 'ST', 'SGT', 'CPL', 'LT', 'GEN', 'PROF'].includes(lastWord)) {
      return false;
    }
  }

  const clean = stripped.replace(CHAR_EXTENSION_RE, '').trim();
  if (!clean || clean === 'OMITTED') return false;
  if (/^(A|AN)\s/i.test(clean)) return false;
  if (matchSceneHeading(stripped)) return false;
  if (/^(EXT|INT|\/EXT|\/INT|EXT\/INT)/i.test(clean)) return false;
  if (TRANSITION_RE.test(stripped)) return false;
  if (/[A-Z\s]+TO:$/i.test(clean) || clean.endsWith('TO BLACK') || clean.endsWith('TO WHITE')) return false;

  const directionStarts = [
    'ON ', 'CLOSE ON', 'CLOSE UP', 'WIDE ON', 'ANGLE ON', 'BACK TO',
    'VARIOUS', 'INTERCUT', 'TITLE', 'SERIES OF', 'FLASHBACK',
    'UNDER ', 'AT ', 'DOWN ', 'FURTHER', 'NEARBY', 'ACROSS',
    'INSIDE ', 'OUTSIDE ', 'BEHIND ', 'ABOVE ', 'BELOW ',
    'OVER ', 'INTO ', 'ONTO ', 'THROUGH ',
    'CUT TO', 'FADE', 'DISSOLVE', 'WIPE', 'IRIS',
    'MONTAGE', 'END ', 'BEGIN ', 'TRANSITION',
    'SUPER:', 'SUPER ', 'CHYRON', 'TITLE CARD',
    'LATER', 'CONTINUOUS', 'SAME TIME',
    'WARNING', 'BRIGHT ', 'SLOW ',
  ];
  if (directionStarts.some(d => clean.startsWith(d))) return false;

  const lettersOnly = clean.replace(/[^A-Za-z]/g, '');
  if (!lettersOnly || lettersOnly !== lettersOnly.toUpperCase()) return false;
  if (clean.split(/\s+/).length > 5) return false;

  const words = clean.split(/\s+/);
  const longWords = words.filter(w => w.length > 3);
  if (longWords.length > 0 && longWords.every(w => w.endsWith('ING'))) return false;

  const actionStarts = new Set([
    'GRABBING', 'SMASHING', 'JUMPING', 'SPINNING', 'RUNNING',
    'WALKING', 'SITTING', 'STANDING', 'LOOKING', 'WATCHING',
    'PULLING', 'PUSHING', 'HOLDING', 'CARRYING', 'DRIVING',
    'FALLING', 'FLYING', 'CLIMBING', 'CRAWLING', 'SWIMMING',
    'FIRING', 'SHOOTING', 'FIGHTING', 'BREAKING', 'OPENING',
    'CLOSING', 'ENTERING', 'LEAVING', 'APPROACHING', 'REVEALING',
    'SHOWING', 'RINGS', 'WEARING', 'MOVING', 'TURNING',
    'SUDDENLY', 'MEANWHILE', 'FINALLY', 'THEN',
  ]);
  if (actionStarts.has(words[0])) return false;

  const numberStarts = new Set([
    'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT',
    'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'TWENTY', 'THIRTY',
    'FORTY', 'FIFTY', 'HUNDRED', 'THOUSAND', 'SEVERAL', 'MANY',
    'BOTH', 'HALF', 'DOZEN',
  ]);
  if (numberStarts.has(words[0]) && words.length > 1) return false;

  if (clean.length < 2) return false;

  return true;
}

function titleCaseName(name: string): string {
  return name.split(/\s+/).map(part => {
    if (part.includes('-')) {
      return part.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
    } else if (part.includes("'")) {
      const idx = part.indexOf("'");
      const before = part.slice(0, idx + 1);
      const after = part.slice(idx + 1);
      const capBefore = before.charAt(0).toUpperCase() + before.slice(1).toLowerCase();
      if (after.toUpperCase() === 'S') {
        return capBefore + 's';
      } else if (after.length > 1) {
        return capBefore + after.charAt(0).toUpperCase() + after.slice(1).toLowerCase();
      } else {
        return capBefore + after.toLowerCase();
      }
    } else {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
  }).join(' ');
}

function normalizeLocationName(raw: string): string {
  let name = raw.trim();

  for (let i = 0; i < 3; i++) {
    const prev = name;
    name = name.replace(/^\/(?:INT|EXT)\.?\s*/i, '');
    name = name.replace(/\s*\/\s*(?:INT|EXT)\.?\s+.*$/i, '');
    name = name.replace(/\s*\([^)]*\)\s*$/g, '');
    name = name.replace(/\s*\[[^\]]*\]\s*$/g, '');
    name = name.replace(/\s*\.?\s*(?:B\+W|B&W)\s*$/i, '');

    const timeRegex = /\s*[-\.]\s*(?:EARLY\s+)?(?:DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|AFTERNOON|MIDDAY|TWILIGHT|SUNSET|SUNRISE|CONTINUOUS|LATER|SAME TIME|MOMENTS? LATER|MANY\s+YEARS\s+AGO|YEARS\s+AGO|YEARS\s+LATER|YEARS\s+BEFORE|PRESENT\s+DAY|PRESENT)(?:\s*(?:\/|TO)\s*\w+)*(?:\s*-?\s*\[[^\]]*\])?[\.]*\s*$/i;
    name = name.replace(timeRegex, '');
    name = name.replace(/\s*-\s*(PRE|VARIOUS\s+SHOTS?|PRESENT)\s*$/i, '');
    name = name.trim().replace(/[-/\.]+$/, '').trim();

    if (name === prev) break;
  }

  return smartTitle(name || raw.trim());
}

function smartTitle(text: string): string {
  return text.split(/\s+/).map(word => {
    if (word.includes("'")) {
      const idx = word.indexOf("'");
      const before = word.slice(0, idx + 1);
      const after = word.slice(idx + 1);
      const capBefore = before.charAt(0).toUpperCase() + before.slice(1).toLowerCase();
      if (after.toUpperCase() === 'S') return capBefore + 's';
      if (after.length > 1) return capBefore + after.charAt(0).toUpperCase() + after.slice(1).toLowerCase();
      return capBefore + after.toLowerCase();
    } else if (word.includes('-')) {
      return word.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
    } else {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }).join(' ');
}

// =============================================================================
// Descriptions
// =============================================================================

const PHYSICAL_KEYWORDS = [
  'year old', 'years old', 'tall', 'short', 'hair',
  'wearing', 'wears', 'dressed', 'outfit', 'jumpsuit', 'suit',
  'shirt', 'coat', 'slim', 'heavy', 'muscular',
  'old', 'young', 'curly', 'wild', 'bold',
  'beautiful', 'handsome', 'rugged', 'scarred',
  'glasses', 'beard', 'tattoo', 'uniform',
  'flower', 'colorful',
  'crow', 'cat', 'dog', 'animal',
  'cowboy', 'attire', 'lanky', 'broad', 'shouldered',
  'styled', 'blonde', 'brunette', 'red', 'white',
];

function extractCharacterDescriptions(characters: FountainCharacter[], firstSeen: Record<string, number>, actionByScene: Record<number, string[]>, sceneEvents: Record<number, [string, string][]>) {
  characters.forEach(char => {
    const sidx = firstSeen[char.name];
    if (sidx === undefined) return;
    const events = sceneEvents[sidx] || [];

    const preceding = getPrecedingActions(char.name, events);
    let introDesc = "";
    let introScore = 0;
    preceding.forEach(line => {
      const s = scoreIntroLine(line);
      if (s > introScore) {
        introScore = s;
        introDesc = line;
      }
    });

    const actionLines = actionByScene[sidx] || [];
    const terms = getNameSearchTerms(char);
    let namedDesc = "";
    let namedScore = 0;
    actionLines.forEach(line => {
      const ll = line.toLowerCase();
      for (const [term, weight] of terms) {
        if (ll.includes(term.toLowerCase())) {
          let s = weight;
          PHYSICAL_KEYWORDS.forEach(pk => {
            if (ll.includes(pk)) s += 2;
          });
          if (s > namedScore) {
            namedScore = s;
            namedDesc = line;
          }
          break;
        }
      }
    });

    if (introDesc && introScore >= 3) {
      char.description = introDesc;
    } else if (namedDesc && namedScore >= 3) {
      char.description = namedDesc;
    } else if (introDesc) {
      char.description = introDesc;
    } else if (namedDesc) {
      char.description = namedDesc;
    }

    if (char.description) {
      extractPhysicalDetails(char, char.description);
    }
  });
}

function getPrecedingActions(charName: string, events: [string, string][]): string[] {
  let firstCueIdx = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i][0] === "cue" && events[i][1] === charName) {
      firstCueIdx = i;
      break;
    }
  }
  if (firstCueIdx === -1) return [];

  const actions: string[] = [];
  for (let i = firstCueIdx - 1; i >= 0; i--) {
    if (events[i][0] === "cue") break;
    if (events[i][0] === "action") actions.push(events[i][1]);
  }
  return actions.reverse();
}

function scoreIntroLine(line: string): number {
  const ll = line.toLowerCase();
  let score = 0;
  const pats = [
    /\b(a|an)\s+\w+.*?\b(enters|walks|sits|stands|appears|steps|comes|arrives)/,
    /\b(a|an)\s+\w+.*(year.?old|girl|boy|man|woman|crow|creature|figure)/,
    /\b(a|an)\s+([\w\s]+)(with|wearing|dressed|in\s+a)/,
  ];
  pats.forEach(pat => {
    if (pat.test(ll)) score += 3;
  });
  PHYSICAL_KEYWORDS.forEach(pk => {
    if (ll.includes(pk)) score += 1;
  });
  return score;
}

function getNameSearchTerms(char: FountainCharacter): [string, number][] {
  const terms: [string, number][] = [[char.name, 3]];
  const parts = char.name.split(/\s+/);
  if (parts.length > 1) {
    terms.push([parts[0], 2]);
    terms.push([parts[parts.length - 1], 1]);
  } else {
    terms.push([char.name, 2]);
  }
  return terms;
}

function extractPhysicalDetails(char: FountainCharacter, description: string) {
  const dl = description.toLowerCase();
  const hairMatch = dl.match(/([\w\s]+(?:curly|straight|long|short|dark|red|blonde|black|white|grey|gray|wild|braided|wavy)\s+hair|hair\s+(?:is|was)\s+[\w\s,]+)/);
  if (hairMatch) {
    char.hair = hairMatch[0].trim();
  }
  if (!char.hair) {
    const m2 = dl.match(/((?:\w+\s+){0,3}hair)/);
    if (m2) {
      const h = m2[0];
      if (['curly', 'straight', 'long', 'short', 'dark', 'red', 'blonde', 'black', 'wild', 'braided', 'wavy', 'white'].some(w => h.includes(w))) {
        char.hair = h.trim();
      }
    }
  }
}

// =============================================================================
// Props
// =============================================================================

const PROP_WHITELIST = new Set([
    'sword', 'swords', 'knife', 'knives', 'gun', 'guns', 'pistol', 'rifle',
    'shotgun', 'revolver', 'dagger', 'axe', 'bow', 'arrow', 'arrows',
    'spear', 'shield', 'grenade', 'bomb', 'blade', 'machete', 'whip',
    'club', 'mace', 'crossbow', 'cannon', 'dynamite', 'holster', 'sheath',
    'slingshot', 'musket', 'bayonet', 'missile', 'torpedo', 'warhead',
    'flamethrower', 'taser', 'baton', 'truncheon', 'katana', 'rapier',
    'halberd', 'lance', 'javelin', 'blowgun', 'mortar', 'mine', 'claymore',
    'scimitar', 'saber', 'sabre', 'staff', 'quarterstaff',
    'laser', 'blaster', 'phaser', 'raygun',
    'armor', 'armour', 'gauntlet', 'gauntlets', 'quiver',
    'hammer', 'wrench', 'screwdriver', 'saw', 'drill', 'pliers',
    'shovel', 'rake', 'pickaxe', 'crowbar', 'lever', 'pulley',
    'scissors', 'tweezers', 'clamp', 'chisel', 'vise', 'tongs',
    'telescope', 'microscope', 'compass', 'binoculars', 'magnifier',
    'stethoscope', 'thermometer', 'syringe', 'scalpel', 'eyedropper',
    'spyglass', 'magnifying', 'ruler', 'protractor', 'level',
    'plunger', 'wrench', 'hacksaw', 'file', 'rasp', 'awl',
    'trowel', 'hoe', 'sickle', 'scythe', 'shears', 'pruner',
    'soldering', 'multimeter', 'voltmeter', 'caliper',
    'stopwatch', 'metronome', 'tuner',
    'phone', 'cellphone', 'smartphone', 'laptop', 'computer', 'tablet',
    'radio', 'camera', 'television', 'monitor', 'headphones', 'earbuds', 'headset', 'microphone', 'speaker', 'recorder',
    'flashlight', 'lantern', 'torch', 'lamp', 'lightbulb', 'spotlight',
    'battery', 'batteries', 'cable', 'cables', 'keyboard', 'remote',
    'projector', 'printer', 'terminal', 'machine', 'generator',
    'antenna', 'satellite', 'drone', 'scanner', 'copier', 'shredder',
    'calculator', 'pager', 'fax', 'intercom', 'walkie-talkie',
    'megaphone', 'bullhorn', 'amplifier', 'turntable',
    'console', 'panel', 'joystick', 'throttle', 'controller',
    'communicator', 'transmitter', 'receiver', 'transponder',
    'hard drive', 'usb', 'disc', 'disk', 'floppy', 'cassette', 'cd',
    'videotape', 'projector', 'webcam', 'gopro',
    'detonator', 'timer', 'sensor', 'detector', 'radar', 'sonar',
    'bag', 'backpack', 'suitcase', 'briefcase', 'purse', 'wallet',
    'box', 'crate', 'chest', 'trunk', 'barrel', 'basket', 'bucket',
    'jar', 'bottle', 'flask', 'vial', 'canteen', 'thermos', 'jug',
    'cup', 'mug', 'goblet', 'chalice', 'tankard', 'tumbler', 'glass',
    'bowl', 'plate', 'tray', 'platter', 'pot', 'pan', 'skillet',
    'kettle', 'cauldron', 'urn', 'pitcher', 'carafe', 'decanter',
    'envelope', 'package', 'parcel', 'pouch', 'sack', 'hamper',
    'toolbox', 'lunchbox', 'cooler', 'thermos', 'canister', 'tin',
    'duffel', 'rucksack', 'knapsack', 'satchel', 'messenger',
    'holster', 'sheath', 'saucer', 'tureen', 'gravy', 'teapot', 'coffeepot',
    'chair', 'stool', 'bench', 'sofa', 'couch', 'recliner', 'throne',
    'desk', 'table', 'shelf', 'cabinet', 'dresser', 'wardrobe', 'bookcase',
    'bed', 'crib', 'hammock', 'mattress', 'pillow', 'cushion',
    'mirror', 'clock', 'watch', 'hourglass', 'chandelier',
    'easel', 'podium', 'lectern', 'altar', 'pulpit',
    'cradle', 'bassinet', 'futon', 'ottoman', 'loveseat',
    'nightstand', 'hutch', 'armoire', 'credenza', 'sideboard',
    'mantle', 'mantelpiece', 'fireplace', 'hearth',
    'letter', 'note', 'map', 'chart', 'charts', 'blueprint',
    'book', 'books', 'journal', 'diary', 'newspaper', 'magazine',
    'scroll', 'scrolls', 'parchment', 'manuscript', 'document',
    'postcard', 'telegram', 'telegraph', 'passport', 'ticket', 'receipt',
    'photograph', 'photo', 'poster', 'sign', 'banner', 'flag', 'pennant',
    'pen', 'pencil', 'quill', 'typewriter', 'notebook', 'notepad',
    'folder', 'portfolio', 'binder', 'clipboard', 'ledger', 'invoice',
    'manual', 'encyclopedia', 'encyclopedias', 'atlas', 'almanac',
    'brochure', 'pamphlet', 'flyer', 'leaflet', 'warrant', 'subpoena',
    'contract', 'deed', 'certificate', 'diploma', 'license', 'permit',
    'stapler', 'paperclip', 'thumbtack', 'pushpin',
    'whiteboard', 'blackboard', 'chalkboard', 'marker', 'eraser',
    'chalk', 'crayon', 'ink', 'inkwell',
    'evidence', 'dossier', 'report', 'file', 'files',
    'bible', 'scripture', 'grimoire', 'tome', 'codex',
    'hat', 'cap', 'helmet', 'crown', 'tiara', 'mask', 'veil',
    'gloves', 'glove', 'scarf', 'shawl', 'cloak', 'cape', 'robe',
    'jacket', 'coat', 'vest', 'suit', 'dress', 'gown', 'tunic',
    'boots', 'boot', 'shoes', 'shoe', 'sandals', 'slippers', 'sneakers',
    'belt', 'buckle', 'brooch', 'badge', 'medal', 'ribbon', 'sash',
    'necklace', 'bracelet', 'ring', 'earring', 'pendant', 'amulet',
    'locket', 'choker', 'anklet', 'cufflinks', 'tieclip', 'tiepin',
    'glasses', 'sunglasses', 'goggles', 'monocle', 'visor',
    'jersey', 'jumpsuit', 'apron', 'uniform', 'toga', 'kimono',
    'hoodie', 'sweater', 'cardigan', 'parka', 'poncho', 'raincoat',
    'tuxedo', 'blazer', 'overalls', 'coveralls', 'wetsuit',
    'corset', 'bodice', 'petticoat', 'bonnet', 'headband', 'bandana',
    'blindfold', 'gag', 'muzzle',
    'backpack', 'headphones', 'wristwatch',
    'spurs', 'chaps',
    'bread', 'sandwich', 'pizza', 'cake', 'pie', 'cookie', 'pastry',
    'apple', 'fruit', 'banana', 'orange', 'grape', 'grapes',
    'meat', 'steak', 'chicken', 'fish', 'burger', 'hotdog',
    'cheese', 'egg', 'eggs', 'bacon', 'sausage', 'ham',
    'rice', 'pasta', 'noodles', 'tortilla', 'taco', 'burrito',
    'wine', 'beer', 'whiskey', 'bourbon', 'vodka', 'rum', 'gin',
    'champagne', 'cocktail', 'martini', 'tequila', 'brandy', 'scotch',
    'coffee', 'tea', 'juice', 'milk', 'soda', 'lemonade', 'cider',
    'candy', 'chocolate', 'cereal', 'soup', 'stew', 'curry',
    'carrot', 'peanuts', 'peanut', 'pickle', 'pickles', 'snack', 'snacks',
    'donut', 'doughnut', 'muffin', 'croissant', 'bagel', 'waffle',
    'popcorn', 'pretzel', 'cracker', 'chips', 'fries', 'nachos',
    'ice', 'icecream',
    'fork', 'spoon', 'chopsticks', 'ladle', 'spatula', 'whisk',
    'blender', 'mixer', 'oven', 'stove', 'microwave', 'toaster',
    'fridge', 'refrigerator', 'freezer', 'dishwasher',
    'sink', 'faucet', 'tablecloth', 'placemat', 'coaster', 'trivet',
    'apron', 'oven mitt',
    'corkscrew', 'bottle opener', 'can opener', 'grater', 'peeler',
    'cutting board', 'rolling pin', 'colander', 'strainer', 'sieve',
    'car', 'truck', 'van', 'bus', 'taxi', 'cab', 'ambulance', 'suv',
    'motorcycle', 'bicycle', 'bike', 'scooter', 'skateboard', 'moped',
    'boat', 'ship', 'canoe', 'kayak', 'yacht', 'raft', 'trawler',
    'dinghy', 'gondola', 'ferry', 'barge', 'tugboat', 'lifeboat',
    'airplane', 'plane', 'helicopter', 'jet', 'glider', 'biplane',
    'carriage', 'wagon', 'cart', 'sled', 'sleigh', 'chariot', 'rickshaw',
    'train', 'locomotive', 'trolley', 'tram', 'streetcar', 'monorail',
    'submarine', 'rocket', 'spacecraft', 'shuttle', 'capsule', 'pod',
    'cadillac', 'flyer', 'limousine', 'limo', 'hearse', 'convertible',
    'jeep', 'humvee', 'tank', 'apc',
    'horse', 'stallion', 'mare', 'pony', 'donkey', 'mule', 'camel',
    'saddle', 'bridle', 'reins', 'stirrup', 'horseshoe',
    'anchor', 'sail', 'sails', 'mast', 'oar', 'oars', 'paddle',
    'rudder', 'helm', 'tiller', 'compass', 'sextant',
    'buoy', 'lifejacket', 'life ring',
    'harpoon', 'net', 'nets', 'fishhook', 'tackle', 'reel', 'rod',
    'guitar', 'piano', 'violin', 'fiddle', 'drum', 'drums', 'trumpet',
    'flute', 'harp', 'harmonica', 'accordion', 'banjo', 'cello',
    'saxophone', 'clarinet', 'trombone', 'organ', 'ukulele', 'mandolin',
    'tambourine', 'cymbal', 'xylophone', 'maracas', 'triangle',
    'bagpipes', 'sitar', 'lute', 'lyre', 'dulcimer', 'oboe', 'bassoon',
    'tuba', 'bugle', 'cornet', 'piccolo', 'recorder',
    'synthesizer', 'theremin', 'turntable',
    'record', 'vinyl', 'cassette', 'cd', 'tape',
    'key', 'keys', 'keycard', 'keychain', 'lock', 'padlock',
    'chain', 'chains', 'shackles', 'manacles',
    'handcuffs', 'cuffs', 'zip ties',
    'rope', 'wire', 'cord', 'twine', 'string', 'cable',
    'leash', 'lasso', 'noose', 'snare', 'trap',
    'candle', 'candles', 'candlestick', 'candelabra',
    'match', 'matches', 'lighter', 'flare',
    'broom', 'mop', 'dustpan', 'vacuum', 'duster',
    'towel', 'blanket', 'sheet', 'sheets', 'quilt', 'comforter',
    'curtain', 'curtains', 'drapes', 'blinds',
    'rug', 'carpet', 'mat', 'doormat',
    'vase', 'painting', 'sculpture', 'statue', 'figurine', 'trophy',
    'toy', 'toys', 'doll', 'puppet', 'teddy', 'action figure',
    'umbrella', 'parasol', 'cane', 'walking stick',
    'crutch', 'crutches', 'walker', 'wheelchair',
    'needle', 'thread', 'tape', 'glue', 'velcro',
    'soap', 'toothbrush', 'comb', 'brush', 'razor', 'shaver',
    'ironing board', 'hanger', 'clothespin',
    'bucket', 'pail', 'watering can', 'sprinkler',
    'picture frame',
    'doorbell', 'knocker', 'peephole',
    'thermostat', 'smoke detector',
    'ball', 'bat', 'racket', 'racquet', 'paddle',
    'puck', 'shuttlecock', 'frisbee', 'boomerang',
    'goal', 'net', 'hoop',
    'trophy', 'medal', 'cup', 'pennant',
    'whistle', 'stopwatch', 'scoreboard',
    'skateboard', 'surfboard', 'snowboard', 'skis', 'sled',
    'barbell', 'dumbbell', 'weight', 'weights',
    'kite', 'puzzle', 'chess', 'checkers', 'marbles', 'dominos',
    'dice', 'cards', 'poker',
    'fishing rod', 'reel', 'tackle',
    'tent', 'sleeping bag', 'campfire', 'firewood',
    'wand', 'crystal', 'orb', 'globe', 'medallion', 'talisman',
    'potion', 'elixir', 'antidote', 'venom', 'serum',
    'rune', 'runes', 'sigil', 'glyph',
    'artifact', 'relic', 'idol', 'totem', 'fetish',
    'scepter', 'sceptre', 'trident', 'pitchfork',
    'grimoire', 'spellbook',
    'barometer', 'astrolabe', 'sundial', 'compass',
    'portal', 'beacon', 'probe', 'hologram',
    'reactor', 'capacitor', 'conduit',
    'cryotube', 'stasis',
    'coffin', 'casket', 'cage', 'vault', 'safe', 'locker', 'mailbox',
    'crib', 'cradle', 'terrarium', 'aquarium', 'fishbowl',
    'cabinet', 'hutch', 'pantry', 'cellar',
    'dumpster', 'bin', 'trash can',
    'coin', 'coins', 'bill', 'bills', 'cash', 'check', 'cheque',
    'card', 'creditcard', 'token', 'chip',
    'diamond', 'ruby', 'emerald', 'sapphire', 'pearl', 'gem', 'gems',
    'jewel', 'jewels', 'jewelry', 'jewellery',
    'gold', 'silver', 'platinum', 'treasure',
    'ingot', 'bullion', 'nugget',
    'plant', 'flower', 'flowers', 'bouquet', 'wreath', 'garland',
    'leaf', 'leaves', 'branch', 'log', 'firewood', 'stick', 'twig',
    'feather', 'feathers', 'shell', 'shells',
    'bone', 'bones', 'skull', 'fossil', 'antler', 'antlers', 'horn',
    'seed', 'seeds', 'acorn', 'pinecone',
    'rock', 'stone', 'pebble', 'boulder', 'crystal',
    'vine', 'vines', 'root', 'roots', 'moss', 'mushroom', 'fungus',
    'cobweb', 'web', 'cocoon', 'nest', 'hive',
    'egg', 'eggs', 'fur', 'pelt', 'hide', 'leather',
    'bandage', 'gauze', 'splint', 'tourniquet', 'wheelchair', 'stretcher', 'gurney', 'crutch', 'crutches',
    'pill', 'pills', 'capsule', 'tablet', 'medicine', 'prescription',
    'inhaler', 'oxygen', 'mask', 'ventilator', 'defibrillator',
    'iv', 'drip', 'catheter', 'tubing',
    'forceps', 'clamp', 'retractor',
    'microscope', 'petri', 'beaker', 'flask', 'test tube', 'pipette',
    'centrifuge', 'spectrometer', 'oscilloscope',
    'canvas', 'paintbrush', 'palette', 'charcoal', 'pastel',
    'clay', 'pottery', 'ceramic', 'kiln', 'loom', 'spindle',
    'sketch', 'sketchbook', 'mat', 'easel', 'tripod',
    'cross', 'crucifix', 'rosary', 'prayer beads',
    'incense', 'censer', 'thurible',
    'bible', 'quran', 'torah', 'prayer book',
    'holy water', 'communion', 'chalice', 'goblet',
    'altar', 'shrine', 'icon', 'reliquary',
    'wreath', 'garland', 'laurel',
    'ladder', 'scaffolding', 'crane', 'wheelbarrow',
    'brick', 'bricks', 'cement', 'mortar', 'plaster',
    'nail', 'nails', 'screw', 'screws', 'bolt', 'bolts',
    'hinge', 'latch', 'doorknob', 'handle',
    'pipe', 'pipes', 'valve', 'gauge', 'meter',
    'fuse', 'fuses', 'circuit', 'breaker',
    'jack', 'winch', 'pulley', 'crane', 'hoist',
    'saw', 'circular saw', 'chainsaw', 'jackhammer',
    'sandpaper', 'putty', 'caulk', 'sealant',
    'tarp', 'tarpaulin',
    'tire', 'tires', 'wheel', 'wheels', 'hubcap',
    'engine', 'motor', 'hood', 'bonnet', 'bumper', 'fender',
    'windshield', 'headlight', 'headlights', 'taillight',
    'steering wheel', 'dashboard', 'gearshift', 'clutch', 'brake',
    'seatbelt', 'airbag', 'horn',
    'gas can', 'jerrycan', 'jumper cables',
    'license plate', 'rearview', 'mirror',
    'cigarette', 'cigarettes', 'cigar', 'cigars', 'pipe', 'ashtray',
    'lighter', 'matches', 'zippo', 'vape',
    'handkerchief', 'tissue', 'napkin', 'rag',
    'bandanna', 'flag', 'pennant', 'tapestry',
    'net', 'mesh', 'gauze', 'lace', 'silk', 'velvet',
    'whistle', 'bell', 'gong', 'chime', 'siren', 'alarm', 'buzzer',
    'flare', 'beacon', 'flasher',
    'semaphore', 'morse',
    'lever', 'button', 'switch', 'dial', 'knob', 'crank', 'handle',
    'pedal', 'trigger', 'latch', 'valve', 'pulley', 'piston', 'flywheel', 'turbine', 'rotor', 'propeller',
    'balloon', 'balloons', 'confetti', 'streamer', 'streamers',
    'fireworks', 'sparkler', 'sparklers',
    'binoculars', 'periscope', 'kaleidoscope',
    'seal', 'stamp', 'wax',
    'locket', 'compass', 'pocket watch',
    'dog tag', 'id', 'lanyard',
    'megaphone', 'gavel', 'scales',
    'hourglass', 'sundial', 'metronome',
    'mannequin', 'scarecrow', 'dummy',
    'stretcher', 'parachute', 'harness',
    'walkie-talkie', 'radio', 'antenna',
    'perimeter', 'barricade', 'barrier',
    'sandbag', 'sandbags',
]);

const INTERACTION_VERBS = new Set([
  'holds', 'holding', 'grabs', 'grabbing', 'picks', 'picking',
  'puts', 'putting', 'drops', 'dropping', 'carries', 'carrying',
  'wields', 'wielding', 'opens', 'opening', 'closes', 'closing',
  'uses', 'using', 'fills', 'filling', 'pours', 'pouring',
  'watering', 'leaking', 'takes', 'taking', 'pulls', 'pushing',
  'swings', 'throws', 'tosses', 'catches', 'slides', 'rolls',
  'reads', 'writes', 'signs', 'packs', 'unpacks', 'unwraps',
  'loads', 'fires', 'aims', 'drinks', 'eats', 'sips',
  'wears', 'wearing', 'removes', 'straps', 'buckles',
  'lights', 'extinguishes', 'ignites', 'smashes', 'breaks',
]);

function extractProps(actionText: [number, string][], charLookup: Record<string, FountainCharacter>): FountainProp[] {
  const candidates: Record<string, any> = {};
  const charNamesLower = new Set<string>();
  Object.values(charLookup).forEach(c => {
    charNamesLower.add(c.name.toLowerCase());
    c.name.toLowerCase().split(/\s+/).forEach(part => charNamesLower.add(part));
  });

  actionText.forEach(([sceneIdx, line]) => {
    const lineLower = line.toLowerCase();
    const words = lineLower.match(/[a-z]+(?:-[a-z]+)*/g) || [];

    words.forEach((word, i) => {
      if (!PROP_WHITELIST.has(word)) return;
      if (charNamesLower.has(word)) return;

      let determiner = null;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (['a', 'an', 'the', 'her', 'his', 'my', 'their', 'its'].includes(words[j])) {
          determiner = words[j];
          break;
        }
      }

      const hasInteraction = words.some(v => INTERACTION_VERBS.has(v));
      const propKey = word;

      if (!candidates[propKey]) {
        candidates[propKey] = {
          name: word.charAt(0).toUpperCase() + word.slice(1),
          first_scene: sceneIdx,
          contexts: [line],
          mention_count: 1,
          has_interaction: hasInteraction,
          determiners: determiner ? [determiner] : [],
        };
      } else {
        candidates[propKey].mention_count++;
        if (!candidates[propKey].contexts.includes(line)) {
          candidates[propKey].contexts.push(line);
        }
        if (hasInteraction) candidates[propKey].has_interaction = true;
        if (determiner && !candidates[propKey].determiners.includes(determiner)) {
          candidates[propKey].determiners.push(determiner);
        }
      }
    });
  });

  const props: FountainProp[] = Object.keys(candidates).map(key => {
    const info = candidates[key];
    const confidence = scorePropConfidence(info);
    return {
      name: info.name,
      confidence,
      context: info.contexts[0],
      first_scene: info.first_scene,
      mention_count: info.mention_count,
    };
  });

  const confidenceOrder = { "high": 0, "medium": 1, "low": 2 };
  props.sort((a, b) => {
    const ca = confidenceOrder[a.confidence];
    const cb = confidenceOrder[b.confidence];
    if (ca !== cb) return ca - cb;
    return b.mention_count - a.mention_count;
  });

  return props;
}

function scorePropConfidence(info: any): 'high' | 'medium' | 'low' {
  const mentions = info.mention_count;
  const hasInteraction = info.has_interaction;
  const hasThe = info.determiners.includes("the");

  if (mentions >= 3) return "high";
  if (mentions >= 2 && hasInteraction) return "high";
  if (mentions >= 2) return "medium";
  if (hasInteraction && hasThe) return "high";
  if (hasInteraction) return "medium";
  if (hasThe) return "medium";
  return "low";
}
