import type {
  KnowledgeLoopCandidate,
  KnowledgeLoopDraft
} from "@/lib/enterprise/knowledge-loop-engine";

export interface KnowledgeMergeSuggestion {
  targetId: string;
  duplicateIds: string[];
  reason: string;
}

export interface KnowledgeEvolutionHint {
  type: "merge" | "promote" | "review" | "enrich";
  message: string;
  candidateIds: string[];
}

export interface KnowledgeEvolutionResult {
  version: "knowledge_evolution_v1";
  duplicateRisk: "low" | "medium" | "high";
  mergeSuggestions: KnowledgeMergeSuggestion[];
  highValueCandidates: KnowledgeLoopCandidate[];
  reviewRequired: KnowledgeLoopCandidate[];
  lowValueCandidates: KnowledgeLoopCandidate[];
  evolutionHints: KnowledgeEvolutionHint[];
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return compactText(value)
    .toLowerCase()
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, "")
    .slice(0, 72);
}

function scoreAverage(candidate: KnowledgeLoopCandidate) {
  const { clarity, usefulness, reusability, confidence } = candidate.score;

  return (clarity + usefulness + reusability + confidence) / 4;
}

function isStructuredKnowledge(candidate: KnowledgeLoopCandidate) {
  return ["faq", "sop", "scenario", "sales_script", "objection_handling"].includes(candidate.type);
}

function candidateQuestionKey(candidate: KnowledgeLoopCandidate) {
  return normalizeKey(candidate.standardQuestion || candidate.suggestedQuestions[0] || candidate.title);
}

function similarity(left: KnowledgeLoopCandidate, right: KnowledgeLoopCandidate) {
  const leftKey = normalizeKey(`${left.title}${left.content}`);
  const rightKey = normalizeKey(`${right.title}${right.content}`);

  if (!leftKey || !rightKey) {
    return 0;
  }

  if (leftKey === rightKey) {
    return 1;
  }

  const leftSet = new Set(leftKey.match(/.{1,2}/g) ?? []);
  const rightSet = new Set(rightKey.match(/.{1,2}/g) ?? []);
  const intersection = Array.from(leftSet).filter((item) => rightSet.has(item)).length;
  const unionSet = new Set<string>();

  Array.from(leftSet).forEach((item) => unionSet.add(item));
  Array.from(rightSet).forEach((item) => unionSet.add(item));

  const union = unionSet.size || 1;

  return intersection / union;
}

export class KnowledgeEvolutionEngine {
  normalizeDraft(draft: KnowledgeLoopDraft | { candidates?: KnowledgeLoopCandidate[] }): KnowledgeEvolutionResult {
    const candidates = draft.candidates ?? [];
    const mergeSuggestions = this.mergeSimilarCandidates(candidates);
    const highValueCandidates = this.markHighValueKnowledge(candidates);
    const lowValueCandidates = this.markLowValueKnowledge(candidates);
    const reviewRequired = candidates.filter((candidate) => candidate.storeAction === "review_required");
    const duplicateRisk = mergeSuggestions.length >= 2 ? "high" : mergeSuggestions.length === 1 ? "medium" : "low";

    return {
      version: "knowledge_evolution_v1",
      duplicateRisk,
      mergeSuggestions,
      highValueCandidates,
      reviewRequired,
      lowValueCandidates,
      evolutionHints: this.buildEvolutionHints(candidates, {
        mergeSuggestions,
        highValueCandidates,
        lowValueCandidates,
        reviewRequired
      })
    };
  }

  findSimilarCandidates(candidates: KnowledgeLoopCandidate[]) {
    const pairs: Array<{ left: KnowledgeLoopCandidate; right: KnowledgeLoopCandidate; similarity: number }> = [];

    for (let index = 0; index < candidates.length; index += 1) {
      for (let next = index + 1; next < candidates.length; next += 1) {
        const left = candidates[index];
        const right = candidates[next];
        const score = similarity(left, right);

        const sameStructuredType = left.type === right.type && isStructuredKnowledge(left);
        const questionMatch = Boolean(candidateQuestionKey(left) && candidateQuestionKey(left) === candidateQuestionKey(right));
        const threshold = sameStructuredType ? 0.62 : 0.72;

        if (score >= threshold || questionMatch) {
          pairs.push({ left, right, similarity: score });
        }
      }
    }

    return pairs;
  }

  mergeSimilarCandidates(candidates: KnowledgeLoopCandidate[]): KnowledgeMergeSuggestion[] {
    return this.findSimilarCandidates(candidates)
      .map(({ left, right, similarity: matchScore }) => {
        const target = scoreAverage(left) >= scoreAverage(right) ? left : right;
        const duplicate = target.id === left.id ? right : left;

        return {
          targetId: target.id,
          duplicateIds: [duplicate.id],
          reason: `相似度 ${matchScore.toFixed(2)}，建议保留评分更高的知识单元并合并补充信息。`
        };
      })
      .slice(0, 6);
  }

