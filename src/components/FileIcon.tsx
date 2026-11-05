import {
  Archive,
  File,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Type,
} from "lucide-react";
import { FileKind, KIND_COLOR } from "@/lib/formats";
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

export function FileIcon({
  kind,
  ext,
  size = 40,
  className,
}: {
  kind: FileKind;
  ext?: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[kind];
  const color = KIND_COLOR[kind];
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center rounded-[11px]", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, ${color}26, ${color}14)`,
        boxShadow: `inset 0 0 0 0.5px ${color}40`,
      }}
    >
      <Icon size={size * 0.46} color={color} strokeWidth={1.8} />
      {ext && size >= 36 && (
        <span
          className="absolute -bottom-1 rounded-[4px] px-1 text-[8px] font-bold uppercase leading-[13px] tracking-wide text-white"
          style={{ background: color }}
        >
          {ext.slice(0, 4)}
        </span>
      )}
    </div>
  );
}
