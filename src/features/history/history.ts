import type { GenerationRecord } from '../../shared/types';

const DB_NAME = 'openvg';
const STORE = 'generations';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        try {
          const t = db.transaction(STORE, mode);
          const req = fn(t.objectStore(STORE));
          let result!: T;
          req.onsuccess = () => {
            result = req.result;
          };
          // Se confirma en `oncomplete` (no en `onsuccess`): un commit abortado
          // no debe reportarse como guardado, y `onabort` tampoco se cuelga.
          t.oncomplete = () => {
            db.close();
            resolve(result);
          };
          t.onerror = () => {
            db.close();
            reject(t.error ?? new Error('Transacción fallida'));
          };
          t.onabort = () => {
            db.close();
            reject(t.error ?? new Error('Transacción abortada'));
          };
        } catch (e) {
          db.close();
          reject(e);
        }
      }),
  );
}

export async function listGenerations(): Promise<GenerationRecord[]> {
  const all = await tx<GenerationRecord[]>('readonly', (s) => s.getAll() as IDBRequest<GenerationRecord[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveGeneration(rec: GenerationRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec) as IDBRequest);
}

export async function deleteGeneration(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

export function newId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
