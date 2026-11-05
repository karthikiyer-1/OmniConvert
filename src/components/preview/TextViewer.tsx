import { useEffect, useMemo, useState } from "react";
import { Check, Copy, WrapText, Table2, Code2, AArrowDown, AArrowUp } from "lucide-react";
import { languageFor } from "@/lib/formats";
import { parseDelimited } from "@/lib/converters";
import { cn, formatBytes } from "@/lib/utils";

const LIMIT = 1_000_000; // characters rendered

export function TextViewer({ blob, ext }: { blob: Blob; ext: string }) {
  const [text, setText] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [font, setFont] = useState(12.5);
  const tabular = ext === "csv" || ext === "tsv";
  const [mode, setMode] = useState<"table" | "source">(tabular ? "table" : "source");
  const truncated = blob.size > LIMIT;

  useEffect(() => {
    let cancelled = false;
    blob
      .slice(0, LIMIT)
      .text()
      .then(async (t) => {
        if (cancelled) return;
        if (ext === "json") {
          try {
            t = JSON.stringify(JSON.parse(t), null, 2);
          } catch {
            /* show as-is */
          }
        }
        setText(t);
        if (t.length > 300_000) return; // too big to highlight snappily
        const hljs = (await import("highlight.js/lib/common")).default;
        const lang = languageFor(ext);
        const out = hljs.getLanguage(lang) ? hljs.highlight(t, { language: lang }) : hljs.highlightAuto(t);
        if (!cancelled) setHtml(out.value);
      });
    return () => {
      cancelled = true;
    };
  }, [blob, ext]);

  const rows = useMemo(() => (tabular && text ? parseDelimited(text, ext === "tsv" ? "\t" : ",").slice(0, 2000) : null), [text, tabular, ext]);
  const lines = useMemo(() => (html ? splitHighlighted(html) : escape(text ?? "").split("\n")), [html, text]);
  const gutter = String(lines.length).length;

  if (text === null)
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-4 text-caption text-muted" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
        <span className="font-medium uppercase tracking-[0.06em] text-fg">{languageFor(ext)}</span>
        <span className="ml-2">
          {text.split("\n").length.toLocaleString()} lines · {formatBytes(blob.size)}
          {truncated && " · showing first 1 MB"}
        </span>
        <div className="flex-1" />
        {tabular && (
          <button className="icon-btn h-8 w-8" onClick={() => setMode((m) => (m === "table" ? "source" : "table"))} title={mode === "table" ? "Show source" : "Show table"}>
            {mode === "table" ? <Code2 size={14} /> : <Table2 size={14} />}
          </button>
        )}
        <button className="icon-btn h-8 w-8" onClick={() => setFont((f) => Math.max(10, f - 1))} title="Smaller text">
          <AArrowDown size={15} />
        </button>
        <button className="icon-btn h-8 w-8" onClick={() => setFont((f) => Math.min(20, f + 1))} title="Larger text">
          <AArrowUp size={15} />
        </button>
        <button className={cn("icon-btn h-8 w-8", wrap && "bg-fg/[0.06] !text-fg")} onClick={() => setWrap((w) => !w)} title="Wrap lines">
          <WrapText size={14} />
        </button>
        <button
          className="icon-btn h-8 w-8"
          title="Copy"
          onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
      </div>

      {mode === "table" && rows ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-footnote">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
                <th className="w-12 px-3 py-2.5 text-right font-mono text-caption font-normal text-subtle">#</th>
                {rows[0]?.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, ri) => (
                <tr key={ri} className="even:bg-fg/[0.02] hover:bg-fg/[0.04]">
                  <td className="px-3 py-2 text-right font-mono text-caption text-subtle">{ri + 1}</td>
                  {rows[0].map((_, ci) => (
                    <td key={ci} className="max-w-[280px] truncate whitespace-nowrap px-4 py-2">
                      {r[ci]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          <pre className="hljs min-w-fit py-4 font-mono" style={{ fontSize: font, lineHeight: 1.6 }}>
            {lines.map((l, i) => (
              <div key={i} className="flex hover:bg-fg/[0.035]">
                <span className="shrink-0 select-none pl-3 pr-4 text-right text-subtle/70" style={{ width: `${gutter + 3}ch` }}>
                  {i + 1}
                </span>
                <span className={cn("min-w-0 flex-1 pr-6", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")} dangerouslySetInnerHTML={{ __html: l || " " }} />
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Split highlight.js HTML into lines, closing/reopening spans that cross line breaks. */
function splitHighlighted(html: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  let cur = "";
  for (const m of html.matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+/g)) {
    const t = m[0];
    if (t === "\n") {
      out.push(cur + "</span>".repeat(stack.length));
      cur = stack.join("");
    } else if (t === "</span>") {
      stack.pop();
      cur += t;
    } else if (t.startsWith("<span")) {
      stack.push(t);
      cur += t;
    } else cur += t;
  }
  out.push(cur);
  return out;
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
