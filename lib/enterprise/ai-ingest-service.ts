import "server-only";

import { structureKnowledge } from "@/lib/ai/knowledge-structurer";
import { ValidationError } from "@/lib/errors";
import { estimateTokenCount, logger, toSafeErrorLog } from "@/lib/logger";
import { getChatModelForProvider, getPrimaryAIProvider, hasUsableChatProvider } from "@/lib/server-config";

export type EnterpriseIngestSourceType = "chat" | "text" | "file" | "image" | "url";

export interface EnterpriseQAPair {
  q: string;
  a: string;
}

export interface EnterpriseStructuredKnowledge {
  title: string;
  category: string;
  tags: string[];
  summary: string;
  qa_pairs: EnterpriseQAPair[];
  confidence: number;
  should_save: boolean;
  reason: string;
  importance: number;
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
  providerUsed: string;
  model: string;
  fallbackUsed: boolean;
}

export interface AnalyzeEnterpriseIngestInput {
  input: string;
  sourceType: EnterpriseIngestSourceType;
  sourceUrl?: string | null;
  existingCategories?: string[];
  requestId?: string;
  userId?: string;
}

const MAX_ENTERPRISE_INGEST_CHARS = 100_000;

export function cleanEnterpriseIngestInput(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampScore(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
}

function toFivePointScore(confidence: number) {
  return Math.min(5, Math.max(1, Math.round(confidence / 20)));
}

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = tag.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result.slice(0, 8);
}

function inferCategory(input: string, sourceType: EnterpriseIngestSourceType) {
  if (/退款|售后|换货|保修|工单|发货|退货/.test(input)) {
    return "售后知识库";
  }

  if (/价格|话术|客户|异议|回复|咨询|客服/.test(input)) {
    return "客服话术库";
  }

  if (/产品|功能|版本|套餐|发票|权益|上线/.test(input)) {
    return "产品知识库";
  }

  if (/制度|审批|流程|规范|报销|考勤/.test(input)) {
    return "企业制度库";
  }

  if (sourceType === "url") {
    return "网址资料库";
  }

  if (sourceType === "file") {
    return "文档资料库";
  }

  if (sourceType === "image") {
    return "图片资料库";
  }

  return "未分类";
}

function inferTitle(input: string, category: string) {
  const firstLine = input.split("\n").find((line) => line.trim())?.trim() ?? "";

  if (/退款/.test(input)) {
    return "退款处理标准流程";
  }

  if (/价格|异议/.test(input)) {
    return "客户异议处理话术";
  }

  if (/发票/.test(input)) {
    return "电子发票申请规则";
  }

  if (/套餐|产品|功能|版本/.test(input)) {
    return "产品功能说明知识";
  }

  if (/制度|审批|流程/.test(input)) {
    return "企业制度执行规范";
  }

  if (firstLine) {
    return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine;
  }

  return `${category.replace("知识库", "") || "未分类"}投喂知识`;
}

function inferTags(input: string, category: string, sourceType: EnterpriseIngestSourceType) {
  const tags = new Set<string>();

  if (/退款|售后|换货|保修/.test(input)) {
    tags.add("售后");
    tags.add("退款");
  }

  if (/客户|客服|话术|异议/.test(input)) {
    tags.add("客服话术");
  }

  if (/产品|功能|套餐|版本|发票/.test(input)) {
    tags.add("产品");
  }

  if (/制度|审批|流程|规范/.test(input)) {
    tags.add("流程规范");
  }

  if (sourceType === "url") {
    tags.add("网址投喂");
  } else if (sourceType === "file") {
    tags.add("文档投喂");
  } else if (sourceType === "image") {
    tags.add("图片OCR");
  }

  tags.add(category.replace("知识库", "") || "未分类");

  return Array.from(tags).slice(0, 6);
}

function compactSummary(input: string) {
  if (input.length <= 220) {
    return input;
  }

  return `${input.slice(0, 220)}...`;
}

