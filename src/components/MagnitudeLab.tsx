import { useState } from "react";
import {
  QUAKES,
  MERCALLI,
  magColor,
  mmiColor,
  TNTtons,
  HIROSHIMA_J,
  energyJoules,
  fmt,
} from "../data/quakes";
import { useReveal } from "../hooks";

const PRESETS = [
  { label: "Hiroshima ≈", m: 6.0 },
  { label: "Guerrero, MX", m: 6.5 },
  { label: "Mindanao, PH", m: 7.8 },
  { label: "Valdivia 1960", m: 9.5 },
];

function fmtEnergy(m: number) {
  const j = energyJoules(m);
  if (j >= 1e18) return `${(j / 1e18).toLocaleString("es-ES", { maximumFractionDigits: 1 })} EJ`;
  if (j >= 1e15) return `${(j / 1e15).toLocaleString("es-ES", { maximumFractionDigits: 1 })} PJ`;
  return `${(j / 1e12).toLocaleString("es-ES", { maximumFractionDigits: 0 })} TJ`;
}

function fmtTNT(m: number) {
  const t = TNTtons(m);
  if (t >= 1e6) return `${(t / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} Mt`;
  if (t >= 1e3) return `${(t / 1e3).toLocaleString("es-ES", { maximumFractionDigits: 1 })} kt`;
  return `${fmt(Math.round(t))} t`;
}

export default function MagnitudeLab() {
  const [m, setM] = useState(7.8);
  const labRef = useReveal<HTMLDivElement>();
  const merRef = useReveal<HTMLDivElement>();
  const c = magColor(m);
  const hiro = energyJoules(m) / HIROSHIMA_J;
  const ampPct = Math.pow(10, m - 4) / Math.pow(10, 9.5 - 4);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* columna fija */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="font-mono text-[11px] tracking-[0.24em] text-amber uppercase">03 · Cómo se mide</div>
        <h2 className="mt-3 font-display text-4xl leading-[0.95] tracking-wide text-bone sm:text-5xl">
          UN GRADO<br />NO ES<br /><span className="text-verm">UN GRADO</span>
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fog">
          La magnitud de momento (Mw) es <strong className="text-bone">logarítmica</strong>: cada punto
          completo multiplica por <strong className="text-bone">~10 la amplitud</strong> de la sacudida y
          por <strong className="text-bone">~32 la energía liberada</strong>. La diferencia entre M6.5 y M7.8
          no es "un poquito más": es otra categoría de fenómeno.
        </p>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fog">
          La <strong className="text-bone">intensidad Mercalli (MMI)</strong>, en cambio, describe lo que la
          gente realmente sintió en cada lugar: depende de la profundidad, la distancia, el suelo y la
          calidad de las construcciones.
        </p>
        <div className="mt-6 inline-flex items-center gap-3 border border-line bg-panel px-4 py-3">
          <svg width="34" height="22" viewBox="0 0 34 22" fill="none" stroke="#f59e42" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 11h6l2.5-7 3.5 14 3-9 2 4 1.5-2H33" />
          </svg>
          <span className="font-mono text-[11px] leading-snug tracking-wider text-fog">
            log₁₀ E (julios) = 1.5 · Mw + 4.8<br />
            <span className="text-dim">relación de Gutenberg–Richter</span>
          </span>
        </div>
      </div>

      {/* laboratorio */}
      <div ref={labRef} className="rv space-y-4">
        <div className="border border-line bg-panel p-5 sm:p-7">
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Laboratorio de magnitud</div>
              <div className="mt-1 font-display text-7xl leading-none sm:text-8xl" style={{ color: c }}>
                {m.toFixed(1)}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex-1 sm:max-w-lg lg:grid-cols-4">
              {[
                { l: "Energía", v: fmtEnergy(m) },
                { l: "Equiv. TNT", v: fmtTNT(m) },
                { l: "Hiroshimas", v: hiro >= 100 ? fmt(Math.round(hiro)) : hiro.toLocaleString("es-ES", { maximumFractionDigits: 1 }) },
                { l: "Amplitud", v: `×${fmt(Math.round(Math.pow(10, m - 4)))}` },
              ].map((s) => (
                <div key={s.l} className="min-w-0 border border-line bg-abyss/60 px-2 py-2 sm:px-3">
                  <div className="font-mono text-[9px] tracking-[0.16em] text-dim uppercase">{s.l}</div>
                  <div className="mt-0.5 truncate font-mono text-sm font-semibold text-bone" title={s.v}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={4}
            max={9.5}
            step={0.1}
            value={m}
            onChange={(e) => setM(parseFloat(e.target.value))}
            className="mag-slider mt-7"
            aria-label="Magnitud de momento"
          />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-dim">
            <span>4.0</span><span>5.0</span><span>6.0</span><span>7.0</span><span>8.0</span><span>9.5</span>
          </div>

          {/* barra relativa logarítmica */}
          <div className="mt-6">
            <div className="mb-1 font-mono text-[10px] tracking-[0.16em] text-dim uppercase">
              Amplitud relativa de sacudida (M4.0 = 1×, escala log)
            </div>
            <div className="h-3 border border-line bg-abyss">
              <div
                className="h-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(0.6, ampPct * 100)}%`, background: `linear-gradient(90deg, #3ec9a7, ${c})` }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setM(p.m)}
                className={`chip-btn min-w-0 flex-1 basis-[45%] truncate border px-2 py-1.5 font-mono text-[10px] tracking-wider uppercase sm:flex-none sm:px-3 sm:text-[11px] ${
                  Math.abs(m - p.m) < 0.05
                    ? "border-amber bg-amber/15 text-amber"
                    : "border-line text-fog hover:border-fog hover:text-bone"
                }`}
              >
                {p.label} · M{p.m.toFixed(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Mercalli */}
        <div ref={merRef} className="rv border border-line bg-panel">
          <div className="border-b border-line px-5 py-4">
            <div className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Escala de intensidad</div>
            <h3 className="mt-1 font-display text-2xl tracking-wide text-bone">
              MERCALLI MODIFICADA <span className="text-fog">I — XII</span>
            </h3>
          </div>
          <div className="divide-y divide-line/60">
            {MERCALLI.map((row) => {
              const count = QUAKES.filter((q) => q.mmi === row.g).length;
              const col = mmiColor(row.g);
              return (
                <div key={row.g} className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-raise/60 sm:gap-x-4 sm:px-5">
                  <span
                    className="grid h-9 w-11 shrink-0 place-items-center border font-display text-lg"
                    style={{ color: col, borderColor: `${col}77`, background: `${col}12` }}
                  >
                    {row.g}
                  </span>
                  <span className="w-24 shrink-0 truncate text-sm font-semibold text-bone sm:w-32">{row.label}</span>
                  <span className="min-w-0 flex-1 basis-full truncate text-xs text-fog transition-transform duration-200 group-hover:translate-x-1 sm:basis-auto">
                    {row.desc}
                  </span>
                  {count > 0 && (
                    <span className="hidden shrink-0 border border-line px-2 py-0.5 font-mono text-[10px] tracking-wider text-fog sm:inline-flex">
                      {count} evento{count > 1 ? "s" : ""} 2026
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
