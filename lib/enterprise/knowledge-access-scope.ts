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
  includeShared?: boolean;
  includePublished?: boolean;
};

export type ResolvedKnowledgeAccessScope = Required<
  Pick<KnowledgeAccessScope, "actorUserId" | "includeShared" | "includePublished">
> & {
  tenantId: string | null;
  appType: string | null;
  agentId: string | null;
};

function normalizeNullableString(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";

  return text || null;
}

export async function resolveKnowledgeAccessScope(scope: KnowledgeAccessScope): Promise<ResolvedKnowledgeAccessScope> {
  const explicitTenantId = normalizeNullableString(scope.tenantId);
  let tenantId = explicitTenantId;

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
    agentId: normalizeNullableString(scope.agentId),
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

export function buildKnowledgeItemAccessWhere(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeItemWhereInput {
  const orFilters: Prisma.KnowledgeItemWhereInput[] = [
    {
      userId: scope.actorUserId,
      deletedAt: null
    }
  ];

  if (scope.includePublished || scope.includeShared) {
    orFilters.push({
      ...activeKnowledgeWhere(),
      ...sharedTenantGuard(scope),
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

  void scope.agentId;

  return filters;
}

export function buildKnowledgeChunkAccessWhere(scope: ResolvedKnowledgeAccessScope): Prisma.KnowledgeChunkWhereInput {
  const orFilters: Prisma.KnowledgeChunkWhereInput[] = [
    {
      knowledgeItem: {
        is: {
          userId: scope.actorUserId,
          deletedAt: null
        }
      }
    }
  ];

  if (scope.includePublished || scope.includeShared) {
    orFilters.push({
      knowledgeItem: {
        is: {
          ...activeKnowledgeWhere(),
          ...sharedTenantGuard(scope),
          sourceType: {
            in: [...adminIngestKnowledgeSourceTypes]
          }
        }
      }
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
    AND (${Prisma.join(filters, " OR ")})
  `;
}

export function buildIngestSharedChunkMetadata(
  metadata: unknown,
  scope: {
    tenantId?: string | null;
    createdByUserId: string;
    agentId?: string | null;
  }
): Prisma.InputJsonObject {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>
    : {};

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
    agentId: normalizeNullableString(scope.agentId)
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
