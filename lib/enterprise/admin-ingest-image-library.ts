import bundledManifest from "@/public/admin-ingest-media/manifest.json";

export const ADMIN_INGEST_IMAGE_MANIFEST_URL = "/admin-ingest-media/manifest.json";

export type AdminIngestImageAsset = {
  id: string;
  src: string;
  enabled: boolean;
};

export type AdminIngestImageManifest = {
  version: 1;
  revision: string;
  rotation: "daily";
  timeZone: "Asia/Shanghai";
  assets: AdminIngestImageAsset[];
  pools: Record<string, string[]>;
};

const ADMIN_INGEST_IMAGE_ROOT = "/admin-ingest-media/library/";
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeImageSource(value: string) {
  return value.startsWith(ADMIN_INGEST_IMAGE_ROOT)
    && !value.includes("..")
    && /\.webp$/i.test(value);
}

export function parseAdminIngestImageManifest(value: unknown): AdminIngestImageManifest | null {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.revision !== "string"
    || value.rotation !== "daily"
    || value.timeZone !== "Asia/Shanghai"
    || !Array.isArray(value.assets)
    || !isRecord(value.pools)) {
    return null;
  }

  const assets = value.assets.flatMap((candidate): AdminIngestImageAsset[] => {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string"
      || typeof candidate.src !== "string"
      || !isSafeImageSource(candidate.src)) {
      return [];
    }

    return [{
      id: candidate.id,
      src: candidate.src,
      enabled: candidate.enabled !== false,
    }];
  });
  const assetIds = new Set(assets.map((asset) => asset.id));
  const pools = Object.fromEntries(
    Object.entries(value.pools).flatMap(([poolKey, candidates]) => {
      if (!Array.isArray(candidates)) {
        return [];
      }

      const poolAssets = candidates.filter(
        (candidate): candidate is string => typeof candidate === "string" && assetIds.has(candidate)
      );
      return poolAssets.length > 0 ? [[poolKey, poolAssets]] : [];
    })
  );

  if (assets.length === 0 || Object.keys(pools).length === 0) {
    return null;
  }

  return {
    version: 1,
    revision: value.revision,
    rotation: "daily",
    timeZone: "Asia/Shanghai",
    assets,
    pools,
  };
}

export const bundledAdminIngestImageManifest = (
  parseAdminIngestImageManifest(bundledManifest) satisfies AdminIngestImageManifest | null
) ?? {
  version: 1,
  revision: "fallback-empty",
  rotation: "daily",
  timeZone: "Asia/Shanghai",
  assets: [],
  pools: {},
} satisfies AdminIngestImageManifest;

export function getAdminIngestImageRotationKey(timestamp = Date.now()) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function resolvePool(manifest: AdminIngestImageManifest, slotKey: string) {
  const exactPool = manifest.pools[slotKey];
  if (exactPool?.length) {
    return exactPool;
  }

  if (slotKey.startsWith("agent:")) {
    return manifest.pools["agent:default"] ?? [];
  }

  return [];
}

export function selectAdminIngestStableImage(
  manifest: AdminIngestImageManifest,
  slotKey: string,
  rotationKey = getAdminIngestImageRotationKey()
) {
  const enabledAssets = new Map(
    manifest.assets
      .filter((asset) => asset.enabled)
      .map((asset) => [asset.id, asset])
  );
  const candidates = resolvePool(manifest, slotKey)
    .map((assetId) => enabledAssets.get(assetId))
    .filter((asset): asset is AdminIngestImageAsset => Boolean(asset));

  if (candidates.length === 0) {
    return null;
  }

  const selectionSeed = `${rotationKey}:${slotKey}`;
  return candidates.reduce((selected, candidate) => (
    stableHash(`${selectionSeed}:${candidate.id}`) > stableHash(`${selectionSeed}:${selected.id}`)
      ? candidate
      : selected
  ));
}

let manifestRequest: Promise<AdminIngestImageManifest> | null = null;

export function loadAdminIngestImageManifest() {
  if (typeof window === "undefined") {
    return Promise.resolve(bundledAdminIngestImageManifest);
  }

  if (!manifestRequest) {
    manifestRequest = fetch(ADMIN_INGEST_IMAGE_MANIFEST_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return bundledAdminIngestImageManifest;
        }

        const manifest = parseAdminIngestImageManifest(await response.json());
        return manifest ?? bundledAdminIngestImageManifest;
      })
      .catch(() => bundledAdminIngestImageManifest);
  }

  return manifestRequest;
}
