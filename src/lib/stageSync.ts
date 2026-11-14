import { DataConnection } from 'peerjs';
import { StageSyncPayload } from '../types/chordstand';

/**
 * Stage Sync transport helpers.
 *
 * PeerJS data channels do not report a dead link reliably. On a phone hotspot,
 * or after a Wi-Fi hand-off, the channel can stay "open" while nothing gets
 * through, so sync silently mirrors into a dead connection. A ping/pong
 * heartbeat detects that, and the app's reconnect loop rebuilds the session.
 */

export const STAGE_ID_PREFIX = 'chordstand-pro-';

/** How often to ping the peer and how long to wait for a reply. */
export const HEARTBEAT_MS = 5000;
export const HEARTBEAT_TIMEOUT_MS = 15000;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

const STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * PeerJS's default config ships STUN and a public TURN server. A phone hotspot
 * is carrier-grade NAT and may block that relay, so a deployment can point the
 * app at its own relay with VITE_TURN_URL / VITE_TURN_USERNAME /
 * VITE_TURN_CREDENTIAL.
 */
export function stagePeerOptions(): { debug: number; config?: { iceServers: RTCIceServer[] } } {
  const url = import.meta.env.VITE_TURN_URL as string | undefined;
  if (!url) return { debug: 0 };
  return {
    debug: 0,
    config: {
      iceServers: [
        ...STUN_SERVERS,
        {
          urls: url,
          username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
          credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
        },
      ],
    },
  };
}

export function stagePeerId(pin: string): string {
  return `${STAGE_ID_PREFIX}${pin}`;
}

/** Short exponential backoff: 1 s, 2 s, 4 s … capped at 15 s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS);
}

export function isStageState(raw: unknown): raw is StageSyncPayload {
  return Boolean(raw) && (raw as { type?: unknown }).type === 'stage-state';
}

/**
 * Start a ping/pong heartbeat on a data connection. Responds to the peer's
 * pings, and reports the link dead when nothing answers for 15 seconds.
 * Returns a cleanup function; calling it detaches every listener.
 */
export function attachStageHeartbeat(conn: DataConnection, onDead: () => void): () => void {
  let lastPong = Date.now();
  let stopped = false;
  let timer: number | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) window.clearInterval(timer);
    conn.off('data', onData);
    conn.off('error', stop);
    conn.off('close', stop);
  };

  const onData = (raw: unknown) => {
    const message = raw as { t?: unknown } | null;
    if (!message || typeof message !== 'object') return;
    if (message.t === 'pong') {
      lastPong = Date.now();
      return;
    }
    if (message.t === 'ping') {
      try {
        conn.send({ t: 'pong' });
      } catch {
        // The connection closed mid-send; the close handler cleans up.
      }
    }
  };

  timer = window.setInterval(() => {
    if (stopped) return;
    if (!conn.open || Date.now() - lastPong > HEARTBEAT_TIMEOUT_MS) {
      stop();
      onDead();
      return;
    }
    try {
      conn.send({ t: 'ping' });
    } catch {
      stop();
      onDead();
    }
  }, HEARTBEAT_MS);

  conn.on('data', onData);
  conn.on('error', stop);
  conn.on('close', stop);

  return stop;
}

/** Try to revive the signalling socket without dropping the data channel. */
export function tryReconnectSignalling(peer: { reconnect: () => void }): void {
  try {
    peer.reconnect();
  } catch {
    // The peer is already gone; the caller's error/retry path handles it.
  }
}

export function peerErrorType(error: unknown): string | undefined {
  return (error as { type?: string }).type;
}

/** Signalling errors worth retrying; anything else is reported to the user. */
export function isRetryablePeerError(type?: string): boolean {
  return type === 'network' || type === 'socket-error' || type === 'server-error';
}