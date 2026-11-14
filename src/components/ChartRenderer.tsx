import React from 'react';
import { chordToNashville, CHORD_TOKEN_RE, transposeChord } from '../lib/musicTheory';
import { ParsedChart, Song } from '../types/chordstand';

interface ChartRendererProps {
  song: Pick<Song, 'title' | 'artist' | 'tempo' | 'time'>;
  parsed: ParsedChart;
  targetKey: string;
  transpose: number;
  capo: number;
  nashville: boolean;
  lyricsOnly: boolean;
  note?: string;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  song,
  parsed,
  targetKey,
  transpose,
  capo,
  nashville,
  lyricsOnly,
  note,
}) => {
  const metaParts: string[] = [];
  if (targetKey) metaParts.push(`Key: ${targetKey}`);
  if (capo > 0) metaParts.push(`Capo ${capo}`);
  if (song.tempo) metaParts.push(`${song.tempo} BPM (${song.time || '4/4'})`);

  return (
    <div>
      <div
        className="chart-header-print max-w-[1140px] mx-auto mb-4 pb-3 flex justify-between items-end gap-4 flex-wrap border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight m-0 leading-tight" style={{ textWrap: 'balance' }}>
            {song.title}
          </h1>
          {song.artist && (
            <div className="text-[14px] mt-1" style={{ color: 'var(--muted)' }}>
              {song.artist}
            </div>
          )}
        </div>
        {metaParts.length > 0 && (
          <div className="flex items-center gap-2 text-[13px] font-medium tabular-nums" style={{ color: 'var(--muted)' }}>
            {metaParts.map((part, idx) => (
              <React.Fragment key={part}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span className={part.startsWith('Key:') ? 'font-chord font-bold' : ''} style={part.startsWith('Key:') ? { color: 'var(--chord)' } : undefined}>
                  {part}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {note && (
        <div
          className="stage-note-print max-w-[1140px] mx-auto mb-4 px-3.5 py-2.5 rounded-lg text-[14px] font-semibold border"
          style={{
            background: 'rgba(251, 191, 36, 0.11)',
            borderColor: 'rgba(251, 191, 36, 0.35)',
            color: 'var(--chord)',
          }}
        >
          Stage Note: {note}
        </div>
      )}

      <div className={`chart-body ${lyricsOnly ? 'lyrics-only' : ''}`}>
        {parsed.sections.map((sec) => (
          <div key={sec.id} id={sec.id} className="section-block">
            {sec.label && (
              <div
                className="section-label-print inline-block font-display text-[0.72em] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md mt-1 mb-2"
                style={{ color: 'var(--accent)', background: 'var(--section-bg)' }}
              >
                {sec.label}
              </div>
            )}
            {sec.items.map((it, itemIdx) => {
              if (it.type === 'blank') return <div key={itemIdx} className="chart-line blank" />;
              if (it.type === 'comment') {
                return (
                  <div key={itemIdx} className="italic text-[0.85em] my-1.5" style={{ color: 'var(--muted)' }}>
                    {it.text}
                  </div>
                );
              }
              return (
                <div key={itemIdx} className="chart-line">
                  {it.segs.map((seg, segIdx) => {
                    let ch = seg.chord || '';
                    if (ch && CHORD_TOKEN_RE.test(ch.split('/')[0])) {
                      ch = transposeChord(ch, transpose, targetKey);
                      if (nashville && targetKey) ch = chordToNashville(ch, targetKey);
                    }
                    return (
                      <span key={segIdx} className="seg">
                        <span className="seg-chord">{ch || ' '}</span>
                        <span className="seg-lyric">{seg.text || ''}</span>
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
