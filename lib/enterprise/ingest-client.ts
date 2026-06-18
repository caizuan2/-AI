"use client";

import {
  createMockKnowledgeDraft,
  type IngestChatAgent,
  type IngestKnowledgeDraft,
  type IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";
import {
  ADMIN_INGEST_SYNC_TARGET,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-app-config";
import {
  getGptModelSelectionByDisplayName,
  type GptTier,
  type GptVersion
} from "@/lib/enterprise/gpt-model-options";

export const ingestSyncTarget = ADMIN_INGEST_SYNC_TARGET;

export type IngestSyncTarget = typeof ingestSyncTarget[number];
export type IngestPlatform = AdminIngestPlatform;
export type IngestLicenseStatus = "未检查" | "已激活" | "未激活" | "本地预览";

export interface IngestConnectionStatus {
  enterpriseSpace: "本地预览" | "已连接";
  knowledgeBase: string;
  licenseStatus: IngestLicenseStatus;
  checkedAt?: string;
}

export interface IngestUploadState {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  isImage?: boolean;
  previewUrl?: string;
  status: "selected" | "pending_parse" | "ready_to_send" | "parsing" | "attached" | "parsed" | "failed";
  source: "admin_ingest";
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  createdAt: string;
}

export interface IngestVoiceState {
  isVoiceSupported: boolean;
  isRecording: boolean;
  transcript: string;
  error: string;
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
}

export interface IngestNotification {
  id: string;
  type: "success" | "file" | "license" | "tenant" | "sync" | "fallback" | "info";
  title: string;
  description: string;
  read: boolean;
  source: "admin_ingest";
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
  createdAt: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
    code?: string;
  };
}

interface GptIngestResponse {
  provider: "openai";
  model: string;
  modelDisplayName?: string;
  modelMode: "highest" | "fixed";
  replyMarkdown: string;
  structured: {
    title?: string;
    category?: string;
    summary?: string;
    tags?: string[];
    question?: string;
    answer?: string;
    confidence?: number;
    saveSuggestion?: boolean;
    followUpQuestions?: string[];
  };
  sync?: {
    platform?: IngestPlatform;
    syncTarget?: IngestSyncTarget[];
  };
  fallbackUsed?: boolean;
}

interface UrlIngestPreviewResponse {
  stage: "preview";
  job: {
    id: string;
  };
  draft: {
    jobId: string;
    title: string;
    category: string;
    tags: string[];
    summary: string;
    qa_pairs: Array<{ q: string; a: string }>;
    confidence: number;
    should_save: boolean;
    providerUsed: string;
    model: string;
    fallbackUsed: boolean;
    saveStatus: "pending" | "saved" | "rejected";
    sourceUrl: string;
  };
  records?: AdminTrainingRecordResponse[];
  preview: boolean;
  message: string;
  replyMarkdown?: string;
}

interface AdminTrainingRecordResponse {
  id?: string;
  jobId?: string;
  input?: string;
  ai_output?: unknown;
  resultTitle?: string;
  category?: string;
  status?: "pending" | "saved" | "rejected";
  sourceType?: string;
  timestamp?: string;
  hits?: number;
}

export function getFriendlyIngestError(response: Response, payload: ApiEnvelope<unknown> | null) {
  const raw = [
    payload?.message,
    payload?.error?.message,
    payload?.error?.code
  ].filter(Boolean).join(" ").toLowerCase();

  if (response.status === 401 || raw.includes("unauthorized") || raw.includes("login") || raw.includes("登录")) {
    return "当前为本地预览模式，登录后将同步企业知识库。";
  }

  if (raw.includes("license") || raw.includes("卡密") || raw.includes("授权") || raw.includes("expired")) {
    return raw.includes("expired")
      ? "当前账号卡密已过期，请完成续费授权后使用 AI 投喂。"
      : "当前账号未激活卡密，请先完成授权后使用 AI 投喂。";
  }

  if (raw.includes("tenant") || raw.includes("租户") || raw.includes("企业")) {
    return "企业空间未加载，已切换为本地预览模式。";
  }

  if (raw.includes("openai api key") || raw.includes("missing_ai_api_key") || raw.includes("未配置 openai")) {
    return "未配置 OpenAI API Key，已使用本地预览模型。";
  }

  if (raw.includes("timeout") || raw.includes("超时")) {
    return "GPT 请求超时，请稍后重试。";
  }

  if (raw.includes("gpt") || raw.includes("openai")) {
    return "GPT 接口暂不可用，已使用本地预览结果。";
  }

  return "接口暂不可用，已使用本地预览结果。";
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(getFriendlyIngestError(response, payload));
  }

  return payload.data;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readQaPairs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const q = readString(record.q);
      const a = readString(record.a);

      return q && a ? { q, a } : null;
    })
    .filter((item): item is { q: string; a: string } => Boolean(item));
}

