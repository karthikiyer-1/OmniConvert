import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  Music2,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { t } from "@/lib/motion";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function MediaPlayer({ url, blob, kind, name }: { url: string; blob?: Blob; kind: "video" | "audio"; name: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [vol, setVol] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<number>();

  const toggle = useCallback(() => {
    const m = media.current;
    if (!m) return;
    if (m.paused) m.play().catch((e) => setError(e.message));
    else m.pause();
  }, []);

  const seek = (t: number) => {
    if (media.current) media.current.currentTime = Math.max(0, Math.min(dur || 0, t));
  };

  useEffect(() => {
    const m = media.current;
    if (!m) return;
    m.volume = vol;
    m.muted = muted;
    m.playbackRate = speed;
    m.loop = loop;
  }, [vol, muted, speed, loop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,button")) return;
      const m = media.current;
      if (!m) return;
      if (e.key === " " || e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key.toLowerCase() === "j") m.currentTime -= 10;
      else if (e.key.toLowerCase() === "l") m.currentTime += 10;
      else if (e.key.toLowerCase() === "m") setMuted((v) => !v);
      else if (e.key.toLowerCase() === "f" && kind === "video") toggleFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, kind]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.current?.requestFullscreen?.();
  };

  const poke = () => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2400);
  };

  const events = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => setDur(e.currentTarget.duration),
    onDurationChange: (e: React.SyntheticEvent<HTMLMediaElement>) =>
      Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration),
    onProgress: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const b = e.currentTarget.buffered;
      if (b.length) setBuffered(b.end(b.length - 1));
    },
    onError: () => setError("This browser can't play this codec. Download the file to play it locally."),
  };

  const VolIcon = muted || vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  const pct = dur ? (time / dur) * 100 : 0;
  const dark = kind === "video";

  const controls = (
    <div className={cn("w-full", dark ? "text-white" : "text-fg")}>
      {/* Scrubber */}
      <div className="group/scrub relative flex h-4 items-center">
        <div className={cn("absolute inset-x-0 h-1 rounded-full", dark ? "bg-white/15" : "bg-fg/10")}>
          <div className={cn("h-full rounded-full", dark ? "bg-white/25" : "bg-fg/15")} style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.01}
          value={time}
          onChange={(e) => seek(+e.target.value)}
          className={cn("slider relative w-full", dark && "on-dark")}
          style={{ ["--pct" as string]: `${pct}%` }}
          aria-label="Seek"
        />
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white")} onClick={() => seek(time - 10)} title="Back 10s (J)">
          <RotateCcw size={16} />
        </button>
        <button
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition duration-200 ease-apple active:scale-95",
            dark ? "bg-white text-black hover:bg-white/85" : "bg-fg text-bg hover:bg-fg/85",
          )}
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
        </button>
        <button className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white")} onClick={() => seek(time + 10)} title="Forward 10s (L)">
          <RotateCw size={16} />
        </button>
        <span className={cn("ml-2 text-caption font-medium tabular-nums", dark ? "text-white/80" : "text-muted")}>
          {formatDuration(time)} / {formatDuration(dur)}
        </span>
        <div className="flex-1" />
        <div className="group/vol flex items-center">
          <button className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white")} onClick={() => setMuted((v) => !v)} title="Mute (M)">
            <VolIcon size={17} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : vol}
            onChange={(e) => {
              setVol(+e.target.value);
              setMuted(false);
            }}
            className={cn("slider w-0 opacity-0 transition-all duration-300 group-hover/vol:w-20 group-hover/vol:opacity-100 max-sm:hidden", dark && "on-dark")}
            style={{ ["--pct" as string]: `${(muted ? 0 : vol) * 100}%` }}
            aria-label="Volume"
          />
        </div>
        <button
          className={cn("h-9 min-w-[44px] rounded-full px-2 text-caption font-semibold tabular-nums transition duration-200", dark ? "text-white/90 hover:bg-white/15" : "text-muted hover:bg-fg/[0.07] hover:text-fg")}
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          title="Playback speed"
        >
          {speed}×
        </button>
        <button
          className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white", loop && (dark ? "!text-white bg-white/20" : "!text-fg bg-fg/[0.08]"))}
          onClick={() => setLoop((v) => !v)}
          title="Loop"
        >
          <Repeat size={15} />
        </button>
        {kind === "video" && (
          <>
            {"pictureInPictureEnabled" in document && (
              <button
                className="icon-btn text-white/90 hover:bg-white/15 hover:text-white max-sm:hidden"
                onClick={() => media.current?.requestPictureInPicture?.().catch(() => {})}
                title="Picture in Picture"
              >
                <PictureInPicture2 size={16} />
              </button>
            )}
            <button className="icon-btn text-white/90 hover:bg-white/15 hover:text-white" onClick={toggleFull} title="Fullscreen (F)">
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (kind === "video") {
    return (
      <div
        ref={wrap}
        className="relative flex h-full w-full items-center justify-center bg-black"
        onMouseMove={poke}
        onMouseLeave={() => playing && setIdle(true)}
        style={{ cursor: idle && playing ? "none" : "default" }}
      >
        <video ref={media} src={url} className="max-h-full max-w-full" onClick={toggle} onDoubleClick={toggleFull} playsInline {...events} />
        <AnimatePresence>
          {!playing && !error && (
            <motion.button
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={t.base}
              onClick={toggle}
              className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.18] text-white backdrop-blur-[20px] transition-colors hover:bg-white/25"
              aria-label="Play"
            >
              <Play size={26} fill="currentColor" strokeWidth={0} className="ml-1" />
            </motion.button>
          )}
        </AnimatePresence>
        {error && <p className="absolute max-w-sm px-6 text-center text-footnote text-white/80">{error}</p>}
        <motion.div
          animate={{ opacity: idle && playing ? 0 : 1, y: idle && playing ? 10 : 0 }}
          transition={t.base}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-4 pt-16 md:px-8"
        >
          {controls}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto px-6 py-10 md:px-16">
      <div className="w-full max-w-[560px]">
        <div className="mx-auto mb-8 flex aspect-square w-40 items-center justify-center rounded-[28px] bg-fg/[0.05] text-muted md:w-48">
          <Music2 size={56} strokeWidth={1.25} />
        </div>
        <p className="truncate text-center font-display text-title font-semibold">{name.replace(/\.[^.]+$/, "")}</p>
        <p className="mt-1 text-center text-footnote uppercase tracking-[0.06em] text-subtle">{name.split(".").pop()} audio</p>
        <div className="mt-10">
          <Waveform blob={blob} progress={dur ? time / dur : 0} onSeek={(f) => seek(f * dur)} />
        </div>
        <div className="mt-6">{controls}</div>
        {error && <p className="mt-4 text-center text-footnote text-danger">{error}</p>}
        <audio ref={media} src={url} preload="metadata" {...events} />
      </div>
    </div>
  );
}

/** Real waveform from decoded PCM, with a click-to-seek progress overlay. */
function Waveform({ blob, progress, onSeek }: { blob?: Blob; progress: number; onSeek: (f: number) => void }) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const BARS = 120;

  useEffect(() => {
    if (!blob || blob.size > 60 * 1024 * 1024) return;
    let cancelled = false;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    blob
      .arrayBuffer()
      .then((b) => ctx.decodeAudioData(b))
      .then((audio) => {
        if (cancelled) return;
        const data = audio.getChannelData(0);
        const step = Math.floor(data.length / BARS) || 1;
        const out: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let max = 0;
          for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) max = Math.max(max, Math.abs(data[j]));
          out.push(max);
        }
        const top = Math.max(...out, 0.01);
        setPeaks(out.map((p) => p / top));
      })
      .catch(() => {})
      .finally(() => ctx.close());
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const bars = peaks ?? Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.35)));

  return (
    <div
      className="flex h-16 cursor-pointer items-center gap-[2px]"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - r.left) / r.width);
      }}
      title="Click to seek"
    >
      {bars.map((p, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-full transition-[background-color,height] duration-500 ease-apple", i / BARS < progress ? "bg-fg" : "bg-fg/[0.12]")}
          style={{ height: `${Math.max(6, p * 100)}%` }}
        />
      ))}
    </div>
  );
}
