import type { KnowledgeEvolutionResult } from "@/lib/enterprise/knowledge-evolution-engine";
import {
  KnowledgeIntelligenceEngine,
  type KnowledgeIntelligenceReport,
  type KnowledgeQualityLevel
} from "@/lib/enterprise/knowledge-intelligence-engine";
import type {
  KnowledgeLoopCandidate,
  KnowledgeLoopResult
} from "@/lib/enterprise/knowledge-loop-engine";
import {
  RAGQualityOptimizer,
  type RAGOptimizationPlan
} from "@/lib/enterprise/rag-quality-optimizer";

export interface KnowledgeMemoryRetrievalCheck {
  tested: boolean;
  passed: boolean;
  query: string;
  matchedTitles: string[];
  reason: string;
}

export interface KnowledgeMemoryIntelligenceSummary {
  overallScore: number;
  qualityLevel: KnowledgeQualityLevel;
  highValueCount: number;
  reviewRequiredCount: number;
  lowQualityCount: number;
  improvementSuggestions: string[];
}

export interface KnowledgeMemoryRagSummary {
  ragFitScore: number;
  retrievalHints: string[];
  indexHints: string[];
  suggestedQueries: string[];
  rerankHints: string[];
  warnings: string[];
}

export interface KnowledgeMemoryReport {
  enabled: true;
  mode: "auto_store" | "review_required" | "draft_only";
  storedCount: number;
  draftCount: number;
  indexedCount: number;
  failedCount: number;
  retrievalCheck: KnowledgeMemoryRetrievalCheck;
  warnings: string[];
  recommendedAction: string;
  intelligence?: KnowledgeMemoryIntelligenceSummary;
  ragOptimization?: KnowledgeMemoryRagSummary;
}

export interface KnowledgeMemoryCandidateFormat {
  candidateId: string;
  title: string;
  markdown: string;
  qaPair?: { q: string; a: string };
}

export interface KnowledgeMemoryPlan {
  enabled: true;
  canUseExistingSaveApi: boolean;
  safeAutoStoreAvailable: boolean;
  mode: "auto_store" | "review_required" | "draft_only";
  candidates: KnowledgeLoopCandidate[];
  candidateFormats: KnowledgeMemoryCandidateFormat[];
  structuredSummary: string;
  qaPairs: Array<{ q: string; a: string }>;
  retrievalCheck: KnowledgeMemoryRetrievalCheck;
  warnings: string[];
  recommendedAction: string;
  intelligence: KnowledgeMemoryIntelligenceSummary;
  ragOptimization: KnowledgeMemoryRagSummary;
}

export interface KnowledgeMemoryDraftLike {
  title: string;
  summary?: string;
  category?: string;
  tags?: string[];
  standardQuestion?: string;
  standardAnswer?: string;
  qaPairs?: Array<{ q: string; a: string }>;
  knowledgeLoop?: KnowledgeLoopResult;
  evolution?: KnowledgeEvolutionResult;
}

export interface SavedKnowledgeLike {
  id?: string;
  title?: string;
  category?: string;
  chunkCount?: number;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[], limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = cleanText(value);

    if (!clean || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    result.push(clean);
  }

  return result.slice(0, limit);
}

function scoreAverage(candidate: KnowledgeLoopCandidate) {
  const { clarity, usefulness, reusability, confidence } = candidate.score;

  return (clarity + usefulness + reusability + confidence) / 4;
}

function chooseMode(input: {
  candidates: KnowledgeLoopCandidate[];
  duplicateRisk?: "low" | "medium" | "high";
  safeAutoStoreAvailable: boolean;
  intelligence?: KnowledgeMemoryIntelligenceSummary;
}): KnowledgeMemoryPlan["mode"] {
  if (input.duplicateRisk === "high") {
    return "review_required";
  }

  if (input.candidates.length === 0) {
    return "draft_only";
  }

  if (input.intelligence?.lowQualityCount === input.candidates.length) {
    return "draft_only";
  }

  if ((input.intelligence?.reviewRequiredCount ?? 0) > 0 || input.intelligence?.qualityLevel === "low") {
    return "review_required";
  }

  if (input.candidates.some((candidate) => candidate.storeAction === "review_required")) {
    return "review_required";
  }

  if (input.candidates.some((candidate) => candidate.storeAction === "auto_store")) {
    return input.safeAutoStoreAvailable ? "auto_store" : "review_required";
  }

  return "draft_only";
}

