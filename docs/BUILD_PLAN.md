# Build Plan

Planning and delivery notes for **Chord Stand Studio** (created by Ray Foo).

The app is a static, client-side build. Everything below ships as plain files through Vite; there is no application server in production.

---

## Goals

1. Run a full set from a tablet: chart, transpose, capo, setlist, scroll, click.
2. Import charts players already own (OnSong, ChordPro, text, Ultimate Guitar copies).
3. Keep bandmates in sync on stage, including on a phone hotspot.
4. Never lose a library: local persistence plus explicit Google Drive backup.
5. Deploy continuously to GitHub Pages from `main`.

## Non-goals

- Fetching or scraping Ultimate Guitar pages (blocked by their terms and bot protections).
- Server-side accounts, collaboration rooms, or a hosted database.
- Rendering PDF or image charts in-app (the import dialog states this limit).

---

## Current architecture

| Area | Decision |
| --- | --- |
| UI | React 19 + TypeScript, single-page app |
| Build | Vite 8, static `dist/` output, `base: './'` so Pages subpaths work |
| Styling | Tailwind CSS 4 plus CSS variables for stage/paper themes |
| Storage | IndexedDB (`chordstand_pro_v2`) with an in-memory fallback |
| Chart model | Parser produces sections → items → segments, rendered by `ChartRenderer` |
| Import | OnSong SQLite via sql.js, archives via JSZip, text via `chartParser` |
| UG bridge | Bookmarklet → `#ug=` base64url fragment → import preview |
| Sync | PeerJS data channels, 4-digit PIN namespace, ping/pong heartbeat |
| Auth | Firebase Auth popup, Google Drive `drive.file` scope, in-memory token |
| Deploy | GitHub Actions → `actions/upload-pages-artifact` → `deploy-pages` |

---

## Delivery phases

### Phase 0 — Foundation (done)

- Repository scaffold, Vite + React + TypeScript, Tailwind.
- GitHub Pages workflow and project site.
- Fix Vite 8 / esbuild peer resolution so CI installs cleanly.

### Phase 1 — Chart engine (done)

- Over-lyrics and ChordPro parsing (`chartParser.ts`).
- Transpose, capo, key detection, Nashville numbers (`musicTheory.ts`).
- Section navigation, one/two-column layout, lyrics-only mode.
- Chord diagrams (guitar, piano), font sizing, stage lock, fullscreen.
- Autoscroll, metronome, tap tempo, print packet.

### Phase 2 — Library, setlists, editing (done)

- IndexedDB persistence with demo content on first run.
- Song search and sorting, setlist creation and reordering.
- Per-entry key/capo overrides and stage notes.
- In-app editor for song metadata and chart text.
- Print choice: current chart or whole setlist.

### Phase 3 — Import (done)

- OnSong `.backup` / `.onsongarchive` / `.sqlite3` databases.
- `.onsong`, `.chordpro`, `.cho`, `.pro`, `.txt`, Chord Stand Studio JSON backups.
- Ultimate Guitar text cleaner, search shortcut, clipboard paste.
- Ultimate Guitar bookmarklet and `#ug=` hand-off into the preview.

### Phase 4 — Sync and backup (done)

- Host/follower pairing with a 4-digit PIN.
- Mirror active song, transpose/capo, section jump, scroll ratio.
- Google Drive backup/restore with Firebase Auth.

### Phase 5 — Hotspot resilience (done)

- 5 s ping / 15 s timeout heartbeat on every data channel.
- Dead-channel detection and teardown instead of mirroring into a void.
- Automatic reconnect with 1 s → 15 s exponential backoff.
- PeerJS signalling reconnect, `online`/`offline` handling.
- Optional TURN relay through `VITE_TURN_*` environment variables.
- Host keeps its PIN while a follower is away; Disconnect stops retries.

### Phase 6 — Documentation (done)

