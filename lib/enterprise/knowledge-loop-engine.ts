import {
  KnowledgeIntelligenceEngine,
  type KnowledgeIntelligenceAction,
  type KnowledgeQualityLevel
} from "@/lib/enterprise/knowledge-intelligence-engine";
import { RAGQualityOptimizer } from "@/lib/enterprise/rag-quality-optimizer";

export type KnowledgeCandidateType =
  | "concept"
  | "faq"
  | "sop"
  | "scenario"
  | "sales_script"
  | "objection_handling";

export type KnowledgeCandidateSource = "conversation" | "document" | "ppt" | "word" | "manual";
export type KnowledgeStoreAction = "auto_store" | "review_required" | "do_not_store";

export interface KnowledgeCandidateScore {
  clarity: number;
  usefulness: number;
  reusability: number;
  confidence: number;
}

export interface KnowledgeLoopCandidate {
  id: string;
  type: KnowledgeCandidateType;
  title: string;
  content: string;
  source: KnowledgeCandidateSource;
  tags: string[];
  scenario?: string;
  standardQuestion?: string;
  standardAnswer?: string;
  sopSteps?: string[];
  customerScript?: string;
  reusable: boolean;
  score: KnowledgeCandidateScore;
  storeAction: KnowledgeStoreAction;
  reason: string;
  retrievalHints: string[];
  indexHints: string[];
  suggestedQuestions: string[];
  intelligence?: {
    qualityScore: number;
    qualityLevel: KnowledgeQualityLevel;
    action: KnowledgeIntelligenceAction;
    reasons: string[];
    suggestions: string[];
  };
  ragOptimization?: {
    ragFitScore: number;
    retrievalHints: string[];
    indexHints: string[];
    suggestedQueries: string[];
  };
  qualityScore?: number;
  intelligenceAction?: KnowledgeIntelligenceAction;
  ragFitScore?: number;
  improvementHints?: string[];
  reviewReason?: string;
}

export interface KnowledgeLoopDraft {
  title: string;
  summary: string;
  candidates: KnowledgeLoopCandidate[];
  tags: string[];
  retrievalHints: string[];
  indexHints: string[];
  suggestedQuestions: string[];
}

export interface KnowledgeStoreDecision {
  action: KnowledgeStoreAction;
  reason: string;
  autoStoreEnabled: boolean;
  requiresReview: boolean;
  autoStoreCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  recommendedAction: string;
}

export interface KnowledgeLoopResult {
  version: "knowledge_loop_v1";
  visibleReply?: string;
  candidates: KnowledgeLoopCandidate[];
  draft: KnowledgeLoopDraft;
  storeDecision: KnowledgeStoreDecision;
  reusableCount: number;
  reviewCount: number;
  rejectedCount: number;
  autoStoreEnabled: boolean;
  requiresReview: boolean;
  retrievalHints: string[];
  indexHints: string[];
  suggestedQuestions: string[];
  reuseHints: string[];
  diagnostics: string[];
}

export interface KnowledgeLoopInput {
  text: string;
  replyMarkdown?: string;
  draft?: {
    title?: string;
    summary?: string;
    category?: string;
    tags?: string[];
    standardQuestion?: string;
    standardAnswer?: string;
    scenarios?: string[];
  };
  source?: KnowledgeCandidateSource;
  autoStoreAvailable?: boolean;
}

const AUTO_STORE_THRESHOLD = 0.82;
const REVIEW_THRESHOLD = 0.58;

function clampScore(value: number) {
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return compactText(value)
    .toLowerCase()
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, "")
    .slice(0, 80);
}

function splitMeaningfulBlocks(text: string) {
  const blocks = text
    .split(/\n{2,}|[。！？!?]\s*/g)
    .map((item) => item.replace(/^[-*\d.\s]+/, "").trim())
    .filter((item) => item.length >= 12);

  return blocks.length ? blocks : [text.trim()].filter(Boolean);
}

function extractTags(text: string, fallback: string[] = []) {
  const tags = new Set<string>();
  const keywordMap: Array<[RegExp, string]> = [
    [/客户|用户|咨询|售前/, "客户沟通"],
    [/退款|售后|换货|保修/, "售后"],
    [/步骤|流程|SOP|操作/, "流程"],
    [/话术|回复|怎么说/, "话术"],
    [/价格|报价|成交|转化/, "销售"],
    [/风险|注意|合规/, "风险"],
    [/产品|功能|版本/, "产品"]
  ];

  for (const [pattern, tag] of keywordMap) {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  }

  for (const tag of fallback) {
    const clean = tag.trim();

    if (clean) {
      tags.add(clean);
    }
  }

  return Array.from(tags).slice(0, 8);
}

