export function resolveAdminIngestMobileViewportHeight({
  visualViewportHeight,
  innerHeight
}: {
  visualViewportHeight?: number | null;
  innerHeight?: number | null;
}) {
  const validHeights = [visualViewportHeight, innerHeight].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  );

  return validHeights.length === 0
    ? null
    : Math.max(1, Math.round(Math.min(...validHeights)));
}

export function shouldUseAdminIngestCompactViewport(height?: number | null) {
  return typeof height === "number"
    && Number.isFinite(height)
    && height > 0
    && height <= 520;
}
