export type KnowledgeFeedbackIssueType = "missing_knowledge" | "bad_chunk" | "prompt_issue";
export type KnowledgeFeedbackPriority = "low" | "medium" | "high";
export type KnowledgeUserFeedback = "like" | "dislike" | "unsatisfied";

export interface KnowledgeFeedbackAnalyzerInput {
  relevanceScore: number;
  hitCount: number;
  answerGroundingScore: number;
  fallbackUsed: boolean;
  userFeedback?: KnowledgeUserFeedback;
}

export interface KnowledgeFeedbackAnalysis {
  issue_type: KnowledgeFeedbackIssueType;
  suggestion: string;
  priority: KnowledgeFeedbackPriority;
}

export interface KnowledgeFeedbackRecord {
  query: string;
  relevanceScore: number;
  hitCount: number;
  answerGroundingScore: number;
  fallbackUsed: boolean;
  answerQuality?: "high" | "medium" | "low";
}

export interface KnowledgeFeedbackReport {
  top_failed_queries: string[];
  missing_topics: string[];
  improvement_suggestions: string[];
}

export function analyzeKnowledgeFeedback(
  input: KnowledgeFeedbackAnalyzerInput,
): KnowledgeFeedbackAnalysis | null {
  if (input.userFeedback === "dislike" || input.userFeedback === "unsatisfied") {
    return {
      issue_type: input.hitCount === 0 ? "missing_knowledge" : "bad_chunk",
      suggestion: input.hitCount === 0
        ? "补充与该问题相关的投喂知识，避免用户问题无命中。"
        : "复查当前命中的知识片段是否过旧、过短或与用户问题不匹配。",
      priority: "high",
    };
  }

  if (input.hitCount === 0 || input.relevanceScore < 0.3) {
    return {
      issue_type: "missing_knowledge",
      suggestion: "该问题命中较弱，建议补充更直接的知识条目或增加同义表达。",
      priority: input.hitCount === 0 ? "high" : "medium",
    };
  }

  if (input.answerGroundingScore < 0.35 || input.fallbackUsed) {
    return {
      issue_type: "prompt_issue",
      suggestion: "回答对知识库依赖度偏低，建议检查提示词约束、命中片段质量和模型 fallback 状态。",
      priority: input.fallbackUsed ? "medium" : "low",
    };
  }

  return null;
}

export function buildKnowledgeFeedbackReport(records: KnowledgeFeedbackRecord[]): KnowledgeFeedbackReport {
  const failedRecords = records.filter((record) => {
    return record.hitCount === 0 ||
      record.relevanceScore < 0.3 ||
      record.answerGroundingScore < 0.35 ||
      record.fallbackUsed ||
      record.answerQuality === "low";
  });

  const topFailedQueries = failedRecords
    .slice()
    .sort((a, b) => failureScore(b) - failureScore(a))
    .slice(0, 10)
    .map((record) => record.query);

  const missingTopics = unique(
    failedRecords
      .filter((record) => record.hitCount === 0 || record.relevanceScore < 0.3)
      .map((record) => record.query),
  ).slice(0, 10);

  return {
    top_failed_queries: topFailedQueries,
    missing_topics: missingTopics,
    improvement_suggestions: buildReportSuggestions(failedRecords),
  };
}

function failureScore(record: KnowledgeFeedbackRecord): number {
  let score = 0;

  if (record.hitCount === 0) {
    score += 4;
  }

  if (record.relevanceScore < 0.3) {
    score += 3;
  }

  if (record.answerGroundingScore < 0.35) {
    score += 2;
  }

  if (record.fallbackUsed) {
    score += 2;
  }

  if (record.answerQuality === "low") {
    score += 1;
  }

  return score;
}

function buildReportSuggestions(records: KnowledgeFeedbackRecord[]): string[] {
  const suggestions: string[] = [];

  if (records.some((record) => record.hitCount === 0)) {
    suggestions.push("优先补充无命中的高频问题知识。");
  }

  if (records.some((record) => record.relevanceScore < 0.3 && record.hitCount > 0)) {
    suggestions.push("复查低相关命中的知识切片标题、摘要和关键词。");
  }

  if (records.some((record) => record.answerGroundingScore < 0.35)) {
    suggestions.push("检查回答 prompt 是否足够强调基于知识库输出。");
  }

  if (records.some((record) => record.fallbackUsed)) {
    suggestions.push("排查模型供应商 fallback，避免低质量兜底影响体验。");
  }

  return suggestions;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
