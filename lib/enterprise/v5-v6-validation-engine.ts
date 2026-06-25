import { CommercialDecisionEngine, type CommercialOutputStrategy } from "@/lib/enterprise/commercial-decision-engine";
import type { GptKnowledgeDraft } from "@/lib/enterprise/gpt-knowledge-draft";
import type { KnowledgeFactoryV2Result, KnowledgeUnit } from "@/lib/enterprise/knowledge-factory-v2";
import type { KnowledgeFactoryV3Result } from "@/lib/enterprise/knowledge-factory-v3";
import type { KnowledgeFactoryV4Result } from "@/lib/enterprise/knowledge-factory-v4";
import type { KnowledgeFactoryV5Result } from "@/lib/enterprise/knowledge-factory-v5";

export type ValidationStatus = "pass" | "warn" | "fail";
export type UserCommercialStage = "cold" | "warm" | "hot" | "buyer";

export interface ValidationCheck {
  key: string;
  label: string;
  passed: boolean;
  status: ValidationStatus;
  score: number;
  detail: string;
}

export interface V5KnowledgeGenerationEvidence {
  draft?: Partial<GptKnowledgeDraft> | null;
  knowledgeFactory?: KnowledgeFactoryV2Result | null;
  knowledgeFactoryV3?: KnowledgeFactoryV3Result | null;
  knowledgeFactoryV4?: KnowledgeFactoryV4Result | null;
  knowledgeFactoryV5?: KnowledgeFactoryV5Result | null;
}

export interface V6RetrievedKnowledgeChunk {
  id?: string;
  title?: string;
  content?: string;
  source?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface V6RAGEvidence {
  query?: string;
  ragTriggered?: boolean;
  retrievedChunks?: V6RetrievedKnowledgeChunk[];
  usedKnowledgeUnitIds?: string[];
  citations?: string[];
  combinedKnowledgeCount?: number;
  responseText?: string;
}

export interface V6CommercialEvidence {
  userQuery?: string;
  responseText?: string;
  outputStrategy?: CommercialOutputStrategy;
  ctaText?: string;
  conversionEvents?: string[];
  userTypeHint?: string;
}

export interface V5V6FullChainInput {
  v5: V5KnowledgeGenerationEvidence;
  rag?: V6RAGEvidence;
  commercial?: V6CommercialEvidence;
}

export interface ValidationSectionResult {
  passed: boolean;
  score: number;
  checks: ValidationCheck[];
  summary: string;
}

export interface V5V6FullChainReport {
  version: "v5-v6-validation-v1";
  generatedAt: string;
  closedLoopValid: boolean;
  overallScore: number;
  knowledgeGeneration: ValidationSectionResult;
  ragUsage: ValidationSectionResult;
  userIntentFlow: ValidationSectionResult & {
    commercialStage: UserCommercialStage;
  };
  commercialActivation: ValidationSectionResult;
  recommendations: string[];
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return clamp01(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 10) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = clean(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result.slice(0, limit);
}

function statusFromScore(score: number, passed: boolean): ValidationStatus {
  if (!passed) {
    return "fail";
  }

  return score >= 0.75 ? "pass" : "warn";
}

function makeCheck(input: {
  key: string;
  label: string;
  passed: boolean;
  score: number;
  detail: string;
}): ValidationCheck {
  return {
    ...input,
    score: clamp01(input.score),
    status: statusFromScore(input.score, input.passed)
  };
}

function sectionResult(checks: ValidationCheck[], summary: string): ValidationSectionResult {
  const score = average(checks.map((check) => check.score));

  return {
    passed: checks.every((check) => check.passed),
    score,
    checks,
    summary
  };
}

function getUnits(evidence: V5KnowledgeGenerationEvidence): KnowledgeUnit[] {
  return [
    ...(evidence.knowledgeFactory?.units ?? []),
    ...(evidence.knowledgeFactoryV3?.units ?? []),
    ...(evidence.knowledgeFactoryV3?.evolvedUnits ?? []),
    ...(evidence.knowledgeFactoryV4?.assets ?? []),
    ...(evidence.knowledgeFactoryV5?.decisionAssets ?? [])
  ];
}

function hasMetadataValue(chunk: V6RetrievedKnowledgeChunk, pattern: RegExp) {
  const values = [
    chunk.id,
    chunk.title,
    chunk.source,
    chunk.content,
    ...Object.values(chunk.metadata ?? {}).map((value) => typeof value === "string" ? value : JSON.stringify(value))
  ];

  return values.some((value) => pattern.test(clean(value)));
}

export class V5V6ValidationEngine {
  private readonly decisionEngine = new CommercialDecisionEngine();

