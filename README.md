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
| Modelos | Catálogo **automático** por API (fallback a defaults) |
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

1. **Configurar API keys…** — pega keys (localStorage).
2. Prompt + archivos + proporción/duración.
3. **VIDRAMMING** → preview.
4. Export **MP4 ↓ 60fps** o **Imagen ↓** (PNG/JPEG/WebP).

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | `tsc -b && vite build` |
| `npm run typecheck` | Typecheck |

## Estructura

```
src/
  app-agnostic
  shared/     # types, lib (ApiError), ui (Button, Modal…)
  features/
    agent/      # OPENVG-AGENT runVidramming + skills en prompt
    generator/  # aspect, prompt, sandbox
    providers/  # 12 defs, chat, keys, modelCatalog
    assets/     # indexación vision+texto
    export/     # MP4 60 + stills + useExport
    history/    # IndexedDB
  platform/   # prefs
  state/      # useAppController
  ui/         # Sidebar, PreviewArea
```

## Notas

- Proxy de API solo en **dev** (`vite.config.ts`); producción necesita backend.
- Licencia Remotion: `acknowledgeRemotionLicense` en Player.
- Sandbox bloquea `fetch`, storage, eval, timers, `Math.random`, imports fuera de `react`/`remotion`.
