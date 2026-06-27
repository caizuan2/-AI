import "server-only";

function clamp01(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numeric));
}

function clampSigned(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(-1, Math.min(1, numeric));
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function smoothScore(input: {
  previousScore?: number | null;
  incomingScore: number;
  alpha?: number;
}): number {
  const incomingScore = clamp01(input.incomingScore, 0);

  if (input.previousScore === null || input.previousScore === undefined) {
    return round4(incomingScore);
  }

  const previousScore = clamp01(input.previousScore, incomingScore);
  const alpha = clamp01(input.alpha ?? 0.25, 0.25);

  return round4(clamp01((previousScore * (1 - alpha)) + (incomingScore * alpha), incomingScore));
}

export function smoothSignedScore(input: {
  previousScore?: number | null;
  incomingScore: number;
  alpha?: number;
}): number {
  const incomingScore = clampSigned(input.incomingScore, 0);

  if (input.previousScore === null || input.previousScore === undefined) {
    return round4(incomingScore);
  }

  const previousScore = clampSigned(input.previousScore, incomingScore);
  const alpha = clamp01(input.alpha ?? 0.25, 0.25);

  return round4(clampSigned((previousScore * (1 - alpha)) + (incomingScore * alpha), incomingScore));
}
