import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { Header } from "@/components/Header";
import { Workspace, WorkspaceHandle } from "@/components/Workspace";
import { Shelf } from "@/components/Shelf";
import { Toasts } from "@/components/Toasts";
import { PreviewModal } from "@/components/preview/PreviewModal";

export default function App() {
  const { theme, toggle } = useTheme();
  const workspace = useRef<WorkspaceHandle>(null);

  useEffect(() => {
    const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input,textarea,[contenteditable=true]");

    // ⌘/Ctrl+V — paste files (screenshots, copied files) or text as a .txt file.
    const onPaste = (e: ClipboardEvent) => {
      if (isField(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        useStore.getState().addFiles(files);
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text?.trim()) {
        e.preventDefault();
        const looksJson = /^\s*[[{]/.test(text) && (() => { try { JSON.parse(text); return true; } catch { return false; } })();
        const ext = looksJson ? "json" : "txt";
        const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/:/g, ".");
        useStore.getState().addFiles([new File([text], `Pasted text ${stamp}.${ext}`, { type: looksJson ? "application/json" : "text/plain" })]);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || isField(e.target)) return;
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        workspace.current?.openPicker();
      } else if (e.key === "Enter") {
        e.preventDefault();
        useStore.getState().start();
      }
    };

    // Files dropped anywhere on the page (outside the dropzone) still get added
    // instead of the browser navigating away to open them.
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) useStore.getState().addFiles(files);
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className="relative min-h-full">
      <Backdrop />
      <Header theme={theme} onToggleTheme={toggle} />
      <main className="relative mx-auto grid max-w-[1440px] gap-5 px-4 pb-10 pt-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <Workspace ref={workspace} />
        <Shelf />
      </main>
      <footer className="relative pb-8 text-center text-[11.5px] text-subtle">
        Files never leave your browser · Stored locally with IndexedDB &amp; localStorage
      </footer>
      <PreviewModal />
      <Toasts />
    </div>
  );
}

function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#5AC8FA] opacity-[0.18] blur-[120px] dark:opacity-[0.12]" />
      <div className="absolute -right-32 top-20 h-[460px] w-[460px] rounded-full bg-[#5E5CE6] opacity-[0.16] blur-[120px] dark:opacity-[0.14]" />
      <div className="absolute bottom-[-200px] left-1/3 h-[520px] w-[620px] rounded-full bg-[#FF9F0A] opacity-[0.09] blur-[140px] dark:opacity-[0.06]" />
    </div>
  );
}
