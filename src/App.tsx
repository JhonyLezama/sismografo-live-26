import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Region, Quake } from "./data/quakes";
import { QUAKES, ANNUAL, fmt, MONTHS_ES, magColor, depthClass, CATALOG_FIRST, CATALOG_LAST } from "./data/quakes";
import type { MapMode, AreaRect } from "./components/WorldMap";
import BottomSheet from "./components/BottomSheet";
import { fetchLiveQuakes, timeAgo, feedUrl, loadLiveCache, USGS_WINDOWS } from "./data/usgs";
import type { LiveQuake, LiveWindow } from "./data/usgs";
import { fetchEmscLive, mergeSources } from "./data/emsc";
import type { LiveSource } from "./data/emsc";
import type { GdacsAlert } from "./data/gdacs";
import { loadGdacs } from "./data/gdacs";
import { downloadLiveCSV, downloadQuakesCSV, downloadQuakesGeoJSON } from "./data/export";
import { emitInstallSignal } from "./installSignals";
import Ticker from "./components/Ticker";
import Seismograph from "./components/Seismograph";
import YearPlayer from "./components/YearPlayer";
import InstallBanner from "./components/InstallBanner";
import Toaster from "./components/Toaster";
import SideNav from "./components/SideNav";
import BottomTabs from "./components/BottomTabs";
import FeltSheet from "./components/FeltSheet";
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
    mapMode: (modo === "both" || modo === "local" ? modo : "local") as MapMode,
    depth: (prof === "sup" || prof === "int" || prof === "deep" ? prof : "all") as DepthFilter,
    area,
  };
};

const NAV: [string, string][] = [
  ["#en-vivo", "En vivo"],
  ["#escalas", "Escalas"],
  ["#registro", "Archivo"],
  ["#balance", "Balance"],
];

