import "server-only";

import { AnalyticsEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildKnowledgeChunkAccessWhere,
  buildKnowledgeItemAccessWhere,
  resolveKnowledgeAccessScope,
  type KnowledgeAccessScope,
  type ResolvedKnowledgeAccessScope
} from "@/lib/enterprise/knowledge-access-scope";

export type KnowledgeOSCoreDataSourceInput = KnowledgeAccessScope & {
  limit?: number | null;
};

export type KnowledgeOSCoreDataSource = {
  accessScope: ResolvedKnowledgeAccessScope;
  knowledgeItems: Array<{
    id: string;
    title: string;
    status: string;
    sourceType: string;
    sourceTitle: string | null;
    clarityScore: number;
    completenessScore: number;
    usefulnessScore: number;
    confidenceScore: number;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      chunks: number;
    };
  }>;
  knowledgeChunks: Array<{
    id: string;
    knowledgeItemId: string;
    contentHash: string | null;
    metadata: unknown;
    createdAt: Date;
    tokenCount: number | null;
    charCount: number | null;
    knowledgeItem: {
      title: string;
      status: string;
      sourceType: string;
      sourceTitle: string | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    };
  }>;
  feedbackEvents: Array<{
    id: string;
    userId: string | null;
    numericValue: number | null;
    metadata: unknown;
    occurredAt: Date;
    createdAt: Date;
  }>;
  behaviorEvents: Array<{
    id: string;
    userId: string | null;
    numericValue: number | null;
    metadata: unknown;
    occurredAt: Date;
    createdAt: Date;
  }>;
  diagnostics: {
    warnings: string[];
  };
};

function readLimit(value: number | null | undefined) {
  const numeric = Number(value ?? 300);

  return Number.isFinite(numeric)
    ? Math.max(1, Math.min(1000, Math.round(numeric)))
    : 300;
}

function eventScopeWhere(scope: ResolvedKnowledgeAccessScope, governanceEvent: string) {
  return {
    userId: scope.actorUserId,
    type: AnalyticsEventType.RAG_RETRIEVAL,
    metadata: {
      path: ["governanceEvent"],
      equals: governanceEvent
    }
  } as const;
}

export async function loadKnowledgeOSCoreData(input: KnowledgeOSCoreDataSourceInput): Promise<KnowledgeOSCoreDataSource> {
  const limit = readLimit(input.limit);
  const accessScope = await resolveKnowledgeAccessScope({
    ...input,
    appType: input.appType ?? "ingest_admin",
    includePublished: input.includePublished ?? true
  });
  const [knowledgeItems, knowledgeChunks, feedbackEvents, behaviorEvents] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: buildKnowledgeItemAccessWhere(accessScope),
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        sourceType: true,
        sourceTitle: true,
        clarityScore: true,
        completenessScore: true,
        usefulnessScore: true,
        confidenceScore: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            chunks: true
          }
        }
      }
    }),
    prisma.knowledgeChunk.findMany({
      where: buildKnowledgeChunkAccessWhere(accessScope),
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        knowledgeItemId: true,
        contentHash: true,
        metadata: true,
        createdAt: true,
        tokenCount: true,
        charCount: true,
        knowledgeItem: {
          select: {
            title: true,
            status: true,
            sourceType: true,
            sourceTitle: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    }),
    prisma.analyticsEvent.findMany({
      where: eventScopeWhere(accessScope, "answer_feedback"),
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        numericValue: true,
        metadata: true,
        occurredAt: true,
        createdAt: true
      }
    }),
    prisma.analyticsEvent.findMany({
      where: eventScopeWhere(accessScope, "behavior_signal"),
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        numericValue: true,
        metadata: true,
        occurredAt: true,
        createdAt: true
      }
    })
  ]);

  return {
    accessScope,
    knowledgeItems,
    knowledgeChunks,
    feedbackEvents,
    behaviorEvents,
    diagnostics: {
      warnings: []
    }
  };
}
