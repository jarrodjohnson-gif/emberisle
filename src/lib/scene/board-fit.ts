// Board fit calculations and dimension guards for camera fitting.
// Guarantees finite numbers and positive dimensions for all viewport sizes.

export type Insets = { top: number; right: number; bottom: number; left: number };
export type OrthoFit = { left: number; right: number; top: number; bottom: number; x: number; z: number; lean: number };
export type DioramaFit = { focal: number; dist: number; cx: number; cy: number };

// Ensure viewport dimensions are positive and finite numbers.
export function safeDimension(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Compute safe aspect ratio avoiding division by zero or NaN.
export function safeAspect(w: number, h: number, fallback = 1): number {
  const safeW = safeDimension(w, fallback);
  const safeH = safeDimension(h, fallback);
  const aspect = safeW / safeH;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : fallback;
}

// Ensure insets contain only finite numbers.
export function safeInsets(insets?: Partial<Insets>): Insets {
  return {
    top: Number.isFinite(insets?.top) ? (insets!.top as number) : 0,
    right: Number.isFinite(insets?.right) ? (insets!.right as number) : 0,
    bottom: Number.isFinite(insets?.bottom) ? (insets!.bottom as number) : 0,
    left: Number.isFinite(insets?.left) ? (insets!.left as number) : 0,
  };
}

// Guard an OrthoFit against non-finite values or collapsed frustum bounds.
export function guardOrthoFit(fit: OrthoFit, defaultHalfW = 5.8, defaultHalfH = 5.4): OrthoFit {
  const left = Number.isFinite(fit.left) ? fit.left : -defaultHalfW;
  const right = Number.isFinite(fit.right) && fit.right > left ? fit.right : left + defaultHalfW * 2;
  const bottom = Number.isFinite(fit.bottom) ? fit.bottom : -defaultHalfH;
  const top = Number.isFinite(fit.top) && fit.top > bottom ? fit.top : bottom + defaultHalfH * 2;
  return {
    left,
    right,
    top,
    bottom,
    x: Number.isFinite(fit.x) ? fit.x : 0,
    z: Number.isFinite(fit.z) ? fit.z : 0,
    lean: Number.isFinite(fit.lean) ? fit.lean : 0,
  };
}

// Guard a DioramaFit against non-finite focal, dist, or center offsets.
export function guardDioramaFit(fit: DioramaFit, fallbackW = 844, fallbackH = 390): DioramaFit {
  return {
    focal: Number.isFinite(fit.focal) && fit.focal > 0 ? fit.focal : safeDimension(fallbackH) / 2,
    dist: Number.isFinite(fit.dist) && fit.dist > 0 ? fit.dist : 24,
    cx: Number.isFinite(fit.cx) ? fit.cx : safeDimension(fallbackW) / 2,
    cy: Number.isFinite(fit.cy) ? fit.cy : safeDimension(fallbackH) / 2,
  };
}