function candidateQuestion(candidate: KnowledgeLoopCandidate) {
  return candidate.standardQuestion
    || candidate.suggestedQuestions[0]
    || `关于“${candidate.title}”，应该如何处理？`;
}

function candidateAnswer(candidate: KnowledgeLoopCandidate) {
  return candidate.standardAnswer
    || candidate.customerScript
    || candidate.content;
}

function emptyIntelligenceSummary(): KnowledgeMemoryIntelligenceSummary {
  return {
    overallScore: 0,
    qualityLevel: "low",
    highValueCount: 0,
    reviewRequiredCount: 0,
    lowQualityCount: 0,
    improvementSuggestions: []
  };
}

function emptyRagSummary(): KnowledgeMemoryRagSummary {
  return {
    ragFitScore: 0,
    retrievalHints: [],
    indexHints: [],
    suggestedQueries: [],
    rerankHints: [],
    warnings: []
  };
}

function summarizeIntelligence(report: KnowledgeIntelligenceReport): KnowledgeMemoryIntelligenceSummary {
  return {
    overallScore: report.overallScore,
    qualityLevel: report.qualityLevel,
    highValueCount: report.highValueCount,
    reviewRequiredCount: report.reviewRequiredCount,
    lowQualityCount: report.lowQualityCount,
    improvementSuggestions: uniqueStrings([
      ...report.improvementSuggestions,
      ...report.mergeSuggestions,
      ...report.riskWarnings
    ], 8)
  };
}

function summarizeRag(plan: RAGOptimizationPlan): KnowledgeMemoryRagSummary {
  return {
    ragFitScore: plan.ragFitScore,
    retrievalHints: plan.retrievalHints,
    indexHints: plan.indexHints,
    suggestedQueries: plan.suggestedQueries,
    rerankHints: plan.rerankHints,
    warnings: plan.ragWarnings
  };
}

export class KnowledgeMemoryAdapter {
  saveKnowledgeDraft(draft: KnowledgeMemoryDraftLike): KnowledgeMemoryPlan {
    return this.buildMemoryPlan(draft);
  }

  saveKnowledgeCandidate(candidate: KnowledgeLoopCandidate, context?: { safeAutoStoreAvailable?: boolean }) {
    const plan = this.saveKnowledgeCandidates([candidate], context);

    return {
      candidate,
      format: plan.candidateFormats[0],
      memory: {
        enabled: true as const,
        mode: plan.mode,
        storedCount: 0,
        draftCount: plan.candidates.length,
        indexedCount: 0,
        failedCount: 0,
        retrievalCheck: plan.retrievalCheck,
        warnings: plan.warnings,
        recommendedAction: plan.recommendedAction,
        intelligence: plan.intelligence,
        ragOptimization: plan.ragOptimization
      }
    };
  }

  saveKnowledgeCandidates(candidates: KnowledgeLoopCandidate[], context?: { safeAutoStoreAvailable?: boolean; duplicateRisk?: "low" | "medium" | "high" }): KnowledgeMemoryPlan {
    return this.buildMemoryPlan({
      title: candidates[0]?.title ?? "知识草稿",
      summary: candidates[0]?.content ?? "",
      knowledgeLoop: {
        version: "knowledge_loop_v1",
        candidates,
        draft: {
          title: candidates[0]?.title ?? "知识草稿",
          summary: candidates[0]?.content ?? "",
          candidates,
          tags: uniqueStrings(candidates.flatMap((candidate) => candidate.tags)),
          retrievalHints: uniqueStrings(candidates.flatMap((candidate) => candidate.retrievalHints)),
          indexHints: uniqueStrings(candidates.flatMap((candidate) => candidate.indexHints)),
          suggestedQuestions: uniqueStrings(candidates.flatMap((candidate) => candidate.suggestedQuestions))
        },
        storeDecision: {
          action: context?.safeAutoStoreAvailable ? "auto_store" : "review_required",
          reason: context?.safeAutoStoreAvailable ? "存在安全保存接口。" : "当前项目使用人工确认保存链路。",
          autoStoreEnabled: context?.safeAutoStoreAvailable ?? false,
          requiresReview: !(context?.safeAutoStoreAvailable ?? false),
          autoStoreCount: 0,
          reviewRequiredCount: candidates.length,
          rejectedCount: 0,
          recommendedAction: "请人工确认后点击保存知识入库。"
        },
        reusableCount: candidates.filter((candidate) => candidate.reusable).length,
        reviewCount: candidates.filter((candidate) => candidate.storeAction === "review_required").length,
        rejectedCount: candidates.filter((candidate) => candidate.storeAction === "do_not_store").length,
        autoStoreEnabled: context?.safeAutoStoreAvailable ?? false,
        requiresReview: true,
        retrievalHints: uniqueStrings(candidates.flatMap((candidate) => candidate.retrievalHints)),
        indexHints: uniqueStrings(candidates.flatMap((candidate) => candidate.indexHints)),
        suggestedQuestions: uniqueStrings(candidates.flatMap((candidate) => candidate.suggestedQuestions)),
        reuseHints: [],
        diagnostics: []
      },
      evolution: {
        version: "knowledge_evolution_v1",
        duplicateRisk: context?.duplicateRisk ?? "low",
        mergeSuggestions: [],
        highValueCandidates: [],
        reviewRequired: candidates,
        lowValueCandidates: [],
        evolutionHints: []
      }
    });
  }

