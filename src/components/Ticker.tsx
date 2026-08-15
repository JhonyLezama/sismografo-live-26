import type { Quake } from "../data/quakes";
import { dateShort, magColor } from "../data/quakes";

export default function Ticker({ quakes }: { quakes: Quake[] }) {
  const items = [...quakes].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
  const row = (key: string, hidden: boolean) => (
    <div
      key={key}
      aria-hidden={hidden}
      className="flex shrink-0 items-center"
    >
      {items.map((q) => (
        <span
          key={key + q.id}
          className="flex items-center gap-3 px-6 font-mono text-[11px] tracking-[0.14em] text-fog uppercase whitespace-nowrap"
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
