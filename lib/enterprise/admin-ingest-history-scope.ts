import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigError } from "@/lib/errors";
import { normalizeAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-sync";

const HISTORY_SCOPE_CONTEXT = "admin-ingest-history:v2";

function getHistoryScopeSecret() {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret) {
    throw new ConfigError("投喂端历史隔离密钥未配置，请设置 SESSION_SECRET。");
  }

  return secret;
}

export function createAdminIngestHistoryScope(ownerUserId: string) {
  return createHmac("sha256", getHistoryScopeSecret())
    .update(`${HISTORY_SCOPE_CONTEXT}:${ownerUserId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function matchesAdminIngestHistoryScope(
  ownerUserId: string,
  candidateScope: unknown
) {
  const normalizedCandidate = normalizeAdminIngestHistoryScope(candidateScope);

  if (!normalizedCandidate) {
    return false;
  }

  const expectedScope = createAdminIngestHistoryScope(ownerUserId);
  const expectedBuffer = Buffer.from(expectedScope, "utf8");
  const candidateBuffer = Buffer.from(normalizedCandidate, "utf8");

  return expectedBuffer.length === candidateBuffer.length
    && timingSafeEqual(expectedBuffer, candidateBuffer);
}
