import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlipHorizontal2, FlipVertical2, Lock, RotateCcw, RotateCw, Undo2, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useOpener, type OpenFile } from "@/lib/opener";
import { Choice, NumberField, Section, Slider } from "./Controls";
import { download, editedName, saveToFiles } from "./actions";
import { InfoCard } from "../preview/FallbackViews";

interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
}
const NEUTRAL: Adjust = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0 };
type Rect = { x: number; y: number; w: number; h: number };
type Aspect = "free" | "1" | "4:3" | "16:9";
const RATIO: Record<Aspect, number | null> = { free: null, "1": 1, "4:3": 4 / 3, "16:9": 16 / 9 };
type Format = "png" | "jpg" | "webp";
const MIME: Record<Format, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const cloneCanvas = (src: HTMLCanvasElement) => {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
};

/** Same maths as the CSS filter functions, so the export matches the preview. */
function applyAdjust(data: ImageData, a: Adjust) {
  const px = data.data;
  const b = a.brightness / 100;
  const c = a.contrast / 100;
  const s = a.saturation / 100;
  const g = a.grayscale / 100;
  const gs = 1 - g;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] / 255;
    let gr = px[i + 1] / 255;
    let bl = px[i + 2] / 255;
    r *= b; gr *= b; bl *= b;
    r = (r - 0.5) * c + 0.5; gr = (gr - 0.5) * c + 0.5; bl = (bl - 0.5) * c + 0.5;
    const sr = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * gr + (0.072 - 0.072 * s) * bl;
    const sg = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * gr + (0.072 - 0.072 * s) * bl;
    const sb = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * gr + (0.072 + 0.928 * s) * bl;
    r = (0.2126 + 0.7874 * gs) * sr + (0.7152 - 0.7152 * gs) * sg + (0.0722 - 0.0722 * gs) * sb;
    gr = (0.2126 - 0.2126 * gs) * sr + (0.7152 + 0.2848 * gs) * sg + (0.0722 - 0.0722 * gs) * sb;
    bl = (0.2126 - 0.2126 * gs) * sr + (0.7152 - 0.7152 * gs) * sg + (0.0722 + 0.9278 * gs) * sb;
    px[i] = Math.max(0, Math.min(255, r * 255));
    px[i + 1] = Math.max(0, Math.min(255, gr * 255));
    px[i + 2] = Math.max(0, Math.min(255, bl * 255));
  }
}

