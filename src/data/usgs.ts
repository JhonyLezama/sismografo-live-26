/* Alimentación en vivo · USGS Earthquake Hazards Program (gratuita, sin clave)
   https://earthquake.usgs.gov/earthquakes/feed/v1.0/ */

export interface LiveQuake {
  id: string;
  mag: number;
  place: string;
  country: string;
  lat: number;
  lon: number;
  depth: number;
  time: number; // epoch ms (UTC)
  tsunami: boolean;
  sig: number;
  url: string;
}

export type LiveWindow = "hour" | "day" | "week" | "month";

export const USGS_WINDOWS: { key: LiveWindow; label: string; days: string }[] = [
  { key: "hour", label: "1h", days: "1 hora" },
  { key: "day", label: "24h", days: "24 h" },
  { key: "week", label: "7d", days: "7 días" },
  { key: "month", label: "30d", days: "30 días" },
];

export function feedUrl(w: LiveWindow): string {
  return `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_${w}.geojson`;
}

const CACHE_KEY = (w: LiveWindow) => `sismografo-usgs-v1-${w}`;

interface LiveCache {
  quakes: LiveQuake[];
  savedAt: number;
}

export function loadLiveCache(w: LiveWindow): LiveCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(w));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<LiveCache>;
    if (!Array.isArray(data.quakes) || typeof data.savedAt !== "number") return null;
    if (!data.quakes.every((q) => q && typeof q.id === "string" && typeof q.mag === "number")) return null;
    return { quakes: data.quakes, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

function saveLiveCache(w: LiveWindow, quakes: LiveQuake[]) {
  try {
    localStorage.setItem(CACHE_KEY(w), JSON.stringify({ quakes, savedAt: Date.now() }));
  } catch {
    /* cuota llena o modo privado: se ignora */
  }
}

interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    tsunami: number;
    sig: number;
    url: string;
  };
  geometry: { coordinates: [number, number, number] };
}

export async function fetchLiveQuakes(w: LiveWindow): Promise<{
  quakes: LiveQuake[];
  updated: number;
  stale: boolean;
}> {
  try {
    const res = await fetch(feedUrl(w), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`USGS respondió HTTP ${res.status}`);
    const gj = (await res.json()) as { features?: UsgsFeature[] };
    const quakes: LiveQuake[] = (gj.features ?? [])
      .filter((f) => f.geometry?.coordinates && f.properties?.mag !== null)
      .map((f) => {
        const [lon, lat, depth] = f.geometry.coordinates;
        const place = f.properties.place ?? "Ubicación sin nombre";
        const parts = place.split(",").map((s) => s.trim());
        return {
          id: f.id,
          mag: f.properties.mag ?? 0,
          place,
          country: parts.length > 1 ? parts[parts.length - 1] : "—",
          lat,
          lon,
          depth: Math.round(depth ?? 0),
          time: f.properties.time,
          tsunami: f.properties.tsunami === 1,
          sig: f.properties.sig ?? 0,
          url: f.properties.url ?? "https://earthquake.usgs.gov/earthquakes/",
        };
      })
      .sort((a, b) => b.time - a.time);
    saveLiveCache(w, quakes);
    return { quakes, updated: Date.now(), stale: false };
  } catch (err) {
    const cached = loadLiveCache(w);
    if (cached) return { quakes: cached.quakes, updated: cached.savedAt, stale: true };
    throw err;
  }
}

export function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "hace instantes";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export function fmtUtc(ts: number): string {
  const dt = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${p(dt.getUTCDate())} ${meses[dt.getUTCMonth()]} · ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())} UTC`;
}
