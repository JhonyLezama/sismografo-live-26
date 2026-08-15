/* Alimentación en vivo · EMSC (European-Mediterranean Seismological Centre)
   API pública sin clave: https://www.seismicportal.eu/fdsnws/event/1/
   Se usa como fuente alternativa/complementaria al feed USGS. */

import type { LiveQuake } from "./usgs";

export type LiveSource = "usgs" | "emsc" | "both";

const EMS_URL =
  "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=50&minmagnitude=4.5&orderby=time";

const CACHE_KEY = "sismografo-emsc-v1";

interface LiveCache {
  quakes: LiveQuake[];
  savedAt: number;
}

export function loadEmscCache(): LiveCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<LiveCache>;
    if (!Array.isArray(data.quakes) || typeof data.savedAt !== "number") return null;
    return { quakes: data.quakes, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

function saveEmscCache(quakes: LiveQuake[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ quakes, savedAt: Date.now() }));
  } catch {
    /* cuota llena o modo privado: se ignora */
  }
}

interface EmscFeature {
  properties: {
    source_id: string;
    time: string;
    lat: number;
    lon: number;
    depth: number;
    mag: number;
    flynn_region?: string;
    auth?: string;
  };
}

function cap(str: string): string {
  return str
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

export async function fetchEmscLive(): Promise<{
  quakes: LiveQuake[];
  updated: number;
  stale: boolean;
}> {
  try {
    const res = await fetch(EMS_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`EMSC respondió HTTP ${res.status}`);
    const gj = (await res.json()) as { features?: EmscFeature[] };
    const quakes: LiveQuake[] = (gj.features ?? [])
      .filter((f) => f.properties?.mag != null && f.properties?.lat != null && f.properties?.lon != null)
      .map((f) => {
        const p = f.properties;
        const region = (p.flynn_region ?? "").trim();
        const parts = region.split(",").map((s) => s.trim()).filter(Boolean);
        const last = parts[parts.length - 1] ?? "—";
        return {
          id: `emsc-${p.source_id}`,
          mag: p.mag,
          place: region ? cap(region) : "Ubicación sin nombre",
          country: last.toUpperCase(),
          lat: p.lat,
          lon: p.lon,
          depth: Math.round(p.depth ?? 0),
          time: Date.parse(p.time) || 0,
          tsunami: false,
          sig: 0,
          url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${p.source_id}`,
        };
      })
      .sort((a, b) => b.time - a.time);
    saveEmscCache(quakes);
    return { quakes, updated: Date.now(), stale: false };
  } catch (err) {
    const cached = loadEmscCache();
    if (cached) return { quakes: cached.quakes, updated: cached.savedAt, stale: true };
    throw err;
  }
}

/* Dedupe al combinar USGS + EMSC: mismo sismo si tiempo muy cercano y
   epicentros/magnitudes compatibles. */
export function mergeSources(usgs: LiveQuake[], emsc: LiveQuake[]): LiveQuake[] {
  const out: LiveQuake[] = [...usgs];
  for (const e of emsc) {
    let dup = false;
    for (const u of usgs) {
      const dt = Math.abs(u.time - e.time) / 60000;
      const dLat = Math.abs(u.lat - e.lat);
      const dLon = Math.abs(u.lon - e.lon);
      if (dt <= 3 && dLat <= 0.5 && dLon <= 0.5) {
        dup = true;
        break;
      }
    }
    if (!dup) out.push(e);
  }
  return out.sort((a, b) => b.time - a.time);
}
