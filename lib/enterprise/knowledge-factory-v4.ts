import {
  KnowledgeFactoryV3,
  enrichDraftWithKnowledgeFactoryV3,
  type EvolvingKnowledgeUnit,
  type KnowledgeFactoryV3DraftLike,
  type KnowledgeFactoryV3Result
} from "@/lib/enterprise/knowledge-factory-v3";
import type { KnowledgeFactoryDocument, KnowledgeUnit } from "@/lib/enterprise/knowledge-factory-v2";

export type CommercialKnowledgeType = KnowledgeUnit["type"] | "sales_asset";
export type CommercialUsageScenario = "toC" | "toB" | "training" | "closing";

export interface CommercialKnowledgeValue {
  knowledgeType: CommercialKnowledgeType;
  commercialValue: number;
  conversionPower: number;
  salesDifficulty: number;
  usageScenario: CommercialUsageScenario;
}

export interface SalesObjectionHandling {
  objection: string;
  response: string;
  principle: string;
}

export interface SimulatedSalesTurn {
  role: "customer" | "sales";
  message: string;
}

export interface CommercialKnowledgeAsset extends EvolvingKnowledgeUnit {
  commercial: CommercialKnowledgeValue;
  salesAngles: string[];
  salesScripts: string[];
  objectionHandling: SalesObjectionHandling[];
  conversionFlow: string[];
  simulatedConversation: SimulatedSalesTurn[];
  salesTrainingTips: string[];
}

export interface KnowledgeFactoryV4Result {
  version: "knowledge-factory-v4";
  base: KnowledgeFactoryV3Result;
  assets: CommercialKnowledgeAsset[];
  highValueAssets: CommercialKnowledgeAsset[];
  salesEnablement: {
    angles: string[];
    scripts: string[];
    objectionHandling: SalesObjectionHandling[];
    conversionFlow: string[];
    simulatedConversation: SimulatedSalesTurn[];
    trainingPlan: string[];
  };
  commercialSummary: {
    totalAssets: number;
    highValueCount: number;
    averageCommercialValue: number;
    averageConversionPower: number;
    topUsageScenario: CommercialUsageScenario;
    salesReadiness: "low" | "medium" | "high";
  };
  storage: {
    mode: "draft_metadata_only";
    indexReady: boolean;
    assetCount: number;
    highValueCount: number;
  };
}

export interface KnowledgeFactoryV4DraftLike extends KnowledgeFactoryV3DraftLike {
  knowledgeFactoryV4?: KnowledgeFactoryV4Result;
}