  validateKnowledgeGeneration(evidence: V5KnowledgeGenerationEvidence): ValidationSectionResult {
    const draft = evidence.draft;
    const v2 = evidence.knowledgeFactory ?? draft?.knowledgeFactory;
    const v3 = evidence.knowledgeFactoryV3 ?? draft?.knowledgeFactoryV3;
    const v4 = evidence.knowledgeFactoryV4 ?? draft?.knowledgeFactoryV4;
    const v5 = evidence.knowledgeFactoryV5 ?? draft?.knowledgeFactoryV5;
    const units = getUnits({ draft, knowledgeFactory: v2, knowledgeFactoryV3: v3, knowledgeFactoryV4: v4, knowledgeFactoryV5: v5 });
    const unitTypes = new Set(units.map((unit) => unit.type));
    const checks = [
      makeCheck({
        key: "knowledge_units",
        label: "Knowledge Unit 已结构化",
        passed: units.length > 0,
        score: units.length > 0 ? Math.min(1, units.length / 6) : 0,
        detail: `检测到 ${units.length} 个知识单元。`
      }),
      makeCheck({
        key: "sop",
        label: "SOP 已生成",
        passed: Boolean(v2?.sop.length || unitTypes.has("SOP")),
        score: v2?.sop.length ? 1 : unitTypes.has("SOP") ? 0.82 : 0,
        detail: `SOP 数量：${v2?.sop.length ?? 0}。`
      }),
      makeCheck({
        key: "faq",
        label: "FAQ 已生成",
        passed: Boolean(v2?.faq.length || unitTypes.has("FAQ") || draft?.standardQuestions?.length),
        score: v2?.faq.length ? 1 : draft?.standardQuestions?.length ? 0.76 : 0,
        detail: `FAQ 数量：${v2?.faq.length ?? 0}，标准问法：${draft?.standardQuestions?.length ?? 0}。`
      }),
      makeCheck({
        key: "scenario",
        label: "Scenario 已生成",
        passed: Boolean(v2?.scenarios.length || unitTypes.has("scenario") || draft?.scenarios?.length),
        score: v2?.scenarios.length ? 1 : draft?.scenarios?.length ? 0.72 : 0,
        detail: `Scenario 数量：${v2?.scenarios.length ?? 0}，草稿场景：${draft?.scenarios?.length ?? 0}。`
      }),
      makeCheck({
        key: "commercial_metadata",
        label: "商业 metadata 已存在",
        passed: Boolean(v4?.assets.length || v5?.decisionAssets.length),
        score: v5?.decisionAssets.length ? 1 : v4?.assets.length ? 0.82 : 0,
        detail: `V4 资产：${v4?.assets.length ?? 0}，V5 决策资产：${v5?.decisionAssets.length ?? 0}。`
      }),
      makeCheck({
        key: "decision_strategy",
        label: "V5 输出策略已生成",
        passed: Boolean(v5?.outputStrategy && v5?.ragQueryDecision),
        score: v5?.outputStrategy && v5?.ragQueryDecision ? 1 : 0,
        detail: v5?.outputStrategy ? `策略：${v5.outputStrategy.mode} / ${v5.outputStrategy.objective}。` : "未检测到 V5 输出策略。"
      })
    ];

    return sectionResult(checks, checks.every((check) => check.passed) ? "V5 知识生产链路完整。" : "V5 知识生产链路仍有缺口。可以先补齐 SOP/FAQ/scenario 或商业 metadata。");
  }

