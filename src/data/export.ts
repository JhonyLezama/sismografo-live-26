import type { Quake } from "./quakes";
import type { LiveQuake } from "./usgs";
import { toast } from "../toast";

function download(name: string, content: string, mime: string) {
  saveBlob(new Blob([content], { type: mime }), name);
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const title =
    ext === "png" || ext === "svg"
      ? "Mapa exportado"
      : ext === "csv"
        ? name.startsWith("usgs-")
          ? "Feed en vivo exportado"
          : "Catálogo exportado"
        : ext === "geojson"
          ? "Datos exportados"
          : "Descarga lista";
  toast(title, name);
}

const esc = (v: string | number | boolean | null | undefined) => {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

export function exportCSV(rows: (string | number | boolean | null | undefined)[][]) {
  const body = rows.map((r) => r.map(esc).join(";")).join("\r\n");
  return "\uFEFF" + body;
}

export function downloadQuakesCSV(quakes: Quake[]) {
  const rows = [
    ["id", "fecha", "hora", "lugar", "pais", "region", "lat", "lon", "mag", "prof_km", "mmi", "mmi_label", "muertos", "heridos", "costo_usd_m", "tsunami"],
    ...quakes.map((q) => [
      q.id, q.date, q.time, q.place, q.country, q.region, q.lat, q.lon, q.mag, q.depth,
      q.mmi, q.mmiLabel, q.deaths, q.injured, q.costM ?? "", q.tsunami ? 1 : 0,
    ]),
  ];
  download(`sismografo-2026-${quakes.length}.csv`, exportCSV(rows), "text/csv;charset=utf-8");
}

export function downloadLiveCSV(quakes: LiveQuake[]) {
  const rows = [
    ["id", "fecha_epoch_ms", "lugar", "pais", "lat", "lon", "mag", "prof_km", "sig", "tsunami", "url"],
    ...quakes.map((q) => [
      q.id, q.time, q.place, q.country, q.lat, q.lon, q.mag, q.depth, q.sig, q.tsunami ? 1 : 0, q.url,
    ]),
  ];
  download(`usgs-en-vivo-${quakes.length}.csv`, exportCSV(rows), "text/csv;charset=utf-8");
}

export function downloadQuakesGeoJSON(quakes: Quake[]) {
  const gj = {
    type: "FeatureCollection",
    name: "sismografo-2026",
    features: quakes.map((q) => ({
      type: "Feature",
      properties: {
        id: q.id,
        date: q.date,
        time: q.time,
        place: q.place,
        country: q.country,
        region: q.region,
        mag: q.mag,
        depth: q.depth,
        mmi: q.mmi,
        deaths: q.deaths,
        injured: q.injured,
        costM: q.costM,
        tsunami: q.tsunami ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [q.lon, q.lat] },
    })),
  };
  download(`sismografo-2026-${quakes.length}.geojson`, JSON.stringify(gj), "application/geo+json");
}