import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Region, Quake } from "./data/quakes";
import { QUAKES, ANNUAL, fmt, MONTHS_ES, magColor, depthClass, CATALOG_FIRST, CATALOG_LAST } from "./data/quakes";
import type { MapMode, AreaRect } from "./components/WorldMap";
import BottomSheet from "./components/BottomSheet";
import MobileNav from "./components/MobileNav";
import { fetchLiveQuakes, timeAgo, feedUrl, loadLiveCache, USGS_WINDOWS } from "./data/usgs";
import type { LiveQuake, LiveWindow } from "./data/usgs";
import { downloadLiveCSV, downloadQuakesCSV, downloadQuakesGeoJSON } from "./data/export";
import { emitInstallSignal } from "./installSignals";
import Ticker from "./components/Ticker";
import Seismograph from "./components/Seismograph";
import YearPlayer from "./components/YearPlayer";
import InstallBanner from "./components/InstallBanner";
import { useScramble, useUtcClock, useReveal, usePrefersReducedMotion, useMediaQuery } from "./hooks";

/* secciones pesadas cargadas bajo demanda (código dividido por chunks) */
const WorldMap = lazy(() => import("./components/WorldMap"));
const SidePanel = lazy(() => import("./components/SidePanel"));
const LiveDetail = lazy(() => import("./components/SidePanel").then((m) => ({ default: m.LiveDetail })));
const LiveList = lazy(() => import("./components/SidePanel").then((m) => ({ default: m.LiveList })));
const Detail = lazy(() => import("./components/SidePanel").then((m) => ({ default: m.Detail })));
const Registry = lazy(() => import("./components/Registry"));
const MagnitudeLab = lazy(() => import("./components/MagnitudeLab"));
const Balance = lazy(() => import("./components/Balance"));

const REGIONS: ("Todas" | Region)[] = [
  "Todas", "Sudamérica", "Norteamérica", "Asia", "Oceanía", "Europa", "África",
];
const MAG_CHIPS = [
  { v: 0, l: "Todos" },
  { v: 5, l: "≥ 5.0" },
  { v: 6, l: "≥ 6.0" },
  { v: 7, l: "≥ 7.0" },
];

type DepthFilter = "all" | "sup" | "int" | "deep";
const DEPTH_CHIPS: { v: DepthFilter; l: string }[] = [
  { v: "all", l: "Todas" },
  { v: "sup", l: "Somero" },
  { v: "int", l: "Intermedio" },
  { v: "deep", l: "Profundo" },
];
const DEPTH_LABEL: Record<Exclude<DepthFilter, "all">, string> = {
  sup: "Superficial",
  int: "Intermedio",
  deep: "Profundo",
};

const readUrl = () => {
  const p = new URLSearchParams(window.location.search);
  const mag = Number(p.get("mag"));
  const mRaw = p.get("month");
  const m = mRaw === null || mRaw === "" ? -1 : Number(mRaw);
  const region = p.get("region");
  const modo = p.get("modo");
  const prof = p.get("prof");
  const zona = p.get("zona");
  let area: AreaRect | null = null;
  if (zona) {
    const v = zona.split(",").map(Number);
    if (v.length === 4 && v.every((n) => isFinite(n))) {
      const [minLat, maxLat, minLon, maxLon] = v;
      if (minLat >= -90 && maxLat <= 90 && minLat <= maxLat && minLon >= -180 && maxLon <= 180 && minLon <= maxLon) {
        area = { minLat, maxLat, minLon, maxLon };
      }
    }
  }
  return {
    minMag: MAG_CHIPS.some((c) => c.v === mag) ? mag : 0,
    region: (REGIONS as readonly string[]).includes(region ?? "")
      ? (region as (typeof REGIONS)[number])
      : "Todas",
    month: m >= -1 && m <= 7 ? m : -1,
    mapMode: (modo === "live" || modo === "both" || modo === "local" ? modo : "local") as MapMode,
    depth: (prof === "sup" || prof === "int" || prof === "deep" ? prof : "all") as DepthFilter,
    area,
  };
};

const NAV: [string, string][] = [
  ["#mapa", "Mapa"],
  ["#en-vivo", "En vivo"],
  ["#registro", "Registro"],
  ["#escalas", "Escalas"],
  ["#balance", "Balance"],
];

