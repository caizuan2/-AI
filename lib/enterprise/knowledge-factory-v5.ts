import {
  KnowledgeFactoryV4,
  enrichDraftWithKnowledgeFactoryV4,
  type CommercialKnowledgeAsset,
  type KnowledgeFactoryV4DraftLike,
  type KnowledgeFactoryV4Result
} from "@/lib/enterprise/knowledge-factory-v4";
import {
  CommercialDecisionEngine,
  type CommercialDecisionContext,
  type CommercialIntentAnalysis,
  type CommercialOutputStrategy,
  type CommercialScenarioDetection
} from "@/lib/enterprise/commercial-decision-engine";
import type { KnowledgeFactoryDocument } from "@/lib/enterprise/knowledge-factory-v2";

export interface CommercialDecisionAsset extends CommercialKnowledgeAsset {
  outputStrategy: CommercialOutputStrategy;
  decisionReason: string;
  conversionScore: number;
}

export interface KnowledgeFactoryV5Result {
  version: "knowledge-factory-v5";
  base: KnowledgeFactoryV4Result;
  intent: CommercialIntentAnalysis;
  scenario: CommercialScenarioDetection;
  outputStrategy: CommercialOutputStrategy;
  ragQueryDecision: CommercialOutputStrategy["ragDecision"];
  decisionAssets: CommercialDecisionAsset[];
  optimizedSalesScripts: string[];
  conversionPlan: string[];
  strategyBrief: string;
  storage: {
    mode: "draft_metadata_only";
    decisionReady: boolean;
    strategyMode: CommercialOutputStrategy["mode"];
    assetCount: number;
  };
}

export interface KnowledgeFactoryV5DraftLike extends KnowledgeFactoryV4DraftLike {
  knowledgeFactoryV5?: KnowledgeFactoryV5Result;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
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

function assetContext(asset: CommercialKnowledgeAsset, document: KnowledgeFactoryDocument): CommercialDecisionContext {
  return {
    query: document.text,
    content: `${asset.title} ${asset.content}`,
    category: document.category,
    tags: [...(document.tags ?? []), ...asset.tags],
    commercialValue: asset.commercial.commercialValue,
    conversionPower: asset.commercial.conversionPower,
    salesDifficulty: asset.commercial.salesDifficulty
  };
}

export class KnowledgeFactoryV5 {
  private readonly v4 = new KnowledgeFactoryV4();
  private readonly decisionEngine = new CommercialDecisionEngine();

  ingest(document: KnowledgeFactoryDocument): KnowledgeFactoryV5Result {
    const base = this.v4.ingest(document);
    const context = this.buildDecisionContext(document, base);
    const intent = this.decisionEngine.analyzeUserIntent(context.query ?? document.text);
    const scenario = this.decisionEngine.detectScenario(context);
    const outputStrategy = this.decisionEngine.decideOutputStrategy(context);
    const decisionAssets = this.buildDecisionAssets(base.assets, document);

    return {
      version: "knowledge-factory-v5",
      base,
      intent,
      scenario,
      outputStrategy,
      ragQueryDecision: outputStrategy.ragDecision,
      decisionAssets,
      optimizedSalesScripts: this.buildOptimizedSalesScripts(base, outputStrategy),
      conversionPlan: this.buildConversionPlan(outputStrategy, base),
      strategyBrief: this.buildStrategyBrief(outputStrategy, intent, scenario),
      storage: {
        mode: "draft_metadata_only",
        decisionReady: decisionAssets.length > 0,
        strategyMode: outputStrategy.mode,
        assetCount: decisionAssets.length
      }
    };
  }

  private buildDecisionContext(document: KnowledgeFactoryDocument, base: KnowledgeFactoryV4Result): CommercialDecisionContext {
    return {
      query: document.text,
      content: [
        document.title,
        document.category,
        base.commercialSummary.topUsageScenario,
        ...base.salesEnablement.angles,
        ...base.salesEnablement.scripts
      ].filter(Boolean).join(" "),
      category: document.category,
      tags: uniqueStrings([...(document.tags ?? []), ...base.base.retrievalEnhancement.priorityTags], 10),
      commercialValue: base.commercialSummary.averageCommercialValue,
      conversionPower: base.commercialSummary.averageConversionPower,
      salesDifficulty: Math.max(0, ...base.assets.map((asset) => asset.commercial.salesDifficulty))
    };
  }

  private buildDecisionAssets(assets: CommercialKnowledgeAsset[], document: KnowledgeFactoryDocument): CommercialDecisionAsset[] {
    return assets
      .map((asset) => {
        const outputStrategy = this.decisionEngine.decideOutputStrategy(assetContext(asset, document));
        const conversionScore = clamp01(
          (asset.commercial.commercialValue * 0.34)
          + (asset.commercial.conversionPower * 0.34)
          + ((1 - asset.commercial.salesDifficulty) * 0.12)
          + (asset.valueScore * 0.2)
        );

        return {
          ...asset,
          outputStrategy,
          conversionScore,
          decisionReason: this.buildDecisionReason(outputStrategy, conversionScore)
        };
      })
      .sort((left, right) => right.conversionScore - left.conversionScore)
      .slice(0, 8);
  }

