import React, { useState } from 'react';
import { Cloud, RefreshCw, Upload, X } from 'lucide-react';
import {
  downloadDriveBackup,
  findBackupFileByName,
  listDriveBackups,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  uploadDriveBackup,
} from '../lib/googleDrive';
import { DriveFile, Setlist, Song } from '../types/chordstand';

interface DriveModalProps {
  open: boolean;
  onClose: () => void;
  accessToken: string | null;
  userEmail: string | null;
  songs: Song[];
  setlists: Setlist[];
  onTokenChange: (token: string | null, email: string | null) => void;
  onRestored: (songs: Song[], setlists: Setlist[], fileName: string) => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) => void;
  onToast: (msg: string) => void;
}

export const DriveModal: React.FC<DriveModalProps> = ({
  open,
  onClose,
  accessToken,
  userEmail,
  songs,
  setlists,
  onTokenChange,
  onRestored,
  onRequestConfirm,
  onToast,
}) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!open) return null;

  const refreshFiles = async (tokenToUse: string) => {
    setLoading(true);
    setStatusMsg('Loading backups from Google Drive...');
    try {
      const list = await listDriveBackups(tokenToUse);
      setFiles(list);
      setStatusMsg(list.length ? '' : 'No Chordstand backups found in Google Drive yet.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to list Drive files.';
      setStatusMsg(msg);
      onToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const { user, accessToken: token } = await signInWithGoogleDrive();
      onTokenChange(token, user.email || user.displayName || 'Connected');
      onToast('Google Drive connected!');
      await refreshFiles(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      onToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogleDrive();
    onTokenChange(null, null);
    setFiles([]);
    setStatusMsg('Signed out.');
  };

  const handleBackupClick = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const existing = await findBackupFileByName(accessToken, 'chordstand-pro-backup.json');
      if (existing) {
        setLoading(false);
        onRequestConfirm({
          title: 'Overwrite Google Drive Backup?',
          message: `This will update "${existing.name}" in your Google Drive with your current ${songs.length} songs and ${setlists.length} setlists.`,
          confirmLabel: 'Overwrite Backup',
          onConfirm: async () => {
            setLoading(true);
            try {
              await uploadDriveBackup(accessToken, songs, setlists, existing.id);
              onToast('Updated backup in Google Drive!');
              await refreshFiles(accessToken);
            } catch (err) {
              onToast(err instanceof Error ? err.message : 'Drive backup failed.');
            } finally {
              setLoading(false);
            }
          },
        });
      } else {
        await uploadDriveBackup(accessToken, songs, setlists, null);
        onToast('Backed up library to Google Drive!');
        await refreshFiles(accessToken);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Drive backup failed.');
      setLoading(false);
    }
  };

  const handleRestoreClick = (file: DriveFile) => {
    if (!accessToken) return;
    onRequestConfirm({
      title: 'Restore Backup from Google Drive?',
      message: `Merge songs and setlists from "${file.name}" (${new Date(file.modifiedTime).toLocaleString()}) into your current library?`,
      confirmLabel: 'Restore Backup',
      onConfirm: async () => {
        setLoading(true);
        try {
          const data = await downloadDriveBackup(accessToken, file.id);
          onRestored(data.songs, data.setlists, file.name);
        } catch (err) {
          onToast(err instanceof Error ? err.message : 'Failed to download Drive backup.');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[620px] max-h-[88vh] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg font-bold m-0 flex items-center gap-2">
            <Cloud className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Google Drive Cloud Backup
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
          Saves and restores only the backup files created by Chordstand Pro in your Google Drive.
        </p>

        <div
          className="rounded-xl border p-4 mb-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          {!accessToken ? (
            <>
              <button
                type="button"
                className="gsi-material-button"
                disabled={loading}
                onClick={handleSignIn}
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span>Sign in with Google</span>
                </div>
              </button>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Signed out
              </span>
            </>
          ) : (
            <>
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--accent-2)' }}>
                  Connected to Google Drive
                </div>
                {userEmail && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {userEmail}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                Sign Out
              </button>
            </>
          )}
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="flex gap-2 flex-wrap mb-3">
            <button
              type="button"
              disabled={!accessToken || loading}
              onClick={handleBackupClick}
              className="px-3.5 py-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
              style={{
                background: 'rgba(52, 211, 153, 0.16)',
                borderColor: 'var(--accent-2)',
                color: 'var(--accent-2)',
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              Backup Library to Drive
            </button>
            <button
              type="button"
              disabled={!accessToken || loading}
              onClick={() => accessToken && refreshFiles(accessToken)}
              className="px-3.5 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              List Drive Backups
            </button>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            {!accessToken && <div style={{ color: 'var(--muted)' }}>Sign in to view or restore backups.</div>}
            {accessToken && statusMsg && <div style={{ color: 'var(--muted)' }}>{statusMsg}</div>}
            {files.map((f) => (
              <div
                key={f.id}
                className="flex justify-between items-center gap-3 p-2.5 rounded-lg border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div>
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
                    {new Date(f.modifiedTime).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleRestoreClick(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-45"
                  style={{ background: 'var(--accent)', color: '#051019' }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
