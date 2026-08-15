/* Capa GDACS (alerta temprana de desastres de la UE).
 * Los datos los genera scripts/update-catalog.mjs en public/gdacs.json
 * (refrescado a diario por el workflow de datos) y se cargan en tiempo de
 * ejecución para no depender del bundle. */

export interface GdacsAlert {
  eventid: string;
  eventtype: string;
  alertlevel: string; // "Green" | "Orange" | "Red"
  title: string;
  country: string;
  iso3: string;
  severity: string;
  population: number;
  popUnit: string;
  lat: number;
  lon: number;
  pubDate: string;
  link: string;
}

export interface GdacsSnapshot {
  updatedAt: string;
  alerts: GdacsAlert[];
}

let cache: GdacsAlert[] | null = null;
let pending: Promise<GdacsAlert[]> | null = null;

export function loadGdacs(): Promise<GdacsAlert[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}gdacs.json`, {
          cache: "no-cache",
        });
        if (!res.ok) throw new Error(`gdacs.json HTTP ${res.status}`);
        const snap = (await res.json()) as GdacsSnapshot;
        cache = snap.alerts ?? [];
      } catch {
        cache = [];
      }
      return cache;
    })();
  }
  return pending;
}

export const gdacsColor = (level: string) =>
  level === "Red" ? "#e23a62" : level === "Orange" ? "#f59e42" : "#3ec9a7";

export const gdacsLabel = (level: string) =>
  level === "Red" ? "Alerta roja" : level === "Orange" ? "Alerta naranja" : "Alerta verde";
