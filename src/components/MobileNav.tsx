import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrefersReducedMotion } from "../hooks";

interface Props {
  open: boolean;
  onClose: () => void;
  items: [string, string][];
}

const listV = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemV = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 320, damping: 30 } },
};

export default function MobileNav({ open, onClose, items }: Props) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.22 }}
            onClick={onClose}
            className="absolute inset-0 bg-abyss/70 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 320, damping: 32 }
            }
            className="absolute inset-y-0 right-0 flex w-[min(290px,85vw)] flex-col border-l border-line bg-abyss/95 shadow-2xl shadow-black/60 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <a href="#" onClick={onClose} className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center border border-amber/60 bg-panel">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="#f59e42"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 10h3.5l2-5.5 2.5 11 2-7 1.2 2.8 1-1.3H19" />
                  </svg>
                </span>
                <span className="font-display text-sm tracking-[0.08em] text-bone">SISMÓGRAFO·26</span>
              </a>
              <button
                onClick={onClose}
                aria-label="Cerrar menú"
                className="chip-btn grid h-8 w-8 shrink-0 place-items-center border border-line text-fog hover:border-verm hover:text-verm"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            <motion.ul
              variants={listV}
              initial={reduced ? false : "hidden"}
              animate="show"
              className="flex flex-col"
            >
              {items.map(([h, l]) => (
                <motion.li key={h} variants={itemV}>
                  <a
                    href={h}
                    onClick={onClose}
                    className="chip-btn flex items-center justify-between border-b border-line/60 px-5 py-4 font-mono text-[12px] tracking-[0.18em] text-fog uppercase hover:text-amber"
                  >
                    {l}
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-dim">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </a>
                </motion.li>
              ))}
            </motion.ul>

            <div className="mt-auto border-t border-line px-5 py-4 font-mono text-[9px] tracking-[0.2em] text-dim uppercase">
              Observatorio de terremotos
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
