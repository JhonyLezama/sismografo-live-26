import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useInstallPrompt, useMediaQuery, usePrefersReducedMotion } from "../hooks";
import { onInstallSignal } from "../installSignals";

const DELAY_FIRST_MS = 2 * 60 * 1000;
const DELAY_RETURN_MS = 35 * 1000;
const SIGNAL_DELAY_MS = 800;

interface Props {
  blocked?: boolean;
}

export default function InstallBanner({ blocked = false }: Props) {
  const pwa = useInstallPrompt();
  const reduced = usePrefersReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [signal, setSignal] = useState(false);
  const [timerFired, setTimerFired] = useState(false);
  const [shown, setShown] = useState(false);
  const [fsActive, setFsActive] = useState(() => !!document.fullscreenElement);
  const markedRef = useRef(false);

  useEffect(() => onInstallSignal(() => setSignal(true)), []);

  /* la señal dispara la muestra casi al instante */
  useEffect(() => {
    if (!signal) return;
    const id = window.setTimeout(() => setTimerFired(true), SIGNAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [signal]);

  /* temporizador: los recurrentes esperan menos que la primera visita */
  useEffect(() => {
    const delay = pwa.visitCount >= 2 ? DELAY_RETURN_MS : DELAY_FIRST_MS;
    const id = window.setTimeout(() => setTimerFired(true), delay);
    return () => window.clearTimeout(id);
  }, [pwa.visitCount]);

  /* pantalla completa del mapa (nativa + fallback) */
  useEffect(() => {
    const sync = () => setFsActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const blockedNow = blocked || fsActive;

  const visible = useMemo(() => {
    if (shown || (!timerFired && !signal)) return false;
    if (blockedNow) return false;
    return pwa.canPrompt || pwa.canInstall;
  }, [shown, timerFired, signal, blockedNow, pwa.canPrompt, pwa.canInstall]);

  /* una sola muestra por sesión + contador hacia el tope de 3 */
  useEffect(() => {
    if (visible && !markedRef.current) {
      markedRef.current = true;
      setShown(true);
      pwa.markShown();
    }
  }, [visible, pwa.markShown]);

  const title = pwa.isIos ? "Añadir a pantalla de inicio" : isDesktop ? "Instalar como app" : "Instalar la aplicación";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label="Instalar la aplicación Sismógrafo·26"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }}
          className="fixed bottom-4 left-4 z-[70] w-[min(320px,calc(100vw-2rem))] border border-line bg-abyss/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center border border-amber/60 bg-panel">
                <svg
                  width="18"
                  height="18"
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
              <div>
                <div className="font-display text-sm tracking-[0.08em] text-bone">SISMÓGRAFO·26</div>
                <div className="font-mono text-[9px] tracking-[0.22em] text-amber uppercase">{title}</div>
              </div>
            </div>
            <button
              onClick={pwa.dismiss}
              aria-label="Cerrar aviso de instalación"
              title="No volver a mostrar"
              className="chip-btn grid h-6 w-6 shrink-0 place-items-center border border-line text-dim hover:border-verm hover:text-verm"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M2 2l8 8M10 2L2 10" />
              </svg>
            </button>
          </div>

          {pwa.isIos ? (
            <p className="mt-2.5 text-xs leading-relaxed text-fog">
              En Safari: toca <span className="text-bone">Compartir</span> →{" "}
              <span className="text-bone">Añadir a pantalla de inicio</span> para tener el observatorio como una app.
            </p>
          ) : (
            <p className="mt-2.5 text-xs leading-relaxed text-fog">
              {isDesktop
                ? "Ventana propia con acceso directo y datos que funcionan sin conexión."
                : "Acceso directo desde tu pantalla de inicio y funciona sin conexión."}
            </p>
          )}

          {!pwa.isIos && (
            <button
              onClick={pwa.install}
              className="chip-btn mt-3 w-full border border-amber/60 bg-amber/15 px-4 py-2 font-mono text-[11px] tracking-[0.18em] text-amber uppercase hover:bg-amber/25"
            >
              ⬇ {isDesktop ? "Instalar como app" : "Instalar"}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
