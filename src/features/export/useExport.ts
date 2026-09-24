import { useCallback, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { CompositionMeta, ExportProgress, ImageExportType } from '../../shared/types';
import { downloadBlob, exportMp4, exportStillImage } from './exporters';

export function useExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const runExport = useCallback(
    async (
      format: 'mp4' | ImageExportType,
      player: PlayerRef | null,
      surface: HTMLElement | null,
      meta: CompositionMeta | null,
    ) => {
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
          const blob = await exportMp4(player, surface, meta, onProgress);
          downloadBlob(blob, `openvg_${Date.now()}_60fps.mp4`);
        } else {
          const blob = await exportStillImage(player, surface, meta, format, onProgress);
          const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
          downloadBlob(blob, `openvg_frame_${Date.now()}.${ext}`);
        }
        setProgress({
          format: format === 'mp4' ? 'mp4' : format === 'image/jpeg' ? 'image-jpeg' : format === 'image/webp' ? 'image-webp' : 'image-png',
          phase: 'listo',
          current: 1,
          total: 1,
          message: 'Descarga iniciada',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setProgress({
          format: format === 'mp4' ? 'mp4' : 'image-png',
          phase: 'error',
          current: 0,
          total: 1,
          message: msg,
        });
      } finally {
        setExporting(false);
      }
    },
    [],
  );

  return { exporting, progress, runExport, setProgress };
}
