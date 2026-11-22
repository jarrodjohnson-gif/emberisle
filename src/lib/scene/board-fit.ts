// Board fit calculations and dimension guards for camera fitting.
// Guarantees finite numbers and positive dimensions for all viewport sizes.

export type Insets = { top: number; right: number; bottom: number; left: number };

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
