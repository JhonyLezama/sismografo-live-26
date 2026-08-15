import { useEffect, useMemo, useRef, useState } from "react";
import type { Region, Quake } from "./data/quakes";
import { QUAKES, ANNUAL, fmt, MONTHS_ES, magColor } from "./data/quakes";
import WorldMap from "./components/WorldMap";
import SidePanel, { LiveDetail } from "./components/SidePanel";
import { fetchLiveQuakes, timeAgo, USGS_FEED_URL } from "./data/usgs";
import type { LiveQuake } from "./data/usgs";
import Registry from "./components/Registry";
import MagnitudeLab from "./components/MagnitudeLab";
import Balance from "./components/Balance";
import Ticker from "./components/Ticker";
import Seismograph from "./components/Seismograph";
import { useScramble, useUtcClock, useReveal, usePrefersReducedMotion } from "./hooks";

const REGIONS: ("Todas" | Region)[] = [
  "Todas", "Sudamérica", "Norteamérica", "Asia", "Oceanía", "Europa", "África",
];
const MAG_CHIPS = [
  { v: 0, l: "Todos" },
  { v: 5, l: "≥ 5.0" },
  { v: 6, l: "≥ 6.0" },
  { v: 7, l: "≥ 7.0" },
];

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

export default function App() {
  const [minMag, setMinMag] = useState(0);
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("Todas");
  const [month, setMonth] = useState(-1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* capa EN VIVO — API gratuita del USGS */
  const [liveQuakes, setLiveQuakes] = useState<LiveQuake[]>([]);
  const [liveUpdated, setLiveUpdated] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState<"loading" | "ok" | "error">("loading");
  const [showLive, setShowLive] = useState(true);
  const [liveSel, setLiveSel] = useState<string | null>(null);

  const refreshLive = () => {
    setLiveStatus("loading");
    fetchLiveQuakes()
      .then(({ quakes, updated }) => {
        setLiveQuakes(quakes);
        setLiveUpdated(updated);
        setLiveStatus("ok");
      })
      .catch(() => setLiveStatus("error"));
  };

  useEffect(() => {
    refreshLive();
    const id = window.setInterval(refreshLive, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = useUtcClock();
  const reduced = usePrefersReducedMotion();
  const mapSecRef = useRef<HTMLDivElement | null>(null);

  const line1 = useScramble("LA TIERRA TEMBLÓ");
  const line2 = useScramble("8.462 VECES");
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
          (month < 0 || Number(q.date.slice(5, 7)) - 1 === month)
      ),
    [minMag, region, month]
  );

  useEffect(() => setSelectedId(null), [minMag, region, month]);

  const pickFromTable = (q: Quake) => {
    setSelectedId(q.id);
    mapSecRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  };

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
            {[["#mapa", "Mapa"], ["#en-vivo", "En vivo"], ["#registro", "Registro"], ["#escalas", "Escalas"], ["#balance", "Balance"]].map(([h, l]) => (
              <a key={h} href={h} className="chip-btn border-b border-transparent pb-0.5 hover:border-amber hover:text-amber">
                {l}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] tracking-widest text-fog sm:flex">
              <span className="blink-dot inline-block h-2 w-2 rounded-full bg-verm" />
              EN VIVO
            </span>
            <span className="font-mono text-xs font-semibold tracking-widest text-amber">{clock}</span>
          </div>
        </div>
      </header>

      <Ticker quakes={QUAKES} />

      {/* ---------- apertura ---------- */}
      <section className="relative z-10 mx-auto max-w-[1400px] px-4 pt-12 pb-10 sm:px-6 sm:pt-16">
        <div ref={introRef} className="rv grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.24em] text-amber uppercase">
              <span className="inline-block h-px w-10 bg-amber" />
              Temporada sísmica · {ANNUAL.period}
            </div>
            <h1 className="mt-5 font-display leading-[0.9] tracking-wide">
              <span className="block text-[clamp(3rem,8.5vw,7.5rem)] text-bone">{line1 || " "}</span>
              <span className="block text-[clamp(3rem,8.5vw,7.5rem)] text-verm">{line2 || " "}</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-fog">
              De la doble sacudida de <strong className="text-bone">Venezuela</strong> al megasismo de{" "}
              <strong className="text-bone">Mindanao</strong>: todos los epicentros relevantes registrados en el
              mundo en 2026, con su magnitud, intensidad, víctimas y costo estimado. Haz clic en cualquier
              punto del mapa para abrir su ficha.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {[
                { v: fmt(ANNUAL.deaths), l: "víctimas fatales", c: "#f0603c" },
                { v: String(ANNUAL.m7), l: "sismos M7 o más", c: "#f59e42" },
                { v: "M7.8", l: "máxima magnitud", c: "#e23a62" },
              ].map((s, i) => (
                <div key={s.l} className={`rv rv-d${i + 1} border border-line bg-panel px-5 py-3`}>
                  <div className="font-display text-3xl leading-none" style={{ color: s.c }}>{s.v}</div>
                  <div className="mt-1 font-mono text-[9px] tracking-[0.2em] text-dim uppercase">{s.l}</div>
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
              <dl className="divide-y divide-line/60">
                {[
                  ["Periodo cubierto", ANNUAL.period],
                  ["Registros M4 o más", fmt(ANNUAL.totalM4)],
                  ["Sismos M6 — M7.9", `${ANNUAL.m6 + ANNUAL.m7} (${ANNUAL.m7} de M7+)`],
                  ["Más fuerte", "M7.8 · Mindanao, Filipinas"],
                  ["Más mortífero", "Venezuela · 6.301 fallecidos"],
                  ["En el Anillo de Fuego", "10 de 11 sismos M7+"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-3">
                    <dt className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{k}</dt>
                    <dd className="text-right text-sm font-semibold text-bone">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-line px-5 py-3">
                <div className="mb-1 font-mono text-[9px] tracking-[0.22em] text-dim uppercase">Onda sísmica · simulación</div>
                <Seismograph amp={0.45} seed={26} height={54} color="#3ec9a7" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 01 mapa ---------- */}
      <section id="mapa" ref={mapSecRef} className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="01 · Epicentros"
          title="EL MAPA DEL TEMBLOR"
          sub="Proyección Natural Earth con los epicentros de 2026. El tamaño y el color de cada punto siguen la magnitud de momento (Mw). Rueda para hacer zoom, arrastra para moverte."
        />

        <div ref={dashRef} className="rv mb-5 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Magnitud</span>
          <div className="flex overflow-hidden border border-line">
            {MAG_CHIPS.map((c) => (
              <button
                key={c.v}
                onClick={() => setMinMag(c.v)}
                className={`chip-btn px-3.5 py-1.5 font-mono text-xs ${
                  minMag === c.v ? "bg-amber text-abyss" : "bg-panel text-fog hover:text-bone"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
          <span className="ml-2 font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Región</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as (typeof REGIONS)[number])}
            className="chip-btn border border-line bg-panel px-3 py-1.5 font-mono text-xs text-bone outline-none hover:border-fog"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <span className="ml-2 font-mono text-[10px] tracking-[0.2em] text-dim uppercase">Mes</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="chip-btn border border-line bg-panel px-3 py-1.5 font-mono text-xs text-bone outline-none hover:border-fog"
          >
            <option value={-1}>Todo el año</option>
            {MONTHS_ES.slice(0, 8).map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <span className="ml-auto border border-line bg-panel px-3 py-1.5 font-mono text-[11px] tracking-widest text-jade">
            {filtered.length} EVENTOS
          </span>
          <button
            onClick={() => setShowLive((v) => !v)}
            aria-pressed={showLive}
            title="Mostrar u ocultar la capa de sismos en vivo del USGS"
            className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] tracking-widest uppercase transition-colors ${
              showLive
                ? "border-teal/60 bg-teal/10 text-teal"
                : "border-line bg-panel text-dim hover:text-fog"
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${showLive ? "blink-dot bg-teal" : "bg-dim"}`} />
            EN VIVO USGS · {liveStatus === "loading" ? "···" : liveQuakes.length}
          </button>
          <button
            onClick={refreshLive}
            aria-label="Actualizar datos del USGS"
            title="Actualizar datos del USGS"
            className="chip-btn grid h-[30px] w-[30px] place-items-center border border-line bg-panel text-fog hover:border-teal hover:text-teal"
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

        <div className="grid gap-4 lg:h-[620px] lg:grid-cols-12">
          <div className="h-[420px] sm:h-[500px] lg:col-span-7 lg:h-full">
            <WorldMap
              quakes={filtered}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id) setLiveSel(null);
              }}
              liveQuakes={liveQuakes}
              showLive={showLive && liveStatus === "ok"}
              liveSelectedId={liveSel}
              onSelectLive={(id) => {
                setLiveSel(id);
                if (id) setSelectedId(null);
              }}
            />
          </div>
          <div className="h-[480px] min-h-0 overflow-y-auto lg:col-span-5 lg:h-full">
            {liveSel && liveQuakes.some((q) => q.id === liveSel) ? (
              <LiveDetail
                q={liveQuakes.find((q) => q.id === liveSel)!}
                onClose={() => setLiveSel(null)}
              />
            ) : (
              <SidePanel quakes={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>
        </div>
      </section>

      {/* ---------- 01b en vivo ---------- */}
      <section id="en-vivo" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="01·B · Alimentación en vivo"
          title="PULSO EN TIEMPO REAL"
          sub="Conexión directa a la API abierta del USGS Earthquake Hazards Program: cada sismo de magnitud 4.5 o mayor registrado en el mundo durante la última ventana móvil de 30 días, sin claves ni intermediarios."
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            {/* estado del feed */}
            <div className="border border-teal/40 bg-panel">
              <div className="flex items-center justify-between border-b border-teal/30 bg-deep/60 px-5 py-3">
                <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-teal uppercase">
                  <span className="relative flex h-2 w-2">
                    <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                  </span>
                  USGS · FEED ABIERTO
                </span>
                <a
                  href={USGS_FEED_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] tracking-widest text-dim uppercase hover:text-teal"
                >
                  GeoJSON ↗
                </a>
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-display text-3xl text-teal">{liveQuakes.length}</div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-dim uppercase">Sismos M4.5+ en 30 días</div>
                    </div>
                    <div className="border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-display text-3xl" style={{ color: magColor(liveQuakes.reduce((m, q) => Math.max(m, q.mag), 0)) }}>
                        M{liveQuakes.reduce((m, q) => Math.max(m, q.mag), 0).toFixed(1)}
                      </div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-dim uppercase">Máxima en la ventana</div>
                    </div>
                    <div className="border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-mono text-sm font-semibold text-bone">
                        {liveQuakes[0] ? timeAgo(liveQuakes[0].time) : "—"}
                      </div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-dim uppercase">Último evento</div>
                    </div>
                    <div className="border border-line/70 bg-deep/50 px-4 py-3">
                      <div className="font-mono text-sm font-semibold text-bone">
                        {liveUpdated ? timeAgo(liveUpdated).replace("hace instantes", "ahora") : "—"}
                      </div>
                      <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-dim uppercase">Última sincronización</div>
                    </div>
                  </div>
                  <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-wider text-dim uppercase">
                    Actualización automática cada 5 min · los marcadores con retícula verde en el mapa
                    pertenecen a esta capa
                  </p>
                </div>
              )}
            </div>

            {/* últimos eventos */}
            <div className="border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line bg-deep/60 px-5 py-3">
                <span className="font-mono text-[10px] tracking-[0.22em] text-dim uppercase">
                  Últimos eventos · clic para ubicar en el mapa
                </span>
                <span className="font-mono text-[10px] tracking-widest text-teal">
                  {liveStatus === "ok" ? `MOSTRANDO ${Math.min(12, liveQuakes.length)} DE ${liveQuakes.length}` : ""}
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
                  {liveQuakes.slice(0, 12).map((q) => (
                    <li key={q.id}>
                      <button
                        onClick={() => {
                          setLiveSel(q.id);
                          setSelectedId(null);
                          mapSecRef.current?.scrollIntoView({
                            behavior: reduced ? "auto" : "smooth",
                            block: "start",
                          });
                        }}
                        className="row-hover group flex w-full items-center gap-4 px-5 py-2.5 text-left"
                      >
                        <span className="w-16 shrink-0 font-mono text-[11px] tracking-wider text-dim">
                          {timeAgo(q.time).replace("hace ", "")}
                        </span>
                        <span
                          className="grid h-9 w-12 shrink-0 place-items-center border font-display text-lg"
                          style={{ color: magColor(q.mag), borderColor: `${magColor(q.mag)}55`, background: `${magColor(q.mag)}12` }}
                        >
                          {q.mag.toFixed(1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-bone">{q.place}</span>
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
                  ))}
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
            sub="Los eventos destacados del año, ordenables por fecha, magnitud, profundidad, víctimas o costo. Toca una fila para localizarla en el mapa."
          />
          <Registry quakes={filtered} onPick={pickFromTable} />
        </div>
      </section>

      {/* ---------- 03 escalas ---------- */}
      <section id="escalas" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <div ref={labRef} className="rv">
          <MagnitudeLab />
        </div>
      </section>

      {/* ---------- 04 balance ---------- */}
      <section id="balance" className="relative z-10 mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6">
        <SectionHead
          num="04 · Balance"
          title="LA FACTURA DE 2026"
          sub="Contadores del año, ritmo mensual de sismos mayores y víctimas, y el impacto económico preliminar reportado hasta el 15 de agosto."
        />
        <div ref={balRef} className="rv">
          <Balance />
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
            <span>React · d3-geo · datos abiertos</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
