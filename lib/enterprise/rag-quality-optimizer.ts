import type { KnowledgeLoopCandidate } from "@/lib/enterprise/knowledge-loop-engine";

export interface RAGOptimizationResult {
  retrievalHints: string[];
  indexHints: string[];
  suggestedQueries: string[];
  rerankHints: string[];
  ragFitScore: number;
  ragWarnings: string[];
}

export interface RAGOptimizationPlan extends RAGOptimizationResult {
  candidates: Array<{
    candidateId: string;
    title: string;
    ragFitScore: number;
    retrievalHints: string[];
    indexHints: string[];
    suggestedQueries: string[];
    warnings: string[];
  }>;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
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

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function makeQuestion(title: string, type: KnowledgeLoopCandidate["type"]) {
  if (type === "sop") {
    return `${title} 的标准流程是什么？`;
  }

  if (type === "sales_script" || type === "objection_handling") {
    return `客户问到 ${title} 时怎么回复？`;
  }

  return `关于 ${title} 应该怎么处理？`;
}

function tokenize(value: string) {
  return new Set(cleanText(value)
    .toLowerCase()
    .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2));
}

export class RAGQualityOptimizer {
  buildRetrievalHints(unit: KnowledgeLoopCandidate) {
    return uniqueStrings([
      ...unit.retrievalHints,
      unit.standardQuestion ?? "",
      ...unit.suggestedQuestions,
      ...unit.tags.map((tag) => `${tag}相关问题`),
      unit.scenario ? `${unit.scenario} 场景` : "",
      unit.title
    ], 10);
  }

  buildIndexHints(unit: KnowledgeLoopCandidate) {
    return uniqueStrings([
      ...unit.indexHints,
      `type:${unit.type}`,
      ...unit.tags.map((tag) => `tag:${tag}`),
      unit.source ? `source:${unit.source}` : "",
      unit.standardQuestion ? "field:standardQuestion" : "",
      unit.standardAnswer ? "field:standardAnswer" : "",
      unit.customerScript ? "field:customerScript" : ""
    ], 10);
  }

  buildSuggestedQueries(unit: KnowledgeLoopCandidate) {
    return uniqueStrings([
      unit.standardQuestion ?? "",
      ...unit.suggestedQuestions,
      makeQuestion(unit.title, unit.type),
      unit.scenario ? `${unit.scenario} 怎么处理？` : "",
      unit.customerScript ? `客户咨询 ${unit.title} 怎么说？` : ""
    ], 8);
  }

  scoreRetrievalFit(unit: KnowledgeLoopCandidate) {
    const content = cleanText(`${unit.title}\n${unit.content}\n${unit.standardQuestion ?? ""}\n${unit.standardAnswer ?? ""}`);
    let score = 38;

    if (content.length >= 60) score += 12;
    if (content.length >= 160) score += 8;
    if (content.length > 1200) score -= 10;
    if (unit.tags.length >= 2) score += 10;
    if (unit.standardQuestion) score += 12;
    if (unit.standardAnswer) score += 8;
    if (unit.suggestedQuestions.length) score += 8;
    if (unit.retrievalHints.length) score += 7;
    if (unit.indexHints.length) score += 5;
    if (unit.scenario) score += 6;
    if (unit.storeAction === "do_not_store") score -= 18;

    return clampScore(score);
  }

  buildRagOptimizationForUnit(unit: KnowledgeLoopCandidate): RAGOptimizationResult {
    const retrievalHints = this.buildRetrievalHints(unit);
    const indexHints = this.buildIndexHints(unit);
    const suggestedQueries = this.buildSuggestedQueries(unit);
    const ragFitScore = this.scoreRetrievalFit(unit);
    const ragWarnings = uniqueStrings([
      unit.tags.length ? "" : "缺少标签，可能影响关键词召回。",
      unit.standardQuestion || suggestedQueries.length ? "" : "缺少标准问法，建议补充真实用户查询句。",
      cleanText(unit.content).length < 40 ? "正文过短，建议补充业务边界或处理步骤。" : "",
      ragFitScore < 55 ? "RAG适配度偏低，建议人工复核后再入库。" : ""
    ], 6);
    const rerankHints = uniqueStrings([
      ...unit.tags.map((tag) => `优先匹配标签：${tag}`),
      unit.type ? `优先匹配类型：${unit.type}` : "",
      unit.scenario ? `场景匹配：${unit.scenario}` : "",
      unit.standardQuestion ? `问法匹配：${unit.standardQuestion}` : ""
    ], 8);

    return {
      retrievalHints,
      indexHints,
      suggestedQueries,
      rerankHints,
      ragFitScore,
      ragWarnings
    };
  }

  buildRagOptimizationPlan(units: KnowledgeLoopCandidate[]): RAGOptimizationPlan {
    const candidates = units.map((unit) => {
      const result = this.buildRagOptimizationForUnit(unit);

      return {
        candidateId: unit.id,
        title: unit.title,
        ragFitScore: result.ragFitScore,
        retrievalHints: result.retrievalHints,
        indexHints: result.indexHints,
        suggestedQueries: result.suggestedQueries,
        warnings: result.ragWarnings
      };
    });
    const ragFitScore = candidates.length
      ? clampScore(candidates.reduce((sum, item) => sum + item.ragFitScore, 0) / candidates.length)
      : 0;

    return {
      candidates,
      retrievalHints: uniqueStrings(candidates.flatMap((item) => item.retrievalHints), 12),
      indexHints: uniqueStrings(candidates.flatMap((item) => item.indexHints), 12),
      suggestedQueries: uniqueStrings(candidates.flatMap((item) => item.suggestedQueries), 10),
      rerankHints: uniqueStrings(units.flatMap((unit) => this.buildRagOptimizationForUnit(unit).rerankHints), 10),
      ragFitScore,
      ragWarnings: uniqueStrings(candidates.flatMap((item) => item.warnings), 8)
    };
  }

  rerankKnowledgeForRetrieval(units: KnowledgeLoopCandidate[], queryContext = "") {
    const queryTokens = tokenize(queryContext);

    return [...units].sort((left, right) => {
      const leftTokens = tokenize(`${left.title} ${left.content} ${left.tags.join(" ")}`);
      const rightTokens = tokenize(`${right.title} ${right.content} ${right.tags.join(" ")}`);
      const leftOverlap = Array.from(queryTokens).filter((token) => leftTokens.has(token)).length;
      const rightOverlap = Array.from(queryTokens).filter((token) => rightTokens.has(token)).length;
      const leftScore = this.scoreRetrievalFit(left) + leftOverlap * 6;
      const rightScore = this.scoreRetrievalFit(right) + rightOverlap * 6;

      return rightScore - leftScore;
    });
  }
}
