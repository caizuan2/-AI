"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart3,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  FileText,
  GitBranch,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  finalizeUserAnswer,
  formatFinalizedAnswerForDisplay
} from "@/lib/ai-chat/response-finalizer";
import {
  sanitizeVisibleSources,
  sanitizeVisibleText
} from "@/lib/ai-chat/visible-output-sanitizer";
import { rememberConversionFeedbackEvent } from "@/app/(user)/chat-ui/chat-ui-state";
import {
  BUSINESS_OUTPUT_ENFORCER_VERSION
} from "@/lib/business-output-enforcer";
import { validateOutputSchema } from "@/lib/business-schema-guard";
import { formatIntentConfidence, getCommercialIntentLabel, type UserIntent } from "@/lib/user-intent-detector";
import {
  buildRichAnswerSections,
  sanitizeDisplayText,
  type RichAnswerSection
} from "@/app/(user)/chat-ui/lib/answer-format";
import { getUserRawAnswerText } from "@/app/(user)/chat-ui/lib/answer-display";
import type {
  ChatMessageView,
  FinalizedAnswerView,
  ChatSource,
  ProviderStatus,
  RagConfidence
} from "@/app/(user)/chat-ui/types";
import type { ConversionFeedbackEvent } from "@/lib/agent/conversion-feedback-loop";

interface ChatMessageRendererProps {
  message: ChatMessageView;
  streaming?: boolean;
}

const confidenceLabels: Record<RagConfidence, string> = {
  high: "高可信度",
  medium: "中可信度",
  low: "低可信度"
};

const providerStatusLabels: Record<ProviderStatus, string> = {
  ok: "模型响应正常",
  provider_not_configured: "模型暂未配置",
  no_relevant_knowledge: "小董AI大脑🧠暂无明确资料",
  error: "模型响应异常"
};

const isDevDebug =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_AI_DEBUG === "true";

function formatScore(score: number) {
  if (!Number.isFinite(score)) {
    return "";
  }

  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

function formatNullableScore(score: unknown) {
  return typeof score === "number" && Number.isFinite(score) ? formatScore(score) : "待确认";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();

  return isLostHistoryAnswerText(text) ? "" : text;
}

const LOST_HISTORY_ANSWER_PATTERNS = [
  "这条历史消息没有保留可直接展示的最终正文",
  "这条历史消息没有保留可展示的最终正文",
  "历史消息没有保留可直接展示的最终正文"
];

function isLostHistoryAnswerText(value: string) {
  const normalized = value.replace(/\s+/g, "");

  return LOST_HISTORY_ANSWER_PATTERNS.some((pattern) =>
    normalized.includes(pattern.replace(/\s+/g, ""))
  );
}

function getNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(getString).filter(Boolean) : [];
}

function getNestedString(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }

    current = (current as Record<string, unknown>)[key];
  }

  return getString(current);
}

function getRecoverableAnswerText(message: ChatMessageView) {
  const messageRecord = message as unknown as Record<string, unknown>;
  const metadata = getRecord(message.metadata);
  const directFinalizedAnswer = getRecord(message.finalized_answer);
  const metadataFinalizedAnswer = getRecord(metadata.finalizedAnswer);

  return [
    message.content,
    messageRecord.rawContent,
    messageRecord.rawText,
    metadata.rawContent,
    metadata.rawText,
    metadata.rawAnswer,
    metadata.rawAnswerBeforeFinalizer,
    metadata.rawCustomerAnswerBeforeFinalizer,
    metadata.answer,
    getNestedString(metadata, ["runtimeOutput", "replyMarkdown"]),
    getNestedString(metadata, ["runtimeOutput", "answer"]),
    getNestedString(metadata, ["runtimeOutput", "rawContent"]),
    getNestedString(metadata, ["runtimeOutput", "rawText"]),
    getNestedString(metadata, ["aiRuntime", "finalOutput", "replyMarkdown"]),
    getNestedString(metadata, ["aiRuntime", "finalOutput", "answer"]),
    getNestedString(metadata, ["aiRuntime", "finalOutput", "content"]),
    directFinalizedAnswer.rawContent,
    directFinalizedAnswer.rawText,
    directFinalizedAnswer.text,
    directFinalizedAnswer.answer,
    directFinalizedAnswer.content,
    directFinalizedAnswer.freeformAnswer,
    metadataFinalizedAnswer.rawContent,
    metadataFinalizedAnswer.rawText,
    metadataFinalizedAnswer.text,
    metadataFinalizedAnswer.answer,
    metadataFinalizedAnswer.content,
    metadataFinalizedAnswer.freeformAnswer,
  ].map((value) => sanitizeDisplayText(getString(value))).find(Boolean) ?? "";
}

function getRecoverableCustomerAnswerText(message: ChatMessageView) {
  const metadata = getRecord(message.metadata);
  const directFinalizedAnswer = getRecord(message.finalized_answer);
  const metadataFinalizedAnswer = getRecord(metadata.finalizedAnswer);

  return [
    message.customer_answer,
    metadata.customerAnswer,
    metadata.customerCopy,
    directFinalizedAnswer.customerReply,
    metadataFinalizedAnswer.customerReply,
  ].map((value) => sanitizeDisplayText(getString(value))).find(Boolean) ?? "";
}

function getRagVisualization(message: ChatMessageView) {
  return getRecord(message.metadata?.ragVisualization);
}

