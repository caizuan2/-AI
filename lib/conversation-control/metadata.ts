function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : {};
}

function getSoftDeletedAt(metadata: unknown) {
  const root = toMetadataRecord(metadata);
  const control = isRecord(root.conversationControl) ? root.conversationControl : {};

  return typeof control.deletedAt === "string" && control.deletedAt ? control.deletedAt : null;
}

export function isConversationSoftDeleted(metadata: unknown) {
  return Boolean(getSoftDeletedAt(metadata));
}
