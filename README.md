# sismografo-live-26

Observatorio sísmico interactivo con el catálogo de terremotos de 2026 y la alimentación en vivo del USGS. Proyecto académico/visualización que combina un mapa de epicentros (proyección Natural Earth), estadísticas, registro consultable, laboratorio de magnitudes y un reproductor temporal.

## Características

- **Mapa interactivo** (`01 · El mapa del temblor`): proyección Natural Earth, zoom y arrastre, marcadores con tamaño/color según magnitud Mw, capas `Local 2026 · USGS En vivo · Ambas`, selección de área arrastrando sobre el mapa y exportación a **PNG/SVG**.
- **Feed en vivo del USGS** (`01·B · Pulso en tiempo real`): sismos M≥4.5 de una ventana configurable (1 h · 24 h · 7 días · 30 días), actualización automática cada 5 min, caché offline y **alertas** de eventos nuevos M≥6 con sonido opcional (persistido en `localStorage`).
- **Registro 2026** (`02`): tabla fluida con buscador (sin acentos), filtros de magnitud/región/mes/profundidad y exportación a CSV.
- **Laboratorio de magnitudes** (`03 · Cómo se mide`): equivalencias de energía, réplicas de Mercalli, onda sísmica simulada y sliders de magnitud/profundidad.
- **Reproductor del año 2026** (`04`): anima mes a mes los epicentros del catálogo local.
- **URL compartible**: `mag`, `region`, `month`, `modo` (local/live/both), `prof` y `zona` (área) se codifican en la URL.
- Diseño oscuro "observatorio" con fuente `Anton` / `Space Grotesk` / `IBM Plex Mono`, revelado por scroll y motion preferido reducido soportado.

## Tecnologías

- **React 18** + **TypeScript**
- **Vite 6**
- **Tailwind CSS 4**
- **pnpm** (`.npmrc` con `ignore-scripts=true` por seguridad)

## Datos

- **Catálogo local 2026**: 28 eventos de referencia embebidos (`src/data/quakes.ts`).
- **USGS Earthquake Hazards Program**: feed GeoJSON de sismos M≥4.5 (`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson` y variantes 1 h / 24 h / 30 días). Sin claves ni intermediarios.

## Desarrollo

```bash
pnpm install
pnpm dev --port 3001      # servidor de desarrollo
pnpm typecheck            # verificación de tipos
pnpm build                # compilación a dist/
```

## Capturas de pantalla

*(Pendiente — añadir imágenes aquí.)*

## Licencia

Uso educativo/académico. Los datos de sismos del USGS son de dominio público.