import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { captureFrame, decodeAudio, trimAudio } from "@/lib/converters";
import { useStore } from "@/lib/store";
import { cn, formatDuration, formatSeconds } from "@/lib/utils";
import type { OpenFile } from "@/lib/opener";
import { Choice, Section } from "./Controls";
import { download, editedName, saveToFiles } from "./actions";

/* ------------------------------------------------------------------ audio */

export function AudioEditor({ file }: { file: OpenFile }) {
  const toast = useStore((s) => s.toast);
  const audioEl = useRef<HTMLAudioElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    let cancelled = false;
    decodeAudio(file.blob)
      .then((buf) => {
        if (cancelled) return;
        setBuffer(buf);
        setRange([0, buf.duration]);
        const data = buf.getChannelData(0);
        const N = 160;
        const step = Math.floor(data.length / N) || 1;
        const out: number[] = [];
        for (let i = 0; i < N; i++) {
          let m = 0;
          for (let j = i * step; j < (i + 1) * step && j < data.length; j += 32) m = Math.max(m, Math.abs(data[j]));
          out.push(m);
        }
        const top = Math.max(...out, 0.01);
        setPeaks(out.map((p) => p / top));
      })
      .catch(() => !cancelled && setError("This browser can’t decode this audio. Convert it to WAV in the Convert tab, then open it here."));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(u);
    };
  }, [file]);

  const dur = buffer?.duration ?? 0;
  const [start, end] = range;

  const togglePlay = () => {
    const a = audioEl.current;
    if (!a) return;
    if (playing) return a.pause();
    if (a.currentTime < start || a.currentTime >= end - 0.05) a.currentTime = start;
    a.play();
  };

  const exportTrim = (kind: "download" | "save") => {
    if (!buffer) return;
    const blob = trimAudio(buffer, start, end);
    const name = editedName(file.name, "wav");
    if (kind === "download") download(blob, name);
    else {
      saveToFiles(blob, name, `${formatDuration(start)}–${formatDuration(end)}`);
      toast({ tone: "success", title: "Saved to Files", body: name });
    }
  };

  if (error) return <div className="flex h-full items-center justify-center px-8 text-center text-body text-muted">{error}</div>;

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto px-6 py-12 md:px-16">
      <div className="w-full max-w-[720px]">
        <p className="truncate text-center font-display text-title font-semibold" translate="no">
          {file.name.replace(/\.[^.]+$/, "")}
        </p>
        <p className="mt-1 text-center text-footnote text-muted">Drag the handles to choose the part you want to keep.</p>

        {/* Waveform with selection */}
        <div className="relative mt-12 h-28">
          <div className="absolute inset-0 flex items-center gap-[2px]">
            {(peaks.length ? peaks : Array(160).fill(0.2)).map((p, i) => {
              const at = ((i + 0.5) / (peaks.length || 160)) * dur;
              const inside = at >= start && at <= end;
              return (
                <span
                  key={i}
                  className={cn("flex-1 rounded-full transition-colors duration-200", inside ? (at <= time ? "bg-accent" : "bg-fg") : "bg-fg/[0.12]")}
                  style={{ height: `${Math.max(4, p * 100)}%` }}
                />
              );
            })}
          </div>
          {dur > 0 && (
            <>
              <input
                type="range"
                aria-label="Selection start"
                aria-valuetext={formatDuration(start)}
                min={0}
                max={dur}
                step={0.01}
                value={start}
                onChange={(e) => setRange([Math.min(+e.target.value, end - 0.1), end])}
                className="trim-handle absolute inset-0 h-full w-full"
              />
              <input
                type="range"
                aria-label="Selection end"
                aria-valuetext={formatDuration(end)}
                min={0}
                max={dur}
                step={0.01}
                value={end}
                onChange={(e) => setRange([start, Math.max(+e.target.value, start + 0.1)])}
                className="trim-handle absolute inset-0 h-full w-full"
              />
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between text-footnote tabular-nums text-muted" aria-live="polite">
          <span>Start {formatDuration(start)}</span>
          <span className="text-fg">{formatSeconds(end - start)} selected</span>
          <span>End {formatDuration(end)}</span>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-bg transition duration-200 ease-apple hover:bg-fg/85 active:scale-95"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play selection"}
          >
            {playing ? <Pause aria-hidden size={18} fill="currentColor" strokeWidth={0} /> : <Play aria-hidden size={18} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
          </button>
          <button className="btn-secondary h-11 px-5" disabled={!buffer} onClick={() => exportTrim("download")}>
            Download WAV
          </button>
          <button className="btn-secondary h-11 px-5 !bg-fg !text-bg hover:!bg-fg/85" disabled={!buffer} onClick={() => exportTrim("save")}>
            Save to Files
          </button>
        </div>
        <audio
          ref={audioEl}
          src={url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setTime(t);
            if (t >= end) e.currentTarget.pause();
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ video */

export function VideoEditor({ file }: { file: OpenFile }) {
  const toast = useStore((s) => s.toast);
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const grab = async (kind: "download" | "save") => {
    const t = video.current?.currentTime ?? 0;
    setBusy(true);
    try {
      const blob = await captureFrame(file.blob, t, format);
      const name = `${file.name.replace(/\.[^.]+$/, "")} frame ${formatDuration(t).replace(":", ".")}.${format}`;
      if (kind === "download") download(blob, name);
      else {
        saveToFiles(blob, name, `Frame at ${formatDuration(t)}`);
        toast({ tone: "success", title: "Frame saved to Files", body: name });
      }
    } catch (e) {
      toast({ tone: "error", title: "Couldn’t capture the frame", body: `${(e as Error).message}. Try a different moment.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-[320px] flex-1 items-center justify-center bg-black">
        {url && <video ref={video} src={url} controls playsInline aria-label={file.name} className="max-h-full max-w-full" />}
      </div>
      <aside className="w-full shrink-0 bg-surface px-6 py-6 lg:w-[320px]" style={{ boxShadow: "-1px 0 0 var(--hairline)" }}>
        <Section title="Capture Frame">
          <p className="mb-4 text-footnote text-muted">Pause on the frame you want, then save it as an image.</p>
          <Choice
            label="Image format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpg", label: "JPG" },
            ]}
          />
          <div className="mt-4 flex gap-2">
            <button className="btn-secondary flex-1" disabled={busy} onClick={() => grab("download")}>
              Download
            </button>
            <button className="btn-secondary flex-1 !bg-fg !text-bg hover:!bg-fg/85" disabled={busy} onClick={() => grab("save")}>
              Save to Files
            </button>
          </div>
        </Section>
      </aside>
    </div>
  );
}
