/*
 * update-catalog.mjs
 * Sincroniza el catálogo local (src/data/quakes.json) con los datos del USGS.
 *
 * Comportamiento:
 *  - AÑADE solo eventos del feed "significant" del USGS (curación humana posterior vía PR).
 *  - ACTUALIZA campos automáticos (mag, profundidad, MMI, tsunami, hora) de eventos
 *    ya existentes, emparejando por usgsId (con backfill FDSN si falta) o por
 *    proximidad (fecha + <60 km, mejor candidato único).
 *  - NUNCA toca campos curados: deaths, injured, costM, summary, plates, tag.
 *  - Los eventos nuevos quedan marcados con needsReview: true y se listan en
 *    data-update-report.md para revisión humana.
 *
 * Uso: node scripts/update-catalog.mjs [--dry-run] [--no-wiki] [--no-gdacs]
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QUI = path.join(ROOT, "src", "data", "quakes.json");
const REPORT_FILE = path.join(ROOT, "data-update-report.md");

const flags = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const withWiki = !flags.includes("--no-wiki");
const withGdacs = !flags.includes("--no-gdacs");

const USGS_SIGNIFICANT =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson";
const USGS_45 =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";
const FDSN =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=30&orderby=magnitude";

const MMI_LABEL = {
  I: "Ligero", II: "Ligero", III: "Ligero", IV: "Ligero", V: "Moderado",
  VI: "Fuerte", VII: "Mayor", VIII: "Severo",
  IX: "Catastrófico", X: "Catastrófico", XI: "Catastrófico", XII: "Catastrófico",
};

const COUNTRY_ISO = {
  Indonesia: "ID", "Japón": "JP", Japan: "JP", Filipinas: "PH", Philippines: "PH",
  China: "CN", "Estados Unidos": "US", "United States": "US", "México": "MX", Mexico: "MX",
  Chile: "CL", "Nueva Zelanda": "NZ", "New Zealand": "NZ", "Papúa Nueva Guinea": "PG",
  "Papua New Guinea": "PG", Vanuatu: "VU", Tonga: "TO", Fiyi: "FJ", Fiji: "FJ",
  Afganistán: "AF", Afghanistan: "AF", Pakistán: "PK", Pakistan: "PK", India: "IN",
  Tailandia: "TH", Thailand: "TH", Malasia: "MY", Malaysia: "MY", Rusia: "RU", Russia: "RU",
  Colombia: "CO", Venezuela: "VE", "Perú": "PE", Peru: "PE", Ecuador: "EC", Bolivia: "BO",
  Argentina: "AR", "Brasil": "BR", Brazil: "BR", Honduras: "HN", Guatemala: "GT",
  "El Salvador": "SV", Nicaragua: "NI", "Costa Rica": "CR", "Panamá": "PA", Panama: "PA",
  "Egipto": "EG", Egypt: "EG", Polonia: "PL", Poland: "PL", "Taiwán": "TW", Taiwan: "TW",
  "Grecia": "GR", Greece: "GR", Turquía: "TR", Turkey: "TR", "Irán": "IR", Iran: "IR",
  Italia: "IT", Italy: "IT", Alemania: "DE", Germany: "DE", Austria: "AT", "Suiza": "CH",
  "Reino Unido": "GB", "United Kingdom": "GB", "Francia": "FR", France: "FR",
  "Canadá": "CA", Canada: "CA", Australia: "AU", Aleutianas: "US", Alaska: "US",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function utcParts(ms) {
  const d = new Date(ms);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

function toRoman(n) {
  const table = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  let v = Math.max(0, Math.min(12, Math.round(n || 0)));
  while (v > 0) {
    const [d, sym] = table.find(([d]) => v >= d);
    out += sym;
    v -= d;
  }
  return out || "I";
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function regionFor(lat, lon) {
  if (lon >= -90 && lon <= -30 && lat >= -60 && lat <= 15) return "Sudamérica";
  if (lon >= -170 && lon <= -30 && lat >= 15 && lat <= 85) return "Norteamérica";
  if (lon >= -30 && lon <= 60 && lat >= 36 && lat <= 85) return "Europa";
  if (lon >= -25 && lon <= 55 && lat >= -40 && lat < 36) return "África";
  if (lon >= 40 && lon <= 180 && lat > -12 && lat < 55) return "Asia";
  if (lon >= 100 && lon <= 180 && lat <= -12) return "Oceanía";
  if (lon <= -150 && lat < -20) return "Oceanía";
  return lat < 0 ? "Oceanía" : "Asia";
}

function isoFor(place) {
  const last = place.split(",").map((s) => s.trim()).filter(Boolean).pop() || "";
  const match = Object.keys(COUNTRY_ISO).find(
    (k) => last === k || last.includes(k) || k.includes(last),
  );
  return match ? COUNTRY_ISO[match] : "";
}

async function fetchJson(url, label) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

async function fetchUsgsFeeds() {
  const feed = new Map(); // id -> feature (significativos + menores)
  const significant = new Set();
  let ok = 0;
  try {
    const gj = await fetchJson(USGS_SIGNIFICANT, "significant_month");
    ok++;
    for (const f of gj.features ?? []) {
      if (!f?.properties?.time) continue;
      feed.set(f.id, f);
      significant.add(f.id);
    }
  } catch (e) {
    console.warn(`[aviso] significant_month no disponible: ${e.message}`);
  }
  try {
    const gj = await fetchJson(USGS_45, "4.5_month");
    ok++;
    for (const f of gj.features ?? []) {
      if (!f?.properties?.time) continue;
      if (!feed.has(f.id)) feed.set(f.id, f);
    }
  } catch (e) {
    console.warn(`[aviso] 4.5_month no disponible: ${e.message}`);
  }
  if (ok === 0) throw new Error("USGS no disponible (todas las fuentes fallaron)");
  return { feed, significant };
}

/* ---------- GDACS (solo eventos sísmicos EQ) ---------- */

