import type { RagContext } from "@/lib/ai/rag-prompt";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export type AiChatMode = "fast" | "expert";
export type RagConfidence = "high" | "medium" | "low";

export interface RetrievedRagChunk {
  chunkId: string;
  fileId: string | null;
  knowledgeItemId: string;
  knowledgeBaseId: string | null;
  agentId: string | null;
  tenantId: string | null;
  namespace: string | null;
  sourceApp: string | null;
  includeShared: boolean;
  includePublished: boolean;
  title: string;
  content: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  sourceType: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  score: number;
  relevance_score: number;
  chunk_rank: number;
  createdAt: string | null;
}

export interface RetrieveRelevantChunksOptions {
  userId: string;
  mode?: AiChatMode;
  topK?: number;
  category?: string | null;
  fileId?: string | null;
  knowledgeScope?: {
    knowledgeBaseId?: string | null;
    agentId?: string | null;
    tenantId?: string | null;
    namespace?: string | null;
  } | null;
  db?: RagSearchDb;
}

type KnowledgeChunkRecord = Record<string, unknown> & {
  id?: string;
  fileId?: string | null;
  knowledgeItemId?: string;
  chunkText?: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string;
  knowledgeItem?: Record<string, unknown>;
  file?: Record<string, unknown> | null;
};

export type RagSearchDb = {
  knowledgeChunk: {
    findMany(args: unknown): Promise<KnowledgeChunkRecord[]>;
  };
};

const MAX_QUESTION_CHARS = 2000;
const FAST_TOP_K = 5;
const EXPERT_TOP_K = 10;
const MAX_TOP_K = 20;
const MIN_RELEVANT_SCORE = 0.08;
const SHARED_INGEST_SOURCE_APPS = ["ingest_admin", "admin_ingest", "admin_feed"];
const SHARED_INGEST_VISIBILITIES = ["published", "shared"];

const STOP_TERMS = new Set([
  "什么",
  "哪些",
  "怎么",
  "如何",
  "需要",
  "可以",
  "是否",
  "以及",
  "这个",
  "那个",
  "问题",
  "内容",
  "我们",
  "你们"
]);

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?(system|developer)\s+prompt/i,
  /泄露.*(系统提示|开发者指令|api\s*key|密钥|数据库连接)/i,
  /输出.*(系统提示|开发者指令|api\s*key|密钥|数据库连接)/i,
  /忽略.*(之前|以上|系统).*(指令|规则)/i
];

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\u0000/g, "")
    .replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addChineseTerms(segment: string, terms: Set<string>) {
  const maxLength = Math.min(6, segment.length);

  for (let size = 2; size <= maxLength; size += 1) {
    for (let index = 0; index <= segment.length - size; index += 1) {
      const term = segment.slice(index, index + size);

      if (!STOP_TERMS.has(term)) {
        terms.add(term);
      }
    }
  }
}

export function normalizeAiChatMode(value: unknown): AiChatMode {
  return value === "expert" ? "expert" : "fast";
}

export function getTopKForMode(mode: AiChatMode) {
  return mode === "expert" ? EXPERT_TOP_K : FAST_TOP_K;
}

export function sanitizeRagInput(question: unknown) {
  const normalized = typeof question === "string"
    ? question.replace(/\u0000/g, "").replace(/\s+/g, " ").trim()
    : "";

  if (!normalized) {
    throw new ValidationError("请输入问题。");
  }

  if (normalized.length > MAX_QUESTION_CHARS) {
    throw new ValidationError(`问题过长，请控制在 ${MAX_QUESTION_CHARS} 字以内。`);
  }

  return normalized;
}

