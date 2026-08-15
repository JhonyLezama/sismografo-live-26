import { ANNUAL, MONTHLY, QUAKES, fmt, fmtMoney, magColor } from "../data/quakes";
import { useCountUp, useReveal } from "../hooks";

function Counter({ value, label, suffix, prefix }: { value: number; label: string; suffix?: string; prefix?: string }) {
  const { ref, val } = useCountUp(value);
  return (
    <div className="bg-panel px-5 py-6 sm:px-7">
      <div ref={ref} className="font-display text-4xl leading-none text-bone sm:text-5xl">
        {prefix}
        {val.toLocaleString("es-ES")}
        {suffix && <span className="text-2xl text-amber sm:text-3xl">{suffix}</span>}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{label}</div>
    </div>
  );
}

const DAMAGE_NOTES = [
  { q: "Venezuela · M7.5", note: "Más de 58.000 edificios dañados o destruidos (análisis satelital, Univ. Estatal de Oregón)." },
  { q: "Filipinas · M7.8", note: "Colapso de un edificio universitario en General Santos; cortes de energía en todo Mindanao." },
  { q: "Colombia · M7.4", note: "Deslizamientos de tierra en Chocó y el eje cafetero; decenas de localidades quedaron aisladas." },
  { q: "Honduras · M5.2", note: "Al menos 50 viviendas dañadas en la zona costera de Omoa." },
  { q: "China · M5.0", note: "1.540 viviendas dañadas y deslizamientos en el condado de Qiaojia, Yunnan." },
];

export default function Balance() {
  const statsRef = useReveal<HTMLDivElement>();
  const chartRef = useReveal<HTMLDivElement>();
  const ecoRef = useReveal<HTMLDivElement>();

  const costs = QUAKES.filter((q) => q.costM !== null)
    .sort((a, b) => (b.costM ?? 0) - (a.costM ?? 0));
  const maxCost = costs[0]?.costM ?? 1;
  const maxEvents = Math.max(...MONTHLY.map((m) => m.events));
  const maxDeaths = Math.max(...MONTHLY.map((m) => m.deaths));
  const countries = new Set(QUAKES.map((q) => q.iso)).size;

  return (
    <div className="space-y-10">
      {/* contadores */}
      <div ref={statsRef} className="rv grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <Counter value={ANNUAL.totalM4} label="Sismos M4+ registrados" />
        <Counter value={ANNUAL.deaths} label="Víctimas fatales" />
        <Counter value={ANNUAL.m7} label="Sismos de M7 o más" />
        <Counter value={ANNUAL.m6 + ANNUAL.m7} label="Sismos de M6 o más" />
        <Counter value={countries} label="Países y territorios" />
        <Counter value={ANNUAL.costMEst} label="Coste estimado (M USD)" prefix="≈" />
      </div>

      {/* gráficas mensuales */}
      <div ref={chartRef} className="rv grid gap-4 lg:grid-cols-2">
        <div className="border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl tracking-wide text-bone">SISMOS M6+ POR MES</h3>
            <span className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">ene — ago</span>
          </div>
          <div className="mt-5 flex h-44 items-end gap-2 sm:gap-3">
            {MONTHLY.map((mo, i) => (
              <div key={mo.m} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[11px] text-fog transition-colors group-hover:text-amber">{mo.events}</span>
                <div
                  className="bar-grow-v w-full max-w-10 bg-amber/80 transition-colors group-hover:bg-amber"
                  style={{ height: `${(mo.events / maxEvents) * 100}%`, transitionDelay: `${i * 70}ms` }}
                />
                <span className="font-mono text-[10px] tracking-wider text-dim uppercase">{mo.m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl tracking-wide text-bone">VÍCTIMAS FATALES POR MES</h3>
            <span className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">junio = 93 %</span>
          </div>
          <div className="mt-5 flex h-44 items-end gap-2 sm:gap-3">
            {MONTHLY.map((mo, i) => (
              <div key={mo.m} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[10px] text-fog transition-colors group-hover:text-verm">
                  {mo.deaths > 0 ? fmt(mo.deaths) : "0"}
                </span>
                <div
                  className="bar-grow-v w-full max-w-10 transition-colors"
                  style={{
                    height: `${Math.max(1.5, (mo.deaths / maxDeaths) * 100)}%`,
                    background: mo.deaths > 1000 ? "#f0603c" : mo.deaths > 0 ? "#e23a62aa" : "#24383d",
                    transitionDelay: `${i * 70}ms`,
                  }}
                />
                <span className="font-mono text-[10px] tracking-wider text-dim uppercase">{mo.m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* economía */}
      <div ref={ecoRef} className="rv grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="border border-line bg-panel p-5 sm:p-7">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl tracking-wide text-bone">IMPACTO ECONÓMICO ESTIMADO</h3>
            <span className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">millones USD</span>
          </div>
          <div className="mt-6 space-y-3.5">
            {costs.map((q, i) => (
              <div key={q.id} className="group">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-fog">
                    <span className="font-semibold text-bone">{q.country}</span> · M{q.mag.toFixed(1)} · {q.place.split(",")[0]}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-gold">{fmtMoney(q.costM!)}</span>
                </div>
                <div className="h-2.5 border border-line/70 bg-abyss">
                  <div
                    className="bar-grow h-full"
                    style={{
                      width: `${Math.max(1.2, Math.sqrt((q.costM! / maxCost)) * 100)}%`,
                      background: `linear-gradient(90deg, ${magColor(q.mag)}44, ${magColor(q.mag)})`,
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-line pt-3 font-mono text-[10px] leading-relaxed tracking-wider text-dim">
            * ESTIMACIONES PRELIMINARES A PARTIR DE REPORTES DE PRENSA Y AGENCIAS. LAS CIFRAS DEFINITIVAS
            SUELEN REVISARSE DURANTE MESES.
          </p>
        </div>

        <div className="border border-line bg-panel p-5 sm:p-7">
          <h3 className="font-display text-xl tracking-wide text-bone">DAÑOS REPORTADOS</h3>
          <ul className="mt-5 space-y-4">
            {DAMAGE_NOTES.map((d) => (
              <li key={d.q} className="group flex gap-3">
                <svg width="14" height="14" viewBox="0 0 14 14" className="mt-1 shrink-0 text-verm">
                  <path d="M7 1L13 12H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M7 5.5v3M7 10.4v.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.14em] text-amber uppercase">{d.q}</div>
                  <p className="mt-0.5 text-sm leading-relaxed text-fog transition-transform duration-200 group-hover:translate-x-1">
                    {d.note}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
