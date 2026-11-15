import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Copy, ExternalLink, FileUp, Grip, X } from 'lucide-react';
import { cleanUltimateGuitarText, parseChart } from '../lib/chartParser';
import { parseImportFiles } from '../lib/onsongImport';
import { uid } from '../lib/storage';
import { appImportUrl, looksLikeChordChart, parseUgPayload } from '../lib/ug';
import { buildUgBookmarklet } from '../lib/ugImport';
import { Setlist, Song } from '../types/chordstand';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (songs: Song[], setlists: Setlist[], message: string) => void;
  onToast: (msg: string) => void;
  incomingUg?: { text: string; token: number } | null;
}

/** Remembered across visits so returning to the import modal does not re-add the same chart. */
let lastPickedUp = '';

export const ImportModal: React.FC<ImportModalProps> = ({
  open,
  onClose,
  onImported,
  onToast,
  incomingUg,
}) => {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [ugQuery, setUgQuery] = useState('');
  const [ugNotice, setUgNotice] = useState('');
  const [clipboardNotice, setClipboardNotice] = useState(false);
  const [bookmarkletMessage, setBookmarkletMessage] = useState('');
  const lastUgTokenRef = useRef(0);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  const bookmarklet = useMemo(() => {
    if (typeof window === 'undefined') return 'javascript:void(0)';
    return buildUgBookmarklet(appImportUrl());
  }, []);

  // React strips javascript: URLs from href props, so set the bookmarklet
  // attribute directly. It is generated locally, never user supplied.
  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarklet);
  }, [bookmarklet, open]);

  /** Put chart text in the review box, keeping any title/artist header. */
  const fillFromText = (text: string, source: string) => {
    const payload = parseUgPayload(text);
    const cleaned = cleanUltimateGuitarText(payload.body);
    if (!cleaned.trim()) return;

    const meta = [
      payload.title ? `{title: ${payload.title}}` : '',
      payload.artist ? `{artist: ${payload.artist}}` : '',
    ].filter(Boolean);

    setPasteText([...meta, cleaned].join('\n'));
    setPasteTitle(payload.title);
    setUgNotice(source);
  };

  // A UG bookmarklet opens the app with the chart in the URL fragment. App.tsx
  // consumes the hash and hands the payload over; it lands in the preview below
  // and nothing is saved until the user imports it.
  useEffect(() => {
    if (!open || !incomingUg || incomingUg.token === lastUgTokenRef.current) return;
    lastUgTokenRef.current = incomingUg.token;
    fillFromText(incomingUg.text, 'Chart sent from Ultimate Guitar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incomingUg]);

  // Pick up a chart copied on an Ultimate Guitar page when the app regains
  // focus. Only text that looks like a chart is accepted, and only while the
  // review box is empty, so unrelated clipboard content is never imported.
  useEffect(() => {
    if (!open) return;
    let disposed = false;

    const attempt = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (pasteText.trim()) return;
      let text = '';
      try {
        text = (await navigator.clipboard.readText()).trim();
      } catch {
        return;
      }
      if (!text || text === lastPickedUp) return;
      if (!looksLikeChordChart(text)) return;
      lastPickedUp = text;
      fillFromText(text, 'Chart picked up from your clipboard');
      setClipboardNotice(true);
    };

    void attempt();
    document.addEventListener('visibilitychange', attempt);
    window.addEventListener('focus', attempt);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', attempt);
      window.removeEventListener('focus', attempt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pasteText]);

  if (!open) return null;

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    setBusy(true);
    setStatus('Processing files...');
    try {
      const res = await parseImportFiles(files);
      if (res.errors.length) {
        onToast(`Import error: ${res.errors[0]}`);
      }
      const msg = `Imported ${res.songs.length} song(s) and ${res.setlists.length} setlist(s).`;
      setStatus(msg);
      onImported(res.songs, res.setlists, msg);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      setPasteText(txt);
    } catch {
      onToast('Clipboard access blocked — paste directly into the box.');
    }
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setBookmarkletMessage('Copied — paste it as the bookmark’s address.');
    } catch {
      setBookmarkletMessage('Could not copy; drag the button to your bookmarks bar instead.');
    }
  };

  const searchUltimateGuitar = () => {
    window.open(
      `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
        ugQuery.trim() || 'acoustic'
      )}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handlePasteImport = () => {
    const raw = pasteText.trim();
    if (!raw) return;
    const cleaned = cleanUltimateGuitarText(raw);
    const parsed = parseChart(cleaned);
    const song: Song = {
      id: uid(),
      title: pasteTitle.trim() || parsed.meta.title || 'Imported Chart',
      artist: parsed.meta.artist || '',
      key: parsed.meta.key || '',
      capo: parsed.meta.capo || 0,
      tempo: parsed.meta.tempo || 120,
      time: parsed.meta.time || '4/4',
      content: cleaned,
      updatedAt: Date.now(),
    };
    setPasteText('');
    setPasteTitle('');
    setUgNotice('');
    setClipboardNotice(false);
    onImported([song], [], `Imported "${song.title}"`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[700px] max-h-[88vh] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-bold m-0">Import Library &amp; Charts</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border cursor-pointer"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {ugNotice && (
          <div
            className="rounded-xl border p-3 mb-3 flex items-start justify-between gap-3"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--accent)' }}
          >
            <div>
              <div className="text-sm font-semibold">{ugNotice}</div>
              <p className="text-xs mt-1 mb-0" style={{ color: 'var(--muted)' }}>
                It is in the preview below — check it over, then tap Import Pasted Chart. Nothing is
                saved until you do.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setUgNotice('');
                setClipboardNotice(false);
              }}
              className="px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer shrink-0"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div
          className="rounded-xl border p-4 mb-3"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="text-sm font-semibold mb-1">Supported Files</div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--muted)' }}>
            OnSong <code>.backup</code> / <code>.onsongarchive</code> / <code>.sqlite3</code> (SQLite3 WASM parser),{' '}
            <code>.onsong</code>, <code>.chordpro</code>, <code>.cho</code>, <code>.pro</code>, <code>.txt</code>, or
            Chord Stand Studio <code>.json</code> backups.
          </p>
          <label
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <FileUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span>{busy ? 'Importing...' : 'Choose Files to Import'}</span>
            <input
              type="file"
              multiple
              disabled={busy}
              onChange={handleFiles}
              accept=".backup,.onsongarchive,.zip,.sqlite,.sqlite3,.db,.onsong,.chordpro,.cho,.crd,.pro,.txt,.json"
              className="hidden"
            />
          </label>
          {status && (
            <div className="text-xs mt-2.5 font-medium" style={{ color: 'var(--accent-2)' }}>
              {status}
            </div>
          )}
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
            <strong className="text-sm">Paste Chart / Ultimate Guitar Cleaner</strong>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={ugQuery}
                  onChange={(e) => setUgQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchUltimateGuitar();
                  }}
                  placeholder="UG search term..."
                  className="px-2.5 py-1.5 rounded-lg border text-xs outline-none w-36"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                />
                <button
                  type="button"
                  onClick={searchUltimateGuitar}
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Search UG
                </button>
              </div>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Paste Clipboard
              </button>
            </div>
          </div>

          <input
            type="text"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Optional Song Title (auto-detected if present in chart)"
            className="w-full px-3 py-1.5 rounded-lg border text-xs mb-2 outline-none"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste ChordPro or Ultimate Guitar chart text here..."
            className="w-full min-h-[160px] rounded-lg border p-3 font-chord text-xs outline-none"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          />
          <div className="flex justify-end mt-2.5">
            <button
              type="button"
              onClick={handlePasteImport}
              disabled={!pasteText.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-45"
              style={{ background: 'var(--accent)', color: '#051019' }}
            >
              Import Pasted Chart
            </button>
          </div>
        </div>

        <div
          className="rounded-xl border p-4 mt-3"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <strong className="text-sm">Ultimate Guitar bookmarklet</strong>
          <p className="text-xs leading-relaxed mt-1 mb-2.5" style={{ color: 'var(--muted)' }}>
            Ultimate Guitar blocks automated downloads, so this widget reads the chart already open in
            your UG tab and sends it here. Nothing is saved until you tap Import Pasted Chart.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              ref={bookmarkletRef}
              href="#"
              draggable
              onClick={(e) => {
                e.preventDefault();
                void copyBookmarklet();
              }}
              title="Click to copy, or drag to your bookmarks bar — sends charts to Chord Stand Studio"
              aria-label="Send chart to Chord Stand Studio bookmarklet"
              className="px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 no-underline cursor-grab"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <Grip className="w-3.5 h-3.5" />
              Send chart to Chord Stand Studio
            </a>
            <button
              type="button"
              onClick={() => void copyBookmarklet()}
              className="px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy bookmarklet
            </button>
          </div>
          <p className="text-xs leading-relaxed mt-2 mb-0" style={{ color: 'var(--muted)' }}>
            Drag the first button to your bookmarks bar once. On a UG chart, run the bookmark and the
            chart opens here in Chord Stand Studio&apos;s preview — nothing is saved until you tap Import
            Pasted Chart. On iPad, save this page to Favourites, edit that bookmark and paste the copied
            code as its address. If you still have a bookmark from the older Chordstand app, delete it
            first: old bookmarks open Chordstand, not Chord Stand Studio.
            {bookmarkletMessage ? ` ${bookmarkletMessage}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
};
