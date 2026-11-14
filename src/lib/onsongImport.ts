import JSZip from 'jszip';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { Setlist, SetlistItem, Song } from '../types/chordstand';
import { parseChart } from './chartParser';
import { uid } from './storage';

let sqlEnginePromise: Promise<SqlJsStatic> | null = null;

function getSqlEngine(): Promise<SqlJsStatic> {
  if (!sqlEnginePromise) {
    sqlEnginePromise = initSqlJs({
      locateFile: () => sqlWasmUrl,
    });
  }
  return sqlEnginePromise;
}

function queryAllObjects(sqlDb: InstanceType<SqlJsStatic['Database']>, tableName: string): Record<string, unknown>[] {
  const res = sqlDb.exec(`SELECT * FROM "${tableName.replace(/"/g, '""')}"`);
  if (!res.length) return [];
  const cols = res[0].columns;
  const vals = res[0].values;
  return vals.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      obj[c] = row[i];
    });
    return obj;
  });
}

function pickCol(row: Record<string, unknown>, candidates: string[]): string {
  const lowerMap: Record<string, unknown> = {};
  Object.keys(row).forEach((k) => {
    lowerMap[k.toLowerCase()] = row[k];
  });
  for (let i = 0; i < candidates.length; i++) {
    const v = lowerMap[candidates[i].toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

export interface ImportResult {
  songs: Song[];
  setlists: Setlist[];
  errors: string[];
}

export async function importOnSongSQLite(uint8Arr: Uint8Array): Promise<{ songs: Song[]; setlists: Setlist[] }> {
  const SQL = await getSqlEngine();
  const sqlDb = new SQL.Database(uint8Arr);
  const songs: Song[] = [];
  const setlists: Setlist[] = [];

  try {
    const tblRes = sqlDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tblRes.length ? tblRes[0].values.map((r) => String(r[0])) : [];
    const findTable = (names: string[]) => tableNames.find((t) => names.includes(t.toLowerCase()));

    const songTable = findTable(['zsong', 'songs', 'song']);
    const setTable = findTable(['zset', 'sets', 'set', 'zbook']);
    const setItemTable = findTable(['zsetitem', 'zsetsong', 'setsongs', 'setitems', 'set_songs', 'zbookitem']);
    const pkToSongId = new Map<string, string>();

    if (songTable) {
      const rows = queryAllObjects(sqlDb, songTable);
      for (const r of rows) {
        const content = pickCol(r, ['ZCONTENT', 'ZLYRICS', 'ZTEXT', 'ZCHORDPRO', 'ZDATA', 'content', 'lyrics', 'text', 'body', 'chordpro']);
        const parsed = parseChart(content);
        const title = (pickCol(r, ['ZTITLE', 'ZNAME', 'title', 'name']) || parsed.meta.title || 'Untitled Song').trim();
        if (!title && !content.trim()) continue;
        const songObj: Song = {
          id: uid(),
          title,
          artist: pickCol(r, ['ZARTIST', 'ZCOMPOSER', 'ZAUTHOR', 'artist', 'composer', 'author']) || parsed.meta.artist || '',
          key: pickCol(r, ['ZKEY', 'key', 'originalKey']) || parsed.meta.key || '',
          capo: parseInt(pickCol(r, ['ZCAPO', 'capo']) || String(parsed.meta.capo || 0), 10) || 0,
          tempo: parseInt(pickCol(r, ['ZTEMPO', 'ZBPM', 'tempo', 'bpm']) || String(parsed.meta.tempo || 120), 10) || 120,
          time: pickCol(r, ['ZTIMESIGNATURE', 'ZTIME', 'timeSignature', 'time']) || parsed.meta.time || '4/4',
          content: content || `{title: ${title}}\n`,
          updatedAt: Date.now(),
        };
        songs.push(songObj);
        const pk = pickCol(r, ['Z_PK', 'id', 'ID', 'songId', 'guid', 'uuid']);
        if (pk !== '') pkToSongId.set(pk, songObj.id);
      }
    }

    if (setTable && setItemTable) {
      const sets = queryAllObjects(sqlDb, setTable);
      const items = queryAllObjects(sqlDb, setItemTable);
      for (const sr of sets) {
        const setPk = pickCol(sr, ['Z_PK', 'id', 'ID', 'setId']);
        const setName = pickCol(sr, ['ZNAME', 'ZTITLE', 'name', 'title']) || 'OnSong Setlist';
        const matched = items
          .filter((it) => pickCol(it, ['ZSET', 'ZBOOK', 'setId', 'set_id']) === setPk)
          .sort(
            (a, b) =>
              (Number(pickCol(a, ['ZORDER', 'ZINDEX', 'sortOrder', 'position'])) || 0) -
              (Number(pickCol(b, ['ZORDER', 'ZINDEX', 'sortOrder', 'position'])) || 0)
          );
        const entries: SetlistItem[] = [];
        for (const item of matched) {
          const mappedId = pkToSongId.get(pickCol(item, ['ZSONG', 'songId', 'song_id']));
          if (mappedId) {
            entries.push({
              songId: mappedId,
              keyOverride: pickCol(item, ['ZKEY', 'key']) || '',
              capoOverride: '',
              note: '',
            });
          }
        }
        if (entries.length) {
          setlists.push({ id: uid(), name: setName, items: entries });
        }
      }
    }
  } finally {
    sqlDb.close();
  }

  return { songs, setlists };
}

export async function parseImportFiles(files: FileList | File[]): Promise<ImportResult> {
  const songs: Song[] = [];
  const setlists: Setlist[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const lower = f.name.toLowerCase();
    try {
      if (lower.endsWith('.json')) {
        const data = JSON.parse(await f.text());
        const sArr: Partial<Song>[] = Array.isArray(data) ? data : data.songs || [];
        const slArr: Setlist[] = data.setlists || [];
        for (const s of sArr) {
          songs.push({
            id: s.id || uid(),
            title: s.title || 'Untitled Song',
            artist: s.artist || '',
            key: s.key || '',
            capo: s.capo || 0,
            tempo: s.tempo || 120,
            time: s.time || '4/4',
            content: s.content || '',
            updatedAt: Date.now(),
          });
        }
        for (const sl of slArr) {
          if (sl && sl.id && sl.name) setlists.push(sl);
        }
      } else if (lower.endsWith('.sqlite') || lower.endsWith('.sqlite3') || lower.endsWith('.db')) {
        const res = await importOnSongSQLite(new Uint8Array(await f.arrayBuffer()));
        songs.push(...res.songs);
        setlists.push(...res.setlists);
      } else if (lower.endsWith('.backup') || lower.endsWith('.onsongarchive') || lower.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const entries = Object.values(zip.files).filter((e) => !e.dir);
        const dbEntry =
          entries.find((e) => /onsong\.sqlite3?$/i.test(e.name)) ||
          entries.find((e) => /\.(sqlite3?|db)$/i.test(e.name));
        if (dbEntry) {
          const res = await importOnSongSQLite(await dbEntry.async('uint8array'));
          songs.push(...res.songs);
          setlists.push(...res.setlists);
        } else {
          for (const entry of entries) {
            if (/\.(onsong|chordpro|cho|crd|pro|txt)$/i.test(entry.name)) {
              const txt = await entry.async('string');
              const parsed = parseChart(txt);
              const fallbackTitle = entry.name.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Untitled';
              songs.push({
                id: uid(),
                title: parsed.meta.title || fallbackTitle,
                artist: parsed.meta.artist || '',
                key: parsed.meta.key || '',
                capo: parsed.meta.capo || 0,
                tempo: parsed.meta.tempo || 120,
                time: parsed.meta.time || '4/4',
                content: txt,
                updatedAt: Date.now(),
              });
            }
          }
        }
      } else {
        const txt = await f.text();
        const parsed = parseChart(txt);
        songs.push({
          id: uid(),
          title: parsed.meta.title || f.name.replace(/\.[^.]+$/, ''),
          artist: parsed.meta.artist || '',
          key: parsed.meta.key || '',
          capo: parsed.meta.capo || 0,
          tempo: parsed.meta.tempo || 120,
          time: parsed.meta.time || '4/4',
          content: txt,
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${f.name}: ${msg}`);
    }
  }

  return { songs, setlists, errors };
}
