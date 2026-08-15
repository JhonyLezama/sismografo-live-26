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

export const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

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

export async function fetchLiveQuakes(): Promise<{
  quakes: LiveQuake[];
  updated: number;
}> {
  const res = await fetch(USGS_FEED_URL, { headers: { Accept: "application/json" } });
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
  return { quakes, updated: Date.now() };
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
