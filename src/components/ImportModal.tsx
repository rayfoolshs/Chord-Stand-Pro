import React, { useState } from 'react';
import { ClipboardPaste, ExternalLink, FileUp, X } from 'lucide-react';
import { cleanUltimateGuitarText, parseChart } from '../lib/chartParser';
import { parseImportFiles } from '../lib/onsongImport';
import { uid } from '../lib/storage';
import { Setlist, Song } from '../types/chordstand';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (songs: Song[], setlists: Setlist[], message: string) => void;
  onToast: (msg: string) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ open, onClose, onImported, onToast }) => {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [ugQuery, setUgQuery] = useState('');

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

        <div
          className="rounded-xl border p-4 mb-3"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="text-sm font-semibold mb-1">Supported Files</div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--muted)' }}>
            OnSong <code>.backup</code> / <code>.onsongarchive</code> / <code>.sqlite3</code> (SQLite3 WASM parser),{' '}
            <code>.onsong</code>, <code>.chordpro</code>, <code>.cho</code>, <code>.pro</code>, <code>.txt</code>, or
            Chordstand <code>.json</code> backups.
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
                  placeholder="UG search term..."
                  className="px-2.5 py-1.5 rounded-lg border text-xs outline-none w-36"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                />
                <a
                  href={`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(ugQuery || 'acoustic')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 no-underline"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Search UG
                </a>
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
      </div>
    </div>
  );
};
