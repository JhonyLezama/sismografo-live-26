import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature, mesh } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import countries110 from "world-atlas/countries-110m.json";
import type { Quake } from "../data/quakes";
import { magColor, dateShort, fmt, fmtMoney, depthClass, mmiColor } from "../data/quakes";
import type { LiveQuake } from "../data/usgs";
import { timeAgo } from "../data/usgs";
import { PLATES } from "../data/plates";
import { saveBlob } from "../data/export";
import { useMediaQuery, usePrefersReducedMotion } from "../hooks";
import { emitInstallSignal } from "../installSignals";

const W = 980;
const H = 500;

const projection = geoNaturalEarth1().fitExtent(
  [
    [10, 10],
    [W - 10, H - 10],
  ],
  { type: "Sphere" } as never
);
const path = geoPath(projection);

const topoLand = land110 as { objects: { land: unknown } };
const topoCountries = countries110 as {
  objects: { countries: unknown };
};

const SPHERE_D = path({ type: "Sphere" } as never) ?? "";
const LAND_D = path(feature(topoLand as never, topoLand.objects.land as never) as never) ?? "";
const COUNTRY_DS = (
  feature(topoCountries as never, topoCountries.objects.countries as never) as unknown as {
    features: Array<{ d?: string }>;
  }
).features
  .map((f) => path(f as never))
  .filter((d): d is string => !!d);
const BORDERS_D =
  path(
    mesh(
      topoCountries as never,
      topoCountries.objects.countries as never,
      (a: unknown, b: unknown) => a !== b
    ) as never
  ) ?? "";
const GRAT_D = path(geoGraticule10()) ?? "";

/* límites de placas (PB2002) proyectados; parte el trazo al cruzar el antimeridiano */
const projectPlate = (pts: [number, number][]): string => {
  let d = "";
  let prev: [number, number] | null = null;
  let started = false;
  for (const [lon, lat] of pts) {
    const p = projection([lon, lat]);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      started = false;
      prev = null;
      continue;
    }
    if (!started) {
      d += `M${p[0].toFixed(2)},${p[1].toFixed(2)}`;
      started = true;
    } else if (prev && Math.abs(p[0] - prev[0]) > 200) {
      d += `M${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    } else {
      d += `L${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    }
    prev = p;
  }
  return d;
};

interface PlateDraw {
  name: string;
  d: string;
  lx: number;
  ly: number;
}

const PLATE_DS: PlateDraw[] = PLATES.map((pl) => {
  const mid = pl.pts[Math.floor(pl.pts.length / 2)];
  const pm = mid ? projection([mid[0], mid[1]]) : null;
  const lx = pm && Number.isFinite(pm[0]) ? pm[0] : NaN;
  const ly = pm && Number.isFinite(pm[1]) ? pm[1] : NaN;
  return { name: pl.name, d: projectPlate(pl.pts), lx, ly };
}).filter((p) => p.d.length > 0 && Number.isFinite(p.lx) && Number.isFinite(p.ly));

const COUNTRY_LABELS: Record<string, string> = {
  "United States of America": "EE. UU.",
  Canada: "Canadá",
  Mexico: "México",
  Greenland: "Groenlandia",
  Brazil: "Brasil",
  Argentina: "Argentina",
  Colombia: "Colombia",
  Venezuela: "Venezuela",
  Peru: "Perú",
  Chile: "Chile",
  Ecuador: "Ecuador",
  Bolivia: "Bolivia",
  Paraguay: "Paraguay",
  Uruguay: "Uruguay",
  Cuba: "Cuba",
  Haiti: "Haití",
  Guatemala: "Guatemala",
  Honduras: "Honduras",
  Russia: "Rusia",
  China: "China",
  India: "India",
  Kazakhstan: "Kazajistán",
  Mongolia: "Mongolia",
  Japan: "Japón",
  Indonesia: "Indonesia",
  Philippines: "Filipinas",
  "Papua New Guinea": "Papúa-N. Guinea",
  Australia: "Australia",
  "New Zealand": "N. Zelanda",
  Spain: "España",
  France: "Francia",
  Germany: "Alemania",
  Italy: "Italia",
  "United Kingdom": "R. Unido",
  Sweden: "Suecia",
  Norway: "Noruega",
  Poland: "Polonia",
  Ukraine: "Ucrania",
  Greece: "Grecia",
  Turkey: "Turquía",
  Portugal: "Portugal",
  Iceland: "Islandia",
  Ireland: "Irlanda",
  Iran: "Irán",
  "Saudi Arabia": "Arabia Saudí",
  Egypt: "Egipto",
  Algeria: "Argelia",
  Morocco: "Marruecos",
  Libya: "Libia",
  Nigeria: "Nigeria",
  "South Africa": "Sudáfrica",
  "Dem. Rep. Congo": "R. D. Congo",
  Congo: "Congo",
  Ethiopia: "Etiopía",
  Kenya: "Kenia",
  Tanzania: "Tanzania",
  Angola: "Angola",
  Madagascar: "Madagascar",
  Somalia: "Somalia",
  Sudan: "Sudán",
  Vietnam: "Vietnam",
  Thailand: "Tailandia",
  Myanmar: "Birmania",
  "South Korea": "Corea S.",
  "North Korea": "Corea N.",
  Taiwan: "Taiwán",
  Pakistan: "Pakistán",
  Afghanistan: "Afganistán",
  Iraq: "Irak",
  Syria: "Siria",
  Israel: "Israel",
  Yemen: "Yemen",
  Bangladesh: "Bangladés",
  Nepal: "Nepal",
};

interface Label {
  name: string;
  x: number;
  y: number;
}

const LABELS: Label[] = (
  feature(topoCountries as never, topoCountries.objects.countries as never) as unknown as {
    features: Array<{ properties?: { name?: string } }>;
  }
).features
  .map((f) => {
    const name = COUNTRY_LABELS[f.properties?.name ?? ""];
    if (!name) return null;
    const c = path.centroid(f as never);
    if (!c || Number.isNaN(c[0]) || Number.isNaN(c[1])) return null;
    return { name, x: c[0], y: c[1] };
  })
  .filter((l): l is Label => !!l);

