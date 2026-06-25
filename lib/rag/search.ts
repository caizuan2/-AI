import type { RagContext } from "@/lib/ai/rag-prompt";
import {
  buildKnowledgeChunkAccessWhere,
  resolveKnowledgeAccessScope
} from "@/lib/enterprise/knowledge-access-scope";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export type AiChatMode = "fast" | "expert";
export type RagConfidence = "high" | "medium" | "low";

export interface RetrievedRagChunk {
  chunkId: string;
  fileId: string | null;
  knowledgeItemId: string;
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
  tenantId?: string | null;
  appType?: string | null;
  agentId?: string | null;
  includeShared?: boolean;
  includePublished?: boolean;
  mode?: AiChatMode;
  topK?: number;
  category?: string | null;
  fileId?: string | null;
  db?: RagSearchDb;
}

type KnowledgeChunkRecord = Record<string, unknown> & {
  id?: string;
  fileId?: string | null;
  knowledgeItemId?: string;
  chunkText?: string;
  summary?: string | null;
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

function scoreChunk(row: KnowledgeChunkRecord, query: string, terms: string[]) {
  const item = row.knowledgeItem ?? {};
  const tags = toStringArray(item.tags);
  let score = 0;

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

async function buildPrismaWhere(terms: string[], options: RetrieveRelevantChunksOptions) {
  const accessScope = await resolveKnowledgeAccessScope({
    actorUserId: options.userId,
    tenantId: options.tenantId,
    appType: options.appType,
    agentId: options.agentId,
    includeShared: options.includeShared === true || Boolean(options.tenantId),
    includePublished: options.includePublished === true || Boolean(options.tenantId)
  });
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

  return {
    ...(options.fileId ? { fileId: options.fileId } : {}),
    AND: [
      buildKnowledgeChunkAccessWhere(accessScope),
      ...(options.category
        ? [{
            knowledgeItem: {
              is: {
                category: options.category
              }
            }
          }]
        : []),
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

function toRetrievedChunk(row: KnowledgeChunkRecord, score: number): RetrievedRagChunk {
  const item = row.knowledgeItem ?? {};

  return {
    chunkId: String(row.id ?? ""),
    fileId: typeof row.fileId === "string" ? row.fileId : null,
    knowledgeItemId: String(row.knowledgeItemId ?? item.id ?? ""),
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
  const where = await buildPrismaWhere(terms, options);
  const rows = await db.knowledgeChunk.findMany({
    where,
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
      score: scoreChunk(row, safeQuery, terms)
    }))
    .filter((item) => item.chunk.chunkId && item.chunk.content && item.score >= MIN_RELEVANT_SCORE)
    .sort((left, right) => right.score - left.score)
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
