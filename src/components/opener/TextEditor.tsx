import { useEffect, useMemo, useRef, useState } from "react";
import { CaseSensitive, Search, WrapText } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { mimeFor } from "@/lib/formats";
import { useStore } from "@/lib/store";
import type { OpenFile } from "@/lib/opener";
import { download, editedName, saveToFiles } from "./actions";

const MAX_EDIT = 5 * 1024 * 1024;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function TextEditor({ file }: { file: OpenFile }) {
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wrap, setWrap] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const tooBig = file.blob.size > MAX_EDIT;

  useEffect(() => {
    let cancelled = false;
    file.blob
      .slice(0, MAX_EDIT)
      .text()
      .then((t) => {
        if (cancelled) return;
        setText(t);
        setOriginal(t);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const re = useMemo(() => (find ? new RegExp(escapeRe(find), matchCase ? "g" : "gi") : null), [find, matchCase]);
  const matches = useMemo(() => (re && text ? text.match(re)?.length ?? 0 : 0), [re, text]);
  const stats = useMemo(() => {
    const t = text ?? "";
    return { lines: t ? t.split("\n").length : 0, words: (t.match(/\S+/g) || []).length, chars: t.length };
  }, [text]);
  const isJson = file.ext === "json";
  const dirty = text !== null && text !== original;

  const findNext = () => {
    const el = area.current;
    if (!el || !re || text === null) return;
    const from = el.selectionEnd;
    const r = new RegExp(re.source, re.flags.replace("g", ""));
    const rest = text.slice(from);
    let m = r.exec(rest);
    let at = m ? from + m.index : -1;
    if (!m) {
      m = r.exec(text);
      at = m ? m.index : -1;
    }
    if (m && at >= 0) {
      el.focus();
      el.setSelectionRange(at, at + m[0].length);
    }
  };

  const replaceAll = () => {
    if (!re || text === null || !matches) return;
    setText(text.replace(re, () => replace));
    toast({ tone: "info", title: `Replaced ${matches} match${matches > 1 ? "es" : ""}` });
  };

  const formatJson = (indent: number) => {
    try {
      setText(JSON.stringify(JSON.parse(text ?? ""), null, indent || undefined));
    } catch (e) {
      toast({ tone: "error", title: "Not valid JSON", body: (e as Error).message });
    }
  };

  const output = () => new Blob([text ?? ""], { type: `${mimeFor(file.ext, "text/plain")};charset=utf-8` });
  const outName = editedName(file.name, file.ext || "txt");

  if (text === null)
    return <div className="flex h-full items-center justify-center text-footnote text-muted">Opening…</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
        <label className="flex h-9 min-w-[160px] flex-1 items-center gap-2 rounded-[10px] bg-fg/[0.05] px-3 text-footnote focus-within:ring-2 focus-within:ring-accent/40 sm:max-w-[240px]">
          <Search size={14} strokeWidth={1.75} className="shrink-0 text-subtle" />
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), findNext())}
            placeholder="Find"
            className="w-full min-w-0 bg-transparent outline-none placeholder:text-subtle"
          />
          {find && <span className="shrink-0 tabular-nums text-subtle">{matches}</span>}
        </label>
        <label className="flex h-9 min-w-[140px] flex-1 items-center rounded-[10px] bg-fg/[0.05] px-3 text-footnote focus-within:ring-2 focus-within:ring-accent/40 sm:max-w-[200px]">
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="Replace with"
            className="w-full min-w-0 bg-transparent outline-none placeholder:text-subtle"
          />
        </label>
        <button className="btn-secondary" disabled={!matches} onClick={replaceAll}>
          Replace all
        </button>
        <button className={cn("icon-btn", matchCase && "bg-fg/[0.06] text-fg")} onClick={() => setMatchCase((v) => !v)} aria-pressed={matchCase} aria-label="Match case" title="Match case">
          <CaseSensitive size={18} strokeWidth={1.75} />
        </button>
        <div className="flex-1" />
        {isJson && (
          <>
            <button className="btn-text" onClick={() => formatJson(2)}>
              Format
            </button>
            <button className="btn-text" onClick={() => formatJson(0)}>
              Minify
            </button>
          </>
        )}
        <button className={cn("icon-btn", wrap && "bg-fg/[0.06] text-fg")} onClick={() => setWrap((v) => !v)} aria-pressed={wrap} aria-label="Wrap lines" title="Wrap lines">
          <WrapText size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Editor */}
      <div className="flex min-h-0 flex-1 bg-surface">
        {!wrap && (
          <div ref={gutter} aria-hidden className="select-none overflow-hidden py-4 pl-4 pr-3 text-right font-mono text-[13px] leading-[22px] text-subtle/70">
            {Array.from({ length: stats.lines || 1 }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
          spellCheck={file.kind === "text"}
          wrap={wrap ? "soft" : "off"}
          aria-label={`Edit ${file.name}`}
          className={cn(
            "scroll-thin min-h-0 flex-1 resize-none bg-transparent py-4 pr-6 font-mono text-[13px] leading-[22px] text-fg outline-none",
            wrap ? "pl-6" : "pl-1",
          )}
        />
      </div>

      {/* Status + actions */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ boxShadow: "0 -1px 0 var(--hairline)" }}>
        <p className="text-caption text-muted">
          {stats.lines.toLocaleString()} lines · {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} characters
          {tooBig && ` · editing the first ${formatBytes(MAX_EDIT)}`}
          {dirty && <span className="text-fg"> · Edited</span>}
        </p>
        <div className="flex-1" />
        <button className="btn-text text-muted hover:text-fg" disabled={!dirty} onClick={() => setText(original)}>
          Revert
        </button>
        <button className="btn-secondary" onClick={() => download(output(), outName)}>
          Download
        </button>
        <button
          className="btn-secondary !bg-fg !text-bg hover:!bg-fg/85"
          onClick={() => {
            saveToFiles(output(), outName, `${stats.lines} lines`);
            setOriginal(text);
            toast({ tone: "success", title: "Saved to Files", body: outName });
          }}
        >
          Save to Files
        </button>
      </div>
    </div>
  );
}
