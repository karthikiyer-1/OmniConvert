import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Maximize, Minus, Plus, RotateCw, Scan } from "lucide-react";

const MIN = 0.1;
const MAX = 16;

export function ImageViewer({ url, name }: { url: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const computeFit = useCallback(() => {
    if (!box.current || !natural) return 1;
    const r = box.current.getBoundingClientRect();
    const rotated = rot % 180 !== 0;
    const w = rotated ? natural.h : natural.w;
    const h = rotated ? natural.w : natural.h;
    return Math.min(1, (r.width - 48) / w, (r.height - 96) / h);
  }, [natural, rot]);

  const resetFit = useCallback(() => {
    const f = computeFit();
    setFit(f);
    setScale(f);
    setPos({ x: 0, y: 0 });
  }, [computeFit]);

  useEffect(() => {
    resetFit();
  }, [resetFit]);

  useEffect(() => {
    const ro = new ResizeObserver(() => setFit(computeFit()));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [computeFit]);

  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const zoomTo = useCallback((next: number, cx = 0, cy = 0) => {
    const s = scaleRef.current;
    const n = Math.min(MAX, Math.max(MIN, next));
    scaleRef.current = n;
    setScale(n);
    // Keep the point under the cursor stationary.
    setPos((p) => ({ x: cx - ((cx - p.x) * n) / s, y: cy - ((cy - p.y) * n) / s }));
  }, []);

  // Wheel zoom (non-passive so we can prevent page scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      zoomTo(scaleRef.current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "+" || e.key === "=") zoomTo(scale * 1.25);
      else if (e.key === "-" || e.key === "_") zoomTo(scale / 1.25);
      else if (e.key === "0") resetFit();
      else if (e.key === "1") zoomTo(1);
      else if (e.key.toLowerCase() === "r") setRot((r) => r + 90);
      else if (e.key.startsWith("Arrow") && e.shiftKey) {
        // Shift+arrows pan (plain arrows switch files in the preview).
        e.preventDefault();
        const d = 48;
        setPos((p) => ({
          x: p.x + (e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0),
          y: p.y + (e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0),
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scale, zoomTo, resetFit]);

  const pct = Math.round(scale * 100);

  return (
    <div
      ref={box}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      aria-describedby="image-viewer-help"
      style={{
        backgroundImage:
          "linear-gradient(45deg, rgb(var(--fg)/0.025) 25%, transparent 25%), linear-gradient(-45deg, rgb(var(--fg)/0.025) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(var(--fg)/0.025) 75%), linear-gradient(-45deg, transparent 75%, rgb(var(--fg)/0.025) 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
        cursor: dragging ? "grabbing" : scale > fit + 0.001 ? "grab" : "zoom-in",
      }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={(e) => {
        const r = box.current!.getBoundingClientRect();
        if (scale > fit * 1.05) resetFit();
        else zoomTo(Math.max(fit * 2.5, 1), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
      }}
    >
      <p id="image-viewer-help" className="sr-only">
        Use + and − to zoom, Shift plus arrow keys to pan, 0 to fit, 1 for actual size, R to rotate.
      </p>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.img
          src={url}
          alt={name}
          width={natural?.w}
          height={natural?.h}
          decoding="async"
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 800, h: e.currentTarget.naturalHeight || 600 })}
          initial={{ opacity: 0 }}
          animate={{ opacity: natural ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-none"
          style={{
            width: natural?.w,
            height: natural?.h,
            transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale}) rotate(${rot}deg)`,
            transition: dragging ? "none" : "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            imageRendering: scale > 3 ? "pixelated" : "auto",
          }}
        />
      </div>

      {/* Zoom controls */}
      <div
        className="material absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1 shadow-popover"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn rounded-full" onClick={() => zoomTo(scale / 1.25)} title="Zoom out (−)">
          <Minus aria-hidden size={15} />
        </button>
        <button className="w-14 text-center text-caption font-medium tabular-nums" onClick={() => zoomTo(1)} title="Actual size (1)">
          {pct}%
        </button>
        <button className="icon-btn rounded-full" onClick={() => zoomTo(scale * 1.25)} title="Zoom in (+)">
          <Plus aria-hidden size={15} />
        </button>
        <span className="mx-1 h-4 w-px bg-fg/10" />
        <button className="icon-btn rounded-full" onClick={resetFit} title="Fit (0)">
          <Maximize aria-hidden size={14} />
        </button>
        <button className="icon-btn rounded-full" onClick={() => zoomTo(1)} title="Actual pixels (1)">
          <Scan aria-hidden size={14} />
        </button>
        <button className="icon-btn rounded-full" onClick={() => setRot((r) => r + 90)} title="Rotate (R)">
          <RotateCw aria-hidden size={14} />
        </button>
      </div>
      {natural && (
        <div className="material absolute left-6 top-6 rounded-full px-3 py-1 text-caption text-muted">
          {natural.w} × {natural.h}
        </div>
      )}
    </div>
  );
}
