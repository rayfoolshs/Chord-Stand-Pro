/**
 * Helpers shared by the Ultimate Guitar import paths.
 *
 * Chord-Stand Pro never fetches Ultimate Guitar itself: their terms, robots
 * rules and browser protections block that. Everything here works on text the
 * user can already see on the page.
 */

const BRACKET_CHORD = /\[[A-G][#b]?[^\]]*\]/g;
const CHORD_LINE =
  /^\s*[A-G][#b]?(?:m|maj|min|sus|add|dim|aug|°)?\d*(?:\/[A-G][#b]?)?(?:\s+[A-G][#b]?(?:m|maj|min|sus|add|dim|aug|°)?\d*(?:\/[A-G][#b]?)?)*\s*$/gm;
const TAB_META = /^(?:key|capo|tuning)\s*[:=]/im;

export const PAYLOAD_SENTINEL = 'UG1';

export interface UgPayload {
  title: string;
  artist: string;
  body: string;
}

export function ultimateGuitarSearchUrl(query: string): string {
  return `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
    query.trim()
  )}`;
}

/**
 * Is this text plausibly a chord chart? Used only for content that arrives
 * automatically (the bookmarklet, a queued hand-off), so unrelated text is
 * never turned into an import candidate.
 */
export function looksLikeChordChart(input: string): boolean {
  const text = input.trim();
  if (text.length < 40 || text.length > 200_000) return false;

  if ((text.match(BRACKET_CHORD) ?? []).length >= 2) return true;
  if ((text.match(CHORD_LINE) ?? []).filter((line) => line.trim()).length >= 2) return true;
  return TAB_META.test(text) && text.length > 120;
}

/**
 * The bookmarklet sends a small sentinel header so title/artist survive the
 * trip even when the chart body itself starts with blank lines.
 */
export function parseUgPayload(text: string): UgPayload {
  const normalised = text.replace(/\r\n?/g, '\n');
  if (!normalised.startsWith(`${PAYLOAD_SENTINEL}\n`)) {
    return { title: '', artist: '', body: normalised.trim() };
  }

  const rest = normalised.slice(PAYLOAD_SENTINEL.length + 1);
  const split = rest.indexOf('\n\n');
  if (split === -1) return { title: '', artist: '', body: rest.trim() };

  const header = rest.slice(0, split).split('\n');
  const title = (header[0] ?? '').trim();
  const artist = (header[1] ?? '').trim();
  const body = rest.slice(split + 2).trim();
  const plausible = title.length <= 160 && artist.length <= 160;

  return plausible ? { title, artist, body } : { title: '', artist: '', body: normalised.trim() };
}

/** The app's own URL without hash or query, used as the bookmarklet target. */
export function appImportUrl(): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  return url.toString();
}