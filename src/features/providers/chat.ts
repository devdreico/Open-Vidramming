import type { LlmMessage } from '../../shared/types';
import { ApiError } from '../../shared/lib/errors';
import { getKey } from './keys';
import { providerById, type ProviderDef } from './definitions';

const FETCH_TIMEOUT_MS = 120_000;

async function withTimeout(input: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('Tiempo de espera agotado (timeout).', 408, '');
    }
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

async function readErrorMessage(res: Response, providerLabel: string): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let message = text || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === 'string') message = j.error;
    else if (j.error?.message) message = j.error.message;
    else if (j.message) message = j.message;
  } catch {
    if (text.startsWith('<')) message = `Respuesta no válida del servidor (HTTP ${res.status}).`;
  }
  return new ApiError(`${providerLabel}: ${message}`, res.status, providerLabel);
}

async function parseJson(res: Response, providerLabel: string): Promise<unknown> {
  if (!res.ok) throw await readErrorMessage(res, providerLabel);
  try {
    return await res.json();
  } catch {
    throw new ApiError(`${providerLabel}: respuesta no es JSON válido.`, res.status, providerLabel);
  }
}

function openaiBody(model: string, messages: LlmMessage[]) {
  const isOSeries = /o1|o3|o4/i.test(model);
  const bodyMessages = messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    const parts = m.content.map((p) => {
      if (p.type === 'text') return { type: 'text' as const, text: p.text };
      return {
        type: 'image_url' as const,
        image_url: { url: `data:${p.mediaType};base64,${p.dataBase64}` },
      };
    });
    return { role: m.role, content: parts };
  });

  if (isOSeries) {
    return { model, messages: bodyMessages, max_completion_tokens: 8000 };
  }
  return { model, messages: bodyMessages, temperature: 0.4, max_tokens: 8000 };
}

function requireKey(p: ProviderDef): string {
  const key = getKey(p.id);
  if (!key) throw new ApiError(`Falta la API key de ${p.label}. Ábrela en Ajustes.`, 401, p.label);
  return key;
}

async function chatOpenAi(p: ProviderDef, model: string, messages: LlmMessage[]): Promise<string> {
  const key = requireKey(p);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  if (p.id === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Open VG';
  }
  const data = (await parseJson(
    await withTimeout(`/api/llm/${p.id}${p.chatPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(openaiBody(model, messages)),
    }),
    p.label,
  )) as { choices?: { message?: { content?: string | unknown } }[] };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (typeof c === 'string' ? c : ((c as { text?: string }).text ?? '')))
      .join('');
    if (text) return text;
  }
  throw new ApiError(`${p.label}: respuesta vacía del modelo.`, 200, p.label);
}

async function chatAnthropic(p: ProviderDef, model: string, messages: LlmMessage[]): Promise<string> {
  const key = requireKey(p);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((c) => (c.type === 'text' ? c.text : '')).join('')))
    .join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');

  const body = {
    model,
    max_tokens: 8000,
    temperature: 0.4,
    ...(system ? { system } : {}),
    messages: rest.map((m) => {
      if (typeof m.content === 'string') return { role: m.role, content: m.content };
      return {
        role: m.role,
        content: m.content.map((c) =>
          c.type === 'text'
            ? { type: 'text', text: c.text }
            : {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: c.mediaType,
                  data: c.dataBase64,
                },
              },
        ),
      };
    }),
  };

  const data = (await parseJson(
    await withTimeout(`/api/llm/${p.id}${p.chatPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    }),
    p.label,
  )) as { content?: { type: string; text?: string }[] };

  const text = data.content
    ?.filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');
  if (!text) throw new ApiError(`${p.label}: respuesta vacía del modelo.`, 200, p.label);
  return text;
}

async function chatGemini(p: ProviderDef, model: string, messages: LlmMessage[]): Promise<string> {
  const key = requireKey(p);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');

  const contents = rest.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') {
      return { role, parts: [{ text: m.content }] };
    }
    return {
      role,
      parts: m.content.map((c) =>
        c.type === 'text'
          ? { text: c.text }
          : { inlineData: { mimeType: c.mediaType, data: c.dataBase64 } },
      ),
    };
  });

  const data = (await parseJson(
    await withTimeout(
      `/api/llm/${p.id}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
      },
    ),
    p.label,
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

  const text = data.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('');
  if (!text) throw new ApiError(`${p.label}: respuesta vacía del modelo.`, 200, p.label);
  return text;
}

async function chatCohere(p: ProviderDef, model: string, messages: LlmMessage[]): Promise<string> {
  const key = requireKey(p);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');

  const data = (await parseJson(
    await withTimeout(`/api/llm/${p.id}${p.chatPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 8000,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...rest.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : m.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
          })),
        ],
      }),
    }),
    p.label,
  )) as { message?: { content?: { text?: string }[] }; text?: string };

  const text =
    data.message?.content?.map((c) => c.text ?? '').join('') || data.text || '';
  if (!text) throw new ApiError(`${p.label}: respuesta vacía del modelo.`, 200, p.label);
  return text;
}

export async function chatCompletion(
  providerId: string,
  model: string,
  messages: LlmMessage[],
): Promise<string> {
  const p = providerById(providerId);
  switch (p.protocol) {
    case 'openai':
      return chatOpenAi(p, model, messages);
    case 'anthropic':
      return chatAnthropic(p, model, messages);
    case 'gemini':
      return chatGemini(p, model, messages);
    case 'cohere':
      return chatCohere(p, model, messages);
    default:
      throw new Error(`Protocolo no soportado: ${String(p.protocol)}`);
  }
}