function toChatSource(source: Record<string, unknown>, index: number): ChatSource {
    const score = getNumber(source.score ?? source.relevance_score);

    return {
      chunk_id: getString(source.chunk_id) || getString(source.source) || `rag-source-${index + 1}`,
      file_id: getString(source.file_id) || null,
      item_id: getString(source.item_id) || null,
      knowledgeBaseId: getString(source.knowledgeBaseId) || null,
      agentId: getString(source.agentId) || null,
      tenantId: getString(source.tenantId) || null,
      namespace: getString(source.namespace) || null,
      sourceApp: getString(source.sourceApp) || null,
      includeShared: source.includeShared === true,
      includePublished: source.includePublished === true,
      title: getString(source.title) || getString(source.source) || getString(source.knowledgeBaseId) || `小董AI大脑资料 ${index + 1}`,
      score: score ?? 0,
      relevance_score: getNumber(source.relevance_score),
      chunk_rank: getNumber(source.chunk_rank),
      matchedBy: getString(source.matchedBy) || null,
      content_preview: getString(source.content_preview) || null
    };
}

function getRagVisualizationSources(message: ChatMessageView): ChatSource[] {
  return getRecordArray(getRagVisualization(message).sources).map(toChatSource);
}

function getMetadataRagSources(message: ChatMessageView): ChatSource[] {
  const metadataRag = getRecord(message.metadata?.rag);
  const metadataSources = getRecordArray(metadataRag.sources);

  return metadataSources.map(toChatSource);
}

function getFinalizedAnswerSources(message: ChatMessageView): ChatSource[] {
  const directFinalizedAnswer = getRecord(message.finalized_answer);
  const metadataFinalizedAnswer = getRecord(message.metadata?.finalizedAnswer);
  const directSources = getRecordArray(directFinalizedAnswer.sources);
  const metadataSources = getRecordArray(metadataFinalizedAnswer.sources);

  return [...directSources, ...metadataSources].map(toChatSource);
}

