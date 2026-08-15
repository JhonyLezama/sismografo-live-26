import { useMemo, useState } from "react";
import type { Quake } from "../data/quakes";
import { magColor, mmiColor, fmt, fmtMoney, dateShort } from "../data/quakes";

type SortKey = "date" | "mag" | "depth" | "deaths" | "cost";

interface Props {
  quakes: Quake[];
  onPick: (q: Quake) => void;
}

const COLS: { key: SortKey | null; label: string; align?: string }[] = [
  { key: "date", label: "Fecha" },
  { key: null, label: "Evento" },
  { key: null, label: "Región" },
  { key: "mag", label: "Mw" },
  { key: "depth", label: "Prof." },
  { key: null, label: "MMI" },
  { key: "deaths", label: "Víctimas" },
  { key: "cost", label: "Coste est." },
];

const MOBILE_SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "mag", label: "Mw" },
  { key: "depth", label: "Prof." },
  { key: "deaths", label: "Víctimas" },
  { key: "cost", label: "Coste" },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function Registry({ quakes, onPick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [dir, setDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const term = norm(query.trim());
    const arr = quakes.filter(
      (q) =>
        !term ||
        [q.country, q.place, q.region, q.id].some((v) => norm(v).includes(term))
    );
    arr.sort((a, b) => {
      let v = 0;
      if (sortKey === "date") v = a.date < b.date ? -1 : 1;
      else if (sortKey === "mag") v = a.mag - b.mag;
      else if (sortKey === "depth") v = a.depth - b.depth;
      else if (sortKey === "deaths") v = a.deaths - b.deaths;
      else if (sortKey === "cost") v = (a.costM ?? -1) - (b.costM ?? -1);
      return v * dir;
    });
    return arr;
  }, [quakes, sortKey, dir, query]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === "date" ? -1 : -1);
    }
  };

  return (
    <div>
      {/* búsqueda libre */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-0 flex-1 items-center gap-2 border border-line bg-panel px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="shrink-0 text-dim">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por país, región o lugar…"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-bone outline-none placeholder:text-dim"
            aria-label="Buscar en el registro"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="shrink-0 font-mono text-[11px] text-dim hover:text-verm"
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </label>
        <span className="font-mono text-[10px] tracking-widest text-dim uppercase">
          {sorted.length} resultados
        </span>
      </div>

      {/* orden · móvil */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 md:hidden">
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Ordenar</span>
        {MOBILE_SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => toggleSort(s.key)}
            className={`chip-btn border px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase ${
              sortKey === s.key ? "border-amber bg-amber/15 text-amber" : "border-line text-fog"
            }`}
          >
            {s.label}
            {sortKey === s.key && (dir === 1 ? " ↑" : " ↓")}
          </button>
        ))}
      </div>

      {/* tarjetas · móvil */}
      <ul className="space-y-2 md:hidden">
        {sorted.map((q) => {
          const c = magColor(q.mag);
          return (
            <li key={q.id}>
              <button
                onClick={() => onPick(q)}
                className="row-hover group flex w-full flex-col gap-1.5 border border-line bg-panel px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bone">{q.country}</span>
                  <span className="font-display text-lg leading-none" style={{ color: c }}>
                    M{q.mag.toFixed(1)}
                  </span>
                </div>
                <div className="truncate text-xs text-dim">{q.place}</div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] tracking-wider uppercase">
                  <span className="text-fog">
                    {dateShort(q.date)} · {q.time} · {q.region}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-dim">{q.depth} km</span>
                    <span
                      className="inline-block border px-1.5 py-0.5 font-semibold"
                      style={{
                        color: mmiColor(q.mmi),
                        borderColor: `${mmiColor(q.mmi)}66`,
                        background: `${mmiColor(q.mmi)}14`,
                      }}
                    >
                      MMI {q.mmi}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 font-mono text-[11px]">
                  <span className="text-fog">
                    Víctimas:{" "}
                    {q.deaths > 0 ? (
                      <span className="font-semibold text-verm">{fmt(q.deaths)}</span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </span>
                  <span className="text-gold">
                    Coste: {q.costM ? fmtMoney(q.costM) : <span className="text-dim">—</span>}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="border border-line bg-panel px-4 py-8 text-center text-sm text-dim">
            Sin resultados para la búsqueda o los filtros seleccionados.
          </li>
        )}
      </ul>

      {/* tabla · escritorio */}
      <div className="hidden overflow-x-auto border border-line bg-panel md:block">
        <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-deep">
            {COLS.map((c) => (
              <th
                key={c.label}
                className={`px-3 py-3 font-mono text-[10px] font-medium tracking-[0.18em] text-dim uppercase ${c.align ?? "text-left"} ${
                  c.key === "deaths" || c.key === "cost" ? "hidden lg:table-cell" : ""
                }`}
              >
                {c.key ? (
                  <button
                    onClick={() => toggleSort(c.key!)}
                    className={`chip-btn inline-flex items-center gap-1 uppercase tracking-[0.18em] ${sortKey === c.key ? "text-amber" : "hover:text-fog"}`}
                  >
                    {c.label}
                    {sortKey === c.key && (
                      <svg width="8" height="8" viewBox="0 0 8 8" className={dir === 1 ? "rotate-180" : ""} fill="currentColor">
                        <path d="M4 0L8 6H0z" />
                      </svg>
                    )}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((q) => {
            const c = magColor(q.mag);
            return (
              <tr
                key={q.id}
                onClick={() => onPick(q)}
                className="row-hover cursor-pointer border-b border-line/50 last:border-0"
                title="Ver en el mapa"
              >
                <td className="max-w-[150px] truncate px-3 py-2.5 font-mono text-xs text-fog">
                  {dateShort(q.date)}
                  <span className="ml-2 text-dim">{q.time}</span>
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <div className="truncate font-semibold text-bone">{q.country}</div>
                  <div className="truncate text-xs text-dim">{q.place}</div>
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-fog">{q.region}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                    <span className="font-display text-base" style={{ color: c }}>
                      {q.mag.toFixed(1)}
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-fog">{q.depth} km</td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                    style={{ color: mmiColor(q.mmi), borderColor: `${mmiColor(q.mmi)}66`, background: `${mmiColor(q.mmi)}14` }}
                  >
                    {q.mmi}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 font-mono text-xs lg:table-cell">
                  {q.deaths > 0 ? (
                    <span className="font-semibold text-verm">{fmt(q.deaths)}</span>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gold lg:table-cell">
                  {q.costM ? fmtMoney(q.costM) : <span className="text-dim">—</span>}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-dim">
                Sin resultados para la búsqueda o los filtros seleccionados.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}
