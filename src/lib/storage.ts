import { MediaAttachment, Setlist, Song } from '../types/chordstand';

export function safeGetStorage(k: string, fallback: string): string {
  try {
    const v = window.localStorage.getItem(k);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

export function safeSetStorage(k: string, v: string | number): void {
  try {
    window.localStorage.setItem(k, String(v));
  } catch {
    // Fallback gracefully in private browsing / restricted storage
  }
}

export function uid(): string {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

const DB_NAME = 'chordstand_pro_v2';
let db: IDBDatabase | null = null;

interface MemStores {
  songs: Record<string, Song>;
  setlists: Record<string, Setlist>;
  media: Record<string, MediaAttachment>;
}

const memDB: MemStores = { songs: {}, setlists: {}, media: {} };

export function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 900);
    try {
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const d = (e.target as IDBOpenDBRequest).result;
        if (!d.objectStoreNames.contains('songs')) d.createObjectStore('songs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('setlists')) d.createObjectStore('setlists', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'songId' });
      };
      req.onsuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db = req.result;
        resolve(db);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      };
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

export function idbAll<K extends keyof MemStores>(store: K): Promise<Array<MemStores[K][string]>> {
  if (!db) return Promise.resolve(Object.values(memDB[store]));
  return new Promise((res) => {
    try {
      const r = db!.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => res((r.result || []) as Array<MemStores[K][string]>);
      r.onerror = () => res(Object.values(memDB[store]));
    } catch {
      res(Object.values(memDB[store]));
    }
  });
}

export function idbPut<K extends keyof MemStores>(store: K, val: MemStores[K][string]): Promise<void> {
  const key = store === 'media' ? (val as MediaAttachment).songId : (val as Song | Setlist).id;
  memDB[store][key] = val;
  if (!db) return Promise.resolve();
  return new Promise((res) => {
    try {
      const r = db!.transaction(store, 'readwrite').objectStore(store).put(val);
      r.onsuccess = () => res();
      r.onerror = () => res();
    } catch {
      res();
    }
  });
}

export function idbDel<K extends keyof MemStores>(store: K, key: string): Promise<void> {
  delete memDB[store][key];
  if (!db) return Promise.resolve();
  return new Promise((res) => {
    try {
      const r = db!.transaction(store, 'readwrite').objectStore(store).delete(key);
      r.onsuccess = () => res();
      r.onerror = () => res();
    } catch {
      res();
    }
  });
}

export function idbGet<K extends keyof MemStores>(store: K, key: string): Promise<MemStores[K][string] | null> {
  const fallback = (memDB[store][key] ?? null) as MemStores[K][string] | null;
  if (!db) return Promise.resolve(fallback);
  return new Promise((res) => {
    try {
      const r = db!.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = () => res((r.result as MemStores[K][string]) || null);
      r.onerror = () => res(fallback);
    } catch {
      res(fallback);
    }
  });
}

export const DEMO_SONGS: Song[] = [
  {
    id: 'demo-1',
    title: 'Midnight Stage Anthem',
    artist: 'Demo Band (ChordPro)',
    key: 'G',
    capo: 0,
    tempo: 118,
    time: '4/4',
    updatedAt: Date.now(),
    content: `{title: Midnight Stage Anthem}
{artist: Demo Band}
{key: G}
{tempo: 118}

[Intro]
[G]   [D/F#]   [Em7]   [Cadd9]

[Verse 1]
[G]Lights go down across the [D/F#]crowded room
[Em7]Amplifiers hum a [Cadd9]steady tune
[G]Count it in and feel the [D/F#]floorboards shake
[Cadd9]Every chord is wide a[D]wake

[Chorus]
[G]Turn it up and let the [D]night roll on
[Em7]Hold the harmony un[Cadd9]til the dawn
[G]Four-on-the-floor until the [D/F#]lights come up
[Cadd9]Raise a [D]glass, we're [G]never gonna stop

[Bridge]
[Am7]Half-time feel on the [G/B]drums right here
[Cadd9]Build it back up over [D]eight bars clear`,
  },
  {
    id: 'demo-2',
    title: 'Acoustic Porchlight',
    artist: 'Demo Trio (Over-Lyrics)',
    key: 'C',
    capo: 2,
    tempo: 92,
    time: '4/4',
    updatedAt: Date.now(),
    content: `Title: Acoustic Porchlight
Artist: Demo Trio
Key: C
Capo: 2
Tempo: 92

Verse 1:
C             G/B         Am7
Dust settles slow on the wooden floor
F             C           G
Guitar case leaning by the kitchen door

Chorus:
F             C           G         Am7
Play me that melody in three-quarter time
F             G           C
Simple three chords and a borrowed rhyme`,
  },
];
