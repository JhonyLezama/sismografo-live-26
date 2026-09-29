import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LiveQuake } from "../data/usgs";
import { timeAgo } from "../data/usgs";
import { magColor } from "../data/quakes";
import { useMediaQuery, usePrefersReducedMotion } from "../hooks";
import BottomSheet from "./BottomSheet";
import Seismograph from "./Seismograph";

interface Props {
  open: boolean;
  onClose: () => void;
  live: LiveQuake[];
  status: "loading" | "ok" | "error";
  onLocate: (q: LiveQuake) => void;
}

type Phase = "locating" | "done";

const haversineKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const fmtDist = (km: number) => (km < 100 ? `${Math.round(km)} km` : `${Math.round(km / 10) * 10} km`);

export default function FeltSheet({ open, onClose, live, status, onLocate }: Props) {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("locating");
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(() => {
    try {
      const raw = localStorage.getItem("sismografo-felt-loc");
      if (!raw) return null;
      const p = JSON.parse(raw) as { lat?: number; lon?: number };
      if (typeof p.lat === "number" && typeof p.lon === "number") return { lat: p.lat, lon: p.lon };
      return null;
    } catch {
      return null;
    }
  });
  const [locDenied, setLocDenied] = useState(false);
  const [vote, setVote] = useState<string | null>(() => {
    try {
      return localStorage.getItem("sismografo-felt-vote");
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState(false);

  /* al abrir: reintenta geolocalización (con la última guardada como respaldo) */
  useEffect(() => {
    if (!open) return;
    setPhase("locating");
    setCopied(false);
    if (!("geolocation" in navigator)) {
      setLocDenied(true);
      setPhase("done");
      return;
    }
    const t = window.setTimeout(() => setPhase("done"), 9000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setLoc(next);
        setLocDenied(false);
        try {
          localStorage.setItem("sismografo-felt-loc", JSON.stringify(next));
        } catch {
          /* se ignora */
        }
        window.clearTimeout(t);
        setPhase("done");
      },
      () => {
        setLocDenied(true);
        window.clearTimeout(t);
        setPhase("done");
      },
      { timeout: 8000, maximumAge: 600000 }
    );
    return () => window.clearTimeout(t);
  }, [open ]);

  const ranked = useMemo(() => {
    if (!loc || live.length === 0) return [];
    const now = Date.now();
    return live
      .map((q) => {
        const ageH = (now - q.time) / 3_600_000;
        const dist = haversineKm(loc.lat, loc.lon, q.lat, q.lon);
        return { q, dist, ageH, score: dist / 600 + ageH / 24 };
      })
      .filter((r) => r.ageH < 48)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [loc, live]);

  const recent = useMemo(() => live.slice(0, 5), [live]);
  const top = ranked[0] ?? null;
  const strong = !!top && top.dist < 600 && top.ageH < 24;

  const choose = (v: string) => {
    setVote(v);
    try {
      localStorage.setItem("sismografo-felt-vote", v);
    } catch {
      /* se ignora */
    }
  };

  const share = async (text: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Sismógrafo·26", text, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${window.location.href}`);
      setCopied(true);
    } catch {
      /* compartir cancelado: se ignora */
    }
  };

  const body = (
    <div className="px-4 pt-1 pb-2 sm:px-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.24em] text-verm uppercase">● Lo sentí — veredicto</span>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="chip-btn grid h-8 w-8 place-items-center border border-line text-fog hover:border-verm hover:text-verm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      {phase === "locating" || status === "loading" ? (
        <div>
          <Seismograph amp={0.6} seed={7} height={64} color="#f0603c" />
          <p className="mt-3 text-center font-mono text-[11px] tracking-[0.18em] text-fog uppercase">
            Rastreando estaciones sísmicas…
          </p>
        </div>
      ) : status === "error" && live.length === 0 ? (
        <p className="border border-verm/50 bg-verm/10 px-4 py-5 text-center font-mono text-[11px] tracking-[0.16em] text-verm uppercase">
          Sin señal en vivo ahora mismo. Revisa tu conexión y reintenta — el archivo 2026 sigue disponible.
        </p>
      ) : loc && top ? (
        <div>
          <div
            className={`border px-4 py-4 ${strong ? "border-teal/50 bg-teal/10" : "border-amber/50 bg-amber/10"}`}
          >
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              {strong ? "Sí — no fue tu imaginación" : "Probablemente no hay match cercano aún"}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span
                className="font-display text-4xl leading-none"
                style={{ color: magColor(top.q.mag) }}
              >
                M{top.q.mag.toFixed(1)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-bone">{top.q.place}</div>
                <div className="font-mono text-[11px] tracking-wider text-fog">
                  a {fmtDist(top.dist)} de ti · {timeAgo(top.q.time)}
                </div>
              </div>
            </div>
            {!strong && (
              <p className="mt-3 text-[13px] leading-relaxed text-fog">
                El USGS/EMSC tardan minutos en publicar. Si fue hace muy poco o fue un sismo pequeño muy
                local, puede aparecer aquí en breve.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => {
                onLocate(top.q);
                onClose();
              }}
              className="chip-btn bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.18em] text-abyss uppercase hover:brightness-110"
            >
              Ver en el mapa
            </button>
            <button
              onClick={() => void share(`Sentí un sismo: M${top.q.mag.toFixed(1)} en ${top.q.place} (${timeAgo(top.q.time)}).`)}
              className="chip-btn border border-line bg-panel px-4 py-2.5 font-mono text-[11px] tracking-[0.18em] text-fog uppercase hover:border-teal hover:text-teal"
            >
              {copied ? "¡Copiado!" : "Compartir"}
            </button>
          </div>
          {ranked.length > 1 && (
            <div className="mt-3 border-t border-line/60 pt-2">
              <div className="font-mono text-[9px] tracking-[0.2em] text-dim uppercase">Otras candidatas</div>
              <ul className="mt-1 divide-y divide-line/60">
                {ranked.slice(1).map((r) => (
                  <li key={r.q.id}>
                    <button
                      onClick={() => {
                        onLocate(r.q);
                        onClose();
                      }}
                      className="row-hover flex w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="font-display text-lg" style={{ color: magColor(r.q.mag) }}>
                        {r.q.mag.toFixed(1)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-bone">{r.q.place}</span>
                      <span className="shrink-0 font-mono text-[10px] text-dim">
                        {fmtDist(r.dist)} · {timeAgo(r.q.time).replace("hace ", "")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="border border-line bg-deep/60 px-4 py-3 font-mono text-[11px] leading-relaxed tracking-[0.14em] text-fog uppercase">
            {locDenied
              ? "Sin tu ubicación te muestro lo último registrado en el mundo."
              : "Esto es lo último registrado en el mundo:"}
          </p>
          <ul className="mt-2 divide-y divide-line/60">
            {recent.map((q) => (
              <li key={q.id}>
                <button
                  onClick={() => {
                    onLocate(q);
                    onClose();
                  }}
                  className="row-hover flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span
                    className="grid h-8 w-11 shrink-0 place-items-center border font-display text-base"
                    style={{ color: magColor(q.mag), borderColor: `${magColor(q.mag)}55`, background: `${magColor(q.mag)}12` }}
                  >
                    {q.mag.toFixed(1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-bone">{q.place}</span>
                    <span className="block font-mono text-[10px] text-dim">{timeAgo(q.time)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {recent.length === 0 && (
            <p className="py-4 text-center font-mono text-[11px] text-dim uppercase">Nada reciente por ahora.</p>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-line/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">¿Te sirvió?</span>
          <div className="flex gap-2">
            {(["si", "no"] as const).map((v) => (
              <button
                key={v}
                onClick={() => choose(v)}
                aria-pressed={vote === v}
                className={`chip-btn border px-3 py-1.5 font-mono text-[11px] uppercase ${
                  vote === v ? "border-teal bg-teal/15 text-teal" : "border-line text-dim hover:text-bone"
                }`}
              >
                {v === "si" ? "Sí" : "No"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 font-mono text-[9px] leading-relaxed tracking-[0.14em] text-dim uppercase">
          Divulgativo con datos USGS/EMSC (retardo de minutos). No es alerta temprana: ante un sismo sigue a
          protección civil.
        </p>
      </div>
    </div>
  );

  if (isMobile) return <BottomSheet open={open} onClose={onClose} maxHeight="86dvh">{body}</BottomSheet>;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] hidden lg:block">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-abyss/70 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Lo sentí: veredicto del temblor"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
            className="absolute inset-y-0 right-0 flex w-[min(420px,40vw)] flex-col border-l border-line bg-panel shadow-2xl shadow-black/60"
          >
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">{body}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
