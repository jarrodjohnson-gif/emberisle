// Camera limits, zoom clamping, and reduced-motion glide interpolation.

export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 2.4;
export const DEFAULT_GLIDE_MS = 280;

// Clamps zoom between minimum and maximum bounds.
export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Number.isFinite(zoom) && zoom > 0 ? Math.min(max, Math.max(min, zoom)) : 1;
}

export type GlideStep = {
  u: number;
  e: number;
  done: boolean;
};

// Evaluates glide transition progress with reduced-motion support.
export function glideProgress(
  now: number,
  start: number,
  duration = DEFAULT_GLIDE_MS,
  calm = false,
): GlideStep {
  if (calm || !Number.isFinite(now) || !Number.isFinite(start)) return { u: 1, e: 1, done: true };
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_GLIDE_MS;
  const elapsed = Math.max(0, now - start);
  const u = Math.min(1, elapsed / safeDuration);
  return { u, e: 1 - (1 - u) ** 3, done: u >= 1 };
}

// Ensure diorama camera eye distance remains positive and finite.
export function safeEyeDistance(dist: number, zoom: number): number {
  const safeDist = Number.isFinite(dist) && dist > 0 ? dist : 24;
  const safeZoom = clampZoom(zoom);
  return safeDist / safeZoom;
}
