import type { AssetFile, GenerateRequest } from '../../shared/types';
import { FPS_FIXED } from '../../shared/types';
import { buildMeta } from './aspect';

export const SKILL_FRONTEND_PRO = `
## Skill: frontend-pro
Diseña composiciones con jerarquía visual clara (título/subtítulo/cuerpo), tipografía con contraste WCAG, espaciado de 8pt, alineación a grid y estados de entrada/salida elegantes. Prioriza legibilidad a cualquier resolución de la proporción pedida.`;

export const SKILL_MOTION_ENV = `
## Skill: motion-env
Anime entornos visuales: reveals por stagger, parallax sutil, gradientes que respiran, partículas deterministas derivadas del frame, micro-interacciones de escala/opacidad. Usa interpolate/spring de Remotion. Nunca Math.random(); ruido: const n = (Math.sin(frame * 12.9898 + seed) * 43758.5453) % 1;`;

export const SKILL_METHOD_OPENVG = `
## Skill: method-openvg
Método de trabajo Open VG:
1. Analiza el prompt y los archivos indexados (si los hay).
2. Planifica la línea de tiempo (entrada → clímax → salida) respetando durationInFrames exactos.
3. Genera UN archivo TSX autocontenido con meta exacto y export default.
4. Raíz AbsoluteFill; sin hooks de estado para la animación principal; sin efectos de nivel superior.
5. FPS fijos a ${FPS_FIXED}. Solo importa "react" y "remotion".
6. Si hay imágenes indexadas, referéncialas visualmente (formas/paleta) o usa SVG inline inspirado en ellas; no hagas fetch.
7. Devuelve SOLO el bloque \`\`\`tsx.`;

export function buildSystemPrompt(assets: AssetFile[]): string {
  const assetList =
    assets.length === 0
      ? 'No hay archivos indexados.'
      : assets.map((a) => `- ${a.name} (${a.kind}, ${a.mime})`).join('\n');

  return `Eres OPENVG-AGENT, el motor de composiciones de Open Vidramming (Open VG).
Trabajas en entorno de código nativo: generas TypeScript/TSX estilo Remotion que se compila y exporta en el navegador.

# Skills del agente
${SKILL_FRONTEND_PRO}
${SKILL_MOTION_ENV}
${SKILL_METHOD_OPENVG}

# Archivos indexados por el usuario
${assetList}

# Reglas duras
- Devuelve SOLO un bloque \`\`\`tsx.
- export default componente + export const meta con width/height/fps/durationInFrames EXACTOS.
- fps SIEMPRE ${FPS_FIXED}.
- Módulos permitidos: "react", "remotion". Nada más.
- Prohibido: fetch, XMLHttpRequest, localStorage, eval, import dinámico, assets remotos, setInterval/setTimeout/Date.now/Math.random en render.
- Textos de la animación en español salvo que el prompt pida otro idioma.
- Si el proveedor no soporta visión, describe con formas lo que aportan las imágenes indexadas.`;
}

export function buildUserPrompt(req: GenerateRequest, assets: AssetFile[]): string {
  const meta = buildMeta(req);
  const assetNotes = assets
    .filter((a) => a.kind === 'text')
    .map((a) => `\n### Archivo indexado: ${a.name}\n\`\`\`\n${a.data.slice(0, 8000)}\n\`\`\``)
    .join('\n');

  return [
    `Parámetros OBLIGATORIOS de la composición:`,
    `- Proporción: ${req.aspect}`,
    `- Ancho: ${meta.width}px`,
    `- Alto: ${meta.height}px`,
    `- FPS: ${meta.fps} (fijo)`,
    `- Duración: ${req.durationSec}s = ${meta.durationInFrames} frames`,
    ``,
    `Prompt del usuario:`,
    req.prompt.trim() || '(mejora visual de los archivos indexados)',
    assetNotes,
    ``,
    `Recuerda: solo el bloque de código tsx.`,
  ].join('\n');
}

/** User text-only prompt part; images go as multimodal parts in the agent. */
export function userTextContent(req: GenerateRequest, assets: AssetFile[]): string {
  return buildUserPrompt(req, assets);
}