  private buildDecisionReason(strategy: CommercialOutputStrategy, conversionScore: number) {
    return `选择 ${strategy.mode} 输出，因为当前场景为 ${strategy.scenario}，目标是 ${strategy.objective}，转化评分约 ${Math.round(conversionScore * 100)}。`;
  }

  private buildOptimizedSalesScripts(base: KnowledgeFactoryV4Result, strategy: CommercialOutputStrategy) {
    const optimized = base.salesEnablement.scripts.map((script) => this.decisionEngine.optimizeForConversion(script, {
      content: base.salesEnablement.angles.join(" "),
      tags: base.base.retrievalEnhancement.priorityTags,
      commercialValue: base.commercialSummary.averageCommercialValue,
      conversionPower: base.commercialSummary.averageConversionPower
    }).optimizedResponse);

    if (strategy.mode === "sales_script" && optimized.length === 0) {
      optimized.push("您可以先说一下当前最担心的点，我帮您按实际情况判断适不适合，再给您一个稳妥建议。");
    }

    return uniqueStrings(optimized, 8);
  }

  private buildConversionPlan(strategy: CommercialOutputStrategy, base: KnowledgeFactoryV4Result) {
    return uniqueStrings([
      `输出模式：${strategy.mode}`,
      `目标：${strategy.objective}`,
      `优先检索：${strategy.ragDecision.queryFocus.join(" / ")}`,
      ...strategy.conversionPrinciples,
      ...base.salesEnablement.conversionFlow
    ], 10);
  }

  private buildStrategyBrief(
    strategy: CommercialOutputStrategy,
    intent: CommercialIntentAnalysis,
    scenario: CommercialScenarioDetection
  ) {
    return `当前更适合用 ${strategy.mode} 输出，面向 ${strategy.userType}，场景 ${scenario.scenario}，商业意图 ${Math.round(intent.commercialIntentScore * 100)}%，下一步应${strategy.callToAction}`;
  }
}

export function enrichDraftWithKnowledgeFactoryV5<T extends KnowledgeFactoryV5DraftLike>(
  draft: T,
  input: KnowledgeFactoryDocument
): T {
  const v4Draft = enrichDraftWithKnowledgeFactoryV4(draft, input);
  const factory = new KnowledgeFactoryV5();
  const result = factory.ingest({
    ...input,
    text: [
      input.text,
      v4Draft.summary,
      v4Draft.standardQuestion,
      v4Draft.standardAnswer,
      ...(v4Draft.scenarios ?? []),
      ...(v4Draft.standardAnswers ?? []),
      ...(v4Draft.knowledgeFactoryV4?.salesEnablement.scripts ?? [])
    ].filter(Boolean).join("\n\n"),
    title: input.title ?? v4Draft.title,
    category: input.category ?? v4Draft.category,
    tags: uniqueStrings([...(input.tags ?? []), ...v4Draft.tags, resultSafeTag(v4Draft.knowledgeFactoryV4?.commercialSummary.salesReadiness)], 12)
  });
  const suggestedQuestions = uniqueStrings([
    ...(v4Draft.suggestedQuestions ?? []),
    `这条知识当前最适合用“${result.outputStrategy.mode}”方式输出吗？`,
    `是否要按“${result.outputStrategy.callToAction}”生成客户跟进话术？`,
    ...result.ragQueryDecision.queryFocus.map((focus) => `是否补充${focus}相关证据？`)
  ], 10);
  const sourceMaterials = uniqueStrings([
    ...(v4Draft.sourceMaterials ?? []),
    `KnowledgeFactoryV5:${result.outputStrategy.mode}:${result.outputStrategy.objective}:scenario=${result.outputStrategy.scenario}`
  ], 12);
  const missingFields = uniqueStrings([
    ...(v4Draft.missingFields ?? []),
    result.outputStrategy.ragDecision.retrievalPriority === "proof" ? "商业决策补强建议：补充证明材料、案例或对比数据。" : null,
    result.intent.commercialIntentScore >= 0.6 && result.optimizedSalesScripts.length === 0 ? "商业决策补强建议：补充可复制客户话术。" : null
  ], 10);

  return {
    ...v4Draft,
    tags: uniqueStrings([...v4Draft.tags, "商业决策", result.outputStrategy.mode, result.outputStrategy.scenario], 12),
    suggestedQuestions,
    sourceMaterials,
    missingFields,
    knowledgeFactoryV5: result
  };
}

function resultSafeTag(value?: string) {
  return value ? `sales-readiness-${value}` : null;
}