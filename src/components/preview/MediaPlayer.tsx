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
      <div className="mt-1.5 flex items-center gap-1">
        <button className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white")} onClick={() => seek(time - 10)} title="Back 10s (J)">
          <RotateCcw size={16} />
        </button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition",
            dark ? "bg-white text-black hover:bg-white/90" : "bg-fg text-bg hover:opacity-90",
          )}
          onClick={toggle}
          title="Play/Pause (Space)"
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </motion.button>
        <button className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white")} onClick={() => seek(time + 10)} title="Forward 10s (L)">
          <RotateCw size={16} />
        </button>
        <span className={cn("ml-2 text-[12px] font-medium tabular-nums", dark ? "text-white/80" : "text-muted")}>
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
          className={cn("h-8 min-w-[42px] rounded-lg px-1.5 text-[12px] font-semibold tabular-nums transition", dark ? "text-white/90 hover:bg-white/15" : "text-muted hover:bg-fg/[0.07] hover:text-fg")}
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          title="Playback speed"
        >
          {speed}×
        </button>
        <button
          className={cn("icon-btn", dark && "text-white/90 hover:bg-white/15 hover:text-white", loop && (dark ? "!text-white bg-white/20" : "!text-accent bg-accent/10"))}
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={toggle}
              className="absolute flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xl"
              aria-label="Play"
            >
              <Play size={34} fill="currentColor" className="ml-1" />
            </motion.button>
          )}
        </AnimatePresence>
        {error && <p className="absolute max-w-sm rounded-2xl bg-black/60 px-5 py-4 text-center text-[13px] text-white backdrop-blur">{error}</p>}
        <motion.div
          animate={{ opacity: idle && playing ? 0 : 1, y: idle && playing ? 10 : 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-3 pt-14 sm:px-6"
        >
          {controls}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto p-4 sm:p-8">
      <div className="w-full max-w-xl">
        <div className="relative mx-auto mb-6 aspect-square w-48 overflow-hidden rounded-[28px] shadow-float sm:w-56">
          <div className="absolute inset-0 bg-gradient-to-br from-[#BF5AF2] via-[#5E5CE6] to-[#0A84FF]" />
          <motion.div
            className="absolute -inset-10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,.35),transparent_45%)]"
            animate={playing ? { rotate: 360 } : { rotate: 0 }}
            transition={playing ? { duration: 12, repeat: Infinity, ease: "linear" } : { duration: 0.6 }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Music2 size={64} className="text-white/90" strokeWidth={1.4} />
          </div>
          <div className="absolute inset-x-0 bottom-4 flex h-8 items-end justify-center gap-[3px]">
            {Array.from({ length: 18 }).map((_, i) => (
              <motion.span
                key={i}
                className="w-[3px] rounded-full bg-white/80"
                animate={playing ? { height: [6, 10 + ((i * 37) % 22), 6] } : { height: 4 }}
                transition={{ duration: 0.6 + (i % 5) * 0.12, repeat: playing ? Infinity : 0, ease: "easeInOut" }}
              />
            ))}
          </div>
        </div>
        <p className="truncate text-center text-[17px] font-semibold tracking-[-0.01em]">{name.replace(/\.[^.]+$/, "")}</p>
        <p className="mb-5 text-center text-[12.5px] uppercase tracking-wider text-muted">{name.split(".").pop()} audio</p>
        <Waveform blob={blob} progress={dur ? time / dur : 0} onSeek={(f) => seek(f * dur)} />
        <div className="glass mt-4 rounded-2xl px-4 py-3">{controls}</div>
        {error && <p className="mt-3 text-center text-[12.5px] text-danger">{error}</p>}
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
        <motion.span
          key={i}
          initial={{ scaleY: 0.1 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: i * 0.004, type: "spring", stiffness: 300, damping: 20 }}
          className={cn("flex-1 rounded-full transition-colors", i / BARS < progress ? "bg-accent" : "bg-fg/15")}
          style={{ height: `${Math.max(6, p * 100)}%` }}
        />
      ))}
    </div>
  );
}
