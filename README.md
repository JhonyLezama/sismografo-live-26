<div align="center">

<img src="public/icon-512.png" alt="Sismógrafo·26" width="120" height="120" />

# 📡 SISMÓGRAFO·26

Observatorio sísmico interactivo con el catálogo de terremotos de 2026 y la alimentación en vivo del **USGS**. Proyecto académico/visualización: mapa de epicentros (proyección Natural Earth), estadísticas, registro consultable, laboratorio de magnitudes y reproductor temporal.

**PWA instalable · funciona sin conexión**

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
| 📋 | **02 · Bitácora del año** | Registro completo con buscador (sin acentos), filtros por magnitud/región/mes/profundidad y exportación a CSV/GeoJSON. |
| ⚖️ | **02·B · Balance** | Contadores del año: eventos M4+, víctimas, sismos M7+, coste estimado y países afectados. |
| 🧪 | **03 · Cómo se mide** | Equivalencias de energía, réplicas de Mercalli, onda sísmica simulada y sliders de magnitud/profundidad. |
| 🎞️ | **04 · El año en movimiento** | Reproductor temporal que anima mes a mes los epicentros del catálogo local. |

- 🔗 **URL compartible**: `mag`, `region`, `month`, `modo` (local/live/both), `prof` y `zona` (área) se codifican en la URL.
- 🚀 **Rendimiento**: código dividido con `React.lazy`, mapa memoizado y arrastre/zoom sin re-render por frame en móvil.
- 📱 **PWA**: instalable desde móvil y escritorio con aviso inteligente (aparece al exportar, seleccionar en el mapa o en visitas recurrentes).
- 🎨 Diseño oscuro "observatorio" con `Anton` / `Space Grotesk` / `IBM Plex Mono`, revelado por scroll y soporte de `prefers-reduced-motion`.

## 🗂️ Estructura del proyecto

```
src/
├── App.tsx                    # layout, filtros, URL, alertas en vivo
├── hooks.ts                   # useMediaQuery, usePrefersReducedMotion, useInstallPrompt
├── installSignals.ts          # señales de interés para el aviso PWA
├── main.tsx                   # registro del service worker (producción)
├── index.css                  # tema Tailwind v4 + animaciones
├── components/
│   ├── WorldMap.tsx           # mapa d3-geo: epicentros, placas, selección, fullscreen
│   ├── InstallBanner.tsx      # aviso de instalación PWA
│   ├── BottomSheet.tsx        # hoja inferior para móvil
│   └── …                      # SidePanel, Registry, Balance, MagnitudeLab, YearPlayer…
└── data/
    ├── quakes.ts              # catálogo local 2026 (29 eventos)
    ├── usgs.ts                # cliente del feed USGS (fetch + caché offline)
    ├── export.ts              # CSV / GeoJSON / blobs
    └── plates.ts              # límites de placas tectónicas (PB2002)

public/
├── manifest.webmanifest       # manifest PWA (rutas relativas → subpath)
├── sw.js                      # service worker (cache-first assets, offline shell)
└── icon-*.png                 # iconos generados por scripts/gen-icons.mjs
```

## 🔄 Flujo de datos

```
┌──────────────┐     ┌──────────────────┐      ┌──────────────────┐
│  USGS GeoJSON │ ──► │  usgs.ts (fetch) │ ──►  │  LiveQuake[]      │
│  M≥4.5 (1h…30d) │     │  + caché offline │      │  (mapa + alertas) │
└──────────────┘     └──────────────────┘      └──────────────────┘

┌──────────────┐     ┌──────────────────┐      ┌──────────────────┐
│  quakes.ts    │ ──► │  filtros + URL   │ ──►  │  mapa / bitácora  │
│  2026 (29)    │     │  (mag, región…)  │      │  / balance / año  │
└──────────────┘     └──────────────────┘      └──────────────────┘
```

## 📦 Datos

- **Catálogo local 2026**: 29 eventos de referencia embebidos (`src/data/quakes.ts`).
- **USGS Earthquake Hazards Program**: feed GeoJSON de sismos M≥4.5 (`4.5_1h`, `4.5_24h`, `4.5_7d`, `4.5_30d`). Sin claves ni intermediarios. Dominio público.

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
```

## 🚀 Despliegue (GitHub Pages)

El workflow `.github/workflows/deploy.yml` compila con pnpm y publica `dist/` en la rama `gh-pages` automáticamente al hacer push a `main` (o con `workflow_dispatch`).

1. En el repositorio, activa **Settings → Pages → Source: Deploy from a branch** → `gh-pages`, carpeta `/`.
2. El sitio queda disponible en `https://<usuario>.github.io/<repo>/`.

## 📄 Licencia

Uso educativo/académico. Los datos de sismos del USGS son de dominio público.
