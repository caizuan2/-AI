import type { GptUserClientCallPlan } from "@/lib/enterprise/gpt-user-client-call-plan";
import type { KnowledgeFactoryV2Result } from "@/lib/enterprise/knowledge-factory-v2";
import type { KnowledgeFactoryV3Result } from "@/lib/enterprise/knowledge-factory-v3";
import type { KnowledgeFactoryV4Result } from "@/lib/enterprise/knowledge-factory-v4";
import type { KnowledgeFactoryV5Result } from "@/lib/enterprise/knowledge-factory-v5";
import type { KnowledgeEvolutionResult } from "@/lib/enterprise/knowledge-evolution-engine";
import type {
  KnowledgeLoopCandidate,
  KnowledgeLoopResult,
  KnowledgeStoreDecision
} from "@/lib/enterprise/knowledge-loop-engine";
import type {
  KnowledgeMemoryPlan,
  KnowledgeMemoryReport
} from "@/lib/enterprise/knowledge-memory-adapter";

export type GptSaveRecommendation = "可以入库" | "暂缓入库" | "需要补充资料";

export interface GptKnowledgeDraft {
  title: string;
  summary: string;
  category: string;
  categories?: string[];
  tags: string[];
  standardQuestion: string;
  standardAnswer: string;
  standardQuestions?: string[];
  standardAnswers?: string[];
  scenarios: string[];
  sourceMaterials: string[];
  complianceNotes?: string[];
  saveRecommendation: GptSaveRecommendation;
  missingFields: string[];
  trainingScore: number;
  userClientCallPlan?: GptUserClientCallPlan;
  knowledgeFactory?: KnowledgeFactoryV2Result;
  knowledgeFactoryV3?: KnowledgeFactoryV3Result;
  knowledgeFactoryV4?: KnowledgeFactoryV4Result;
  knowledgeFactoryV5?: KnowledgeFactoryV5Result;
  knowledgeLoop?: KnowledgeLoopResult;
  evolution?: KnowledgeEvolutionResult;
  storeDecision?: KnowledgeStoreDecision;
  reusableKnowledgeUnits?: KnowledgeLoopCandidate[];
  reviewRequiredUnits?: KnowledgeLoopCandidate[];
  autoStoreCandidates?: KnowledgeLoopCandidate[];
  memory?: KnowledgeMemoryReport;
  memoryPlan?: KnowledgeMemoryPlan;
  knowledgeIntelligence?: {
    overallScore?: number;
    qualityLevel?: "high" | "medium" | "low";
    highValueCount?: number;
    reviewRequiredCount?: number;
    lowQualityCount?: number;
    improvementSuggestions?: string[];
  };
  ragOptimization?: {
    ragFitScore?: number;
    suggestedQueries?: string[];
    retrievalHints?: string[];
    rerankHints?: string[];
    warnings?: string[];
  };
}

export interface GptStructuredKnowledge {
  title: string;
  category: string;
  summary: string;
  tags: string[];
  question: string;
  answer: string;
  confidence: number;
  saveSuggestion: boolean;
  followUpQuestions: string[];
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, limit)
    : [];
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(numberValue)));
}

function fallbackTitle(input: string, category: string) {
  const firstLine = input.split("\n").find((line) => line.trim())?.trim() ?? "";

  if (firstLine) {
    return firstLine.length > 32 ? `${firstLine.slice(0, 32)}...` : firstLine;
  }

  return `${category.replace("知识库", "") || "管理员"}投喂知识`;
}

function inferCategory(input: string, fallback: string) {
  if (fallback) {
    return fallback;
  }

  if (/退款|售后|换货|保修|工单|退货/.test(input)) {
    return "售后知识库";
  }

  if (/价格|报价|客户|异议|话术|咨询/.test(input)) {
    return "客服话术库";
  }

  if (/产品|功能|版本|套餐|权益/.test(input)) {
    return "产品知识库";
  }

  if (/制度|审批|流程|规范|报销|考勤/.test(input)) {
    return "企业制度库";
  }

  return "默认知识库";
}