interface View {
  k: number;
  tx: number;
  ty: number;
}

export type MapMode = "local" | "live" | "both";

export interface AreaRect {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface Props {
  quakes: Quake[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  liveQuakes: LiveQuake[];
  mode: MapMode;
  liveSelectedId: string | null;
  onSelectLive: (id: string | null) => void;
  caption?: string | null;
  fullscreenBar?: React.ReactNode;
  maxMonth?: number;
  areaFilter?: AreaRect | null;
  onAreaChange?: (a: AreaRect | null) => void;
}

const clampView = (k: number, tx: number, ty: number): View => ({
  k,
  tx: Math.min(0, Math.max(W - W * k, tx)),
  ty: Math.min(0, Math.max(H - H * k, ty)),
});

/* estilo de control activo (recortar / placas) */
const BTN_ACTIVE = "border-amber bg-amber/15 text-amber";

function SelectionSummary({
  selPlate,
  selPlateParts,
  selLive,
  selQuake,
  onClose,
}: {
  selPlate: PlateDraw | null;
  selPlateParts: string[];
  selLive: LiveQuake | null;
  selQuake: Quake | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-1.5">
        <span className="font-mono text-[9px] tracking-[0.2em] text-dim uppercase">
          {selPlate ? "Límite de placa" : selLive ? "Registro en vivo · USGS" : "Ficha del evento"}
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar resumen"
          title="Cerrar resumen"
          className="chip-btn grid h-5 w-5 place-items-center border border-line text-dim hover:border-verm hover:text-verm"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {selPlate && (
        <div className="space-y-1.5 px-3 py-2.5">
          <div className="font-display text-base leading-tight text-amber">{selPlate.name}</div>
          {selPlateParts.length === 2 ? (
            <div className="font-mono text-[10px] leading-relaxed text-dim">
              Límite entre las placas <span className="text-bone">{selPlateParts[0]}</span> y{" "}
              <span className="text-bone">{selPlateParts[1]}</span>
            </div>
          ) : (
            <div className="font-mono text-[10px] leading-relaxed text-dim">Límite entre dos placas tectónicas</div>
          )}
        </div>
      )}

      {selLive && (
        <div className="space-y-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
            <span className="font-mono text-[9px] tracking-[0.2em] text-teal uppercase">En vivo · USGS</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl leading-none tracking-wide" style={{ color: magColor(selLive.mag) }}>
              M{selLive.mag.toFixed(1)}
            </span>
            <span className="text-sm text-bone">{selLive.country}</span>
          </div>
          <div
            className="border-l-2 pl-2 font-mono text-[10px] leading-relaxed text-fog"
            style={{ borderColor: magColor(selLive.mag) }}
          >
            {selLive.place}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10px]">
            <span className="text-dim">Hace</span>
            <span className="text-bone">{timeAgo(selLive.time)}</span>
            <span className="text-dim">Profundidad</span>
            <span className="text-bone">{selLive.depth} km</span>
            <span className="text-dim">Impacto</span>
            <span className="text-bone">sig {selLive.sig}</span>
            <span className="text-dim">Tsunami</span>
            <span className={selLive.tsunami ? "text-verm" : "text-fog"}>{selLive.tsunami ? "Sí" : "No"}</span>
          </div>
        </div>
      )}

      {selQuake && (
        <div className="space-y-2 px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl leading-none tracking-wide" style={{ color: magColor(selQuake.mag) }}>
              M{selQuake.mag.toFixed(1)}
            </span>
            <span className="text-sm text-bone">{selQuake.country}</span>
          </div>
          <div
            className="border-l-2 pl-2 font-mono text-[10px] leading-relaxed text-fog"
            style={{ borderColor: magColor(selQuake.mag) }}
          >
            {selQuake.place}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10px]">
            <span className="text-dim">Fecha</span>
            <span className="text-bone">
              {dateShort(selQuake.date)} · {selQuake.time} UTC
            </span>
            <span className="text-dim">Profundidad</span>
            <span className="text-bone">
              {selQuake.depth} km · {depthClass(selQuake.depth).label}
            </span>
            <span className="text-dim">Región</span>
            <span className="text-bone">{selQuake.region}</span>
            <span className="text-dim">Intensidad</span>
            <span className="text-bone">
              <span style={{ color: mmiColor(selQuake.mmi) }}>{selQuake.mmi}</span> · {selQuake.mmiLabel}
            </span>
            {selQuake.deaths > 0 && (
              <>
                <span className="text-dim">Víctimas</span>
                <span className="text-verm">{fmt(selQuake.deaths)}</span>
              </>
            )}
            {selQuake.injured > 0 && (
              <>
                <span className="text-dim">Heridos</span>
                <span className="text-verm">{fmt(selQuake.injured)}</span>
              </>
            )}
            {selQuake.costM != null && selQuake.costM > 0 && (
              <>
                <span className="text-dim">Coste</span>
                <span className="text-bone">{fmtMoney(selQuake.costM)}</span>
              </>
            )}
            <span className="text-dim">Tsunami</span>
            <span className={selQuake.tsunami ? "text-verm" : "text-fog"}>{selQuake.tsunami ? "Sí" : "No"}</span>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(function WorldMap({
  quakes,
  selectedId,
  onSelect,
  liveQuakes,
  mode,
  liveSelectedId,
  onSelectLive,
  caption,
  fullscreenBar,
  maxMonth,
  areaFilter,
  onAreaChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const labelsWrapRef = useRef<SVGGElement | null>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef<View>(view);
  const [smooth, setSmooth] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverLiveId, setHoverLiveId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [showPlates, setShowPlates] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [areaDraft, setAreaDraft] = useState<{ g1: [number, number]; g2: [number, number] } | null>(null);
  const [plateSel, setPlateSel] = useState<number | null>(null);
  const [plateHover, setPlateHover] = useState<number | null>(null);
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const [fullFilterOpen, setFullFilterOpen] = useState(false);
  const [barCollapsed, setBarCollapsed] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const barContentRef = useRef<HTMLDivElement | null>(null);
  const barDragRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const dragRef = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const reduced = usePrefersReducedMotion();
  const isMobile = useMediaQuery("(max-width: 639px)");

  const showLocal = mode !== "live";
  const showLiveLayer = mode !== "local";

  /* selección activa para el resumen de pantalla completa */
  const selQuake = showLocal && selectedId ? quakes.find((q) => q.id === selectedId) ?? null : null;
  const selLive = showLiveLayer && liveSelectedId ? liveQuakes.find((q) => q.id === liveSelectedId) ?? null : null;
  const selPlate = plateSel !== null ? PLATE_DS[plateSel] ?? null : null;
  const selPlateParts = selPlate ? selPlate.name.split(" <-> ") : [];
  const hasSelection = !!selPlate || !!selLive || !!selQuake;

  const clearSelection = () => {
    onSelect(null);
    onSelectLive(null);
    setPlateSel(null);
  };

  /* pantalla completa (nativo + fallback CSS) */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const lockPortrait = () => {
    const orient = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
    try {
      if (typeof orient.lock === "function") {
        void orient.lock("portrait").catch(() => {});
      }
    } catch {
      /* sin soporte de orientación */
    }
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    const canNative =
      typeof document.fullscreenEnabled !== "undefined" &&
      document.fullscreenEnabled &&
      typeof el.requestFullscreen === "function";
    if (canNative) {
      if (!document.fullscreenElement) void el.requestFullscreen();
      else void document.exitFullscreen();
    } else {
      setIsFullscreen((v) => !v);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      void document.exitFullscreen();
    }
    try {
      const orient = screen.orientation as unknown as { unlock?: () => void };
      if (typeof orient.unlock === "function") orient.unlock();
    } catch {
      /* sin soporte de orientación */
    }
    setIsFullscreen(false);
  };

  useEffect(() => {
    const sync = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) lockPortrait();
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectMode) {
        setSelectMode(false);
        setAreaDraft(null);
        return;
      }
      if (isMobile && isFullscreen && hasSelection) {
        clearSelection();
        return;
      }
      if (isFullscreen) exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, selectMode, isMobile, hasSelection]);

  /* al entrar/salir de pantalla completa la barra vuelve a su posición por defecto */
  useEffect(() => {
    setBarPos(null);
    setFullFilterOpen(false);
    setBarCollapsed(false);
  }, [isFullscreen]);

  const onBarPointerDown = (e: React.PointerEvent) => {
    const el = barRef.current;
    if (!el) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, select, input, a, label, textarea")) return;
    if (e.pointerType !== "mouse" && barContentRef.current?.contains(t)) return;
    const rect = el.getBoundingClientRect();
    barDragRef.current = { sx: e.clientX, sy: e.clientY, x: rect.left, y: rect.top };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onBarPointerMove = (e: React.PointerEvent) => {
    const d = barDragRef.current;
    const wrap = wrapRef.current;
    const bar = barRef.current;
    if (!d || !wrap || !bar) return;
    const wRect = wrap.getBoundingClientRect();
    const nx = Math.min(wRect.width - bar.offsetWidth - 6, Math.max(6, d.x - wRect.left + (e.clientX - d.sx)));
    const ny = Math.min(wRect.height - bar.offsetHeight - 6, Math.max(6, d.y - wRect.top + (e.clientY - d.sy)));
    setBarPos({ x: nx, y: ny });
  };

  const onBarPointerUp = () => {
    barDragRef.current = null;
  };

  const points = useMemo(
    () =>
      quakes.map((q) => {
        const [x, y] = projection([q.lon, q.lat]) ?? [0, 0];
        return { q, x, y };
      }),
    [quakes]
  );

  const livePoints = useMemo(
    () =>
      liveQuakes.map((q) => {
        const [x, y] = projection([q.lon, q.lat]) ?? [0, 0];
        return { q, x, y };
      }),
    [liveQuakes]
  );

  /* espejo de view para el pan imperativo (sin re-render por frame) */
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /* zoom con rueda (listener no pasivo, coalescido por rAF) */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const wheelState = { ...viewRef.current };
    let raf = 0;
    const applyWheel = () => {
      raf = 0;
      const nv = { k: wheelState.k, tx: wheelState.tx, ty: wheelState.ty };
      viewRef.current = nv;
      if (gRef.current) gRef.current.style.transform = `translate(${nv.tx}px, ${nv.ty}px) scale(${nv.k})`;
      if (labelsWrapRef.current) labelsWrapRef.current.style.transform = `translate(${nv.tx}px, ${nv.ty}px)`;
      setView(nv);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = Math.min(rect.width / W, rect.height / H);
      const ox = (rect.width - W * s) / 2;
      const oy = (rect.height - H * s) / 2;
      const mx = (e.clientX - rect.left - ox) / s;
      const my = (e.clientY - rect.top - oy) / s;
      setSmooth(false);
      const oldK = wheelState.k;
      const k2 = Math.min(9, Math.max(1, oldK * Math.exp(-e.deltaY * 0.0016)));
      const nv = clampView(
        k2,
        mx - ((mx - wheelState.tx) * k2) / oldK,
        my - ((my - wheelState.ty) * k2) / oldK
      );
      wheelState.k = nv.k;
      wheelState.tx = nv.tx;
      wheelState.ty = nv.ty;
      if (!raf) raf = requestAnimationFrame(applyWheel);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* centrar al seleccionar (curado o en vivo) */
  useEffect(() => {
    const p = showLocal && selectedId
      ? points.find((pt) => pt.q.id === selectedId)
      : liveSelectedId
        ? livePoints.find((pt) => pt.q.id === liveSelectedId)
        : undefined;
    if (!p) return;
    const k2 = Math.max(view.k, 2.4);
    setSmooth(true);
    setView(clampView(k2, W / 2 - p.x * k2, H / 2 - p.y * k2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, liveSelectedId, points, livePoints, showLocal]);

  /* auto-encuadre al cambiar filtros (mapa inteligente) */
  useEffect(() => {
    if (!showLocal) return;
    const pts = points;
    if (pts.length === 0) {
      setSmooth(true);
      setView({ k: 1, tx: 0, ty: 0 });
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 60;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const fitK = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
    if (fitK > 1.15) {
      const k = Math.min(9, Math.max(1.2, fitK));
      setSmooth(true);
      setView(clampView(k, (W - (minX + maxX) * k) / 2, (H - (minY + maxY) * k) / 2));
    } else {
      setSmooth(true);
      setView({ k: 1, tx: 0, ty: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, showLocal]);

  /* mapeo cliente → viewBox con preserveAspectRatio="meet" */
  const metrics = () => {
    const rect = svgRef.current!.getBoundingClientRect();
    const s = Math.min(rect.width / W, rect.height / H);
    return { rect, s, ox: (rect.width - W * s) / 2, oy: (rect.height - H * s) / 2 };
  };

  const toSvg = (e: React.PointerEvent) => {
    const { rect, s, ox, oy } = metrics();
    return {
      x: (e.clientX - rect.left - ox) / s,
      y: (e.clientY - rect.top - oy) / s,
    };
  };

  const toGeo = (pt: { x: number; y: number }): [number, number] | null =>
    projection.invert?.([(pt.x - view.tx) / view.k, (pt.y - view.ty) / view.k]) ?? null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (selectMode) {
      const pt = toSvg(e);
      const g = toGeo(pt);
      if (!g) return;
      setAreaDraft({ g1: g, g2: g });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    movedRef.current = false;
    setSmooth(false);
    setDragging(true);
    dragRef.current = { px: e.clientX, py: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = toSvg(e);
    if (!isMobile) setCursor(pt);
    if (selectMode) {
      const d = areaDraft;
      if (!d) return;
      const g = toGeo(pt);
      if (!g) return;
      movedRef.current = true;
      setAreaDraft({ g1: d.g1, g2: g });
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const { s } = metrics();
    const dx = (e.clientX - drag.px) / s;
    const dy = (e.clientY - drag.py) / s;
    if (Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 5) movedRef.current = true;
    /* pan imperativo: solo DOM, sin setView por frame (móvil) */
    const nv = clampView(viewRef.current.k, drag.tx + dx, drag.ty + dy);
    viewRef.current = nv;
    if (gRef.current) gRef.current.style.transform = `translate(${nv.tx}px, ${nv.ty}px) scale(${nv.k})`;
    if (labelsWrapRef.current) labelsWrapRef.current.style.transform = `translate(${nv.tx}px, ${nv.ty}px)`;
    if (!isMobile) setView(nv);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (selectMode && areaDraft) {
      const d = areaDraft;
      setAreaDraft(null);
      if (onAreaChange) {
        onAreaChange({
          minLat: Math.min(d.g1[1], d.g2[1]),
          maxLat: Math.max(d.g1[1], d.g2[1]),
          minLon: Math.min(d.g1[0], d.g2[0]),
          maxLon: Math.max(d.g1[0], d.g2[0]),
        });
      }
      setSelectMode(false);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }
    if (dragRef.current) setView(viewRef.current);
    dragRef.current = null;
    setDragging(false);
  };

  const onBackgroundClick = () => {
    if (selectMode) return;
    if (!movedRef.current) {
      onSelect(null);
      setPlateSel(null);
    }
  };

  const zoomBy = (f: number) => {
    setSmooth(true);
    setView((v) => {
      const k2 = Math.min(9, Math.max(1, v.k * f));
      const cx = W / 2, cy = H / 2;
      return clampView(k2, cx - ((cx - v.tx) * k2) / v.k, cy - ((cy - v.ty) * k2) / v.k);
    });
  };

  const hovered = hoverId ? points.find((p) => p.q.id === hoverId) : null;

  const geo = cursor
    ? projection.invert?.([(cursor.x - view.tx) / view.k, (cursor.y - view.ty) / view.k])
    : null;

  const rFor = (mag: number) => 2.6 + (mag - 2.5) * 1.9;

  /* descarga el mapa como SVG o PNG (vista actual tal cual se ve) */
  const downloadMap = (format: "png" | "svg") => {
    const svg = svgRef.current;
    if (!svg) return;
    emitInstallSignal("export");
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    /* en escritorio exporta el mapa completo (2x); en móvil, el mismo
       encuadre y proporción que el recuadro del mapa (bandas incluidas),
       conservando viewBox y preserveAspectRatio="xMidYMid meet" */
    let vb = { x: 0, y: 0, w: W, h: H };
    let outW = W * 2;
    let outH = H * 2;
    if (isMobile) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const S = 1920 / Math.max(rect.width, rect.height);
        outW = Math.max(1, Math.round(rect.width * S));
        outH = Math.max(1, Math.round(rect.height * S));
      }
    }

    clone.setAttribute("width", String(outW));
    clone.setAttribute("height", String(outH));
    clone.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent =
      ".map-label{font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;fill:#8fa3a0;stroke:#0b1214;stroke-width:3px;paint-order:stroke;user-select:none}";
    clone.insertBefore(style, clone.firstChild);
    const str = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    if (format === "svg") {
      saveBlob(blob, "sismografo-2026.svg");
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0d1a1e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (b) saveBlob(b, "sismografo-2026.png");
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  return (
    <div
      ref={wrapRef}
      className={`relative h-full overflow-hidden rounded-md border border-line bg-deep ${isFullscreen ? "map-fullscreen" : ""}`}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className={`map-stage block h-full w-full touch-none select-none ${dragging ? "is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null);
          if (dragRef.current) setView(viewRef.current);
          dragRef.current = null;
          setDragging(false);
        }}
        onClick={onBackgroundClick}
        role="application"
        aria-label="Mapa mundial de epicentros de 2026"
      >
        <g
          ref={gRef}
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`,
            transition:
              smooth && !reduced ? "transform 0.7s cubic-bezier(0.2,0.7,0.2,1)" : "none",
          }}
        >
          {/* océano */}
          <path d={SPHERE_D} fill="#0d1a1e" stroke="#244046" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={GRAT_D} fill="none" stroke="rgba(62,201,167,0.09)" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
          {/* países */}
          {COUNTRY_DS.map((d, i) => (
            <path key={i} d={d} fill={i % 2 ? "#15272b" : "#142429"} stroke="none" />
          ))}
          <path d={BORDERS_D} fill="none" stroke="#2b4a50" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          <path d={LAND_D} fill="none" stroke="#3a6067" strokeWidth={1} vectorEffect="non-scaling-stroke" />

          {/* límites de placas tectónicas */}
          {showPlates && (
            <g>
              {PLATE_DS.map((p, i) => {
                const sel = i === plateSel;
                const dim = plateSel !== null && !sel;
                return (
                  <g
                    key={p.name + i}
                    className="marker-dot"
                    onMouseEnter={() => setPlateHover(i)}
                    onMouseLeave={() => setPlateHover(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectMode) return;
                      if (!movedRef.current) setPlateSel(sel ? null : i);
                    }}
                  >
                    <path d={p.d} fill="none" stroke="transparent" strokeWidth={10 / view.k} style={{ pointerEvents: "stroke" }} aria-hidden />
                    <path
                      d={p.d}
                      fill="none"
                      stroke={sel ? "#f59e42" : "#e23a62"}
                      strokeWidth={sel ? 1.8 : plateHover === i ? 1.2 : 0.7}
                      opacity={dim ? 0.12 : sel ? 0.95 : plateHover === i ? 0.85 : 0.4}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* zona marcada (rectángulo) */}
          {(() => {
            const active = selectMode && areaDraft
              ? {
                  minLat: Math.min(areaDraft.g1[1], areaDraft.g2[1]),
                  maxLat: Math.max(areaDraft.g1[1], areaDraft.g2[1]),
                  minLon: Math.min(areaDraft.g1[0], areaDraft.g2[0]),
                  maxLon: Math.max(areaDraft.g1[0], areaDraft.g2[0]),
                }
              : areaFilter;
            if (!active) return null;
            const pts = ([
              [active.minLon, active.maxLat],
              [active.maxLon, active.maxLat],
              [active.maxLon, active.minLat],
              [active.minLon, active.minLat],
            ] as [number, number][])
              .map(([lo, la]) => projection([lo, la]))
              .filter((p): p is [number, number] => !!p)
              .map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`)
              .join(" ");
            return (
              <polygon
                points={pts}
                fill="rgba(224,58,98,0.12)"
                stroke="#e23a62"
                strokeWidth={1.2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}

          {/* marcadores */}
          {showLocal &&
            points
              .filter((p) => maxMonth == null || maxMonth < 0 || Number(p.q.date.slice(5, 7)) - 1 <= maxMonth)
              .map(({ q, x, y }) => {
            const c = magColor(q.mag);
            const r = rFor(q.mag) / Math.pow(view.k, 0.72);
            const sel = q.id === selectedId;
            const dim = selectedId !== null && !sel;
            return (
              <g
                key={q.id}
                transform={`translate(${x}, ${y})`}
                className="marker-dot"
                opacity={dim ? 0.3 : 1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectMode) return;
                  if (!movedRef.current) onSelect(q.id);
                }}
                onMouseEnter={() => setHoverId(q.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <circle r={Math.max(r, 12 / view.k)} fill="transparent" aria-hidden />
                {q.mag >= 7.2 && !dim && (
                  <circle r={r * 1.15} fill="none" stroke={c} strokeWidth={1.4} className="ring-pulse" />
                )}
                {sel && (
                  <circle
                    r={r * 2.1}
                    fill="none"
                    stroke="#ede6d6"
                    strokeWidth={1.2}
                    strokeDasharray="4 5"
                    className="spin-slow"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle r={r} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={sel ? 2.4 : 1.6} vectorEffect="non-scaling-stroke" />
                <circle r={Math.max(1.6, r * 0.32)} fill={c} />
                {(() => {
                  const dc = depthClass(q.depth);
                  return (
                    <circle
                      r={r * 1.55}
                      fill="none"
                      stroke={dc.color}
                      strokeWidth={0.8}
                      strokeDasharray={dc.label === "Superficial" ? undefined : dc.label === "Intermedio" ? "3 3" : "1 4"}
                      opacity={0.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })()}
              </g>
            );
          })}

          {/* capa EN VIVO (USGS) */}
          {showLiveLayer &&
            livePoints.map(({ q, x, y }) => {
              const c = magColor(q.mag);
              const r = Math.max(2.2, rFor(q.mag) * 0.8) / Math.pow(view.k, 0.72);
              const sel = q.id === liveSelectedId;
              return (
                <g
                  key={q.id}
                  transform={`translate(${x}, ${y})`}
                  className="marker-dot"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectMode) return;
                    if (!movedRef.current) onSelectLive(q.id);
                  }}
                  onMouseEnter={() => setHoverLiveId(q.id)}
                  onMouseLeave={() => setHoverLiveId(null)}
                >
                  <circle r={Math.max(r, 12 / view.k)} fill="transparent" aria-hidden />
                  {sel && (
                    <circle
                      r={r * 2.1}
                      fill="none"
                      stroke="#3ec9a7"
                      strokeWidth={1.2}
                      strokeDasharray="4 5"
                      className="spin-slow"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <circle
                    r={r * 1.7}
                    fill="none"
                    stroke="#3ec9a7"
                    strokeWidth={0.9}
                    strokeDasharray="2.5 3.5"
                    opacity={0.8}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle r={r} fill={c} fillOpacity={0.16} stroke={c} strokeWidth={sel ? 2 : 1.2} vectorEffect="non-scaling-stroke" />
                  <path
                    d={`M${-r - 3} 0H${-r - 0.5}M${r + 0.5} 0H${r + 3}M0 ${-r - 3}V${-r - 0.5}M0 ${r + 0.5}V${r + 3}`}
                    stroke={c}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
        </g>

        {/* nombres de países (tamaño constante en pantalla, siguen al mapa) */}
        <g
          ref={labelsWrapRef}
          pointerEvents="none"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px)`,
            transition: smooth && !reduced ? "transform 0.7s cubic-bezier(0.2,0.7,0.2,1)" : "none",
          }}
        >
          {LABELS.map((l) => (
            <g
              key={l.name}
              transform={`translate(${l.x * view.k}, ${l.y * view.k})`}
              style={{
                transition: smooth && !reduced ? "transform 0.7s cubic-bezier(0.2,0.7,0.2,1)" : "none",
              }}
              opacity={0.55 + 0.45 * Math.min(1, (view.k - 1) / 2)}
            >
              <text textAnchor="middle" dominantBaseline="middle" className="map-label">
                {l.name}
              </text>
            </g>
          ))}

          {/* nombre de la placa seleccionada */}
          {showPlates && plateSel !== null && PLATE_DS[plateSel] && (
            <g
              transform={`translate(${PLATE_DS[plateSel].lx * view.k}, ${PLATE_DS[plateSel].ly * view.k})`}
              style={{
                transition: smooth && !reduced ? "transform 0.7s cubic-bezier(0.2,0.7,0.2,1)" : "none",
              }}
            >
              <text textAnchor="middle" dominantBaseline="middle" className="map-label" style={{ fill: "#f59e42" }}>
                {PLATE_DS[plateSel].name}
              </text>
            </g>
          )}
        </g>

        {/* crosshair que sigue al cursor */}
        {cursor && !dragRef.current && (
          <g pointerEvents="none" stroke="rgba(245,158,66,0.35)" strokeDasharray="2 6">
            <line x1={0} x2={W} y1={cursor.y} y2={cursor.y} strokeWidth={0.6} />
            <line x1={cursor.x} x2={cursor.x} y1={0} y2={H} strokeWidth={0.6} />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hovered && hovered.q.id !== selectedId && (() => {
        const { rect, s, ox, oy } = metrics();
        const left = ox + (hovered.x * view.k + view.tx) * s;
        const top = oy + (hovered.y * view.k + view.ty) * s;
        return (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap border border-line2 bg-abyss/95 px-3 py-2 font-mono text-[11px] leading-relaxed shadow-xl shadow-black/40"
          style={{ left, top, width: "auto" }}
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-sm tracking-wide" style={{ color: magColor(hovered.q.mag) }}>
              M{hovered.q.mag.toFixed(1)}
            </span>
            <span className="text-bone">{hovered.q.country}</span>
          </div>
          <div className="text-dim">
            {dateShort(hovered.q.date)} · {hovered.q.depth} km prof.
            {hovered.q.deaths > 0 && (
              <span className="text-verm"> · {fmt(hovered.q.deaths)} víctimas</span>
            )}
          </div>
        </div>
        );
      })()}

      {/* tooltip en vivo */}
      {showLiveLayer && hoverLiveId && hoverLiveId !== liveSelectedId && (() => {
        const lp = livePoints.find((p) => p.q.id === hoverLiveId);
        if (!lp) return null;
        const { s, ox, oy } = metrics();
        const left = ox + (lp.x * view.k + view.tx) * s;
        const top = oy + (lp.y * view.k + view.ty) * s;
        return (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap border border-teal/50 bg-abyss/95 px-3 py-2 font-mono text-[11px] leading-relaxed shadow-xl shadow-black/40"
            style={{ left, top, width: "auto" }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
              <span className="text-[9px] tracking-[0.2em] text-teal">EN VIVO</span>
              <span className="font-display text-sm tracking-wide" style={{ color: magColor(lp.q.mag) }}>
                M{lp.q.mag.toFixed(1)}
              </span>
            </div>
            <div className="mt-0.5 max-w-[260px] truncate text-bone">{lp.q.place}</div>
            <div className="text-dim">
              {timeAgo(lp.q.time)} · {lp.q.depth} km prof.
              {lp.q.tsunami && <span className="text-verm"> · tsunami</span>}
            </div>
          </div>
        );
      })()}

      {/* tooltip de placa */}
      {showPlates && plateHover !== null && cursor && plateHover !== plateSel && (() => {
        const { s, ox, oy } = metrics();
        const left = ox + (cursor.x * view.k + view.tx) * s;
        const top = oy + (cursor.y * view.k + view.ty) * s;
        return (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap border border-magma/60 bg-abyss/95 px-3 py-2 font-mono text-[11px] leading-relaxed shadow-xl shadow-black/40"
            style={{ left, top, width: "auto" }}
          >
            <span className="text-[9px] tracking-[0.2em] text-magma uppercase">Límite de placa</span>
            <div className="text-bone">{PLATE_DS[plateHover].name}</div>
            <div className="text-dim">clic para seleccionar</div>
          </div>
        );
      })()}

      {/* controles */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        {[
          { label: "Acercar", fn: () => zoomBy(1.55), icon: <path d="M8 3v10M3 8h10" /> },
          { label: "Alejar", fn: () => zoomBy(1 / 1.55), icon: <path d="M3 8h10" /> },
          {
            label: "Restablecer",
            fn: () => {
              setSmooth(true);
              setView({ k: 1, tx: 0, ty: 0 });
            },
            icon: <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />,
          },
        ].map((b) => (
          <button
            key={b.label}
            aria-label={b.label}
            title={b.label}
            onClick={b.fn}
            className="chip-btn grid h-7 w-7 place-items-center border border-line bg-panel/90 sm:h-8 sm:w-8 text-fog hover:border-amber hover:text-amber"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth="1.6" strokeLinecap="round">
              {b.icon}
            </svg>
          </button>
        ))}
        <button
          onClick={() => {
            if (selectMode) {
              setSelectMode(false);
              setAreaDraft(null);
            } else {
              setSelectMode(true);
            }
          }}
          aria-pressed={selectMode || !!areaFilter}
          aria-label={selectMode ? "Cancelar marcado de área" : "Marcar área en el mapa"}
          title={
            selectMode
              ? "Cancelar marcado de área (Esc)"
              : "Marcar área: arrastra sobre el mapa para filtrar la zona"
          }
          className={`chip-btn grid h-7 w-7 place-items-center border border-line bg-panel/90 sm:h-8 sm:w-8 text-fog hover:border-amber hover:text-amber ${
            selectMode || areaFilter ? BTN_ACTIVE : ""
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 3h8v10H4z" strokeDasharray="2 2" />
            <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
        {areaFilter && !selectMode && (
          <button
            onClick={() => onAreaChange?.(null)}
            aria-label="Limpiar zona marcada"
            title="Limpiar zona marcada"
            className="chip-btn grid h-7 w-7 place-items-center border border-line bg-panel/90 sm:h-8 sm:w-8 text-fog hover:border-verm hover:text-verm"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowPlates((v) => !v)}
          aria-pressed={showPlates}
          aria-label={showPlates ? "Ocultar límites de placas" : "Mostrar límites de placas"}
          title={showPlates ? "Ocultar límites de placas" : "Mostrar límites de placas"}
          className={`chip-btn grid h-7 w-7 place-items-center border border-line bg-panel/90 sm:h-8 sm:w-8 text-fog hover:border-amber hover:text-amber ${
            showPlates ? BTN_ACTIVE : ""
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 2l5.5 3v6L8 14l-5.5-3V5L8 2z" />
            <path d="M8 2v12M2.5 5l5.5 3 5.5-3" />
          </svg>
        </button>
        <button
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa"}
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Ver en pantalla completa"}
          className="chip-btn grid h-7 w-7 place-items-center border border-line bg-panel/90 sm:h-8 sm:w-8 text-fog hover:border-amber hover:text-amber"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {isFullscreen ? (
              <path d="M4 9h3v3M12 7H9V4M4 7h3V4M12 9H9v3" />
            ) : (
              <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
            )}
          </svg>
        </button>
      </div>

      {/* leyenda */}
      <div className="absolute bottom-2 left-3 flex max-w-[calc(100%-3rem)] flex-wrap items-center gap-3 border border-line bg-abyss/85 px-3 py-2 sm:max-w-[calc(100%-14rem)]">
        <span className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">Mw</span>
        {[
          { m: "5", c: "#e8c14a" },
          { m: "6", c: "#f59e42" },
          { m: "7", c: "#f0603c" },
          { m: "8+", c: "#e23a62" },
        ].map((l) => (
          <span key={l.m} className="flex items-center gap-1.5">
            <span className="inline-block rounded-full border" style={{ borderColor: l.c, background: `${l.c}33`, width: 10, height: 10 }} />
            <span className="font-mono text-[10px] text-fog">{l.m}</span>
          </span>
        ))}
        <span className="hidden font-mono text-[10px] text-dim sm:inline">{isFullscreen && "· rueda = zoom · arrastra = mover"}</span>
        {[
          { l: "Sup", c: "#f0603c", px: 4 },
          { l: "Int", c: "#e8c14a", px: 3 },
          { l: "Prof", c: "#3ec9a7", px: 1 },
        ].map((d) => (
          <span key={d.l} className="hidden items-center gap-1.5 border-l border-line pl-3 md:flex">
            <span
              className="inline-block h-[2px] w-4"
              style={{
                backgroundImage:
                  d.px >= 4
                    ? d.c
                    : `repeating-linear-gradient(90deg, ${d.c} 0 ${d.px}px, transparent ${d.px}px ${d.px + 3}px)`,
              }}
            />
            <span className="font-mono text-[10px] text-fog">{d.l}</span>
          </span>
        ))}
        {showPlates && (
          <span className="flex items-center gap-1.5 border-l border-line pl-3">
            <span className="inline-block h-0 w-6 border-t border-dashed" style={{ borderColor: "#e23a62" }} />
            <span className="font-mono text-[10px] text-fog">límites de placa · clic = nombre</span>
          </span>
        )}
      </div>

      {/* lectura de coordenadas */}
      <div className="absolute bottom-3 right-3 hidden items-center gap-2 border border-line bg-abyss/85 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-fog sm:flex">
        <span className="text-amber">
          {geo
            ? `${Math.abs(geo[1]).toFixed(1)}°${geo[1] >= 0 ? "N" : "S"} ${Math.abs(geo[0]).toFixed(1)}°${geo[0] >= 0 ? "E" : "O"}`
            : "——.—° · ——.—°"}
        </span>
        <span className="text-dim">zoom {view.k.toFixed(1)}×</span>
      </div>

      {/* exportar el mapa como imagen */}
      <div className={`absolute left-3 z-10 flex gap-1.5 ${
        isFullscreen
          ? "bottom-16 flex-col sm:bottom-14"
          : "top-5 sm:bottom-14 sm:top-auto sm:flex-col"
      }`}>
        <button
          onClick={() => downloadMap("png")}
          title="Descargar el mapa como PNG"
          aria-label="Descargar el mapa como PNG"
          className="chip-btn border border-line bg-abyss/90 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-dim uppercase hover:border-teal hover:text-teal sm:px-2 sm:py-1 sm:text-[10px]"
        >
          PNG
        </button>
        <button
          onClick={() => downloadMap("svg")}
          title="Descargar el mapa como SVG"
          aria-label="Descargar el mapa como SVG"
          className="chip-btn border border-line bg-abyss/90 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-dim uppercase hover:border-teal hover:text-teal sm:px-2 sm:py-1 sm:text-[10px]"
        >
          SVG
        </button>
      </div>

      {/* hint del modo marcar área */}
      {selectMode && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap border border-amber/60 bg-abyss/95 px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-amber uppercase shadow-xl shadow-black/40">
          Arrastra sobre el mapa para marcar la zona · Esc cancela
        </div>
      )}

      {/* rótulo del filtro activo */}
      {caption && (
        <div
          className={`pointer-events-none absolute left-3 z-20 border border-amber/50 bg-abyss/85 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] text-amber uppercase ${
            isFullscreen ? "top-16 hidden sm:block" : "top-3"
          }`}
        >
          {caption}
        </div>
      )}

      {/* pantalla completa: filtros */}
      {isFullscreen && fullscreenBar && (
        <>
          {/* móvil: card colapsable */}
          <div className="absolute left-3 right-14 top-3 z-30 sm:hidden">
            <button
              onClick={() => setFullFilterOpen((v) => !v)}
              aria-expanded={fullFilterOpen}
              aria-label={fullFilterOpen ? "Ocultar filtros" : "Mostrar filtros"}
              title={fullFilterOpen ? "Ocultar filtros" : "Mostrar filtros"}
              className="chip-btn flex w-full items-center justify-between gap-2 border border-line bg-abyss/95 px-3 py-2 text-left shadow-xl shadow-black/50 backdrop-blur-sm"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-fog uppercase">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-amber">
                  <path d="M2 4h12M4.5 8h7M7 12h2" />
                </svg>
                Filtros
                {caption && (
                  <span className="border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-amber">
                    {caption}
                  </span>
                )}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`shrink-0 text-dim transition-transform ${fullFilterOpen ? "rotate-180" : ""}`}
              >
                <path d="M3 6l5 5 5-5" />
              </svg>
            </button>
            {fullFilterOpen && (
              <div className="no-scrollbar mt-1 max-h-[52vh] overflow-y-auto overscroll-contain border border-line bg-abyss/95 p-2 shadow-xl shadow-black/50 backdrop-blur-sm">
                {fullscreenBar}
              </div>
            )}
          </div>

          {/* escritorio: barra arrastrable colapsable */}
          <div
            ref={barRef}
            className={`absolute z-30 hidden w-max max-w-[calc(100%-1rem)] border border-line bg-abyss/95 shadow-xl shadow-black/50 backdrop-blur-sm sm:block ${
              barCollapsed ? "p-1.5" : "p-2"
            } ${barPos ? "" : "left-1/2 top-16 -translate-x-1/2"}`}
            style={barPos ? { left: barPos.x, top: barPos.y } : undefined}
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
          >
            <div
              className={`flex cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing ${
                barCollapsed ? "" : "mb-1.5 border-b border-line/60 pb-1.5"
              }`}
              title="Arrastra para mover"
              aria-label="Mover barra de filtros"
            >
              <span className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="h-[2px] w-2 bg-fog/40" />
                ))}
              </span>
              <span className="font-mono text-[9px] tracking-[0.2em] text-dim uppercase">Filtros</span>
              {barCollapsed && caption && (
                <span className="border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-amber">
                  {caption}
                </span>
              )}
              <button
                onClick={() => setBarCollapsed((v) => !v)}
                aria-expanded={!barCollapsed}
                aria-label={barCollapsed ? "Mostrar filtros" : "Ocultar filtros"}
                title={barCollapsed ? "Mostrar filtros" : "Ocultar filtros"}
                className="chip-btn grid h-6 w-6 shrink-0 place-items-center border border-line text-dim hover:border-amber hover:text-amber"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={barCollapsed ? "" : "rotate-180"}
                >
                  <path d="M3 6l5 5 5-5" />
                </svg>
              </button>
            </div>
            {!barCollapsed && (
              <div id="fs-filters-content" ref={barContentRef} className="max-h-[calc(100vh-9rem)] overflow-y-auto">
                {fullscreenBar}
              </div>
            )}
          </div>
        </>
      )}

      {/* pantalla completa: resumen de la selección (escritorio) */}
      {isFullscreen && (
        <div className="absolute left-3 top-24 z-30 hidden w-[280px] max-w-[calc(100%-1.5rem)] sm:block">
          {hasSelection ? (
            <div className="overflow-hidden border border-line bg-abyss/95 shadow-xl shadow-black/50 backdrop-blur-sm">
              <SelectionSummary
                selPlate={selPlate}
                selPlateParts={selPlateParts}
                selLive={selLive}
                selQuake={selQuake}
                onClose={clearSelection}
              />
            </div>
          ) : (
            <div className="pointer-events-none border border-line/50 bg-abyss/75 px-3 py-2 font-mono text-[10px] leading-relaxed text-dim shadow-xl shadow-black/50 backdrop-blur-sm">
              Haz clic en un epicentro o en un límite de placa para ver su resumen
            </div>
          )}
        </div>
      )}

      {/* pantalla completa: resumen como bottom sheet (móvil) */}
      {isFullscreen && (
        <div className="absolute inset-x-0 bottom-0 z-40 sm:hidden">
          <AnimatePresence>
            {hasSelection && (
              <motion.div
                key="fullsheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={
                  reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32 }
                }
                drag={reduced ? false : "y"}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.55 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 90 || info.velocity.y > 600) clearSelection();
                }}
                className="max-h-[45vh] rounded-t-lg border border-b-0 border-line bg-panel shadow-2xl shadow-black/60"
              >
                <div className="flex shrink-0 cursor-grab touch-none items-center justify-center pt-3 pb-1.5 active:cursor-grabbing">
                  <span className="h-1 w-12 rounded-full bg-fog/40" />
                </div>
                <div className="no-scrollbar max-h-[45vh] min-h-0 overflow-y-auto overscroll-contain pb-4">
                  <SelectionSummary
                    selPlate={selPlate}
                    selPlateParts={selPlateParts}
                    selLive={selLive}
                    selQuake={selQuake}
                    onClose={clearSelection}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});
