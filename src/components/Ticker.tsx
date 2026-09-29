import type { Quake } from "../data/quakes";
import { dateShort, magColor } from "../data/quakes";
import type { LiveQuake } from "../data/usgs";
import { timeAgo } from "../data/usgs";

interface Props {
  quakes: Quake[];
  live?: LiveQuake[];
  liveStatus?: "loading" | "ok" | "error";
}

/* Ticker live-first: si hay feed en vivo lo muestra; si no, cae al catálogo 2026 */
export default function Ticker({ quakes, live, liveStatus }: Props) {
  const useLive = liveStatus === "ok" && live && live.length > 0;
  const liveItems = (live ?? []).slice(0, 14);
  const staticItems = [...quakes].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);

  if (liveStatus === "loading" && (!live || live.length === 0)) {
    return (
      <div className="relative overflow-hidden border-y border-line bg-deep/80">
        <div className="ticker-track flex w-max py-2.5">
          <span className="px-6 font-mono text-[11px] tracking-[0.14em] text-dim uppercase">
            Sintonizando estaciones sísmicas…
          </span>
        </div>
      </div>
    );
  }

  const row = (key: string, hidden: boolean) => (
    <div key={key} aria-hidden={hidden} className="flex shrink-0 items-center">
      {useLive
        ? liveItems.map((q) => (
            <span
              key={key + q.id}
              className="flex items-center gap-3 px-6 font-mono text-[11px] tracking-[0.14em] whitespace-nowrap text-fog uppercase"
            >
              <span className="blink-dot inline-block h-1.5 w-1.5 rounded-full bg-teal" />
              <span className="text-dim">{timeAgo(q.time).replace("hace ", "")}</span>
              <span className="text-bone/90">{q.country}</span>
              <span style={{ color: magColor(q.mag) }}>M{q.mag.toFixed(1)}</span>
              {q.tsunami && <span className="text-verm">tsunami</span>}
            </span>
          ))
        : staticItems.map((q) => (
            <span
              key={key + q.id}
              className="flex items-center gap-3 px-6 font-mono text-[11px] tracking-[0.14em] whitespace-nowrap text-fog uppercase"
            >
              <svg width="7" height="7" viewBox="0 0 8 8" className="shrink-0">
                <rect x="1" y="1" width="6" height="6" transform="rotate(45 4 4)" fill={magColor(q.mag)} />
              </svg>
              <span className="text-dim">{dateShort(q.date)}</span>
              <span className="text-bone/90">{q.country}</span>
              <span style={{ color: magColor(q.mag) }}>M{q.mag.toFixed(1)}</span>
              {q.deaths > 0 && <span className="text-verm">{q.deaths.toLocaleString("es-ES")} víctimas</span>}
            </span>
          ))}
    </div>
  );

  return (
    <div className="ticker-mask relative overflow-hidden border-y border-line bg-deep/80">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-abyss to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-abyss to-transparent" />
      <div className="ticker-track flex w-max py-2.5">
        {row("a", false)}
        {row("b", true)}
      </div>
    </div>
  );
}
