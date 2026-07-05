export type IngestMemoryOwnerScope = {
  ownerAdminId?: string | null;
  ownerUserId?: string | null;
  includeLegacyUnowned?: boolean;
};

type OwnerScopedRecord = {
  ownerAdminId?: unknown;
  ownerUserId?: unknown;
  meta?: Record<string, unknown>;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOwnerId(value: unknown): string {
  return readString(value).toLowerCase();
}

function getRequestedOwners(scope: IngestMemoryOwnerScope): string[] {
  return Array.from(new Set([
    normalizeOwnerId(scope.ownerAdminId),
    normalizeOwnerId(scope.ownerUserId)
  ].filter(Boolean)));
}

function getRecordOwners(record: OwnerScopedRecord): string[] {
  return Array.from(new Set([
    normalizeOwnerId(record.ownerAdminId),
    normalizeOwnerId(record.ownerUserId),
    normalizeOwnerId(record.meta?.ownerAdminId),
    normalizeOwnerId(record.meta?.ownerUserId),
    normalizeOwnerId(record.meta?.adminId),
    normalizeOwnerId(record.meta?.userId),
    normalizeOwnerId(record.meta?.createdByUserId)
  ].filter(Boolean)));
}

export function recordMatchesOwnerScope(record: OwnerScopedRecord, scope: IngestMemoryOwnerScope = {}) {
  const requestedOwners = getRequestedOwners(scope);

  if (requestedOwners.length === 0) {
    return true;
  }

  const recordOwners = getRecordOwners(record);

  if (recordOwners.length === 0) {
    return scope.includeLegacyUnowned !== false;
  }

  return recordOwners.some((owner) => requestedOwners.includes(owner));
}

export function attachOwnerScope<T extends { meta?: Record<string, unknown> }>(
  record: T,
  scope: IngestMemoryOwnerScope
): T & { ownerAdminId?: string; ownerUserId?: string } {
  const ownerAdminId = readString(scope.ownerAdminId);
  const ownerUserId = readString(scope.ownerUserId);

  return {
    ...record,
    ...(ownerAdminId ? { ownerAdminId } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    meta: {
      ...(record.meta ?? {}),
      ...(ownerAdminId ? { ownerAdminId } : {}),
      ...(ownerUserId ? { ownerUserId } : {})
    }
  };
}
