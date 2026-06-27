import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const adminIngestKnowledgeSourceTypes = [
  "admin_chat",
  "admin_text",
  "admin_file",
  "admin_image",
  "admin_url"
] as const;

export type KnowledgeAccessScope = {
  actorUserId: string;
  tenantId?: string | null;
  appType?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  includeShared?: boolean;
  includePublished?: boolean;
};

export type ResolvedKnowledgeAccessScope = Required<
  Pick<KnowledgeAccessScope, "actorUserId" | "includeShared" | "includePublished">
> & {
  tenantId: string | null;
  appType: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
};

function normalizeNullableString(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";

  return text || null;
}

export const DEFAULT_KNOWLEDGE_AGENT_ID = "chief";

function normalizeScopeId(value: string | null | undefined, fallback: string) {
  const normalized = normalizeNullableString(value)
    ?.replace(/\s+/g, "-")
    .replace(/[^0-9A-Za-z_\-:.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

  return normalized || fallback;
}

export function resolveAgentKnowledgeScope(input: {
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
} = {}) {
  const agentId = normalizeScopeId(input.agentId, DEFAULT_KNOWLEDGE_AGENT_ID);
  const knowledgeBaseId = normalizeScopeId(input.knowledgeBaseId, `kb:${agentId}`);
  const namespace = normalizeScopeId(input.namespace, `agent:${agentId}:kb:${knowledgeBaseId}`);

  return {
    agentId,
    knowledgeBaseId,
    namespace
  };
}

export async function resolveKnowledgeAccessScope(scope: KnowledgeAccessScope): Promise<ResolvedKnowledgeAccessScope> {
  const explicitTenantId = normalizeNullableString(scope.tenantId);
  let tenantId = explicitTenantId;
  const agentScope = resolveAgentKnowledgeScope({
    agentId: scope.agentId,
    knowledgeBaseId: scope.knowledgeBaseId,
    namespace: scope.namespace
  });

  if (scope.tenantId === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: scope.actorUserId },
      select: { tenantId: true }
    });

    tenantId = normalizeNullableString(user?.tenantId);
  }

  return {
    actorUserId: scope.actorUserId,
    tenantId,
    appType: normalizeNullableString(scope.appType),
    agentId: agentScope.agentId,
    knowledgeBaseId: agentScope.knowledgeBaseId,
    namespace: agentScope.namespace,
    includeShared: scope.includeShared === true,
    includePublished: scope.includePublished === true
  };
}

function activeKnowledgeWhere(): Prisma.KnowledgeItemWhereInput {
  return {
    deletedAt: null,
    status: "active",
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } }
    ]
  };
}

