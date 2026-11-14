# Chordstand Pro

**Created by Ray Foo**

Stage-ready chord charts, setlists, imports, multi-device sync, and cloud backup for working musicians.

**Live app:** https://rayfoolshs.github.io/Chord-Stand-Pro/

---

## What it does

Chordstand Pro is a client-side React app for running a gig from a tablet or laptop. Charts live in the browser (IndexedDB); nothing is uploaded unless you explicitly back up to Google Drive.

### Charts & stage tools

- Over-lyrics chord charts and ChordPro (`[G]` inline and chord-line formats)
- Transpose by semitone and independent capo tracking
- Nashville number system view
- Optional guitar/piano chord diagrams for the chords in the current song
- One- or two-column layout, lyrics-only mode, adjustable chart font size
- Autoscroll with adjustable speed (Space / P toggles)
- Metronome with tap tempo and optional click sound
- Stage Lock to prevent accidental edits mid-song
- Fullscreen stage view
- Print / save-as-PDF for the current chart or a whole setlist packet
- Day/night theme slider

### Library & setlists

- Searchable song library with key, tempo, capo, and time signature
- Multiple setlists with per-song key/capo overrides and stage notes
- Reorder setlist entries and step through them from the stage toolbar
- Chart editor for creating or editing songs in-app

### Imports

- OnSong `.backup`, `.onsongarchive`, and `.sqlite3` databases (parsed in-browser with sql.js)
- `.onsong`, `.chordpro`, `.cho`, `.pro`, `.txt`
- Chordstand JSON backups
- Ultimate Guitar text cleaner, UG search, and an optional bookmarklet that sends the chart from the UG tab straight into the import preview

### Sync & backup

- **Stage Sync:** peer-to-peer WebRTC via PeerJS, paired with a 4-digit PIN
- Mirrors active song, transpose/capo, section jumps, and scroll position
- Heartbeat + automatic reconnect with backoff so a phone hotspot or Wi-Fi blip does not end the session
- Optional TURN relay for networks that block the public relay
- **Google Drive** backup/restore through Firebase Auth (`drive.file` scope); the access token stays in memory only

---

## Tech stack

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4
- PeerJS (WebRTC stage sync)
- Firebase Auth + Google Drive REST API
- sql.js + JSZip (OnSong import)
- IndexedDB for local storage
- lucide-react icons, motion

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 8)
- npm

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build & preview

```bash
npm run build    # outputs dist/
npm run preview
npm run lint     # tsc --noEmit
```

## Environment

Copy `.env.example` to `.env` and fill in what you need:

| Variable | Purpose |
| --- | --- |
| `VITE_TURN_URL` | TURN relay URL for Stage Sync |
| `VITE_TURN_USERNAME` | TURN username |
| `VITE_TURN_CREDENTIAL` | TURN credential |

The TURN values are optional. PeerJS ships a public TURN server; a carrier-grade NAT (phone hotspot) may block it, in which case point these at a relay you control.

Google Drive sign-in uses `firebase-applet-config.json` in the repo root.

---

## Ultimate Guitar import

Ultimate Guitar blocks automated downloads, so Chordstand Pro never fetches their pages. It works with text you can already see:

1. Open **Import / OnSong**.
2. Drag **Send chart to Chord-Stand Pro** to your bookmarks bar (or copy the bookmarklet).
3. On a UG chord chart, run the bookmark.
4. The chart opens in Chordstand Pro's import preview with title and artist filled in.
5. Review it and press **Import Pasted Chart** — nothing is saved before that.

You can also paste a chart manually, use **Paste Clipboard**, or search UG and copy the chart.

## Stage Sync on a hotspot

1. Leader opens **Stage Sync → Start Hosting** and reads the 4-digit PIN.
2. Followers enter the PIN and press **Join Session**.
3. Each data channel pings every 5 seconds and is considered dead after 15 seconds without a reply.
4. A dropped link reconnects automatically with a 1 s → 15 s backoff and the same PIN.
5. **Disconnect** stops the automatic retries.

The host keeps its PIN open when a follower drops so it can rejoin.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` / `P` | Toggle autoscroll |
| `←` / `PageUp` | Previous setlist song |
| `→` / `PageDown` | Next setlist song |
| `+` / `=` | Transpose up |
| `-` | Transpose down |
| `F` | Toggle fullscreen |
| `L` | Toggle library sidebar |
| `Esc` | Close overlays / exit fullscreen |

---

## Project structure

```
src/
  App.tsx                 app shell, stage toolbar, PeerJS sync
  components/
    ChartRenderer.tsx     chart layout and rendering
    ChordDiagrams.tsx     guitar/piano SVG diagrams
    EditorPane.tsx        song editor
    ImportModal.tsx       file/paste/UG import UI
    SyncModal.tsx         Stage Sync pairing UI
    DriveModal.tsx        Google Drive backup/restore UI
    DialogModal.tsx       confirm/choice dialogs
  lib/
    chartParser.ts        ChordPro + over-lyrics parser
    musicTheory.ts        transpose, keys, Nashville numbers
    onsongImport.ts       OnSong/archive/JSON import
    googleDrive.ts        Firebase auth + Drive API
    storage.ts            IndexedDB helpers and demo songs
    ug.ts                 UG payload/text helpers
    ugImport.ts           UG bookmarklet + hash hand-off
    stageSync.ts          heartbeat, backoff, TURN options
  types/chordstand.ts     shared types
```

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`, build with Node 20, and publish `dist/` to GitHub Pages. The Pages source is **GitHub Actions**, so no `gh-pages` branch is used.

```bash
git push origin main
```

---

## Privacy

- Songs, setlists, and settings are stored locally in IndexedDB.
- Stage Sync is peer-to-peer; only the pairing handshake touches the PeerJS signalling service.
- Ultimate Guitar content is never fetched by the app; imports come from text you paste or send from the page.
- Google Drive access is limited to files created by the app (`drive.file`), and the token is not persisted.

## Credits

Built by **Ray Foo**. Chord parsing, OnSong import, Stage Sync, and Ultimate Guitar bookmarklet workflows were carried over from the companion project [`rayfoolshs/chordstand`](https://github.com/rayfoolshs/chordstand).
