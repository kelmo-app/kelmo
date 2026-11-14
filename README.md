# KDM — Kelmo Download Manager

**KELMO — The Open Download Workspace.** An open-source (GPLv3) download manager for Linux and Windows
with segmented downloads, queues, a weekly scheduler, and a verified library.

> KELMO is open-source software released under the GPLv3 license.

## Getting started (for everyone)

1. **Install and open KDM.** The first start shows a short setup (folder, browser, speed profile, look). *Skip setup* is always fine.
2. **Connect your browser (once).** Load the `extension` folder in your browser (it pairs itself with KDM, nothing to copy). From then on, clicking a download link opens a small **File Info** window with the real size: press *Start Download*, like IDM.
3. **Three more ways to add a download**
   - **Right-click a link → “Download with KDM”.**
   - **Copy a link** (Settings → Categories → *Watch the clipboard*): the File Info window opens by itself.
   - **Drag a link onto the floating box** (Settings → Categories → *Floating drop target*): a small box sits in the corner of your screen; drop the link on it.
4. **Many files at once.** Add URL → *Add many links at once…* and write `game.part[1-10].rar` for ten parts.
5. **Faster or safer.** *Add mirrors* (other links to the same file) makes KDM pull from all of them; *Check link* tells you why a download stopped; *Bandwidth planner* (Settings → Network) slows downloads in work hours and frees them at night.
6. **KDM keeps running in the tray** when you close the window. Quit it from the tray icon.

## Quick start (Fedora)

```bash
./scripts/fedora-setup.sh     # installs system libs + npm deps, runs all checks
npm run dev                   # desktop app with hot reload
```

If the window does not open or stays blank on older Intel graphics:

```bash
npm run dev:nosandbox         # skips the Chromium SUID sandbox
npm run dev:nogpu             # also disables GPU acceleration
```