- `README.md`, this build plan, and `docs/VERSION_HISTORY.md`.

---

## Proposed next phases

These are ideas, not shipped behavior. Pick them up in order unless a gig demands otherwise.

### Phase 7 — Publishing polish

- [ ] Separate dev/prod Firebase configuration via env vars.
- [ ] Lighthouse pass for the Pages build (font loading, chunk splitting).
- [ ] Add a favicon to remove the console 404.
- [ ] Optional PWA manifest/service worker for offline stage use.

### Phase 8 — Setlist workflow

- [ ] Drag-and-drop reordering (currently button-based).
- [ ] Duplicate setlist / duplicate song.
- [ ] Undo for destructive actions.

### Phase 9 — Sync hardening

- [ ] Show peer count and reconnect state in the app header, not only the modal.
- [ ] Manual "Reconnect now" action.
- [ ] Optional host approval before a follower joins.

### Phase 10 — Import coverage

- [ ] Save the Ultimate Guitar bookmarklet per browser profile note in-app.
- [ ] Detect and report duplicate imports by title/artist.
- [ ] Batch edit metadata after a multi-file import.

---

## Release process

1. Update `docs/VERSION_HISTORY.md`.
2. Run `npm run lint` and `npm run build`.
3. Smoke test: load app, open a demo chart, transpose, print preview, import a pasted chart.
4. Commit with a conventional message and push to `main`.
5. Watch the Pages workflow finish and load the live URL.

## Build checklist

- [ ] `npm install` resolves cleanly (no `ERESOLVE`).
- [ ] `npm run lint` passes.
- [ ] `npm run build` writes `dist/` without errors.
- [ ] `index.html` title and metadata are correct.
- [ ] No secrets or tokens committed (`.env*` ignores everything except `.env.example`).
- [ ] Pages source remains **GitHub Actions** and the deploy job is green.

## Test plan

### Chart engine

- Import a ChordPro chart with inline `[G]` chords and a chord-line chart; verify section labels, chord placement, and lyrics.
- Transpose ±12 and toggle Nashville numbers; confirm chord diagrams follow the transposed key.
- Toggle one/two columns, lyrics-only, font size, and print packet.

### Import

- Import an OnSong backup with songs and setlists; verify counts and titles.
- Import `.onsong`, `.chordpro`, `.cho`, `.txt`, and a Chord Stand Studio JSON backup.
- Paste a chart, then repeat with the UG cleaner; confirm metadata lines are stripped or applied.
- Run the bookmarklet payload by opening `/#ug=<payload>`; confirm the modal opens, preview is filled, hash is cleared, and reload does not re-import.

### Sync

- Host on one device, join on another with the PIN; confirm song, key/capo, section, and scroll mirror.
- Freeze or disconnect the follower for 20+ seconds; confirm the host drops it and the follower rejoins the same PIN automatically.
- Toggle the follower offline/online; confirm the status message and recovery.
- Press Disconnect; confirm retries stop.

### Storage and backup

- Reload after edits; confirm IndexedDB persistence.
- Back up to Google Drive, then restore on a second profile.

## Risks and constraints

| Risk | Mitigation |
| --- | --- |
| PeerJS public signalling/TURN outage | Retry with backoff; optional self-hosted relay via `VITE_TURN_*` |
| Hotspot blocks the relay entirely | Documented limitation; no client-side fix can create a blocked path |
| Ultimate Guitar markup changes break the bookmarklet | Chart extraction falls back from `pre` to `[class*="ChordSheet"]`; patch selectors when needed |
| Browser storage eviction | Encourage Drive backups; data stays exportable as Chord Stand Studio JSON |
| Vite 8 / Node version drift | CI pins Node 20; document Node 20.19+/22.12+ locally |

## Definition of done

A release is done when lint and build pass, the Pages workflow is green, the live URL serves the new build, and the checks in the test plan pass for chart rendering, import, sync, and persistence.