/* alerta sonora para sismos grandes (Web Audio, sin archivos) */
let audioCtx: AudioContext | null = null;
function playAlertSound(quakes: LiveQuake[]) {
  const maxM = Math.max(...quakes.map((q) => q.mag));
  try {
    audioCtx = audioCtx ?? new window.AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const now = audioCtx.currentTime;
    const tone = (freq: number, start: number, dur: number, gainV = 0.22) => {
      const osc = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(gainV, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(g);
      g.connect(audioCtx!.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };
    if (maxM >= 7) {
      tone(659, 0, 0.28, 0.28);
      tone(659, 0.3, 0.28, 0.28);
      tone(880, 0.6, 0.45, 0.32);
    } else {
      tone(880, 0, 0.18, 0.22);
      tone(1174, 0.2, 0.28, 0.22);
    }
  } catch {
    /* audio bloqueado por el navegador: se ignora */
  }
}

function SectionHead({ num, title, sub }: { num: string; title: string; sub: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="rv mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="font-mono text-[11px] tracking-[0.24em] text-amber uppercase">{num}</div>
        <h2 className="mt-2 font-display text-4xl leading-[0.95] tracking-wide text-bone sm:text-5xl">{title}</h2>
      </div>
      <p className="max-w-md text-sm leading-relaxed text-fog">{sub}</p>
    </div>
  );
}

/* reloj UTC aislado para que el tick por segundo no vuelva a renderizar toda la app */
function Clock() {
  return <span className="font-mono text-xs font-semibold tracking-widest text-amber">{useUtcClock()}</span>;
}

/* línea del titular con efecto de decodificación, aislada en su propio componente */
function ScrambleLine({ text, className }: { text: string; className?: string }) {
  const line = useScramble(text);
  return <span className={className}>{line || "\u00A0"}</span>;
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center border border-line bg-deep">
      <div className="pulse-soft h-24 w-2/3 border border-line bg-deep" />
    </div>
  );
}

function SidePanelSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="pulse-soft h-9 border border-line bg-deep" style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="pulse-soft h-10 border border-line bg-deep" style={{ animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  );
}

export default function App() {
  const urlInit = useMemo(readUrl, []);
  const [minMag, setMinMag] = useState(urlInit.minMag);
  const [region, setRegion] = useState<(typeof REGIONS)[number]>(urlInit.region);
  const [month, setMonth] = useState(urlInit.month);
  const [depth, setDepth] = useState<DepthFilter>(urlInit.depth);
  const [area, setArea] = useState<AreaRect | null>(urlInit.area ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(NAV[0][0]);

  /* scroll-spy: resalta en la navegación la sección visible */
  useEffect(() => {
    const offset = 120;
    const onScroll = () => {
      let current = NAV[0][0];
      for (const [h] of NAV) {
        const el = document.getElementById(h.slice(1));
        if (el && el.getBoundingClientRect().top <= offset) current = h;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* reproductor temporal del año */
  const [timePlay, setTimePlay] = useState(false);
  const [timeMonth, setTimeMonth] = useState(-1);

  useEffect(() => {
    if (timePlay && timeMonth >= 7) {
      setTimePlay(false);
      setTimeMonth(-1);
    }
  }, [timePlay, timeMonth]);

  /* capa EN VIVO — API gratuita del USGS (con caché en localStorage) */
  const [liveQuakes, setLiveQuakes] = useState<LiveQuake[]>(() => loadLiveCache("month")?.quakes ?? []);
  const [liveUpdated, setLiveUpdated] = useState<number | null>(() => loadLiveCache("month")?.savedAt ?? null);
  const [liveStale, setLiveStale] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"loading" | "ok" | "error">("loading");
  const [liveWindow, setLiveWindow] = useState<LiveWindow>("month");
  const [liveAlerts, setLiveAlerts] = useState<LiveQuake[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(() => localStorage.getItem("sismografo-sound") === "1");
  const knownIdsRef = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const [mapMode, setMapMode] = useState<MapMode>(urlInit.mapMode);
  const [liveSel, setLiveSel] = useState<string | null>(null);

  useEffect(() => {
    if (!timePlay || mapMode === "live") return;
    const id = window.setInterval(() => setTimeMonth((m) => (m >= 7 ? m : m + 1)), 1000);
    return () => window.clearInterval(id);
  }, [timePlay, mapMode]);

  const refreshLive = useCallback(() => {
    setLiveStatus("loading");
    fetchLiveQuakes(liveWindow)
      .then(({ quakes, updated, stale }) => {
        const prev = knownIdsRef.current;
        const isFirst = prev === null;
        knownIdsRef.current = new Set(quakes.map((q) => q.id));
        let fresh: LiveQuake[] = [];
        if (!isFirst && !stale) {
          fresh = quakes.filter((q) => q.mag >= 6 && !prev.has(q.id));
          if (fresh.length > 0) {
            const ids = new Set(fresh.map((q) => q.id));
            setLiveAlerts((cur) => [...fresh, ...cur.filter((a) => !ids.has(a.id))]);
            if (soundOnRef.current) playAlertSound(fresh);
          }
        }
        setLiveQuakes(quakes);
        setLiveUpdated(updated);
        setLiveStale(!!stale);
        setLiveStatus("ok");
      })
      .catch(() => setLiveStatus("error"));
  }, [liveWindow]);

  useEffect(() => {
    refreshLive();
    const id = window.setInterval(refreshLive, 5 * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWindow]);

  useEffect(() => {
    try {
      localStorage.setItem("sismografo-sound", soundOn ? "1" : "0");
    } catch {
      /* cuota llena o modo privado: se ignora */
    }
  }, [soundOn]);

  const reduced = usePrefersReducedMotion();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const mapSecRef = useRef<HTMLDivElement | null>(null);

  const introRef = useReveal<HTMLDivElement>();
  const dashRef = useReveal<HTMLDivElement>();
  const regRef = useReveal<HTMLDivElement>();
  const labRef = useReveal<HTMLDivElement>();
  const balRef = useReveal<HTMLDivElement>();

  const filtered = useMemo(
    () =>
      QUAKES.filter(
        (q) =>
          q.mag >= minMag &&
          (region === "Todas" || q.region === region) &&
          (month < 0 || Number(q.date.slice(5, 7)) - 1 === month) &&
          (depth === "all" || depthClass(q.depth).label === DEPTH_LABEL[depth]) &&
          (!area || (q.lat >= area.minLat && q.lat <= area.maxLat && q.lon >= area.minLon && q.lon <= area.maxLon))
      ),
    [minMag, region, month, depth, area]
  );

  const visibleQuakes = useMemo(
    () =>
      timeMonth >= 0
        ? filtered.filter((q) => Number(q.date.slice(5, 7)) - 1 <= timeMonth)
        : filtered,
    [filtered, timeMonth]
  );

  /* la capa en vivo se filtra igual que la local salvo región y mes (ventana móvil) */
  const filteredLive = useMemo(
    () =>
      liveQuakes.filter(
        (q) =>
          q.mag >= minMag &&
          (depth === "all" || depthClass(q.depth).label === DEPTH_LABEL[depth]) &&
          (!area || (q.lat >= area.minLat && q.lat <= area.maxLat && q.lon >= area.minLon && q.lon <= area.maxLon))
      ),
    [liveQuakes, minMag, depth, area]
  );

  const modeCount =
    mapMode === "live"
      ? filteredLive.length
      : mapMode === "both"
        ? filtered.length + filteredLive.length
        : filtered.length;

  const selectMapMode = useCallback((m: MapMode) => {
    if (m === "live") {
      setRegion("Todas");
      setMonth(-1);
    }
    setMapMode(m);
  }, []);

  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setLiveSel(null);
      emitInstallSignal("map-select");
    }
  }, []);

  const onSelectLive = useCallback((id: string | null) => {
    setLiveSel(id);
    if (id) {
      setSelectedId(null);
      emitInstallSignal("map-select");
    }
  }, []);

  const togglePlayer = () => {
    if (timePlay) setTimePlay(false);
    else {
      if (timeMonth < 0) setTimeMonth(0);
      setTimePlay(true);
    }
  };

  const resetPlayer = () => {
    setTimePlay(false);
    setTimeMonth(-1);
  };

  useEffect(() => {
    setSelectedId(null);
    setLiveSel(null);
  }, [minMag, region, month, depth, area]);

  /* filtros compartibles por URL */
  useEffect(() => {
    const p = new URLSearchParams();
    if (minMag !== 0) p.set("mag", String(minMag));
    if (region !== "Todas") p.set("region", region);
    if (month >= 0) p.set("month", String(month));
    if (mapMode !== "local") p.set("modo", mapMode);
    if (depth !== "all") p.set("prof", depth);
    if (area) p.set("zona", `${area.minLat},${area.maxLat},${area.minLon},${area.maxLon}`);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [minMag, region, month, mapMode, depth, area]);

  const pickFromTable = (q: Quake) => {
    setSelectedId(q.id);
    mapSecRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  };

  const liveMax = filteredLive.reduce((m, q) => Math.max(m, q.mag), 0);
  const liveCountries = new Set(filteredLive.map((q) => q.country)).size;
  const liveTsunami = filteredLive.filter((q) => q.tsunami).length;
  const latest = filteredLive[0];

  const sheetLive = liveSel ? filteredLive.find((q) => q.id === liveSel) ?? null : null;
  const sheetLocal = !sheetLive && selectedId ? visibleQuakes.find((q) => q.id === selectedId) ?? null : null;

  const filterSummary = [
    mapMode === "live" ? "en vivo" : null,
    minMag > 0 ? `M≥${minMag}` : null,
    region !== "Todas" ? region : null,
    month >= 0 ? MONTHS_ES[month] : null,
    depth !== "all" ? DEPTH_LABEL[depth] : null,
    area ? "zona" : null,
  ].filter(Boolean) as string[];

  const captionParts = [
    region !== "Todas" ? region : null,
    minMag > 0 ? `M≥${minMag}` : null,
    month >= 0 ? MONTHS_ES[month] : null,
    depth !== "all" ? DEPTH_LABEL[depth] : null,
    area ? "zona" : null,
  ];
  const caption = captionParts.some(Boolean)
    ? `${captionParts.filter(Boolean).join(" · ")} · ${modeCount} EVENTOS`
    : null;

  const renderFilters = useCallback(
    (_compact: boolean) => {
    const d = (v: string) => (_compact ? "" : v);
    return (
    <div className={`grid grid-cols-2 items-stretch gap-x-3 gap-y-3 ${d("md:grid-cols-12 md:items-center md:gap-3")}`}>
      {/* Magnitud */}
      <div className={`col-span-2 flex flex-col gap-1.5 ${d("md:col-span-12 lg:col-span-7 md:flex-row md:items-center md:gap-3")}`}>
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Magnitud</span>
        <div className="flex w-full overflow-hidden border border-line md:w-auto">
          {MAG_CHIPS.map((c) => (
            <button
              key={c.v}
              onClick={() => setMinMag(c.v)}
              className={`chip-btn flex-1 px-1 py-1.5 font-mono text-[10px] sm:px-3 sm:text-xs md:flex-none ${
                minMag === c.v ? "bg-amber text-abyss" : "bg-panel text-fog hover:text-bone"
              }`}
            >
              {c.l}
            </button>
          ))}
        </div>
      </div>
      {/* Región */}
      <div className={`flex min-w-0 flex-col gap-1.5 ${d("md:col-span-6 lg:col-span-2 md:flex-row md:items-center md:gap-3")}`}>
        <span className={`font-mono text-[10px] tracking-[0.2em] uppercase ${mapMode === "live" ? "text-dim/60" : "text-dim"}`}>Región</span>
        <select
          value={region}
          disabled={mapMode === "live"}
          onChange={(e) => setRegion(e.target.value as (typeof REGIONS)[number])}
          title={mapMode === "live" ? "La región solo filtra el catálogo 2026 — cámbiate a Local o Ambos" : undefined}
          className="w-full min-w-0 chip-btn border border-line bg-panel px-3 py-1.5 font-mono text-xs text-bone outline-none hover:border-fog disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      {/* Mes */}
      <div className={`flex min-w-0 flex-col gap-1.5 ${d("md:col-span-6 lg:col-span-3 md:flex-row md:items-center md:gap-3")}`}>
        <span className={`font-mono text-[10px] tracking-[0.2em] uppercase ${mapMode === "live" ? "text-dim/60" : "text-dim"}`}>Mes</span>
        <select
          value={month}
          disabled={mapMode === "live"}
          onChange={(e) => setMonth(Number(e.target.value))}
          title={mapMode === "live" ? "El mes no aplica al feed en vivo (ventana móvil)" : undefined}
          className="w-full min-w-0 chip-btn border border-line bg-panel px-3 py-1.5 font-mono text-xs text-bone outline-none hover:border-fog disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
        >
          <option value={-1}>Todo el año</option>
          {MONTHS_ES.slice(0, 8).map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
      </div>
      {/* Profundidad */}
      <div className={`col-span-2 flex flex-col gap-1.5 ${d("md:col-span-12 lg:col-span-7 md:flex-row md:items-center md:gap-3")}`}>
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Profundidad</span>
        <div className="flex w-full overflow-hidden border border-line md:w-auto">
          {DEPTH_CHIPS.map((c) => (
            <button
              key={c.v}
              onClick={() => setDepth(c.v)}
              className={`chip-btn flex-1 px-1 py-1.5 font-mono text-[10px] sm:px-3 sm:text-xs md:flex-none ${
                depth === c.v ? "bg-amber text-abyss" : "bg-panel text-fog hover:text-bone"
              }`}
            >
              {c.l}
            </button>
          ))}
        </div>
      </div>
      {/* Capa + contador + refresco */}
      <div className={`col-span-2 flex flex-col gap-1.5 ${d("md:col-span-12 lg:col-span-5 md:flex-row md:items-center md:gap-3")}`}>
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase md:hidden">Capa</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <div className="grid w-full grid-cols-3 overflow-hidden border border-line sm:min-w-[170px] sm:flex-1" role="group" aria-label="Capa de datos del mapa">
            {[
              { m: "local", l: "2026 · Local" },
              { m: "live", l: "USGS · En vivo" },
              { m: "both", l: "Ambos" },
            ].map((o) => (
              <button
                key={o.m}
                onClick={() => selectMapMode(o.m as MapMode)}
                aria-pressed={mapMode === o.m}
                title={
                  o.m === "local"
                    ? "Catálogo 2026 con datos locales"
                    : o.m === "live"
                      ? "Sismos reales del USGS (últimos 30 días), filtrados por magnitud, profundidad y zona"
                      : "Ambas capas superpuestas"
                }
                className={`chip-btn flex min-w-0 items-center justify-center gap-1 overflow-hidden px-1 py-1.5 font-mono text-[10px] uppercase transition-colors sm:px-3 sm:text-[11px] ${
                  mapMode === o.m
                    ? "bg-amber text-abyss"
                    : "bg-panel text-fog hover:text-bone"
                }`}
              >
                <span className="sm:hidden">
                  {o.m === "live" ? "En vivo" : o.m === "local" ? "Local" : "Ambos"}
                </span>
                <span className="hidden min-w-0 truncate sm:inline">{o.l}</span>
                {o.m !== "local" && (
                  <span className="shrink-0 opacity-80">
                    · {liveStatus === "loading" ? "···" : filteredLive.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <span className="border border-line bg-panel px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-jade sm:text-[11px]">
              {modeCount} EVENTOS
            </span>
            <button
              onClick={refreshLive}
              aria-label="Actualizar datos del USGS"
              title="Actualizar datos del USGS"
              className="chip-btn grid h-[30px] w-[30px] shrink-0 place-items-center border border-line bg-panel text-fog hover:border-teal hover:text-teal"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                className={liveStatus === "loading" ? "animate-spin" : ""}
              >
                <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    );
    },
    [minMag, region, month, depth, mapMode, liveStatus, filtered, filteredLive, refreshLive, selectMapMode]
  );

  /* barra de filtros dentro del mapa (identidad estable para memoizar WorldMap) */
  const fullscreenBar = useMemo(() => renderFilters(true), [renderFilters]);

  return (
    <div className="relative min-h-screen">
      <div className="backdrop-grid" aria-hidden />
      <div className="backdrop-noise" aria-hidden />

      {/* ---------- barra superior ---------- */}
      <header className="sticky top-0 z-40 border-b border-line bg-abyss/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center border border-amber/60 bg-panel">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#f59e42" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 10h3.5l2-5.5 2.5 11 2-7 1.2 2.8 1-1.3H19" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block font-display text-lg tracking-[0.08em] text-bone">SISMÓGRAFO·26</span>
              <span className="block font-mono text-[9px] tracking-[0.28em] text-dim uppercase">Observatorio de terremotos</span>
            </span>
          </a>
          <nav className="hidden items-center gap-5 font-mono text-[11px] tracking-[0.16em] text-fog uppercase md:flex">
            {NAV.map(([h, l]) => (
              <a
                key={h}
                href={h}
                className={`chip-btn border-b pb-0.5 ${
                  activeSection === h ? "border-amber text-amber" : "border-transparent text-fog hover:border-amber hover:text-amber"
                }`}
              >
                {l}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] tracking-widest text-fog sm:flex">
              <span className="blink-dot inline-block h-2 w-2 rounded-full bg-verm" />
              EN VIVO
            </span>
            <span className="font-mono text-xs font-semibold tracking-widest text-amber"><Clock /></span>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
              className="chip-btn grid h-9 w-9 place-items-center border border-line bg-panel text-fog hover:border-amber hover:text-amber md:hidden"
            >
              {menuOpen ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} items={NAV} active={activeSection} />

      <Ticker quakes={QUAKES} />

      {/* ---------- apertura ---------- */}
      <section className="relative z-10 mx-auto max-w-[1400px] px-4 pt-12 pb-10 sm:px-6 sm:pt-16">
        <div ref={introRef} className="rv grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.24em] text-amber uppercase">
              <span className="inline-block h-px w-10 bg-amber" />
              Temporada sísmica · {ANNUAL.period}
            </div>
            <h1 className="mt-5 font-display leading-[0.9] tracking-wide">
              <ScrambleLine text="LA TIERRA TEMBLÓ" className="block text-[clamp(3rem,8.5vw,7.5rem)] text-bone" />
              <ScrambleLine text="8.462 VECES" className="block text-[clamp(3rem,8.5vw,7.5rem)] text-verm" />
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-fog">
              De la doble sacudida de <strong className="text-bone">Venezuela</strong> al megasismo de{" "}
              <strong className="text-bone">Mindanao</strong>: todos los epicentros relevantes registrados en el
              mundo en 2026, con su magnitud, intensidad, víctimas y costo estimado. Haz clic en cualquier
              punto del mapa para abrir su ficha.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-3">
              {[
                { v: fmt(ANNUAL.deaths), l: "víctimas fatales", c: "#f0603c" },
                { v: String(ANNUAL.m7), l: "sismos M7 o más", c: "#f59e42" },
                { v: "M7.8", l: "máxima magnitud", c: "#e23a62" },
              ].map((s, i) => (
                <div key={s.l} className={`rv rv-d${i + 1} min-w-0 border border-line bg-panel px-2 py-3 sm:px-5`}>
                  <div className="font-display text-2xl leading-none sm:text-3xl" style={{ color: s.c }}>{s.v}</div>
                  <div className="mt-1 font-mono text-[9px] leading-snug tracking-[0.2em] text-dim uppercase break-words">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ficha del periodo */}
          <div className="rv rv-d2 lg:col-span-5">
            <div className="border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <span className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Ficha del periodo</span>
                <span className="drift-y font-mono text-[10px] tracking-widest text-jade">▲ 28 DESTACADOS</span>
              </div>
              <table className="w-full border-collapse">
                <tbody>
                  {[
                    ["Periodo cubierto", ANNUAL.period],
                    ["Registros M4 o más", fmt(ANNUAL.totalM4)],
                    ["Sismos M6 — M7.9", `${ANNUAL.m6 + ANNUAL.m7} (${ANNUAL.m7} de M7+)`],
                    ["Más fuerte", "M7.8 · Mindanao, Filipinas"],
                    ["Más mortífero", "Venezuela · 6.301 fallecidos"],
                    ["En el Anillo de Fuego", "10 de 11 sismos M7+"],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-3 align-baseline font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{k}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-bone">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-line px-5 py-3">
                <div className="mb-1 font-mono text-[9px] tracking-[0.22em] text-dim uppercase">Onda sísmica · simulación</div>
                <Seismograph amp={0.45} seed={26} height={54} color="#3ec9a7" />
              </div>
            </div>

            {/* resumen en vivo · USGS (se actualiza solo cada 5 min) */}
            <div className="mt-4 border border-teal/40 bg-panel">
              <div className="flex items-center justify-between border-b border-teal/30 bg-deep/60 px-5 py-3">
                <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-teal uppercase">
                  <span className="relative flex h-2 w-2">
                    <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                  </span>
                  Resumen en vivo · USGS
                </span>
                <span className={`font-mono text-[9px] tracking-widest uppercase ${liveStale ? "text-amber" : "text-dim"}`}>
                  {liveStatus === "ok"
                    ? liveStale
                      ? `caché · ${timeAgo(liveUpdated ?? Date.now())}`
                      : `act. ${timeAgo(liveUpdated ?? Date.now())}`
                    : liveStatus === "loading"
                      ? "sincronizando…"
                      : "sin señal"}
                </span>
              </div>
              {liveStatus === "ok" ? (
                <table className="w-full border-collapse">
                  <tbody>
                    {[
                      ["Sismos M4.5+ (30 d)", String(liveQuakes.length)],
                      ["Máxima magnitud", `M${liveMax.toFixed(1)}`],
                      ["Último evento", latest ? latest.place : "—"],
                      ["Países y territorios", String(liveCountries)],
                      ["Alertas de tsunami", String(liveTsunami)],
                    ].map(([k, v]) => (
                      <tr key={k} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-2.5 align-baseline font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{k}</td>
                        <td className="px-5 py-2.5 text-right text-sm font-semibold break-words text-bone">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : liveStatus === "loading" ? (
                <div className="space-y-3 p-5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="pulse-soft h-4 border border-line bg-deep" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </div>
              ) : (
                <p className="px-5 py-6 text-center font-mono text-[10px] tracking-[0.18em] text-dim uppercase">
                  Señal interrumpida — pulsa ↻ para reintentar
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 01 mapa ---------- */}
      <section id="mapa" ref={mapSecRef} className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="01 · Epicentros"
          title="EL MAPA DEL TEMBLOR"
          sub={`Proyección Natural Earth con los epicentros del catálogo 2026 (${CATALOG_FIRST} – ${CATALOG_LAST}). El tamaño y el color de cada punto siguen la magnitud de momento (Mw). Rueda para hacer zoom, arrastra para moverte.`}
        />

        <div ref={dashRef} className="rv mb-5 hidden lg:block">{renderFilters(false)}</div>

        <button
          onClick={() => setFiltersOpen(true)}
          aria-label="Abrir filtros"
          className="chip-btn mb-5 flex w-full items-center justify-between gap-3 border border-line bg-panel px-4 py-3 text-left lg:hidden"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-fog uppercase">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-amber">
              <path d="M2 4h12M4.5 8h7M7 12h2" />
            </svg>
            Filtros
            {filterSummary.length > 0 && (
              <span className="border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-amber">
                {filterSummary.join(" · ")}
              </span>
            )}
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-dim">
            <path d="M3 6l5 5 5-5" />
          </svg>
        </button>

        <YearPlayer
          playing={timePlay}
          month={timeMonth}
          disabled={month !== -1 || mapMode === "live"}
          disabledHint={
            mapMode === "live"
              ? "El reproductor anima solo el catálogo 2026 — usa la capa Local o Ambos"
              : "Desactiva el filtro de mes para reproducir"
          }
          count={visibleQuakes.length}
          onPlayPause={togglePlayer}
          onSeek={setTimeMonth}
          onReset={resetPlayer}
        />

        <div className="grid grid-cols-1 gap-4 lg:h-[620px] lg:grid-cols-12">
          <div className="h-[65vh] min-h-[340px] max-h-[580px] sm:h-[500px] lg:col-span-7 lg:h-full">
            <Suspense fallback={<MapSkeleton />}>
              <WorldMap
                quakes={filtered}
                selectedId={selectedId}
                onSelect={onSelect}
                liveQuakes={filteredLive}
                mode={mapMode}
                liveSelectedId={liveSel}
                onSelectLive={onSelectLive}
                caption={caption}
                fullscreenBar={fullscreenBar}
                maxMonth={timeMonth}
                areaFilter={area}
                onAreaChange={setArea}
              />
            </Suspense>
          </div>
          <div className="no-scrollbar h-[480px] min-h-0 overflow-y-auto lg:col-span-5 lg:h-full">
            <Suspense fallback={<SidePanelSkeleton />}>
              {liveSel && filteredLive.some((q) => q.id === liveSel) ? (
                <LiveDetail
                  q={filteredLive.find((q) => q.id === liveSel)!}
                  onClose={() => setLiveSel(null)}
                />
              ) : mapMode === "live" ? (
                <LiveList quakes={filteredLive} onSelect={setLiveSel} alertIds={new Set(liveAlerts.map((a) => a.id))} />
              ) : (
                <SidePanel quakes={visibleQuakes} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </Suspense>
          </div>
        </div>

        {/* ficha de sismo en móvil */}
        <BottomSheet
          open={isMobile && (sheetLive !== null || sheetLocal !== null)}
          onClose={() => {
            setLiveSel(null);
            setSelectedId(null);
          }}
        >
          <Suspense fallback={<div className="pulse-soft mx-4 mt-2 h-24 border border-line bg-deep" />}>
            {sheetLive ? (
              <LiveDetail q={sheetLive} onClose={() => setLiveSel(null)} />
            ) : sheetLocal ? (
              <Detail q={sheetLocal} onClose={() => setSelectedId(null)} />
            ) : null}
          </Suspense>
        </BottomSheet>

        {/* filtros en móvil */}
        <BottomSheet open={isMobile && filtersOpen} onClose={() => setFiltersOpen(false)} maxHeight="78dvh">
          <div className="px-4 pt-1">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Filtros del mapa</span>
              <button
                onClick={() => setFiltersOpen(false)}
                aria-label="Cerrar filtros"
                className="chip-btn grid h-8 w-8 place-items-center border border-line text-fog hover:border-verm hover:text-verm"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
            {renderFilters(true)}
          </div>
        </BottomSheet>
      </section>

      {/* ---------- 01b en vivo ---------- */}
      <section id="en-vivo" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="01·B · Alimentación en vivo"
          title="PULSO EN TIEMPO REAL"
          sub="Conexión directa a la API abierta del USGS Earthquake Hazards Program: cada sismo de magnitud 4.5 o mayor registrado en el mundo durante una ventana móvil configurable (1 h · 24 h · 7 días · 30 días), sin claves ni intermediarios."
        />

        {liveStatus === "error" ? (
          <div className="border border-verm/50 bg-verm/10 p-8 text-center">
            <div className="font-display text-2xl tracking-wide text-verm">SEÑAL INTERRUMPIDA</div>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fog">
              No fue posible conectar con el feed del USGS (¿sin red o servicio ocupado?). El resto del
              observatorio funciona con datos locales.
            </p>
            <button
              onClick={refreshLive}
              className="chip-btn mt-5 border border-verm/60 bg-verm/15 px-5 py-2 font-mono text-xs tracking-[0.18em] text-verm uppercase hover:bg-verm/25"
            >
              ↻ Reintentar conexión
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            {/* estado del feed */}
            <div className="border border-teal/40 bg-panel">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-teal/30 bg-deep/60 px-4 py-3 sm:px-5">
                <span className="flex w-full items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-teal uppercase sm:w-auto">
                  <span className="relative flex h-2 w-2">
                    <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                  </span>
                  USGS · FEED ABIERTO
                </span>
                <select
                  value={liveWindow}
                  onChange={(e) => setLiveWindow(e.target.value as LiveWindow)}
                  title="Ventana del feed"
                  aria-label="Ventana del feed"
                  className="border border-teal/40 bg-deep px-2 py-1 font-mono text-[10px] tracking-widest text-teal uppercase outline-none hover:border-teal"
                >
                  {USGS_WINDOWS.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <a
                  href={feedUrl(liveWindow)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] tracking-widest text-dim uppercase hover:text-teal"
                >
                  GeoJSON ↗
                </a>
                <button
                  onClick={() => setSoundOn((v) => !v)}
                  aria-pressed={soundOn}
                  aria-label={soundOn ? "Silenciar alertas de sismos grandes" : "Activar sonido de alertas"}
                  title={soundOn ? "Alerta sonora activada · clic para silenciar" : "Alerta sonora desactivada · clic para activar"}
                  className={`font-mono text-[10px] tracking-widest uppercase ${soundOn ? "text-amber" : "text-dim hover:text-teal"}`}
                >
                  {soundOn ? "🔔 ALERTA SONORA ON" : "🔕 ALERTA SONORA OFF"}
                </button>
                <button
                  onClick={() => {
                    downloadLiveCSV(filteredLive);
                    emitInstallSignal("export");
                  }}
                  className="font-mono text-[10px] tracking-widest text-dim uppercase hover:text-teal"
                >
                  Guardar CSV
                </button>
              </div>
              {liveStatus === "loading" ? (
                <div className="space-y-3 p-5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="pulse-soft h-4 border border-line bg-deep" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                  <div className="pt-2 text-center font-mono text-[10px] tracking-[0.2em] text-dim uppercase">
                    Sintonizando estaciones sísmicas…
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <div className="min-w-0 border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-display text-3xl text-teal">{filteredLive.length}</div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] break-words text-dim uppercase">
                        Sismos M4.5+ en {USGS_WINDOWS.find((w) => w.key === liveWindow)?.days}
                      </div>
                    </div>
                    <div className="min-w-0 border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-display text-3xl" style={{ color: magColor(liveMax) }}>
                        M{liveMax.toFixed(1)}
                      </div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] break-words text-dim uppercase">Máxima en la ventana</div>
                    </div>
                    <div className="min-w-0 border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-mono text-sm font-semibold break-words text-bone">
                        {latest ? timeAgo(latest.time) : "—"}
                      </div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] break-words text-dim uppercase">Último evento</div>
                    </div>
                    <div className="min-w-0 border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-mono text-sm font-semibold break-words text-bone">
                        {liveUpdated ? (liveStale ? `caché · ${timeAgo(liveUpdated)}` : timeAgo(liveUpdated).replace("hace instantes", "ahora")) : "—"}
                      </div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] break-words text-dim uppercase">Última sincronización</div>
                    </div>
                  </div>
                  <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-wider text-dim uppercase">
                    Actualización automática cada 5 min · los marcadores con retícula verde en el mapa
                    pertenecen a esta capa · sin conexión se sirve el último feed en caché
                  </p>
                </div>
              )}
            </div>

            {/* últimos eventos */}
            <div className="border border-line bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-deep/60 px-4 py-3 sm:px-5">
                <span className="min-w-0 font-mono text-[10px] tracking-[0.22em] text-dim uppercase">
                  Últimos eventos · clic para ubicar en el mapa
                </span>
                <span className="shrink-0 font-mono text-[10px] tracking-widest text-teal">
                  {liveStatus === "ok" ? `MOSTRANDO ${Math.min(12, filteredLive.length)} DE ${filteredLive.length}` : ""}
                </span>
              </div>
              {liveStatus === "loading" ? (
                <div className="space-y-2 p-5">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="pulse-soft h-9 border border-line bg-deep" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-line/60">
                  {filteredLive.slice(0, 12).map((q) => {
                    const alert = liveAlerts.some((a) => a.id === q.id);
                    return (
                    <li key={q.id} className={alert ? "min-w-0 border-l-2 border-l-verm bg-verm/5" : "min-w-0"}>
                      <button
                        onClick={() => {
                          setLiveSel(q.id);
                          setSelectedId(null);
                          if (alert) setLiveAlerts((cur) => cur.filter((a) => a.id !== q.id));
                          mapSecRef.current?.scrollIntoView({
                            behavior: reduced ? "auto" : "smooth",
                            block: "start",
                          });
                        }}
                        className="row-hover group flex min-w-0 w-full items-center gap-4 px-4 py-2.5 text-left sm:px-5"
                      >
                        <span className="block w-16 shrink-0 truncate font-mono text-[11px] tracking-wider text-dim">
                          {timeAgo(q.time).replace("hace ", "")}
                        </span>
                        <span
                          className="grid h-9 w-12 shrink-0 place-items-center border font-display text-lg"
                          style={{ color: magColor(q.mag), borderColor: `${magColor(q.mag)}55`, background: `${magColor(q.mag)}12` }}
                        >
                          {q.mag.toFixed(1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-bone">
                            {q.place}
                            {alert && <span className="ml-2 font-mono text-[9px] tracking-widest text-verm uppercase">· ⚠ NUEVO</span>}
                          </span>
                          <span className="block font-mono text-[10px] tracking-wider text-dim">
                            {q.depth} km prof. · sig {q.sig}
                            {q.tsunami && <span className="text-verm"> · ⚠ tsunami</span>}
                          </span>
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          className="shrink-0 text-dim transition-all group-hover:translate-x-1 group-hover:text-teal"
                        >
                          <path d="M2 7h9M8 3.5L11.5 7 8 10.5" />
                        </svg>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 02 registro ---------- */}
      <section id="registro" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <div ref={regRef} className="rv">
          <SectionHead
            num="02 · Registro completo"
            title="BITÁCORA DEL AÑO"
            sub={`Los eventos destacados del catálogo 2026 (${CATALOG_FIRST} – ${CATALOG_LAST}), ordenables por fecha, magnitud, profundidad, víctimas o costo. Toca una fila para localizarla en el mapa.`}
          />
          <div className="mb-4 grid grid-cols-2 items-center gap-2 md:flex md:flex-wrap">
            <button
              onClick={() => {
                downloadQuakesCSV(filtered);
                emitInstallSignal("export");
              }}
              className="chip-btn flex min-w-0 items-center justify-center gap-1.5 overflow-hidden border border-line bg-panel px-2.5 py-2 font-mono text-[11px] tracking-[0.18em] text-fog uppercase hover:border-amber hover:text-amber"
            >
              ⬇
              <span className="min-w-0 truncate">
                <span className="sm:hidden">CSV</span>
                <span className="hidden sm:inline">Exportar CSV</span>
              </span>
            </button>
            <button
              onClick={() => {
                downloadQuakesGeoJSON(filtered);
                emitInstallSignal("export");
              }}
              className="chip-btn flex min-w-0 items-center justify-center gap-1.5 overflow-hidden border border-line bg-panel px-2.5 py-2 font-mono text-[11px] tracking-[0.18em] text-fog uppercase hover:border-amber hover:text-amber"
            >
              ⬇
              <span className="min-w-0 truncate">
                <span className="sm:hidden">GeoJSON</span>
                <span className="hidden sm:inline">Exportar GeoJSON</span>
              </span>
            </button>
            <span className="col-span-2 font-mono text-[10px] tracking-widest text-dim uppercase md:ml-auto">
              {filtered.length} registros filtrados
            </span>
          </div>
          <Suspense fallback={<SectionSkeleton />}>
            <Registry quakes={filtered} onPick={pickFromTable} />
          </Suspense>
        </div>
      </section>

      {/* ---------- 03 escalas ---------- */}
      <section id="escalas" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <div ref={labRef} className="rv">
          <Suspense fallback={<SectionSkeleton />}>
            <MagnitudeLab />
          </Suspense>
        </div>
      </section>

      {/* ---------- 04 balance ---------- */}
      <section id="balance" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="04 · Balance"
          title="LA FACTURA DE 2026"
          sub={`Contadores del año, ritmo mensual de sismos mayores y víctimas, y el impacto económico preliminar del catálogo 2026 (${CATALOG_FIRST} – ${CATALOG_LAST}).`}
        />
        <div ref={balRef} className="rv">
          <Suspense fallback={<SectionSkeleton />}>
            <Balance />
          </Suspense>
        </div>
      </section>

      {/* ---------- pie ---------- */}
      <footer className="relative z-10 mt-8 border-t border-line bg-deep">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <div className="font-display text-xl tracking-wide text-bone">SISMÓGRAFO·26</div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-fog">
              Observatorio visual de la actividad sísmica mundial en 2026. Las magnitudes provienen de
              catálogos del <a className="text-amber underline-offset-2 hover:underline" href="https://earthquake.usgs.gov" target="_blank" rel="noreferrer">USGS</a> y
              el recuento colaborativo de{" "}
              <a className="text-amber underline-offset-2 hover:underline" href="https://es.wikipedia.org/wiki/Anexo:Terremotos_de_2026" target="_blank" rel="noreferrer">
                Wikipedia
              </a>
              ; los contextos, de{" "}
              <a className="text-amber underline-offset-2 hover:underline" href="https://www.dw.com/es/seis-terremotos-que-han-cimbrado-al-mundo-en-2026/a-78356871" target="_blank" rel="noreferrer">DW</a>.
            </p>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Metodología</div>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fog">
              <li>· Magnitud de momento (Mw) según USGS.</li>
              <li>· Intensidad máxima en escala Mercalli modificada.</li>
              <li>· Costos: estimaciones preliminares de prensa; se revisan con los meses.</li>
              <li>· Sismos menores incluidos solo si causaron daños o víctimas.</li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Aviso</div>
            <p className="mt-3 text-sm leading-relaxed text-fog">
              Sitio divulgativo con datos al <span className="text-bone">15 de agosto de 2026</span>. Las cifras
              de víctimas y daños son balances provisionales y pueden variar. No es un servicio de alerta
              temprana: ante un sismo, sigue a tu agencia de protección civil.
            </p>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-4 font-mono text-[10px] tracking-[0.2em] text-dim uppercase sm:px-6">
            <span>© 2026 · Sismógrafo — observatorio sísmico</span>
            <span>
              Desarrollado por{" "}
              <a
                href="https://sysjol.onrender.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal transition-colors hover:text-amber"
              >
                SysJoL
              </a>
            </span>
            <span>Catálogo 2026 · corte {CATALOG_LAST}</span>
          </div>
        </div>
      </footer>

      {/* aviso de instalación PWA (se difiere si hay sheet/alertas o pantalla completa) */}
      <InstallBanner
        blocked={(isMobile && (filtersOpen || sheetLive !== null || sheetLocal !== null)) || liveAlerts.length > 0}
      />

      {/* alerta de sismo grande en vivo */}
      {liveAlerts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[80] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2">
          <div className="flex items-center justify-between gap-3 border border-verm/60 bg-abyss/95 px-4 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-sm">
            <span className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.22em] text-verm uppercase">
              <span className="relative flex h-2 w-2">
                <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-verm opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-verm" />
              </span>
              {liveAlerts.length === 1 ? "1 ALERTA M≥6" : `${liveAlerts.length} ALERTAS M≥6`}
            </span>
            <button
              onClick={() => setLiveAlerts([])}
              className="font-mono text-[11px] text-dim hover:text-bone"
              aria-label="Descartar alertas"
              title="Descartar alertas"
            >
              ×
            </button>
          </div>
          {liveAlerts.slice(0, 3).map((q) => {
            const c = magColor(q.mag);
            return (
              <button
                key={q.id}
                onClick={() => {
                  setLiveSel(q.id);
                  setSelectedId(null);
                  setLiveAlerts((cur) => cur.filter((a) => a.id !== q.id));
                  mapSecRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                }}
                className="row-hover flex items-center gap-3 border border-verm/40 bg-abyss/95 px-4 py-2.5 text-left shadow-2xl shadow-black/50 backdrop-blur-sm"
              >
                <span
                  className="grid h-9 w-12 shrink-0 place-items-center border font-display text-lg"
                  style={{ color: c, borderColor: `${c}55`, background: `${c}12` }}
                >
                  {q.mag.toFixed(1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-bone">{q.place}</span>
                  <span className="block font-mono text-[10px] tracking-wider text-verm uppercase">
                    NUEVO · M≥6 · {timeAgo(q.time)}
                  </span>
                </span>
              </button>
            );
          })}
          {liveAlerts.length > 3 && (
            <div className="border border-line bg-abyss/95 px-4 py-1.5 text-center font-mono text-[10px] tracking-widest text-dim uppercase">
              +{liveAlerts.length - 3} más en la lista
            </div>
          )}
        </div>
      )}
    </div>
  );
}
