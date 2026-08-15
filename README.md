<div align="center">

<img src="public/icon-512.png" alt="Sismógrafo·26" width="120" height="120" />

# 📡 SISMÓGRAFO·26

Observatorio sísmico interactivo con el catálogo de terremotos de 2026 y la alimentación en vivo del **USGS**. Proyecto académico/visualización: mapa de epicentros (proyección Natural Earth), estadísticas, registro consultable, laboratorio de magnitudes y reproductor temporal.

**PWA instalable · funciona sin conexión**

👨‍💻 **Desarrollado por [SysJoL](https://sysjol.onrender.com/)**

[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io)
[![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://developer.mozilla.org/es/docs/Web/Progressive_web_apps)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-222222?style=for-the-badge&logo=githubpages&logoColor=white)](https://jhonylezama.github.io/sismografo-live-26/)

</div>

---

## ✨ Características

| | Sección | Descripción |
| --- | --- | --- |
| 🗺️ | **01 · El mapa del temblor** | Proyección Natural Earth, zoom y arrastre, marcadores con tamaño/color según magnitud Mw, capas `Local 2026 · USGS En vivo · Ambas`, selección de área arrastrando sobre el mapa y exportación a **PNG/SVG** (9:16 en móvil). |
| 📡 | **01·B · Pulso en tiempo real** | Sismos M≥4.5 de una ventana configurable (1 h · 24 h · 7 d · 30 d), actualización cada 5 min, caché offline y **alertas** de eventos nuevos M≥6 con sonido opcional (persistido en `localStorage`). |
| 🚨 | **01·C · Capa GDACS** | Alertas sísmicas del centro europeo de alertas (GDACS): los eventos **Red/Orange** se marcan en el mapa con pulso y leyenda propia; el snapshot se refresca a diario por el workflow de datos. |
| 📋 | **02 · Bitácora del año** | Registro completo con buscador (sin acentos), filtros por magnitud/región/mes/profundidad y exportación a CSV/GeoJSON. |
| ⚖️ | **02·B · Balance** | Contadores del año: eventos M4+, víctimas, sismos M7+, coste estimado y países afectados. |
| 🧪 | **03 · Cómo se mide** | Equivalencias de energía, réplicas de Mercalli, onda sísmica simulada y sliders de magnitud/profundidad. |
| 🎞️ | **04 · El año en movimiento** | Reproductor temporal que anima mes a mes los epicentros del catálogo local. |

- 🔗 **URL compartible**: `mag`, `region`, `month`, `modo` (local/live/both), `prof` y `zona` (área) se codifican en la URL.
- 📊 **PAGER en la ficha**: al abrir un evento del catálogo, se consulta el detalle USGS y se muestra la estimación de impacto PAGER (nivel, CDI percibida, testigos, tsunami).
- 📚 **Sugerencias de Wikipedia**: el workflow de datos propone enlaces a artículos; en la ficha puedes **Aceptar/Descartar** cada sugerencia (recuerdo persistido en `localStorage`).
- 🚀 **Rendimiento**: código dividido con `React.lazy`, mapa memoizado y arrastre/zoom sin re-render por frame en móvil.
- 📱 **PWA**: instalable desde móvil y escritorio con aviso inteligente (aparece al exportar, seleccionar en el mapa o en visitas recurrentes).
- 🎨 Diseño oscuro "observatorio" con `Anton` / `Space Grotesk` / `IBM Plex Mono`, revelado por scroll y soporte de `prefers-reduced-motion`.

## 🗂️ Estructura del proyecto

```
src/
├── App.tsx                    # layout, filtros, URL, alertas en vivo, capa GDACS
├── hooks.ts                   # useMediaQuery, usePrefersReducedMotion, useInstallPrompt
├── installSignals.ts          # señales de interés para el aviso PWA
├── main.tsx                   # registro del service worker (producción)
├── index.css                  # tema Tailwind v4 + animaciones
├── components/
│   ├── WorldMap.tsx           # mapa d3-geo: epicentros, placas, GDACS, selección, fullscreen
│   ├── InstallBanner.tsx      # aviso de instalación PWA
│   ├── BottomSheet.tsx        # hoja inferior para móvil
│   └── …                      # SidePanel, Registry, Balance, MagnitudeLab, YearPlayer…
└── data/
    ├── quakes.json            # catálogo 2026 (28 eventos, curado) + vínculos USGS
    ├── quakes.ts              # interfaz del catálogo y helpers
    ├── usgs.ts                # cliente del feed USGS (fetch + caché offline) + detalle PAGER
    ├── gdacs.ts               # cliente de la capa GDACS (snapshot público)
    ├── wikiSuggest.ts         # sugerencias de Wikipedia + flujo Aceptar/Descartar
    ├── export.ts              # CSV / GeoJSON / blobs
    └── plates.ts              # límites de placas tectónicas (PB2002)

scripts/
└── update-catalog.mjs         # sincronización diaria USGS/GDACS/Wikipedia (con --dry-run)

public/
├── manifest.webmanifest       # manifest PWA (rutas relativas → subpath)
├── sw.js                      # service worker (cache-first assets, offline shell)
├── gdacs.json                 # snapshot GDACS EQ (Red/Orange/Green) generado por el script
├── wikipedia-suggestions.json # enlaces propuestos por el script
└── icon-*.png                 # iconos generados por scripts/gen-icons.mjs
```

## 🔄 Flujo de datos

```
┌──────────────┐     ┌──────────────────┐      ┌──────────────────┐
│  USGS GeoJSON │ ──► │  usgs.ts (fetch) │ ──►  │  LiveQuake[]      │
│  M≥4.5 (1h…30d) │     │  + caché offline │      │  (mapa + alertas) │
└──────────────┘     └──────────────────┘      └──────────────────┘
      detalle (PAGER) ──► ficha del evento (nivel, CDI, testigos)

┌──────────────┐     ┌──────────────────┐      ┌──────────────────┐
│  quakes.json  │ ──► │  filtros + URL   │ ──►  │  mapa / bitácora  │
│  2026 (28)    │     │  (mag, región…)  │      │  / balance / año  │
└──────────────┘     └──────────────────┘      └──────────────────┘
      ▲                      ▲
      │ update-catalog.mjs (diario, vía GitHub Actions)
      │ USGS (backfill/vínculos) · GDACS (snapshot) · Wikipedia (sugerencias)
      │ — los campos curados nunca se sobrescriben —
┌──────────────┐     ┌──────────────────┐      ┌──────────────────┐
│  gdacs.json   │ ──► │  gdacs.ts (fetch)│ ──►  │  capa GDACS map   │
│ (Red/Orange/…) │     │  + caché         │      │  (Red/Orange)     │
└──────────────┘     └──────────────────┘      └──────────────────┘
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ wikipedia-       │──►│  wikiSuggest.ts  │──►│  ficha · banner   │
│ suggestions.json │  │  (Aceptar/…     │  │  (Aceptar/Descartar│
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## 🔄 Sincronización automática del catálogo

El workflow `.github/workflows/data-update.yml` corre cada día (00:03 UTC, con `workflow_dispatch` manual) y ejecuta `pnpm data:update`. Con `scripts/update-catalog.mjs`:

1. **USGS** — empareja cada evento con su ficha oficial (`usgsId`), actualiza solo los marcados como `needsReview`, detecta réplicas mal vinculadas y las repara, y propone **eventos nuevos** del feed *significant* (M6+).
2. **GDACS** — descarga el RSS de alertas sísmicas, escribe `public/gdacs.json` (solo si cambia) y lista las alertas Red/Orange nuevas.
3. **Wikipedia** — busca artículos en español para eventos sin enlace y añade sugerencias a `public/wikipedia-suggestions.json`.

Los campos **curados a mano** (fallecidos, heridos, coste, resumen, placas, tag) y los campos manuales **nunca se sobrescriben**: si el USGS difiere, la diferencia se *reporta* sin aplicarse. El resultado llega como **pull request** a `data/update-catalog` para que la revises y lo fusiones tú (flujo "solo sugiero, tú apruebas"). El reporte de cada corrida se escribe en `data-update-report.md` (ignorado por git).

## 📦 Datos

- **Catálogo local 2026**: 28 eventos de referencia en `src/data/quakes.json`, del **2 Ene al 14 Ago 2026** (22 vinculados a su ficha USGS). Es un catálogo **curado** (víctimas, coste, MMI, resumen) y el script de datos solo lo enriquece: nunca sobrescribe lo curado a mano. Lo que se actualiza día a día es el **feed en vivo del USGS** y los snapshots de **GDACS** y **Wikipedia**.
- **USGS Earthquake Hazards Program**: feed GeoJSON de sismos M≥4.5 (`4.5_1h`, `4.5_24h`, `4.5_7d`, `4.5_30d`) y detalle por evento (PAGER). Sin claves ni intermediarios. Dominio público.
- **GDACS (JRC UE)**: RSS semanal de alertas por tipo de desastre; aquí se usan los sísmicos (`EQ`) para marcar en el mapa las alertas Red/Orange.
- **Wikipedia (es)**: la sincronización consulta la API pública (`action=query`) solo para *proponer* enlaces; la aceptación la haces tú en la ficha del evento.

## 🖥️ PWA e instalación

- **Manifest** + **service worker** con rutas relativas al scope, para servir correctamente bajo subpath (GitHub Pages).
- Estrategia: cache-first para `assets/` (hasheados) y network-first para navegación con volcado a caché.
- El **aviso de instalación** es inteligente: aparece al exportar el mapa, al seleccionar un sismo en el mapa o en visitas recurrentes (más rápido que la primera visita), con tope de 3 muestras por navegador.

## 🛠️ Desarrollo

```bash
pnpm install
pnpm dev              # servidor de desarrollo (http://localhost:3000)
pnpm typecheck        # verificación de tipos
pnpm build            # compilación a dist/

pnpm data:update      # sincronización USGS/GDACS/Wikipedia (escribe snapshots)
pnpm data:update:dry  # simulación sin escribir archivos
node scripts/update-catalog.mjs --no-wiki --no-gdacs   # solo USGS
```

## 🚀 Despliegue (GitHub Pages)

El workflow `.github/workflows/deploy.yml` compila con pnpm y publica `dist/` en la rama `gh-pages` automáticamente al hacer push a `main` (o con `workflow_dispatch`). El workflow `.github/workflows/data-update.yml` actualiza el catálogo y los snapshots cada día y abre un PR para que revises los cambios.

1. En el repositorio, activa **Settings → Pages → Source: Deploy from a branch** → `gh-pages`, carpeta `/`.
2. El sitio queda disponible en `https://<usuario>.github.io/<repo>/`.

## 📄 Licencia

Uso educativo/académico. Los datos de sismos del USGS son de dominio público.