  validateRAGUsage(evidence: V6RAGEvidence = {}): ValidationSectionResult {
    const chunks = evidence.retrievedChunks ?? [];
    const combinedCount = evidence.combinedKnowledgeCount ?? chunks.length;
    const usedV5Unit = chunks.some((chunk) => hasMetadataValue(chunk, /KnowledgeFactoryV5|commercial|decision|conversion|sales/i))
      || (evidence.usedKnowledgeUnitIds ?? []).some((id) => /v5|commercial|decision|conversion|sales/i.test(id));
    const checks = [
      makeCheck({
        key: "rag_triggered",
        label: "用户提问触发 RAG 检索",
        passed: evidence.ragTriggered === true || chunks.length > 0,
        score: evidence.ragTriggered === true ? 1 : chunks.length > 0 ? 0.84 : 0,
        detail: evidence.ragTriggered === true ? "RAG 标记为已触发。" : `检索片段数量：${chunks.length}。`
      }),
      makeCheck({
        key: "retrieval_hits",
        label: "用户问题命中知识库",
        passed: chunks.length > 0 || Boolean(evidence.citations?.length),
        score: chunks.length > 0 ? Math.min(1, chunks.length / 4) : evidence.citations?.length ? 0.72 : 0,
        detail: `retrievedChunks=${chunks.length}, citations=${evidence.citations?.length ?? 0}。`
      }),
      makeCheck({
        key: "multi_knowledge_combination",
        label: "返回多个知识组合",
        passed: combinedCount >= 2,
        score: combinedCount >= 3 ? 1 : combinedCount >= 2 ? 0.78 : 0,
        detail: `组合知识数：${combinedCount}。`
      }),
      makeCheck({
        key: "v5_unit_used",
        label: "用户端使用 V5 知识单元",
        passed: usedV5Unit,
        score: usedV5Unit ? 1 : 0,
        detail: usedV5Unit ? "检索证据中出现 V5/商业决策相关 metadata。" : "未检测到 V5 knowledge unit 使用证据。"
      })
    ];

    return sectionResult(checks, checks.every((check) => check.passed) ? "V6 已有效调用 V5 知识。" : "V6 对 V5 知识的调用证据不足。需要补充检索 trace 或 chunk metadata。");
  }

  validateUserIntentFlow(evidence: V6CommercialEvidence = {}): ValidationSectionResult & { commercialStage: UserCommercialStage } {
    const query = clean(evidence.userQuery);
    const response = clean(evidence.responseText);
    const intent = this.decisionEngine.analyzeUserIntent(`${query} ${response}`);
    const scenario = this.decisionEngine.detectScenario({ query, content: response, user: evidence.userTypeHint });
    const strategy = evidence.outputStrategy ?? this.decisionEngine.decideOutputStrategy({ query, content: response, user: evidence.userTypeHint });
    const commercialStage = this.classifyCommercialStage(query, response, strategy);
    const checks = [
      makeCheck({
        key: "intent_detected",
        label: "识别用户意图",
        passed: Boolean(intent.primaryIntent),
        score: intent.primaryIntent ? 1 : 0,
        detail: `intent=${intent.primaryIntent}, commercial=${Math.round(intent.commercialIntentScore * 100)}%。`
      }),
      makeCheck({
        key: "stage_detected",
        label: "识别 cold/warm/hot/buyer 阶段",
        passed: Boolean(commercialStage),
        score: commercialStage === "buyer" || commercialStage === "hot" ? 1 : commercialStage === "warm" ? 0.78 : 0.58,
        detail: `stage=${commercialStage}。`
      }),
      makeCheck({
        key: "scenario_detected",
        label: "识别商业场景",
        passed: scenario.confidence >= 0.58,
        score: scenario.confidence,
        detail: `scenario=${scenario.scenario}, confidence=${Math.round(scenario.confidence * 100)}%。`
      }),
      makeCheck({
        key: "strategy_selected",
        label: "触发商业策略选择",
        passed: Boolean(strategy.mode && strategy.objective),
        score: strategy.mode && strategy.objective ? 1 : 0,
        detail: `strategy=${strategy.mode}, objective=${strategy.objective}。`
      })
    ];

    return {
      ...sectionResult(checks, checks.every((check) => check.passed) ? "用户意图到商业策略链路成立。" : "用户意图到商业策略链路不完整。"),
      commercialStage
    };
  }

