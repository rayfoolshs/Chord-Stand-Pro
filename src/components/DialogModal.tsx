import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type DialogConfig =
  | {
      mode: 'confirm';
      title: string;
      message: string;
      confirmLabel?: string;
      danger?: boolean;
      onConfirm: () => void;
    }
  | {
      mode: 'prompt';
      title: string;
      message: string;
      defaultValue?: string;
      placeholder?: string;
      confirmLabel?: string;
      onConfirm: (value: string) => void;
    }
  | {
      mode: 'print-choice';
      setlistName: string;
      songCount: number;
      onPrintSetlist: () => void;
      onPrintCurrent: () => void;
    };

interface DialogModalProps {
  dialog: DialogConfig | null;
  onClose: () => void;
}

export const DialogModal: React.FC<DialogModalProps> = ({ dialog, onClose }) => {
  const [inputVal, setInputVal] = useState('');

  useEffect(() => {
    if (dialog?.mode === 'prompt') {
      setInputVal(dialog.defaultValue || '');
    }
  }, [dialog]);

  if (!dialog) return null;

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="font-display text-lg font-bold m-0">
            {dialog.mode === 'print-choice' ? 'Print Stage Chart' : dialog.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border cursor-pointer"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {dialog.mode === 'confirm' && (
          <>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--muted)' }}>
              {dialog.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  dialog.onConfirm();
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer"
                style={{
                  background: dialog.danger ? 'var(--danger)' : 'var(--accent)',
                  color: '#051019',
                }}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </>
        )}

        {dialog.mode === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = inputVal.trim();
              if (!trimmed) return;
              onClose();
              dialog.onConfirm(trimmed);
            }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
              {dialog.message}
            </p>
            <input
              autoFocus
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={dialog.placeholder}
              className="w-full px-3 py-2 rounded-lg border text-sm mb-4 outline-none"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer"
                style={{ background: 'var(--accent)', color: '#051019' }}
              >
                {dialog.confirmLabel || 'Save'}
              </button>
            </div>
          </form>
        )}

        {dialog.mode === 'print-choice' && (
          <>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--muted)' }}>
              You have setlist <strong>{dialog.setlistName}</strong> active ({dialog.songCount} songs). Print the full setlist packet or only the current song?
            </p>
            <div className="flex justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border text-sm font-medium cursor-pointer"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  dialog.onPrintCurrent();
                }}
                className="px-3.5 py-2 rounded-lg border text-sm font-medium cursor-pointer"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                Current Song Only
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  dialog.onPrintSetlist();
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer"
                style={{ background: 'var(--accent)', color: '#051019' }}
              >
                Print Full Setlist ({dialog.songCount})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
