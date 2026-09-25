import React from 'react';
import * as Remotion from 'remotion';
import { transform } from 'sucrase';
import type { CompositionMeta } from '../../shared/types';

const ALLOWED_MODULES = new Set(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'remotion']);

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bfetch\s*\(/, label: 'fetch' },
  { re: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { re: /\blocalStorage\b/, label: 'localStorage' },
  { re: /\bsessionStorage\b/, label: 'sessionStorage' },
  { re: /\bdocument\s*\.\s*cookie\b/, label: 'document.cookie' },
  { re: /\beval\s*\(/, label: 'eval' },
  { re: /\bnew\s+Function\s*\(/, label: 'new Function' },
  { re: /\bimport\s*\(/, label: 'import dinámico' },
  { re: /\bsetInterval\s*\(/, label: 'setInterval' },
  { re: /\bsetTimeout\s*\(/, label: 'setTimeout' },
  { re: /\bDate\s*\.\s*now\s*\(/, label: 'Date.now' },
  { re: /\bMath\s*\.\s*random\s*\(/, label: 'Math.random' },
  { re: /\bWebSocket\b/, label: 'WebSocket' },
  { re: /\bindexedDB\b/, label: 'indexedDB' },
];

export interface CompiledComposition {
  code: string;
  meta: CompositionMeta;
  Scene: React.ComponentType;
}

export function extractCodeBlock(raw: string): string {
  const fenced = raw.match(/```(?:tsx|typescript|ts|jsx|javascript|js)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  // Respuesta truncada: fence abierto sin cerrar → toma todo lo que hay.
  const opened = raw.match(/```(?:tsx|typescript|ts|jsx|javascript|js)?\s*([\s\S]*)$/i);
  if (opened?.[1]) return opened[1].trim();
  return raw.trim();
}

function listImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s+[^;]*?from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  const bare = /import\s+['"]([^'"]+)['"]/g;
  while ((m = bare.exec(src))) out.push(m[1]);
  return out;
}

function assertSafe(src: string): void {
  for (const id of listImports(src)) {
    if (!ALLOWED_MODULES.has(id)) {
      throw new Error(`Import no permitido: "${id}". Solo "react" y "remotion".`);
    }
  }
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(src)) {
      throw new Error(`API no permitida en la composición: ${label}.`);
    }
  }
}

/**
 * `meta` exportado por el modelo: cada campo inválido (no numérico o fuera de
 * rango) cae al valor pedido por el usuario. Antes un meta inválido abortaba el
 * reintento aunque el valor fuera a descartarse igualmente (la proporción
 * elegida manda en `runVidramming`).
 */
function normalizeMeta(raw: unknown, fallback: CompositionMeta): CompositionMeta {
  const m = (raw ?? {}) as Partial<CompositionMeta>;
  const field = (value: unknown, min: number, max: number, fb: number): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) return fb;
    return Math.round(n);
  };
  return {
    width: field(m.width, 16, 4096, fallback.width),
    height: field(m.height, 16, 4096, fallback.height),
    fps: field(m.fps, 1, 120, fallback.fps),
    durationInFrames: field(m.durationInFrames, 1, 60 * 120 * 30, fallback.durationInFrames),
  };
}

function jsxShim() {
  return {
    jsx: (type: unknown, props: unknown, key?: unknown) => {
      const p = { ...(props as Record<string, unknown>) };
      if (key !== undefined) p.key = key;
      return React.createElement(type as React.ElementType, p);
    },
    jsxs: (type: unknown, props: unknown, key?: unknown) => {
      const p = { ...(props as Record<string, unknown>) };
      if (key !== undefined) p.key = key;
      return React.createElement(type as React.ElementType, p);
    },
    Fragment: React.Fragment,
  };
}

export function compileComposition(raw: string, fallbackMeta: CompositionMeta): CompiledComposition {
  const code = extractCodeBlock(raw);
  if (!code || code.length < 40) {
    throw new Error('La respuesta del modelo no contiene código TSX utilizable.');
  }
  assertSafe(code);

  let js: string;
  try {
    js = transform(code, {
      transforms: ['typescript', 'jsx', 'imports'],
      production: true,
      jsxRuntime: 'automatic',
      filePath: 'composition.tsx',
    }).code;
  } catch (e) {
    throw new Error(`Error de transpilación: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }

  const module = { exports: {} as Record<string, unknown> };
  const require = (id: string): unknown => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return jsxShim();
    if (id === 'remotion') return Remotion;
    throw new Error(`Módulo no permitido: "${id}"`);
  };

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'require',
      'module',
      'exports',
      'React',
      `${js}\n//# sourceURL=openvg-composition.js`,
    );
    fn(require, module, module.exports, React);
  } catch (e) {
    throw new Error(`Error al ejecutar el módulo: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }

  const exported = module.exports as { default?: unknown; meta?: unknown };
  const Scene = exported.default;
  if (typeof Scene !== 'function' && !(typeof Scene === 'object' && Scene !== null)) {
    throw new Error('Falta export default con el componente de escena.');
  }

  const meta = normalizeMeta(exported.meta, fallbackMeta);

  return {
    code,
    meta,
    Scene: Scene as React.ComponentType,
  };
}
