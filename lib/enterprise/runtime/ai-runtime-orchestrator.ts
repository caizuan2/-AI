import {
  CommercialDecisionEngine,
  type CommercialDecisionContext,
  type CommercialIntentAnalysis,
  type CommercialOutputStrategy,
  type CommercialScenarioDetection
} from "@/lib/enterprise/commercial-decision-engine";
import {
  evaluateFeedbackForRuntime,
  type KnowledgeFeedbackInput,
  type RuntimeFeedbackOptimization
} from "@/lib/enterprise/feedback/feedback-collector";
import { KnowledgeFactoryV5, type KnowledgeFactoryV5Result } from "@/lib/enterprise/knowledge-factory-v5";
import { validateV5V6FullChain, type V5V6FullChainReport } from "@/lib/enterprise/v5-v6-validation-engine";

export type AIRuntimeSource = "admin_ingest" | "user_chat" | "runtime";

export interface AIRuntimeRecentMessage {
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  provider?: string | null;
}

export interface AIRuntimeTrainingRecord {
  input?: string;
  resultTitle?: string;
  category?: string;
  saveStatus?: string;
}

export interface AIRuntimeKnowledgeDraftLike {
  id?: string;
  title?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  standardQuestion?: string;
  standardAnswer?: string;
  scenarios?: string[];
  sourceMaterials?: string[];
  knowledgeFactory?: unknown;
  knowledgeFactoryV3?: unknown;
  knowledgeFactoryV4?: unknown;
  knowledgeFactoryV5?: KnowledgeFactoryV5Result;
}

export interface AIRuntimeUserContext {
  runtimeEntry?: "admin_ingest_client" | "user_chat_service" | "user_chat_ui" | "server_route" | "legacy_compat";
  source?: AIRuntimeSource;
  userId?: string | null;
  tenantId?: string | null;
  platform?: string;
  category?: string;
  agentName?: string;
  agentRole?: string;
  model?: string;
  provider?: string;
  recentMessages?: AIRuntimeRecentMessage[];
  previousKnowledgeDrafts?: AIRuntimeKnowledgeDraftLike[];
  recentTrainingRecords?: AIRuntimeTrainingRecord[];
  behaviorFeedback?: KnowledgeFeedbackInput | KnowledgeFeedbackInput[];
}

export interface AIRuntimeRetrievedChunk {
  id: string;
  title: string;
  content: string;
  source: "v5_draft" | "training_record" | "conversation_memory" | "runtime_signal";
  score: number;
  metadata: Record<string, unknown>;
}

export interface AIRuntimeRetrievalResult {
  retrievalOnly: true;
  ragTriggered: boolean;
  query: string;
  queryFocus: string[];
  recommendedTopK: number;
  retrievedChunks: AIRuntimeRetrievedChunk[];
  usedKnowledgeUnitIds: string[];
  combinedKnowledgeCount: number;
  usedV5Knowledge: boolean;
  evidenceSummary: string;
}

export interface AIRuntimeCommercialDecision {
  intent: CommercialIntentAnalysis;
  scenario: CommercialScenarioDetection;
  outputStrategy: CommercialOutputStrategy;
  decisionReason: string;
  ctaText: string;
}

export interface AIRuntimeFinalOutput {
  replyMarkdown: string;
  strategyMode: CommercialOutputStrategy["mode"];
  recommendedSections: string[];
  ctaText: string;
  retrievalSummary: string;
}

export interface AIRuntimeFeedbackLoop {
  collected: true;
  persisted: false;
  signals: {
    ragUsed: boolean;
    v5KnowledgeUsed: boolean;
    commercialStrategySelected: boolean;
    ctaGenerated: boolean;
    customerScriptLikely: boolean;
    engagementScore: number;
    conversionScore: number;
    behaviorOptimizationTriggered: boolean;
  };
  optimization: RuntimeFeedbackOptimization;
  nextActions: string[];
}

export interface AIRuntimeResult {
  version: "ai-runtime-orchestrator-v1";
  requestId: string;
  source: AIRuntimeSource;
  query: string;
  retrieval: AIRuntimeRetrievalResult;
  decision: AIRuntimeCommercialDecision;
  strategy: CommercialOutputStrategy;
  v5RuntimeSignal: KnowledgeFactoryV5Result;
  finalOutput: AIRuntimeFinalOutput;
  feedback: AIRuntimeFeedbackLoop;
  validation: V5V6FullChainReport;
  diagnostics: {
    runtimeConnected: true;
    retrievalMode: "retrieval_only";
    v5Connected: boolean;
    v6Connected: boolean;
    feedbackLoopConnected: boolean;
  };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12) {
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

function tokenize(text: string) {
  return uniqueStrings(text.match(/[\u3400-\u9fffa-zA-Z0-9]{2,}/g) ?? [], 24);
}

function scoreText(queryTokens: string[], text: string) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const source = clean(text).toLowerCase();
  const hits = queryTokens.filter((token) => source.includes(token.toLowerCase())).length;

  return Number(Math.min(1, hits / Math.max(3, queryTokens.length)).toFixed(2));
}