Browser-only preview (no Electron): `npm run dev:web` → http://127.0.0.1:5173

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Vite + Electron with hot reload |
| `npm run build` | Type-check and build the web bundle to `dist/` |
| `npm run test` | Vitest unit tests |
| `npm run test:engine` | Download engine tests (Node's built-in runner, no dependencies) |
| `npm run test:live` | Manager → real engine → local HTTP server → disk, without Electron |
| `npm run test:bridge` | Browser bridge security + extension logic tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run package` | Build installers for Linux and Windows into `release/` |
| `npm run package:linux` | Linux `.AppImage` and Fedora `.rpm` into `release/` (needs `rpm-build`) |
| `npm run package:rpm` | Fedora `.rpm` only (needs `rpm-build`) |
| `npm run package:win` | Windows installer + portable `.exe` (build it on Windows or with the GitHub workflow) |

## Installers

The icons live in `build/` (`icon.png`, `icon.ico` for Windows, `tray.png` for the tray).

- **Linux:** `npm run package:linux` makes `release/KDM-<version>-x86_64.AppImage` and `release/kdm-<version>-<build>.x86_64.rpm`. Install the rpm with `sudo dnf install ./release/kdm-*.rpm` (a newer build upgrades the old one). The AppImage needs FUSE 2 (`sudo dnf install fuse-libs`) or run it with `--appimage-extract-and-run`.
- **Debian / Ubuntu / Mint:** the same command also makes `release/kdm_<version>-<build>_amd64.deb` (built with `dpkg-deb`; on Fedora run `sudo dnf install dpkg` once, or use `npm run package:deb`). Install with `sudo apt install ./release/kdm_*.deb`; it fixes the Electron sandbox helper for Ubuntu 24.04 and later.
- The rpm installs to `/opt/KELMO` and adds the `kdm` command. If you also use the launcher script from `scripts/install-launcher.sh`, both are called `kdm`: the launcher one lives in `~/.local/bin` and wins.
- **Windows:** the `Release` workflow in `.github/workflows/` builds `KDM-<version>-x64.exe` (installer) and a portable `.exe` on GitHub; run it from the Actions tab. Building the Windows installer on Linux needs Wine, so that is the easy way.
- The installers are not code-signed, so Windows SmartScreen will warn on first run until a certificate is added.

## Architecture

```
engine/            Real download engine (dependency-free). Segmented, resumable, rate-limited.
electron/          Main process + preload bridge.
src/services/      DownloadManager, QueueManager, SchedulerService, StorageService (UI-agnostic)
src/services/DownloadEngine.ts   Engine interface + MockDownloadEngine (currently used by the UI)
src/store/         Zustand stores; the only place the manager is bound to React
src/features/      downloads, queues, scheduler, library, settings
src/pages/         One file per route
```

The UI never talks to the engine directly: `src/store/instances.ts` is the composition root where
`MockDownloadEngine` is swapped for the real engine in `engine/download.mjs`.

## Engine

`engine/download.mjs` implements what makes a download manager fast and safe:

- multiple connections per file, **dynamic segmentation** (an idle connection splits the largest remaining segment)
- **pause / resume**, including across app restarts (`.kdm` state file next to the `.part` file)
- single-stream fallback for servers without `Range` support
- global speed limit, retry with exponential backoff
- filename detection from `Content-Disposition`

## Status

- Engine: tested (`npm run test:engine`, `npm run test:live`).
- Desktop app (Electron): downloads are **real** — files are saved under your download folder (default `~/Downloads/KELMO/<Category>`). The workspace starts empty.
- Browser preview (`npm run dev:web`) and unit tests use the simulated engine with demo data.
- Next: browser integration (extension + native messaging), mirror racing, link health check.

## How a browser download flows (IDM style)

1. You click a download link in Brave/Chrome/Firefox. The extension hands the link to KDM; the browser's own download is cancelled.
2. A small **Download File Info** window appears (the main KDM window stays hidden in the tray): URL, category, folder, file size, resume support.
   Pick *Start Download* or *Download Later*.
3. A small **progress window** shows status, rate, time left and *Resume capability*, with Pause / Cancel, a speed limiter and "when done" options.
4. When it finishes, a **Download complete** window offers *Open*, *Open folder* and *Don't show this dialog again*.

Files are sorted into **General, Compressed, Documents, Music, Programs, Video**; each folder is created automatically and can be changed in *Settings → Downloads → Categories and folders* (or by ticking "Remember this path for the category"). Closing the main window keeps KDM running in the tray; *Settings → General → Start KDM on system startup* adds it to your login items.

## Simple and Advanced view

KDM opens in **Simple** view by default: a toolbar (Add URL, Resume, Pause, Delete, Delete done, Scheduler, Options), a tree
(All downloads / Unfinished / Finished and the six categories) and the list of downloads, with a thin detail strip under it.
Overview, Queues, Scheduler and Library are one click away under *More tools*. Switch with the **Simple | Advanced** control
(top right in Simple view, bottom of the sidebar in Advanced view, or *Settings → Appearance → Interface*).

## Memory use (important on Windows)

KDM is built on Electron, so a visible window costs real RAM. KDM is designed to cost almost nothing when you are not looking at it:

- No telemetry, no background updater, no "preloading" — there is no such code in this project.
- Closing the window keeps KDM in the tray. When nothing is downloading or queued, the window is **really closed after 45 seconds**
  (its whole Chromium page is freed) and rebuilt only when you open KDM or a browser link needs it. Downloads, paused items and
  history are saved and come back exactly as they were.
- The small *Download File Info / progress / complete* windows exist only while you use them.
- While something downloads, or is queued, the window is kept (hidden) because it runs the queue and scheduler.

## Download windows

- **File Info** and **Download complete** show adaptive file art by type (ISO disc, software, PDF, audio, archive, image, video, document, font, code). A finished image shows its real thumbnail.
- **Progress** has tabs, a big percentage, a connection bar and a per-connection table (live data from the engine). "Hide details" collapses it to a compact window; the choice is remembered.

## Which settings really do something

Settings → Network and Download Engine are wired to the real engine:

| Setting | Effect |
|---|---|
| Proxy: none / system / manual | Downloads go direct, through your desktop's proxy, or through the host:port you typed (HTTP and HTTPS-through-CONNECT; **SOCKS is not supported yet**) |
| Connection timeout | A connection that does not answer, or sends no data, for this many seconds is dropped and retried |
| User-agent | Sent when the browser did not supply its own; empty = Node's default |
| Retry attempts | Retries per failed connection, with backoff |
| File allocation | *Sparse*/*None* grow the file as data arrives; *Preallocate* reserves the whole size first (and fails early on a full disk) |
| Queue speed limit (Queues → policy) and the limit of a scheduler window | All downloads of that queue share the cap, on top of the global limit and each download's own limit. Changing it applies to running downloads |
| Diagnostic mode + Log folder | A text log (`kdm-YYYY-MM-DD.log`) of starts, state changes, errors and link checks. Links are written without their `?query`; cookies are never logged |

**DNS servers** is shown but disabled: custom DNS needs a component KDM does not ship yet.

## Quick Monitor (tray)

A left click on the tray icon opens a small window next to it: total speed, every active download with a progress bar, Pause all / Resume all / Add URL, and shortcuts to the queue manager, the download folder and Settings. It closes when you click elsewhere or press Esc. The right-click menu (Open / Quit) is unchanged. On GNOME the tray icon itself needs an AppIndicator extension; on Wayland the window position is chosen by the compositor.

## Torrents (magnet links and .torrent files)

Paste a `magnet:?xt=urn:btih:…` link, or a link to a `.torrent` file, into Add URL (or drop it on the drop target). KDM downloads it with the WebTorrent library inside the app, no other program needed. The name and size appear once peers are found. Pause keeps the files and Resume continues (the files are re-checked). KDM stops when the download finishes and does not keep seeding. The speed limits (per download, per queue, global) apply to the download side.

Limits: no torrent file picker yet, no per-file selection inside a torrent, no browser-extension capture of magnet links yet, and the built-in engine speaks WebTorrent's protocols (TCP, DHT, trackers over HTTP/UDP; some web-only peers are not reachable). After updating run `npm install` once, because `webtorrent` is a new dependency.

## Bandwidth planner

Settings → Network → **Bandwidth planner**. Add windows such as “Mon–Fri 09:00–18:00 at 2 MB/s”; outside every window the default limit (Settings → Download Engine) applies. A window can run past midnight, be switched off, and can also say *Unlimited* so a night window frees a slow default. If windows overlap, the one higher in the list wins. KDM re-checks every 30 seconds and applies the limit to all downloads; the Simple window's status bar shows the limit in force.

## Floating drop target

Tray and taskbar icons cannot receive dropped links on Linux or Windows, so KDM offers an IDM-style floating box instead: *Settings → Categories → Floating drop target*. A small always-on-top box sits in the bottom-right corner (drag its top strip to move it, × to hide, double-click to open KDM). Drop one link on it and File Info opens; drop several and the main window opens in many-links mode.

## Drag and drop

Drag a link (or several selected links) from the browser onto the KDM window. A copper "Drop the link to download it" panel appears and the Add download window opens with the link filled in; several links open the many-links mode. Dropped files can never navigate the window away.

## Many links at once

In *Add download* press **Add many links at once…**, paste one link per line, and add numbered files with a range: `game.part[1-10].rar`, `[01-10]` (keeps zero padding) or `[a-e]`. KDM shows how many downloads it will add (up to 200), skips anything that is not a web link, and sorts each file into its own category folder. Mirrors are for copies of the *same* file; parts of an archive are separate downloads, which this handles.

## Mirror racing

Add other links to the same file (*+ Add mirrors* in File Info, or the Mirrors box in Add download). KDM checks each one (same size, ranges honoured; anything else is skipped), then spreads its connections over all of them. Connections that finish early take more of the file, so the faster mirror automatically does more of the work. If a mirror fails the others carry on; if the main link is down a mirror takes over. Your browser login (cookie, referer) is only ever sent to the main link's site. The progress window shows the source of each connection.

## Link health check

Select an unfinished download and press **Check link**. KDM asks the server and tells you in plain words: alive (size, resume, speed of reply), expired or login needed (401/403), not found (404/410), too many requests (429), server trouble (5xx), no answer, a web page instead of a file, a file that changed size, or lost resume support.

## Clipboard watcher

Settings → Categories → *Watch the clipboard* (off by default). Copy a link to a file and the File Info window opens. Only plain links to downloadable file types are offered (not web pages or images), each copied text once, and nothing is read while the option is off.

## First-run setup

A six-step wizard (folder, browser bridge, speed profile, appearance) appears once. Speed profiles set real values: connections per download and an optional speed limit. *Skip setup* keeps the defaults; *Settings → Advanced → Run setup again* shows it again.

## Settings Control Center

Settings are grouped like a control panel (Download Engine, Browser Bridge, Categories, Network, Appearance, Notifications, Privacy, Advanced, Open Source). A search box filters every setting, and a System health strip shows the bridge, free disk space and what the engine is doing. Changes apply immediately.

## When all downloads finish

Pick an action once: in the progress window's **On completion** tab, or in the status bar of the main window ("When all done"). Choices: do nothing, quit KDM, put the computer to sleep, shut it down. It runs once, after at least one download finished and nothing is still downloading or waiting. Pausing everything does not trigger it. Sleep and shut down always show a 60 second countdown with a Cancel button first.

## Checksums

Paste the MD5, SHA-1, SHA-256 or SHA-512 value from the website in Add URL: when the file is finished KDM reads it and says "Checksum verified" or "Checksum does not match" (the algorithm is chosen by the length of the value). Settings → Download Engine → Checksum verification can also fingerprint every download (SHA-256 by default). Files are streamed through the hash, so a 3 GB file does not use 3 GB of memory.

## Browser extension (Brave, Vivaldi, Chrome, Edge, Firefox)

KDM listens on `127.0.0.1:47631` (this computer only). The extension in `extension/` sends downloads there.

1. Start KDM once. It registers a small *native messaging host* with every browser it finds (Brave, Chrome, Chromium, Vivaldi, Edge, Opera, Firefox; on Windows through the registry). Restart a browser that was already open.
2. Install the extension:
   - **Brave / Chrome / Vivaldi / Edge:** open `brave://extensions` (or `chrome://extensions`), turn on *Developer mode*, click *Load unpacked*, choose the `extension` folder.
   - **Firefox (store builds):** `npm run package:ext` makes `release/kdm-firefox-<version>.zip` (for addons.mozilla.org) and `release/kdm-chromium-<version>.zip` (Chrome Web Store / Edge). Upload the Firefox one as *unlisted* to get a signed `.xpi` that survives restarts, or as *listed* to publish it.
   - **Firefox (development):** open `about:debugging#/runtime/this-firefox`, *Load Temporary Add-on…*, choose `extension/manifest.json`. (Temporary add-ons are removed when Firefox restarts.)
3. That is all: the extension pairs itself. The status on its options page turns green. Nothing to copy.

How the pairing is protected: the extension has a fixed ID (the `key` in its manifest), and the host manifest lets only that ID start the host, so web pages and other extensions cannot ask for the token. Flatpak browsers (for example `com.brave.Browser`) cannot start programs outside their sandbox, so for them KDM places a tiny shell script inside the browser's own folder instead. For Chromium-based Flatpak browsers KDM also keeps a copy of the extension at `~/.var/app/<browser id>/data/KDM-extension`: load *that* folder (press Ctrl+H in the file chooser to see `.var`), because the sandbox forgets any other folder at restart and the extension would vanish. Snap browsers are not covered yet. The manual token in Settings → Advanced stays as a fallback.
When the extension is published on the Chrome Web Store, add its store ID to `EXTENSION_IDS` in `electron/native-setup.cjs`.

Downloads started in the browser now open in KDM. If KDM is not running, the browser downloads normally.
Right-click any link → **Download with KDM**. Only `http(s)` links are intercepted; cookies/logins are not forwarded yet.

## Downloads that need a login

Sites that ask for a user name and password (HTTP Basic login) work in both Add windows: tick **+ This site needs a login**, type the login, and download. If you forget, KDM notices the "401" answer and opens the fields for you. A login written in the address (`https://name:password@host/file`) works too.
- The password is sealed by your system's keyring (GNOME Keyring / KWallet on Linux, Windows' own protection on Windows) in KDM's main process; the download keeps only the sealed text. Settings → Privacy → *Saved logins* says whether a real keyring was found (without one the password is only lightly hidden).
- The login goes to the main link only: never to mirrors, and never to another site a link redirects to.
- Not supported yet: FTP, and logins that use a web page form (use the browser extension for those: it sends your browser's cookies).

## YouTube and other video sites

A page like `youtube.com/watch?v=…` is not a file, so KDM uses **yt-dlp** (open source, Unlicense) to read it and download it. KDM does not ship yt-dlp: the first time you paste or send such a link, the File Info window offers **Install** (one official file of about 40 MB from yt-dlp's GitHub releases, checked against the SHA-256 published with it; or Settings → Download Engine → Video downloader). An existing `yt-dlp` on the computer is used too.

- **Quality:** the window lists what the video really offers (Best, 1080p, 720p…, Audio only). The finished file is `Title.mp4` (or `.mp3`).
- **ffmpeg:** needed to join video and sound for the best qualities (`sudo dnf install ffmpeg-free`). Without it KDM offers only the ready-made files and says so.
- **YouTube's puzzles** need a JavaScript runtime: Deno or Node if the computer has one, otherwise KDM lends its own. Nothing to install.
- **Browser:** on a video-site page the extension's button, its popup and the right-click menu (**Download this video with KDM**) send the page itself. Works for YouTube, Vimeo, Dailymotion, Twitch, TikTok, Instagram, Facebook, X/Twitter, Reddit, SoundCloud, Bandcamp and Bilibili.
- Pause, resume, speed limit, queues and the progress window work as for any download. Playlists, live streams, DRM-protected and private videos are not supported.
- Downloading may be against a site's terms of service. Use it for videos you are allowed to keep.
- **"Sign in to confirm you're not a bot":** YouTube sometimes asks this. When the link came from the browser extension, the window offers **Use my browser login**: your browser's cookies for that site are handed to yt-dlp for this one video (a temporary file, deleted when yt-dlp ends). YouTube may limit accounts that download a lot, so use it only when needed.
- Sites change often: if YouTube stops working, press Update on the video downloader row in Settings.

## Right-click menu

Right-click a download in the list for IDM's menu: **Open**, **Open folder**, **Redownload**, **Resume / Stop download**, **Copy link**, **Remove**, **Add to queue ▸** and **Properties**. Entries that make no sense for that download are greyed out. With several rows selected the menu acts on all of them. ("Open with…" and "Refresh download address" are not there yet.)

## Video capture (browser extension)

While you browse, the extension notices the video and audio files a page loads (MP4, WebM, MKV, MP3, M4A…, 300 KB or bigger; ads and tiny clips are ignored).
- A copper **Download with KDM** button appears on the top-left of a big video when you move the mouse over it. For videos that play from a `blob:` address it sends the biggest video the page really loaded.
- The toolbar icon shows how many were found on this page; its popup lists them with a Download button each. The page title is used as the file name.
- The page address and your login cookies go along, so protected videos work.

### Streams (HLS, `.m3u8`)
Many sites play video as a playlist of hundreds of small pieces. KDM downloads those too: the toolbar popup lists them as "Stream (HLS)", and the page button uses them when the player gives no plain file. KDM picks the best quality, fetches up to 8 pieces at once, decrypts AES-128 pieces, and joins everything into one file. Pause, resume, speed limits and the proxy work as for any download.
- With **ffmpeg** installed (Fedora: `sudo dnf install ffmpeg-free`) the result is a normal `.mp4`, and videos that keep their sound in a separate file are joined too.
- Without ffmpeg the result is a `.ts` file (plays in VLC and mpv); videos with separate sound say so and ask for ffmpeg.
- Not supported: live streams (no end), DASH (`.mpd`), and DRM / SAMPLE-AES protected video. KDM does not try to get around copy protection.

## Keyboard shortcuts

`Ctrl+N` add download · `Ctrl+K` search · `Space` pause/resume selected · `Delete` remove selected · `Ctrl+,` settings

## License

GPL-3.0-or-later. No third-party download-manager assets or branding are used.