export function ImageEditor({ file }: { file: OpenFile }) {
  const toast = useStore((s) => s.toast);
  const base = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [undo, setUndo] = useState<HTMLCanvasElement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Adjust>(NEUTRAL);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState<Aspect>("free");
  const [resize, setResize] = useState({ w: 0, h: 0, lock: true });
  const [format, setFormat] = useState<Format>(file.ext === "jpg" || file.ext === "jpeg" ? "jpg" : file.ext === "webp" ? "webp" : "png");
  const [quality, setQuality] = useState(90);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const setDirty = useOpener((s) => s.setDirty);
  const adjustKey = JSON.stringify(adjust);
  const [saved, setSaved] = useState({ steps: 0, adjust: JSON.stringify(NEUTRAL) });

  // Unsaved = the edit stack or adjustments differ from the last load/save.
  useEffect(() => {
    setDirty(undo.length !== saved.steps || adjustKey !== saved.adjust);
  }, [undo.length, adjustKey, saved, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  // Load the image into the working canvas.
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file.blob);
    const img = new Image();
    img.src = url;
    img
      .decode()
      .then(() => {
        if (cancelled) return;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || 1024;
        c.height = img.naturalHeight || 768;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        base.current = c;
        setSize({ w: c.width, h: c.height });
        setResize({ w: c.width, h: c.height, lock: true });
        setVersion((v) => v + 1);
      })
      .catch(() => !cancelled && setError("This browser can’t edit this image type. Convert it to PNG or JPG first, then open it here."))
      .finally(() => URL.revokeObjectURL(url));
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Paint the working canvas into the visible one.
  useLayoutEffect(() => {
    const b = base.current;
    const v = view.current;
    if (!b || !v) return;
    v.width = b.width;
    v.height = b.height;
    v.getContext("2d")!.drawImage(b, 0, 0);
  }, [version]);

  useEffect(() => {
    if (!stage.current) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);

  const scale = size.w ? Math.min(1, (box.w - 64) / size.w, (box.h - 64) / size.h) : 1;

  /** Replace the working canvas, keeping an undo step. */
  const commit = useCallback((next: HTMLCanvasElement) => {
    if (base.current) setUndo((u) => [...u.slice(-14), base.current!]);
    base.current = next;
    setSize({ w: next.width, h: next.height });
    setResize((r) => ({ ...r, w: next.width, h: next.height }));
    setVersion((v) => v + 1);
  }, []);

  const transform = (kind: "cw" | "ccw" | "fh" | "fv") => {
    const b = base.current;
    if (!b) return;
    const rotate = kind === "cw" || kind === "ccw";
    const c = document.createElement("canvas");
    c.width = rotate ? b.height : b.width;
    c.height = rotate ? b.width : b.height;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    if (kind === "cw") ctx.rotate(Math.PI / 2);
    if (kind === "ccw") ctx.rotate(-Math.PI / 2);
    if (kind === "fh") ctx.scale(-1, 1);
    if (kind === "fv") ctx.scale(1, -1);
    ctx.drawImage(b, -b.width / 2, -b.height / 2);
    setCrop(null);
    commit(c);
  };

  const startCrop = (a: Aspect = aspect) => {
    const r = RATIO[a];
    let w = size.w * 0.8;
    let h = size.h * 0.8;
    if (r) {
      if (w / h > r) w = h * r;
      else h = w / r;
    }
    setCrop({ x: (size.w - w) / 2, y: (size.h - h) / 2, w, h });
  };

  const applyCrop = () => {
    const b = base.current;
    if (!b || !crop) return;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(crop.w));
    c.height = Math.max(1, Math.round(crop.h));
    c.getContext("2d")!.drawImage(b, Math.round(crop.x), Math.round(crop.y), c.width, c.height, 0, 0, c.width, c.height);
    setCrop(null);
    commit(c);
  };

  const applyResize = () => {
    const b = base.current;
    if (!b || (resize.w === b.width && resize.h === b.height)) return;
    const c = document.createElement("canvas");
    c.width = resize.w;
    c.height = resize.h;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(b, 0, 0, c.width, c.height);
    commit(c);
  };

  const doUndo = () => {
    const prev = undo[undo.length - 1];
    if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    base.current = prev;
    setSize({ w: prev.width, h: prev.height });
    setResize((r) => ({ ...r, w: prev.width, h: prev.height }));
    setCrop(null);
    setVersion((v) => v + 1);
  };

  const reset = () => {
    if (undo.length) {
      const first = undo[0];
      setUndo([]);
      base.current = first;
      setSize({ w: first.width, h: first.height });
      setResize({ w: first.width, h: first.height, lock: true });
      setVersion((v) => v + 1);
    }
    setCrop(null);
    setAdjust(NEUTRAL);
  };

  const render = async (): Promise<Blob> => {
    const b = base.current!;
    const c = format === "jpg" ? (() => {
      const o = document.createElement("canvas");
      o.width = b.width;
      o.height = b.height;
      const ctx = o.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, o.width, o.height);
      ctx.drawImage(b, 0, 0);
      return o;
    })() : cloneCanvas(b);
    const ctx = c.getContext("2d")!;
    if (JSON.stringify(adjust) !== JSON.stringify(NEUTRAL)) {
      const data = ctx.getImageData(0, 0, c.width, c.height);
      applyAdjust(data, adjust);
      ctx.putImageData(data, 0, 0);
    }
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, MIME[format], quality / 100));
    if (!blob) throw new Error("Couldn’t encode the image. Try PNG, or a smaller size.");
    if (format === "webp" && blob.type !== "image/webp") throw new Error("This browser can’t save WEBP. Choose PNG or JPG instead.");
    return blob;
  };

  const act = async (kind: "download" | "save") => {
    try {
      const blob = await render();
      const name = editedName(file.name, format);
      if (kind === "download") download(blob, name);
      else {
        saveToFiles(blob, name, `${size.w} × ${size.h}`);
        toast({ tone: "success", title: "Saved to Files", body: name });
      }
      // Either way the edits are now kept somewhere.
      setSaved({ steps: undo.length, adjust: adjustKey });
    } catch (e) {
      toast({ tone: "error", title: "Couldn’t save the image", body: (e as Error).message });
    }
  };

  /* ---------------------------------------------------------- crop handles */
  const drag = useRef<{ mode: string; x: number; y: number; r: Rect } | null>(null);
  const onCropDown = (mode: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, r: crop! };
  };
  const onCropMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    const ratio = RATIO[aspect];
    let { x, y, w, h } = d.r;
    if (d.mode === "move") {
      x = Math.max(0, Math.min(size.w - w, x + dx));
      y = Math.max(0, Math.min(size.h - h, y + dy));
    } else {
      const left = d.mode.includes("w");
      const top = d.mode.includes("n");
      let nw = Math.max(16, w + (left ? -dx : dx));
      let nh = Math.max(16, h + (top ? -dy : dy));
      if (ratio) nh = nw / ratio;
      // Keep inside the image.
      const maxW = left ? x + w : size.w - x;
      const maxH = top ? y + h : size.h - y;
      if (nw > maxW) { nw = maxW; if (ratio) nh = nw / ratio; }
      if (nh > maxH) { nh = maxH; if (ratio) nw = nh * ratio; }
      x = left ? x + w - nw : x;
      y = top ? y + h - nh : y;
      w = nw;
      h = nh;
    }
    setCrop({ x, y, w, h });
  };
  const onCropUp = () => (drag.current = null);

  /** Keyboard alternative to dragging: arrows move, Shift = 10px, Alt+arrows resize. */
  const onCropKey = (e: React.KeyboardEvent) => {
    if (!crop || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Enter") return applyCrop();
    if (e.key === "Escape") return setCrop(null);
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const ratio = RATIO[aspect];
    let { x, y, w, h } = crop;
    if (e.altKey) {
      w = Math.max(16, Math.min(size.w - x, w + dx + (ratio ? dy * ratio : 0)));
      h = ratio ? w / ratio : Math.max(16, Math.min(size.h - y, h + dy));
      if (y + h > size.h) { h = size.h - y; if (ratio) w = h * ratio; }
    } else {
      x = Math.max(0, Math.min(size.w - w, x + dx));
      y = Math.max(0, Math.min(size.h - h, y + dy));
    }
    setCrop({ x, y, w, h });
  };

  if (error) return <InfoCard kind="image" name={file.name} blob={file.blob} message={error} />;

  const filter = `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%) grayscale(${adjust.grayscale}%)`;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Canvas */}
      <div ref={stage} className="relative flex min-h-[360px] flex-1 select-none items-center justify-center overflow-hidden bg-bg/60">
        <div className="relative" style={{ width: size.w * scale, height: size.h * scale }}>
          <canvas ref={view} className="block h-full w-full" style={{ filter }} role="img" aria-label={`${file.name}, ${size.w} by ${size.h} pixels`} />
          {crop && (
            <div className="absolute inset-0 overflow-hidden" onPointerMove={onCropMove} onPointerUp={onCropUp}>
              <div
                className="absolute cursor-move touch-none focus-visible:outline-offset-2"
                tabIndex={0}
                role="group"
                aria-label={`Crop area ${Math.round(crop.w)} by ${Math.round(crop.h)}. Arrow keys move, Alt plus arrows resize, Enter applies, Escape cancels.`}
                onKeyDown={onCropKey}
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: crop.w * scale,
                  height: crop.h * scale,
                  boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(255 255 255 / 0.9)",
                }}
                onPointerDown={onCropDown("move")}
              >
                {/* Rule-of-thirds guides */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} style={{ boxShadow: "inset -0.5px -0.5px 0 rgb(255 255 255 / 0.35)" }} />
                  ))}
                </div>
                {(["nw", "ne", "sw", "se"] as const).map((m) => (
                  <div
                    key={m}
                    aria-hidden
                    onPointerDown={onCropDown(m)}
                    className={cn(
                      "absolute h-5 w-5",
                      m.includes("n") ? "-top-1" : "-bottom-1",
                      m.includes("w") ? "-left-1" : "-right-1",
                      m === "nw" || m === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                    )}
                    style={{
                      borderColor: "#fff",
                      borderStyle: "solid",
                      borderWidth: `${m.includes("n") ? 3 : 0}px ${m.includes("e") ? 3 : 0}px ${m.includes("s") ? 3 : 0}px ${m.includes("w") ? 3 : 0}px`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="material absolute left-6 top-6 rounded-full px-3 py-1 text-caption text-muted">
          {crop ? `${Math.round(crop.w)}\u00A0×\u00A0${Math.round(crop.h)}` : `${size.w}\u00A0×\u00A0${size.h}`}
        </div>
      </div>

      {/* Inspector */}
      <aside className="scroll-thin w-full shrink-0 overflow-y-auto bg-surface px-6 py-6 lg:w-[320px]" style={{ boxShadow: "-1px 0 0 var(--hairline)" }}>
        <Section title="Transform">
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["ccw", RotateCcw, "Rotate left"],
                ["cw", RotateCw, "Rotate right"],
                ["fh", FlipHorizontal2, "Flip horizontal"],
                ["fv", FlipVertical2, "Flip vertical"],
              ] as const
            ).map(([k, Icon, label]) => (
              <button key={k} className="btn-secondary h-10 px-0" onClick={() => transform(k)} title={label} aria-label={label}>
                <Icon aria-hidden size={17} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </Section>

        <Section title="Crop">
          <Choice
            label="Aspect ratio"
            value={aspect}
            onChange={(a) => {
              setAspect(a);
              if (crop) startCrop(a);
            }}
            options={[
              { value: "free", label: "Free" },
              { value: "1", label: "1:1" },
              { value: "4:3", label: "4:3" },
              { value: "16:9", label: "16:9" },
            ]}
          />
          <div className="mt-3 flex gap-2">
            {crop ? (
              <>
                <button className="btn-secondary flex-1" onClick={() => setCrop(null)}>
                  Cancel
                </button>
                <button className="btn-secondary flex-1 !bg-fg !text-bg hover:!bg-fg/85" onClick={applyCrop}>
                  Apply Crop
                </button>
              </>
            ) : (
              <button className="btn-secondary flex-1" onClick={() => startCrop()}>
                Crop
              </button>
            )}
          </div>
        </Section>

        <Section title="Adjust">
          <Slider label="Brightness" value={adjust.brightness} min={0} max={200} unit="%" onChange={(v) => setAdjust((a) => ({ ...a, brightness: v }))} />
          <Slider label="Contrast" value={adjust.contrast} min={0} max={200} unit="%" onChange={(v) => setAdjust((a) => ({ ...a, contrast: v }))} />
          <Slider label="Saturation" value={adjust.saturation} min={0} max={200} unit="%" onChange={(v) => setAdjust((a) => ({ ...a, saturation: v }))} />
          <Slider label="Black & white" value={adjust.grayscale} min={0} max={100} unit="%" onChange={(v) => setAdjust((a) => ({ ...a, grayscale: v }))} />
        </Section>

        <Section title="Resize">
          <div className="flex items-center gap-2">
            <NumberField
              label="W"
              name="resize-width"
              ariaLabel="Width in pixels"
              value={resize.w}
              onChange={(w) => setResize((r) => ({ ...r, w, h: r.lock ? Math.max(1, Math.round((w * size.h) / size.w)) : r.h }))}
            />
            <button
              className={cn("icon-btn", resize.lock && "text-fg")}
              onClick={() => setResize((r) => ({ ...r, lock: !r.lock }))}
              aria-label={resize.lock ? "Unlock aspect ratio" : "Lock aspect ratio"}
            >
              {resize.lock ? <Lock aria-hidden size={15} strokeWidth={1.75} /> : <Unlock aria-hidden size={15} strokeWidth={1.75} />}
            </button>
            <NumberField
              label="H"
              name="resize-height"
              ariaLabel="Height in pixels"
              value={resize.h}
              onChange={(h) => setResize((r) => ({ ...r, h, w: r.lock ? Math.max(1, Math.round((h * size.w) / size.h)) : r.w }))}
            />
          </div>
          <button className="btn-secondary mt-3 w-full" disabled={resize.w === size.w && resize.h === size.h} onClick={applyResize}>
            Apply Size
          </button>
        </Section>

        <Section title="Export">
          <Choice
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpg", label: "JPG" },
              { value: "webp", label: "WEBP" },
            ]}
          />
          {format !== "png" && <Slider label="Quality" value={quality} min={40} max={100} unit="%" onChange={setQuality} />}
          <div className="mt-4 flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => act("download")}>
              Download
            </button>
            <button className="btn-secondary flex-1 !bg-fg !text-bg hover:!bg-fg/85" onClick={() => act("save")}>
              Save to Files
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button className="btn-text flex-1 text-muted hover:text-fg" disabled={!undo.length} onClick={doUndo}>
              <Undo2 aria-hidden size={14} strokeWidth={1.75} /> Undo
            </button>
            <button className="btn-text flex-1 text-muted hover:text-fg" onClick={reset}>
              Reset
            </button>
          </div>
        </Section>
      </aside>
    </div>
  );
}
