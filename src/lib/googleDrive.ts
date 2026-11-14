import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DriveFile, Setlist, Song } from '../types/chordstand';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
// Access token is cached strictly in memory (never in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function initDriveAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthCleared?: () => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthCleared?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthCleared?.();
    }
  });
}

export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Drive access token from sign-in.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleDrive(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

export async function listDriveBackups(accessToken: string): Promise<DriveFile[]> {
  const q = encodeURIComponent("name contains 'chordstand-pro-backup' and trashed = false");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to list Drive backups (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []) as DriveFile[];
}

export async function findBackupFileByName(accessToken: string, filename = 'chordstand-pro-backup.json'): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name = '${filename}' and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

export async function uploadDriveBackup(
  accessToken: string,
  songs: Song[],
  setlists: Setlist[],
  existingFileId?: string | null
): Promise<void> {
  const filename = 'chordstand-pro-backup.json';
  const payload = JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      songs,
      setlists,
    },
    null,
    2
  );

  const boundary = `chordstand_multipart_${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, mimeType: 'application/json' });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive backup failed (${res.status} ${res.statusText})`);
  }
}

export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<{ songs: Song[]; setlists: Setlist[] }> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download Drive backup (${res.status})`);
  }
  const data = await res.json();
  return {
    songs: Array.isArray(data.songs) ? data.songs : [],
    setlists: Array.isArray(data.setlists) ? data.setlists : [],
  };
}
