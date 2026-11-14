import React from 'react';
import { getGuitarVoicing, getPianoNotes } from '../lib/musicTheory';

export const GuitarChordSvg: React.FC<{ chord: string }> = ({ chord }) => {
  const frets = getGuitarVoicing(chord);
  if (!frets) return null;

  const played = frets.filter((v) => v > 0);
  const minF = played.length ? Math.min(...played) : 1;
  const maxF = played.length ? Math.max(...played) : 1;
  const base = maxF > 4 ? minF : 1;

  return (
    <svg width="74" height="82" viewBox="0 0 74 82" xmlns="http://www.w3.org/2000/svg" aria-label={`${chord} guitar chord`}>
      {base === 1 ? (
        <rect x="12" y="14" width="50" height="3.5" fill="currentColor" />
      ) : (
        <text x="1" y="28" fontSize="9" fill="var(--muted)" fontWeight="700">
          {base}fr
        </text>
      )}
      {[0, 1, 2, 3, 4].map((r) => {
        const y = 16 + r * 14;
        return <line key={r} x1="12" y1={y} x2="62" y2={y} stroke="var(--border)" strokeWidth="1.2" />;
      })}
      {[0, 1, 2, 3, 4, 5].map((s) => {
        const x = 12 + s * 10;
        const f = frets[s];
        const rel = f - base + 1;
        return (
          <g key={s}>
            <line x1={x} y1="16" x2={x} y2="72" stroke="var(--muted)" strokeWidth="1" />
            {f === -1 && (
              <text x={x} y="10" fontSize="9" textAnchor="middle" fill="var(--danger)">
                ×
              </text>
            )}
            {f === 0 && <circle cx={x} cy="7" r="2.8" fill="none" stroke="var(--accent)" strokeWidth="1.3" />}
            {f > 0 && rel >= 1 && rel <= 4 && (
              <circle cx={x} cy={16 + (rel - 0.5) * 14} r="4" fill="var(--chord)" />
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const PianoChordSvg: React.FC<{ chord: string }> = ({ chord }) => {
  const active = new Set(getPianoNotes(chord));
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks = [
    { s: 1, p: 0.65 },
    { s: 3, p: 1.65 },
    { s: 6, p: 3.65 },
    { s: 8, p: 4.65 },
    { s: 10, p: 5.65 },
  ];
  const w = 13;

  return (
    <svg width="94" height="52" viewBox="0 0 94 52" xmlns="http://www.w3.org/2000/svg" aria-label={`${chord} piano chord`}>
      {whites.map((s, i) => (
        <rect
          key={s}
          x={1 + i * w}
          y="2"
          width={w - 1}
          height="46"
          rx="1.5"
          fill={active.has(s) ? 'var(--chord)' : '#f1f5f9'}
          stroke="#334155"
          strokeWidth="1"
        />
      ))}
      {blacks.map((b) => (
        <rect
          key={b.s}
          x={1 + b.p * w}
          y="2"
          width={w * 0.64}
          height="29"
          rx="1.5"
          fill={active.has(b.s) ? 'var(--accent)' : '#0f172a'}
          stroke="#020617"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
};