function makeTitle(text: string, fallback = "待入库知识草稿") {
  const clean = compactText(text).replace(/^#+\s*/, "");

  if (!clean) {
    return fallback;
  }

  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean;
}

function averageScore(score: KnowledgeCandidateScore) {
  return (score.clarity + score.usefulness + score.reusability + score.confidence) / 4;
}

function sourceFromInput(input: KnowledgeLoopInput): KnowledgeCandidateSource {
  return input.source ?? "conversation";
}

export class KnowledgeLoopEngine {
  private readonly autoStoreAvailable: boolean;
  private readonly maxCandidates: number;

  constructor(options: { autoStoreAvailable?: boolean; maxCandidates?: number } = {}) {
    this.autoStoreAvailable = options.autoStoreAvailable ?? false;
    this.maxCandidates = options.maxCandidates ?? 8;
  }

  processConversation(input: KnowledgeLoopInput | string): KnowledgeLoopResult {
    const normalizedInput = typeof input === "string" ? { text: input } : input;
    const autoStoreAvailable = normalizedInput.autoStoreAvailable ?? this.autoStoreAvailable;
    const candidates = this.deduplicateCandidates(this.extractKnowledgeCandidates(normalizedInput))
      .map((candidate) => candidate.storeAction === "auto_store" && !autoStoreAvailable
        ? {
            ...candidate,
            storeAction: "review_required" as const,
            reason: "当前项目无安全自动入库接口，已生成待入库草稿"
          }
        : candidate);
    const draft = this.buildKnowledgeDraft(candidates, normalizedInput);
    const storeDecision = this.decideStoreAction(draft, autoStoreAvailable);
    const reuseHints = this.buildReuseHints(draft);

    return {
      version: "knowledge_loop_v1",
      visibleReply: normalizedInput.replyMarkdown,
      candidates,
      draft,
      storeDecision,
      reusableCount: candidates.filter((item) => item.reusable).length,
      reviewCount: candidates.filter((item) => item.storeAction === "review_required").length,
      rejectedCount: candidates.filter((item) => item.storeAction === "do_not_store").length,
      autoStoreEnabled: storeDecision.autoStoreEnabled,
      requiresReview: storeDecision.requiresReview,
      retrievalHints: draft.retrievalHints,
      indexHints: draft.indexHints,
      suggestedQuestions: draft.suggestedQuestions,
      reuseHints,
      diagnostics: [
        `candidate_count=${candidates.length}`,
        `store_action=${storeDecision.action}`,
        `auto_store_enabled=${storeDecision.autoStoreEnabled}`
      ]
    };
  }

  extractKnowledgeCandidates(input: KnowledgeLoopInput): KnowledgeLoopCandidate[] {
    const draftText = [
      input.draft?.title,
      input.draft?.summary,
      input.draft?.standardQuestion,
      input.draft?.standardAnswer,
      ...(input.draft?.scenarios ?? [])
    ].filter(Boolean).join("\n");
    const content = [input.text, input.replyMarkdown, draftText]
      .filter(Boolean)
      .map((item) => String(item))
      .join("\n\n");
    const blocks = splitMeaningfulBlocks(content).slice(0, this.maxCandidates);
    const intelligenceEngine = new KnowledgeIntelligenceEngine();
    const ragOptimizer = new RAGQualityOptimizer();

    return blocks.map((block, index) => {
      const type = this.classifyKnowledge(block);
      const tags = extractTags(block, input.draft?.tags);
      const score = this.scoreKnowledge(block);
      const action = this.decideCandidateAction(score);
      const title = makeTitle(block, input.draft?.title);
      const baseCandidate: KnowledgeLoopCandidate = {
        id: `ku-${Date.now()}-${index}`,
        type,
        title,
        content: compactText(block),
        source: sourceFromInput(input),
        tags,
        scenario: /场景|如果|当客户|适合/.test(block) ? title : undefined,
        standardQuestion: type === "faq" ? this.buildQuestion(block, title) : undefined,
        standardAnswer: type === "faq" ? compactText(block) : undefined,
        sopSteps: type === "sop" ? this.buildSopSteps(block) : undefined,
        customerScript: type === "sales_script" || type === "objection_handling" ? compactText(block) : undefined,
        reusable: action !== "do_not_store",
        score,
        storeAction: action,
        reason: this.reasonForAction(action, score),
        retrievalHints: this.buildRetrievalHints(block, tags),
        indexHints: this.buildIndexHints(type, tags),
        suggestedQuestions: this.buildSuggestedQuestions(block, title, type)
      };
      const intelligence = intelligenceEngine.evaluateKnowledgeQuality(baseCandidate);
      const ragOptimization = ragOptimizer.buildRagOptimizationForUnit(baseCandidate);
      const retrievalHints = Array.from(new Set([
        ...baseCandidate.retrievalHints,
        ...ragOptimization.retrievalHints
      ])).slice(0, 10);
      const indexHints = Array.from(new Set([
        ...baseCandidate.indexHints,
        ...ragOptimization.indexHints
      ])).slice(0, 10);
      const suggestedQuestions = Array.from(new Set([
        ...baseCandidate.suggestedQuestions,
        ...ragOptimization.suggestedQueries
      ])).slice(0, 8);
      const requiresReview = intelligence.action === "review"
        || intelligence.action === "merge"
        || intelligence.action === "improve"
        || intelligence.action === "reject";

      return {
        ...baseCandidate,
        retrievalHints,
        indexHints,
        suggestedQuestions,
        reusable: baseCandidate.reusable && intelligence.action !== "reject",
        storeAction: intelligence.action === "reject"
          ? "do_not_store"
          : requiresReview && baseCandidate.storeAction === "auto_store"
            ? "review_required"
            : baseCandidate.storeAction,
        reason: requiresReview
          ? intelligence.reasons[0] ?? intelligence.suggestions[0] ?? baseCandidate.reason
          : baseCandidate.reason,
        intelligence: {
          qualityScore: intelligence.overallScore,
          qualityLevel: intelligence.qualityLevel,
          action: intelligence.action,
          reasons: intelligence.reasons,
          suggestions: intelligence.suggestions
        },
        ragOptimization: {
          ragFitScore: ragOptimization.ragFitScore,
          retrievalHints: ragOptimization.retrievalHints,
          indexHints: ragOptimization.indexHints,
          suggestedQueries: ragOptimization.suggestedQueries
        },
        qualityScore: intelligence.overallScore,
        intelligenceAction: intelligence.action,
        ragFitScore: ragOptimization.ragFitScore,
        improvementHints: intelligence.suggestions,
        reviewReason: requiresReview
          ? intelligence.reasons[0] ?? intelligence.suggestions[0]
          : undefined
      };
    });
  }

  classifyKnowledge(candidate: string | KnowledgeLoopCandidate): KnowledgeCandidateType {
    const text = typeof candidate === "string" ? candidate : candidate.content;

    if (/异议|太贵|没效果|不信|担心|顾虑/.test(text)) {
      return "objection_handling";
    }

    if (/话术|怎么回复|如何回复|客户说|复制给客户/.test(text)) {
      return "sales_script";
    }

    if (/步骤|流程|SOP|第一步|第二步|先.*再|最后/.test(text)) {
      return "sop";
    }

    if (/场景|适用|如果|当.*时/.test(text)) {
      return "scenario";
    }

    if (/怎么|如何|为什么|是否|吗|？|\?/.test(text)) {
      return "faq";
    }

    return "concept";
  }

  scoreKnowledge(candidate: string | KnowledgeLoopCandidate): KnowledgeCandidateScore {
    const text = typeof candidate === "string" ? candidate : candidate.content;
    const length = compactText(text).length;
    const hasAction = /建议|步骤|处理|回复|操作|保存|入库|解决/.test(text);
    const hasQuestion = /怎么|如何|为什么|？|\?/.test(text);
    const hasUncertainty = /可能|大概|不确定|似乎|也许/.test(text);

    return {
      clarity: clampScore(length > 240 ? 0.7 : length > 60 ? 0.86 : 0.56),
      usefulness: clampScore((hasAction ? 0.86 : 0.64) + (hasQuestion ? 0.04 : 0)),
      reusability: clampScore(/流程|话术|FAQ|标准|客户|场景|SOP/.test(text) ? 0.86 : 0.6),
      confidence: clampScore((hasUncertainty ? 0.52 : 0.82) + (length > 40 ? 0.06 : -0.08))
    };
  }

  deduplicateCandidates(candidates: KnowledgeLoopCandidate[]): KnowledgeLoopCandidate[] {
    const seen = new Set<string>();

    return candidates.filter((candidate) => {
      const key = normalizeKey(`${candidate.type}:${candidate.title}:${candidate.content}`);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  buildKnowledgeDraft(candidates: KnowledgeLoopCandidate[], input?: KnowledgeLoopInput): KnowledgeLoopDraft {
    const tags = Array.from(new Set(candidates.flatMap((item) => item.tags))).slice(0, 12);
    const first = candidates[0];

    return {
      title: input?.draft?.title || first?.title || "对话投喂知识草稿",
      summary: input?.draft?.summary || first?.content || compactText(input?.text ?? ""),
      candidates,
      tags,
      retrievalHints: Array.from(new Set(candidates.flatMap((item) => item.retrievalHints))).slice(0, 10),
      indexHints: Array.from(new Set(candidates.flatMap((item) => item.indexHints))).slice(0, 10),
      suggestedQuestions: Array.from(new Set(candidates.flatMap((item) => item.suggestedQuestions))).slice(0, 6)
    };
  }

  decideStoreAction(draft: KnowledgeLoopDraft, autoStoreAvailable = this.autoStoreAvailable): KnowledgeStoreDecision {
    const autoStoreCount = draft.candidates.filter((item) => item.storeAction === "auto_store").length;
    const reviewRequiredCount = draft.candidates.filter((item) => item.storeAction === "review_required").length;
    const rejectedCount = draft.candidates.filter((item) => item.storeAction === "do_not_store").length;
    const hasAutoCandidate = autoStoreCount > 0;

    if (hasAutoCandidate && !autoStoreAvailable) {
      return {
        action: "review_required",
        reason: "当前项目无安全自动入库接口，已生成待入库草稿",
        autoStoreEnabled: false,
        requiresReview: true,
        autoStoreCount: 0,
        reviewRequiredCount: reviewRequiredCount + autoStoreCount,
        rejectedCount,
        recommendedAction: "请人工确认后点击保存知识入库。"
      };
    }

    if (hasAutoCandidate) {
      return {
        action: "auto_store",
        reason: "候选知识清晰、可复用且置信度较高。",
        autoStoreEnabled: true,
        requiresReview: reviewRequiredCount > 0,
        autoStoreCount,
        reviewRequiredCount,
        rejectedCount,
        recommendedAction: "可自动入库高价值候选，并人工复核剩余内容。"
      };
    }

    if (reviewRequiredCount > 0) {
      return {
        action: "review_required",
        reason: "存在可复用知识，但仍需人工确认标题、场景或标准答案。",
        autoStoreEnabled: false,
        requiresReview: true,
        autoStoreCount: 0,
        reviewRequiredCount,
        rejectedCount,
        recommendedAction: "建议复核后保存为知识库草稿。"
      };
    }

    return {
      action: "do_not_store",
      reason: "当前内容复用价值或置信度不足，暂不建议入库。",
      autoStoreEnabled: false,
      requiresReview: false,
      autoStoreCount: 0,
      reviewRequiredCount: 0,
      rejectedCount,
      recommendedAction: "建议补充更具体的客户问题、场景或标准答案。"
    };
  }

  buildReuseHints(draft: KnowledgeLoopDraft) {
    const hints = draft.candidates.flatMap((candidate) => [
      ...candidate.retrievalHints,
      candidate.scenario ? `适用场景：${candidate.scenario}` : "",
      candidate.customerScript ? "可复用为客户回复话术。" : ""
    ]).filter(Boolean);

    return Array.from(new Set(hints)).slice(0, 8);
  }

  private decideCandidateAction(score: KnowledgeCandidateScore): KnowledgeStoreAction {
    const average = averageScore(score);

    if (average >= AUTO_STORE_THRESHOLD) {
      return "auto_store";
    }

    if (average >= REVIEW_THRESHOLD) {
      return "review_required";
    }

    return "do_not_store";
  }

  private reasonForAction(action: KnowledgeStoreAction, score: KnowledgeCandidateScore) {
    const average = averageScore(score);

    if (action === "auto_store") {
      return `候选内容清晰且可复用，综合评分 ${average.toFixed(2)}。`;
    }

    if (action === "review_required") {
      return `候选内容具备复用价值，但需要人工复核，综合评分 ${average.toFixed(2)}。`;
    }

    return `候选内容信息不足或置信度偏低，综合评分 ${average.toFixed(2)}。`;
  }

  private buildQuestion(text: string, title: string) {
    const question = text.match(/[^。！？!?]*[？?]/)?.[0]?.trim();

    return question || `关于“${title}”，应该如何处理？`;
  }

  private buildSopSteps(text: string) {
    const steps = text
      .split(/(?:\d+[.、)]|第一步|第二步|第三步|第四步|先|再|然后|最后)/)
      .map((item) => compactText(item))
      .filter((item) => item.length >= 4)
      .slice(0, 6);

    return steps.length ? steps : [compactText(text)];
  }

  private buildRetrievalHints(text: string, tags: string[]) {
    return Array.from(new Set([
      ...tags.map((tag) => `${tag}相关问题`),
      makeTitle(text)
    ])).slice(0, 5);
  }

  private buildIndexHints(type: KnowledgeCandidateType, tags: string[]) {
    return Array.from(new Set([
      `type:${type}`,
      ...tags.map((tag) => `tag:${tag}`)
    ])).slice(0, 6);
  }

  private buildSuggestedQuestions(text: string, title: string, type: KnowledgeCandidateType) {
    const question = this.buildQuestion(text, title);

    return Array.from(new Set([
      question,
      type === "sales_script" ? `客户询问“${title}”时怎么回复？` : "",
      type === "sop" ? `“${title}”的标准流程是什么？` : ""
    ].filter(Boolean))).slice(0, 4);
  }
}
