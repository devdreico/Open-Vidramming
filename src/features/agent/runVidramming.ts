import type { AssetFile, GenerateRequest, LlmMessage } from '../../shared/types';
import { isFatalApiError, isTransientApiError, toErrorMessage } from '../../shared/lib/errors';
import { buildMeta } from '../generator/aspect';
import { buildSystemPrompt, userTextContent } from '../generator/prompt';
import { compileComposition, type CompiledComposition } from '../generator/sandbox';
import { chatCompletion } from '../providers/chat';
import { providerById } from '../providers/definitions';
import { splitDataUri } from '../assets/assetsStore';

export interface VidrammingResult extends CompiledComposition {
  attempts: number;
  assetNames: string[];
}

export async function runVidramming(
  req: GenerateRequest,
  assets: AssetFile[],
  onStatus?: (msg: string) => void,
): Promise<VidrammingResult> {
  if (!req.prompt.trim() && assets.length === 0) {
    throw new Error('Escribe un prompt o indexa al menos un archivo para Vidramming.');
  }

  const fallbackMeta = buildMeta(req);
  const provider = providerById(req.providerId);
  const images = assets.filter((a) => a.kind === 'image');
  const useVision = provider.supportsVision && images.length > 0;

  if (images.length > 0 && !provider.supportsVision) {
    onStatus?.('Proveedor sin visión — assets de imagen se referenciarán por nombre…');
  }

  const imageParts = useVision
    ? images.flatMap((img) => {
        try {
          const { mediaType, dataBase64 } = splitDataUri(img.data);
          return [{ type: 'image' as const, mediaType, dataBase64 }];
        } catch {
          return [];
        }
      })
    : [];

  const userText = userTextContent(req, assets);
  const userContent: LlmMessage['content'] =
    imageParts.length > 0 ? [{ type: 'text', text: userText }, ...imageParts] : userText;

  const messages: LlmMessage[] = [
    { role: 'system', content: buildSystemPrompt(assets) },
    { role: 'user', content: userContent },
  ];

  const maxAttempts = 3;
  let lastError = 'Error desconocido';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onStatus?.(
      attempt === 1
        ? 'OPENVG-AGENT · enviando skills + archivos al modelo…'
        : `OPENVG-AGENT · reintento ${attempt}/${maxAttempts} — corrigiendo…`,
    );

    let raw: string;
    try {
      raw = await chatCompletion(req.providerId, req.model, messages);
    } catch (e) {
      lastError = toErrorMessage(e);
      if (isFatalApiError(e)) throw new Error(lastError);
      if (attempt >= maxAttempts || !isTransientApiError(e)) break;
      messages.push({
        role: 'user',
        content: `El envío falló: ${lastError}\n\nReintenta y devuelve SOLO el bloque tsx.`,
      });
      continue;
    }

    messages.push({ role: 'assistant', content: raw });

    try {
      onStatus?.('OPENVG-AGENT · compilando en sandbox…');
      const compiled = compileComposition(raw, fallbackMeta);
      const meta = {
        width: fallbackMeta.width,
        height: fallbackMeta.height,
        fps: fallbackMeta.fps,
        durationInFrames: fallbackMeta.durationInFrames,
      };
      return {
        ...compiled,
        meta,
        attempts: attempt,
        assetNames: assets.map((a) => a.name),
      };
    } catch (e) {
      lastError = toErrorMessage(e);
      if (attempt >= maxAttempts) break;
      messages.push({
        role: 'user',
        content: `La composición no compiló:\n${lastError}\n\nCorrige y devuelve SOLO el bloque \`\`\`tsx. Respeta width/height/fps=${fallbackMeta.fps}/durationInFrames exactos.`,
      });
      if (!isTransientApiError(e) && !/compil|transpil|Import|permitid|meta|export default/i.test(lastError)) {
        // compile errors always retryable within attempts
      }
    }
  }

  throw new Error(`No se pudo generar una composición válida. Último error: ${lastError}`);
}
