# OmniConvert

A file conversion and preview app that runs in the browser, styled like macOS:
drop files in, pick a target format, watch them convert, then open any file in
a Quick Look–style previewer.

Built with React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, Lucide
icons and Zustand. JSZip and highlight.js are lazy-loaded.

## Run locally

```sh
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build in dist/
```

## Deploy to Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Keep the defaults. Vercel detects Vite (`npm run build` → `dist`). Click **Deploy**.

No environment variables are needed. From the CLI: `npx vercel --prod`.

## Features

The app has four sections: **Convert**, **Open**, **Browse** and **Account**. It follows the system's light or dark appearance (with a toggle), and guests' files are kept in the browser between visits.

### Convert
- Drop files, choose them, or paste with `⌘/Ctrl V`. Pick one target format
  for the batch or one per file, then convert.
- A two-worker queue with progress, stop, retry and re-convert. Statuses:
  Pending, Queued, Converting, Ready, Failed.
- A Files list with filters, search and **Download All as ZIP**. Click a file
  for a preview (zoomable images, custom audio/video players, highlighted
  text, CSV tables, PDF, ZIP contents, hex view) with full metadata and
  SHA-256.

### Open (viewer + quick editor)
- **Images:** rotate, flip, crop (free, 1:1, 4:3, 16:9), brightness, contrast,
  saturation, black & white, resize, and export as PNG/JPG/WEBP.
- **Text and code:** an editor with find and replace, match case, line
  numbers, wrapping, JSON format/minify, and word and character counts.
- **Audio:** trim with handles on the real waveform, preview the selection,
  export as WAV.
- **Video:** capture any frame as PNG or JPG.
- **Everything else:** a viewer, plus "Edit as text" for files under 5 MB.
- Edits can be downloaded or saved back into Files. "Edit" in the preview
  opens any file from your list here.

### Browse (in-app web browser)
- Tabs (up to 8) that keep their pages loaded while you switch between them,
  with an address bar for URLs or searches (DuckDuckGo), back, forward,
  reload/stop and a loading bar.
- Tabs, back/forward history and recently visited sites are saved, and
  encrypted with everything else for signed-in accounts. The open page is
  in the URL (`#/browse?url=…`).
- Searches use Google in its embeddable mode (`igu=1`). Links to YouTube,
  Google Maps, Google Docs/Sheets/Slides, Google Drive files, Vimeo and Spotify
  are rewritten to each service's official embeddable version.
- **Limit:** many sites (GitHub, most social networks, banks) forbid being
  shown inside another website, and browsers enforce that. OmniConvert
  detects this before loading and shows a "Can't Be Shown Here" card with
  **Open in New Tab** instead of a blank frame.
- Because pages are other websites (cross-origin), the app can't read where
  a page's own links lead. Address-bar navigation is tracked exactly. After
  you click links inside a page, **Back** returns to the page you opened.
- Pages run in a sandboxed `<iframe>` with no access to OmniConvert's data.

### Account
- Create an account or sign in. **Stay signed in** keeps you signed in on
  that device for 30 days. The forms are set up so the browser can offer to
  save your password.
- Your history (files added, converted, edited, removed, sign-ins), an
  overview, password change and account deletion.
- When you sign up, you can bring the files already on the page into the
  account.

## Security

OmniConvert has no server: accounts live **on the device**, and the security
comes from encryption in the browser.

- The password is **never stored**. PBKDF2-SHA-256 (600,000 iterations,
  random salt) turns it into a key that unlocks the account's random AES-256
  data key.
- Every file, the file list and the history are **encrypted with AES-GCM**
  before they're written to IndexedDB.
- "Stay signed in" stores the data key as a **non-extractable** `CryptoKey`.
  The browser can use it, but no script can read its bytes. It expires after
  30 days, and signing out deletes it.
- Wrong passwords return a generic error, and after 5 failures you have to
  wait 30 seconds.
- `vercel.json` sends a strict Content-Security-Policy (no third-party
  scripts, the inline theme script pinned by hash), plus HSTS,
  `X-Frame-Options: DENY`, `nosniff`, a no-referrer policy and
  Permissions-Policy.

**Limits:** accounts don't sync between devices or browsers, and a forgotten
password can't be recovered because nobody else holds the key. Clearing the
browser's site data deletes accounts on that device. Cross-device accounts
would need a backend (for example Supabase or Vercel Postgres with an auth
provider).

## Accessibility & interface quality