function makeRequestId() {
  return `runtime-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function clip(text: string, limit = 420) {
  const normalized = clean(text);

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

export class AIRuntimeOrchestrator {
  private readonly decisionEngine = new CommercialDecisionEngine();
  private readonly factoryV5 = new KnowledgeFactoryV5();

  handleRequest(query: string, userContext: AIRuntimeUserContext = {}): AIRuntimeResult {
    const entryContext = this.enforceSingleEntry(userContext);
    const normalizedQuery = clean(query);
    const source = entryContext.source ?? "runtime";
    const retrieval = this.routeToV5Knowledge(normalizedQuery, entryContext);
    const decision = this.routeToV6Decision({ query: normalizedQuery, userContext: entryContext, retrieval });
    const strategy = this.selectResponseStrategy({ query: normalizedQuery, userContext: entryContext, retrieval, decision });
    const v5RuntimeSignal = this.factoryV5.ingest({
      text: [normalizedQuery, retrieval.evidenceSummary, decision.decisionReason].filter(Boolean).join("\n\n"),
      title: normalizedQuery.slice(0, 36) || "runtime-query",
      category: entryContext.category,
      tags: uniqueStrings([entryContext.agentName, entryContext.agentRole, ...decision.outputStrategy.ragDecision.queryFocus], 10)
    });
    const finalOutput = this.assembleResponse({
      query: normalizedQuery,
      retrieval,
      decision,
      strategy
    });
    const feedback = this.collectFeedbackLoop({
      query: normalizedQuery,
      responseText: finalOutput.replyMarkdown,
      retrieval,
      decision,
      behaviorFeedback: entryContext.behaviorFeedback
    });
    const primaryDraft = entryContext.previousKnowledgeDrafts?.find((draft) => draft.knowledgeFactoryV5) ?? entryContext.previousKnowledgeDrafts?.[0] ?? null;
    const validation = validateV5V6FullChain({
      v5: {
        draft: primaryDraft as never,
        knowledgeFactory: primaryDraft?.knowledgeFactory as never,
        knowledgeFactoryV3: primaryDraft?.knowledgeFactoryV3 as never,
        knowledgeFactoryV4: primaryDraft?.knowledgeFactoryV4 as never,
        knowledgeFactoryV5: primaryDraft?.knowledgeFactoryV5 ?? v5RuntimeSignal
      },
      rag: {
        query: normalizedQuery,
        ragTriggered: retrieval.ragTriggered,
        retrievedChunks: retrieval.retrievedChunks,
        usedKnowledgeUnitIds: retrieval.usedKnowledgeUnitIds,
        combinedKnowledgeCount: retrieval.combinedKnowledgeCount,
        responseText: finalOutput.replyMarkdown
      },
      commercial: {
        userQuery: normalizedQuery,
        responseText: finalOutput.replyMarkdown,
        outputStrategy: strategy,
        ctaText: decision.ctaText,
        conversionEvents: feedback.nextActions,
        userTypeHint: strategy.userType
      }
    });

    return {
      version: "ai-runtime-orchestrator-v1",
      requestId: makeRequestId(),
      source,
      query: normalizedQuery,
      retrieval,
      decision,
      strategy,
      v5RuntimeSignal,
      finalOutput,
      feedback,
      validation,
      diagnostics: {
        runtimeConnected: true,
        retrievalMode: "retrieval_only",
        v5Connected: Boolean(v5RuntimeSignal.outputStrategy),
        v6Connected: Boolean(strategy.mode),
        feedbackLoopConnected: feedback.collected
      }
    };
  }

  handleUserQuery(query: string, userContext: AIRuntimeUserContext = {}): AIRuntimeResult {
    return this.handleRequest(query, {
      ...userContext,
      runtimeEntry: userContext.runtimeEntry ?? "legacy_compat"
    });
  }

  enforceSingleEntry(context: AIRuntimeUserContext = {}): AIRuntimeUserContext {
    return {
      ...context,
      runtimeEntry: context.runtimeEntry ?? this.blockBypassRoutes(context)
    };
  }

  blockBypassRoutes(context: AIRuntimeUserContext = {}): AIRuntimeUserContext["runtimeEntry"] {
    if (context.source === "admin_ingest") {
      return "admin_ingest_client";
    }

    if (context.source === "user_chat") {
      return "user_chat_service";
    }

    return "server_route";
  }

  routeToV5Knowledge(query: string, context: AIRuntimeUserContext = {}): AIRuntimeRetrievalResult {
    return this.retrieveV5Knowledge(query, context);
  }

  routeToV6Decision(data: {
    query: string;
    userContext?: AIRuntimeUserContext;
    retrieval?: AIRuntimeRetrievalResult;
  }): AIRuntimeCommercialDecision {
    return this.applyV6CommercialDecision(data);
  }

  assembleResponse(payload: {
    query: string;
    baseResponse?: string;
    retrieval: AIRuntimeRetrievalResult;
    decision: AIRuntimeCommercialDecision;
    strategy: CommercialOutputStrategy;
  }): AIRuntimeFinalOutput {
    return this.generateFinalOutput(payload);
  }
  retrieveV5Knowledge(query: string, context: AIRuntimeUserContext = {}): AIRuntimeRetrievalResult {
    const queryTokens = tokenize(query);
    const chunks: AIRuntimeRetrievedChunk[] = [];

    for (const draft of context.previousKnowledgeDrafts ?? []) {
      const title = clean(draft.title) || clean(draft.standardQuestion) || "V5 知识草稿";
      const content = [draft.summary, draft.standardAnswer, ...(draft.scenarios ?? [])].filter(Boolean).join(" ");
      const score = Math.max(
        scoreText(queryTokens, `${title} ${content}`),
        draft.knowledgeFactoryV5 ? 0.58 : 0.36
      );

      chunks.push({
        id: draft.id ?? `draft-${chunks.length + 1}`,
        title,
        content: clip(content || title),
        source: "v5_draft",
        score,
        metadata: {
          category: draft.category ?? null,
          tags: draft.tags ?? [],
          hasKnowledgeFactoryV5: Boolean(draft.knowledgeFactoryV5),
          strategyMode: draft.knowledgeFactoryV5?.outputStrategy.mode ?? null,
          sourceMaterials: draft.sourceMaterials ?? []
        }
      });

      for (const asset of draft.knowledgeFactoryV5?.decisionAssets ?? []) {
        chunks.push({
          id: asset.id,
          title: asset.title,
          content: clip(asset.content),
          source: "v5_draft",
          score: Math.max(scoreText(queryTokens, `${asset.title} ${asset.content}`), asset.conversionScore),
          metadata: {
            knowledgeFactory: "KnowledgeFactoryV5",
            type: asset.type,
            commercialValue: asset.commercial.commercialValue,
            conversionScore: asset.conversionScore,
            decisionReason: asset.decisionReason,
            strategyMode: asset.outputStrategy.mode
          }
        });
      }
    }

    for (const record of context.recentTrainingRecords ?? []) {
      const content = [record.input, record.resultTitle, record.category, record.saveStatus].filter(Boolean).join(" ");
      const score = scoreText(queryTokens, content);

      if (score > 0 || chunks.length < 3) {
        chunks.push({
          id: `training-${chunks.length + 1}`,
          title: clean(record.resultTitle) || "历史训练记录",
          content: clip(content),
          source: "training_record",
          score: Math.max(score, 0.28),
          metadata: {
            category: record.category ?? null,
            saveStatus: record.saveStatus ?? null
          }
        });
      }
    }

    for (const message of context.recentMessages ?? []) {
      if (message.role !== "assistant") {
        continue;
      }

      const score = scoreText(queryTokens, message.content);

      if (score > 0.12) {
        chunks.push({
          id: `memory-${chunks.length + 1}`,
          title: "会话连续上下文",
          content: clip(message.content),
          source: "conversation_memory",
          score,
          metadata: {
            model: message.model ?? null,
            provider: message.provider ?? null
          }
        });
      }
    }

    const rankedChunks = chunks
      .filter((chunk) => chunk.content)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
    const queryFocus = uniqueStrings([
      ...queryTokens.slice(0, 6),
      context.category,
      context.agentName
    ], 8);
    const usedV5Knowledge = rankedChunks.some((chunk) => chunk.metadata.hasKnowledgeFactoryV5 === true || chunk.metadata.knowledgeFactory === "KnowledgeFactoryV5");

    return {
      retrievalOnly: true,
      ragTriggered: rankedChunks.length > 0,
      query,
      queryFocus,
      recommendedTopK: Math.max(3, Math.min(8, rankedChunks.length || 4)),
      retrievedChunks: rankedChunks,
      usedKnowledgeUnitIds: rankedChunks.map((chunk) => chunk.id),
      combinedKnowledgeCount: rankedChunks.length,
      usedV5Knowledge,
      evidenceSummary: rankedChunks.length > 0
        ? rankedChunks.map((chunk) => `${chunk.title}: ${chunk.content}`).join("\n")
        : "当前上下文未命中已有 V5 知识，Runtime 将使用商业决策引擎生成输出策略。"
    };
  }

  applyV6CommercialDecision(data: {
    query: string;
    userContext?: AIRuntimeUserContext;
    retrieval?: AIRuntimeRetrievalResult;
  }): AIRuntimeCommercialDecision {
    const context: CommercialDecisionContext = {
      query: data.query,
      content: data.retrieval?.evidenceSummary,
      category: data.userContext?.category,
      tags: data.retrieval?.queryFocus,
      user: [data.userContext?.agentName, data.userContext?.agentRole, data.userContext?.platform].filter(Boolean).join(" ")
    };
    const intent = this.decisionEngine.analyzeUserIntent(data.query);
    const scenario = this.decisionEngine.detectScenario(context);
    const outputStrategy = this.decisionEngine.decideOutputStrategy(context);

    return {
      intent,
      scenario,
      outputStrategy,
      ctaText: outputStrategy.callToAction,
      decisionReason: `Runtime 选择 ${outputStrategy.mode} 策略，因为用户意图为 ${intent.primaryIntent}，场景为 ${scenario.scenario}。`
    };
  }

  selectResponseStrategy(context: {
    query: string;
    userContext?: AIRuntimeUserContext;
    retrieval?: AIRuntimeRetrievalResult;
    decision?: AIRuntimeCommercialDecision;
  }): CommercialOutputStrategy {
    if (context.decision?.outputStrategy) {
      return context.decision.outputStrategy;
    }

    return this.decisionEngine.decideOutputStrategy({
      query: context.query,
      content: context.retrieval?.evidenceSummary,
      category: context.userContext?.category,
      tags: context.retrieval?.queryFocus,
      user: context.userContext?.agentRole
    });
  }

  generateFinalOutput(payload: {
    query: string;
    baseResponse?: string;
    retrieval: AIRuntimeRetrievalResult;
    decision: AIRuntimeCommercialDecision;
    strategy: CommercialOutputStrategy;
  }): AIRuntimeFinalOutput {
    const baseResponse = clean(payload.baseResponse);
    const replyMarkdown = baseResponse || [
      "## 核心结论",
      payload.decision.decisionReason,
      "",
      "## 关键依据",
      payload.retrieval.retrievedChunks.length > 0
        ? payload.retrieval.retrievedChunks.slice(0, 3).map((chunk, index) => `${index + 1}. **${chunk.title}**：${chunk.content}`).join("\n")
        : "当前没有命中明确知识片段，需要先用用户问题和业务场景生成临时回答策略。",
      "",
      "## 建议动作",
      `1. 按 **${payload.strategy.mode}** 模式组织回答。`,
      `2. 优先围绕：${payload.strategy.ragDecision.queryFocus.join(" / ") || "用户当前问题"}。`,
      `3. 下一步：${payload.strategy.callToAction}。`
    ].join("\n");

    return {
      replyMarkdown,
      strategyMode: payload.strategy.mode,
      recommendedSections: payload.strategy.sections,
      ctaText: payload.strategy.callToAction,
      retrievalSummary: payload.retrieval.evidenceSummary
    };
  }

  collectFeedbackLoop(response: {
    query: string;
    responseText: string;
    retrieval: AIRuntimeRetrievalResult;
    decision: AIRuntimeCommercialDecision;
    behaviorFeedback?: KnowledgeFeedbackInput | KnowledgeFeedbackInput[];
  }): AIRuntimeFeedbackLoop {
    const text = `${response.query} ${response.responseText}`;
    const ctaGenerated = /下一步|建议|可以先|请先|确认|跟进|行动/.test(text) || response.decision.ctaText.length > 0;
    const customerScriptLikely = /可复制给客户|客户话术|标准回复|您可以这样/.test(text)
      || response.decision.outputStrategy.mode === "sales_script";
    const optimization = evaluateFeedbackForRuntime(response.behaviorFeedback ?? {
      query: response.query,
      eventType: "click",
      clickCount: 0,
      copyCount: 0,
      dwellTime: 0,
      followUp: false,
      converted: false
    });

    return {
      collected: true,
      persisted: false,
      signals: {
        ragUsed: response.retrieval.ragTriggered,
        v5KnowledgeUsed: response.retrieval.usedV5Knowledge,
        commercialStrategySelected: Boolean(response.decision.outputStrategy.mode),
        ctaGenerated,
        customerScriptLikely,
        engagementScore: optimization.engagementScore,
        conversionScore: optimization.conversionScore,
        behaviorOptimizationTriggered: optimization.shouldOptimize
      },
      optimization,
      nextActions: uniqueStrings([
        response.retrieval.ragTriggered ? null : "补充可检索知识材料，提升用户端命中率。",
        response.retrieval.usedV5Knowledge ? null : "将本次高价值回答沉淀为 V5 knowledge unit。",
        ctaGenerated ? null : `补充行动引导：${response.decision.ctaText}`,
        customerScriptLikely ? "可继续生成客户可复制话术。" : null,
        ...optimization.strategyHints
      ], 6)
    };
  }
}