function dedupeSources(sources: ChatSource[]) {
  const seen = new Set<string>();
  const deduped: ChatSource[] = [];

  for (const source of sources) {
    const key = [
      source.item_id,
      source.chunk_id,
      source.file_id,
      source.knowledgeBaseId,
      source.agentId,
      source.title
    ].filter(Boolean).join("|") || `${source.title}-${deduped.length}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}

function getUsefulEvidenceSummary(message: ChatMessageView, finalizedAnswer: FinalizedAnswerView | null) {
  const metadataFinalizedAnswer = getRecord(message.metadata?.finalizedAnswer);
  const evidenceSummary = getString(finalizedAnswer?.evidenceSummary)
    || getString(message.finalized_answer?.evidenceSummary)
    || getString(metadataFinalizedAnswer.evidenceSummary);

  if (!evidenceSummary || /暂无|未命中|没有明确|无明确/.test(evidenceSummary)) {
    return "";
  }

  return evidenceSummary;
}

function getRagHitState(message: ChatMessageView, finalizedAnswer: FinalizedAnswerView | null) {
  const ragVisualization = getRagVisualization(message);
  const metadataRag = getRecord(message.metadata?.rag);
  const sources = dedupeSources([
    ...(message.sources ?? []),
    ...getFinalizedAnswerSources(message),
    ...getRagVisualizationSources(message),
    ...getMetadataRagSources(message)
  ]);
  const evidenceSummary = getUsefulEvidenceSummary(message, finalizedAnswer);
  const hitCountCandidates = [
    getNumber(ragVisualization.hitCount),
    getNumber(metadataRag.hitCount),
    getNumber(metadataRag.hit_count),
    sources.length
  ].filter((value): value is number => typeof value === "number" && value > 0);
  const hitCount = hitCountCandidates.length > 0 ? Math.max(...hitCountCandidates) : 0;
  const hasRagHit = hitCount > 0 || sources.length > 0 || Boolean(evidenceSummary);
  const sourceApps = Array.from(new Set(sources.map((source) => getString(source.sourceApp)).filter(Boolean)));
  const sourceTitles = Array.from(new Set(sources.map((source) => getString(source.title)).filter(Boolean))).slice(0, 3);

  return {
    hasRagHit,
    hitCount,
    sources,
    evidenceSummary,
    sourceApps,
    sourceTitles
  };
}

function toConversionFeedbackAction(value: unknown): ConversionFeedbackEvent["action_clicked"] {
  const action = getString(value);

  if (action === "show_case") {
    return "send_case";
  }

  if (action === "offer_incentive") {
    return "recommend_plan";
  }

  if (action === "answer_knowledge") {
    return "educate";
  }

  if ([
    "educate",
    "build_trust",
    "send_case",
    "compare_options",
    "recommend_plan",
    "close_deal",
    "handoff_service",
    "retain_user",
    "follow_up_question"
  ].includes(action)) {
    return action as ConversionFeedbackEvent["action_clicked"];
  }

  return null;
}

function getPriorityConversionSignal(value: unknown) {
  const priority = getString(value);

  if (priority === "urgent") {
    return 0.82;
  }

  if (priority === "high") {
    return 0.68;
  }

  if (priority === "medium") {
    return 0.52;
  }

  return 0.38;
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getFinalizedAnswer(message: ChatMessageView): FinalizedAnswerView | null {
  if (message.finalized_answer) {
    const rawAnswer = getRecoverableAnswerText(message);
    const sanitizedAnswer = {
      ...message.finalized_answer,
      title: getString(message.finalized_answer.title),
      problemUnderstanding: getString(message.finalized_answer.problemUnderstanding),
      keyConclusion: getString(message.finalized_answer.keyConclusion),
      customerReply: getString(message.finalized_answer.customerReply),
      nextAction: getString(message.finalized_answer.nextAction),
      evidenceSummary: getString(message.finalized_answer.evidenceSummary),
      rawContent: rawAnswer || getString(message.finalized_answer.rawContent),
      rawText: rawAnswer || getString(message.finalized_answer.rawText)
    } as FinalizedAnswerView;

    if (!rawAnswer) {
      return sanitizedAnswer;
    }

    const hasStructuredAnswer = Boolean(
      sanitizedAnswer.title ||
      sanitizedAnswer.problemUnderstanding ||
      sanitizedAnswer.keyConclusion ||
      sanitizedAnswer.customerReply ||
      sanitizedAnswer.nextAction
    );

    if (!hasStructuredAnswer) {
      return finalizeUserAnswer({
        rawAnswer,
        customerAnswer: sanitizeDisplayText(message.customer_answer ?? ""),
        sources: (message.sources ?? []).map((source) => ({
          title: source.title,
          score: source.score
        }))
      });
    }

    return sanitizedAnswer;
  }

  const metadataFinalizedAnswer = getRecord(message.metadata?.finalizedAnswer);
  const title = getString(metadataFinalizedAnswer.title);
  const problemUnderstanding = getString(metadataFinalizedAnswer.problemUnderstanding);
  const keyConclusion = getString(metadataFinalizedAnswer.keyConclusion);
  const customerReply = getString(metadataFinalizedAnswer.customerReply);
  const nextAction = getString(metadataFinalizedAnswer.nextAction);

  if (!title && !problemUnderstanding && !keyConclusion && !customerReply && !nextAction) {
    const rawAnswer = getRecoverableAnswerText(message);
    const rawCustomerAnswer = getRecoverableCustomerAnswerText(message);

    if (!rawAnswer && !rawCustomerAnswer) {
      return null;
    }

    return finalizeUserAnswer({
      rawAnswer,
      customerAnswer: rawCustomerAnswer,
      sources: (message.sources ?? []).map((source) => ({
        title: source.title,
        score: source.score
      }))
    });
  }

  return {
    title: title || "处理建议",
    problemUnderstanding,
    keyConclusion,
    suggestedSteps: getStringArray(metadataFinalizedAnswer.suggestedSteps),
    customerReply,
    nextAction,
    evidenceSummary: getString(metadataFinalizedAnswer.evidenceSummary),
    confidenceLabel: getString(metadataFinalizedAnswer.confidenceLabel) as FinalizedAnswerView["confidenceLabel"] || undefined
  };
}

function getFinalAnswer(finalizedAnswer: FinalizedAnswerView | null) {
  return finalizedAnswer ? sanitizeVisibleText(formatFinalizedAnswerForDisplay(finalizedAnswer)) : "";
}

function hasDisplayContent(message: ChatMessageView) {
  return Boolean(getFinalizedAnswer(message));
}

function markdownComponents() {
  return {
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="pl-1">{children}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-slate-950">{children}</strong>
    ),
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-800">{children}</code>
    )
  };
}

function ThinkingPanel({
  message,
  streaming
}: {
  message: ChatMessageView;
  streaming: boolean;
}) {
  const statusLabel = message.provider_status ? providerStatusLabels[message.provider_status] : "等待模型返回";
  const sourceCount = message.sources?.length ?? 0;
  const confidenceLabel = message.confidence ? confidenceLabels[message.confidence] : "待确认";
  const streamThinking = typeof message.metadata?.streamThinking === "string"
    ? message.metadata.streamThinking
    : "";

  return (
    <details className="group rounded-2xl border border-slate-200 bg-slate-50/80 p-4" open={streaming}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />
          处理过程
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 grid gap-2 text-xs leading-6 text-slate-600 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="block font-semibold text-slate-900">大脑检索</span>
          {streamThinking || (sourceCount > 0 ? `已命中 ${sourceCount} 条引用` : streaming ? "检索中" : "暂无可展示引用")}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="block font-semibold text-slate-900">可信度</span>
          {confidenceLabel}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="block font-semibold text-slate-900">模型状态</span>
          {statusLabel}
        </div>
      </div>
    </details>
  );
}

function ScoreBar({ value }: { value: unknown }) {
  const score = getNumber(value);
  const width = score === null ? 0 : Math.round(Math.max(0, Math.min(1, score)) * 100);

  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-blue-500 transition-all"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function RagVisualizationPanel({ message }: { message: ChatMessageView }) {
  const ragVisualization = getRecord(message.metadata?.ragVisualization);
  const chunks = getRecordArray(ragVisualization.chunks);
  const scores = getRecordArray(ragVisualization.scores);
  const sources = getRecordArray(ragVisualization.sources);
  const query = getString(ragVisualization.query);
  const status = getString(ragVisualization.status);
  const relevanceScore = getNumber(ragVisualization.relevance_score);
  const hitCount = getNumber(ragVisualization.hitCount);
  const topK = getNumber(ragVisualization.topK);

  if (!query && chunks.length === 0 && sources.length === 0 && !message.pending) {
    return null;
  }

  return (
    <details className="group rounded-2xl border border-blue-100 bg-blue-50/60 p-4" open={message.pending}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
          RAG / 小董AI大脑🧠调用
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="font-semibold text-slate-950">检索问题：</span>
          {query || "等待检索问题"}
          <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
            {status === "done" ? "已完成" : "检索中"}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="block font-semibold text-slate-950">hitCount</span>
            {hitCount ?? chunks.length}
          </div>
          <div className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="block font-semibold text-slate-950">topK</span>
            {topK ?? "待确认"}
          </div>
          <div className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="block font-semibold text-slate-950">relevance</span>
            {formatNullableScore(relevanceScore)}
            <ScoreBar value={relevanceScore} />
          </div>
        </div>

        {chunks.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-blue-700">命中 chunk</p>
            {chunks.map((chunk, index) => {
              const rank = getNumber(chunk.chunk_rank) ?? index + 1;
              const score = getNumber(scores.find((item) => getNumber(item.chunk_rank) === rank)?.score);

              return (
                <div
                  key={`${getString(chunk.chunk_id) || rank}-${index}`}
                  className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-950">#{rank} {getString(chunk.content) || "大脑片段"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{formatNullableScore(score)}</span>
                  </div>
                  <ScoreBar value={score} />
                  {getString(chunk.chunk_id) ? (
                    <div className="mt-1 truncate text-slate-400">chunk: {getString(chunk.chunk_id)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {sources.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sources.map((source, index) => (
              <span
                key={`${getString(source.source)}-${index}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700"
                title={getString(source.source)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{getString(source.title) || getString(source.source) || "source"}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function MetricCard({
  label,
  value
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs text-slate-600">
      <span className="block font-semibold text-slate-950">{label}</span>
      {formatNullableScore(value)}
      <ScoreBar value={value} />
    </div>
  );
}

function ModelRoutingPanel({ message }: { message: ChatMessageView }) {
  const modelVisualization = getRecord(message.metadata?.modelVisualization);
  const selectedModel = getString(modelVisualization.selected_model);
  const reason = getString(modelVisualization.reason);
  const fallbackChain = getStringArray(modelVisualization.fallback_chain);
  const metrics = getRecord(modelVisualization.metrics);

  if (!selectedModel && !reason && fallbackChain.length === 0 && !message.pending) {
    return null;
  }

  return (
    <details className="group rounded-2xl border border-violet-100 bg-violet-50/60 p-4" open={message.pending}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
        <span className="inline-flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-violet-600" aria-hidden="true" />
          模型路由
          {selectedModel ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{selectedModel}</span>
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="font-semibold text-slate-950">选择原因：</span>
          {reason || "等待模型路由决策"}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <MetricCard label="cost_score" value={metrics.cost_score} />
          <MetricCard label="latency_score" value={metrics.latency_score} />
          <MetricCard label="success_rate" value={metrics.success_rate} />
        </div>

        {fallbackChain.length > 0 ? (
          <div className="rounded-xl border border-violet-100 bg-white px-3 py-2">
            <p className="mb-2 text-xs font-semibold text-slate-950">fallback 路径</p>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-violet-700">
              {fallbackChain.map((model, index) => (
                <React.Fragment key={`${model}-${index}`}>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1">{model}</span>
                  {index < fallbackChain.length - 1 ? <span className="text-violet-300">→</span> : null}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function CommercialExecutionPanel({ message }: { message: ChatMessageView }) {
  const commercialExecution = getRecord(message.metadata?.commercialExecution);
  const intent = getString(commercialExecution.intent) as UserIntent;
  const stageLabel = getString(commercialExecution.stageLabel) || (intent ? getCommercialIntentLabel(intent) : "");
  const mode = getString(commercialExecution.mode);
  const commercialGoal = getString(commercialExecution.commercialGoal);
  const responseStrategy = getString(commercialExecution.responseStrategy);
  const suggestedNextStep = getString(commercialExecution.suggestedNextStep);
  const recommendedMoves = getStringArray(commercialExecution.recommendedMoves);
  const avoid = getStringArray(commercialExecution.avoid);
  const confidence = getNumber(commercialExecution.confidence);

  if (!intent) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI Knowledge OS V6
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-950">{stageLabel}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {commercialGoal || "先判断用户商业阶段，再把回答组织成可执行动作。"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
          {mode ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{mode}</span>
          ) : null}
          {confidence !== null ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">
              置信度 {formatIntentConfidence(confidence)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">回答策略</span>
          {responseStrategy || "基于小董AI大脑🧠回答，并转成下一步可执行建议。"}
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">建议下一步</span>
          {suggestedNextStep || "根据用户补充的场景继续细化。"}
        </div>
      </div>

      {recommendedMoves.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-emerald-700">推荐执行动作</p>
          <div className="flex flex-wrap gap-2">
            {recommendedMoves.map((move) => (
              <span
                key={move}
                className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700"
              >
                {move}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {avoid.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
          <span className="font-semibold">风险边界：</span>
          {avoid.slice(0, 3).join(" / ")}
        </div>
      ) : null}
    </section>
  );
}

function CopyTextPill({
  text,
  label,
  feedbackEvent
}: {
  text: string;
  label: string;
  feedbackEvent?: Partial<ConversionFeedbackEvent>;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    if (!text.trim() || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(text);
    if (feedbackEvent) {
      rememberConversionFeedbackEvent(feedbackEvent);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-white px-2.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-50"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "已复制" : label}
    </button>
  );
}

function BusinessExecutionPanel({ message }: { message: ChatMessageView }) {
  const businessExecution = getRecord(message.metadata?.businessExecution);
  const version = getString(businessExecution.version);
  const intent = getString(businessExecution.intent) as ConversionFeedbackEvent["intent"] || "knowledge_user";
  const executionGoal = getString(businessExecution.executionGoal);
  const executionPath = getStringArray(businessExecution.executionPath);
  const primaryAction = getRecord(businessExecution.primaryAction);
  const secondaryActions = getRecordArray(businessExecution.secondaryActions);
  const closingScript = getString(businessExecution.closingScript);
  const nextBestQuestion = getString(businessExecution.nextBestQuestion);
  const humanHandoff = getRecord(businessExecution.humanHandoff);
  const guardrails = getStringArray(businessExecution.guardrails);
  const actionLabel = getString(primaryAction.label);
  const actionDescription = getString(primaryAction.description);
  const actionPriority = getString(primaryAction.priority);
  const copySuggestion = getString(primaryAction.copySuggestion);
  const primaryFeedbackAction = toConversionFeedbackAction(primaryAction.type);
  const handoffRequired = humanHandoff.required === true;
  const handoffReason = getString(humanHandoff.reason);

  if (version !== "ai-knowledge-os-v7") {
    return null;
  }

  return (
    <section className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI Knowledge OS V7
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-950">商业执行与自动成交建议</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {executionGoal || "把用户意图转成可执行动作，但不自动下单、不自动承诺。"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {actionPriority ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-700">
              优先级 {actionPriority}
            </span>
          ) : null}
          {handoffRequired ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              建议人工接入
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">主执行动作</span>
          <span className="font-semibold text-teal-700">{actionLabel || "大脑问答"}</span>
          {actionDescription ? <span className="ml-1">{actionDescription}</span> : null}
        </div>
        <div className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">下一步问题</span>
          {nextBestQuestion || "继续确认用户真实场景。"}
        </div>
      </div>

      {executionPath.length > 0 ? (
        <div className="mt-3 rounded-xl border border-teal-100 bg-white px-3 py-2">
          <p className="mb-2 text-xs font-semibold text-slate-950">成交路径</p>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-teal-700">
            {executionPath.map((step, index) => (
              <React.Fragment key={`${step}-${index}`}>
                <span className="rounded-full bg-teal-50 px-2.5 py-1">{step}</span>
                {index < executionPath.length - 1 ? <span className="text-teal-300">→</span> : null}
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : null}

      {copySuggestion ? (
        <div className="mt-3 rounded-xl border border-teal-100 bg-white px-3 py-3 text-xs leading-6 text-slate-700">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-950">可复制成交话术</span>
            <CopyTextPill
              text={copySuggestion}
              label="复制话术"
              feedbackEvent={{
                intent,
                action_clicked: primaryFeedbackAction,
                conversion_signal: getPriorityConversionSignal(actionPriority)
              }}
            />
          </div>
          {copySuggestion}
        </div>
      ) : null}

      {secondaryActions.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {secondaryActions.map((action, index) => {
            const label = getString(action.label);
            const description = getString(action.description);
            const suggestion = getString(action.copySuggestion);
            const secondaryFeedbackAction = toConversionFeedbackAction(action.type);
            const secondaryPriority = getString(action.priority);

            return (
              <div key={`${label}-${index}`} className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">{label || `执行动作 ${index + 1}`}</span>
                  {suggestion ? (
                    <CopyTextPill
                      text={suggestion}
                      label="复制"
                      feedbackEvent={{
                        intent,
                        action_clicked: secondaryFeedbackAction,
                        conversion_signal: getPriorityConversionSignal(secondaryPriority)
                      }}
                    />
                  ) : null}
                </div>
                {description ? <p className="mt-1">{description}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {closingScript || handoffReason ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {closingScript ? (
            <div className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
              <span className="block font-semibold text-slate-950">执行提醒</span>
              {closingScript}
            </div>
          ) : null}
          {handoffReason ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
              <span className="block font-semibold">人工转接判断</span>
              {handoffReason}
            </div>
          ) : null}
        </div>
      ) : null}

      {guardrails.length > 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="font-semibold text-slate-950">安全边界：</span>
          {guardrails.join(" / ")}
        </div>
      ) : null}
    </section>
  );
}

function AutoSalesAgentPanel({ message }: { message: ChatMessageView }) {
  const businessExecution = getRecord(message.metadata?.businessExecution);
  const agentFromBusiness = getRecord(businessExecution.autoSalesAgent);
  const agentFromMetadata = getRecord(message.metadata?.autoSalesAgent);
  const autoSalesAgent = getString(agentFromBusiness.version) === "ai-knowledge-os-v8"
    || getString(agentFromBusiness.version) === "ai-knowledge-os-v8.1"
    || getString(agentFromBusiness.version) === "ai-knowledge-os-v9"
    ? agentFromBusiness
    : agentFromMetadata;
  const version = getString(autoSalesAgent.version);
  const sourceIntent = getString(autoSalesAgent.sourceIntent) as ConversionFeedbackEvent["intent"] || "knowledge_user";
  const state = getString(autoSalesAgent.state);
  const loopStage = getString(autoSalesAgent.loopStage);
  const opportunityScore = getNumber(autoSalesAgent.opportunityScore);
  const dealProbability = getNumber(autoSalesAgent.dealProbability);
  const primaryObjective = getString(autoSalesAgent.primaryObjective);
  const followUpStrategy = getString(autoSalesAgent.followUpStrategy);
  const nextBestAction = getString(autoSalesAgent.nextBestAction);
  const followUpQuestion = getString(autoSalesAgent.followUpQuestion);
  const optimizedTalkingPoints = getStringArray(autoSalesAgent.optimizedTalkingPoints);
  const learningSignals = getStringArray(autoSalesAgent.learningSignals);
  const behaviorTriggers = getStringArray(autoSalesAgent.behaviorTriggers);
  const conversionFeedbackLoop = getRecord(autoSalesAgent.conversionFeedbackLoop);
  const orderedActions = getRecordArray(conversionFeedbackLoop.orderedActions);
  const strategyAdjustments = getStringArray(conversionFeedbackLoop.strategyAdjustments);
  const feedback = getRecord(conversionFeedbackLoop.feedback);
  const conversionSignal = getNumber(feedback.conversion_signal);
  const clickedAction = getString(feedback.action_clicked);
  const globalLearning = getRecord(autoSalesAgent.globalLearning);
  const globalVersion = getString(globalLearning.version);
  const behaviorSummary = getRecord(globalLearning.behaviorSummary);
  const optimization = getRecord(globalLearning.optimization);
  const systemEvolution = getRecord(globalLearning.systemEvolution);
  const globalActionWeights = getRecordArray(optimization.actionWeights);
  const promptStrategyWeights = getRecord(optimization.promptStrategyWeights);
  const strategyChanges = getStringArray(systemEvolution.strategyChanges);
  const evolutionScore = getNumber(systemEvolution.score) ?? getNumber(autoSalesAgent.systemEvolutionScore);
  const globalOptimizationStatus = getString(systemEvolution.globalOptimizationStatus) || getString(optimization.optimizationStatus);
  const versionChange = getString(systemEvolution.versionChange);
  const systemWideOptimizationSignal = getString(systemEvolution.systemWideOptimizationSignal) || getString(autoSalesAgent.systemWideOptimizationSignal);
  const guardrails = getStringArray(autoSalesAgent.guardrails);

  if (
    version !== "ai-knowledge-os-v8" &&
    version !== "ai-knowledge-os-v8.1" &&
    version !== "ai-knowledge-os-v9" &&
    globalVersion !== "ai-knowledge-os-v9"
  ) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            {version === "ai-knowledge-os-v9" || globalVersion === "ai-knowledge-os-v9"
              ? "AI Knowledge OS V9"
              : version === "ai-knowledge-os-v8.1"
                ? "AI Knowledge OS V8.1"
                : "AI Knowledge OS V8"}
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-950">自动成交 Agent 闭环</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {primaryObjective || "识别成交机会，生成跟进策略和下一步动作；只提供建议，不自动执行交易。"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
          {state ? <span className="rounded-full bg-white px-2.5 py-1 text-indigo-700">{state}</span> : null}
          {loopStage ? <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700">{loopStage}</span> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="block font-semibold text-slate-950">成交机会评分</span>
          {formatNullableScore(opportunityScore)}
          <ScoreBar value={opportunityScore} />
        </div>
        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="block font-semibold text-slate-950">成交概率判断</span>
          {formatNullableScore(dealProbability)}
          <ScoreBar value={dealProbability} />
        </div>
      </div>

      {version === "ai-knowledge-os-v8.1" || version === "ai-knowledge-os-v9" || globalVersion === "ai-knowledge-os-v9" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="block font-semibold text-slate-950">反馈成交信号</span>
            {formatNullableScore(conversionSignal)}
            <ScoreBar value={conversionSignal} />
          </div>
          <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
            <span className="block font-semibold text-slate-950">上次点击动作</span>
            {clickedAction || "暂无行为反馈"}
          </div>
        </div>
      ) : null}

      {globalVersion === "ai-knowledge-os-v9" ? (
        <div className="mt-3 rounded-xl border border-fuchsia-100 bg-white px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-fuchsia-700">V9 系统进化层</p>
              <p className="mt-1 text-xs leading-6 text-slate-600">
                {versionChange || "V8.1 -> V9"}，状态：{globalOptimizationStatus || "observe"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-fuchsia-50 px-2.5 py-1 text-xs font-semibold text-fuchsia-700">
              进化分 {formatNullableScore(evolutionScore)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-3 py-2 text-xs text-slate-600">
              <span className="block font-semibold text-slate-950">行为信号</span>
              {getNumber(behaviorSummary.totalSignals) ?? 0}
            </div>
            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-3 py-2 text-xs text-slate-600">
              <span className="block font-semibold text-slate-950">平均成交信号</span>
              {formatNullableScore(getNumber(behaviorSummary.averageConversionSignal))}
              <ScoreBar value={getNumber(behaviorSummary.averageConversionSignal)} />
            </div>
            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-3 py-2 text-xs text-slate-600">
              <span className="block font-semibold text-slate-950">流失风险</span>
              {formatNullableScore(getNumber(behaviorSummary.lossRisk))}
              <ScoreBar value={getNumber(behaviorSummary.lossRisk)} />
            </div>
          </div>
          {systemWideOptimizationSignal ? (
            <div className="mt-3 rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-3 py-2 text-xs leading-6 text-slate-600">
              <span className="block font-semibold text-slate-950">全局优化路径</span>
              {systemWideOptimizationSignal}
            </div>
          ) : null}
          {strategyChanges.length > 0 ? (
            <div className="mt-3 rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-3 py-2 text-xs leading-6 text-slate-600">
              <span className="block font-semibold text-slate-950">策略变化</span>
              {strategyChanges.slice(0, 4).join(" / ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">自动跟进策略</span>
          {followUpStrategy || "继续根据用户反馈调整话术。"}
        </div>
        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">下一步动作</span>
          {nextBestAction || "确认用户需求并给出低摩擦下一步。"}
        </div>
      </div>

      {optimizedTalkingPoints.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-indigo-700">话术优化点</p>
          <div className="flex flex-wrap gap-2">
            {optimizedTalkingPoints.map((point) => (
              <span
                key={point}
                className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700"
              >
                {point}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {followUpQuestion ? (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white px-3 py-3 text-xs leading-6 text-slate-700">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-950">必须追问</span>
            <CopyTextPill
              text={followUpQuestion}
              label="复制追问"
              feedbackEvent={{
                intent: sourceIntent,
                action_clicked: "follow_up_question",
                follow_up_question: true,
                conversion_signal: dealProbability ?? opportunityScore ?? conversionSignal ?? 0.45
              }}
            />
          </div>
          {followUpQuestion}
        </div>
      ) : null}

      {orderedActions.length > 0 ? (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white px-3 py-2">
          <p className="mb-2 text-xs font-semibold text-slate-950">
            {globalVersion === "ai-knowledge-os-v9" ? "V9 全局 ACTION 权重排序" : "V8.1 行动权重排序"}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-700">
            {(globalVersion === "ai-knowledge-os-v9" && globalActionWeights.length > 0 ? globalActionWeights : orderedActions).slice(0, 5).map((action, index) => {
              const label = getString(action.action) || `ACTION_${index + 1}`;
              const weight = getNumber(action.weight);
              const delta = getNumber(action.delta);

              return (
                <React.Fragment key={`${label}-${index}`}>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1">
                    {label} {weight !== null ? formatNullableScore(weight) : ""}
                    {delta !== null ? ` ${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%` : ""}
                  </span>
                  {index < Math.min(globalVersion === "ai-knowledge-os-v9" && globalActionWeights.length > 0 ? globalActionWeights.length : orderedActions.length, 5) - 1 ? <span className="text-indigo-300">→</span> : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : null}

      {globalVersion === "ai-knowledge-os-v9" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <MetricCard label="prompt.education" value={promptStrategyWeights.education} />
          <MetricCard label="prompt.proof" value={promptStrategyWeights.proof} />
          <MetricCard label="prompt.handoff" value={promptStrategyWeights.handoff} />
        </div>
      ) : null}

      {strategyAdjustments.length > 0 ? (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="block font-semibold text-slate-950">下一轮策略调整</span>
          {strategyAdjustments.slice(0, 4).join(" / ")}
        </div>
      ) : null}

      {(learningSignals.length > 0 || behaviorTriggers.length > 0) ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {learningSignals.length > 0 ? (
            <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
              <span className="block font-semibold text-slate-950">闭环学习信号</span>
              {learningSignals.slice(0, 4).join(" / ")}
            </div>
          ) : null}
          {behaviorTriggers.length > 0 ? (
            <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
              <span className="block font-semibold text-slate-950">行为触发器</span>
              {behaviorTriggers.slice(0, 4).join(" / ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {guardrails.length > 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600">
          <span className="font-semibold text-slate-950">安全边界：</span>
          {guardrails.join(" / ")}
        </div>
      ) : null}
    </section>
  );
}

function BusinessOutputEnforcerPanel({
  content,
  enabled,
  streaming,
  schemaGuard
}: {
  content: string;
  enabled: boolean;
  streaming: boolean;
  schemaGuard: Record<string, unknown>;
}) {
  if (!enabled && !content.includes("【用户意图】")) {
    return null;
  }

  const compliance = validateOutputSchema(content);
  const repaired = schemaGuard.repaired === true;
  const rewriteApplied = schemaGuard.rewriteApplied === true;
  const enforcementMode = getString(schemaGuard.enforcementMode);
  const emptySections = getStringArray(schemaGuard.emptySections);
  const requiredOrderValid = schemaGuard.requiredOrderValid !== false && compliance.requiredOrderValid;
  const serverValidated = schemaGuard.valid === true || repaired;

  return (
    <section className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-cyan-700">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            AI Knowledge OS V7.4
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-950">商业输出硬约束引擎</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {streaming
              ? "正在按固定商业结构生成回答，输出前会执行硬约束校验。"
              : rewriteApplied
                ? `模型原始回答不合格，后端已在输出前强制重写。${enforcementMode ? `模式：${enforcementMode}` : ""}`
                : serverValidated || compliance.valid
                  ? "回答已通过输出前硬约束校验。"
                  : "回答缺少部分强制输出小节，需要继续检查硬约束链路。"}
          </p>
        </div>
        <span className={cn(
          "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
          serverValidated || compliance.valid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
        )}>
          {BUSINESS_OUTPUT_ENFORCER_VERSION}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {compliance.presentSections.map((section) => (
          <span
            key={section}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100 bg-white px-2.5 py-1 text-xs font-semibold text-cyan-700"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {section}
          </span>
        ))}
        {compliance.missingSections.map((section) => (
          <span
            key={section}
            className="rounded-full border border-amber-100 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700"
          >
            待输出：{section}
          </span>
        ))}
        {emptySections.map((section) => (
          <span
            key={`empty-${section}`}
            className="rounded-full border border-amber-100 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700"
          >
            空段：{section}
          </span>
        ))}
        {!requiredOrderValid ? (
          <span className="rounded-full border border-rose-100 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
            顺序异常
          </span>
        ) : null}
      </div>
    </section>
  );
}

function AnswerSectionDetails({
  section,
  defaultOpen
}: {
  section: RichAnswerSection;
  defaultOpen: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-950">{section.title}</span>
          <span className="mt-1 block text-xs text-slate-500">{section.subtitle}</span>
        </span>
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 border-t border-slate-100 pt-3 text-sm leading-7 text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
          {section.content}
        </ReactMarkdown>
      </div>
    </details>
  );
}

function SourceCard({ source }: { source: ChatSource }) {
  const [visibleSource] = sanitizeVisibleSources([source]);

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold text-slate-900">{visibleSource?.title ?? "小董AI大脑资料"}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-slate-500">
        <span className="min-w-0 truncate">小董AI大脑🧠相关资料</span>
        <span className="shrink-0 font-semibold text-blue-700">{formatScore(source.score)}</span>
      </div>
    </div>
  );
}

function RagSources({
  sources,
  confidence
}: {
  sources?: ChatSource[] | null;
  confidence?: RagConfidence | null;
}) {
  if ((!sources || sources.length === 0) && !confidence) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
          <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
          引用来源
        </span>
        {confidence ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {confidenceLabels[confidence]}
          </span>
        ) : null}
      </div>
      {sources && sources.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.map((source) => (
            <SourceCard key={`${source.chunk_id}-${source.file_id ?? "knowledge"}`} source={source} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">当前回答没有可展示的引用片段。</p>
      )}
    </section>
  );
}

function RawAssistantAnswer({
  text,
  streaming
}: {
  text: string;
  streaming: boolean;
}) {
  if (!text && streaming) {
    return (
      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-blue-900">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
          正在生成回复
        </div>
      </section>
    );
  }

  if (!text) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        这条历史消息没有保留可直接展示的最终正文。
      </section>
    );
  }

  return (
    <article className="space-y-3 text-[15px] leading-7 text-slate-900">
      <div className="flex justify-end">
        <CopyTextPill text={text} label="复制答案" />
      </div>
      <div className="prose prose-slate max-w-none text-[15px] leading-7 prose-p:my-2 prose-ol:my-2 prose-ul:my-2 prose-li:my-1 prose-pre:rounded-2xl prose-pre:bg-slate-100 prose-pre:text-slate-900">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
          {text}
        </ReactMarkdown>
      </div>
    </article>
  );
}

export function ChatMessageRenderer({ message, streaming = false }: ChatMessageRendererProps) {
  const isStreaming = streaming || Boolean(message.pending);
  const rawAnswer = getUserRawAnswerText(message);
  const finalizedAnswer = isDevDebug ? getFinalizedAnswer(message) : message.finalized_answer ?? null;
  const finalAnswer = isDevDebug ? getFinalAnswer(finalizedAnswer) : "";
  const businessSchemaGuard = getRecord(
    message.metadata?.businessSchemaGuard ?? message.metadata?.business_schema_guard
  );
  const sections = isDevDebug && hasDisplayContent(message)
    ? buildRichAnswerSections({
      answer: finalAnswer,
      customerAnswer: finalizedAnswer?.customerReply ?? "",
      providerStatus: message.provider_status
    })
    : [];
  const messageTime = formatMessageTime(message.created_at);
  const ragHitState = isDevDebug ? getRagHitState(message, finalizedAnswer) : null;

  return (
    <div className="w-full max-w-[min(820px,92vw)] rounded-3xl rounded-bl-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-sm">
      <header className="flex items-center justify-between gap-3 px-1 pb-2">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ClipboardList className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            小董AI
          </div>
        </div>
        {messageTime ? <p className="shrink-0 text-xs text-slate-400">{messageTime}</p> : null}
      </header>

      <div className="mt-1 space-y-4">
        <RawAssistantAnswer text={rawAnswer} streaming={isStreaming} />

        {isDevDebug ? (
          <details className="group rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-amber-950">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />
                开发调试信息
              </span>
              <ChevronDown className="h-4 w-4 text-amber-500 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 space-y-3">
              {sections.length > 0 ? (
                <details className="group rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      回答分析
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className={cn("mt-3 grid gap-3", sections.length > 2 ? "sm:grid-cols-2" : "")}>
                    {sections.map((section) => (
                      <AnswerSectionDetails
                        key={section.id}
                        section={section}
                        defaultOpen={false}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
              <ThinkingPanel message={message} streaming={isStreaming} />
              <RagVisualizationPanel message={message} />
              <RagSources sources={ragHitState?.sources ?? []} confidence={message.confidence} />
              <CommercialExecutionPanel message={message} />
              <BusinessExecutionPanel message={message} />
              <AutoSalesAgentPanel message={message} />
              <BusinessOutputEnforcerPanel
                content={finalAnswer}
                enabled={Boolean(finalAnswer)}
                streaming={isStreaming}
                schemaGuard={businessSchemaGuard}
              />
              <ModelRoutingPanel message={message} />
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