function buildQaPairs(input: string, title: string, summary: string): EnterpriseQAPair[] {
  return [
    {
      q: `关于“${title}”，一线人员应该如何处理？`,
      a: `建议先确认场景和前置条件，再按“核对信息 → 判断规则 → 给出标准回复 → 记录来源”的步骤处理。核心知识：${summary}`
    },
    {
      q: `“${title}”适合保存到知识库的原因是什么？`,
      a: `该内容包含可复用的业务规则或处理口径，后续可用于问答检索、客服回复、内部培训和知识复盘。`
    }
  ];
}

function buildLocalStructuredKnowledge(
  input: string,
  sourceType: EnterpriseIngestSourceType,
  reason: string
): EnterpriseStructuredKnowledge {
  const category = inferCategory(input, sourceType);
  const title = inferTitle(input, category);
  const summary = compactSummary(input);
  const confidence = clampScore(72 + Math.min(20, Math.round(input.length / 80)), 78);
  const score = toFivePointScore(confidence);

  return {
    title,
    category,
    tags: normalizeTags(inferTags(input, category, sourceType)),
    summary,
    qa_pairs: buildQaPairs(input, title, summary),
    confidence,
    should_save: input.length >= 12,
    reason,
    importance: Math.min(5, Math.max(2, score)),
    clarityScore: score,
    completenessScore: Math.max(2, score - 1),
    usefulnessScore: score,
    confidenceScore: score,
    providerUsed: "local-fallback",
    model: "local-enterprise-ingest-v1",
    fallbackUsed: true
  };
}

export async function analyzeEnterpriseIngest(
  input: AnalyzeEnterpriseIngestInput
): Promise<EnterpriseStructuredKnowledge> {
  const content = cleanEnterpriseIngestInput(input.input);

  if (!content) {
    throw new ValidationError("投喂内容不能为空。");
  }

  if (content.length > MAX_ENTERPRISE_INGEST_CHARS) {
    throw new ValidationError(`投喂内容过长，请控制在 ${MAX_ENTERPRISE_INGEST_CHARS} 字以内。`);
  }

  if (!hasUsableChatProvider()) {
    return buildLocalStructuredKnowledge(content, input.sourceType, "当前未配置可用 AI provider，已使用本地结构化 fallback。");
  }

  try {
    const result = await structureKnowledge({
      content,
      sourceType: input.sourceType,
      sourceId: input.sourceUrl ?? undefined,
      existingCategories: input.existingCategories,
      requestId: input.requestId,
      userId: input.userId
    });
    const knowledge = result.knowledge;
    const confidence = clampScore(knowledge.confidenceScore * 20, 80);

    return {
      title: knowledge.title,
      category: knowledge.category || "未分类",
      tags: normalizeTags(knowledge.tags),
      summary: knowledge.summary,
      qa_pairs: buildQaPairs(content, knowledge.title, knowledge.summary),
      confidence,
      should_save: knowledge.shouldSave,
      reason: knowledge.reason,
      importance: knowledge.importance,
      clarityScore: knowledge.clarityScore,
      completenessScore: knowledge.completenessScore,
      usefulnessScore: knowledge.usefulnessScore,
      confidenceScore: knowledge.confidenceScore,
      providerUsed: result.providerUsed,
      model: result.model,
      fallbackUsed: result.fallbackUsed
    };
  } catch (error) {
    logger.warn("enterprise_admin_ingest.ai_fallback", {
      requestId: input.requestId,
      sourceType: input.sourceType,
      tokenEstimate: estimateTokenCount(content),
      primaryProvider: getPrimaryAIProvider(),
      primaryModel: getChatModelForProvider(getPrimaryAIProvider()),
      error: toSafeErrorLog(error)
    });

    return buildLocalStructuredKnowledge(content, input.sourceType, "AI provider 调用失败，已使用本地结构化 fallback。");
  }
}

export function buildEnterpriseKnowledgeContent(input: {
  originalInput: string;
  structured: EnterpriseStructuredKnowledge;
}) {
  const qaText = input.structured.qa_pairs
    .map((pair, index) => [`Q${index + 1}: ${pair.q}`, `A${index + 1}: ${pair.a}`].join("\n"))
    .join("\n\n");

  return [
    `# ${input.structured.title}`,
    "",
    "## 摘要",
    input.structured.summary,
    "",
    "## 标准问答",
    qaText,
    "",
    "## 原始投喂",
    cleanEnterpriseIngestInput(input.originalInput)
  ].join("\n");
}