  markHighValueKnowledge(candidates: KnowledgeLoopCandidate[]) {
    return candidates
      .filter((candidate) => {
        const qualityScore = candidate.intelligence?.qualityScore ?? candidate.qualityScore ?? scoreAverage(candidate) * 100;
        const ragFitScore = candidate.ragOptimization?.ragFitScore ?? candidate.ragFitScore ?? 0;
        const riskScore = candidate.intelligence?.reasons.some((reason) => /风险|合规|承诺/.test(reason)) ? 70 : 0;

        return candidate.reusable
          && riskScore < 70
          && (scoreAverage(candidate) >= 0.78 || (qualityScore >= 78 && ragFitScore >= 65));
      })
      .slice(0, 8);
  }

  markLowValueKnowledge(candidates: KnowledgeLoopCandidate[]) {
    return candidates
      .filter((candidate) => {
        const contentLength = compactText(candidate.content).length;
        const lowByIntelligence = candidate.intelligence?.qualityLevel === "low"
          || candidate.intelligence?.action === "reject";
        const riskByIntelligence = candidate.intelligence?.reasons.some((reason) => /风险|合规|承诺/.test(reason)) ?? false;

        return candidate.storeAction === "do_not_store"
          || scoreAverage(candidate) < 0.52
          || lowByIntelligence
          || riskByIntelligence
          || contentLength < 24
          || candidate.tags.length === 0;
      })
      .slice(0, 8);
  }

  optimizeKnowledgeGraph(candidates: KnowledgeLoopCandidate[]) {
    return {
      clusterCount: new Set(candidates.map((candidate) => candidate.type)).size,
      tagCoverage: new Set(candidates.flatMap((candidate) => candidate.tags)).size,
      retrievalHints: Array.from(new Set(candidates.flatMap((candidate) => candidate.retrievalHints))).slice(0, 10)
    };
  }

  promoteHighValueKnowledge(candidates: KnowledgeLoopCandidate[]) {
    return this.markHighValueKnowledge(candidates).map((candidate) => ({
      candidateId: candidate.id,
      title: candidate.title,
      reason: "评分高、可复用，建议优先保存并作为用户端检索素材。"
    }));
  }

  buildEvolutionHints(
    candidates: KnowledgeLoopCandidate[],
    context?: {
      mergeSuggestions?: KnowledgeMergeSuggestion[];
      highValueCandidates?: KnowledgeLoopCandidate[];
      lowValueCandidates?: KnowledgeLoopCandidate[];
      reviewRequired?: KnowledgeLoopCandidate[];
    }
  ): KnowledgeEvolutionHint[] {
    const mergeSuggestions = context?.mergeSuggestions ?? this.mergeSimilarCandidates(candidates);
    const highValueCandidates = context?.highValueCandidates ?? this.markHighValueKnowledge(candidates);
    const lowValueCandidates = context?.lowValueCandidates ?? this.markLowValueKnowledge(candidates);
    const reviewRequired = context?.reviewRequired ?? candidates.filter((candidate) => candidate.storeAction === "review_required");
    const hints: KnowledgeEvolutionHint[] = [];

    if (mergeSuggestions.length) {
      hints.push({
        type: "merge",
        message: "存在相似 FAQ/SOP/场景话术，建议保存前合并为一个更完整的标准知识。",
        candidateIds: mergeSuggestions.flatMap((item) => [item.targetId, ...item.duplicateIds])
      });
    }

    if (highValueCandidates.length) {
      hints.push({
        type: "promote",
        message: "检测到高价值知识，可优先用于用户端检索和客户回复。",
        candidateIds: highValueCandidates.map((item) => item.id)
      });
    }

    if (reviewRequired.length) {
      hints.push({
        type: "review",
        message: "部分知识需要人工确认标题、标准答案或适用场景。",
        candidateIds: reviewRequired.map((item) => item.id)
      });
    }

    if (lowValueCandidates.length) {
      hints.push({
        type: "enrich",
        message: "低价值候选建议补充场景、客户原话或执行步骤后再入库。",
        candidateIds: lowValueCandidates.map((item) => item.id)
      });
    }

    return hints;
  }

  evolveKnowledge(units: KnowledgeLoopCandidate[]) {
    const normalized = this.normalizeDraft({ candidates: units });

    return {
      ...normalized,
      graph: this.optimizeKnowledgeGraph(units),
      promotions: this.promoteHighValueKnowledge(units)
    };
  }
}