function normalizeRecommendation(value: unknown, score: number, missingFields: string[]): GptSaveRecommendation {
  const text = readString(value);

  if (text === "可以入库" || text === "暂缓入库" || text === "需要补充资料") {
    return text;
  }

  if (/补充|缺少|资料不足/.test(text) || missingFields.length > 0) {
    return "需要补充资料";
  }

  if (/暂缓|复核|不建议|不要/.test(text) || score < 72) {
    return "暂缓入库";
  }

  return "可以入库";
}

function readDraftRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readOptionalRecord<T>(value: unknown): T | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as T
    : undefined;
}

export function normalizeGptKnowledgeDraft(input: {
  parsed?: Record<string, unknown> | null;
  originalInput: string;
  fallbackCategory?: string;
}): GptKnowledgeDraft {
  const parsed = input.parsed ?? {};
  const nested = readDraftRecord(parsed.knowledgeDraft);
  const category = inferCategory(input.originalInput, readString(nested.category) || readString(parsed.category) || input.fallbackCategory || "");
  const title = readString(nested.title) || readString(parsed.title) || fallbackTitle(input.originalInput, category);
  const summary = readString(nested.summary) || readString(parsed.summary) || input.originalInput.slice(0, 260);
  const standardQuestion = readString(nested.standardQuestion)
    || readString(parsed.question)
    || `关于“${title}”，一线人员应该如何处理？`;
  const standardAnswer = readString(nested.standardAnswer)
    || readString(parsed.answer)
    || summary
    || `建议按当前 ${category} 的知识口径处理，并补充来源、适用场景和标准回复。`;
  const tags = readStringArray(nested.tags).length > 0
    ? readStringArray(nested.tags)
    : readStringArray(parsed.tags);
  const missingFields = readStringArray(nested.missingFields ?? parsed.missingFields, 6);
  const trainingScore = readNumber(nested.trainingScore ?? parsed.confidence, 82);
  const standardQuestions = readStringArray(nested.standardQuestions ?? parsed.standardQuestions, 10);
  const standardAnswers = readStringArray(nested.standardAnswers ?? parsed.standardAnswers, 10);
  const categories = readStringArray(nested.categories ?? parsed.categories, 8);

  return {
    title,
    summary,
    category,
    categories: categories.length > 0 ? categories : [category],
    tags: tags.length > 0 ? tags : [category.replace("知识库", ""), "GPT投喂"].filter(Boolean),
    standardQuestion,
    standardAnswer,
    standardQuestions: standardQuestions.length > 0 ? standardQuestions : [standardQuestion],
    standardAnswers: standardAnswers.length > 0 ? standardAnswers : [standardAnswer],
    scenarios: readStringArray(nested.scenarios ?? parsed.scenarios, 6),
    sourceMaterials: readStringArray(nested.sourceMaterials ?? parsed.sourceMaterials, 6),
    complianceNotes: readStringArray(nested.complianceNotes ?? parsed.complianceNotes, 8),
    saveRecommendation: normalizeRecommendation(nested.saveRecommendation ?? parsed.saveRecommendation, trainingScore, missingFields),
    missingFields,
    trainingScore,
    knowledgeIntelligence: readOptionalRecord<GptKnowledgeDraft["knowledgeIntelligence"]>(nested.knowledgeIntelligence ?? parsed.knowledgeIntelligence),
    ragOptimization: readOptionalRecord<GptKnowledgeDraft["ragOptimization"]>(nested.ragOptimization ?? parsed.ragOptimization)
  };
}

export function knowledgeDraftToStructured(input: {
  draft: GptKnowledgeDraft;
  followUpQuestions?: string[];
}): GptStructuredKnowledge {
  return {
    title: input.draft.title,
    category: input.draft.category,
    summary: input.draft.summary,
    tags: input.draft.tags,
    question: input.draft.standardQuestion,
    answer: input.draft.standardAnswer,
    confidence: input.draft.trainingScore,
    saveSuggestion: input.draft.saveRecommendation === "可以入库",
    followUpQuestions: input.followUpQuestions ?? []
  };
}
