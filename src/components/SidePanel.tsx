import type { Quake } from "../data/quakes";
import { magColor, mmiColor, depthClass, fmt, fmtMoney, dateShort } from "../data/quakes";
import type { LiveQuake } from "../data/usgs";
import { timeAgo, fmtUtc } from "../data/usgs";
import Seismograph from "./Seismograph";

/* ---- ficha de evento EN VIVO (USGS) ---- */
export function LiveDetail({ q, onClose }: { q: LiveQuake; onClose: () => void }) {
  const c = magColor(q.mag);
  const bars = 10 + Math.round((q.mag - 4) * 12);
  return (
    <div className="border border-teal/40 bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-teal/30 bg-deep/60 p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
            </span>
            <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-teal uppercase">
              Registro en vivo · USGS
            </span>
          </div>
          <h3 className="mt-2 font-display text-2xl leading-tight tracking-wide text-bone">{q.country}</h3>
          <p className="mt-1 text-sm leading-relaxed text-fog">{q.place}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar ficha"
          className="chip-btn border border-line p-1.5 text-dim hover:border-verm hover:text-verm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="font-display text-5xl leading-none" style={{ color: c }}>
            M{q.mag.toFixed(1)}
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">
            Magnitud
            <br />
            momento (Mw)
          </span>
        </div>
        <div className="mt-3 flex gap-[3px]">
          {Array.from({ length: Math.min(84, bars) }).map((_, i) => (
            <span key={i} className="wave-bar h-3 w-[3px]" style={{ background: c, animationDelay: `${i * 50}ms` }} />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { k: "Coordenadas", v: `${Math.abs(q.lat).toFixed(2)}°${q.lat >= 0 ? "N" : "S"} · ${Math.abs(q.lon).toFixed(2)}°${q.lon >= 0 ? "E" : "O"}` },
            { k: "Profundidad", v: `${q.depth} km` },
            { k: "Hora (UTC)", v: fmtUtc(q.time) },
            { k: "Antigüedad", v: timeAgo(q.time) },
            { k: "Índice de impacto", v: `${q.sig} / 1000` },
            { k: "Alerta tsunami", v: q.tsunami ? "SÍ EMITIDA" : "No" },
          ].map((row) => (
            <div key={row.k} className="border border-line/70 bg-deep/50 px-3 py-2">
              <div className="font-mono text-[9px] tracking-[0.16em] text-dim uppercase">{row.k}</div>
              <div className={`mt-0.5 font-mono text-xs ${row.k === "Alerta tsunami" && q.tsunami ? "font-semibold text-verm" : "text-bone"}`}>
                {row.v}
              </div>
            </div>
          ))}
        </div>

        <a
          href={q.url}
          target="_blank"
          rel="noreferrer"
          className="group mt-4 flex items-center justify-between border border-teal/50 bg-teal/10 px-4 py-3 text-sm font-semibold text-teal transition-colors hover:bg-teal/20"
        >
          Ver ficha oficial en USGS
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <path d="M3 11L11 3M5 3h6v6" />
          </svg>
        </a>
        <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-wider text-dim uppercase">
          Fuente: USGS Earthquake Hazards Program
        </p>
      </div>
    </div>
  );
}

interface Props {
  quakes: Quake[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-line bg-panel px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold" style={{ color: color ?? "#ede6d6" }}>
        {value}
      </div>
    </div>
  );
}

function Detail({ q, onClose }: { q: Quake; onClose: () => void }) {
  const c = magColor(q.mag);
  const dc = depthClass(q.depth);
  const amp = Math.min(1, 0.1 + ((q.mag - 2.5) / 5.3) * 0.9);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Ficha del evento</div>
          <h3 className="mt-1 font-display text-xl leading-tight tracking-wide text-bone">
            {q.country.toUpperCase()}
            <span className="text-fog"> · M{q.mag.toFixed(1)}</span>
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar ficha"
          className="chip-btn grid h-8 w-8 shrink-0 place-items-center border border-line text-fog hover:border-verm hover:text-verm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {q.tag && (
          <span className="inline-block border border-amber/60 bg-amber/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-amber uppercase">
            {q.tag}
          </span>
        )}
        <p className="text-sm leading-relaxed text-fog">{q.place}</p>

        <Seismograph amp={amp} seed={Math.round(q.mag * 13)} color={c} height={64} className="border border-line bg-abyss/60" />

        <div className="flex items-end gap-4">
          <div className="font-display text-6xl leading-none" style={{ color: c }}>
            {q.mag.toFixed(1)}
          </div>
          <div className="pb-1">
            <div className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">Magnitud momento</div>
            <div className="font-mono text-xs text-fog">Mw · escala logarítmica</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Fecha (UTC)" value={`${dateShort(q.date)} · ${q.time}`} />
          <Stat label="Profundidad" value={`${q.depth} km`} color={dc.color} />
          <Stat label="Intensidad MMI" value={`${q.mmi} · ${q.mmiLabel}`} color={mmiColor(q.mmi)} />
          <Stat label="Clasificación" value={dc.label} color={dc.color} />
          <Stat label="Víctimas fatales" value={q.deaths > 0 ? fmt(q.deaths) : "0"} color={q.deaths > 0 ? "#f0603c" : "#8fa3a0"} />
          <Stat label="Heridos" value={q.injured > 0 ? fmt(q.injured) : "0"} />
          <Stat label="Impacto económico" value={q.costM ? `≈ ${fmtMoney(q.costM)}` : "Sin estimación"} color={q.costM ? "#e8c14a" : "#8fa3a0"} />
          <Stat
            label="Tsunami"
            value={q.tsunami ? "Alerta emitida" : "No generado"}
            color={q.tsunami ? "#f0603c" : "#8fa3a0"}
          />
        </div>

        {/* barra de profundidad */}
        <div>
          <div className="mb-1 flex justify-between font-mono text-[10px] tracking-[0.14em] text-dim uppercase">
            <span>0 km</span>
            <span>Profundidad hipocentral</span>
            <span>650 km</span>
          </div>
          <div className="relative h-2 border border-line bg-abyss">
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: `${Math.min(100, (q.depth / 650) * 100)}%`, background: `linear-gradient(90deg, ${dc.color}55, ${dc.color})` }}
            />
            <div className="absolute -top-1 h-4 w-0.5 bg-bone" style={{ left: `${Math.min(100, (q.depth / 650) * 100)}%` }} />
          </div>
        </div>

        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm leading-relaxed text-bone/85">{q.summary}</p>
          <p className="font-mono text-[11px] leading-relaxed text-dim">
            <span className="text-fog">Marco tectónico:</span> {q.plates}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SidePanel({ quakes, selectedId, onSelect }: Props) {
  const selected = quakes.find((q) => q.id === selectedId) ?? null;
  const ranked = [...quakes].sort((a, b) => b.mag - a.mag);

  return (
    <aside className="flex h-full min-h-0 flex-col border border-line bg-panel">
      {selected ? (
        <Detail q={selected} onClose={() => onSelect(null)} />
      ) : (
        <>
          <div className="border-b border-line px-4 py-3">
            <div className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Ranking por magnitud</div>
            <h3 className="mt-1 font-display text-xl tracking-wide text-bone">LOS MAYORES DEL AÑO</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {ranked.length === 0 && (
              <p className="px-4 py-8 text-sm text-dim">Ningún sismo coincide con los filtros.</p>
            )}
            {ranked.map((q, i) => {
              const c = magColor(q.mag);
              return (
                <button
                  key={q.id}
                  onClick={() => onSelect(q.id)}
                  className="row-hover group flex w-full items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left"
                >
                  <span className="w-5 font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span
                    className="font-display text-lg leading-none transition-transform duration-200 group-hover:scale-110"
                    style={{ color: c }}
                  >
                    {q.mag.toFixed(1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-bone">
                      {q.country}
                      <span className="ml-1.5 font-normal text-fog">· {q.place.split(",")[0]}</span>
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-dim uppercase">
                      {dateShort(q.date)} · {q.depth} km
                      {q.deaths > 0 && <span className="text-verm"> · {fmt(q.deaths)} †</span>}
                    </span>
                  </span>
                  <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0 text-dim transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-amber" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M4 2l6 5-6 5" />
                  </svg>
                </button>
              );
            })}
          </div>
          <div className="border-t border-line px-4 py-2.5 font-mono text-[10px] tracking-[0.14em] text-dim uppercase">
            Selecciona un epicentro en el mapa o aquí
          </div>
        </>
      )}
    </aside>
  );
}