function toRecordTime(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeDraftFromUnknown(data: unknown, input: string, agent: IngestChatAgent, status: IngestKnowledgeDraft["saveStatus"]): IngestKnowledgeDraft {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const directQuestion = readString(record.question);
  const directAnswer = readString(record.answer);
  const qaPairs = readQaPairs(record.qa_pairs ?? record.structured_qa ?? record.qaPairs);
  const title = readString(record.title) || `${agent.role.replace("知识库", "") || agent.name}投喂知识`;
  const category = readString(record.category) || agent.role || "默认知识库";
  const summary = readString(record.summary) || readString(record.content) || input.slice(0, 120);
  const confidence = readNumber(record.confidence ?? record.trainingScore, 82);
  const firstPair = qaPairs[0] ?? (directQuestion || directAnswer ? {
    q: directQuestion || `关于“${title}”，应该如何处理？`,
    a: directAnswer || summary
  } : {
    q: `关于“${title}”，应该如何处理？`,
    a: summary || `建议按当前 ${agent.name} 的知识口径处理，并保留来源记录。`
  });
  const saveSuggestion = typeof record.saveSuggestion === "boolean" ? record.saveSuggestion : confidence >= 80;

  return {
    id: readString(record.id) || `draft-${Date.now()}`,
    jobId: readString(record.jobId) || null,
    title,
    category,
    tags: readTags(record.tags).length > 0 ? readTags(record.tags) : [category.replace("知识库", ""), "AI投喂"].filter(Boolean),
    summary,
    qaPairs: qaPairs.length > 0 ? qaPairs : [firstPair],
    standardQuestion: firstPair.q,
    standardAnswer: firstPair.a,
    trainingScore: Math.min(100, Math.max(1, Math.round(confidence))),
    recommendation: saveSuggestion ? "建议入库" : "需要复核",
    saveStatus: status,
    sourceType: "chat",
    providerUsed: readString(record.providerUsed) || "core-engine",
    model: readString(record.model) || "knowledge-core",
    modelMode: record.modelMode === "fixed" ? "fixed" : record.modelMode === "highest" ? "highest" : undefined,
    replyMarkdown: readString(record.replyMarkdown) || undefined,
    fallbackUsed: Boolean(record.fallbackUsed)
  };
}

export function createTrainingRecord(input: {
  originalInput: string;
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  status?: IngestTrainingRecord["saveStatus"];
  sourceType?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}): IngestTrainingRecord {
  const now = new Date().toISOString();

  return {
    id: `record-${input.draft.jobId ?? input.draft.id ?? Date.now()}`,
    jobId: input.draft.jobId,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    agentId: input.agent.id,
    agentName: input.agent.name,
    input: input.originalInput,
    resultTitle: input.draft.title,
    saveStatus: input.status ?? input.draft.saveStatus,
    category: input.draft.category,
    time: toRecordTime(now),
    hits: 0,
    sourceType: input.sourceType ?? "admin_ingest",
    source: "admin_ingest",
    platform: input.platform ?? "web",
    syncTarget: [...ingestSyncTarget],
    createdAt: now,
    updatedAt: now,
    aiOutput: input.draft
  };
}

export function normalizeTrainingRecord(record: AdminTrainingRecordResponse, agent: IngestChatAgent, platform: IngestPlatform = "web"): IngestTrainingRecord {
  const status = record.status === "saved" ? "已保存" : record.status === "rejected" ? "已拒绝" : "待确认";
  const fallbackDraft = normalizeDraftFromUnknown(record.ai_output, record.input ?? record.resultTitle ?? "", agent, status);

  return {
    id: record.id ?? `record-${Date.now()}`,
    jobId: record.jobId ?? fallbackDraft.jobId,
    tenantId: null,
    userId: null,
    agentId: agent.id,
    agentName: agent.name,
    input: record.input ?? "",
    resultTitle: record.resultTitle ?? fallbackDraft.title,
    saveStatus: status,
    category: record.category ?? fallbackDraft.category,
    time: toRecordTime(record.timestamp),
    hits: record.hits ?? 0,
    sourceType: record.sourceType ?? "admin_ingest",
    source: "admin_ingest",
    platform,
    syncTarget: [...ingestSyncTarget],
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
    aiOutput: fallbackDraft
  };
}

function gptResponseToDraft(data: GptIngestResponse, originalInput: string, agent: IngestChatAgent): IngestKnowledgeDraft {
  return normalizeDraftFromUnknown({
    ...data.structured,
    id: `gpt-${Date.now()}`,
    jobId: `gpt-${Date.now()}`,
    providerUsed: data.provider,
    model: data.modelDisplayName || data.model,
    modelMode: data.modelMode,
    replyMarkdown: data.replyMarkdown,
    fallbackUsed: false
  }, originalInput, agent, "待确认");
}

export async function sendCoreIngest(input: {
  text: string;
  agent: IngestChatAgent;
  category: string;
  model: string;
  gptTier?: GptTier;
  gptTierLabel?: string;
  gptVersion?: GptVersion;
  selectedModelLabel?: string;
  tenantId?: string | null;
  userId?: string | null;
  attachments?: IngestUploadState[];
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const gptSelection = getGptModelSelectionByDisplayName(input.selectedModelLabel ?? input.model);
  const selectedModelLabel = input.selectedModelLabel ?? gptSelection.displayName;

  try {
    const response = await fetch("/api/admin/kb/ingest/gpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: input.text,
        source: "admin_ingest",
        agentId: input.agent.id,
        agentName: input.agent.name,
        category: input.category,
        model: input.model,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        attachments: input.attachments ?? [],
        platform,
        syncTarget: [...ingestSyncTarget],
        modelProvider: "openai",
        modelMode: "highest",
        preferredModel: gptSelection.apiModel,
        gptTier: input.gptTier ?? gptSelection.tier,
        gptTierLabel: input.gptTierLabel ?? gptSelection.tierLabel,
        gptVersion: input.gptVersion ?? gptSelection.version,
        selectedModelLabel,
        modelDisplayName: selectedModelLabel,
        autoSave: false
      })
    });
    const data = await readApiData<GptIngestResponse>(response);
    const draft = gptResponseToDraft(data, input.text, input.agent);

    draft.jobId = draft.jobId ?? `gpt-${Date.now()}`;
    draft.fallbackUsed = draft.fallbackUsed ?? false;

    const records = [createTrainingRecord({
      originalInput: input.text,
      draft,
      agent: input.agent,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform
    })];

    return {
      draft,
      records,
      preview: false,
      provider: draft.providerUsed ?? "openai",
      model: data.modelDisplayName ?? selectedModelLabel,
      modelMode: draft.modelMode,
      replyMarkdown: draft.replyMarkdown,
      saveSuggestion: draft.recommendation === "建议入库",
      message: `GPT 已生成结构化知识：${draft.title}`
    };
  } catch {
    const draft = createMockKnowledgeDraft(input.text, input.agent);
    draft.jobId = `preview-${Date.now()}`;
    draft.fallbackUsed = true;
    draft.providerUsed = "local-fallback";
    draft.model = selectedModelLabel;

    return {
      draft,
      records: [createTrainingRecord({
        originalInput: input.text,
        draft,
        agent: input.agent,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: true,
      provider: "local-fallback",
      model: selectedModelLabel,
      modelMode: "highest" as const,
      replyMarkdown: [
        "## 本地预览结构化结果",
        "",
        "当前结果由本地预览链路生成，真实 GPT 接入后可重新生成。",
        "",
        "### 本地预览整理",
        `- 标题：${draft.title}`,
        `- 分类：${draft.category}`,
        `- 入库建议：${draft.recommendation}`,
        "",
        draft.summary ?? draft.standardAnswer
      ].join("\n"),
      saveSuggestion: draft.recommendation === "建议入库",
      message: "GPT 接口暂不可用，已使用本地预览结果。"
    };
  }
}

export async function saveKnowledgeDraft(input: {
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  originalInput: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const structured = {
    title: input.draft.title,
    category: input.draft.category,
    tags: input.draft.tags,
    summary: input.draft.summary ?? input.draft.standardAnswer,
    qa_pairs: input.draft.qaPairs?.length
      ? input.draft.qaPairs
      : [{ q: input.draft.standardQuestion, a: input.draft.standardAnswer }],
    confidence: input.draft.trainingScore,
    should_save: input.draft.recommendation !== "暂不入库",
    providerUsed: input.draft.providerUsed ?? "unknown",
    model: input.draft.model ?? "unknown",
    fallbackUsed: input.draft.fallbackUsed ?? false
  };

  if (!input.draft.jobId) {
    const savedDraft = { ...input.draft, saveStatus: "已保存" as const };

    return {
      draft: savedDraft,
      records: [createTrainingRecord({
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        status: "已保存",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: true,
      message: "当前为本地预览结果，已在前端标记为已保存。"
    };
  }

  try {
    const response = await fetch("/api/admin/kb/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: input.draft.jobId,
        originalInput: input.originalInput,
        structured,
        knowledge: structured,
        agentId: input.agent.id,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        source: "admin_ingest",
        platform,
        syncTarget: [...ingestSyncTarget]
      })
    });
    const data = await readApiData<{ records?: AdminTrainingRecordResponse[] }>(response);
    const savedDraft = { ...input.draft, saveStatus: "已保存" as const };

    return {
      draft: savedDraft,
      records: data.records?.map((record) => normalizeTrainingRecord(record, input.agent, platform)) ?? [createTrainingRecord({
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        status: "已保存",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: false,
      message: "已保存知识入库，训练记录已更新。"
    };
  } catch (error) {
    const savedDraft = { ...input.draft, saveStatus: "已保存" as const, fallbackUsed: true };

    return {
      draft: savedDraft,
      records: [createTrainingRecord({
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        status: "已保存",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: true,
      message: error instanceof Error ? error.message : "保存接口暂不可用，已在本地预览中标记为已保存。"
    };
  }
}

export function createUploadState(file: File, context: {
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  platform?: IngestPlatform;
} = {}): IngestUploadState {
  const isImage = file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
  const previewUrl = isImage && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : undefined;

  return {
    id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileName: file.name,
    fileType: file.type || file.name.split(".").pop() || "unknown",
    fileSize: file.size,
    isImage,
    previewUrl,
    status: "ready_to_send",
    source: "admin_ingest",
    platform: context.platform ?? "web",
    syncTarget: [...ingestSyncTarget],
    tenantId: context.tenantId ?? null,
    userId: context.userId ?? null,
    agentId: context.agentId ?? null,
    createdAt: new Date().toISOString()
  };
}

export async function sendUrlIngestPreview(input: {
  url: string;
  agent: IngestChatAgent;
  category: string;
  model: string;
  gptTier?: GptTier;
  gptTierLabel?: string;
  gptVersion?: GptVersion;
  selectedModelLabel?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const gptSelection = getGptModelSelectionByDisplayName(input.selectedModelLabel ?? input.model);
  const selectedModelLabel = input.selectedModelLabel ?? gptSelection.displayName;
  const response = await fetch("/api/admin/kb/ingest/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: input.url,
      sourceUrl: input.url,
      source: "admin_ingest",
      sourceType: "url",
      agentId: input.agent.id,
      agentName: input.agent.name,
      category: input.category,
      model: input.model,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform,
      syncTarget: [...ingestSyncTarget],
      modelProvider: "openai",
      modelMode: "highest",
      preferredModel: gptSelection.apiModel,
      gptTier: input.gptTier ?? gptSelection.tier,
      gptTierLabel: input.gptTierLabel ?? gptSelection.tierLabel,
      gptVersion: input.gptVersion ?? gptSelection.version,
      selectedModelLabel,
      modelDisplayName: selectedModelLabel,
      autoSave: false
    })
  });
  const data = await readApiData<UrlIngestPreviewResponse>(response);
  const draft = normalizeDraftFromUnknown({
    ...data.draft,
    jobId: data.job.id,
    providerUsed: data.draft.providerUsed,
    model: data.draft.model || selectedModelLabel,
    fallbackUsed: data.draft.fallbackUsed,
    replyMarkdown: data.replyMarkdown
  }, input.url, input.agent, data.draft.saveStatus === "saved" ? "已保存" : "待确认");

  draft.jobId = data.job.id;
  draft.sourceType = "url";

  const records = data.records?.length
    ? data.records.map((record) => normalizeTrainingRecord(record, input.agent, platform))
    : [createTrainingRecord({
      originalInput: `网址投喂：${input.url}`,
      draft,
      agent: input.agent,
      sourceType: "url",
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform
    })];

  return {
    draft,
    records,
    preview: true,
    provider: draft.providerUsed ?? "url-preview",
    model: draft.model ?? selectedModelLabel,
    modelMode: "highest" as const,
    replyMarkdown: data.replyMarkdown,
    saveSuggestion: draft.recommendation === "建议入库",
    message: data.message
  };
}

export async function checkLicenseStatus(): Promise<IngestConnectionStatus> {
  try {
    const response = await fetch("/api/license/status", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ApiEnvelope<{
      active?: boolean;
      status?: string;
      license?: {
        status?: string;
      } | null;
    }> | null;

    if (!response.ok || !payload?.ok) {
      return {
        enterpriseSpace: "本地预览",
        knowledgeBase: "默认知识库",
        licenseStatus: response.status === 401 ? "本地预览" : "未激活",
        checkedAt: new Date().toISOString()
      };
    }

    const rawStatus = [
      payload.data?.status,
      payload.data?.license?.status
    ].filter(Boolean).join(" ").toLowerCase();
    const isActive = payload.data?.active === true || rawStatus.includes("active") || rawStatus.includes("已激活");

    return {
      enterpriseSpace: "已连接",
      knowledgeBase: "默认知识库",
      licenseStatus: isActive ? "已激活" : "未激活",
      checkedAt: new Date().toISOString()
    };
  } catch {
    return {
      enterpriseSpace: "本地预览",
      knowledgeBase: "默认知识库",
      licenseStatus: "本地预览",
      checkedAt: new Date().toISOString()
    };
  }
}
