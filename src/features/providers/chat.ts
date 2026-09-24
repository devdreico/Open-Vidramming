import type { LlmMessage } from '../../shared/types';
import { ApiError } from '../../shared/lib/errors';
import { getKey } from './keys';
import { providerById, type ProviderDef } from './definitions';

const FETCH_TIMEOUT_MS = 120_000;

async function withTimeout(input: string, init: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') {
    throw new ApiError('Entorno sin `window` (¿SSR?).', 0, '');
  }
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('Tiempo de espera agotado (timeout 120s).', 408, '');
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
      throw new ApiError(
        `No se pudo conectar al proxy de la API. ¿Está corriendo \`npm run dev\`? (${msg})`,
        0,
        '',
      );
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
    const j = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
      type?: string;
    };
    if (typeof j.error === 'string') message = j.error;
    else if (j.error && typeof j.error === 'object' && j.error.message) message = j.error.message;
    else if (j.message) message = j.message;
  } catch {
    if (text.startsWith('<')) {
      message = `Respuesta no válida del servidor (HTTP ${res.status}). ¿El proxy está configurado?`;
    }
  }

  if (res.status === 401 || res.status === 403) {
    message = `API key inválida o sin permisos. ${message}`;
  } else if (res.status === 429) {
    message = `Límite de rate alcanzado. Inténtalo en unos segundos. ${message}`;
  } else if (res.status === 404) {
    message = `Ruta o modelo no encontrado (404). ${message}`;
  }

  return new ApiError(`${providerLabel}: ${message}`, res.status, providerLabel);
}

async function parseJson(res: Response, providerLabel: string): Promise<unknown> {
  if (!res.ok) throw await readErrorMessage(res, providerLabel);
  try {
    return await res.json();
  } catch {
    throw new ApiError(
      `${providerLabel}: la respuesta no es JSON válido (HTTP ${res.status}).`,
      res.status,
      providerLabel,
    );
  }
}

function openaiBody(model: string, messages: LlmMessage[]) {
  const isOSeries = /(^|[^a-z])(o1|o3|o4)/i.test(model);
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
  if (!key) {
    throw new ApiError(
      `Falta la API key de ${p.label}. Abre «Configurar API keys», pega la key y guarda.`,
      401,
      p.label,
    );
  }
  return key;
}

function authHeaders(p: ProviderDef, key: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (p.protocol === 'anthropic') {
    h['x-api-key'] = key;
    h['anthropic-version'] = '2023-06-01';
  } else if (p.protocol === 'gemini') {
    h['x-goog-api-key'] = key;
  } else {
    h.Authorization = `Bearer ${key}`;
    if (p.id === 'openrouter') {
      h['HTTP-Referer'] = window.location.origin;
      h['X-Title'] = 'Open VG';
    }
  }
  return h;
}

async function chatOpenAi(p: ProviderDef, model: string, messages: LlmMessage[]): Promise<string> {
  const key = requireKey(p);
  const data = (await parseJson(
    await withTimeout(`/api/llm/${p.id}${p.chatPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(p, key),
      },
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
  throw new ApiError(`${p.label}: el modelo devolvió una respuesta vacía.`, 200, p.label);
}

async function chatAnthropic(p: ProviderDef, model: string, messages: LlmMessage[]): Promise<string> {
  const key = requireKey(p);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) =>
      typeof m.content === 'string'
        ? m.content
        : m.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
    )
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
                source: { type: 'base64', media_type: c.mediaType, data: c.dataBase64 },
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
        ...authHeaders(p, key),
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
          ...authHeaders(p, key),
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
        ...authHeaders(p, key),
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 8000,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...rest.map((m) => ({
            role: m.role,
            content:
              typeof m.content === 'string'
                ? m.content
                : m.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
          })),
        ],
      }),
    }),
    p.label,
  )) as { message?: { content?: { text?: string }[] }; text?: string };

  const text = data.message?.content?.map((c) => c.text ?? '').join('') || data.text || '';
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

/** Lightweight connectivity check: list models or hit a tiny endpoint. */
export async function testConnection(providerId: string): Promise<{ ok: boolean; message: string }> {
  const p = providerById(providerId);
  const key = getKey(providerId);
  if (!key) {
    return { ok: false, message: `Sin API key para ${p.label}. Pégala en «Configurar API keys».` };
  }

  try {
    if (p.protocol === 'gemini') {
      const res = await withTimeout(`/api/llm/${p.id}/v1beta/models?maxResults=1`, {
        method: 'GET',
        headers: authHeaders(p, key),
      });
      if (res.ok) return { ok: true, message: `${p.label}: conexión correcta ✓` };
      const err = await readErrorMessage(res, p.label);
      return { ok: false, message: err.message };
    }

    if (p.protocol === 'anthropic') {
      const res = await withTimeout(`/api/llm/${p.id}${p.modelsPath}`, {
        method: 'GET',
        headers: authHeaders(p, key),
      });
      if (res.ok) return { ok: true, message: `${p.label}: conexión correcta ✓` };
      // Some accounts block /models — try a minimal messages call
      if (res.status === 404 || res.status === 403) {
        return await testMinimalChat(p, key);
      }
      const err = await readErrorMessage(res, p.label);
      return { ok: false, message: err.message };
    }

    // openai-compatible / cohere: list models
    const res = await withTimeout(`/api/llm/${p.id}${p.modelsPath}`, {
      method: 'GET',
      headers: authHeaders(p, key),
    });
    if (res.ok) return { ok: true, message: `${p.label}: conexión correcta ✓` };
    if (res.status === 404) return await testMinimalChat(p, key);
    const err = await readErrorMessage(res, p.label);
    return { ok: false, message: err.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function testMinimalChat(p: ProviderDef, key: string): Promise<{ ok: boolean; message: string }> {
  try {
    let path = p.chatPath;
    let body: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (p.protocol === 'anthropic') {
      headers = { ...headers, ...authHeaders(p, key) };
      body = JSON.stringify({
        model: p.defaultModel,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      });
    } else if (p.protocol === 'cohere') {
      headers = { ...headers, ...authHeaders(p, key) };
      body = JSON.stringify({
        model: p.defaultModel,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      });
    } else {
      headers = { ...headers, ...authHeaders(p, key) };
      path = p.chatPath;
      body = JSON.stringify({
        model: p.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16,
      });
    }

    const res = await withTimeout(`/api/llm/${p.id}${path}`, {
      method: 'POST',
      headers,
      body,
    });
    if (res.ok) return { ok: true, message: `${p.label}: conexión correcta ✓ (chat)` };
    const err = await readErrorMessage(res, p.label);
    return { ok: false, message: err.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
