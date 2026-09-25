import { describe, expect, it } from 'vitest';
import { compileComposition, extractCodeBlock } from './sandbox';
import type { CompositionMeta } from '../../shared/types';

const FALLBACK: CompositionMeta = { width: 1920, height: 1080, fps: 60, durationInFrames: 300 };

const VALID = `
import React from 'react';
export const meta = { width: 1920, height: 1080, fps: 60, durationInFrames: 300 };
export default function Scene() {
  return <div>hola</div>;
}
`;

describe('extractCodeBlock', () => {
  it('extrae el bloque cerrado con lang', () => {
    expect(extractCodeBlock('texto\n```tsx\nconst a = 1;\n```\nfinal')).toBe('const a = 1;');
  });

  it('extrae el bloque sin lang', () => {
    expect(extractCodeBlock('```\ncode();\n```')).toBe('code();');
  });

  it('respuesta truncada (fence abierto) → devuelve el código parcial', () => {
    const out = extractCodeBlock('va bien:\n```tsx\nexport default function Scene() {\n');
    expect(out).toContain('export default function Scene()');
    expect(out).not.toContain('```');
    expect(out).not.toContain('va bien');
  });

  it('sin fences devuelve el texto plano', () => {
    expect(extractCodeBlock('  hola  ')).toBe('hola');
  });
});

describe('compileComposition', () => {
  it('compila una composición válida', () => {
    const out = compileComposition('```tsx\n' + VALID + '\n```', FALLBACK);
    expect(typeof out.Scene).toBe('function');
    expect(out.code).toContain('export default');
    expect(out.meta).toEqual(FALLBACK);
  });

  it('rechaza APIs prohibidas', () => {
    const bad = VALID.replace('return <div>hola</div>;', 'localStorage.getItem("k"); return null;');
    expect(() => compileComposition(bad, FALLBACK)).toThrow(/API no permitida/);
  });

  it('rechaza imports fuera de react/remotion', () => {
    const bad = `import fs from 'node:fs';\n${VALID}`;
    expect(() => compileComposition(bad, FALLBACK)).toThrow(/Import no permitido/);
  });

  it('rechaza respuestas sin código utilizable', () => {
    expect(() => compileComposition('no hay codigo aqui', FALLBACK)).toThrow(
      /no contiene código TSX/,
    );
  });

  it('un meta inválido cae al pedido por el usuario (no aborta)', () => {
    const weird = VALID.replace(
      /export const meta = .*;/,
      "export const meta = { width: 'abc', height: -5, fps: 999, durationInFrames: 0 };",
    );
    const out = compileComposition(weird, FALLBACK);
    expect(out.meta).toEqual(FALLBACK);
  });

  it('sin export meta usa el fallback', () => {
    const noMeta = VALID.replace(/export const meta = .*;\n/, '');
    const out = compileComposition(noMeta, FALLBACK);
    expect(out.meta).toEqual(FALLBACK);
  });
});