function sharedTenantGuard(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeItemWhereInput {
  return scope.tenantId ? { tenantId: scope.tenantId } : { tenantId: null };
}

function knowledgeChunkScopeWhere(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeChunkWhereInput {
  return {
    OR: [
      {
        metadata: {
          path: ["knowledgeBaseId"],
          equals: scope.knowledgeBaseId
        }
      },
      {
        metadata: {
          path: ["namespace"],
          equals: scope.namespace
        }
      },
      {
        metadata: {
          path: ["agentId"],
          equals: scope.agentId
        }
      }
    ]
  };
}

function knowledgeItemScopeWhere(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeItemWhereInput {
  return {
    chunks: {
      some: knowledgeChunkScopeWhere(scope)
    }
  };
}

export function buildKnowledgeItemAccessWhere(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeItemWhereInput {
  const orFilters: Prisma.KnowledgeItemWhereInput[] = [
    {
      userId: scope.actorUserId,
      deletedAt: null,
      ...knowledgeItemScopeWhere(scope)
    }
  ];

  if (scope.includePublished || scope.includeShared) {
    orFilters.push({
      ...activeKnowledgeWhere(),
      ...sharedTenantGuard(scope),
      ...knowledgeItemScopeWhere(scope),
      sourceType: {
        in: [...adminIngestKnowledgeSourceTypes]
      }
    });
  }

  return { OR: orFilters };
}

function buildSharedChunkMetadataFilters(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeChunkWhereInput[] {
  if (!scope.includeShared) {
    return [];
  }

  const filters: Prisma.KnowledgeChunkWhereInput[] = [
    knowledgeChunkScopeWhere(scope),
    {
      metadata: {
        path: ["sharedToUserApp"],
        equals: true
      }
    },
    {
      metadata: {
        path: ["sourceApp"],
        equals: "ingest_admin"
      }
    }
  ];

  return filters;
}

export function buildKnowledgeChunkAccessWhere(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeChunkWhereInput {
  const orFilters: Prisma.KnowledgeChunkWhereInput[] = [
    {
      AND: [
        knowledgeChunkScopeWhere(scope),
        {
          knowledgeItem: {
            is: {
              userId: scope.actorUserId,
              deletedAt: null
            }
          }
        }
      ]
    }
  ];

  if (scope.includePublished || scope.includeShared) {
    orFilters.push({
      AND: [
        knowledgeChunkScopeWhere(scope),
        {
          knowledgeItem: {
            is: {
              ...activeKnowledgeWhere(),
              ...sharedTenantGuard(scope),
              sourceType: {
                in: [...adminIngestKnowledgeSourceTypes]
              }
            }
          }
        }
      ]
    });
  }

  const metadataFilters = buildSharedChunkMetadataFilters(scope);

  if (metadataFilters.length > 0) {
    orFilters.push({
      AND: [
        ...metadataFilters,
        {
          knowledgeItem: {
            is: {
              ...activeKnowledgeWhere(),
              ...sharedTenantGuard(scope)
            }
          }
        }
      ]
    });
  }

  return { OR: orFilters };
}

export function buildKnowledgeAccessSql(scope: ResolvedKnowledgeAccessScope) {
  const tenantGuard = scope.tenantId
    ? Prisma.sql`ki."tenant_id" = ${scope.tenantId}`
    : Prisma.sql`ki."tenant_id" IS NULL`;
  const sharedSourceTypes = Prisma.join([...adminIngestKnowledgeSourceTypes]);
  const ownKnowledge = Prisma.sql`ki."userId" = ${scope.actorUserId}`;
  const sharedBySourceType = Prisma.sql`
    ${tenantGuard}
    AND ki."status" = 'active'
    AND ki."sourceType" IN (${sharedSourceTypes})
    AND (ki."expiresAt" IS NULL OR ki."expiresAt" > NOW())
  `;
  const sharedByMetadata = Prisma.sql`
    ${tenantGuard}
    AND ki."status" = 'active'
    AND (ki."expiresAt" IS NULL OR ki."expiresAt" > NOW())
    AND kc."metadata"->>'sharedToUserApp' = 'true'
    AND kc."metadata"->>'sourceApp' = 'ingest_admin'
  `;
  const agentKnowledgeScope = Prisma.sql`
    (
      kc."metadata"->>'knowledgeBaseId' = ${scope.knowledgeBaseId}
      OR kc."metadata"->>'namespace' = ${scope.namespace}
      OR kc."metadata"->>'agentId' = ${scope.agentId}
    )
  `;
  const filters = [ownKnowledge];

  if (scope.includePublished || scope.includeShared) {
    filters.push(sharedBySourceType);
  }

  if (scope.includeShared) {
    filters.push(sharedByMetadata);
  }

  // userId is personal knowledge; tenant/app/shared filters are the only shared knowledge paths.
  // Never remove this guarded OR, or RAG will become an unsafe full-table query.
  return Prisma.sql`
    AND ki."deleted_at" IS NULL
    AND ${agentKnowledgeScope}
    AND (${Prisma.join(filters, " OR ")})
  `;
}

export function buildIngestSharedChunkMetadata(
  metadata: unknown,
  scope: {
    tenantId?: string | null;
    createdByUserId: string;
    agentId?: string | null;
    knowledgeBaseId?: string | null;
    namespace?: string | null;
  }
): Prisma.InputJsonObject {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>
    : {};
  const agentScope = resolveAgentKnowledgeScope(scope);

  return {
    ...base,
    source: "admin_ingest",
    sourceApp: "ingest_admin",
    appType: "knowledge_base",
    visibility: "published",
    published: true,
    enabled: true,
    shared: true,
    sharedToUserApp: true,
    tenantId: normalizeNullableString(scope.tenantId),
    createdByUserId: scope.createdByUserId,
    agentId: agentScope.agentId,
    knowledgeBaseId: agentScope.knowledgeBaseId,
    namespace: agentScope.namespace
  };
}

export async function getKnowledgeAccessCorpusVersion(scope: KnowledgeAccessScope) {
  const resolvedScope = await resolveKnowledgeAccessScope(scope);
  const latest = await prisma.knowledgeItem.findFirst({
    where: buildKnowledgeItemAccessWhere(resolvedScope),
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true }
  });

  return latest?.updatedAt.toISOString() ?? "empty";
}
