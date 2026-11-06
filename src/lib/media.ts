/**
 * Real audio/video conversions that run entirely in the browser.
 *  - MP3: decode with WebAudio, encode with LAME (lamejs).
 *  - GIF: sample video frames onto a canvas, encode with gifenc.
 *  - WEBM / MP4 / M4A / OGG / OPUS: play the media silently through
 *    WebAudio + captureStream and record it with the browser's own
 *    MediaRecorder (only offered for formats the browser can record).
 */
import { decodeAudio } from "./converters";

export type Progress = (fraction: number, stage?: string) => void;

const tick = () => new Promise((r) => setTimeout(r, 0));

/* -------------------------------------------------------------------- MP3 */

export async function toMp3(blob: Blob, onProgress?: Progress, signal?: AbortSignal, kbps = 192): Promise<Blob> {
  onProgress?.(0.02, "Decoding audio…");
  const audio = await decodeAudio(blob);
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const channels = Math.min(2, audio.numberOfChannels);
  const enc = new Mp3Encoder(channels, audio.sampleRate, kbps);
  const toInt16 = (f: Float32Array) => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };
  const left = toInt16(audio.getChannelData(0));
  const right = channels > 1 ? toInt16(audio.getChannelData(1)) : undefined;
  const parts: BlobPart[] = [];
  const block = 1152 * 64;
  for (let i = 0; i < left.length; i += block) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const l = left.subarray(i, i + block);
    const buf = right ? enc.encodeBuffer(l, right.subarray(i, i + block)) : enc.encodeBuffer(l);
    if (buf.length) parts.push(new Uint8Array(buf));
    onProgress?.(0.05 + 0.93 * (i / left.length), `Encoding MP3 · ${kbps} kbps…`);
    await tick(); // keep the page responsive
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: "audio/mpeg" });
}

/* -------------------------------------------------------------------- GIF */

async function loadVideo(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error("This browser can’t decode this video"));
  });
  return { video, url };
}

const seek = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((res) => {
    v.onseeked = () => res();
    v.currentTime = t;
  });

export const GIF_MAX_SECONDS = 15;

export async function toGif(blob: Blob, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const { video, url } = await loadVideo(blob);
  try {
    const fps = 10;
    const duration = Math.min(video.duration || 0, GIF_MAX_SECONDS);
    const scale = Math.min(1, 480 / (video.videoWidth || 480));
    const w = Math.max(2, Math.round((video.videoWidth || 480) * scale));
    const h = Math.max(2, Math.round((video.videoHeight || 270) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const gif = GIFEncoder();
    const frames = Math.max(1, Math.floor(duration * fps));
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await seek(video, Math.min(i / fps, Math.max(0, (video.duration || 0) - 0.05)));
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: 1000 / fps });
      onProgress?.((i + 1) / frames, `Rendering GIF frame ${i + 1} of ${frames}…`);
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------------------------------------------------- MediaRecorder */

const RECORD_TYPES: Record<string, { video: string[]; audio: string[] }> = {
  webm: { video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"], audio: ["audio/webm;codecs=opus", "audio/webm"] },
  // H.264 + AAC first (plays everywhere, incl. iPhone/QuickTime); then whatever MP4 the browser offers.
  mp4: {
    video: ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,opus", "video/mp4"],
    audio: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"],
  },
  m4a: { video: [], audio: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"] },
  ogg: { video: [], audio: ["audio/ogg;codecs=opus", "audio/ogg"] },
  opus: { video: [], audio: ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"] },
};

/** The MIME type this browser can record `target` as (or null). */
export function recordType(target: string, withVideo: boolean): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const list = RECORD_TYPES[target]?.[withVideo ? "video" : "audio"] ?? [];
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/**
 * Re-encode by playing the media silently and recording it in real time.
 * Audio is routed through WebAudio (never to the speakers).
 */
export async function recordAs(blob: Blob, target: string, withVideo: boolean, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
  const mime = recordType(target, withVideo);
  if (!mime) throw new Error(`This browser can’t record ${target.toUpperCase()}`);
  const url = URL.createObjectURL(blob);
  const el = document.createElement(withVideo ? "video" : "audio") as HTMLVideoElement;
  el.src = url;
  el.preload = "auto";
  el.playsInline = true;
  el.crossOrigin = "anonymous";
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  try {
    await new Promise<void>((res, rej) => {
      el.onloadedmetadata = () => res();
      el.onerror = () => rej(new Error("This browser can’t decode this file"));
    });
    const tracks: MediaStreamTrack[] = [];
    if (withVideo) {
      const cs = (el as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream });
      const stream = cs.captureStream?.() ?? cs.mozCaptureStream?.();
      if (!stream) throw new Error("This browser can’t capture video");
      tracks.push(...stream.getVideoTracks());
    }
    const src = ac.createMediaElementSource(el);
    const dest = ac.createMediaStreamDestination();
    src.connect(dest); // not connected to ac.destination: silent
    tracks.push(...dest.stream.getAudioTracks());
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
    const dur = el.duration || 1;
    el.ontimeupdate = () => onProgress?.(Math.min(0.99, el.currentTime / dur), `Recording ${target.toUpperCase()} in real time · ${Math.round(el.currentTime)} of ${Math.round(dur)} s`);
    const abort = () => {
      el.pause();
      if (rec.state !== "inactive") rec.stop();
    };
    signal?.addEventListener("abort", abort);
    await ac.resume();
    rec.start(1000);
    await el.play();
    await new Promise<void>((res) => (el.onended = () => res()));
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    signal?.removeEventListener("abort", abort);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Blob(chunks, { type: mime.split(";")[0] });
  } finally {
    el.pause();
    URL.revokeObjectURL(url);
    ac.close();
  }
}