const GDACS_RSS = "https://www.gdacs.org/xml/rss_7d.xml";

function esc(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function rxTag(item, tag) {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? esc(m[1]).trim() : "";
}

function parseGdacsRss(text) {
  const items = text.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const alerts = [];
  for (const it of items) {
    if (rxTag(it, "gdacs:eventtype") !== "EQ") continue;
    const lat = parseFloat(rxTag(it, "geo:lat"));
    const lon = parseFloat(rxTag(it, "geo:long"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const popVal = it.match(/<gdacs:population[^>]*?value="([\d.]+)"/);
    const popUnit = it.match(/<gdacs:population[^>]*?unit="([^"]+)"/);
    alerts.push({
      eventid: rxTag(it, "gdacs:eventid"),
      eventtype: "EQ",
      alertlevel: rxTag(it, "gdacs:alertlevel"),
      title: rxTag(it, "title"),
      country: rxTag(it, "gdacs:country"),
      iso3: rxTag(it, "gdacs:iso3"),
      severity: rxTag(it, "gdacs:severity"),
      population: popVal ? parseFloat(popVal[1]) : 0,
      popUnit: popUnit ? popUnit[1] : "",
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
      pubDate: rxTag(it, "pubDate"),
      link: rxTag(it, "link"),
    });
  }
  return alerts;
}

async function fetchGdacsSnapshot() {
  const res = await fetch(GDACS_RSS, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`GDACS: HTTP ${res.status}`);
  return {
    updatedAt: new Date().toISOString(),
    alerts: parseGdacsRss(await res.text()),
  };
}

/* FDSN: buscar el evento USGS que corresponde a una entrada del catálogo sin usgsId */
async function fdsnSearch(entry) {
  const lo = Math.max(-180, entry.lon - 2);
  const hi = Math.min(180, entry.lon + 2);
  const la = Math.max(-90, entry.lat - 2);
  const hb = Math.min(90, entry.lat + 2);
  const d0 = new Date(entry.date + "T00:00:00Z");
  const d1 = new Date(d0.getTime() + 2 * 86400e3);
  const url =
    `${FDSN}&starttime=${d0.toISOString()}&endtime=${d1.toISOString()}` +
    `&minlatitude=${la}&maxlatitude=${hb}&minlongitude=${lo}&maxlongitude=${hi}`;
  try {
    const gj = await fetchJson(url, "fdsn");
    const cands = (gj.features ?? []).filter(
      (f) => f.properties?.time && f.geometry?.coordinates,
    );
    let best = null;
    let bestScore = Infinity;
    for (const f of cands) {
      const [lon, lat] = f.geometry.coordinates;
      const dist = haversineKm([lat, lon], [entry.lat, entry.lon]);
      if (dist > 60) continue;
      if (Math.abs((f.properties.mag ?? 0) - entry.mag) > 0.4) continue; // concordancia de magnitud
      const score = dist - (f.properties.mag ?? 0) * 1000; // más cerca y más grande gana
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  } catch {
    return null;
  }
}

function feedFields(f) {
  const [lon, lat, depth] = f.geometry.coordinates;
  const { date, time } = utcParts(f.properties.time);
  const mag = Math.round((f.properties.mag ?? 0) * 10) / 10;
  const deep = Math.round(depth ?? 0);
  const mmiNum = f.properties.mmi;
  const mmi = mmiNum ? toRoman(mmiNum) : null;
  return {
    date,
    time,
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    mag,
    depth: deep,
    mmi,
    tsunami: f.properties.tsunami === 1,
  };
}

function applyAutoFields(entry, fields) {
  entry.lat = fields.lat;
  entry.lon = fields.lon;
  entry.mag = fields.mag;
  entry.depth = fields.depth;
  entry.tsunami = fields.tsunami;
  if (fields.date) entry.date = fields.date;
  if (fields.time) entry.time = fields.time;
  if (fields.mmi) {
    entry.mmi = fields.mmi;
    entry.mmiLabel = MMI_LABEL[fields.mmi] ?? entry.mmiLabel;
  }
}

/* Diferencia de campos automáticos entre el catálogo y el feed (solo informe) */
function autoDiff(entry, fields) {
  const keys = ["date", "time", "lat", "lon", "mag", "depth", "mmi", "tsunami"];
  return keys
    .map((k) => (fields[k] == null ? null : [k, entry[k], fields[k]]))
    .filter((x) => x && JSON.stringify(x[1]) !== JSON.stringify(x[2]));
}

function buildEntry(f) {
  const [lon, lat, depth] = f.geometry.coordinates;
  const props = f.properties;
  const { date, time } = utcParts(props.time);
  const place = props.place ?? "Ubicación sin nombre";
  const mmiNum = props.mmi;
  const mmi = mmiNum ? toRoman(mmiNum) : "—";
  return {
    id: `us-${f.id}`,
    place,
    country: place.split(",").map((s) => s.trim()).filter(Boolean).pop() || "—",
    iso: isoFor(place),
    region: regionFor(lat, lon),
    date,
    time,
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    mag: Math.round((props.mag ?? 0) * 10) / 10,
    depth: Math.round(depth ?? 0),
    mmi,
    mmiLabel: MMI_LABEL[mmi] ?? "Sin datos",
    deaths: 0,
    injured: 0,
    costM: null,
    tsunami: props.tsunami === 1,
    plates: "Sin asignar",
    usgsId: f.id,
    needsReview: true,
    summary:
      `Evento añadido automáticamente desde el feed del USGS. ` +
      `Referencia: ${props.url ?? "https://earthquake.usgs.gov/earthquakes/"}. Pendiente de revisión.`,
  };
}

async function main() {
  const quakes = JSON.parse(fs.readFileSync(QUI, "utf8"));
  const added = [];
  const updated = [];
  const backfilled = [];
  const discrepancies = [];

  try {
    const { feed, significant } = await fetchUsgsFeeds();
    const assignedIds = new Set(); // usgsIds ya asignados a entradas del catálogo
    const consumed = new Set(); // usgsIds usados para emparejar (no reañadir)

    // 0) Reparación: si el usgsId de una entrada apunta a una réplica (no significante)
    //    pero existe un evento significante que coincide por fecha y proximidad, re-vincular.
    const repairs = [];
    for (const q of quakes) {
      if (!q.usgsId) continue;
      const cur = feed.get(q.usgsId);
      if (cur && significant.has(q.usgsId)) continue; // ya apunta al evento principal
      const best = [...feed.values()].find(
        (f) =>
          significant.has(f.id) &&
          f.id !== q.usgsId &&
          f.properties?.time &&
          f.geometry?.coordinates &&
          Math.abs((f.properties.mag ?? 0) - q.mag) <= 0.4 &&
          utcParts(f.properties.time).date === q.date &&
          haversineKm(
            [f.geometry.coordinates[1], f.geometry.coordinates[0]],
            [q.lat, q.lon],
          ) < 60,
      );
      if (best) {
        repairs.push({ id: q.id, from: q.usgsId, to: best.id });
        q.usgsId = best.id;
      }
    }

    // 1) Entradas con usgsId: si es auto-manejada (needsReview) se sincroniza con el feed;
    //    si está curada a mano, las diferencias se reportan pero NO se aplican.
    for (const q of quakes) {
      if (!q.usgsId) continue;
      assignedIds.add(q.usgsId);
      const f = feed.get(q.usgsId);
      if (!f) continue;
      consumed.add(f.id);
      const fields = feedFields(f);
      const dif = autoDiff(q, fields);
      if (!dif.length) continue;
      if (q.needsReview) {
        const prev = { ...q };
        applyAutoFields(q, fields);
        updated.push({
          id: q.id,
          dif: dif.map(([k, v]) => `${k}: ${prev[k]} → ${q[k]}`),
        });
      } else {
        discrepancies.push({
          id: q.id,
          dif: dif.map(([k, v]) => `${k}: ${v} → ${fields[k]}`),
        });
      }
    }

    // 2) Entradas sin usgsId: backfill FDSN (solo vincula el id, no toca campos curados)
    const byId = new Map(feed);
    for (const q of quakes) {
      if (q.usgsId) continue;
      let match = null;
      let from = null;
      const f = await fdsnSearch(q);
      if (f && !assignedIds.has(f.id)) {
        match = f;
        from = "fdsn";
      }
      if (!match) {
        // proximidad: mejor candidato del feed (más cerca, mismo día, misma magnitud)
        const cands = [...byId.values()]
          .filter((f) => f.properties?.time && f.geometry?.coordinates)
          .map((f) => {
            const [lon, lat] = f.geometry.coordinates;
            const { date } = utcParts(f.properties.time);
            return { f, date, dist: haversineKm([lat, lon], [q.lat, q.lon]) };
          })
          .filter(
            (c) =>
              c.date === q.date &&
              c.dist < 60 &&
              Math.abs((c.f.properties.mag ?? 0) - q.mag) <= 0.4 &&
              !assignedIds.has(c.f.id),
          )
          .sort((a, b) => a.dist - b.dist);
        if (cands.length) {
          match = cands[0].f;
          from = "proximity";
        }
      }
      if (match) {
        assignedIds.add(match.id);
        consumed.add(match.id);
        q.usgsId = match.id;
        backfilled.push({ id: q.id, usgsId: match.id, via: from });
      }
    }

    // 3) Eventos nuevos: solo del feed "significant", no emparejados
    for (const f of [...feed.values()]) {
      if (!significant.has(f.id)) continue;
      if (consumed.has(f.id) || assignedIds.has(f.id)) continue;
      const [lon, lat] = f.geometry.coordinates;
      const date = utcParts(f.properties.time).date;
      const cercaDeExistente = quakes.some(
        (q) => q.date === date && haversineKm([lat, lon], [q.lat, q.lon]) < 60,
      );
      if (cercaDeExistente) continue; // ya está representado en el catálogo
      const entry = buildEntry(f);
      added.push(entry);
      quakes.push(entry);
      assignedIds.add(f.id);
    }

    // 4) GDACS: snapshot de alertas sísmicas para public/gdacs.json (capa runtime)
    let gdacsReport = null;
    if (withGdacs) {
      try {
        const snap = await fetchGdacsSnapshot();
        const GDF = path.join(ROOT, "public", "gdacs.json");
        let prevAlerts = [];
        try {
          prevAlerts = JSON.parse(fs.readFileSync(GDF, "utf8")).alerts ?? [];
        } catch { /* primer run */ }
        const prevByLevel = new Map(prevAlerts.map((a) => [a.eventid, a.alertlevel]));
        if (JSON.stringify(prevAlerts) !== JSON.stringify(snap.alerts)) {
          if (!dryRun) {
            fs.mkdirSync(path.dirname(GDF), { recursive: true });
            fs.writeFileSync(GDF, JSON.stringify(snap, null, 2) + "\n");
          }
          gdacsReport = snap.alerts.filter(
            (a) => a.alertlevel === "Red" || a.alertlevel === "Orange",
          ).filter((a) => prevByLevel.get(a.eventid) !== a.alertlevel);
        }
      } catch (e) {
        console.warn(`[aviso] GDACS no disponible: ${e.message}`);
      }
    }

    if (added.length || updated.length || backfilled.length || discrepancies.length || repairs.length || gdacsReport) {
      const next = JSON.stringify(quakes, null, 2) + "\n";
      if (!dryRun) fs.writeFileSync(QUI, next);

      const L = [];
      L.push("# Resumen de actualización automática");
      L.push("");
      L.push(`Fecha: ${new Date().toISOString().slice(0, 10)} · ${dryRun ? "simulación (--dry-run)" : "aplicado"}`);
      L.push("");
      L.push(`## Nuevos eventos (${added.length})`);
      if (added.length) {
        for (const q of added) L.push(`- **M${q.mag}** · ${q.place} · ${q.date} · \`${q.id}\``);
      } else {
        L.push("Ninguno.");
      }
      L.push("");
      L.push(`## Reparaciones (${repairs.length})`);
      if (repairs.length) {
        for (const r of repairs) L.push(`- \`${r.id}\` · ${r.from} → ${r.to}`);
      } else {
        L.push("Ninguna.");
      }
      L.push("");
      L.push(`## Actualizados (${updated.length})`);
      if (updated.length) {
        for (const u of updated) L.push(`- \`${u.id}\` · ${u.dif.join(", ")}`);
      } else {
        L.push("Ninguno.");
      }
      L.push("");
      L.push(`## usgsId vinculados (${backfilled.length})`);
      if (backfilled.length) {
        for (const b of backfilled) L.push(`- \`${b.id}\` → ${b.usgsId} (${b.via})`);
      } else {
        L.push("Ninguno.");
      }
      L.push("");
      const unlinked = quakes.filter((q) => !q.usgsId);
      if (unlinked.length) {
        L.push(`## Sin vincular (sin coincidencia clara, requiere revisión) (${unlinked.length})`);
        for (const q of unlinked) L.push(`- \`${q.id}\` · M${q.mag} · ${q.place} · ${q.date}`);
        L.push("");
      }
      if (discrepancies.length) {
        L.push(`## Diferencias en eventos curados (solo aviso, NO aplicadas) (${discrepancies.length})`);
        for (const d of discrepancies) L.push(`- \`${d.id}\` · ${d.dif.join(", ")}`);
        L.push("");
      }
      if (gdacsReport && gdacsReport.length) {
        L.push(`## Alertas GDACS nuevas (Red/Orange) (${gdacsReport.length})`);
        for (const a of gdacsReport) {
          L.push(`- **${a.alertlevel}** · ${a.title} · ${a.country} · \`${a.eventid}\``);
        }
        L.push("");
      }
      const pending = quakes.filter((q) => q.needsReview);
      L.push(`## Pendientes de revisión (${pending.length})`);
      for (const q of pending) L.push(`- \`${q.id}\` · M${q.mag} · ${q.place} · ${q.date}`);
      L.push("");
      L.push("Los campos curados (fallecidos, heridos, costo, resumen, placas) y los campos manuales de eventos existentes no fueron modificados.");

      const text = L.join("\n") + "\n";
      if (!dryRun) fs.writeFileSync(REPORT_FILE, text);
      console.log(text);
      if (dryRun) console.log("(dry-run: no se escribieron archivos)");
    } else {
      console.log("Sin cambios: el catálogo ya está al día.");
    }
  } catch (e) {
    console.error("[error]", e.message);
    process.exitCode = 1;
  }
}

main();
