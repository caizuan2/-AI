import {
  KnowledgeFactoryV2,
  enrichDraftWithKnowledgeFactory,
  type KnowledgeFactoryDocument,
  type KnowledgeFactoryDraftLike,
  type KnowledgeFactoryV2Result,
  type KnowledgeUnit
} from "@/lib/enterprise/knowledge-factory-v2";

export interface KnowledgeQualityScore {
  clarity: number;
  usefulness: number;
  reusability: number;
  frequency: number;
  confidence: number;
}

export interface EvolvingKnowledgeUnit extends KnowledgeUnit {
  score: KnowledgeQualityScore;
  valueScore: number;
  retrievalWeight: number;
  evolutionStage: "raw" | "optimized" | "promoted";
  mergedFrom: string[];
  improvementHints: string[];
  growthActions: string[];
}

export interface KnowledgeFactoryV3Graph {
  nodes: Array<{
    id: string;
    title: string;
    type: KnowledgeUnit["type"];
    valueScore: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    reason: "same_tag" | "same_type" | "semantic_overlap";
    weight: number;
  }>;
  clusters: Array<{
    label: string;
    unitIds: string[];
  }>;
}

export interface KnowledgeFactoryV3Result {
  version: "knowledge-factory-v3";
  base: KnowledgeFactoryV2Result;
  units: EvolvingKnowledgeUnit[];
  mergedUnits: EvolvingKnowledgeUnit[];
  evolvedUnits: EvolvingKnowledgeUnit[];
  promotedUnits: EvolvingKnowledgeUnit[];
  graph: KnowledgeFactoryV3Graph;
  growthLoop: string[];
  retrievalEnhancement: {
    weightedQueries: string[];
    priorityTags: string[];
    recommendedTopK: number;
  };
  learning: {
    successPatterns: string[];
    failurePatterns: string[];
    optimizationHints: string[];
  };
  storage: {
    mode: "draft_metadata_only";
    indexReady: boolean;
    unitCount: number;
    promotedCount: number;
  };
}

export interface KnowledgeFactoryV3DraftLike extends KnowledgeFactoryDraftLike {
  knowledgeFactoryV3?: KnowledgeFactoryV3Result;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result.slice(0, limit);
}

function tokenize(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\u3400-\u9fffa-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 24);
}

function jaccard(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = Array.from(leftSet).filter((item) => rightSet.has(item)).length;
  const union = new Set([...left, ...right]).size;

  return union === 0 ? 0 : intersection / union;
}

function averageScore(score: KnowledgeQualityScore) {
  return clamp01((score.clarity + score.usefulness + score.reusability + score.frequency + score.confidence) / 5);
}

function scoreToPercent(score: number) {
  return Math.round(clamp01(score) * 100);
}

function buildHints(unit: KnowledgeUnit, score: KnowledgeQualityScore) {
  const hints: string[] = [];

  if (score.clarity < 0.62) {
    hints.push("补充更明确的适用对象、前置条件或边界。");
  }

  if (score.usefulness < 0.62) {
    hints.push("补一个一线可执行动作或标准回复。");
  }

  if (score.reusability < 0.62) {
    hints.push("拆成 FAQ 或 SOP，方便用户端检索复用。");
  }

  if (score.confidence < 0.62) {
    hints.push("补充来源、案例或正式口径，提升可信度。");
  }

  if (unit.type === "scenario" && !/边界|风险|注意|不能|避免/.test(unit.content)) {
    hints.push("场景知识建议补充风险边界。");
  }

  return uniqueStrings(hints, 5);
}

function buildGrowthActions(unit: KnowledgeUnit, score: KnowledgeQualityScore) {
  const actions = [
    score.usefulness >= 0.72 ? "沉淀为用户端标准回答" : null,
    unit.type === "SOP" ? "转成执行检查清单" : null,
    unit.type === "FAQ" ? "扩展相似问法" : null,
    unit.type === "scenario" ? "补充客户话术与升级边界" : null,
    score.reusability >= 0.7 ? "作为高频检索种子词" : null
  ];

  return uniqueStrings(actions, 5);
}

function toEvolvingUnit(unit: KnowledgeUnit, score: KnowledgeQualityScore): EvolvingKnowledgeUnit {
  const valueScore = averageScore(score);
  const evolutionStage = valueScore >= 0.78 ? "promoted" : valueScore >= 0.58 ? "optimized" : "raw";

  return {
    ...unit,
    score,
    valueScore,
    retrievalWeight: clamp01((score.reusability * 0.35) + (score.frequency * 0.25) + (score.confidence * 0.25) + (score.usefulness * 0.15)),
    evolutionStage,
    mergedFrom: [unit.id],
    improvementHints: buildHints(unit, score),
    growthActions: buildGrowthActions(unit, score)
  };
}

