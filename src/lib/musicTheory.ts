export const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const NOTE_MAP: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

export const FLAT_KEYS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm',
]);

export const CHORD_TOKEN_RE =
  /^[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M)?[0-9]*(?:(?:#|b)[0-9]+)*(?:\([^)]+\))?(?:\/[A-G](?:#|b)?)?$/;

export function parseNote(str: string): { root: string; idx: number; rest: string } | null {
  if (!str) return null;
  const m = str.match(/^([A-G](?:#|b)?)/);
  if (!m) return null;
  const idx = NOTE_MAP[m[1]];
  return idx === undefined ? null : { root: m[1], idx, rest: str.slice(m[1].length) };
}

export function transposeNote(rootStr: string, semi: number, preferFlats: boolean): string {
  const p = parseNote(rootStr);
  if (!p) return rootStr;
  const idx = (p.idx + (semi % 12) + 12) % 12;
  return (preferFlats ? FLAT_NOTES : SHARP_NOTES)[idx] + p.rest;
}

export function getTargetKey(origKey: string, semi: number): string {
  if (!origKey) return '';
  const m = origKey.trim().match(/^([A-G](?:#|b)?)(m?)/);
  if (!m) return origKey;
  const baseIdx = NOTE_MAP[m[1]];
  if (baseIdx === undefined) return origKey;
  const nextIdx = (baseIdx + (semi % 12) + 12) % 12;
  const isMinor = m[2] === 'm';
  const sharpC = SHARP_NOTES[nextIdx] + (isMinor ? 'm' : '');
  const flatC = FLAT_NOTES[nextIdx] + (isMinor ? 'm' : '');
  const useFlat = FLAT_KEYS.has(flatC) || ['A#', 'D#', 'G#'].includes(SHARP_NOTES[nextIdx]);
  return useFlat ? flatC : sharpC;
}

export function semitoneDiff(fromKey: string, toKey: string): number {
  const a = parseNote((fromKey || '').trim());
  const b = parseNote((toKey || '').trim());
  if (!a || !b) return 0;
  let d = b.idx - a.idx;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  return d;
}

export function transposeChord(chord: string, semi: number, targetKey: string): string {
  if (!chord || semi === 0) return chord;
  const preferFlats = FLAT_KEYS.has(targetKey);
  const parts = chord.split('/');
  const main = transposeNote(parts[0], semi, preferFlats);
  return parts[1] ? `${main}/${transposeNote(parts[1], semi, preferFlats)}` : main;
}

export function chordToNashville(chord: string, keyStr: string): string {
  if (!chord || !keyStr) return chord;
  const km = keyStr.trim().match(/^([A-G](?:#|b)?)(m?)/);
  if (!km) return chord;
  let keyIdx = NOTE_MAP[km[1]];
  if (keyIdx === undefined) return chord;
  if (km[2] === 'm') keyIdx = (keyIdx + 3) % 12;
  const DEG = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  const parts = chord.split('/');
  const p = parseNote(parts[0]);
  if (!p) return chord;
  let out = DEG[(p.idx - keyIdx + 12) % 12] + p.rest.replace(/^maj/, 'Δ');
  if (parts[1]) {
    const bp = parseNote(parts[1]);
    if (bp) out += '/' + DEG[(bp.idx - keyIdx + 12) % 12];
  }
  return out;
}

const OPEN_GUITAR: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0], C7: [-1, 3, 2, 3, 1, 0], Cmaj7: [-1, 3, 2, 0, 0, 0], Cadd9: [-1, 3, 2, 0, 3, 3],
  D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], D7: [-1, -1, 0, 2, 1, 2], Dm7: [-1, -1, 0, 2, 1, 1],
  Dmaj7: [-1, -1, 0, 2, 2, 2], Dsus4: [-1, -1, 0, 2, 3, 3], Dsus2: [-1, -1, 0, 2, 3, 0],
  E: [0, 2, 2, 1, 0, 0], Em: [0, 2, 2, 0, 0, 0], E7: [0, 2, 0, 1, 0, 0], Em7: [0, 2, 0, 0, 0, 0],
  G: [3, 2, 0, 0, 0, 3], G7: [3, 2, 0, 0, 0, 1], Gmaj7: [3, 2, 0, 0, 0, 2], Gsus4: [3, 2, 0, 0, 1, 3],
  A: [-1, 0, 2, 2, 2, 0], Am: [-1, 0, 2, 2, 1, 0], A7: [-1, 0, 2, 0, 2, 0], Am7: [-1, 0, 2, 0, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0], Asus2: [-1, 0, 2, 2, 0, 0], Asus4: [-1, 0, 2, 2, 3, 0],
};

export function getGuitarVoicing(chord: string): number[] | null {
  const clean = chord.split('/')[0].trim();
  if (OPEN_GUITAR[clean]) return OPEN_GUITAR[clean];
  const p = parseNote(clean);
  if (!p) return null;
  const q = p.rest;
  const eF = (p.idx - 4 + 12) % 12 || 12;
  const aF = (p.idx - 9 + 12) % 12 || 12;
  const useA = aF < eF && aF <= 8;
  const f = useA ? aF : eF;
  if (!useA) {
    if (q === 'm') return [f, f + 2, f + 2, f, f, f];
    if (q === '7') return [f, f + 2, f, f + 1, f, f];
    if (q === 'm7') return [f, f + 2, f, f, f, f];
    if (q === 'maj7') return [f, -1, f + 1, f + 1, f, -1];
    if (q === 'sus4') return [f, f + 2, f + 2, f + 2, f, f];
    return [f, f + 2, f + 2, f + 1, f, f];
  }
  if (q === 'm') return [-1, f, f + 2, f + 2, f + 1, f];
  if (q === '7') return [-1, f, f + 2, f, f + 2, f];
  if (q === 'm7') return [-1, f, f + 2, f, f + 1, f];
  if (q === 'maj7') return [-1, f, f + 2, f + 1, f + 2, f];
  if (q === 'sus4') return [-1, f, f + 2, f + 2, f + 3, f];
  return [-1, f, f + 2, f + 2, f + 2, f];
}

export function getPianoNotes(chord: string): number[] {
  const p = parseNote(chord.split('/')[0]);
  if (!p) return [];
  const q = p.rest;
  let iv = [0, 4, 7];
  if (q.startsWith('m7b5')) iv = [0, 3, 6, 10];
  else if (q.startsWith('maj7')) iv = [0, 4, 7, 11];
  else if (q.startsWith('m7')) iv = [0, 3, 7, 10];
  else if (q.startsWith('m')) iv = [0, 3, 7];
  else if (q.startsWith('7')) iv = [0, 4, 7, 10];
  else if (q.startsWith('sus4')) iv = [0, 5, 7];
  else if (q.startsWith('sus2')) iv = [0, 2, 7];
  else if (q.startsWith('dim')) iv = [0, 3, 6];
  else if (q.startsWith('aug')) iv = [0, 4, 8];
  else if (q.includes('add9')) iv = [0, 4, 7, 14];
  return iv.map((x) => (p.idx + x) % 12);
}
