import { Archive, File, FileAudio, FileCode2, FileImage, FileSpreadsheet, FileText, FileType2, FileVideo, Type } from "lucide-react";
import type { FileKind } from "@/lib/formats";
import { cn } from "@/lib/utils";

const ICONS: Record<FileKind, typeof File> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileType2,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  text: FileText,
  code: FileCode2,
  archive: Archive,
  font: Type,
  other: File,
};

/** Neutral tile + glyph. Type is communicated by shape, not colour. */
export function FileIcon({ kind, size = 44, className }: { kind: FileKind; size?: number; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center bg-fg/[0.05] text-muted", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.5} />
    </div>
  );
}
