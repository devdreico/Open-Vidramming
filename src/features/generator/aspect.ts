import type { AspectRatioId, CompositionMeta, GenerateRequest } from '../../shared/types';
import { ASPECT_RATIOS, FPS_FIXED } from '../../shared/types';

export function aspectById(id: AspectRatioId) {
  return ASPECT_RATIOS.find((a) => a.id === id) ?? ASPECT_RATIOS[0];
}

export function buildMeta(req: Pick<GenerateRequest, 'aspect' | 'durationSec'>): CompositionMeta {
  const a = aspectById(req.aspect);
  return {
    width: a.width,
    height: a.height,
    fps: FPS_FIXED,
    durationInFrames: Math.max(1, Math.round(req.durationSec * FPS_FIXED)),
  };
}
