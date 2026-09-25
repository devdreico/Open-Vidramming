import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { CompositionMeta, ExportProgress, ImageExportType } from '../../shared/types';
import { isCancelled, toErrorMessage } from '../../shared/lib/errors';
import { downloadBlob, exportMp4, exportStillImage } from './exporters';

export function useExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      abortRef.current?.abort();
    },
    [],
  );

  const cancelExport = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runExport = useCallback(
    async (
      format: 'mp4' | ImageExportType,
      player: PlayerRef | null,
      surface: HTMLElement | null,
      meta: CompositionMeta | null,
    ) => {
      // Ya hay una exportación en curso (o una que acaba de terminar).
      if (abortRef.current) return;
      if (clearTimer.current) {
        clearTimeout(clearTimer.current);
        clearTimer.current = null;
      }

      if (!player || !surface || !meta) {
        setProgress({
          format: 'mp4',
          phase: 'error',
          current: 0,
          total: 1,
          message: 'Genera una composición antes de exportar.',
        });
        return;
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setExporting(true);
      setProgress({
        format: format === 'mp4' ? 'mp4' : 'image-png',
        phase: 'captura',
        current: 0,
        total: 1,
        message: 'Iniciando…',
      });
      try {
        const onProgress = (p: ExportProgress) => setProgress(p);
        if (format === 'mp4') {
          const blob = await exportMp4(player, surface, meta, onProgress, ctrl.signal);
          downloadBlob(blob, `openvg_${Date.now()}_60fps.mp4`);
        } else {
          const blob = await exportStillImage(player, surface, meta, format, onProgress, undefined, ctrl.signal);
          const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
          downloadBlob(blob, `openvg_frame_${Date.now()}.${ext}`);
        }
        setProgress({
          format:
            format === 'mp4'
              ? 'mp4'
              : format === 'image/jpeg'
                ? 'image-jpeg'
                : format === 'image/webp'
                  ? 'image-webp'
                  : 'image-png',
          phase: 'listo',
          current: 1,
          total: 1,
          message: 'Descarga iniciada',
        });
        // El mensaje de éxito no se queda pegado para siempre.
        clearTimer.current = setTimeout(() => setProgress(null), 4_000);
      } catch (e) {
        if (isCancelled(e)) {
          setProgress(null);
        } else {
          setProgress({
            format: format === 'mp4' ? 'mp4' : 'image-png',
            phase: 'error',
            current: 0,
            total: 1,
            message: toErrorMessage(e),
          });
        }
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setExporting(false);
      }
    },
    [],
  );

  return { exporting, progress, runExport, setProgress, cancelExport };
}
