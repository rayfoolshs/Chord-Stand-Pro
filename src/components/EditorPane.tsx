import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Trash2, X } from 'lucide-react';
import { convertOverLyricsToChordPro, parseChart } from '../lib/chartParser';
import { Song } from '../types/chordstand';
import { ChartRenderer } from './ChartRenderer';

interface EditorPaneProps {
  song: Song | null;
  onSave: (draft: Omit<Song, 'updatedAt'>) => void;
  onDelete: (songId: string) => void;
  onCancel: () => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ song, onSave, onDelete, onCancel }) => {
  const [title, setTitle] = useState(song?.title || '');
  const [artist, setArtist] = useState(song?.artist || '');
  const [key, setKey] = useState(song?.key || '');
  const [capo, setCapo] = useState(String(song?.capo ?? 0));
  const [tempo, setTempo] = useState(String(song?.tempo ?? 120));
  const [time, setTime] = useState(song?.time || '4/4');
  const [content, setContent] = useState(
    song?.content || '{title: New Song}\n{key: G}\n{tempo: 120}\n\n[Verse 1]\n[G]Start writing your [D]chords here\n'
  );

  const preview = useMemo(() => {
    const parsed = parseChart(content);
    const previewSong = {
      title: title || parsed.meta.title || 'Untitled',
      artist: artist || parsed.meta.artist || '',
      tempo: parseInt(tempo, 10) || parsed.meta.tempo || 120,
      time: time || parsed.meta.time || '4/4',
    };
    const previewKey = key || parsed.meta.key || '';
    const previewCapo = parseInt(capo, 10) || 0;
    return { parsed, previewSong, previewKey, previewCapo };
  }, [title, artist, key, capo, tempo, time, content]);

  const handleSave = () => {
    const parsed = parseChart(content);
    onSave({
      id: song?.id || '',
      title: title.trim() || parsed.meta.title || 'Untitled Song',
      artist: artist.trim() || parsed.meta.artist || '',
      key: key.trim() || parsed.meta.key || '',
      capo: parseInt(capo, 10) || 0,
      tempo: parseInt(tempo, 10) || 120,
      time: time.trim() || '4/4',
      content,
    });
  };

  return (
    <section
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <div
        className="px-4 py-2.5 border-b flex justify-between items-center gap-3 flex-wrap"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <strong className="font-display text-sm">Chart Editor</strong>
          <button
            type="button"
            onClick={() => setContent((c) => convertOverLyricsToChordPro(c))}
            className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Over-Lyrics → [ChordPro]
          </button>
          {song && (
            <button
              type="button"
              onClick={() => onDelete(song.id)}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'rgba(248, 113, 113, 0.5)',
                color: 'var(--danger)',
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--accent)', color: '#051019' }}
          >
            <Check className="w-3.5 h-3.5" />
            Save Chart
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-2 md:grid-cols-6 gap-2.5 px-4 py-2.5 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
            Artist
          </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
            Original Key
          </label>
          <input
            value={key}
            placeholder="G, Bb, Em..."
            onChange={(e) => setKey(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
            Capo
          </label>
          <input
            type="number"
            min={0}
            max={11}
            value={capo}
            onChange={(e) => setCapo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none tabular-nums"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
            Tempo (BPM)
          </label>
          <input
            type="number"
            min={30}
            max={260}
            value={tempo}
            onChange={(e) => setTempo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none tabular-nums"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>
            Time Sig
          </label>
          <input
            value={time}
            placeholder="4/4"
            onChange={(e) => setTime(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none tabular-nums"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          placeholder="Supports [G]inline ChordPro OR chords placed above lyrics..."
          className="w-full h-full resize-none border-b md:border-b-0 md:border-r p-4 outline-none font-chord text-[13.5px] leading-relaxed"
          style={{
            background: 'var(--surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
        />
        <div className="overflow-y-auto p-5">
          <ChartRenderer
            song={preview.previewSong}
            parsed={preview.parsed}
            targetKey={preview.previewKey}
            transpose={0}
            capo={preview.previewCapo}
            nashville={false}
            lyricsOnly={false}
          />
        </div>
      </div>
    </section>
  );
};
