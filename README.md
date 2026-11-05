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

The app has three sections: **Convert**, **Open** and **Account**. It follows the system's light or dark appearance (with a toggle), and guests' files are kept in the browser between visits.

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

## Real and simulated conversions

The browser does these conversions itself (marked **On-device** in the
format picker):

| From | To |
|---|---|
| Images (PNG, JPG, WEBP, GIF, BMP, SVG, AVIF, ICO) | PNG, JPG, WEBP, BMP, ICO, PDF |
| Video | PNG/JPG poster frame, WAV audio track |
| Audio | WAV (16-bit PCM) |
| CSV / TSV | JSON, CSV, TSV, HTML table, Markdown table, PDF |
| JSON | CSV, YAML, pretty JSON |
| Text / code | PDF, highlighted HTML, Markdown, TXT, JSON |
| ZIP / any file | ZIP (re-packed / compressed) |

Everything else (HEIC, MP4→GIF, PDF→DOCX and so on) goes through a
**simulated conversion**, marked **Cloud** in the picker. It shows realistic
progress, can hit an interruption and retry on its own, and fails after three
retries. If an on-device encoder fails (for example, a codec the browser can't
decode), the app falls back to the simulated conversion.

**Simulated outputs only contain the original file's bytes under the new name
and extension.** They are labelled "sim" on the shelf and "Cloud (simulated)"
in the previewer. To add real conversions, put a server-side converter behind
the simulated path in `src/lib/store.ts` (`runJob`).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl V` | Paste files or text |
| `⌘/Ctrl O` | Open the file picker |
| `⌘/Ctrl ↵` | Start conversion |
| `Esc` | Close the preview |
| `←` / `→` | Previous / next file in the preview |
| `+` `−` `0` `1` `R` | Image zoom in / out / fit / 1:1 / rotate |
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
    exportZip.ts           "Download All as ZIP"
  components/
    Header, Workspace (dropzone + format bar), Shelf, FileCard, FormatSelect, Toasts
    AccountPage            sign in / create account, history, security
    opener/                OpenerPage, ImageEditor, TextEditor, MediaEditors
    preview/               PreviewModal, ImageViewer, MediaPlayer, TextViewer, FallbackViews
```