type CommercialKnowledgeInput = Partial<Pick<EvolvingKnowledgeUnit, "type" | "title" | "content" | "tags">> | string;

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

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return clamp01(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function scoreToPercent(score: number) {
  return Math.round(clamp01(score) * 100);
}

function toText(input: CommercialKnowledgeInput) {
  return typeof input === "string"
    ? input
    : clean([input.title, input.content, ...(input.tags ?? [])].filter(Boolean).join(" "));
}

function getTitle(input: CommercialKnowledgeInput) {
  if (typeof input === "string") {
    const title = clean(input).slice(0, 28);

    return title || "商业知识资产";
  }

  return clean(input.title ?? "") || "商业知识资产";
}

function getContent(input: CommercialKnowledgeInput) {
  return typeof input === "string" ? clean(input) : clean(input.content ?? input.title ?? "");
}

function inferUsageScenario(text: string, type?: KnowledgeUnit["type"]): CommercialUsageScenario {
  if (/培训|课程|训练|话术训练|演练|新人|销售能力|内训/.test(text) || type === "SOP") {
    return "training";
  }

  if (/成交|转化|报价|购买|下单|促单|锁单|跟进|异议|客户说|客户担心/.test(text)) {
    return "closing";
  }

  if (/企业|团队|门店|渠道|招商|代理|加盟|B端|老板|经销商/.test(text)) {
    return "toB";
  }

  return "toC";
}

function inferKnowledgeType(input: CommercialKnowledgeInput): CommercialKnowledgeType {
  if (typeof input !== "string" && input.type) {
    return /销售|话术|成交|转化|异议/.test(toText(input)) ? "sales_asset" : input.type;
  }

  return /销售|话术|成交|转化|异议/.test(toText(input)) ? "sales_asset" : "concept";
}

function buildTrainingTips(asset: CommercialKnowledgeAsset) {
  return uniqueStrings([
    `先训练销售能用一句话说明“${asset.title}”的客户价值。`,
    asset.commercial.salesDifficulty >= 0.66 ? "重点演练价格、效果、信任和风险类异议。" : "重点演练需求确认和自然承接下一步。",
    asset.commercial.usageScenario === "closing" ? "用成交流程检查每次跟进是否有明确下一步。" : null,
    asset.commercial.usageScenario === "training" ? "适合沉淀为新人培训清单和考核话术。" : null
  ], 4);
}

export class KnowledgeFactoryV4 {
  private readonly v3 = new KnowledgeFactoryV3();

  ingest(document: KnowledgeFactoryDocument): KnowledgeFactoryV4Result {
    const base = this.v3.ingest(document);
    const sourceUnits = base.evolvedUnits.length > 0 ? base.evolvedUnits : base.units;
    const assets = sourceUnits.map((unit) => this.toCommercialAsset(unit));
    const highValueAssets = assets
      .filter((asset) => asset.commercial.commercialValue >= 0.68 || asset.commercial.conversionPower >= 0.68)
      .sort((left, right) => right.commercial.commercialValue - left.commercial.commercialValue)
      .slice(0, 6);

    return {
      version: "knowledge-factory-v4",
      base,
      assets,
      highValueAssets,
      salesEnablement: this.buildSalesEnablement(assets),
      commercialSummary: this.buildCommercialSummary(assets, highValueAssets),
      storage: {
        mode: "draft_metadata_only",
        indexReady: assets.length > 0 && assets.every((asset) => asset.embedding_ready),
        assetCount: assets.length,
        highValueCount: highValueAssets.length
      }
    };
  }

  extractCommercialKnowledge(text: string, document: KnowledgeFactoryDocument = { text }): CommercialKnowledgeAsset[] {
    const base = this.v3.ingest({ ...document, text });
    const sourceUnits = base.evolvedUnits.length > 0 ? base.evolvedUnits : base.units;

    return sourceUnits.map((unit) => this.toCommercialAsset(unit));
  }

  generateSalesAngles(knowledge: CommercialKnowledgeInput): string[] {
    const title = getTitle(knowledge);
    const content = getContent(knowledge);
    const scenario = inferUsageScenario(toText(knowledge), typeof knowledge === "string" ? undefined : knowledge.type);

    return uniqueStrings([
      `把“${title}”讲成客户能立刻理解的实际收益。`,
      /痛|难|担心|问题|风险|低效|反弹|没效果/.test(content) ? "先承接客户痛点，再说明解决逻辑。" : "先确认客户目标，再说明适用价值。",
      scenario === "toB" ? "强调团队复制、流程标准化和经营效率。" : null,
      scenario === "closing" ? "把卖点落到下一步行动：体验、对比、确认或下单。" : null,
      scenario === "training" ? "转成新人能背、能演练、能复盘的话术。" : null
    ], 5);
  }

  generateSalesScripts(knowledge: CommercialKnowledgeInput): string[] {
    const title = getTitle(knowledge);
    const content = getContent(knowledge);
    const shortContent = content.length > 80 ? `${content.slice(0, 80)}...` : content;

    return uniqueStrings([
      `您这个问题可以先看“${title}”这条逻辑：${shortContent || "它的重点是先判断需求，再给出匹配方案。"}`,
      `如果您现在最关心的是效果，我建议先确认当前情况，再按“${title}”里的步骤做判断，这样不会盲目推荐。`,
      `这部分不是让您马上决定，而是先把适不适合、怎么做、注意什么讲清楚。`
    ], 4);
  }

  generateObjectionHandling(knowledge: CommercialKnowledgeInput): SalesObjectionHandling[] {
    const title = getTitle(knowledge);
    const score = this.scoreCommercialValue(knowledge);
    const base: SalesObjectionHandling[] = [
      {
        objection: "我担心没有效果。",
        response: `可以理解。我们先不直接承诺结果，而是按“${title}”里的条件判断您是否适合，再给您一个更稳妥的执行建议。`,
        principle: "先共情，再判断适配，不夸大承诺。"
      },
      {
        objection: "价格有点高。",
        response: `价格要结合价值看。您可以先对比这件事能解决什么问题，再决定是否值得投入。`,
        principle: "从价格转向价值和风险成本。"
      }
    ];

    if (score.salesDifficulty >= 0.66) {
      base.push({
        objection: "我怕有风险。",
        response: "这个顾虑很重要。我们会先确认禁忌、边界和使用条件，不适合的情况不会建议硬做。",
        principle: "风险类异议优先给边界和安全感。"
      });
    }

    return base.slice(0, 4);
  }

  generateCustomerConversionFlow(knowledge: CommercialKnowledgeInput): string[] {
    const title = getTitle(knowledge);
    const scenario = inferUsageScenario(toText(knowledge), typeof knowledge === "string" ? undefined : knowledge.type);

    return uniqueStrings([
      "确认客户当前目标和最主要顾虑。",
      `用“${title}”解释核心价值和适用条件。`,
      "补充案例、边界或执行步骤，降低不确定感。",
      scenario === "closing" ? "给出明确下一步：体验、对比、确认方案或下单。" : "给出轻量下一步：补资料、做评估或继续追问。"
    ], 5);
  }

  simulateSalesConversation(knowledge: CommercialKnowledgeInput): SimulatedSalesTurn[] {
    const title = getTitle(knowledge);
    const scripts = this.generateSalesScripts(knowledge);
    const objections = this.generateObjectionHandling(knowledge);

    return [
      { role: "customer", message: `我想了解一下${title}，但还不确定适不适合。` },
      { role: "sales", message: scripts[0] ?? "我们先确认您的目标和顾虑，再判断是否适合。" },
      { role: "customer", message: objections[0]?.objection ?? "我担心没有效果。" },
      { role: "sales", message: objections[0]?.response ?? "可以理解，我们先按条件判断，不会直接承诺结果。" }
    ];
  }

  scoreCommercialValue(knowledge: CommercialKnowledgeInput): CommercialKnowledgeValue {
    const text = toText(knowledge);
    const type = typeof knowledge === "string" ? undefined : knowledge.type;
    const hasCustomer = /客户|用户|顾客|咨询|成交|销售|客服|售后|招商|代理/.test(text);
    const hasValue = /价值|收益|效果|改善|解决|提升|节省|降低|增长|转化|复购/.test(text);
    const hasAction = /建议|步骤|流程|话术|回复|跟进|确认|判断|执行|训练/.test(text);
    const hasProof = /案例|数据|报告|检测|反馈|证明|对比|复盘/.test(text);
    const hasObjection = /异议|价格|贵|没效果|担心|风险|副作用|退款|投诉|反弹|禁忌/.test(text);
    const usageScenario = inferUsageScenario(text, type);

    return {
      knowledgeType: inferKnowledgeType(knowledge),
      commercialValue: clamp01(0.36 + (hasCustomer ? 0.16 : 0) + (hasValue ? 0.2 : 0) + (hasAction ? 0.14 : 0) + (hasProof ? 0.08 : 0)),
      conversionPower: clamp01(0.32 + (hasCustomer ? 0.14 : 0) + (hasValue ? 0.18 : 0) + (hasAction ? 0.18 : 0) + (usageScenario === "closing" ? 0.12 : 0)),
      salesDifficulty: clamp01(0.28 + (hasObjection ? 0.26 : 0) + (/合规|风险|承诺|医疗|法律|财务|禁用/.test(text) ? 0.18 : 0) + (text.length > 360 ? 0.08 : 0)),
      usageScenario
    };
  }

  private toCommercialAsset(unit: EvolvingKnowledgeUnit): CommercialKnowledgeAsset {
    const commercial = this.scoreCommercialValue(unit);
    const partialAsset = {
      ...unit,
      commercial,
      salesAngles: this.generateSalesAngles(unit),
      salesScripts: this.generateSalesScripts(unit),
      objectionHandling: this.generateObjectionHandling(unit),
      conversionFlow: this.generateCustomerConversionFlow(unit),
      simulatedConversation: this.simulateSalesConversation(unit),
      salesTrainingTips: []
    } satisfies CommercialKnowledgeAsset;

    return {
      ...partialAsset,
      salesTrainingTips: buildTrainingTips(partialAsset)
    };
  }

  private buildSalesEnablement(assets: CommercialKnowledgeAsset[]): KnowledgeFactoryV4Result["salesEnablement"] {
    return {
      angles: uniqueStrings(assets.flatMap((asset) => asset.salesAngles), 10),
      scripts: uniqueStrings(assets.flatMap((asset) => asset.salesScripts), 8),
      objectionHandling: assets.flatMap((asset) => asset.objectionHandling).slice(0, 8),
      conversionFlow: uniqueStrings(assets.flatMap((asset) => asset.conversionFlow), 8),
      simulatedConversation: assets.flatMap((asset) => asset.simulatedConversation).slice(0, 8),
      trainingPlan: uniqueStrings(assets.flatMap((asset) => asset.salesTrainingTips), 8)
    };
  }

  private buildCommercialSummary(
    assets: CommercialKnowledgeAsset[],
    highValueAssets: CommercialKnowledgeAsset[]
  ): KnowledgeFactoryV4Result["commercialSummary"] {
    const scenarioCounts = new Map<CommercialUsageScenario, number>();

    for (const asset of assets) {
      scenarioCounts.set(asset.commercial.usageScenario, (scenarioCounts.get(asset.commercial.usageScenario) ?? 0) + 1);
    }

    const topUsageScenario = Array.from(scenarioCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "toC";
    const averageCommercialValue = average(assets.map((asset) => asset.commercial.commercialValue));
    const averageConversionPower = average(assets.map((asset) => asset.commercial.conversionPower));
    const readinessScore = (averageCommercialValue + averageConversionPower + clamp01(highValueAssets.length / Math.max(assets.length, 1))) / 3;

    return {
      totalAssets: assets.length,
      highValueCount: highValueAssets.length,
      averageCommercialValue,
      averageConversionPower,
      topUsageScenario,
      salesReadiness: readinessScore >= 0.72 ? "high" : readinessScore >= 0.52 ? "medium" : "low"
    };
  }
}

export function enrichDraftWithKnowledgeFactoryV4<T extends KnowledgeFactoryV4DraftLike>(
  draft: T,
  input: KnowledgeFactoryDocument
): T {
  const v3Draft = enrichDraftWithKnowledgeFactoryV3(draft, input);
  const factory = new KnowledgeFactoryV4();
  const result = factory.ingest({
    ...input,
    text: [
      input.text,
      v3Draft.summary,
      v3Draft.standardQuestion,
      v3Draft.standardAnswer,
      ...(v3Draft.scenarios ?? []),
      ...(v3Draft.standardAnswers ?? [])
    ].filter(Boolean).join("\n\n"),
    title: input.title ?? v3Draft.title,
    category: input.category ?? v3Draft.category,
    tags: uniqueStrings([...(input.tags ?? []), ...v3Draft.tags, "商业化", "销售话术"], 12)
  });
  const topAssets = result.highValueAssets.length > 0 ? result.highValueAssets : result.assets.slice(0, 4);
  const sourceMaterials = uniqueStrings([
    ...(v3Draft.sourceMaterials ?? []),
    ...topAssets.map((asset) => `KnowledgeFactoryV4:${asset.commercial.usageScenario}:${asset.title}:commercial=${scoreToPercent(asset.commercial.commercialValue)}`)
  ], 12);
  const suggestedQuestions = uniqueStrings([
    ...(v3Draft.suggestedQuestions ?? []),
    ...topAssets.map((asset) => `这条知识如何转成${asset.commercial.usageScenario === "training" ? "销售训练" : "客户转化"}话术？`),
    ...result.salesEnablement.angles
  ], 10);
  const standardQuestions = uniqueStrings([
    ...(v3Draft.standardQuestions ?? []),
    ...topAssets.map((asset) => `客户问到“${asset.title}”时，应该如何转化？`)
  ], 10);
  const standardAnswers = uniqueStrings([
    ...(v3Draft.standardAnswers ?? []),
    ...result.salesEnablement.scripts
  ], 10);
  const missingFields = uniqueStrings([
    ...(v3Draft.missingFields ?? []),
    result.commercialSummary.salesReadiness === "low" ? "商业化补强建议：补充真实案例、客户痛点和成交边界。" : null,
    ...result.highValueAssets.flatMap((asset) => asset.salesTrainingTips.map((tip) => `销售训练建议：${tip}`))
  ], 10);

  return {
    ...v3Draft,
    tags: uniqueStrings([...v3Draft.tags, "商业知识", result.commercialSummary.topUsageScenario, ...topAssets.flatMap((asset) => asset.tags)], 12),
    sourceMaterials,
    suggestedQuestions,
    standardQuestions,
    standardAnswers,
    missingFields,
    knowledgeFactoryV4: result
  };
}