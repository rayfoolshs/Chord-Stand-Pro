import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  Columns2,
  Download,
  Edit3,
  FileText,
  Lock,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Paperclip,
  Pause,
  Play,
  Plus,
  Printer,
  Radio,
  Sun,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChartRenderer } from './components/ChartRenderer';
import { GuitarChordSvg, PianoChordSvg } from './components/ChordDiagrams';
import { DialogConfig, DialogModal } from './components/DialogModal';
import { DriveModal } from './components/DriveModal';
import { EditorPane } from './components/EditorPane';
import { ImportModal } from './components/ImportModal';
import { SyncModal } from './components/SyncModal';
import { convertOverLyricsToChordPro, parseChart } from './lib/chartParser';
import { initDriveAuth } from './lib/googleDrive';
import { CHORD_TOKEN_RE, getTargetKey, semitoneDiff, transposeChord } from './lib/musicTheory';
import { DEMO_SONGS, idbAll, idbDel, idbGet, idbPut, openDB, safeGetStorage, safeSetStorage, uid } from './lib/storage';
import {
  attachStageHeartbeat,
  isRetryablePeerError,
  isStageState,
  peerErrorType,
  reconnectDelayMs,
  stagePeerId,
  stagePeerOptions,
  tryReconnectSignalling,
} from './lib/stageSync';
import { takeUgImportFromUrl } from './lib/ugImport';
import { MediaAttachment, Setlist, Song, StageSyncPayload } from './types/chordstand';