function mergeUnitGroup(units: EvolvingKnowledgeUnit[], index: number): EvolvingKnowledgeUnit {
  const [first] = units;

  if (!first || units.length === 1) {
    return first;
  }

  const score: KnowledgeQualityScore = {
    clarity: clamp01(units.reduce((sum, unit) => sum + unit.score.clarity, 0) / units.length),
    usefulness: clamp01(units.reduce((sum, unit) => sum + unit.score.usefulness, 0) / units.length),
    reusability: clamp01(Math.max(...units.map((unit) => unit.score.reusability))),
    frequency: clamp01(Math.min(1, units.reduce((sum, unit) => sum + unit.score.frequency, 0) / units.length + 0.12)),
    confidence: clamp01(units.reduce((sum, unit) => sum + unit.score.confidence, 0) / units.length)
  };
  const mergedContent = uniqueStrings(units.map((unit) => unit.content), 4).join(" ");
  const mergedBase: KnowledgeUnit = {
    id: `merged-${index + 1}`,
    type: first.type,
    title: first.title,
    content: mergedContent,
    tags: uniqueStrings(units.flatMap((unit) => unit.tags), 10),
    embedding_ready: true
  };

  return {
    ...toEvolvingUnit(mergedBase, score),
    mergedFrom: units.flatMap((unit) => unit.mergedFrom),
    improvementHints: uniqueStrings(units.flatMap((unit) => unit.improvementHints), 6),
    growthActions: uniqueStrings(units.flatMap((unit) => unit.growthActions), 6)
  };
}

export class KnowledgeFactoryV3 {
  private readonly v2 = new KnowledgeFactoryV2();

  ingest(document: KnowledgeFactoryDocument): KnowledgeFactoryV3Result {
    const base = this.v2.ingest(document);
    const scoredUnits = this.extractKnowledgeUnits(document.text, document);
    const mergedUnits = this.mergeSimilarKnowledge(scoredUnits);
    const evolvedUnits = this.evolveKnowledge(mergedUnits);
    const promotedUnits = this.promoteHighValueKnowledge(evolvedUnits);
    const graph = this.optimizeKnowledgeGraph(evolvedUnits);

    return {
      version: "knowledge-factory-v3",
      base,
      units: scoredUnits,
      mergedUnits,
      evolvedUnits,
      promotedUnits,
      graph,
      growthLoop: this.buildGrowthLoop(evolvedUnits, promotedUnits),
      retrievalEnhancement: this.buildRetrievalEnhancement(evolvedUnits),
      learning: this.buildLearningSignals(evolvedUnits),
      storage: {
        mode: "draft_metadata_only",
        indexReady: evolvedUnits.length > 0 && evolvedUnits.every((unit) => unit.embedding_ready),
        unitCount: evolvedUnits.length,
        promotedCount: promotedUnits.length
      }
    };
  }

  extractKnowledgeUnits(text: string, document: KnowledgeFactoryDocument = { text }): EvolvingKnowledgeUnit[] {
    const base = this.v2.ingest(document).units;

    return base.map((unit) => toEvolvingUnit(unit, this.scoreKnowledge(unit)));
  }

  scoreKnowledge(unit: KnowledgeUnit): KnowledgeQualityScore {
    const content = clean(unit.content);
    const title = clean(unit.title);
    const hasAction = /建议|需要|必须|应当|步骤|流程|先|再|最后|核对|确认|判断/.test(content);
    const hasBoundary = /不能|避免|风险|合规|边界|禁用|过期|承诺|注意/.test(content);
    const hasScenario = /客户|用户|一线|客服|销售|售后|场景|如果|当/.test(content);
    const lengthScore = content.length < 24 ? 0.35 : content.length < 80 ? 0.58 : content.length < 420 ? 0.86 : 0.68;
    const titleScore = title.length >= 6 && title.length <= 40 ? 0.82 : 0.55;
    const tagScore = unit.tags.length >= 2 ? 0.82 : 0.5;
    const typeBoost = unit.type === "SOP" || unit.type === "FAQ" ? 0.12 : unit.type === "scenario" ? 0.08 : 0;

    return {
      clarity: clamp01((lengthScore * 0.55) + (titleScore * 0.3) + (tagScore * 0.15)),
      usefulness: clamp01(0.45 + (hasAction ? 0.28 : 0) + (hasScenario ? 0.12 : 0) + typeBoost),
      reusability: clamp01(0.42 + (unit.type === "FAQ" ? 0.28 : 0) + (unit.type === "SOP" ? 0.22 : 0) + (unit.tags.length >= 3 ? 0.12 : 0)),
      frequency: clamp01(0.35 + (hasScenario ? 0.16 : 0) + (hasAction ? 0.12 : 0) + (unit.tags.length >= 3 ? 0.1 : 0)),
      confidence: clamp01(0.5 + (content.length >= 60 ? 0.18 : 0) + (hasBoundary ? 0.12 : 0) + (unit.embedding_ready ? 0.08 : 0))
    };
  }

