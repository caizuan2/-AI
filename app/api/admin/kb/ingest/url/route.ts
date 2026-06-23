import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  normalizeAdminIngestPlatform,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readSyncTarget(value: unknown): Array<"web" | "exe" | "apk"> {
  if (!Array.isArray(value)) {
    return ["web", "exe", "apk"];
  }

  const targets = value.filter((item): item is "web" | "exe" | "apk" => item === "web" || item === "exe" || item === "apk");

  return targets.length > 0 ? targets : ["web", "exe", "apk"];
}

function readPlatform(value: unknown): AdminIngestPlatform {
  return normalizeAdminIngestPlatform(readString(value)) ?? "web";
}

function normalizeHttpUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("请输入有效的网址。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("网址必须以 http:// 或 https:// 开头。");
  }

  return url.toString();
}

function inferTitle(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  const lastSegment = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");

  return lastSegment ? `${host} · ${lastSegment}` : `${host} 网页投喂预览`;
}

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const sourceUrl = readString(body.sourceUrl) || readString(body.url) || readString(body.input);

  if (!sourceUrl) {
    throw new ValidationError("URL 不能为空。");
  }

  const normalizedUrl = normalizeHttpUrl(sourceUrl);

  return {
    sourceUrl: normalizedUrl,
    agentId: readString(body.agentId) || null,
    agentName: readString(body.agentName) || "知识生产主管",
    category: readString(body.category) || "未分类",
    tenantId: readString(body.tenantId) || null,
    userId: readString(body.userId) || null,
    source: "admin_ingest" as const,
    platform: readPlatform(body.platform),
    syncTarget: readSyncTarget(body.syncTarget),
    modelDisplayName: readString(body.modelDisplayName) || readString(body.model) || "GPT-5.5 最高模型"
  };
}

export async function POST(request: Request) {
  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  const url = new URL(input.sourceUrl);
  const now = new Date().toISOString();
  const jobId = `url-preview-${Date.now()}`;
  const title = inferTitle(url);
  const category = input.category === "默认 Agent" ? "未分类" : input.category;
  const tags = ["网址投喂", url.hostname.replace(/^www\./, ""), category.replace("知识库", "")].filter(Boolean);
  const summary = `网页投喂接口待接入真实抓取，当前为本地预览。来源 URL：${input.sourceUrl}`;
  const question = `如何将 ${url.hostname} 的网页内容投喂到知识库？`;
  const answer = "当前阶段已完成 URL 校验和结构化预览。真实网页抓取接入后，将提取正文、摘要、分类标签和标准问答，再由管理员确认保存知识入库。";
  const draft = {
    jobId,
    title,
    category,
    tags,
    summary,
    qa_pairs: [{ q: question, a: answer }],
    confidence: 68,
    should_save: false,
    providerUsed: "url-preview",
    model: input.modelDisplayName,
    fallbackUsed: true,
    saveStatus: "pending" as const,
    sourceUrl: input.sourceUrl
  };

  return apiSuccess({
    stage: "preview" as const,
    job: { id: jobId },
    draft,
    records: [
      {
        id: `record-${jobId}`,
        jobId,
        input: `网址投喂：${input.sourceUrl}`,
        ai_output: draft,
        resultTitle: title,
        category,
        status: "pending" as const,
        sourceType: "url",
        timestamp: now,
        hits: 0
      }
    ],
    preview: true,
    message: "网页投喂接口待接入真实抓取，当前为本地预览。",
    replyMarkdown: [
      "## 网页投喂本地预览",
      "",
      "网页投喂接口待接入真实抓取，当前为本地预览。",
      "",
      `- 来源 URL：${input.sourceUrl}`,
      `- 建议分类：${category}`,
      `- 建议标签：${tags.join("、")}`,
      "- 入库建议：真实抓取接入后再保存正式知识",
      "",
      answer
    ].join("\n"),
    source: input.source,
    platform: input.platform,
    syncTarget: input.syncTarget,
    tenantId: input.tenantId,
    userId: input.userId,
    agentId: input.agentId,
    agentName: input.agentName
  });
}
