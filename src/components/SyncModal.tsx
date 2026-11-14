import React, { useState } from 'react';
import { Radio, X } from 'lucide-react';

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  peerMode: 'host' | 'client' | null;
  hostPin: string | null;
  connectedCount: number;
  joinStatus: string;
  followScroll: boolean;
  followKey: boolean;
  onToggleFollowScroll: (v: boolean) => void;
  onToggleFollowKey: (v: boolean) => void;
  onStartHost: () => void;
  onJoinHost: (pin: string) => void;
  onStopPeer: () => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  open,
  onClose,
  peerMode,
  hostPin,
  connectedCount,
  joinStatus,
  followScroll,
  followKey,
  onToggleFollowScroll,
  onToggleFollowKey,
  onStartHost,
  onJoinHost,
  onStopPeer,
}) => {
  const [pinInput, setPinInput] = useState('');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[640px] max-h-[88vh] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg font-bold m-0 flex items-center gap-2">
            <Radio className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Multi-iPad Stage Sync (4-Digit PIN)
          </h3>
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

        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
          Mirror the active song, key/capo, section jumps, and live scroll position across bandmates&apos; tablets or
          laptops over WebRTC. A hotspot or Wi-Fi blip reconnects automatically; use Disconnect to stop retrying.
        </p>

        <div
          className="rounded-xl border p-4 mb-3"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div>
              <strong className="text-sm">Leader / Host Mode</strong>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {peerMode === 'host' && hostPin ? `Broadcasting live on PIN ${hostPin}` : 'Not hosting'}
              </div>
              {peerMode === 'host' && hostPin && (
                <div className="font-chord text-3xl font-extrabold tracking-[0.22em] my-1.5 tabular-nums" style={{ color: 'var(--chord)' }}>
                  {hostPin}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {peerMode !== 'host' && (
                <button
                  type="button"
                  onClick={onStartHost}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer"
                  style={{ background: 'var(--accent)', color: '#051019' }}
                >
                  Start Hosting
                </button>
              )}
              {peerMode !== null && (
                <button
                  type="button"
                  onClick={onStopPeer}
                  className="px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'rgba(248, 113, 113, 0.5)',
                    color: 'var(--danger)',
                  }}
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
          {peerMode === 'host' && (
            <div className="text-xs mt-2 font-medium tabular-nums" style={{ color: 'var(--accent-2)' }}>
              {connectedCount} bandmate device(s) connected
            </div>
          )}
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <strong className="text-sm">Follower / Join Mode</strong>
          <div className="flex gap-2 items-center mt-2.5 flex-wrap">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="PIN"
              className="w-32 px-3 py-2 rounded-lg border font-chord text-base font-bold tracking-[0.2em] text-center outline-none tabular-nums"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            />
            <button
              type="button"
              onClick={() => onJoinHost(pinInput.trim())}
              className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
              style={{ background: 'var(--accent)', color: '#051019' }}
            >
              Join Session
            </button>
          </div>

          <div className="flex gap-4 mt-3 text-xs flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={followScroll}
                onChange={(e) => onToggleFollowScroll(e.target.checked)}
              />
              Follow leader scroll
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={followKey}
                onChange={(e) => onToggleFollowKey(e.target.checked)}
              />
              Follow leader key &amp; capo
            </label>
          </div>

          {joinStatus && (
            <div className="text-xs mt-2.5 font-medium" style={{ color: peerMode === 'client' ? 'var(--accent-2)' : 'var(--muted)' }}>
              {joinStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