/* hash legacy #mapa redirige a la vista única en vivo */
const normHash = (h: string) => (h === "#mapa" ? "#en-vivo" : h || "#en-vivo");

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [feltOpen, setFeltOpen] = useState(false);
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
  const [liveSource, setLiveSource] = useState<LiveSource>("usgs");
  const liveSourceRef = useRef(liveSource);
  liveSourceRef.current = liveSource;
  const [liveAlerts, setLiveAlerts] = useState<LiveQuake[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(() => localStorage.getItem("sismografo-sound") === "1");
  const knownIdsRef = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const [mapMode, setMapMode] = useState<MapMode>(urlInit.mapMode);
  const [liveSel, setLiveSel] = useState<string | null>(null);

  /* capa GDACS — snapshot servido desde public/gdacs.json (refrescado por el workflow) */
  const [gdacsAlerts, setGdacsAlerts] = useState<GdacsAlert[]>([]);
  useEffect(() => {
    let active = true;
    loadGdacs().then((a) => {
      if (active) setGdacsAlerts(a);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!timePlay || mapMode === "live") return;
    const id = window.setInterval(() => setTimeMonth((m) => (m >= 7 ? m : m + 1)), 1000);
    return () => window.clearInterval(id);
  }, [timePlay, mapMode]);

  const refreshLive = useCallback(() => {
    setLiveStatus("loading");
    const src = liveSourceRef.current;
    const tasks: Promise<{
      quakes: LiveQuake[];
      updated: number;
      stale: boolean;
    }>[] = [fetchLiveQuakes(liveWindow)];
    if (src !== "usgs") tasks.push(fetchEmscLive());
    Promise.all(tasks)
      .then(([usgsRes, emscRes]) => {
        const emsc = emscRes?.quakes ?? [];
        const prev = knownIdsRef.current;
        const isFirst = prev === null;
        knownIdsRef.current = new Set(usgsRes.quakes.map((q) => q.id));
        let fresh: LiveQuake[] = [];
        if (!isFirst && !usgsRes.stale) {
          fresh = usgsRes.quakes.filter((q) => q.mag >= 6 && !prev.has(q.id));
          if (fresh.length > 0) {
            const ids = new Set(fresh.map((q) => q.id));
            setLiveAlerts((cur) => [...fresh, ...cur.filter((a) => !ids.has(a.id))]);
            if (soundOnRef.current) playAlertSound(fresh);
          }
        }
        const quakes =
          src === "emsc" ? emsc : src === "both" ? mergeSources(usgsRes.quakes, emsc) : usgsRes.quakes;
        setLiveQuakes(quakes);
        setLiveUpdated(src === "emsc" ? (emscRes?.updated ?? usgsRes.updated) : usgsRes.updated);
        setLiveStale(src === "emsc" ? (emscRes?.stale ?? usgsRes.stale) : usgsRes.stale || !!emscRes?.stale);
        setLiveStatus("ok");
      })
      .catch(() => setLiveStatus("error"));
  }, [liveWindow]);

  useEffect(() => {
    refreshLive();
    const id = window.setInterval(refreshLive, 5 * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWindow, liveSource]);

  useEffect(() => {
    try {
      localStorage.setItem("sismografo-sound", soundOn ? "1" : "0");
    } catch {
      /* cuota llena o modo privado: se ignora */
    }
  }, [soundOn]);

  const reduced = usePrefersReducedMotion();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const isDesktop = !isMobile;
  const mapSecRef = useRef<HTMLDivElement | null>(null);

  /* vista móvil por hash: una sección a la vez, cero scroll largo (desktop intacto) */
  const [hashView, setHashView] = useState<string>(() => normHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setHashView(normHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const showSection = (h: string) => isDesktop || hashView === h;
  /* en móvil las vistas montan arriba del todo: visibles directo, sin animación de reveal */
  const rvView = isMobile ? "rv rv-on" : "rv";

  /* título por vista + volver arriba al cambiar en móvil */
  useEffect(() => {
    const t: Record<string, string> = {
      "#en-vivo": "En vivo · Sismógrafo 2026",
      "#registro": "Archivo 2026 · Sismógrafo 2026",
      "#escalas": "Escalas · Sismógrafo 2026",
      "#balance": "Balance 2026 · Sismógrafo 2026",
      "#acerca": "Acerca y fuentes · Sismógrafo 2026",
    };
    document.title = t[hashView] ?? "Sismógrafo 2026 · Observatorio de Terremotos";
    if (isMobile) window.scrollTo(0, 0);
  }, [hashView, isMobile]);

  const introRef = useReveal<HTMLDivElement>();
  const dashRef = useReveal<HTMLDivElement>();
  const regRef = useReveal<HTMLDivElement>();
  const archiveDashRef = useReveal<HTMLDivElement>();
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
    const goMap = () =>
      mapSecRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
    if (isMobile && hashView !== "#en-vivo") {
      window.location.hash = "#en-vivo";
      window.setTimeout(goMap, 150);
    } else {
      goMap();
    }
  };

  const liveMax = filteredLive.reduce((m, q) => Math.max(m, q.mag), 0);
  const liveCountries = new Set(filteredLive.map((q) => q.country)).size;
  const liveTsunami = filteredLive.filter((q) => q.tsunami).length;
  const latest = filteredLive[0];

  const sheetLive = liveSel ? filteredLive.find((q) => q.id === liveSel) ?? null : null;
  const sheetLocal = !sheetLive && selectedId ? visibleQuakes.find((q) => q.id === selectedId) ?? null : null;

  const filterSummary = [
    mapMode === "both" ? "ambos" : null,
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

  /* resumen y caption de la vista en vivo (sin región ni mes: son del archivo) */
  const liveFilterSummary = [
    minMag > 0 ? `M≥${minMag}` : null,
    depth !== "all" ? DEPTH_LABEL[depth] : null,
    area ? "zona" : null,
  ].filter(Boolean) as string[];
  const liveCaptionParts = [
    minMag > 0 ? `M≥${minMag}` : null,
    depth !== "all" ? DEPTH_LABEL[depth] : null,
    area ? "zona" : null,
  ];
  const liveCaption = liveCaptionParts.some(Boolean)
    ? `${liveCaptionParts.filter(Boolean).join(" · ")} · ${filteredLive.length} EN VIVO`
    : null;

  const [filtersFor, setFiltersFor] = useState<"live" | "archive">("live");

  const renderFilters = useCallback(
    (_compact: boolean, liveOnly = false) => {
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
      {/* Región (solo archivo 2026) */}
      {!liveOnly && (
      <div className={`flex min-w-0 flex-col gap-1.5 ${d("md:col-span-6 lg:col-span-2 md:flex-row md:items-center md:gap-3")}`}>
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Región</span>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as (typeof REGIONS)[number])}
          className="w-full min-w-0 chip-btn border border-line bg-panel px-3 py-1.5 font-mono text-xs text-bone outline-none hover:border-fog disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      )}
      {/* Mes (solo archivo 2026) */}
      {!liveOnly && (
      <div className={`flex min-w-0 flex-col gap-1.5 ${d("md:col-span-6 lg:col-span-3 md:flex-row md:items-center md:gap-3")}`}>
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Mes</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="w-full min-w-0 chip-btn border border-line bg-panel px-3 py-1.5 font-mono text-xs text-bone outline-none hover:border-fog disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
        >
          <option value={-1}>Todo el año</option>
          {MONTHS_ES.slice(0, 8).map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
      </div>
      )}
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
      {/* Capa del archivo + contador + refresco (en vivo es siempre live) */}
      <div className={`col-span-2 flex flex-col gap-1.5 ${d("md:col-span-12 lg:col-span-5 md:flex-row md:items-center md:gap-3")}`}>
        {!liveOnly && <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase md:hidden">Capa</span>}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          {!liveOnly && (
          <div className="grid w-full grid-cols-2 overflow-hidden border border-line sm:min-w-[170px] sm:flex-1" role="group" aria-label="Capa de datos del mapa">
            {[
              { m: "local", l: "2026 · Local" },
              { m: "both", l: "Ambos" },
            ].map((o) => (
              <button
                key={o.m}
                onClick={() => selectMapMode(o.m as MapMode)}
                aria-pressed={mapMode === o.m}
                title={
                  o.m === "local"
                    ? "Catálogo 2026 con datos locales"
                    : "Ambas capas superpuestas"
                }
                className={`chip-btn flex min-w-0 items-center justify-center gap-1 overflow-hidden px-1 py-1.5 font-mono text-[10px] uppercase transition-colors sm:px-3 sm:text-[11px] ${
                  mapMode === o.m
                    ? "bg-amber text-abyss"
                    : "bg-panel text-fog hover:text-bone"
                }`}
              >
                <span className="sm:hidden">
                  {o.m === "local" ? "Local" : "Ambos"}
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
          )}
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

  /* barras de filtros dentro del mapa (identidad estable para memoizar WorldMap) */
  const fullscreenBar = useMemo(() => renderFilters(true, true), [renderFilters]);
  const archiveFullscreenBar = useMemo(() => renderFilters(true, false), [renderFilters]);

  return (
    <div className="relative min-h-screen pb-20 lg:pb-0 lg:pl-56">
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
          </div>
        </div>
      </header>

      <SideNav active={activeSection} onFelt={() => setFeltOpen(true)} liveCount={liveStatus === "ok" ? filteredLive.length : null} />

      <Ticker quakes={QUAKES} live={liveQuakes} liveStatus={liveStatus} />

      {/* ---------- apertura (móvil: solo en vista En vivo) ---------- */}
      {showSection("#en-vivo") && (
      <section className="relative z-10 mx-auto max-w-[1400px] px-4 pt-12 pb-10 sm:px-6 sm:pt-16">
        <div ref={introRef} className={`${rvView} max-w-3xl`}>
          <div>
            <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.24em] text-teal uppercase">
              <span className="relative flex h-2 w-2">
                <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
              </span>
              En vivo · USGS + EMSC{liveStatus === "ok" && liveUpdated ? ` · act. ${timeAgo(liveUpdated)}` : liveStatus === "loading" ? " · sintonizando…" : " · sin señal"}
            </div>
            <h1 className="mt-5 font-display leading-[0.9] tracking-wide">
              <ScrambleLine text="¿SENTISTE" className="block text-[clamp(3rem,8.5vw,7.5rem)] text-bone" />
              <ScrambleLine text="UN TEMBLOR?" className="block text-[clamp(3rem,8.5vw,7.5rem)] text-verm" />
            </h1>
            {liveStatus === "ok" && latest ? (
              <button
                onClick={() => {
                  setLiveSel(latest.id);
                  setSelectedId(null);
                  mapSecRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                }}
                className="row-hover mt-6 flex w-full max-w-xl items-center gap-4 border border-teal/40 bg-panel px-4 py-3 text-left"
              >
                <span
                  className="grid h-11 w-16 shrink-0 place-items-center border font-display text-xl"
                  style={{ color: magColor(latest.mag), borderColor: `${magColor(latest.mag)}55`, background: `${magColor(latest.mag)}12` }}
                >
                  {latest.mag.toFixed(1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-bone">{latest.place}</span>
                  <span className="block font-mono text-[11px] tracking-wider text-teal uppercase">
                    Último sismo · {timeAgo(latest.time)} · toca para ubicar
                  </span>
                </span>
              </button>
            ) : liveStatus === "loading" ? (
              <div className="pulse-soft mt-6 h-[68px] w-full max-w-xl border border-line bg-panel" />
            ) : (
              <p className="mt-6 max-w-xl border border-verm/50 bg-verm/10 px-4 py-3 font-mono text-[11px] tracking-[0.18em] text-verm uppercase">
                Sin señal en vivo — pulsa ↻ para reintentar
              </p>
            )}
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fog">
              Te decimos en segundos si lo que sentiste ya está registrado, dónde fue y de qué magnitud.
              En la vista Archivo tienes el mapa, la bitácora y el balance de 2026.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => setFeltOpen(true)}
                className="chip-btn bg-verm px-6 py-3 font-mono text-xs font-semibold tracking-[0.2em] text-abyss uppercase hover:brightness-110"
              >
                ● Lo sentí — ¿qué fue?
              </button>
              <a
                href="#en-vivo"
                className="chip-btn border border-line bg-panel px-6 py-3 font-mono text-xs tracking-[0.2em] text-fog uppercase hover:border-teal hover:text-teal"
              >
                Ver mapa en vivo
              </a>
            </div>
          </div>

        </div>
      </section>
      )}

      {/* ---------- 01 mapa ---------- */}
      {showSection("#en-vivo") && (
      <section ref={mapSecRef} className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="01 · En vivo"
          title="EL MAPA DEL TEMBLOR"
          sub="Sismos reales de los últimos 30 días (USGS + EMSC): cada punto con retícula es un evento reciente. Toca uno para abrir su ficha. El catálogo 2026 vive en Archivo."
        />

        <div ref={dashRef} className="rv mb-5 hidden lg:block">{renderFilters(false, true)}</div>

        <button
          onClick={() => {
            setFiltersFor("live");
            setFiltersOpen(true);
          }}
          aria-label="Abrir filtros"
          className="chip-btn mb-5 flex w-full items-center justify-between gap-3 border border-line bg-panel px-4 py-3 text-left lg:hidden"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-fog uppercase">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-amber">
              <path d="M2 4h12M4.5 8h7M7 12h2" />
            </svg>
            Filtros
            {liveFilterSummary.length > 0 && (
              <span className="border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-amber">
                {liveFilterSummary.join(" · ")}
              </span>
            )}
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-dim">
            <path d="M3 6l5 5 5-5" />
          </svg>
        </button>

        <div className="grid grid-cols-1 gap-4 lg:h-[620px] lg:grid-cols-12">
          <div className="h-[65vh] min-h-[340px] max-h-[580px] sm:h-[500px] lg:col-span-7 lg:h-full">
            <Suspense fallback={<MapSkeleton />}>
              <WorldMap
                quakes={[]}
                selectedId={selectedId}
                onSelect={onSelect}
                liveQuakes={filteredLive}
                mode="live"
                liveSource={liveSource}
                liveSelectedId={liveSel}
                onSelectLive={onSelectLive}
                gdacs={gdacsAlerts}
                caption={liveCaption}
                fullscreenBar={fullscreenBar}
                maxMonth={-1}
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
              ) : (
                <LiveList quakes={filteredLive} onSelect={setLiveSel} alertIds={new Set(liveAlerts.map((a) => a.id))} />
              )}
            </Suspense>
          </div>
        </div>

      </section>
      )}

      {/* ---------- 01b en vivo ---------- */}
      {showSection("#en-vivo") && (
      <section id="en-vivo" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="02 · Señal en vivo"
          title="PULSO EN TIEMPO REAL"
          sub="Conexión directa a las API abiertas del USGS Earthquake Hazards Program y del EMSC (European-Mediterranean Seismological Centre): cada sismo de magnitud 4.5 o mayor registrado en el mundo, sin claves ni intermediarios. Puedes elegir la fuente (USGS · EMSC · Ambas); en «Ambas» se combinan y deduplican."
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
          <div className="grid grid-cols-1 gap-4">
            {/* estado del feed */}
            <div className="border border-teal/40 bg-panel">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-teal/30 bg-deep/60 px-4 py-3 sm:px-5">
                <span className="flex w-full items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-teal uppercase sm:w-auto">
                  <span className="relative flex h-2 w-2">
                    <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                  </span>
                  {liveSource === "emsc" ? "EMSC · FEED ABIERTO" : liveSource === "both" ? "USGS + EMSC · COMBINADO" : "USGS · FEED ABIERTO"}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px] tracking-widest uppercase">
                  {(["usgs", "emsc", "both"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setLiveSource(s)}
                      aria-pressed={liveSource === s}
                      title={`Fuente en vivo: ${
                        s === "usgs" ? "USGS (ventana móvil)" : s === "emsc" ? "EMSC (recientes)" : "Ambas fuentes combinadas"
                      }`}
                      className={`border px-2 py-1 ${
                        liveSource === s
                          ? "border-teal bg-teal/15 text-teal"
                          : "border-line text-dim hover:border-teal/60 hover:text-teal"
                      }`}
                    >
                      {s === "usgs" ? "USGS" : s === "emsc" ? "EMSC" : "AMBAS"}
                    </button>
                  ))}
                </span>
                <select
                  value={liveWindow}
                  onChange={(e) => setLiveWindow(e.target.value as LiveWindow)}
                  disabled={liveSource === "emsc"}
                  title={liveSource === "emsc" ? "La ventana solo aplica a USGS; EMSC muestra los recientes" : "Ventana del feed"}
                  aria-label="Ventana del feed"
                  className="border border-teal/40 bg-deep px-2 py-1 font-mono text-[10px] tracking-widest text-teal uppercase outline-none hover:border-teal disabled:cursor-not-allowed disabled:border-line disabled:text-dim"
                >
                  {USGS_WINDOWS.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <a
                  href={liveSource === "emsc" ? "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=50&minmagnitude=4.5" : feedUrl(liveWindow)}
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
                        {liveSource === "emsc"
                          ? "Sismos M4.5+ recientes (EMSC)"
                          : `Sismos M4.5+ en ${USGS_WINDOWS.find((w) => w.key === liveWindow)?.days}`}
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
                    Actualización automática cada 5 min · los marcadores con retícula en el mapa
                    pertenecen a esta capa · sin conexión se sirve el último feed en caché
                  </p>
                </div>
              )}
            </div>

            <p className="font-mono text-[10px] leading-relaxed tracking-wider text-dim uppercase">
              La lista completa vive junto al mapa de arriba: toca cualquier evento para ubicarlo y abrir su ficha.
            </p>
          </div>
        )}
      </section>
      )}

      {/* ---------- 03 escalas ---------- */}
      {showSection("#escalas") && (
      <section id="escalas" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <div ref={labRef} className={rvView}>
          <Suspense fallback={<SectionSkeleton />}>
            <MagnitudeLab />
          </Suspense>
        </div>
      </section>
      )}

      {/* ---------- 04 archivo ---------- */}
      {showSection("#registro") && (
      <section id="registro" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <div ref={regRef} className={rvView}>
          <SectionHead
            num="04 · Archivo 2026"
            title="ARCHIVO 2026"
            sub={`Temporada sísmica ${ANNUAL.period}: mapa del catálogo (${CATALOG_FIRST} – ${CATALOG_LAST}), ficha del periodo y bitácora ordenable. Toca un punto o una fila para localizarlo.`}
          />

          {/* balance rápido del año */}
          <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="grid grid-cols-3 content-start gap-3 sm:flex sm:flex-wrap sm:gap-3 lg:col-span-5">
              {[
                { v: fmt(ANNUAL.deaths), l: "víctimas fatales", c: "#f0603c" },
                { v: String(ANNUAL.m7), l: "sismos M7 o más", c: "#f59e42" },
                { v: "M7.8", l: "máxima magnitud", c: "#e23a62" },
              ].map((s) => (
                <div key={s.l} className="min-w-0 border border-line bg-panel px-2 py-3 sm:px-5">
                  <div className="font-display text-2xl leading-none sm:text-3xl" style={{ color: s.c }}>{s.v}</div>
                  <div className="mt-1 font-mono text-[9px] leading-snug tracking-[0.2em] text-dim uppercase break-words">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="border border-line bg-panel lg:col-span-7">
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
          </div>

          {/* mapa del archivo */}
          <div className="mb-4 font-mono text-[11px] tracking-[0.24em] text-amber uppercase">
            <span className="inline-block h-px w-10 bg-amber align-middle" /> Mapa del archivo
          </div>
          <div ref={archiveDashRef} className="rv mb-5 hidden lg:block">{renderFilters(false, false)}</div>

          <button
            onClick={() => {
              setFiltersFor("archive");
              setFiltersOpen(true);
            }}
            aria-label="Abrir filtros del archivo"
            className="chip-btn mb-5 flex w-full items-center justify-between gap-3 border border-line bg-panel px-4 py-3 text-left lg:hidden"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-fog uppercase">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-amber">
                <path d="M2 4h12M4.5 8h7M7 12h2" />
              </svg>
              Filtros del archivo
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
            disabled={month !== -1}
            disabledHint="Desactiva el filtro de mes para reproducir"
            count={visibleQuakes.length}
            onPlayPause={togglePlayer}
            onSeek={setTimeMonth}
            onReset={resetPlayer}
          />

          <div className="mb-10 grid grid-cols-1 gap-4 lg:h-[620px] lg:grid-cols-12">
            <div className="h-[65vh] min-h-[340px] max-h-[580px] sm:h-[500px] lg:col-span-7 lg:h-full">
              <Suspense fallback={<MapSkeleton />}>
                <WorldMap
                  quakes={filtered}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  liveQuakes={filteredLive}
                  mode={mapMode}
                  liveSource={liveSource}
                  liveSelectedId={liveSel}
                  onSelectLive={onSelectLive}
                  gdacs={gdacsAlerts}
                  caption={caption}
                  fullscreenBar={archiveFullscreenBar}
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
                ) : (
                  <SidePanel quakes={visibleQuakes} selectedId={selectedId} onSelect={setSelectedId} />
                )}
              </Suspense>
            </div>
          </div>

          <div className="mb-4 font-mono text-[11px] tracking-[0.24em] text-amber uppercase">
            <span className="inline-block h-px w-10 bg-amber align-middle" /> Bitácora · tabla
          </div>
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
      )}

      {/* ---------- 05 balance ---------- */}
      {showSection("#balance") && (
      <section id="balance" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="05 · Balance"
          title="LA FACTURA DE 2026"
          sub={`Contadores del año, ritmo mensual de sismos mayores y víctimas, y el impacto económico preliminar del catálogo 2026 (${CATALOG_FIRST} – ${CATALOG_LAST}).`}
        />
        <div ref={balRef} className={rvView}>
          <Suspense fallback={<SectionSkeleton />}>
            <Balance />
          </Suspense>
        </div>
      </section>
      )}

      {/* ---------- pie (móvil: vista Acerca) ---------- */}
      {showSection("#acerca") && (
      <footer id="acerca" className="relative z-10 mt-8 scroll-mt-24 border-t border-line bg-deep">
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
      )}

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

      {/* navegación tipo app + veredicto LO SENTÍ */}
      <BottomTabs active={isMobile ? hashView : activeSection} onFelt={() => setFeltOpen(true)} />
      <FeltSheet
        open={feltOpen}
        onClose={() => setFeltOpen(false)}
        live={filteredLive}
        status={liveStatus}
        onLocate={(q) => {
          setLiveSel(q.id);
          setSelectedId(null);
          if (isMobile && hashView !== "#en-vivo") {
            window.location.hash = "#en-vivo";
            window.setTimeout(() => {
              mapSecRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
            }, 120);
          } else {
            mapSecRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
          }
        }}
      />

      {/* ficha de sismo y filtros: globales para que abran desde cualquier vista móvil */}
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
            {renderFilters(true, filtersFor === "live")}
          </div>
        </BottomSheet>

      {/* toasts de descarga */}
      <Toaster />
    </div>
  );
}
