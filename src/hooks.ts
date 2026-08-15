import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

/* revela elementos al entrar en viewport */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("rv-on");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/* contador ascendente al ser visible */
export function useCountUp<T extends HTMLElement = HTMLDivElement>(target: number, duration = 1400) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<T | null>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      setVal(target);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(target * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, duration, reduced]);
  return { ref, val };
}

/* título con efecto de decodificación */
export function useScramble(text: string, speed = 28) {
  const reduced = usePrefersReducedMotion();
  const [out, setOut] = useState(reduced ? text : "");
  useEffect(() => {
    if (reduced) {
      setOut(text);
      return;
    }
    const chars = "▓▒░<>/\\|=+*#%&$@0123456789";
    let frame = 0;
    const id = window.setInterval(() => {
      frame++;
      const settled = Math.floor(frame / 2.2);
      const next = text
        .split("")
        .map((c, i) => {
          if (c === " " || c === "\n") return c;
          if (i < settled) return c;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");
      setOut(next);
      if (settled >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, reduced]);
  return out;
}

/* reloj UTC en vivo */
export function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} UTC`;
}

/* ---------- PWA: instalación ---------- */

/* el tipo del evento de instalación no existe en los tipos DOM estándar */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const INSTALL_STORAGE_KEY = "sismografo-install-dismissed";
const INSTALL_SHOWN_KEY = "sismografo-install-shown";
const INSTALL_VISITS_KEY = "sismografo-install-visits";
const INSTALL_VISIT_SESSION_KEY = "sismografo-install-visit-session";
const MAX_SHOWS = 3;

const readInt = (key: string, fallback: number): number => {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
};

export function useInstallPrompt() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(INSTALL_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [showCount, setShowCount] = useState(() => readInt(INSTALL_SHOWN_KEY, 0));
  const [visitCount, setVisitCount] = useState(1);

  const isIos = useMemo(() => {
    const ua = window.navigator.userAgent;
    return (
      /iphone|ipad|ipod/i.test(ua) ||
      (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1 && !("MSStream" in window))
    );
  }, []);

  const standalone =
    useMediaQuery("(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)") ||
    !!(window.navigator as unknown as { standalone?: boolean }).standalone;

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    const win = window as unknown as EventTarget;
    win.addEventListener("beforeinstallprompt", onBeforeInstall);
    win.addEventListener("appinstalled", onInstalled);
    return () => {
      win.removeEventListener("beforeinstallprompt", onBeforeInstall);
      win.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /* contador de visitas: una por carga de página (guard por sesión) */
  useEffect(() => {
    try {
      if (!window.sessionStorage.getItem(INSTALL_VISIT_SESSION_KEY)) {
        window.sessionStorage.setItem(INSTALL_VISIT_SESSION_KEY, "1");
        const n = readInt(INSTALL_VISITS_KEY, 0) + 1;
        window.localStorage.setItem(INSTALL_VISITS_KEY, String(n));
        setVisitCount(n);
      } else {
        setVisitCount(readInt(INSTALL_VISITS_KEY, 0) || 1);
      }
    } catch {
      setVisitCount(1);
    }
  }, []);

  const install = useCallback(async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvt(null);
  }, [installEvt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setInstallEvt(null);
    try {
      window.localStorage.setItem(INSTALL_STORAGE_KEY, "1");
    } catch {
      /* almacenamiento bloqueado: se ignora */
    }
  }, []);

  const markShown = useCallback(() => {
    setShowCount((c) => {
      const n = c + 1;
      try {
        window.localStorage.setItem(INSTALL_SHOWN_KEY, String(n));
      } catch {
        /* almacenamiento bloqueado: se ignora */
      }
      return n;
    });
  }, []);

  const overCap = showCount >= MAX_SHOWS;
  const eligible = !standalone && !installed && !dismissed && !overCap;

  return {
    canPrompt: !!installEvt && eligible,
    canInstall: isIos && eligible,
    isIos,
    install,
    dismiss,
    markShown,
    visitCount,
  };
}