function lerpColor(hexA: string, hexB: string, t: number): string {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

function applyDayTheme(val: number): void {
  const r = document.documentElement.style;
  r.setProperty('--bg', lerpColor('#07090d', '#f6f5f0', val));
  r.setProperty('--surface', lerpColor('#11151d', '#ffffff', val));
  r.setProperty('--surface-2', lerpColor('#191f2b', '#eceae2', val));
  r.setProperty('--border', lerpColor('#273042', '#d2cfc4', val));
  r.setProperty('--text', lerpColor('#f3f5f8', '#14171f', val));
  r.setProperty('--muted', lerpColor('#9aa5b8', '#5c6473', val));
  r.setProperty('--chord', lerpColor('#fbbf24', '#b45309', val));
  r.setProperty('--accent', lerpColor('#38bdf8', '#0369a1', val));
}

function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [songs, setSongs] = useState<Song[]>(DEMO_SONGS);
  const [setlists, setSetlists] = useState<Setlist[]>([
    {
      id: 'set-1',
      name: 'Friday Night Gig',
      items: DEMO_SONGS.map((s, idx) => ({
        songId: s.id,
        keyOverride: '',
        capoOverride: '',
        note: idx === 0 ? 'Count in 4 bars on hi-hat' : '',
      })),
    },
  ]);

  const [tab, setTab] = useState<'songs' | 'setlists'>('songs');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [activeSongId, setActiveSongId] = useState<string | null>(DEMO_SONGS[0].id);
  const [activeSetlistId, setActiveSetlistId] = useState<string>('set-1');
  const [activeSetIndex, setActiveSetIndex] = useState<number>(0);
  const [syncedSong, setSyncedSong] = useState<Song | null>(null);
  const [addSongId, setAddSongId] = useState<string>(DEMO_SONGS[0].id);

  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [nashville, setNashville] = useState(false);
  const [showDiagrams, setShowDiagrams] = useState(false);
  const [diagramInst, setDiagramInst] = useState<'guitar' | 'piano'>('guitar');
  const [cols, setCols] = useState<1 | 2>(1);
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [fontSize, setFontSize] = useState(19);
  const [locked, setLocked] = useState(false);

  const [scrolling, setScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);

  const [metroRunning, setMetroRunning] = useState(false);
  const [clickSound, setClickSound] = useState(false);
  const [metroPulse, setMetroPulse] = useState<'idle' | 'pulse' | 'accent'>('idle');
  const [beatFlash, setBeatFlash] = useState(false);

  const [dayValue, setDayValue] = useState<number>(() => parseFloat(safeGetStorage('cs_day', '0')) || 0);

  // Modals & Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [incomingUg, setIncomingUg] = useState<{ text: string; token: number } | null>(null);
  const ugTokenRef = useRef(0);
  const [syncOpen, setSyncOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Media Attachment
  const [mediaAttachment, setMediaAttachment] = useState<{
    name: string;
    type: string;
    url: string;
  } | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  // Print Packet
  const [printMode, setPrintMode] = useState<'current' | 'setlist'>('current');

  // PeerJS Sync
  const [peerMode, setPeerMode] = useState<'host' | 'client' | null>(null);
  const [hostPin, setHostPin] = useState<string | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const [joinStatus, setJoinStatus] = useState('');
  const [followScroll, setFollowScroll] = useState(true);
  const [followKey, setFollowKey] = useState(true);

  const peerRef = useRef<Peer | null>(null);
  const hostConnsRef = useRef<DataConnection[]>([]);
  const clientConnRef = useRef<DataConnection | null>(null);
  // Hotspot/Wi-Fi blip recovery: heartbeats on each channel, a backoff retry
  // loop, and the last role/PIN to rejoin with.
  const heartbeatStopsRef = useRef<Array<() => void>>([]);
  const reconnectRef = useRef<{ auto: boolean; attempts: number; timer: number | null }>({
    auto: false,
    attempts: 0,
    timer: null,
  });
  const lastSessionRef = useRef<{ role: 'host' | 'client'; pin: string } | null>(null);
  const clientLinkedRef = useRef(false);
  const tearingDownRef = useRef(false);
  const peerHandlersRef = useRef<{ host: (pin?: string) => void; join: (pin: string) => void }>({
    host: () => {},
    join: () => {},
  });
  const suppressScrollBroadcastRef = useRef(false);
  const peerScrollTimerRef = useRef<number | null>(null);
  const followScrollRef = useRef(followScroll);
  const followKeyRef = useRef(followKey);
  followScrollRef.current = followScroll;
  followKeyRef.current = followKey;

  // Google Drive Auth
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);

  // Refs for scrolling & metronome
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);
  const scrollAccumRef = useRef<number>(0);
  const scrollSpeedRef = useRef<number>(scrollSpeed);
  scrollSpeedRef.current = scrollSpeed;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const clickSoundRef = useRef(clickSound);
  clickSoundRef.current = clickSound;
  const tapTimesRef = useRef<number[]>([]);

  const showToast = useCallback((msg: string, ms = 3200) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const guardLock = useCallback(() => {
    if (locked) {
      showToast('Stage Lock is ON (tap Unlock to make changes)');
      return true;
    }
    return false;
  }, [locked, showToast]);

  // A UG bookmarklet opens the app with the chart in the URL fragment. Consume
  // it here, then open the import preview; nothing is saved until the user
  // confirms. `hashchange` also covers a bookmarklet that reuses this tab.
  useEffect(() => {
    const ingest = () => {
      const payload = takeUgImportFromUrl();
      if (!payload) return;
      ugTokenRef.current += 1;
      setIncomingUg({ text: payload, token: ugTokenRef.current });
      setImportOpen(true);
    };
    ingest();
    window.addEventListener('hashchange', ingest);
    return () => window.removeEventListener('hashchange', ingest);
  }, []);

  // Apply day/night theme and chart CSS vars
  useEffect(() => {
    applyDayTheme(dayValue);
    safeSetStorage('cs_day', dayValue);
  }, [dayValue]);

  useEffect(() => {
    document.documentElement.style.setProperty('--chart-size', `${fontSize}px`);
    document.documentElement.style.setProperty('--chart-cols', String(cols));
  }, [fontSize, cols]);

  // Hydrate IndexedDB asynchronously (never blocks initial click handlers)
  useEffect(() => {
    let mounted = true;
    (async () => {
      await openDB();
      const storedSongs = await idbAll('songs');
      const storedSetlists = await idbAll('setlists');
      if (!mounted) return;

      if (storedSongs.length > 0) {
        setSongs(storedSongs);
        setActiveSongId(storedSongs[0].id);
        setAddSongId(storedSongs[0].id);
      } else {
        for (const s of DEMO_SONGS) await idbPut('songs', s);
      }

      if (storedSetlists.length > 0) {
        setSetlists(storedSetlists);
        setActiveSetlistId(storedSetlists[0].id);
      } else {
        const defSet: Setlist = {
          id: 'set-1',
          name: 'Friday Night Gig',
          items: (storedSongs.length > 0 ? storedSongs : DEMO_SONGS).map((s, idx) => ({
            songId: s.id,
            keyOverride: '',
            capoOverride: '',
            note: idx === 0 ? 'Count in 4 bars on hi-hat' : '',
          })),
        };
        await idbPut('setlists', defSet);
        setSetlists([defSet]);
        setActiveSetlistId(defSet.id);
      }
    })();

    const unsubAuth = initDriveAuth(
      (user, token) => {
        setDriveToken(token);
        setDriveEmail(user.email || user.displayName || 'Connected');
      },
      () => {
        setDriveToken(null);
        setDriveEmail(null);
      }
    );

    return () => {
      mounted = false;
      unsubAuth();
    };
  }, []);

  const activeSong = useMemo(() => {
    if (syncedSong && activeSongId === syncedSong.id) return syncedSong;
    return songs.find((s) => s.id === activeSongId) || null;
  }, [songs, syncedSong, activeSongId]);

  const activeSetlist = useMemo(() => {
    return setlists.find((sl) => sl.id === activeSetlistId) || null;
  }, [setlists, activeSetlistId]);

  const parsedActive = useMemo(() => {
    return activeSong ? parseChart(activeSong.content) : null;
  }, [activeSong]);

  const origKey = activeSong?.key || parsedActive?.meta.key || '';
  const targetKey = getTargetKey(origKey, transpose);
  const currentBpm = activeSong?.tempo || parsedActive?.meta.tempo || 120;
  const currentTimeSig = activeSong?.time || parsedActive?.meta.time || '4/4';

  const activeStageNote = useMemo(() => {
    if (tab !== 'setlists' || !activeSetlist) return '';
    return activeSetlist.items[activeSetIndex]?.note || '';
  }, [tab, activeSetlist, activeSetIndex]);

  // Load media attachment when activeSong changes
  const loadMediaForSong = useCallback(async (songId: string | null) => {
    setMediaAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (!songId) return;
    const media = (await idbGet('media', songId)) as MediaAttachment | null;
    if (media && media.data) {
      const blob = media.data instanceof Blob ? media.data : new Blob([media.data], { type: media.type });
      const url = URL.createObjectURL(blob);
      setMediaAttachment({ name: media.name, type: media.type, url });
    }
  }, []);

  useEffect(() => {
    loadMediaForSong(activeSong?.id || null);
    return () => {
      setMediaAttachment((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, [activeSong?.id, loadMediaForSong]);

  // Build & broadcast Stage Sync payload
  const buildStagePayload = useCallback(
    (sectionId?: string | null): StageSyncPayload | null => {
      if (!activeSong) return null;
      const sc = chartScrollRef.current;
      const maxScroll = sc ? Math.max(1, sc.scrollHeight - sc.clientHeight) : 1;
      const scrollRatio = sc ? sc.scrollTop / maxScroll : 0;
      return {
        type: 'stage-state',
        song: {
          id: activeSong.id,
          title: activeSong.title,
          artist: activeSong.artist,
          key: activeSong.key,
          capo: activeSong.capo,
          tempo: activeSong.tempo,
          time: activeSong.time,
          content: activeSong.content,
        },
        transpose,
        capo,
        scrollRatio,
        sectionId: sectionId || null,
      };
    },
    [activeSong, transpose, capo]
  );

  const broadcastStageState = useCallback(
    (sectionId?: string | null) => {
      if (peerMode !== 'host' || !hostConnsRef.current.length) return;
      const payload = buildStagePayload(sectionId);
      if (!payload) return;
      hostConnsRef.current.forEach((c) => {
        if (c.open) c.send(payload);
      });
    },
    [peerMode, buildStagePayload]
  );

  // Broadcast when song/transpose/capo changes in host mode
  useEffect(() => {
    if (peerMode === 'host') {
      broadcastStageState(null);
    }
  }, [peerMode, activeSongId, transpose, capo, broadcastStageState]);

  const selectSong = useCallback(
    (id: string, setIdx?: number | null) => {
      const song = songs.find((s) => s.id === id);
      if (!song) return;
      setSyncedSong(null);
      setActiveSongId(id);
      if (setIdx !== undefined && setIdx !== null) {
        setActiveSetIndex(setIdx);
        const entry = activeSetlist?.items[setIdx];
        setTranspose(entry?.keyOverride ? semitoneDiff(song.key, entry.keyOverride) : 0);
        setCapo(
          entry && entry.capoOverride !== undefined && entry.capoOverride !== ''
            ? Number(entry.capoOverride)
            : song.capo || 0
        );
      } else {
        setTranspose(0);
        setCapo(song.capo || 0);
      }
      if (chartScrollRef.current) chartScrollRef.current.scrollTop = 0;
    },
    [songs, activeSetlist]
  );

  const stepSetlist = useCallback(
    (dir: number) => {
      if (guardLock()) return;
      if (tab === 'setlists') {
        if (!activeSetlist || !activeSetlist.items.length) return;
        const next = Math.max(0, Math.min(activeSetlist.items.length - 1, activeSetIndex + dir));
        selectSong(activeSetlist.items[next].songId, next);
      } else {
        const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));
        const idx = sorted.findIndex((s) => s.id === activeSongId);
        if (idx < 0 || !sorted.length) return;
        const next = Math.max(0, Math.min(sorted.length - 1, idx + dir));
        selectSong(sorted[next].id, null);
      }
    },
    [guardLock, tab, activeSetlist, activeSetIndex, songs, activeSongId, selectSong]
  );

  // Autoscroll loop
  useEffect(() => {
    if (!scrolling) {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      return;
    }
    lastFrameTsRef.current = performance.now();
    scrollAccumRef.current = 0;
    const step = (ts: number) => {
      const dt = (ts - lastFrameTsRef.current) / 1000;
      lastFrameTsRef.current = ts;
      scrollAccumRef.current += dt * 28 * scrollSpeedRef.current;
      if (scrollAccumRef.current >= 1 && chartScrollRef.current) {
        const px = Math.floor(scrollAccumRef.current);
        scrollAccumRef.current -= px;
        chartScrollRef.current.scrollTop += px;
      }
      scrollRafRef.current = requestAnimationFrame(step);
    };
    scrollRafRef.current = requestAnimationFrame(step);
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [scrolling]);

  // Metronome loop
  const playClickTone = useCallback((accent: boolean) => {
    if (!clickSoundRef.current) return;
    try {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContextCtor();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = accent ? 1200 : 840;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // Ignore AudioContext restriction if blocked
    }
  }, []);

  useEffect(() => {
    if (!metroRunning) {
      setMetroPulse('idle');
      setBeatFlash(false);
      return;
    }
    const bpm = Math.max(30, Math.min(260, Number(currentBpm) || 120));
    const beatsPerBar = parseInt((currentTimeSig || '4/4').split('/')[0], 10) || 4;
    let beat = 0;

    const tick = () => {
      const accent = beat % beatsPerBar === 0;
      beat++;
      setMetroPulse(accent ? 'accent' : 'pulse');
      setTimeout(() => setMetroPulse('idle'), 90);
      if (accent) {
        setBeatFlash(true);
        setTimeout(() => setBeatFlash(false), 95);
      }
      playClickTone(accent);
    };

    tick();
    const timer = window.setInterval(tick, 60000 / bpm);
    return () => window.clearInterval(timer);
  }, [metroRunning, currentBpm, currentTimeSig, playClickTone]);

  const handleTapTempo = async () => {
    const now = performance.now();
    tapTimesRef.current = tapTimesRef.current.filter((t) => now - t < 2500);
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length >= 2) {
      let sum = 0;
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        sum += tapTimesRef.current[i] - tapTimesRef.current[i - 1];
      }
      const bpm = Math.round(60000 / (sum / (tapTimesRef.current.length - 1)));
      if (activeSong && bpm >= 30 && bpm <= 260) {
        const updated = { ...activeSong, tempo: bpm, updatedAt: Date.now() };
        if (syncedSong && activeSong.id === syncedSong.id) {
          setSyncedSong(updated);
        } else {
          setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          await idbPut('songs', updated);
        }
      }
    }
  };

  // PeerJS Stage Sync Handlers
  const teardownPeer = useCallback(() => {
    tearingDownRef.current = true;
    heartbeatStopsRef.current.forEach((stop) => stop());
    heartbeatStopsRef.current = [];
    hostConnsRef.current.forEach((conn) => {
      try {
        conn.close();
      } catch {
        // Already closed.
      }
    });
    hostConnsRef.current = [];
    try {
      clientConnRef.current?.close();
    } catch {
      // Already closed.
    }
    clientConnRef.current = null;
    const peer = peerRef.current;
    peerRef.current = null;
    if (peer) {
      try {
        peer.destroy();
      } catch {
        // Already destroyed.
      }
    }
    setConnectedCount(0);
    tearingDownRef.current = false;
  }, []);

  const clearPeerReconnect = useCallback(() => {
    const state = reconnectRef.current;
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
  }, []);

  /**
   * Retry with a short exponential backoff so a hotspot blip or Wi-Fi hand-off
   * does not end the session. "Disconnect" turns the automatic retry off.
   */
  const schedulePeerReconnect = useCallback(() => {
    const state = reconnectRef.current;
    if (!state.auto || state.timer !== null) return;
    if (!lastSessionRef.current) return;

    state.attempts += 1;
    const delay = reconnectDelayMs(state.attempts);
    state.timer = window.setTimeout(() => {
      state.timer = null;
      const session = lastSessionRef.current;
      if (!reconnectRef.current.auto || !session) return;
      if (session.role === 'host') peerHandlersRef.current.host(session.pin);
      else peerHandlersRef.current.join(session.pin);
    }, delay);
  }, []);

  const stopPeerSession = useCallback(() => {
    reconnectRef.current.auto = false;
    reconnectRef.current.attempts = 0;
    clearPeerReconnect();
    lastSessionRef.current = null;
    clientLinkedRef.current = false;
    teardownPeer();
    setPeerMode(null);
    setHostPin(null);
    setJoinStatus('');
  }, [clearPeerReconnect, teardownPeer]);

  const startPeerHost = useCallback(
    (retry = 0, pinOverride?: string) => {
      teardownPeer();
      const pin = pinOverride ?? String(Math.floor(1000 + Math.random() * 9000));
      reconnectRef.current.auto = true;
      if (!pinOverride) reconnectRef.current.attempts = 0;
      clearPeerReconnect();
      lastSessionRef.current = { role: 'host', pin };

      const peer = new Peer(stagePeerId(pin), stagePeerOptions());
      peerRef.current = peer;
      setHostPin(pin);

      peer.on('open', () => {
        if (peerRef.current !== peer) return;
        setPeerMode('host');
        if (!pinOverride) showToast(`Hosting Stage Sync — PIN: ${pin}`);
      });

      peer.on('connection', (conn) => {
        if (peerRef.current !== peer) return;
        hostConnsRef.current.push(conn);
        setConnectedCount(hostConnsRef.current.length);
        heartbeatStopsRef.current.push(
          attachStageHeartbeat(conn, () => {
            try {
              conn.close();
            } catch {
              // Already closed.
            }
          })
        );
        conn.on('open', () => {
          const payload = buildStagePayload();
          if (payload) conn.send(payload);
        });
        conn.on('close', () => {
          hostConnsRef.current = hostConnsRef.current.filter((c) => c !== conn);
          setConnectedCount(hostConnsRef.current.length);
        });
      });

      // The signalling socket can drop while the data channel stays up; revive
      // it so the host keeps its PIN and can accept new devices.
      peer.on('disconnected', () => tryReconnectSignalling(peer));

      peer.on('error', (err) => {
        if (peerRef.current !== peer) return;
        const type = peerErrorType(err);
        if (type === 'unavailable-id' && retry < 4) {
          startPeerHost(retry + 1);
          return;
        }
        const message = (err as { message?: string }).message || String(err);
        if (isRetryablePeerError(type)) {
          showToast('Lost the pairing service. Reconnecting…');
          tryReconnectSignalling(peer);
          schedulePeerReconnect();
          return;
        }
        showToast(`PeerJS Error: ${message}`);
      });
    },
    [buildStagePayload, clearPeerReconnect, schedulePeerReconnect, showToast, teardownPeer]
  );

  const joinPeerHost = useCallback(
    (pin: string) => {
      if (!/^\d{4}$/.test(pin)) {
        showToast('Enter a valid 4-digit PIN.');
        return;
      }

      const reconnecting =
        reconnectRef.current.attempts > 0 || clientLinkedRef.current;
      teardownPeer();
      reconnectRef.current.auto = true;
      clearPeerReconnect();
      lastSessionRef.current = { role: 'client', pin };
      if (!reconnecting) clientLinkedRef.current = false;

      const peer = new Peer(stagePeerOptions());
      peerRef.current = peer;
      setHostPin(pin);
      setJoinStatus(reconnecting ? `Rejoining PIN ${pin}...` : `Connecting to PIN ${pin}...`);

      peer.on('disconnected', () => tryReconnectSignalling(peer));

      peer.on('open', () => {
        if (peerRef.current !== peer) return;
        const conn = peer.connect(stagePeerId(pin), { reliable: true });
        if (!conn) {
          setJoinStatus('Could not start the connection. Retrying…');
          schedulePeerReconnect();
          return;
        }
        clientConnRef.current = conn;
        heartbeatStopsRef.current.push(
          attachStageHeartbeat(conn, () => {
            try {
              conn.close();
            } catch {
              // Already closed.
            }
          })
        );

        conn.on('open', () => {
          reconnectRef.current.attempts = 0;
          clientLinkedRef.current = true;
          setPeerMode('client');
          setJoinStatus(`Connected to Stage Leader (PIN ${pin})`);
          if (!reconnecting) showToast(`Joined Stage Sync PIN ${pin}`);
        });

        conn.on('data', (raw) => {
          if (!isStageState(raw) || !raw.song) return;
          const msg: StageSyncPayload = raw;

          setSongs((currSongs) => {
            const localMatch = currSongs.find((s) => s.id === msg.song.id);
            if (localMatch) {
              setSyncedSong(null);
              setActiveSongId((prev) => {
                if (prev !== localMatch.id) showToast(`Synced: ${msg.song.title}`);
                return localMatch.id;
              });
            } else {
              const mirrored: Song = { ...msg.song, id: `synced-${msg.song.id}`, updatedAt: Date.now() };
              setSyncedSong(mirrored);
              setActiveSongId((prev) => {
                if (prev !== mirrored.id) showToast(`Synced: ${msg.song.title}`);
                return mirrored.id;
              });
            }
            return currSongs;
          });

          if (followKeyRef.current) {
            setTranspose(msg.transpose || 0);
            setCapo(msg.capo || 0);
          }

          window.setTimeout(() => {
            if (msg.sectionId) {
              const secEl = document.getElementById(msg.sectionId);
              if (secEl) secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (followScrollRef.current && typeof msg.scrollRatio === 'number' && chartScrollRef.current) {
              suppressScrollBroadcastRef.current = true;
              const sc = chartScrollRef.current;
              sc.scrollTop = msg.scrollRatio * Math.max(0, sc.scrollHeight - sc.clientHeight);
              window.setTimeout(() => {
                suppressScrollBroadcastRef.current = false;
              }, 60);
            }
          }, 40);
        });

        conn.on('close', () => {
          clientConnRef.current = null;
          if (peerRef.current !== peer || tearingDownRef.current) return;
          if (!clientLinkedRef.current && reconnectRef.current.attempts === 0) {
            setJoinStatus('Disconnected from leader.');
            return;
          }
          setJoinStatus('Connection lost. Reconnecting…');
          schedulePeerReconnect();
        });
      });

      peer.on('error', (err) => {
        if (peerRef.current !== peer) return;
        const type = peerErrorType(err);
        const message = (err as { message?: string }).message || String(err);

        if (type === 'peer-unavailable') {
          if (clientLinkedRef.current || reconnectRef.current.attempts > 0) {
            setJoinStatus('Leader not answering. Reconnecting…');
            schedulePeerReconnect();
          } else {
            setJoinStatus('No session answered that PIN.');
            showToast('No session is hosting that PIN.');
          }
          return;
        }

        if (isRetryablePeerError(type)) {
          if (clientLinkedRef.current || reconnectRef.current.attempts > 0) {
            setJoinStatus('Lost the pairing service. Reconnecting…');
            tryReconnectSignalling(peer);
            schedulePeerReconnect();
          } else {
            setJoinStatus(`Error: ${message}`);
            showToast(`Sync failed: ${message}`);
          }
          return;
        }

        setJoinStatus(`Error: ${message}`);
        showToast(`Sync failed: ${message}`);
      });
    },
    [clearPeerReconnect, schedulePeerReconnect, showToast, teardownPeer]
  );

  peerHandlersRef.current = {
    host: (pin) => startPeerHost(0, pin),
    join: (pin) => joinPeerHost(pin),
  };

  // A hotspot or Wi-Fi hand-off can fire online/offline without the data
  // channel noticing. Nudge the retry loop when the network returns.
  useEffect(() => {
    const onOnline = () => {
      if (!reconnectRef.current.auto) return;
      const session = lastSessionRef.current;
      if (session?.role !== 'client') return;
      if (clientConnRef.current?.open) return;
      reconnectRef.current.attempts = 0;
      clearPeerReconnect();
      schedulePeerReconnect();
    };
    const onOffline = () => {
      if (!lastSessionRef.current) return;
      setJoinStatus('Network lost. Reconnecting when it returns…');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [clearPeerReconnect, schedulePeerReconnect]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setScrolling((s) => !s);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        stepSetlist(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        stepSetlist(-1);
      } else if (e.key === '+' || e.key === '=') {
        if (!guardLock()) setTranspose((t) => t + 1);
      } else if (e.key === '-') {
        if (!guardLock()) setTranspose((t) => t - 1);
      } else if (e.key.toLowerCase() === 'f') {
        setFullscreen((f) => !f);
      } else if (e.key.toLowerCase() === 'l') {
        setSidebarCollapsed((c) => !c);
      } else if (e.key === 'Escape') {
        setFullscreen(false);
        setImportOpen(false);
        setSyncOpen(false);
        setDriveOpen(false);
        setDialog(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [stepSetlist, guardLock]);

  // Unique chords for diagram strip
  const diagramChords = useMemo(() => {
    if (!showDiagrams || !parsedActive) return [];
    const seen = new Set<string>();
    const chords: string[] = [];
    parsedActive.sections.forEach((sec) => {
      sec.items.forEach((it) => {
        if (it.type !== 'line') return;
        it.segs.forEach((seg) => {
          if (!seg.chord) return;
          const base = seg.chord.trim();
          if (!CHORD_TOKEN_RE.test(base.split('/')[0])) return;
          const tr = transposeChord(base, transpose, targetKey);
          if (!seen.has(tr)) {
            seen.add(tr);
            chords.push(tr);
          }
        });
      });
    });
    return chords;
  }, [showDiagrams, parsedActive, transpose, targetKey]);

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return songs
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q) ||
          (s.key || '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [songs, searchQuery]);

  const sortedSongs = useMemo(() => {
    return [...songs].sort((a, b) => a.title.localeCompare(b.title));
  }, [songs]);

  // Print handler
  const triggerPrint = () => {
    if (tab === 'setlists' && activeSetlist && activeSetlist.items.length > 0) {
      setDialog({
        mode: 'print-choice',
        setlistName: activeSetlist.name,
        songCount: activeSetlist.items.length,
        onPrintSetlist: () => {
          setPrintMode('setlist');
          window.setTimeout(() => window.print(), 60);
        },
        onPrintCurrent: () => {
          setPrintMode('current');
          window.setTimeout(() => window.print(), 60);
        },
      });
    } else if (activeSong) {
      setPrintMode('current');
      window.setTimeout(() => window.print(), 60);
    }
  };

  // Save/Delete song in Editor
  const handleSaveEditor = async (draft: Omit<Song, 'updatedAt'>) => {
    const songObj: Song = {
      ...draft,
      id: draft.id || uid(),
      updatedAt: Date.now(),
    };
    await idbPut('songs', songObj);
    setSongs((prev) => {
      const exists = prev.some((s) => s.id === songObj.id);
      return exists ? prev.map((s) => (s.id === songObj.id ? songObj : s)) : [...prev, songObj];
    });
    setEditorOpen(false);
    setSyncedSong(null);
    setActiveSongId(songObj.id);
    setTranspose(0);
    setCapo(songObj.capo || 0);
    showToast('Chart saved!');
  };

  const handleDeleteSong = (songId: string) => {
    setDialog({
      mode: 'confirm',
      title: 'Delete Chart?',
      message: 'This will permanently delete this song and any attached sheet music from your local library.',
      confirmLabel: 'Delete Chart',
      danger: true,
      onConfirm: async () => {
        await idbDel('songs', songId);
        await idbDel('media', songId);
        setSongs((prev) => {
          const next = prev.filter((s) => s.id !== songId);
          setActiveSongId(next[0]?.id || null);
          return next;
        });
        setEditorOpen(false);
        showToast('Chart deleted');
      },
    });
  };

  // Import merge helper
  const mergeImported = async (newSongs: Song[], newSetlists: Setlist[], message: string) => {
    for (const s of newSongs) await idbPut('songs', s);
    for (const sl of newSetlists) await idbPut('setlists', sl);

    setSongs((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]));
      for (const s of newSongs) map.set(s.id, s);
      return Array.from(map.values());
    });

    if (newSetlists.length) {
      setSetlists((prev) => {
        const map = new Map(prev.map((sl) => [sl.id, sl]));
        for (const sl of newSetlists) map.set(sl.id, sl);
        return Array.from(map.values());
      });
    }

    if (newSongs.length && (!activeSongId || newSongs.length === 1)) {
      setSyncedSong(null);
      setActiveSongId(newSongs[0].id);
      setTranspose(0);
      setCapo(newSongs[0].capo || 0);
    }
    showToast(message);
  };

  const updateSetlistEntry = async (idx: number, patch: Partial<Setlist['items'][number]>) => {
    if (!activeSetlist) return;
    const updatedItems = activeSetlist.items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    const updatedSetlist = { ...activeSetlist, items: updatedItems };
    await idbPut('setlists', updatedSetlist);
    setSetlists((prev) => prev.map((sl) => (sl.id === updatedSetlist.id ? updatedSetlist : sl)));
  };

  const moveSetlistEntry = async (idx: number, dir: -1 | 1) => {
    if (!activeSetlist) return;
    const target = idx + dir;
    if (target < 0 || target >= activeSetlist.items.length) return;
    const nextItems = [...activeSetlist.items];
    const tmp = nextItems[target];
    nextItems[target] = nextItems[idx];
    nextItems[idx] = tmp;
    const updatedSetlist = { ...activeSetlist, items: nextItems };
    await idbPut('setlists', updatedSetlist);
    setSetlists((prev) => prev.map((sl) => (sl.id === updatedSetlist.id ? updatedSetlist : sl)));
    if (activeSetIndex === idx) setActiveSetIndex(target);
    else if (activeSetIndex === target) setActiveSetIndex(idx);
  };

  const removeSetlistEntry = async (idx: number) => {
    if (!activeSetlist) return;
    const nextItems = activeSetlist.items.filter((_, i) => i !== idx);
    const updatedSetlist = { ...activeSetlist, items: nextItems };
    await idbPut('setlists', updatedSetlist);
    setSetlists((prev) => prev.map((sl) => (sl.id === updatedSetlist.id ? updatedSetlist : sl)));
  };

  return (
    <>
      <div className="no-print h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        {/* Top Bar */}
        {!fullscreen && (
          <header
            className="flex items-center justify-between gap-3 px-3.5 py-2 border-b flex-wrap shrink-0 z-20"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                title="Toggle Library (L)"
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <Menu className="w-3.5 h-3.5" />
                Library
              </button>
              <div className="leading-tight shrink-0">
                <div className="font-display font-extrabold text-[15px] tracking-tight whitespace-nowrap">
                  Chord Stand Studio
                </div>
                <div
                  className="text-[10px] font-medium tracking-wide whitespace-nowrap"
                  style={{ color: 'var(--muted)' }}
                >
                  Created by Ray Foo
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                title="Night Stage ↔ Daylight Paper"
              >
                <Moon className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={dayValue}
                  onChange={(e) => setDayValue(parseFloat(e.target.value))}
                  aria-label="Night Stage to Daylight Paper theme slider"
                  className="w-16 accent-sky-400 cursor-pointer"
                />
                <Sun className="w-3.5 h-3.5" style={{ color: 'var(--chord)' }} />
              </div>

              <button
                type="button"
                onClick={() => setSyncOpen(true)}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{
                    background: peerMode ? 'var(--accent-2)' : 'var(--muted)',
                    boxShadow: peerMode ? '0 0 8px var(--accent-2)' : 'none',
                  }}
                />
                <Radio className="w-3.5 h-3.5" />
                Stage Sync
              </button>

              <button
                type="button"
                onClick={() => setDriveOpen(true)}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{
                    background: driveToken ? 'var(--accent-2)' : 'var(--muted)',
                    boxShadow: driveToken ? '0 0 8px var(--accent-2)' : 'none',
                  }}
                />
                <Cloud className="w-3.5 h-3.5" />
                Google Drive
              </button>

              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Import / OnSong
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingSong(null);
                  setEditorOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <Edit3 className="w-3.5 h-3.5" />
                New
              </button>

              <button
                type="button"
                onClick={triggerPrint}
                title="Print song or setlist packet"
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>

              <a
                href={new URL('Chord-Stand-Studio-User-Manual.pdf', document.baseURI).href}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the official user manual (PDF)"
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 no-underline"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Manual
              </a>
            </div>
          </header>
        )}

        {/* Main Workspace Split */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Sidebar */}
          {!fullscreen && !sidebarCollapsed && (
            <aside
              className="w-[300px] shrink-0 border-r flex flex-col min-h-0 max-md:fixed max-md:inset-y-12 max-md:left-0 max-md:z-25"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="grid grid-cols-2 gap-1.5 p-2.5 pb-1.5">
                <button
                  type="button"
                  onClick={() => setTab('songs')}
                  className="py-1.5 rounded-lg border text-xs font-semibold cursor-pointer"
                  style={{
                    background: tab === 'songs' ? 'rgba(56, 189, 248, 0.18)' : 'var(--surface-2)',
                    borderColor: tab === 'songs' ? 'var(--accent)' : 'var(--border)',
                    color: tab === 'songs' ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  Songs ({songs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('setlists')}
                  className="py-1.5 rounded-lg border text-xs font-semibold cursor-pointer"
                  style={{
                    background: tab === 'setlists' ? 'rgba(56, 189, 248, 0.18)' : 'var(--surface-2)',
                    borderColor: tab === 'setlists' ? 'var(--accent)' : 'var(--border)',
                    color: tab === 'setlists' ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  Setlists ({setlists.length})
                </button>
              </div>

              {tab === 'songs' ? (
                <div className="px-2.5 py-1.5">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, artist, key..."
                    className="w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                  />
                </div>
              ) : (
                <>
                  <div className="px-2.5 py-1.5 flex gap-1.5">
                    <select
                      value={activeSetlistId}
                      onChange={(e) => {
                        setActiveSetlistId(e.target.value);
                        setActiveSetIndex(0);
                      }}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-xs outline-none"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                    >
                      {setlists.map((sl) => (
                        <option key={sl.id} value={sl.id}>
                          {sl.name} ({sl.items.length})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Create Setlist"
                      onClick={() =>
                        setDialog({
                          mode: 'prompt',
                          title: 'New Setlist',
                          message: 'Enter a name for the new setlist.',
                          defaultValue: 'Sunday Set',
                          confirmLabel: 'Create Setlist',
                          onConfirm: async (name) => {
                            const sl: Setlist = { id: uid(), name, items: [] };
                            await idbPut('setlists', sl);
                            setSetlists((prev) => [...prev, sl]);
                            setActiveSetlistId(sl.id);
                          },
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete Setlist"
                      onClick={() => {
                        if (setlists.length <= 1) {
                          showToast('Keep at least one setlist.');
                          return;
                        }
                        if (!activeSetlist) return;
                        setDialog({
                          mode: 'confirm',
                          title: 'Delete Setlist?',
                          message: `Delete setlist "${activeSetlist.name}"? Songs remain in your library.`,
                          confirmLabel: 'Delete Setlist',
                          danger: true,
                          onConfirm: async () => {
                            await idbDel('setlists', activeSetlist.id);
                            setSetlists((prev) => {
                              const next = prev.filter((x) => x.id !== activeSetlist.id);
                              setActiveSetlistId(next[0].id);
                              return next;
                            });
                          },
                        });
                      }}
                      className="px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer"
                      style={{
                        background: 'var(--surface-2)',
                        borderColor: 'rgba(248, 113, 113, 0.45)',
                        color: 'var(--danger)',
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="px-2.5 pb-1.5 flex gap-1.5">
                    <select
                      value={addSongId}
                      onChange={(e) => setAddSongId(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-xs outline-none"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                    >
                      {sortedSongs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeSetlist || !addSongId) return;
                        const updated: Setlist = {
                          ...activeSetlist,
                          items: [...activeSetlist.items, { songId: addSongId, keyOverride: '', capoOverride: '', note: '' }],
                        };
                        await idbPut('setlists', updated);
                        setSetlists((prev) => prev.map((sl) => (sl.id === updated.id ? updated : sl)));
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{ background: 'var(--accent)', color: '#051019' }}
                    >
                      Add
                    </button>
                  </div>
                </>
              )}

              {/* List */}
              <div className="flex-1 overflow-y-auto px-2.5 py-1.5 flex flex-col gap-1.5">
                {tab === 'songs' &&
                  filteredSongs.map((s) => {
                    const isActive = s.id === activeSongId;
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => {
                          if (!guardLock()) selectSong(s.id, null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg border flex justify-between items-center gap-2 cursor-pointer transition-colors"
                        style={{
                          background: isActive ? 'rgba(56, 189, 248, 0.14)' : 'var(--surface-2)',
                          borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold truncate">{s.title}</div>
                          <div className="text-[11px] truncate tabular-nums mt-0.5" style={{ color: 'var(--muted)' }}>
                            {s.artist || 'Unknown'} · {s.tempo || 120} BPM
                          </div>
                        </div>
                        <span className="font-chord text-xs font-bold shrink-0" style={{ color: 'var(--chord)' }}>
                          {s.key || '—'}
                        </span>
                      </button>
                    );
                  })}

                {tab === 'setlists' &&
                  activeSetlist?.items.map((item, idx) => {
                    const s = songs.find((x) => x.id === item.songId);
                    if (!s) return null;
                    const isActive = activeSongId === s.id && activeSetIndex === idx;
                    const displayKey = item.keyOverride || s.key || '—';
                    return (
                      <div
                        key={`${item.songId}-${idx}`}
                        className="p-2.5 rounded-lg border flex flex-col gap-2"
                        style={{
                          background: isActive ? 'rgba(56, 189, 248, 0.14)' : 'var(--surface-2)',
                          borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                        }}
                      >
                        <div
                          onClick={() => {
                            if (!guardLock()) selectSong(s.id, idx);
                          }}
                          className="flex justify-between items-center gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold truncate tabular-nums">
                              {idx + 1}. {s.title}
                            </div>
                            {s.artist && (
                              <div className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                                {s.artist}
                              </div>
                            )}
                          </div>
                          <span className="font-chord text-xs font-bold shrink-0" style={{ color: 'var(--chord)' }}>
                            {displayKey}
                          </span>
                        </div>

                        <div className="flex gap-1 items-center flex-wrap">
                          <input
                            type="text"
                            placeholder="Key"
                            value={item.keyOverride || ''}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              updateSetlistEntry(idx, { keyOverride: val });
                              if (activeSetIndex === idx) setTranspose(val ? semitoneDiff(s.key, val) : 0);
                            }}
                            className="w-11 px-1.5 py-1 rounded border text-[11px] outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                          />
                          <input
                            type="number"
                            min={0}
                            max={11}
                            placeholder="Capo"
                            value={item.capoOverride ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                              updateSetlistEntry(idx, { capoOverride: val });
                              if (activeSetIndex === idx) setCapo(val === '' ? s.capo || 0 : Number(val));
                            }}
                            className="w-12 px-1.5 py-1 rounded border text-[11px] outline-none tabular-nums"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                          />
                          <input
                            type="text"
                            placeholder="Stage note..."
                            value={item.note || ''}
                            onChange={(e) => updateSetlistEntry(idx, { note: e.target.value })}
                            className="flex-1 min-w-[70px] px-1.5 py-1 rounded border text-[11px] outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                          />
                          <button
                            type="button"
                            onClick={() => moveSetlistEntry(idx, -1)}
                            className="p-1 rounded border cursor-pointer"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                            aria-label="Move up"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSetlistEntry(idx, 1)}
                            className="p-1 rounded border cursor-pointer"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                            aria-label="Move down"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSetlistEntry(idx)}
                            className="p-1 rounded border cursor-pointer"
                            style={{
                              background: 'var(--surface)',
                              borderColor: 'rgba(248, 113, 113, 0.45)',
                              color: 'var(--danger)',
                            }}
                            aria-label="Remove from setlist"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Footer */}
              <div className="p-2.5 border-t flex gap-1.5" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      'chordstand-backup.json',
                      JSON.stringify({ version: 2, songs, setlists }, null, 2),
                      'application/json'
                    )
                  }
                  className="flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <Download className="w-3 h-3" />
                  Backup JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeSong) return;
                    downloadText(
                      `${(activeSong.title || 'chart').replace(/[^\w-]+/g, '_')}.chordpro`,
                      convertOverLyricsToChordPro(activeSong.content)
                    );
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <FileText className="w-3 h-3" />
                  .chordpro
                </button>
              </div>
            </aside>
          )}

          {/* Main Stage */}
          <main className={`flex-1 flex flex-col min-w-0 min-h-0 relative ${beatFlash ? 'beat-flash' : ''}`}>
            {/* Stage Bar */}
            <div
              className="flex items-center justify-between gap-2 px-3.5 py-2 border-b flex-wrap shrink-0"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <div
                  className="inline-flex items-center rounded-lg border overflow-hidden"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!guardLock()) setTranspose((t) => t - 1);
                    }}
                    className="px-2.5 py-1.5 text-xs font-bold cursor-pointer hover:opacity-80"
                    title="Transpose down (-)"
                  >
                    −
                  </button>
                  <span
                    className="px-2 text-xs font-chord font-bold min-w-[68px] text-center tabular-nums"
                    style={{ color: 'var(--chord)' }}
                  >
                    {targetKey ? `Key: ${targetKey}` : 'Key: —'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!guardLock()) setTranspose((t) => t + 1);
                    }}
                    className="px-2.5 py-1.5 text-xs font-bold cursor-pointer hover:opacity-80"
                    title="Transpose up (+)"
                  >
                    +
                  </button>
                </div>

                <div
                  className="inline-flex items-center rounded-lg border overflow-hidden"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!guardLock()) setCapo((c) => Math.max(0, c - 1));
                    }}
                    className="px-2 py-1.5 text-xs font-medium cursor-pointer"
                  >
                    Capo −
                  </button>
                  <span className="px-2 text-xs font-chord font-bold min-w-[32px] text-center tabular-nums" style={{ color: 'var(--chord)' }}>
                    {capo}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!guardLock()) setCapo((c) => Math.min(11, c + 1));
                    }}
                    className="px-2 py-1.5 text-xs font-medium cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!guardLock()) setNashville((n) => !n);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap"
                  style={{
                    background: nashville ? 'rgba(56, 189, 248, 0.2)' : 'var(--surface-2)',
                    borderColor: nashville ? 'var(--accent)' : 'var(--border)',
                    color: nashville ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  1·4·5 NNS
                </button>

                <button
                  type="button"
                  onClick={() => setShowDiagrams((d) => !d)}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap"
                  style={{
                    background: showDiagrams ? 'rgba(56, 189, 248, 0.2)' : 'var(--surface-2)',
                    borderColor: showDiagrams ? 'var(--accent)' : 'var(--border)',
                    color: showDiagrams ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  Chords SVG
                </button>

                <select
                  value={diagramInst}
                  onChange={(e) => setDiagramInst(e.target.value as 'guitar' | 'piano')}
                  className="px-2 py-1.5 rounded-lg border text-xs outline-none cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <option value="guitar">Guitar</option>
                  <option value="piano">Piano</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCols((c) => (c === 1 ? 2 : 1))}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{
                    background: cols === 2 ? 'rgba(56, 189, 248, 0.2)' : 'var(--surface-2)',
                    borderColor: cols === 2 ? 'var(--accent)' : 'var(--border)',
                    color: cols === 2 ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  2-Col
                </button>

                <button
                  type="button"
                  onClick={() => setLyricsOnly((l) => !l)}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap"
                  style={{
                    background: lyricsOnly ? 'rgba(56, 189, 248, 0.2)' : 'var(--surface-2)',
                    borderColor: lyricsOnly ? 'var(--accent)' : 'var(--border)',
                    color: lyricsOnly ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  Lyrics
                </button>

                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.max(12, s - 2))}
                  className="px-2 py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  A−
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.min(34, s + 2))}
                  className="px-2 py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  A+
                </button>

                <button
                  type="button"
                  onClick={() => setMetroRunning((m) => !m)}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap tabular-nums"
                  style={{
                    background: metroRunning ? 'rgba(56, 189, 248, 0.2)' : 'var(--surface-2)',
                    borderColor: metroRunning ? 'var(--accent)' : 'var(--border)',
                    color: metroRunning ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  <span className={`metro-dot ${metroPulse !== 'idle' ? metroPulse : ''}`} />
                  {currentBpm} BPM
                </button>

                <button
                  type="button"
                  onClick={handleTapTempo}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  Tap
                </button>

                <button
                  type="button"
                  onClick={() => setClickSound((c) => !c)}
                  title="Toggle audio metronome click"
                  className="p-1.5 rounded-lg border cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  {clickSound ? <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!guardLock() && activeSong) {
                      setEditingSong(activeSong);
                      setEditorOpen(true);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!guardLock() && activeSong) mediaInputRef.current?.click();
                  }}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  PDF/Img
                </button>

                <input
                  ref={mediaInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !activeSong) return;
                    const buf = await f.arrayBuffer();
                    await idbPut('media', {
                      songId: activeSong.id,
                      name: f.name,
                      type: f.type || 'application/octet-stream',
                      data: buf,
                    });
                    e.target.value = '';
                    await loadMediaForSong(activeSong.id);
                    showToast(`Attached ${f.name}`);
                  }}
                />

                <button
                  type="button"
                  onClick={() => setLocked((l) => !l)}
                  title="Stage Lock"
                  className="p-1.5 rounded-lg border cursor-pointer"
                  style={{
                    background: locked ? 'rgba(56, 189, 248, 0.2)' : 'var(--surface-2)',
                    borderColor: locked ? 'var(--accent)' : 'var(--border)',
                    color: locked ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setFullscreen((f) => !f)}
                  title="Fullscreen (F)"
                  className="p-1.5 rounded-lg border cursor-pointer"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Section Jump Bar */}
            {parsedActive && parsedActive.sections.some((s) => s.label) && (
              <div
                className="flex items-center gap-1.5 px-3.5 py-1.5 border-b overflow-x-auto whitespace-nowrap shrink-0"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                {parsedActive.sections
                  .filter((s) => s.label)
                  .map((sec) => (
                    <button
                      type="button"
                      key={sec.id}
                      onClick={() => {
                        const target = document.getElementById(sec.id);
                        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        broadcastStageState(sec.id);
                      }}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-md border cursor-pointer"
                      style={{
                        background: 'var(--surface-2)',
                        borderColor: 'var(--border)',
                        color: 'var(--muted)',
                      }}
                    >
                      {sec.label}
                    </button>
                  ))}
              </div>
            )}

            {/* Chord Diagrams Strip */}
            {showDiagrams && (
              <div
                className="flex items-center gap-2.5 px-3.5 py-2 border-b overflow-x-auto shrink-0"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                {diagramChords.length === 0 ? (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    No chords detected in this chart.
                  </span>
                ) : (
                  diagramChords.map((c) => (
                    <div
                      key={c}
                      className="rounded-lg border px-2 py-1.5 text-center shrink-0"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <div className="font-chord text-xs font-bold mb-1" style={{ color: 'var(--chord)' }}>
                        {c}
                      </div>
                      {diagramInst === 'piano' ? <PianoChordSvg chord={c} /> : <GuitarChordSvg chord={c} />}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Chart Viewport */}
            <div
              ref={chartScrollRef}
              onScroll={() => {
                if (suppressScrollBroadcastRef.current || peerMode !== 'host') return;
                if (peerScrollTimerRef.current) window.clearTimeout(peerScrollTimerRef.current);
                peerScrollTimerRef.current = window.setTimeout(() => {
                  broadcastStageState(null);
                }, 110);
              }}
              className="flex-1 overflow-y-auto px-6 py-5 pb-32"
            >
              {!activeSong || !parsedActive ? (
                <div
                  className="max-w-md mx-auto my-16 p-7 rounded-xl border border-dashed text-center text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  No song selected. Pick a song from the library, import an OnSong backup, or create a new chart.
                </div>
              ) : (
                <>
                  {syncedSong && activeSong.id === syncedSong.id && (
                    <div
                      className="max-w-[1140px] mx-auto mb-3 px-3.5 py-2.5 rounded-lg border flex justify-between items-center gap-3 flex-wrap text-xs"
                      style={{
                        background: 'rgba(52, 211, 153, 0.12)',
                        borderColor: 'rgba(52, 211, 153, 0.4)',
                        color: 'var(--accent-2)',
                      }}
                    >
                      <span>Mirroring live chart from Stage Leader (PIN {hostPin})</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const copy: Song = { ...syncedSong, id: uid(), updatedAt: Date.now() };
                          await idbPut('songs', copy);
                          setSongs((prev) => [...prev, copy]);
                          setSyncedSong(null);
                          setActiveSongId(copy.id);
                          showToast(`Saved "${copy.title}" to your library!`);
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer"
                        style={{
                          background: 'rgba(52, 211, 153, 0.2)',
                          borderColor: 'var(--accent-2)',
                          color: 'var(--accent-2)',
                        }}
                      >
                        Save Song to My Library
                      </button>
                    </div>
                  )}

                  {mediaAttachment && (
                    <div
                      className="max-w-[1000px] mx-auto mb-4 rounded-xl border overflow-hidden"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <div
                        className="flex justify-between items-center px-3 py-1.5 border-b text-xs"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        <span>Attached Sheet: {mediaAttachment.name}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await idbDel('media', activeSong.id);
                            await loadMediaForSong(activeSong.id);
                            showToast('Removed attachment');
                          }}
                          className="px-2 py-1 rounded border text-xs cursor-pointer"
                          style={{ borderColor: 'rgba(248, 113, 113, 0.5)', color: 'var(--danger)' }}
                        >
                          Remove Attachment
                        </button>
                      </div>
                      {mediaAttachment.type === 'application/pdf' ? (
                        <iframe src={mediaAttachment.url} title={mediaAttachment.name} className="w-full h-[76vh] border-none bg-white" />
                      ) : (
                        <img
                          src={mediaAttachment.url}
                          alt={mediaAttachment.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-auto block"
                        />
                      )}
                    </div>
                  )}

                  <ChartRenderer
                    song={activeSong}
                    parsed={parsedActive}
                    targetKey={targetKey}
                    transpose={transpose}
                    capo={capo}
                    nashville={nashville}
                    lyricsOnly={lyricsOnly}
                    note={activeStageNote}
                  />
                </>
              )}
            </div>

            {/* Floating Performance Controls */}
            <div
              className="fixed right-4 bottom-4 z-40 flex items-center gap-2 px-3 py-2 rounded-xl border shadow-2xl backdrop-blur-md"
              style={{ background: 'rgba(17, 21, 29, 0.9)', borderColor: 'var(--border)', color: '#f3f5f8' }}
            >
              <button
                type="button"
                onClick={() => stepSetlist(-1)}
                title="Previous Song (Left / PageUp)"
                className="p-1.5 rounded-lg border cursor-pointer"
                style={{ background: '#191f2b', borderColor: '#273042' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setScrolling((s) => !s)}
                title="Autoscroll (Space / P)"
                className="px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                style={{ background: 'var(--accent)', color: '#051019' }}
              >
                {scrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {scrolling ? 'Pause' : 'Scroll'}
              </button>

              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                aria-label="Autoscroll speed"
                className="w-16 accent-sky-400 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => stepSetlist(1)}
                title="Next Song (Right / PageDown)"
                className="p-1.5 rounded-lg border cursor-pointer"
                style={{ background: '#191f2b', borderColor: '#273042' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {fullscreen && (
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{ background: '#191f2b', borderColor: '#273042' }}
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Exit Full
                </button>
              )}
            </div>

            {/* Split-Pane Editor */}
            {editorOpen && (
              <EditorPane
                song={editingSong}
                onSave={handleSaveEditor}
                onDelete={handleDeleteSong}
                onCancel={() => setEditorOpen(false)}
              />
            )}
          </main>
        </div>

        {/* Modals */}
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={mergeImported}
          onToast={showToast}
          incomingUg={incomingUg}
        />

        <SyncModal
          open={syncOpen}
          onClose={() => setSyncOpen(false)}
          peerMode={peerMode}
          hostPin={hostPin}
          connectedCount={connectedCount}
          joinStatus={joinStatus}
          followScroll={followScroll}
          followKey={followKey}
          onToggleFollowScroll={setFollowScroll}
          onToggleFollowKey={setFollowKey}
          onStartHost={() => startPeerHost(0)}
          onJoinHost={joinPeerHost}
          onStopPeer={stopPeerSession}
        />

        <DriveModal
          open={driveOpen}
          onClose={() => setDriveOpen(false)}
          accessToken={driveToken}
          userEmail={driveEmail}
          songs={songs}
          setlists={setlists}
          onTokenChange={(tok, email) => {
            setDriveToken(tok);
            setDriveEmail(email);
          }}
          onRestored={(restoredSongs, restoredSetlists, name) => {
            mergeImported(
              restoredSongs,
              restoredSetlists,
              `Restored ${restoredSongs.length} songs & ${restoredSetlists.length} setlists from ${name}`
            );
          }}
          onRequestConfirm={(opts) =>
            setDialog({
              mode: 'confirm',
              title: opts.title,
              message: opts.message,
              confirmLabel: opts.confirmLabel,
              onConfirm: opts.onConfirm,
            })
          }
          onToast={showToast}
        />

        <DialogModal dialog={dialog} onClose={() => setDialog(null)} />

        {/* Toast */}
        {toast && (
          <div
            className="fixed top-14 right-4 z-90 px-3.5 py-2.5 rounded-xl border text-xs font-medium shadow-2xl max-w-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--accent)', color: 'var(--text)' }}
          >
            {toast}
          </div>
        )}
      </div>

      {/* Print Packet */}
      <div id="printPacket">
        {printMode === 'setlist' && activeSetlist ? (
          activeSetlist.items.map((item, idx) => {
            const s = songs.find((x) => x.id === item.songId);
            if (!s) return null;
            const p = parseChart(s.content);
            const oKey = s.key || p.meta.key || '';
            const tr = item.keyOverride ? semitoneDiff(oKey, item.keyOverride) : 0;
            const tKey = getTargetKey(oKey, tr);
            const c =
              item.capoOverride !== undefined && item.capoOverride !== ''
                ? Number(item.capoOverride)
                : s.capo || 0;
            return (
              <div key={`${item.songId}-${idx}`} className="print-song-page">
                <ChartRenderer
                  song={s}
                  parsed={p}
                  targetKey={tKey}
                  transpose={tr}
                  capo={c}
                  nashville={nashville}
                  lyricsOnly={lyricsOnly}
                  note={item.note}
                />
              </div>
            );
          })
        ) : activeSong && parsedActive ? (
          <div className="print-song-page">
            <ChartRenderer
              song={activeSong}
              parsed={parsedActive}
              targetKey={targetKey}
              transpose={transpose}
              capo={capo}
              nashville={nashville}
              lyricsOnly={lyricsOnly}
              note={activeStageNote}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
