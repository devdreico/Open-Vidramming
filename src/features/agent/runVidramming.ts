import type { AssetFile, GenerateRequest, LlmMessage } from '../../shared/types';
import {
  CancelledError,
  isCancelled,
  isFatalApiError,
  isTransientApiError,
  retryDelayMs,
  toErrorMessage,
} from '../../shared/lib/errors';
import { buildMeta } from '../generator/aspect';
import { buildSystemPrompt, userTextContent } from '../generator/prompt';
import { compileComposition, type CompiledComposition } from '../generator/sandbox';
import { chatCompletion } from '../providers/chat';
import { providerById } from '../providers/definitions';
import { getModelVision } from '../providers/modelCatalog';
import { splitDataUri } from '../assets/assetsStore';

export interface VidrammingResult extends CompiledComposition {
  attempts: number;
  assetNames: string[];
}

const MAX_ATTEMPTS = 3;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new CancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Anthropic/Gemini rechazan dos mensajes `user` consecutivos: si el último ya es
 * `user`, la nota se fusiona en él en lugar de apilar otro mensaje.
 */
function pushUserNote(messages: LlmMessage[], note: string): void {
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    if (typeof last.content === 'string') last.content += `\n\n${note}`;
    else last.content.push({ type: 'text', text: `\n\n${note}` });
    return;
  }
  messages.push({ role: 'user', content: note });
}

export async function runVidramming(
  req: GenerateRequest,
  assets: AssetFile[],
  onStatus?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<VidrammingResult> {
  if (!req.prompt.trim() && assets.length === 0) {
    throw new Error('Escribe un prompt o indexa al menos un archivo para Vidramming.');
  }
  if (signal?.aborted) throw new CancelledError('Generación cancelada.');

  // La proporción y la duración elegidas por el usuario mandan siempre.
  const fallbackMeta = buildMeta(req);
  const provider = providerById(req.providerId);
  const images = assets.filter((a) => a.kind === 'image');
  const modelVision = getModelVision(req.providerId, req.model);
  const useVision = images.length > 0 && provider.supportsVision && modelVision !== false;

  if (images.length > 0 && !useVision) {
    onStatus?.(
      provider.supportsVision
        ? 'El modelo no soporta visión — los assets de imagen se referenciarán por nombre…'
        : 'Proveedor sin visión — los assets de imagen se referenciarán por nombre…',
    );
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

  let lastError = 'Error desconocido';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new CancelledError('Generación cancelada.');
    onStatus?.(
      attempt === 1
        ? 'OPENVG-AGENT · enviando skills + archivos al modelo…'
        : `OPENVG-AGENT · reintento ${attempt}/${MAX_ATTEMPTS} — corrigiendo…`,
    );

    let raw: string;
    try {
      raw = await chatCompletion(req.providerId, req.model, messages, signal);
    } catch (e) {
      if (isCancelled(e)) {
        throw e instanceof CancelledError ? e : new CancelledError('Generación cancelada.');
      }
      lastError = toErrorMessage(e);
      if (isFatalApiError(e)) throw new Error(lastError, { cause: e });
      if (attempt >= MAX_ATTEMPTS || !isTransientApiError(e)) break;

      const wait = retryDelayMs(e, attempt);
      if (wait > 0) {
        onStatus?.(
          `OPENVG-AGENT · esperando ${(wait / 1000).toFixed(1)}s antes del reintento ${attempt + 1}/${MAX_ATTEMPTS}…`,
        );
        await sleep(wait, signal);
      }
      pushUserNote(
        messages,
        `El envío falló: ${lastError}\n\nReintenta y devuelve SOLO el bloque tsx.`,
      );
      continue;
    }

    messages.push({ role: 'assistant', content: raw });

    try {
      onStatus?.('OPENVG-AGENT · compilando en sandbox…');
      const compiled = compileComposition(raw, fallbackMeta);
      return {
        ...compiled,
        // El meta pedido por el usuario (proporción/duración) es el que se usa.
        meta: fallbackMeta,
        attempts: attempt,
        assetNames: assets.map((a) => a.name),
      };
    } catch (e) {
      lastError = toErrorMessage(e);
      if (attempt >= MAX_ATTEMPTS) break;
      pushUserNote(
        messages,
        `La composición no compiló:\n${lastError}\n\nCorrige y devuelve SOLO el bloque \`\`\`tsx. Respeta width/height/fps=${fallbackMeta.fps}/durationInFrames exactos.`,
      );
    }
  }

  throw new Error(`No se pudo generar una composición válida. Último error: ${lastError}`);
}
