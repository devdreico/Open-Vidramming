# Open Vidramming (Open VG)

**Video programming con IA** — escribe un prompt, indexa archivos, elige proporción y pulsa **VIDRAMMING**. El agente oculto **OPENVG-AGENT** arma skills de frontend/motion, envía todo al LLM y devuelve una composición Remotion compilada en el navegador.

## Spec de producto (v0.2)

| Regla | Valor |
|-------|--------|
| Video export | **Solo MP4**, **60 fps fijo** (inmodificable) |
| Imagen export | **PNG · JPEG · WebP** del frame actual |
| Proporciones | **1:1 · 16:9 · 9:16 · 4:5** (dropdown en preview, antes de VIDRAMMING) |
| UI | Fondo **blanco puro**, glassmorphism, botones `rounded-full` |
| Agente | **OPENVG-AGENT** — oculto, solo badge + orquestación |
| Archivos | Imágenes vision (PNG/JPEG/WebP) + texto/código indexables |
| Modelos | Catálogo **automático** por API → fallback **models.dev** → defaults |
| Proveedores | 12 vía proxy Vite `/api/llm/:provider` (incl. **Google AI Studio**) |

### Google AI Studio (Gemini)

1. Crea una API key en [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. En la app: **Configurar API keys** → pega la key en **Google AI Studio (Gemini)**
3. **Probar conexión API** → debe decir «conexión correcta ✓»
4. El catálogo de modelos se carga automáticamente desde la API Gemini

## Stack

Vite · React 18 · TypeScript · Tailwind · `@remotion/player` · Sucrase · ffmpeg.wasm · WebCodecs no (solo MP4)

## Uso

```bash
npm install
npm run dev
```

1. **Conectar proveedor…** — wizard en 3 pasos (proveedor → API key → modelo). Las keys se guardan en `localStorage`.
2. Prompt + archivos + proporción/duración.
3. **VIDRAMMING** → preview.
4. Export **MP4 ↓ 60fps** o **Imagen ↓** (PNG/JPEG/WebP).

## Catálogo de modelos

Orden de fuentes, por proveedor:

1. **API del proveedor** — `GET /models` con tu key (catálogo real de tu cuenta). Se refresca al montar, al cambiar de proveedor, al guardar/borrar una key, al probar la conexión y con **↻**.
2. **models.dev** — registro público (`https://models.dev/api.json`, CORS `*`) usado cuando no hay key o el `/models` falla; solo se persiste el subconjunto de nuestros 12 proveedores (`openvg.modelsDev.v1`, TTL 7 días).
3. **Defaults locales** — la lista embebida de `definitions.ts`.

El cache del `/models` es **por proveedor** (`openvg.modelCatalog.v3`, TTL 1 h) con *stale-while-revalidate*: los datos vencidos se siguen mostrando y el fallo se deja visible (badge `⚠` + **Reintentar**) en vez de ocultarse. La fuente activa se muestra en el campo Modelo (`vía API` / `models.dev` / `lista local`).

## Conexión (estilo `/connect`)

**Conectar proveedor…** abre un wizard de 3 pasos equivalente al `/connect` de opencode:

1. **Proveedor** — buscador + estado (`Conectado ✓` / `Sin key`) y nº de modelos.
2. **API key** — enlace para crear la key, input con mostrar/ocultar, **Probar conexión** (usa `testConnection`) y **Guardar**. Borrar la key limpia también su catálogo cacheado.
3. **Modelo** — buscador con badge de origen, `visión` (modelos multimodales según models.dev) y selección del modelo a usar.

> OAuth / device-flow (Claude Pro, Copilot…) no es factible en una SPA sin backend (CORS + client secret): se cubre con enlace a la consola del proveedor + key manual.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | `tsc -b && vite build` |
| `npm run typecheck` | Typecheck |
| `npm run lint` | ESLint (`eslint .`) |
| `npm run test` | Vitest (7 archivos, 54 tests) |
| `npm run check` | typecheck + lint + test + build (todo en verde) |

## Estructura

```
src/
  app-agnostic
  shared/     # types, lib (ApiError), ui (Button, Modal…)
  features/
    agent/      # OPENVG-AGENT runVidramming + skills en prompt
    generator/  # aspect, prompt, sandbox
    providers/  # 12 defs, chat, keys, modelCatalog, modelsDev, useModelCatalog
    assets/     # indexación vision+texto
    export/     # MP4 60 + stills + useExport
    history/    # IndexedDB
  platform/   # prefs
  state/      # useAppController
  ui/         # Sidebar, PreviewArea, ConnectModal
```

## Notas

- Proxy de API solo en **dev** (`vite.config.ts`); producción necesita backend.
- Licencia Remotion: `acknowledgeRemotionLicense` en Player.
- Sandbox bloquea `fetch`, storage, eval, timers, `Math.random`, imports fuera de `react`/`remotion`.
- **Deuda pendiente (C1)**: la validación del código del modelo sigue con *blacklist* en el **hilo principal** (esbuild sincrónico); el aislamiento real en Worker queda para una fase posterior.
- Cancelación: **Cancelar generación** (preview) y **Cancelar export** abortan vía `AbortController`; el 429 respeta `Retry-After` y los errores transitorios hacen backoff (máx. 3 intentos).