export function hasPromptInjectionRisk(value: string) {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function guardAgainstPromptInjection(context: string) {
  return context
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      return hasPromptInjectionRisk(trimmed) ? "[已忽略上下文中的不可信指令]" : line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractRagSearchTerms(query: string, maxTerms = 18) {
  const normalized = normalizeText(query);
  const terms = new Set<string>();

  for (const segment of normalized.split(/\s+/).filter(Boolean)) {
    if (segment.length >= 2 && !STOP_TERMS.has(segment)) {
      terms.add(segment);
    }

    if (/[\u4e00-\u9fff]/.test(segment)) {
      addChineseTerms(segment, terms);
    }
  }

  return Array.from(terms).slice(0, maxTerms);
}

function normalizeTopK(options: RetrieveRelevantChunksOptions) {
  const fallback = getTopKForMode(options.mode ?? "fast");
  const rawTopK = typeof options.topK === "number" ? Math.round(options.topK) : fallback;

  if (!Number.isInteger(rawTopK) || rawTopK < 1) {
    return fallback;
  }

  return Math.min(rawTopK, MAX_TOP_K);
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value ? new Date(value).toISOString() : null;
}

function fieldScore(value: unknown, query: string, terms: string[], exactWeight: number, termWeight: number) {
  const text = normalizeText(typeof value === "string" ? value : "");

  if (!text) {
    return 0;
  }

  let score = text.includes(normalizeText(query)) ? exactWeight : 0;

  for (const term of terms) {
    if (term && text.includes(term.toLowerCase())) {
      score += termWeight;
    }
  }

  return score;
}

function extractExplicitIdentifiers(query: string) {
  return Array.from(query.matchAll(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+){2,}/g))
    .map((match) => match[0].toLowerCase())
    .filter((value, index, values) => value.length >= 8 && values.indexOf(value) === index);
}

function hasExplicitIdentifierMatch(row: KnowledgeChunkRecord, query: string) {
  const item = row.knowledgeItem ?? {};
  const identifiers = extractExplicitIdentifiers(query);

  if (identifiers.length === 0) {
    return false;
  }

  const haystack = [
    row.chunkText,
    row.summary,
    item.title,
    item.summary,
    item.sourceTitle
  ]
    .map((value) => typeof value === "string" ? value.toLowerCase() : "")
    .join(" ");

  return identifiers.some((identifier) => haystack.includes(identifier));
}

function identifierScore(row: KnowledgeChunkRecord, query: string) {
  return hasExplicitIdentifierMatch(row, query) ? 0.36 : 0;
}

function scoreChunk(row: KnowledgeChunkRecord, query: string, terms: string[]) {
  const item = row.knowledgeItem ?? {};
  const tags = toStringArray(item.tags);
  let score = 0;

  score += identifierScore(row, query);
  score += fieldScore(row.chunkText, query, terms, 0.44, 0.08);
  score += fieldScore(row.summary, query, terms, 0.2, 0.04);
  score += fieldScore(item.title, query, terms, 0.28, 0.06);
  score += fieldScore(item.summary, query, terms, 0.18, 0.04);
  score += fieldScore(item.category, query, terms, 0.14, 0.03);
  score += fieldScore(item.sourceTitle, query, terms, 0.12, 0.03);

  for (const tag of tags) {
    score += fieldScore(tag, query, terms, 0.08, 0.02);
  }

  return clamp01(score);
}

function metadataEqualsAny(path: string, values: string[]) {
  return values.map((value) => ({
    metadata: {
      path: [path],
      equals: value
    }
  }));
}

function cleanScopeValue(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function hasKnowledgeScope(options: RetrieveRelevantChunksOptions) {
  const scope = options.knowledgeScope;

  return Boolean(
    cleanScopeValue(scope?.knowledgeBaseId)
    || cleanScopeValue(scope?.agentId)
    || cleanScopeValue(scope?.tenantId)
    || cleanScopeValue(scope?.namespace)
  );
}

function metadataEqualsAnyPath(paths: string[], value: string) {
  return {
    OR: paths.map((path) => ({
      metadata: {
        path: [path],
        equals: value
      }
    }))
  };
}

function buildKnowledgeScopeWhere(options: RetrieveRelevantChunksOptions) {
  const scope = options.knowledgeScope;

  if (!scope) {
    return [];
  }

  const knowledgeBaseId = cleanScopeValue(scope.knowledgeBaseId);
  const agentId = cleanScopeValue(scope.agentId);
  const tenantId = cleanScopeValue(scope.tenantId);
  const namespace = cleanScopeValue(scope.namespace);
  const filters = [];

  if (knowledgeBaseId) {
    filters.push(metadataEqualsAnyPath(["knowledgeBaseId", "kb_id", "kbId"], knowledgeBaseId));
  }

  if (agentId) {
    filters.push(metadataEqualsAnyPath(["agentId", "expert_id", "expertId"], agentId));
  }

  if (tenantId) {
    filters.push(metadataEqualsAnyPath(["tenantId", "tenant_id"], tenantId));
  }

  if (namespace && namespace !== tenantId) {
    filters.push(metadataEqualsAnyPath(["namespace"], namespace));
  }

  return filters;
}

function buildSharedIngestKnowledgeWhere(options: RetrieveRelevantChunksOptions) {
  return {
    AND: [
      ...buildKnowledgeScopeWhere(options),
      {
        OR: [
          ...metadataEqualsAny("sourceApp", SHARED_INGEST_SOURCE_APPS),
          ...metadataEqualsAny("source", SHARED_INGEST_SOURCE_APPS)
        ]
      },
      {
        OR: [
          {
            metadata: {
              path: ["sharedToUserApp"],
              equals: true
            }
          },
          {
            metadata: {
              path: ["published"],
              equals: true
            }
          },
          ...metadataEqualsAny("visibility", SHARED_INGEST_VISIBILITIES)
        ]
      },
      {
        knowledgeItem: {
          is: {
            deletedAt: null,
            status: {
              in: ["active", "published"]
            },
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ],
            ...(options.category ? { category: options.category } : {})
          }
        }
      }
    ]
  };
}

function buildPrismaWhere(userId: string, terms: string[], options: RetrieveRelevantChunksOptions) {
  const termFilters = terms.map((term) => ({
    OR: [
      { chunkText: { contains: term, mode: "insensitive" as const } },
      { summary: { contains: term, mode: "insensitive" as const } },
      {
        knowledgeItem: {
          is: {
            OR: [
              { title: { contains: term, mode: "insensitive" as const } },
              { summary: { contains: term, mode: "insensitive" as const } },
              { content: { contains: term, mode: "insensitive" as const } },
              { category: { contains: term, mode: "insensitive" as const } },
              { sourceTitle: { contains: term, mode: "insensitive" as const } },
              { tags: { has: term } }
            ]
          }
        }
      }
    ]
  }));

  const accessWhere = hasKnowledgeScope(options)
    ? buildSharedIngestKnowledgeWhere(options)
    : {
        OR: [
          {
            knowledgeItem: {
              is: {
                userId,
                deletedAt: null,
                ...(options.category ? { category: options.category } : {})
              }
            }
          },
          buildSharedIngestKnowledgeWhere(options)
        ]
      };

  return {
    ...(options.fileId ? { fileId: options.fileId } : {}),
    AND: [
      accessWhere,
      {
        OR: [
          { fileId: null },
          {
            file: {
              is: {
                deletedAt: null
              }
            }
          }
        ]
      }
    ],
    ...(termFilters.length > 0 ? { OR: termFilters } : {})
  };
}

function metadataString(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function metadataBoolean(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const record = metadata as Record<string, unknown>;

  return keys.some((key) => record[key] === true);
}

function toRetrievedChunk(row: KnowledgeChunkRecord, score: number): RetrievedRagChunk {
  const item = row.knowledgeItem ?? {};
  const metadata = row.metadata ?? null;
  const tenantId = metadataString(metadata, ["tenantId", "tenant_id"]);

  return {
    chunkId: String(row.id ?? ""),
    fileId: typeof row.fileId === "string" ? row.fileId : null,
    knowledgeItemId: String(row.knowledgeItemId ?? item.id ?? ""),
    knowledgeBaseId: metadataString(metadata, ["knowledgeBaseId", "kb_id", "kbId"]),
    agentId: metadataString(metadata, ["agentId", "expert_id", "expertId"]),
    tenantId,
    namespace: metadataString(metadata, ["namespace"]) ?? tenantId,
    sourceApp: metadataString(metadata, ["sourceApp", "source"]),
    includeShared: metadataBoolean(metadata, ["sharedToUserApp", "shared"]),
    includePublished: metadataBoolean(metadata, ["published"]),
    title: String(item.title ?? row.file?.originalName ?? "知识库资料"),
    content: String(row.chunkText ?? ""),
    summary: typeof row.summary === "string"
      ? row.summary
      : typeof item.summary === "string"
        ? item.summary
        : null,
    category: typeof item.category === "string" ? item.category : null,
    tags: toStringArray(item.tags),
    sourceType: typeof item.sourceType === "string" ? item.sourceType : null,
    sourceTitle: typeof item.sourceTitle === "string" ? item.sourceTitle : null,
    sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
    score,
    relevance_score: score,
    chunk_rank: 0,
    createdAt: toIsoString(row.createdAt ?? item.createdAt)
  };
}

export async function retrieveRelevantChunks(query: string, options: RetrieveRelevantChunksOptions) {
  const safeQuery = sanitizeRagInput(query);
  const terms = extractRagSearchTerms(safeQuery);

  if (terms.length === 0) {
    return [];
  }

  const topK = normalizeTopK(options);
  const db = options.db ?? (prisma as unknown as RagSearchDb);
  const rows = await db.knowledgeChunk.findMany({
    where: buildPrismaWhere(options.userId, terms, options),
    take: Math.min(topK * 4, 80),
    orderBy: [
      {
        knowledgeItem: {
          importance: "desc"
        }
      },
      {
        knowledgeItem: {
          updatedAt: "desc"
        }
      }
    ],
    include: {
      knowledgeItem: true,
      file: {
        select: {
          id: true,
          originalName: true,
          deletedAt: true
        }
      }
    }
  });

  return rows
    .map((row) => ({
      chunk: toRetrievedChunk(row, scoreChunk(row, safeQuery, terms)),
      score: scoreChunk(row, safeQuery, terms),
      identifierMatch: hasExplicitIdentifierMatch(row, safeQuery)
    }))
    .filter((item) => item.chunk.chunkId && item.chunk.content && item.score >= MIN_RELEVANT_SCORE)
    .sort((left, right) => (
      Number(right.identifierMatch) - Number(left.identifierMatch)
      || right.score - left.score
    ))
    .slice(0, topK)
    .map((item, index) => ({
      ...item.chunk,
      chunk_rank: index + 1,
    }));
}

export function buildRagContext(chunks: RetrievedRagChunk[]): RagContext[] {
  return chunks
    .map((chunk) => ({
      id: chunk.knowledgeItemId,
      title: chunk.title,
      content: guardAgainstPromptInjection(chunk.content),
      summary: chunk.summary ?? undefined,
      category: chunk.category ?? undefined,
      tags: chunk.tags,
      sourceType: chunk.sourceType ?? undefined,
      sourceId: chunk.chunkId,
      sourceTitle: chunk.sourceTitle,
      sourceUrl: chunk.sourceUrl,
      score: chunk.score,
      relevance_score: chunk.relevance_score,
      chunk_rank: chunk.chunk_rank,
      similarity: chunk.score
    }))
    .filter((context) => context.content);
}

export function calculateConfidence(chunks: RetrievedRagChunk[]): RagConfidence {
  if (chunks.length === 0) {
    return "low";
  }

  const bestScore = Math.max(...chunks.map((chunk) => chunk.score));

  if (bestScore >= 0.68 && chunks.length >= 2) {
    return "high";
  }

  if (bestScore >= 0.28) {
    return "medium";
  }

  return "low";
}