  validateCommercialActivation(evidence: V6CommercialEvidence = {}): ValidationSectionResult {
    const response = clean(evidence.responseText);
    const cta = clean(evidence.ctaText);
    const strategy = evidence.outputStrategy ?? this.decisionEngine.decideOutputStrategy({
      query: evidence.userQuery,
      content: response,
      user: evidence.userTypeHint
    });
    const hasConversionLanguage = /建议|可以先|下一步|确认|评估|体验|对比|下单|跟进|行动|方案|回复/.test(`${response} ${cta}`);
    const hasCTA = Boolean(cta) || /下一步|建议您|可以先|请先|如果您愿意|我们先|确认/.test(response);
    const hasSalesScript = /可复制给客户|客户话术|标准回复|您可以这样说|可以这样回复/.test(response);
    const checks = [
      makeCheck({
        key: "conversion_answer",
        label: "出现转化型回答",
        passed: hasConversionLanguage,
        score: hasConversionLanguage ? 1 : 0,
        detail: hasConversionLanguage ? "回答中存在建议、引导或推荐语言。" : "回答中未检测到明显转化动作。"
      }),
      makeCheck({
        key: "cta",
        label: "生成行动路径 CTA",
        passed: hasCTA || strategy.callToAction.length > 0,
        score: hasCTA ? 1 : strategy.callToAction ? 0.74 : 0,
        detail: hasCTA ? "回答或证据中存在 CTA。" : `策略 CTA：${strategy.callToAction || "无"}。`
      }),
      makeCheck({
        key: "strategy_alignment",
        label: "回答与商业策略一致",
        passed: strategy.objective !== "educate" || /解释|理解|学习|判断|建议/.test(response),
        score: strategy.objective === "convert" && hasCTA ? 1 : strategy.objective === "train" && /训练|演练|话术/.test(response) ? 1 : 0.72,
        detail: `objective=${strategy.objective}, mode=${strategy.mode}。`
      }),
      makeCheck({
        key: "sales_script",
        label: "需要时生成可销售话术",
        passed: strategy.mode !== "sales_script" || hasSalesScript,
        score: strategy.mode !== "sales_script" ? 0.8 : hasSalesScript ? 1 : 0,
        detail: strategy.mode === "sales_script" ? (hasSalesScript ? "已检测到客户话术块。" : "策略要求话术，但回答中未检测到客户话术块。") : "当前策略不强制话术块。"
      })
    ];

    return sectionResult(checks, checks.every((check) => check.passed) ? "商业激活链路成立。" : "商业激活链路仍需补充 CTA、话术或策略对齐证据。");
  }

  generateFullChainReport(input: V5V6FullChainInput): V5V6FullChainReport {
    const knowledgeGeneration = this.validateKnowledgeGeneration(input.v5);
    const ragUsage = this.validateRAGUsage(input.rag);
    const userIntentFlow = this.validateUserIntentFlow(input.commercial);
    const commercialActivation = this.validateCommercialActivation(input.commercial);
    const overallScore = average([
      knowledgeGeneration.score,
      ragUsage.score,
      userIntentFlow.score,
      commercialActivation.score
    ]);
    const closedLoopValid = [knowledgeGeneration, ragUsage, userIntentFlow, commercialActivation].every((section) => section.passed);

    return {
      version: "v5-v6-validation-v1",
      generatedAt: new Date().toISOString(),
      closedLoopValid,
      overallScore,
      knowledgeGeneration,
      ragUsage,
      userIntentFlow,
      commercialActivation,
      recommendations: this.buildRecommendations({ knowledgeGeneration, ragUsage, userIntentFlow, commercialActivation })
    };
  }

  private classifyCommercialStage(query: string, response: string, strategy: CommercialOutputStrategy): UserCommercialStage {
    const text = `${query} ${response}`;

    if (/下单|购买|付款|成交|签约|报价|价格能不能|怎么买|我要/.test(text)) {
      return "buyer";
    }

    if (/价格|效果|风险|担心|犹豫|对比|异议|值不值|适合我吗/.test(text) || strategy.objective === "convert") {
      return "hot";
    }

    if (/了解|咨询|方案|建议|怎么做|能不能|适不适合/.test(text)) {
      return "warm";
    }

    return "cold";
  }

  private buildRecommendations(input: {
    knowledgeGeneration: ValidationSectionResult;
    ragUsage: ValidationSectionResult;
    userIntentFlow: ValidationSectionResult;
    commercialActivation: ValidationSectionResult;
  }) {
    return uniqueStrings([
      input.knowledgeGeneration.passed ? null : "先补齐 V5 草稿中的 SOP、FAQ、scenario、commercial metadata 和 outputStrategy。",
      input.ragUsage.passed ? null : "在用户端检索 trace 中保留 retrievedChunks、citations、combinedKnowledgeCount 和 V5 metadata。",
      input.userIntentFlow.passed ? null : "在用户端回答生成时记录 userQuery、strategy、scenario 和 cold/warm/hot/buyer 阶段。",
      input.commercialActivation.passed ? null : "回答中需要保留明确 CTA、可复制客户话术或下一步行动路径。"
    ], 8);
  }
}

export function validateV5V6FullChain(input: V5V6FullChainInput): V5V6FullChainReport {
  return new V5V6ValidationEngine().generateFullChainReport(input);
}