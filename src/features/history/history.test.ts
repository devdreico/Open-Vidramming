import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GenerationRecord } from '../../shared/types';
import { deleteGeneration, listGenerations, newId, saveGeneration } from './history';

function record(id: string, createdAt: number): GenerationRecord {
  return {
    id,
    createdAt,
    prompt: `prompt ${id}`,
    aspect: '16:9',
    durationSec: 5,
    providerId: 'openai',
    model: 'gpt-4o',
    code: 'export default function Scene() { return null; }',
    meta: { width: 1920, height: 1080, fps: 60, durationInFrames: 300 },
  };
}

beforeEach(async () => {
  for (const id of await listGenerations()) {
    await deleteGeneration(id.id);
  }
});

describe('historial IndexedDB', () => {
  it('guarda, lista ordenado por fecha y borra', async () => {
    await saveGeneration(record('a', 1_000));
    await saveGeneration(record('b', 2_000));

    const list = await listGenerations();
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);

    await deleteGeneration('b');
    const after = await listGenerations();
    expect(after.map((r) => r.id)).toEqual(['a']);
  });

  it('newId genera identificadores únicos', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});