  createChunksForCandidate(candidate: KnowledgeLoopCandidate) {
    const markdown = this.candidateToMarkdown(candidate);

    return markdown
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunkText, index) => ({
        chunkText,
        chunkIndex: index,
        title: candidate.title,
        metadata: {
          candidateId: candidate.id,
          type: candidate.type,
          tags: candidate.tags,
          source: candidate.source,
          retrievalHints: candidate.retrievalHints,
          indexHints: candidate.indexHints,
          suggestedQuestions: candidate.suggestedQuestions
        }
      }));
  }

  indexCandidate(candidate: KnowledgeLoopCandidate) {
    const chunks = this.createChunksForCandidate(candidate);

    return {
      candidateId: candidate.id,
      indexReady: chunks.length > 0,
      chunkCount: chunks.length,
      chunks
    };
  }

  async runRetrievalCheck(candidate?: KnowledgeLoopCandidate | null, context?: { expectedTitle?: string }): Promise<KnowledgeMemoryRetrievalCheck> {
    const query = cleanText(candidate?.standardQuestion)
      || cleanText(candidate?.suggestedQuestions?.[0])
      || cleanText(candidate?.title)
      || cleanText(context?.expectedTitle);

    if (!query) {
      return {
        tested: false,
        passed: false,
        query: "",
        matchedTitles: [],
        reason: "缺少可用于检索验证的标题或问题。"
      };
    }

    try {
      const response = await fetch(`/api/knowledge?q=${encodeURIComponent(query)}&status=active&pageSize=5`, {
        cache: "no-store"
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: {
          items?: Array<{ title?: string; content?: string; summary?: string }>;
        };
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        return {
          tested: false,
          passed: false,
          query,
          matchedTitles: [],
          reason: payload?.message || "当前知识检索 API 不可用，未执行 RAG 验证。"
        };
      }

      const items = payload.data?.items ?? [];
      const expected = cleanText(context?.expectedTitle || candidate?.title);
      const matchedTitles = items
        .filter((item) => {
          const title = cleanText(item.title);
          const body = `${item.summary ?? ""}\n${item.content ?? ""}`;

          return expected
            ? title.includes(expected) || expected.includes(title) || body.includes(expected)
            : title.length > 0;
        })
        .map((item) => cleanText(item.title))
        .filter(Boolean);

      return {
        tested: true,
        passed: matchedTitles.length > 0,
        query,
        matchedTitles: uniqueStrings(matchedTitles, 5),
        reason: matchedTitles.length > 0 ? "现有知识检索接口已命中保存内容。" : "已执行检索，但未命中刚保存的标题或正文。"
      };
    } catch {
      return {
        tested: false,
        passed: false,
        query,
        matchedTitles: [],
        reason: "当前环境无法安全调用检索 API，已跳过 RAG 验证。"
      };
    }
  }

  buildStoredKnowledgeReport(input: {
    draft: KnowledgeMemoryDraftLike;
    savedKnowledge?: SavedKnowledgeLike | null;
    retrievalCheck?: KnowledgeMemoryRetrievalCheck;
    failedCount?: number;
    warnings?: string[];
  }): KnowledgeMemoryReport {
    const candidates = this.getStorableCandidates(input.draft);
    const plan = this.buildMemoryPlan(input.draft);
    const storedCount = input.savedKnowledge?.id ? 1 : 0;
    const indexedCount = typeof input.savedKnowledge?.chunkCount === "number" ? input.savedKnowledge.chunkCount : 0;

    return {
      enabled: true,
      mode: storedCount > 0 ? "review_required" : plan.mode,
      storedCount,
      draftCount: Math.max(0, candidates.length - storedCount),
      indexedCount,
      failedCount: input.failedCount ?? 0,
      retrievalCheck: input.retrievalCheck ?? this.emptyRetrievalCheck("保存后尚未执行检索验证。"),
      warnings: input.warnings ?? plan.warnings,
      recommendedAction: storedCount > 0
        ? indexedCount > 0
          ? "知识已保存并生成 chunks，可继续用相关问题验证命中效果。"
          : "知识已保存，但未确认索引状态。"
        : plan.recommendedAction,
      intelligence: plan.intelligence,
      ragOptimization: plan.ragOptimization
    };
  }

  buildMemoryPlan(draft: KnowledgeMemoryDraftLike): KnowledgeMemoryPlan {
    const candidates = this.getStorableCandidates(draft);
    const safeAutoStoreAvailable = false;
    const duplicateRisk = draft.evolution?.duplicateRisk ?? "low";
    const intelligence = this.buildIntelligenceSummary(candidates, duplicateRisk);
    const ragOptimization = this.buildRagSummary(candidates);
    const mode = chooseMode({
      candidates,
      duplicateRisk,
      safeAutoStoreAvailable,
      intelligence
    });
    const candidateFormats = candidates.map((candidate) => ({
      candidateId: candidate.id,
      title: candidate.title,
      markdown: this.candidateToMarkdown(candidate),
      qaPair: {
        q: candidateQuestion(candidate),
        a: this.candidateToMarkdown(candidate)
      }
    }));
    const warnings = [
      safeAutoStoreAvailable ? "" : "当前项目使用人工确认保存链路，不执行无确认自动入库。",
      duplicateRisk === "high" ? "重复风险高，建议合并后再入库。" : "",
      candidates.length === 0 ? "未检测到可安全保存的知识候选。" : "",
      intelligence.lowQualityCount > 0 ? `检测到 ${intelligence.lowQualityCount} 条低质量候选，建议补充后再入库。` : "",
      intelligence.reviewRequiredCount > 0 ? `检测到 ${intelligence.reviewRequiredCount} 条需复核候选。` : "",
      ragOptimization.ragFitScore > 0 && ragOptimization.ragFitScore < 55 ? "RAG适配度偏低，建议补充标准问法、关键词或场景。" : "",
      ...ragOptimization.warnings.slice(0, 3)
    ].filter(Boolean);
    const recommendedAction = mode === "draft_only"
      ? "不建议直接入库，请先补充更具体的场景、问法或标准答案。"
      : duplicateRisk === "high"
        ? "建议合并相似知识后人工保存。"
        : intelligence.highValueCount > 0
          ? "建议优先保存高质量 FAQ/SOP/场景话术，并人工复核其余内容。"
          : intelligence.reviewRequiredCount > 0
            ? "建议人工复核质量建议后保存知识草稿。"
            : "请人工确认后点击保存知识入库。";

    return {
      enabled: true,
      canUseExistingSaveApi: true,
      safeAutoStoreAvailable,
      mode,
      candidates,
      candidateFormats,
      structuredSummary: this.buildStructuredSummary(draft, candidateFormats),
      qaPairs: this.buildQAPairs(draft, candidateFormats),
      retrievalCheck: this.emptyRetrievalCheck("尚未保存，暂未执行检索验证。"),
      warnings,
      recommendedAction,
      intelligence,
      ragOptimization
    };
  }

  private buildIntelligenceSummary(candidates: KnowledgeLoopCandidate[], duplicateRisk: "low" | "medium" | "high") {
    if (!candidates.length) {
      return emptyIntelligenceSummary();
    }

    try {
      return summarizeIntelligence(new KnowledgeIntelligenceEngine().buildKnowledgeIntelligenceReport(candidates, {
        duplicateRisk
      }));
    } catch {
      return emptyIntelligenceSummary();
    }
  }

  private buildRagSummary(candidates: KnowledgeLoopCandidate[]) {
    if (!candidates.length) {
      return emptyRagSummary();
    }

    try {
      return summarizeRag(new RAGQualityOptimizer().buildRagOptimizationPlan(candidates));
    } catch {
      return emptyRagSummary();
    }
  }

  private getStorableCandidates(draft: KnowledgeMemoryDraftLike) {
    return (draft.knowledgeLoop?.candidates ?? [])
      .filter((candidate) => candidate.storeAction !== "do_not_store")
      .sort((left, right) => scoreAverage(right) - scoreAverage(left))
      .slice(0, 8);
  }

  private candidateToMarkdown(candidate: KnowledgeLoopCandidate) {
    const parts = [
      "## 标题",
      candidate.title,
      "",
      "## 类型",
      candidate.type,
      "",
      "## 正文",
      candidate.content
    ];

    if (candidate.standardQuestion || candidate.standardAnswer) {
      parts.push(
        "",
        "## 标准问答",
        `用户问法：${candidate.standardQuestion ?? candidateQuestion(candidate)}`,
        "",
        `标准答案：${candidate.standardAnswer ?? candidateAnswer(candidate)}`
      );
    }

    if (candidate.sopSteps?.length) {
      parts.push(
        "",
        "## SOP步骤",
        ...candidate.sopSteps.map((step, index) => `${index + 1}. ${step}`)
      );
    }

    if (candidate.scenario) {
      parts.push("", "## 场景", candidate.scenario);
    }

    if (candidate.customerScript) {
      parts.push("", "## 客户话术", candidate.customerScript);
    }

    if (candidate.tags.length) {
      parts.push("", "## 标签", candidate.tags.join("、"));
    }

    if (candidate.retrievalHints.length || candidate.suggestedQuestions.length) {
      parts.push(
        "",
        "## 检索提示",
        ...uniqueStrings([...candidate.retrievalHints, ...candidate.suggestedQuestions], 8).map((hint) => `- ${hint}`)
      );
    }

    if (candidate.intelligence) {
      parts.push(
        "",
        "## 质量建议",
        `质量评分：${candidate.intelligence.qualityScore}/100（${candidate.intelligence.qualityLevel}）`,
        `建议动作：${candidate.intelligence.action}`,
        ...uniqueStrings([
          ...candidate.intelligence.reasons,
          ...candidate.intelligence.suggestions
        ], 6).map((hint) => `- ${hint}`)
      );
    }

    if (candidate.ragOptimization) {
      parts.push(
        "",
        "## RAG优化提示",
        `RAG适配度：${candidate.ragOptimization.ragFitScore}/100`,
        ...uniqueStrings([
          ...candidate.ragOptimization.retrievalHints,
          ...candidate.ragOptimization.suggestedQueries
        ], 6).map((hint) => `- ${hint}`)
      );
    }

    parts.push("", "<!-- knowledge-loop metadata persisted as readable text; structured DB metadata not changed. -->");

    return parts.join("\n").trim();
  }

  private buildStructuredSummary(draft: KnowledgeMemoryDraftLike, formats: KnowledgeMemoryCandidateFormat[]) {
    const base = cleanText(draft.summary) || cleanText(draft.standardAnswer) || "已生成可复用知识草稿。";
    const candidateText = formats.length
      ? [
          "",
          "## 可复用知识单元",
          ...formats.map((format, index) => `### ${index + 1}. ${format.title}\n${format.markdown}`)
        ].join("\n")
      : "";

    return `${base}${candidateText}`.trim();
  }

  private buildQAPairs(draft: KnowledgeMemoryDraftLike, formats: KnowledgeMemoryCandidateFormat[]) {
    const basePairs = draft.qaPairs?.length
      ? draft.qaPairs
      : draft.standardQuestion && draft.standardAnswer
        ? [{ q: draft.standardQuestion, a: draft.standardAnswer }]
        : [];
    const candidatePairs = formats
      .map((format) => format.qaPair)
      .filter((pair): pair is { q: string; a: string } => Boolean(pair?.q && pair.a));

    return [...basePairs, ...candidatePairs].slice(0, 8);
  }

  private emptyRetrievalCheck(reason: string): KnowledgeMemoryRetrievalCheck {
    return {
      tested: false,
      passed: false,
      query: "",
      matchedTitles: [],
      reason
    };
  }
}