  mergeSimilarKnowledge(units: EvolvingKnowledgeUnit[]): EvolvingKnowledgeUnit[] {
    const groups: EvolvingKnowledgeUnit[][] = [];

    for (const unit of units) {
      const unitTokens = tokenize(`${unit.title} ${unit.content} ${unit.tags.join(" ")}`);
      const group = groups.find((items) => {
        const anchor = items[0];

        if (!anchor || anchor.type !== unit.type) {
          return false;
        }

        const anchorTokens = tokenize(`${anchor.title} ${anchor.content} ${anchor.tags.join(" ")}`);

        return jaccard(anchorTokens, unitTokens) >= 0.42 || anchor.tags.some((tag) => unit.tags.includes(tag)) && jaccard(anchorTokens, unitTokens) >= 0.28;
      });

      if (group) {
        group.push(unit);
      } else {
        groups.push([unit]);
      }
    }

    return groups.map(mergeUnitGroup).filter((unit): unit is EvolvingKnowledgeUnit => Boolean(unit));
  }

  evolveKnowledge(units: EvolvingKnowledgeUnit[]): EvolvingKnowledgeUnit[] {
    return units.map((unit) => {
      const nextScore: KnowledgeQualityScore = {
        clarity: clamp01(unit.score.clarity + (unit.improvementHints.length === 0 ? 0.04 : 0.08)),
        usefulness: clamp01(unit.score.usefulness + (unit.growthActions.length > 0 ? 0.06 : 0.02)),
        reusability: clamp01(unit.score.reusability + (unit.type === "FAQ" || unit.type === "SOP" ? 0.05 : 0.03)),
        frequency: clamp01(unit.score.frequency + (unit.mergedFrom.length > 1 ? 0.08 : 0.02)),
        confidence: clamp01(unit.score.confidence + (unit.tags.length >= 3 ? 0.04 : 0.02))
      };
      const evolved = toEvolvingUnit({
        id: unit.id,
        type: unit.type,
        title: unit.title,
        content: unit.content,
        tags: unit.tags,
        embedding_ready: unit.embedding_ready
      }, nextScore);

      return {
        ...evolved,
        mergedFrom: unit.mergedFrom,
        improvementHints: uniqueStrings([...unit.improvementHints, ...evolved.improvementHints], 6),
        growthActions: uniqueStrings([...unit.growthActions, ...evolved.growthActions], 6)
      };
    });
  }

