import { useCallback, useEffect, useRef, useState } from 'react';
import {
  modelsForProviderId,
  refreshModelCatalog,
  type CatalogSnapshot,
} from './modelCatalog';
import { ensureRegistry } from './modelsDev';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CatalogState extends CatalogSnapshot {
  providerId: string;
  status: CatalogStatus;
  loading: boolean;
}

function snapshot(providerId: string): CatalogSnapshot {
  return modelsForProviderId(providerId);
}

/**
 * Catálogo reactivo por proveedor:
 * 1. sirve el snapshot cacheado (stale) de inmediato,
 * 2. refresca el /models con la key guardada,
 * 3. si no hay catálogo de API, cae al registro público models.dev.
 * Se reejecuta al cambiar de proveedor o al guardar/borrar una key (`refreshToken`).
 */
export function useModelCatalog(
  providerId: string,
  refreshToken = 0,
): CatalogState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<CatalogState>(() => ({
    providerId,
    ...snapshot(providerId),
    status: 'idle',
    loading: false,
  }));
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    setState({ providerId, ...snapshot(providerId), status: 'loading', loading: true });

    const outcome = await refreshModelCatalog(providerId);
    if (seq.current !== my) return;

    let snap = snapshot(providerId);
    if (snap.source !== 'api') {
      await ensureRegistry();
      if (seq.current !== my) return;
      snap = snapshot(providerId);
    }

    setState({
      providerId,
      ...snap,
      error: outcome.error ?? snap.error,
      status: snap.models.length ? 'ready' : 'error',
      loading: false,
    });
  }, [providerId]);

  useEffect(() => {
    // El refresco consulta sistemas externos (localStorage/red); se dispara en el
    // siguiente tick para no encadenar renders sincrónicos desde el efecto.
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh, refreshToken]);

  const current: CatalogState =
    state.providerId === providerId
      ? state
      : { providerId, ...snapshot(providerId), status: 'idle', loading: false };

  return { ...current, refresh };
}
