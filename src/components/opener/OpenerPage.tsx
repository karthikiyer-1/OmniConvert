import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, X } from "lucide-react";
import { useOpener, type OpenFile } from "@/lib/opener";
import { origKey, outKey, useStore, type FileItem } from "@/lib/store";
import { getBlob } from "@/lib/db";
import { isBrowserImage, isTextual, KIND_LABEL } from "@/lib/formats";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import { rise, t } from "@/lib/motion";
import { FileIcon } from "../FileIcon";
import { ArchiveViewer, InfoCard, PdfViewer } from "../preview/FallbackViews";
import { ImageEditor } from "./ImageEditor";
import { TextEditor } from "./TextEditor";
import { AudioEditor, VideoEditor } from "./MediaEditors";

export function OpenerPage() {
  const file = useOpener((s) => s.file);
  return file ? <OpenFileView file={file} /> : <OpenLanding />;
}

/** Open a library item in the editor (used by the Files preview too). */
export async function openLibraryItem(item: FileItem) {
  const useOut = item.status === "ready" && item.output && !item.output.simulated;
  const blob = await getBlob(useOut ? outKey(item.id) : origKey(item.id));
  if (!blob) {
    useStore.getState().toast({ tone: "error", title: "File data is missing", body: "Add the file again from your device" });
    return false;
  }
  return useOpener.getState().open(blob, useOut ? item.output!.name : item.name, item.id);
}

function OpenLanding() {
  const open = useOpener((s) => s.open);
  const items = useStore((s) => s.items);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const depth = useRef(0);
  const recent = items.filter((i) => i.status !== "uploading").slice(0, 8);

  const take = (files: FileList | File[] | null) => {
    const f = files?.[0];
    if (f) open(f, f.name || "Untitled");
  };

  return (
    <>
      <motion.section {...rise} transition={t.slow} className="pb-12 pt-16 md:pb-16 md:pt-24">
        <h1 className="text-balance font-display text-headline font-semibold md:text-hero">Open Anything.</h1>
        <p className="mt-4 max-w-[560px] text-pretty text-lead text-muted md:mt-6">
          View any file, then make quick edits: crop and adjust photos, edit text and code, trim audio, grab frames from video.
        </p>
      </motion.section>

      <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_400px]">
        <motion.div
          {...rise}
          transition={{ ...t.slow, delay: 0.05 }}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            depth.current++;
            setDrag(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1);
            if (!depth.current) setDrag(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            depth.current = 0;
            setDrag(false);
            take(e.dataTransfer.files);
          }}
          className={cn(
            "surface group relative flex min-h-[420px] cursor-pointer flex-col items-center justify-center px-8 py-16 text-center transition-colors duration-400 ease-apple focus-visible:outline-offset-[-6px]",
            drag && "!bg-accent/[0.04]",
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-4 rounded-[20px] border-[1.5px] border-dashed border-accent/50 transition-opacity duration-400 ease-apple",
              drag ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            className={cn(
              "mb-8 flex h-16 w-16 items-center justify-center rounded-full transition-[transform,background-color,color] duration-400 ease-apple",
              drag ? "-translate-y-1 bg-accent text-white" : "bg-fg/[0.05] text-fg group-hover:-translate-y-0.5",
            )}
          >
            <ArrowUp aria-hidden size={26} strokeWidth={1.75} />
          </div>
          <p className="font-display text-title font-semibold">{drag ? "Release to Open" : "Drop a File to Open"}</p>
          <p className="mt-2 text-callout text-muted">
            or <span className="text-accent">choose a file</span>
          </p>
          <p className="mt-10 text-pretty text-footnote text-subtle">Images · Text &amp; code · Audio · Video · PDF · ZIP · anything else</p>
          <input
            ref={input}
            type="file"
            aria-label="Choose a file"
            tabIndex={-1}
            hidden
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />
        </motion.div>

        <motion.aside {...rise} transition={{ ...t.slow, delay: 0.1 }} className="surface flex min-h-[420px] flex-col p-6">
          <h2 className="font-display text-title font-semibold">From Your Files</h2>
          <p className="mt-1 text-footnote text-muted">Pick up where you left off.</p>
          {recent.length ? (
            <ul className="-mx-3 mt-6">
              {recent.map((it) => (
                <li key={it.id}>
                  <button
                    onClick={() => openLibraryItem(it)}
                    className="flex w-full items-center gap-4 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-fg/[0.035]"
                  >
                    <FileIcon kind={it.kind} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium" translate="no">{it.output?.name ?? it.name}</span>
                      <span className="block text-footnote text-muted">
                        {KIND_LABEL[it.kind]} · {timeAgo(it.addedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-auto max-w-[220px] text-center text-footnote text-muted">Files you add or convert will show up here.</p>
          )}
        </motion.aside>
      </div>
    </>
  );
}

function OpenFileView({ file }: { file: OpenFile }) {
  const close = useOpener((s) => s.close);
  const asText = useOpener((s) => s.asText);
  const setAsText = useOpener((s) => s.setAsText);
  const [url] = useState(() => URL.createObjectURL(file.blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  let body: React.ReactNode;
  let mode = "Viewer";
  if (asText || isTextual(file.kind, file.ext)) {
    body = <TextEditor key={file.token + asText} file={file} />;
    mode = "Text editor";
  } else if (file.kind === "image" && isBrowserImage(file.ext)) {
    body = <ImageEditor key={file.token} file={file} />;
    mode = "Image editor";
  } else if (file.kind === "audio") {
    body = <AudioEditor key={file.token} file={file} />;
    mode = "Audio trimmer";
  } else if (file.kind === "video") {
    body = <VideoEditor key={file.token} file={file} />;
    mode = "Frame capture";
  } else if (file.kind === "pdf") {
    body = <PdfViewer url={url} />;
  } else if (file.kind === "archive" && file.ext === "zip") {
    body = <ArchiveViewer key={file.token} blob={file.blob} name={file.name} />;
  } else {
    body = (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <InfoCard kind={file.kind} name={file.name} blob={file.blob} />
        </div>
      </div>
    );
  }

  const canTextEdit = !isTextual(file.kind, file.ext) && file.blob.size < 5 * 1024 * 1024;

  return (
    <motion.div {...rise} transition={t.base} className="py-8">
      <div className="surface flex h-[calc(100dvh-52px-64px)] min-h-[560px] flex-col overflow-hidden">
        <div className="flex h-16 shrink-0 items-center gap-4 px-5" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
          <FileIcon kind={file.kind} size={36} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-body font-semibold" translate="no">{file.name}</h1>
            <p className="truncate text-caption text-muted">
              {mode} · {formatBytes(file.blob.size)}
            </p>
          </div>
          {canTextEdit && (
            <button className="btn-text max-sm:hidden" onClick={() => setAsText(!asText)}>
              {asText ? "Back to Viewer" : "Edit as Text"}
            </button>
          )}
          <button className="icon-btn -mr-1" onClick={() => void close()} aria-label="Close file">
            <X aria-hidden size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1">{body}</div>
      </div>
    </motion.div>
  );
}
