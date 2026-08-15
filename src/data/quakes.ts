import quakesJson from "./quakes.json";

export type Region =
  | "Sudamérica"
  | "Norteamérica"
  | "Asia"
  | "Oceanía"
  | "Europa"
  | "África";

export interface Quake {
  id: string;
  place: string;
  country: string;
  iso: string;
  region: Region;
  date: string; // ISO
  time: string; // UTC
  lat: number;
  lon: number;
  mag: number;
  depth: number; // km
  mmi: string; // romano
  mmiLabel: string;
  deaths: number;
  injured: number;
  costM: number | null; // millones USD (estimado preliminar)
  tsunami: boolean;
  plates: string;
  summary: string;
  tag?: string;
  /* campos generados por scripts/update-catalog.mjs */
  usgsId?: string;
  gdacsId?: string;
  needsReview?: boolean;
  wiki?: string; // enlace a artículo de Wikipedia (curado a mano o aceptado)
}

export const QUAKES: Quake[] = quakesJson as Quake[];

/* ---------------- helpers ---------------- */

export const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export const fmt = (n: number) => n.toLocaleString("es-ES");

export const fmtMoney = (m: number) => {
  if (m >= 1000) return `US$ ${(m / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} mil M`;
  return `US$ ${fmt(m)} M`;
};

export const dateShort = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]}`;
};

const _catalogSorted = [...QUAKES].sort((a, b) => a.date.localeCompare(b.date));
export const CATALOG_FIRST = dateShort(_catalogSorted[0].date);
export const CATALOG_LAST = dateShort(_catalogSorted[_catalogSorted.length - 1].date);

export const magColor = (m: number) => {
  if (m >= 8) return "#e23a62";
  if (m >= 7) return "#f0603c";
  if (m >= 6) return "#f59e42";
  if (m >= 5) return "#e8c14a";
  if (m >= 4) return "#3ec9a7";
  return "#6fb7c9";
};

export const mmiColor = (mmi: string) => {
  const map: Record<string, string> = {
    I: "#3ec9a7", II: "#3ec9a7", III: "#7fc96b", IV: "#b5c453",
    V: "#e8c14a", VI: "#f59e42", VII: "#f58242", VIII: "#f0603c",
    IX: "#e23a62", X: "#d22a70", XI: "#b81d78", XII: "#8f1170",
  };
  return map[mmi] ?? "#8fa3a0";
};

const ROMAN = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
];

export const toRoman = (n: number) => ROMAN[Math.max(0, Math.min(11, Math.round(n) - 1))];

export const depthClass = (d: number) =>
  d < 70 ? { label: "Superficial", color: "#f0603c" }
  : d <= 300 ? { label: "Intermedio", color: "#e8c14a" }
  : { label: "Profundo", color: "#3ec9a7" };

/* Energía radiada aproximada: log10(E J) = 1.5·M + 4.8 */
export const energyJoules = (m: number) => Math.pow(10, 1.5 * m + 4.8);
export const TNTtons = (m: number) => energyJoules(m) / 4.184e9;
export const HIROSHIMA_J = 6.3e13;

/* resumen mensual y anual derivado del catálogo (fuente única: quakes.json) */
const _monthTotals = (() => {
  const by = new Map<number, { events: number; deaths: number }>();
  for (const q of QUAKES) {
    const mo = Number(q.date.slice(5, 7));
    const cur = by.get(mo) ?? { events: 0, deaths: 0 };
    if (q.mag >= 6) cur.events += 1;
    cur.deaths += q.deaths || 0;
    by.set(mo, cur);
  }
  return by;
})();

export const MONTHLY = MONTHS_ES.map((m, i) => {
  const t = _monthTotals.get(i + 1) ?? { events: 0, deaths: 0 };
  return { m, events: t.events, deaths: t.deaths };
});

export const ANNUAL = {
  totalM4: 8462, // total global M4+ 2026 (referencia USGS, no derivable del catálogo)
  m7: QUAKES.filter((q) => q.mag >= 7).length,
  m6: QUAKES.filter((q) => q.mag >= 6 && q.mag < 7).length,
  deaths: QUAKES.reduce((s, q) => s + (q.deaths || 0), 0),
  costMEst: Math.round(QUAKES.reduce((s, q) => s + (q.costM || 0), 0)),
  period: `${CATALOG_FIRST.toUpperCase()} — ${CATALOG_LAST.toUpperCase()} 2026`,
};

export const MERCALLI: { g: string; label: string; desc: string }[] = [
  { g: "I", label: "Instrumental", desc: "Solo lo registran los sismógrafos." },
  { g: "II", label: "Débil", desc: "Lo perciben personas en reposo en pisos altos." },
  { g: "III", label: "Ligero", desc: "Vibración similar al paso de un camión." },
  { g: "IV", label: "Moderado", desc: "Tintinean vidrios y vajillas; crujen paredes." },
  { g: "V", label: "Algo fuerte", desc: "Se despierta a la gente; caen objetos." },
  { g: "VI", label: "Fuerte", desc: "Daños leves en edificios; difícil mantenerse en pie." },
  { g: "VII", label: "Mayor", desc: "Daños considerables en construcciones ordinarias." },
  { g: "VIII", label: "Severo", desc: "Daños graves; chimeneas y monumentos colapsan." },
  { g: "IX", label: "Catastrófico", desc: "Pánico general; destrucción de edificios comunes." },
  { g: "X", label: "Desastroso", desc: "Vías férreas deformadas; puentes destruidos." },
  { g: "XI", label: "Muy desastroso", desc: "Pocas estructuras permanecen en pie." },
  { g: "XII", label: "Cataclismo", desc: "Destrucción casi total; relieve alterado." },
];
