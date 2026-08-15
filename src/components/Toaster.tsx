import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrefersReducedMotion } from "../hooks";
import { TOAST_EVENT } from "../toast";
import type { ToastData } from "../toast";

const TOAST_MS = 3800;

export default function Toaster() {
  const reduced = usePrefersReducedMotion();
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastData>).detail;
      setToasts((cur) => [...cur.filter((t) => t.id !== detail.id).slice(-2), detail]);
      window.setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== detail.id));
      }, TOAST_MS);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-[4.5rem] z-[95] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            role="status"
            initial={{ opacity: 0, x: reduced ? 0 : 48, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: reduced ? 0 : 48, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex items-start gap-3 border border-teal/40 bg-abyss/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-sm"
          >
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal/15 text-teal">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-bone">{t.title}</span>
              <span className="block truncate font-mono text-[10px] tracking-wider text-fog uppercase">
                {t.message}
              </span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
