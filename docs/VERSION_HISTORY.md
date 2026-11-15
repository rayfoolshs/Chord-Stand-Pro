# Version History

All notable changes to **Chord Stand Studio**, created by Ray Foo.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning (`MAJOR.MINOR.PATCH`).

---

## 0.3.0 — 2026-11-15

### Changed

- Renamed the app from **Chordstand Pro** to **Chord Stand Studio** throughout the interface, page title, social metadata, and docs.
- Header brand now reads **Chord Stand Studio**; the **Created by Ray Foo** credit line is unchanged.
- Canonical deployment and bookmarklet target is now `https://rayfoolshs.github.io/Chord-Stand-Studio/`.
- Ultimate Guitar bookmarklet label is now "Send chart to Chord Stand Studio".
- Import and Google Drive copy now refers to Chord Stand Studio backups.

### Fixed

- Bookmarklet constant renamed to `CHORDSTAND_STUDIO_URL` so the generated bookmarklet matches the current deployment.

---

## 0.2.3 — 2026-11-14

### Changed

- Ultimate Guitar bookmarklet now targets the canonical Chord-Stand Pro deployment (`https://rayfoolshs.github.io/Chord-Stand-Pro/`); local development still targets the dev server origin.
- Clicking the bookmarklet button copies it to the clipboard; dragging it to the bookmarks bar still works.
- Bookmarklet link is named, titled, and labelled "Send chart to Chord-Stand Pro".
- Import hint now explains that bookmarks saved from the older Chordstand app open Chordstand and should be deleted before re-adding the Pro bookmarklet.
- README import steps note the same re-creation step.

### Fixed

- Charts sent from the widget always land in Chord-Stand Pro's import preview instead of a bookmarked URL from a different deployment.

---

## 0.2.2 — 2026-11-14

### Added

- `README.md` with setup, features, import/sync instructions, and project layout.
- `docs/BUILD_PLAN.md` covering architecture, delivery phases, release process, and test plan.
- `docs/VERSION_HISTORY.md` (this file).

### Changed

- Header brand now shows **Chordstand Pro** with a **Created by Ray Foo** credit line.

---

## 0.2.1 — 2026-11-14

### Added

- Ping/pong heartbeat on every Stage Sync data channel: 5 s interval, 15 s timeout.
- Automatic reconnect with exponential backoff (1 s → 15 s) and the same 4-digit PIN.
- PeerJS signalling reconnect on `disconnected` and retryable network/socket/server errors.
- `online` / `offline` handling so a hotspot or Wi-Fi hand-off triggers recovery.
- Optional TURN relay configuration through `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.
- `src/lib/stageSync.ts` for heartbeat, backoff, peer options, and error classification.

### Changed

- A dead channel is now closed and re-established instead of silently dropping sync state.
- `Disconnect` cancels automatic retries.
- Sync dialog explains automatic reconnection and the Disconnect behavior.

### Fixed

- Stage Sync no longer stays "connected" on a dead PeerJS data channel after a hotspot blip or sleeping device.

---

## 0.2.0 — 2026-11-14

### Added

- Ultimate Guitar bookmarklet that reads the chart already open in the UG tab and sends it to Chordstand Pro through a `#ug=` fragment.
- `src/lib/ug.ts` for payload parsing, chord-chart detection, and UG search URLs.
- `src/lib/ugImport.ts` for base64url encode/decode, hash consumption, session storage queue, and bookmarklet generation.
- Import modal: bookmarklet drag/copy card, incoming-chart notice, and clipboard auto-pickup of chart-like text.
- Same-tab `hashchange` support so a bookmarklet can reuse the current tab.

### Security

- The app never fetches Ultimate Guitar pages; imports come from text the user can already see.
- URL fragments are stripped after ingestion so a refresh cannot import twice.

---

## 0.1.1 — 2026-11-14

### Fixed

- GitHub Pages build failed with `ERESOLVE` because `esbuild@^0.25.0` conflicted with Vite 8's peer range. Bumped to `^0.28.0`.
- Pages deploy workflow now completes and publishes the site.

---

## 0.1.0 — 2026-11-14

### Added

- Initial Chordstand Pro project structure.
- React 19 + TypeScript + Vite 8 + Tailwind CSS 4 scaffold.
- Chart parser for ChordPro and over-lyrics charts, transposition, capo, Nashville numbers.
- Song library and setlists with IndexedDB persistence and demo content.
- Chart editor, chord diagrams, autoscroll, metronome, tap tempo, stage lock, fullscreen, and print packet.
- OnSong/ChordPro/JSON import with sql.js and JSZip.
- Stage Sync over PeerJS with a 4-digit PIN.
- Google Drive backup/restore through Firebase Auth.
- GitHub Actions workflow deploying `dist/` to GitHub Pages.

---

## 0.0.0 — 2026-11-14

### Added

- Initial commit.