  optimizeKnowledgeGraph(units: EvolvingKnowledgeUnit[] = []): KnowledgeFactoryV3Graph {
    const nodes = units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      type: unit.type,
      valueScore: unit.valueScore
    }));
    const edges: KnowledgeFactoryV3Graph["edges"] = [];

    for (let leftIndex = 0; leftIndex < units.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < units.length; rightIndex += 1) {
        const left = units[leftIndex];
        const right = units[rightIndex];
        const tagOverlap = left.tags.filter((tag) => right.tags.includes(tag)).length;
        const semanticOverlap = jaccard(tokenize(`${left.title} ${left.content}`), tokenize(`${right.title} ${right.content}`));

        if (tagOverlap > 0) {
          edges.push({ from: left.id, to: right.id, reason: "same_tag", weight: clamp01(tagOverlap / Math.max(left.tags.length, right.tags.length, 1)) });
        } else if (left.type === right.type) {
          edges.push({ from: left.id, to: right.id, reason: "same_type", weight: 0.45 });
        } else if (semanticOverlap >= 0.3) {
          edges.push({ from: left.id, to: right.id, reason: "semantic_overlap", weight: clamp01(semanticOverlap) });
        }
      }
    }

    const clusterMap = new Map<string, string[]>();

    for (const unit of units) {
      const label = unit.tags[0] || unit.type;
      const current = clusterMap.get(label) ?? [];

      current.push(unit.id);
      clusterMap.set(label, current);
    }

    return {
      nodes,
      edges: edges.slice(0, 24),
      clusters: Array.from(clusterMap.entries()).map(([label, unitIds]) => ({ label, unitIds })).slice(0, 10)
    };
  }

  promoteHighValueKnowledge(units: EvolvingKnowledgeUnit[]): EvolvingKnowledgeUnit[] {
    return units
      .filter((unit) => unit.valueScore >= 0.72 || unit.retrievalWeight >= 0.7)
      .sort((left, right) => right.valueScore - left.valueScore)
      .slice(0, 6)
      .map((unit) => ({
        ...unit,
        evolutionStage: "promoted" as const,
        growthActions: uniqueStrings([...unit.growthActions, "优先进入用户端检索增强候选"], 6)
      }));
  }

  private buildRetrievalEnhancement(units: EvolvingKnowledgeUnit[]): KnowledgeFactoryV3Result["retrievalEnhancement"] {
    const sorted = [...units].sort((left, right) => right.retrievalWeight - left.retrievalWeight);

    return {
      weightedQueries: uniqueStrings(sorted.map((unit) => unit.type === "FAQ" ? unit.title : `如何处理：${unit.title}`), 10),
      priorityTags: uniqueStrings(sorted.flatMap((unit) => unit.tags), 10),
      recommendedTopK: Math.min(8, Math.max(3, Math.ceil(sorted.length / 2)))
    };
  }

  private buildLearningSignals(units: EvolvingKnowledgeUnit[]): KnowledgeFactoryV3Result["learning"] {
    const highValueTypes = uniqueStrings(units.filter((unit) => unit.valueScore >= 0.72).map((unit) => unit.type), 4);
    const weakUnits = units.filter((unit) => unit.valueScore < 0.55);

    return {
      successPatterns: highValueTypes.length > 0
        ? highValueTypes.map((type) => `${type} 类知识复用价值较高`)
        : ["当前资料已完成基础结构化，可继续补充真实案例提升复用价值"],
      failurePatterns: weakUnits.length > 0
        ? weakUnits.slice(0, 4).map((unit) => `${unit.title} 信息密度偏低`)
        : [],
      optimizationHints: uniqueStrings(units.flatMap((unit) => unit.improvementHints), 8)
    };
  }

  private buildGrowthLoop(units: EvolvingKnowledgeUnit[], promotedUnits: EvolvingKnowledgeUnit[]) {
    return [
      "学习：从投喂资料抽取最小知识单元",
      "优化：按清晰度、复用度、可信度修正知识",
      "进化：合并相似知识并建立轻量关系图",
      promotedUnits.length > 0 ? "增长：高价值知识进入检索增强候选" : "增长：等待更多案例后再提升为高价值知识",
      units.some((unit) => unit.improvementHints.length > 0) ? "补强：根据缺口继续补资料" : "复用：进入用户端组合生成链路"
    ];
  }
}

export function enrichDraftWithKnowledgeFactoryV3<T extends KnowledgeFactoryV3DraftLike>(
  draft: T,
  input: KnowledgeFactoryDocument
): T {
  const v2Draft = enrichDraftWithKnowledgeFactory(draft, input);
  const factory = new KnowledgeFactoryV3();
  const result = factory.ingest({
    ...input,
    text: [
      input.text,
      v2Draft.summary,
      v2Draft.standardQuestion,
      v2Draft.standardAnswer,
      ...(v2Draft.scenarios ?? [])
    ].filter(Boolean).join("\n\n"),
    title: input.title ?? v2Draft.title,
    category: input.category ?? v2Draft.category,
    tags: uniqueStrings([...(input.tags ?? []), ...v2Draft.tags], 12)
  });
  const promotedQuestions = result.promotedUnits.map((unit) => unit.type === "FAQ" ? unit.title : `如何处理：${unit.title}`);
  const sourceMaterials = uniqueStrings([
    ...(v2Draft.sourceMaterials ?? []),
    ...result.promotedUnits.map((unit) => `KnowledgeFactoryV3:${unit.type}:${unit.title}:score=${scoreToPercent(unit.valueScore)}`)
  ], 12);
  const suggestedQuestions = uniqueStrings([
    ...(v2Draft.suggestedQuestions ?? []),
    ...result.retrievalEnhancement.weightedQueries,
    ...promotedQuestions
  ], 10);
  const missingFields = uniqueStrings([
    ...(v2Draft.missingFields ?? []),
    ...result.learning.optimizationHints.map((hint) => `知识进化建议：${hint}`)
  ], 8);

  return {
    ...v2Draft,
    tags: uniqueStrings([...v2Draft.tags, ...result.retrievalEnhancement.priorityTags], 12),
    sourceMaterials,
    suggestedQuestions,
    missingFields,
    knowledgeFactoryV3: result
  };
}
