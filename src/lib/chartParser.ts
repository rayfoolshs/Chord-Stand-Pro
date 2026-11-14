import { ChartMeta, ChartSegment, ParsedChart, ParsedSection } from '../types/chordstand';
import { CHORD_TOKEN_RE } from './musicTheory';

export function isChordLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const cleaned = t.replace(/[|/%()]/g, ' ').replace(/\bx\d+\b/gi, ' ');
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  for (let i = 0; i < tokens.length; i++) {
    if (!CHORD_TOKEN_RE.test(tokens[i])) return false;
  }
  if (tokens.length === 1 && tokens[0] === 'A' && !/\s{2,}/.test(line)) return false;
  return true;
}

export function pairOverLyrics(chordLine: string, lyricLine: string): ChartSegment[] {
  const chords: Array<{ col: number; chord: string }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine)) !== null) {
    if (CHORD_TOKEN_RE.test(m[0]) || /^[|%]+$/.test(m[0])) {
      chords.push({ col: m.index, chord: m[0] });
    }
  }
  if (!chords.length) return [{ chord: '', text: lyricLine }];
  const maxLen = Math.max(lyricLine.length, chords[chords.length - 1].col + 1);
  const padded = lyricLine.padEnd(maxLen, ' ');
  const segs: ChartSegment[] = [];
  if (chords[0].col > 0) segs.push({ chord: '', text: padded.slice(0, chords[0].col) });
  for (let i = 0; i < chords.length; i++) {
    const start = chords[i].col;
    const end = i + 1 < chords.length ? chords[i + 1].col : padded.length;
    segs.push({ chord: chords[i].chord, text: padded.slice(start, end) });
  }
  return segs;
}

export function parseInlineChordPro(line: string): ChartSegment[] {
  const segs: ChartSegment[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let cur = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last || cur) segs.push({ chord: cur, text: line.slice(last, m.index) });
    cur = m[1].trim();
    last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (cur || tail || !segs.length) segs.push({ chord: cur, text: tail });
  return segs;
}

const SEC_RE =
  /^(?:\[([^\]]+)\]|((?:intro|verse|pre-?chorus|chorus|bridge|outro|solo|tag|interlude|refrain|ending|turnaround|vamp|instrumental)(?:\s*\d+)?)\s*:?\s*)$/i;
const COLON_RE = /^(title|artist|key|capo|tempo|bpm|time)\s*:\s*(.+)$/i;

export function parseChart(rawText: string): ParsedChart {
  const lines = (rawText || '').replace(/\r\n/g, '\n').split('\n');
  const meta: ChartMeta = { title: '', artist: '', key: '', capo: 0, tempo: 120, time: '4/4' };
  const sections: ParsedSection[] = [];
  let secN = 1;
  let cur: ParsedSection = { label: '', id: 'sec-0', items: [] };

  const pushSec = (lbl: string) => {
    if (cur.items.length || cur.label) sections.push(cur);
    cur = { label: lbl, id: `sec-${secN++}`, items: [] };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const dm = t.match(/^\{([^:}]+)(?::(.*))?\}$/);
    if (dm) {
      const k = dm[1].trim().toLowerCase();
      const v = (dm[2] || '').trim();
      if (k === 'title' || k === 't') meta.title = v;
      else if (k === 'artist' || k === 'subtitle' || k === 'st' || k === 'a') {
        if (!meta.artist) meta.artist = v;
      } else if (k === 'key') meta.key = v;
      else if (k === 'capo') meta.capo = parseInt(v, 10) || 0;
      else if (k === 'tempo' || k === 'bpm') meta.tempo = parseInt(v, 10) || 120;
      else if (k === 'time') meta.time = v;
      else if (k === 'comment' || k === 'c' || k === 'ci') cur.items.push({ type: 'comment', text: v });
      else if (k === 'soc' || k === 'start_of_chorus') pushSec(v || 'Chorus');
      else if (k === 'sov' || k === 'start_of_verse') pushSec(v || 'Verse');
      else if (k === 'sob' || k === 'start_of_bridge') pushSec(v || 'Bridge');
      else if (k === 'eoc' || k === 'eov' || k === 'eob') pushSec('');
      continue;
    }

    const mc = t.match(COLON_RE);
    if (mc && sections.length === 0 && cur.items.length < 3) {
      const mk = mc[1].toLowerCase();
      const mv = mc[2].trim();
      if (mk === 'title') meta.title = mv;
      else if (mk === 'artist') meta.artist = mv;
      else if (mk === 'key') meta.key = mv;
      else if (mk === 'capo') meta.capo = parseInt(mv, 10) || 0;
      else if (mk === 'tempo' || mk === 'bpm') meta.tempo = parseInt(mv, 10) || 120;
      else if (mk === 'time') meta.time = mv;
      continue;
    }

    const sm = t.match(SEC_RE);
    if (sm) {
      const lbl = (sm[1] || sm[2] || '').replace(/:$/, '').trim();
      if (!CHORD_TOKEN_RE.test(lbl)) {
        pushSec(lbl);
        continue;
      }
    }

    if (!t) {
      cur.items.push({ type: 'blank' });
      continue;
    }

    if (/\[[A-G][^\]]*\]/.test(line)) {
      cur.items.push({ type: 'line', segs: parseInlineChordPro(line) });
      continue;
    }

    if (isChordLine(line)) {
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next) && !SEC_RE.test(next.trim())) {
        cur.items.push({ type: 'line', segs: pairOverLyrics(line, next) });
        i++;
      } else {
        cur.items.push({ type: 'line', segs: pairOverLyrics(line, '') });
      }
      continue;
    }

    cur.items.push({ type: 'line', segs: [{ chord: '', text: line }] });
  }

  if (cur.items.length || cur.label) sections.push(cur);
  return { meta, sections };
}

export function convertOverLyricsToChordPro(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isChordLine(lines[i])) {
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next)) {
        out.push(
          pairOverLyrics(lines[i], next)
            .map((s) => (s.chord ? `[${s.chord}]` : '') + s.text)
            .join('')
            .trimEnd()
        );
        i++;
      } else {
        out.push(
          lines[i]
            .trim()
            .split(/\s+/)
            .map((t) => (CHORD_TOKEN_RE.test(t) ? `[${t}]` : t))
            .join(' ')
        );
      }
    } else {
      out.push(lines[i]);
    }
  }
  return out.join('\n');
}

export function cleanUltimateGuitarText(raw: string): string {
  const drop =
    /^(download|print|report bad tab|tuning:|difficulty:|author:|last edit|chords used|strumming|there is no strumming pattern|x\s*$)/i;
  const kept: string[] = [];
  let k = '';
  let c = 0;
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (/^key:\s*/i.test(t)) {
      k = t.replace(/^key:\s*/i, '').trim();
      continue;
    }
    if (/^capo:\s*/i.test(t)) {
      const m = t.match(/\d+/);
      if (m) c = parseInt(m[0], 10);
      continue;
    }
    if (drop.test(t) || /^[\u2605\u2606\d.,\s]+votes?$/i.test(t)) continue;
    kept.push(l);
  }
  return (k ? `{key: ${k}}\n` : '') + (c ? `{capo: ${c}}\n` : '') + kept.join('\n').trim();
}