OmniConvert is checked against [Vercel's Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
(installed as the `web-design-guidelines` agent skill) and scanned with axe-core
on every screen in light and dark mode.

- A skip link, a heading on every page, landmarks, and labelled controls.
  Decorative icons are hidden from screen readers. Toasts and status
  changes are announced.
- Everything works from the keyboard: file rows are buttons, menus support
  arrow keys, dialogs trap focus and give it back when they close, and there
  are keyboard alternatives for drag gestures (crop, pan, trim).
- Text meets WCAG AA contrast in both themes. Focus rings are always visible
  when using the keyboard.
- Forms: errors appear next to the field they're about, focus moves to the
  first error, the submit button stays enabled until you submit and then
  shows a spinner, and fields have the right `autocomplete`, `inputmode` and
  `name` so password managers work.
- Removing or clearing files can be undone. Removing everything and clearing
  your history ask for confirmation first. You're warned before leaving with
  unsaved edits.
- The URL holds the filter, search, open preview and sign-in/sign-up tab, so
  any view can be linked or reloaded.
- Respects `prefers-reduced-motion` (CSS and Framer Motion) and animates
  only `transform` and `opacity`. Long lists skip rendering off-screen rows
  with `content-visibility`.
- Notch-safe layout, `theme-color`, `touch-action: manipulation`, and
  dates, times and numbers formatted with `Intl`.

## Serverless function

`api/frame-check.js` (deployed automatically by Vercel) tells the Browse
panel whether a site allows embedding (`X-Frame-Options` / CSP
`frame-ancestors`) and returns the page title. It reads response headers and
at most 96 KB of HTML and never forwards page content, so it isn't a proxy.
It only fetches public `http(s)` addresses on standard ports: every redirect
hop is checked against private, loopback and link-local ranges (including
cloud metadata IPs), and the connection is pinned to the checked IP.

## Conversions

These run for real, on your device (marked with a hint like "192 kbps" in the format menu):

| From | To |
|---|---|
| Images (PNG, JPG, WEBP, GIF, BMP, SVG, AVIF, ICO) and iPhone **HEIC/HEIF** | PNG, JPG, WEBP, BMP, ICO, PDF, GIF |
| Video | **MP3**, **animated GIF** (first 15 s), **MP4**, **WEBM**, WAV, PNG/JPG frame |
| Audio | **MP3** (192 kbps), WAV, and WEBM / M4A / OGG / OPUS where the browser can record them |
| PDF | TXT, **DOCX**, HTML, Markdown, PNG/JPG (pages stacked, up to 10) |
| DOCX, ODT, PPTX | TXT, PDF, HTML, Markdown, DOCX |
| XLSX | CSV, TSV, JSON, HTML, Markdown, PDF |
| CSV / TSV | **XLSX**, JSON, CSV, TSV, HTML, Markdown, PDF |
| JSON | CSV, YAML, pretty JSON |
| Text / code | PDF, **DOCX**, highlighted HTML, Markdown, TXT, JSON |
| ZIP / any file | ZIP |

How it works: MP3 uses the LAME encoder (lamejs), GIFs use gifenc, HEIC uses
libheif compiled to WebAssembly, and PDFs use Mozilla's pdf.js. DOCX/XLSX are
written as standard Office Open XML. WEBM/MP4/M4A/OGG/OPUS are re-encoded by
playing the media silently and recording it with the browser's
`MediaRecorder`, so they take about as long as the clip. MP4 asks for H.264 +
AAC first. The heavy libraries only download when you convert a file that
needs them.

A few targets have no browser encoder (HEIC/AVIF/TIFF output, FLAC, MOV,
EPUB, 7Z, fonts, and anything a particular browser can't record). These are
labelled **Preview only**. Choosing one makes a clearly marked preview copy
that still contains the original data, and the file list says so. Real
conversions that fail (an unsupported codec, a scanned PDF with no text) say
why and what to try instead.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl V` | Paste files or text |
| `⌘/Ctrl O` | Open the file picker |
| `⌘/Ctrl ↵` | Start conversion |
| `Esc` | Close the preview |
| `←` / `→` | Previous / next file in the preview |
| `+` `−` `0` `1` `R` | Image zoom in / out / fit / 1:1 / rotate |
| `Shift` + arrows | Pan a zoomed image |
| Arrows / `Alt` + arrows | Move / resize the crop box (`Enter` applies, `Esc` cancels) |
| `Space` `J` `L` `M` `F` | Media play / back / forward / mute / fullscreen |

## Project layout

```
src/
  App.tsx                  layout, global paste/drop/shortcut handlers
  lib/
    formats.ts             type detection, MIME map, valid targets per type
    converters.ts          on-device converters (canvas, WebAudio, PDF writer, CSV/JSON/YAML)
    store.ts               Zustand store, upload + conversion queue, history
    db.ts                  IndexedDB: files (plain for guests, sealed for accounts), accounts, sessions
    crypto.ts              PBKDF2 key derivation, key wrapping, AES-GCM sealing
    auth.ts                on-device accounts: sign up/in/out, stay signed in, change password, delete
    persistence.ts         saves each vault (guest: localStorage, account: encrypted IndexedDB)
    router.ts / opener.ts  hash routes; the file open in the editor
    browser.ts             Browse tabs, per-tab history, address-bar parsing
    exportZip.ts           "Download All as ZIP"
  components/
    Header, Workspace (dropzone + format bar), Shelf, FileCard, FormatSelect, Toasts
    AccountPage            sign in / create account, history, security
    opener/                OpenerPage, ImageEditor, TextEditor, MediaEditors
    browse/                BrowsePage (tabs, toolbar, sandboxed frames, start page)
api/
  frame-check.js           Vercel function: can this URL be embedded? + page title
    preview/               PreviewModal, ImageViewer, MediaPlayer, TextViewer, FallbackViews
```
