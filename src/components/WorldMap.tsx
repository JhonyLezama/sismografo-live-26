import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature, mesh } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import countries110 from "world-atlas/countries-110m.json";
import type { Quake } from "../data/quakes";
import { magColor, dateShort, fmt } from "../data/quakes";
import type { LiveQuake } from "../data/usgs";
import { timeAgo } from "../data/usgs";
import { usePrefersReducedMotion } from "../hooks";

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

interface View {
  k: number;
  tx: number;
  ty: number;
}

interface Props {
  quakes: Quake[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  liveQuakes: LiveQuake[];
  showLive: boolean;
  liveSelectedId: string | null;
  onSelectLive: (id: string | null) => void;
}

const clampView = (k: number, tx: number, ty: number): View => ({
  k,
  tx: Math.min(0, Math.max(W - W * k, tx)),
  ty: Math.min(0, Math.max(H - H * k, ty)),
});

export default function WorldMap({
  quakes,
  selectedId,
  onSelect,
  liveQuakes,
  showLive,
  liveSelectedId,
  onSelectLive,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const [smooth, setSmooth] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverLiveId, setHoverLiveId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const dragRef = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const reduced = usePrefersReducedMotion();

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

  /* zoom con rueda (listener no pasivo) */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = Math.min(rect.width / W, rect.height / H);
      const ox = (rect.width - W * s) / 2;
      const oy = (rect.height - H * s) / 2;
      const mx = (e.clientX - rect.left - ox) / s;
      const my = (e.clientY - rect.top - oy) / s;
      setSmooth(false);
      setView((v) => {
        const k2 = Math.min(9, Math.max(1, v.k * Math.exp(-e.deltaY * 0.0016)));
        return clampView(k2, mx - ((mx - v.tx) * k2) / v.k, my - ((my - v.ty) * k2) / v.k);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* centrar al seleccionar (curado o en vivo) */
  useEffect(() => {
    const p = selectedId
      ? points.find((pt) => pt.q.id === selectedId)
      : liveSelectedId
        ? livePoints.find((pt) => pt.q.id === liveSelectedId)
        : undefined;
    if (!p) return;
    const k2 = Math.max(view.k, 2.4);
    setSmooth(true);
    setView(clampView(k2, W / 2 - p.x * k2, H / 2 - p.y * k2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, liveSelectedId, points, livePoints]);

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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    movedRef.current = false;
    setSmooth(false);
    dragRef.current = { px: e.clientX, py: e.clientY, tx: view.tx, ty: view.ty };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = toSvg(e);
    setCursor(pt);
    const d = dragRef.current;
    if (!d) return;
    const { s } = metrics();
    const dx = (e.clientX - d.px) / s;
    const dy = (e.clientY - d.py) / s;
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 5) movedRef.current = true;
    setView((v) => clampView(v.k, d.tx + dx, d.ty + dy));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onBackgroundClick = () => {
    if (!movedRef.current) onSelect(null);
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

  return (
    <div className="relative overflow-hidden rounded-md border border-line bg-deep">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="map-stage block h-full w-full select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null);
          dragRef.current = null;
        }}
        onClick={onBackgroundClick}
        role="application"
        aria-label="Mapa mundial de epicentros de 2026"
      >
        <g
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

          {/* marcadores */}
          {points.map(({ q, x, y }) => {
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
                  if (!movedRef.current) onSelect(q.id);
                }}
                onMouseEnter={() => setHoverId(q.id)}
                onMouseLeave={() => setHoverId(null)}
              >
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
              </g>
            );
          })}

          {/* capa EN VIVO (USGS) */}
          {showLive &&
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
                    if (!movedRef.current) onSelectLive(q.id);
                  }}
                  onMouseEnter={() => setHoverLiveId(q.id)}
                  onMouseLeave={() => setHoverLiveId(null)}
                >
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
      {showLive && hoverLiveId && hoverLiveId !== liveSelectedId && (() => {
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
            className="chip-btn grid h-8 w-8 place-items-center border border-line bg-panel/90 text-fog hover:border-amber hover:text-amber"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {b.icon}
            </svg>
          </button>
        ))}
      </div>

      {/* leyenda */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 border border-line bg-abyss/85 px-3 py-2">
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
        <span className="hidden font-mono text-[10px] text-dim sm:inline">· rueda = zoom · arrastra = mover</span>
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
    </div>
  );
}
