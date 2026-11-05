import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { t } from "@/lib/motion";
import { Header } from "@/components/Header";
import { Workspace, WorkspaceHandle } from "@/components/Workspace";
import { Shelf } from "@/components/Shelf";
import { Toasts } from "@/components/Toasts";
import { PreviewModal } from "@/components/preview/PreviewModal";
import { OpenerPage } from "@/components/opener/OpenerPage";
import { AccountPage } from "@/components/AccountPage";
import { useAuth } from "@/lib/auth";
import { flush, startAutosave } from "@/lib/persistence";
import { navigate, useRoute } from "@/lib/router";
import { useOpener } from "@/lib/opener";

export default function App() {
  const { theme, toggle } = useTheme();
  const workspace = useRef<WorkspaceHandle>(null);
  const route = useRoute();
  const authStatus = useAuth((s) => s.status);

  // Load the signed-in account (or guest data), then keep it saved.
  useEffect(() => {
    const stop = startAutosave();
    useAuth.getState().restore();
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      stop();
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  useEffect(() => {
    const isField = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.("input,textarea,[contenteditable=true]");

    // ⌘/Ctrl+V — paste files (screenshots, copied files) or text as a .txt/.json file.
    const onPaste = (e: ClipboardEvent) => {
      if (isField(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const onOpen = window.location.hash.startsWith("#/open");
      if (files.length) {
        e.preventDefault();
        if (onOpen) useOpener.getState().open(files[0], files[0].name || "Pasted image.png");
        else useStore.getState().addFiles(files);
        return;
      }
      if (onOpen) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text?.trim()) {
        e.preventDefault();
        let isJson = false;
        if (/^\s*[[{]/.test(text)) {
          try {
            JSON.parse(text);
            isJson = true;
          } catch {
            /* plain text */
          }
        }
        const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/:/g, ".");
        useStore
          .getState()
          .addFiles([new File([text], `Pasted text ${stamp}.${isJson ? "json" : "txt"}`, { type: isJson ? "application/json" : "text/plain" })]);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isField(e.target)) return;
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        navigate("convert");
        setTimeout(() => workspace.current?.openPicker(), 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        useStore.getState().start();
      }
    };

    // Files dropped outside the dropzone are still added, instead of the
    // browser navigating away to open them.
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      if (window.location.hash.startsWith("#/open")) useOpener.getState().open(files[0], files[0].name);
      else if (!window.location.hash.startsWith("#/account")) useStore.getState().addFiles(files);
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
    <div className="min-h-full">
      <Header theme={theme} onToggleTheme={toggle} />

      <main className="mx-auto max-w-[1200px] px-6 md:px-10">
        {authStatus === "loading" ? (
          <div className="h-[60vh]" aria-busy />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <div key={route}>
              {route === "convert" && (
                <>
                  <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={t.slow}
                    className="pb-12 pt-16 md:pb-16 md:pt-24"
                  >
                    <h1 className="font-display text-headline font-semibold md:text-hero">Convert anything.</h1>
                    <p className="mt-4 max-w-[560px] text-lead text-muted md:mt-6">
                      Drop in a file, pick a format, done. Images, video, audio, documents and data — converted and previewed
                      right in your browser.
                    </p>
                  </motion.section>
                  <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_400px]">
                    <Workspace ref={workspace} />
                    <Shelf />
                  </div>
                </>
              )}
              {route === "open" && <OpenerPage />}
              {route === "account" && <AccountPage />}
            </div>
          </AnimatePresence>
        )}
      </main>

      <footer className="mx-auto max-w-[1200px] px-6 pb-12 md:px-10">
        <p className="text-caption text-subtle" style={{ boxShadow: "0 -1px 0 var(--hairline)", paddingTop: 16 }}>
          Your files never leave this device. Signed-in accounts are encrypted with a key only your password unlocks.
        </p>
      </footer>

      <PreviewModal />
      <Toasts />
    </div>
  );
}
