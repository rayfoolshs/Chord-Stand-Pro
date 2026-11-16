import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

/**
 * In-app reference manual.
 *
 * The handbook ships as pre-rendered page images in `public/manual/` so it opens
 * instantly, works offline, and can be read on a tablet mid-gig without a PDF
 * viewer. Chapter chips jump straight to a section, and the footer steps one
 * page at a time.
 */

interface ManualModalProps {
  open: boolean;
  onClose: () => void;
}

interface ManualSection {
  /** Chip number, e.g. "03". */
  n: string;
  /** Short chip label. */
  label: string;
  /** 1-based page the section starts on. */
  page: number;
}

const PAGE_COUNT = 16;

const SECTIONS: ManualSection[] = [
  { n: '01', label: 'Cover', page: 1 },
  { n: '02', label: 'Contents', page: 2 },
  { n: '03', label: 'Workspace', page: 3 },
  { n: '04', label: 'Songs & Setlists', page: 5 },
  { n: '05', label: 'Stage Viewer', page: 6 },
  { n: '06', label: 'Chart Editor', page: 8 },
  { n: '07', label: 'Import', page: 10 },
  { n: '08', label: 'Stage Sync', page: 11 },
  { n: '09', label: 'Drive Backup', page: 13 },
  { n: '10', label: 'Print & PDF', page: 14 },
  { n: '11', label: 'Shortcuts', page: 15 },
];

/** Caption shown under the page, one entry per page. */
const PAGE_TITLES: string[] = [
  'Cover & Application Details',
  'Table of Chapters',
  'Workspace Architecture & Local-First Design',
  'Workspace Architecture & Local-First Design',
  'Managing Songs & Building Setlists',
  'Stage Chart Viewer & Live Controls',
  'Stage Chart Viewer & Live Controls',
  'Chart Editor & ChordPro Syntax',
  'Chart Editor & ChordPro Syntax',
  'Importing Libraries, OnSong & Ultimate Guitar',
  'Multi-Device WebRTC Stage Sync',
  'Multi-Device WebRTC Stage Sync',
  'Google Drive Cloud Backup & Restore',
  'Printing & Stage Packet PDF Export',
  'Keyboard Shortcuts & Troubleshooting',
  'Keyboard Shortcuts & Troubleshooting',
];

const pad = (n: number) => String(n).padStart(2, '0');

const pageSrc = (page: number) => new URL(`manual/page-${pad(page)}.jpg`, document.baseURI).href;

const pdfHref = () => new URL('Chord-Stand-Studio-User-Manual.pdf', document.baseURI).href;

export const ManualModal: React.FC<ManualModalProps> = ({ open, onClose }) => {
  const [page, setPage] = useState(1);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const scrollToTop = () => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  const goTo = useCallback((next: number) => {
    setPage((current) => {
      const clamped = Math.min(PAGE_COUNT, Math.max(1, next));
      if (clamped !== current) scrollToTop();
      return clamped;
    });
  }, []);

  const step = useCallback((delta: number) => {
    setPage((current) => {
      const clamped = Math.min(PAGE_COUNT, Math.max(1, current + delta));
      if (clamped !== current) scrollToTop();
      return clamped;
    });
  }, []);

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, next, prev]);

  const activeSection = useMemo(() => {
    let active = SECTIONS[0];
    for (const section of SECTIONS) {
      if (section.page <= page) active = section;
    }
    return active;
  }, [page]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-70 flex items-center justify-center p-2 sm:p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex flex-col w-full max-w-4xl max-h-[94vh] overflow-hidden rounded-xl border shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide m-0" style={{ color: 'var(--accent)' }}>
              Reference Manual · {PAGE_COUNT} pages
            </p>
            <h2 id="manual-title" className="font-display text-lg font-bold m-0 truncate">
              Chord Stand Studio Handbook
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={pdfHref()}
              download="Chord-Stand-Studio-User-Manual.pdf"
              title="Download the manual as a PDF"
              className="px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap no-underline"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download PDF</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border cursor-pointer"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              aria-label="Close manual"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chapter chips */}
        <div
          className="flex flex-wrap gap-1.5 px-3 py-2 border-b shrink-0"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          {SECTIONS.map((section) => {
            const active = section === activeSection;
            return (
              <button
                key={section.n}
                type="button"
                onClick={() => goTo(section.page)}
                aria-current={active ? 'page' : undefined}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer border whitespace-nowrap"
                style={
                  active
                    ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg)' }
                    : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }
                }
              >
                <span className="tabular-nums opacity-70">{section.n}</span>
                {section.label}
              </button>
            );
          })}
        </div>

        {/* Page */}
        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5" style={{ background: 'var(--bg)' }}>
          <img
            key={page}
            src={pageSrc(page)}
            alt={`Manual page ${page} of ${PAGE_COUNT}: ${PAGE_TITLES[page - 1]}`}
            loading="lazy"
            className="block w-full max-w-[820px] mx-auto rounded-md border shadow-lg bg-white"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-3 py-2.5 border-t shrink-0"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={prev}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>

          <p className="text-[11px] font-medium m-0 text-center truncate" style={{ color: 'var(--muted)' }}>
            <span className="tabular-nums">
              Page {pad(page)} / {PAGE_COUNT}
            </span>
            <span className="hidden sm:inline"> · {PAGE_TITLES[page - 1]}</span>
          </p>

          <button
            type="button"
            onClick={next}
            disabled={page === PAGE_COUNT}
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
