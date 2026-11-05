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

- **Drag-and-drop dropzone**: multi-file drops, a file picker, drops anywhere
  on the page, and `⌘/Ctrl V` to paste screenshots, copied files or plain text
  (pasted text becomes a `.txt`, or a `.json` if it parses as JSON).
- **Smart format picker**: suggests valid targets for the detected type and
  can set one target for the whole batch or a different one per file.
- **Conversion queue**: two workers run at once. Each file shows staged
  progress (upload → analyze → encode → optimize → finalize) and a status of
  Pending, Queued, Converting, Ready or Failed. You can stop, retry,
  re-convert, remove or clear.
- **File shelf**: filter tabs, search, thumbnails, the size change after
  conversion, quick actions, and **Download All as ZIP**.
- **Previewer** (opens when you click a card):
  - Images: zoom with the scroll wheel, trackpad pinch or `+`/`−`; drag to pan;
    double-click to zoom; fit and 1:1 views; rotate.
  - Video: a custom player with scrubbing, ±10 s skips, volume, speed, loop,
    picture-in-picture and fullscreen.
  - Audio: a custom player with a waveform drawn from the real audio data;
    click the waveform to seek.
  - Text and code: syntax highlighting, line numbers, wrapping, font size and
    copy. CSV and TSV files can also be shown as a table.
  - PDF: uses the browser's built-in PDF viewer.
  - ZIP: a browsable list of entries with the compression ratio.
  - Anything else: an info card showing the file signature (magic bytes) and a
    hex dump.
  - An info sidebar with MIME type, dimensions, duration, timestamps,
    SHA-256 and output details. You can also re-convert from there.
- **Persistence**: the shelf's metadata is saved in `localStorage`, and the
  file contents in IndexedDB (localStorage tops out at about 5 MB). After a
  page refresh the shelf and previews are still there.
- **Light and dark mode**: follows the system setting, can be toggled, and
  everything is driven by CSS variables.

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
    store.ts               Zustand store, persistence, upload + conversion queue
    db.ts                  IndexedDB storage for file contents
    exportZip.ts           "Download All as ZIP"
  components/
    Header, Workspace (dropzone + format bar), Shelf, FileCard, FormatSelect, Toasts
    preview/               PreviewModal, ImageViewer, MediaPlayer, TextViewer, FallbackViews
```
