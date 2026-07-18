import type { IngestChatAgentTone } from "./mock-chat";

export const ADMIN_INGEST_APP_NAME_STORAGE_KEY = "admin-ingest-app-name";
export const DEFAULT_ADMIN_INGEST_ASSISTANT_NAME = "小董AI";
const ADMIN_INGEST_ASSISTANT_TITLE_SUFFIX = "投喂专家";

export type AdminIngestProfileAgent = {
  id?: string;
  name?: string;
  role?: string;
  category?: string;
  description?: string;
  avatar?: string;
  avatarUrl?: string | null;
  avatarEmoji?: string | null;
  avatarGradient?: string | null;
  assistantName?: string | null;
  tone?: IngestChatAgentTone;
};

export type AdminIngestDisplayProfile = {
  appName: string;
  assistantName: string;
  assistantTitle: string;
  agentName: string;
  expertName: string;
  subtitle: string;
  avatarUrl?: string;
  avatarEmoji: string;
  avatarGradient: string;
  avatarLabel: string;
  tone: IngestChatAgentTone;
  hasAgent: boolean;
};

const toneGradients: Record<IngestChatAgentTone, string> = {
  green: "linear-gradient(135deg, #DDFBEA 0%, #86E7B2 48%, #1BB76E 100%)",
  blue: "linear-gradient(135deg, #E5F0FF 0%, #9BC6FF 48%, #3B82F6 100%)",
  amber: "linear-gradient(135deg, #FFF3D8 0%, #FFD17A 48%, #F59E0B 100%)",
  rose: "linear-gradient(135deg, #FFE4EE 0%, #FDA4C8 48%, #EC4899 100%)",
  slate: "linear-gradient(135deg, #EEF2F7 0%, #C8D2DF 48%, #64748B 100%)",
};

function cleanText(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholderAgent(agent?: AdminIngestProfileAgent | null) {
  if (!agent) {
    return true;
  }

  const name = cleanText(agent.name);
  return !name || agent.id === "no-agent" || name === "未选择 Agent";
}

function inferTone(agent?: AdminIngestProfileAgent | null): IngestChatAgentTone {
  return agent?.tone ?? "green";
}

function inferAvatarEmoji(agent?: AdminIngestProfileAgent | null) {
  const text = [
    cleanText(agent?.name),
    cleanText(agent?.role),
    cleanText(agent?.category),
    cleanText(agent?.description),
    cleanText(agent?.avatar),
  ].join(" ");

  if (/客服|客户|回复|咨询/.test(text)) {
    return "🎧";
  }

  if (/售后|维修|换货|保修|工单/.test(text)) {
    return "🛠️";
  }

  if (/健康|康|瘦|医疗|营养|体重|食谱/.test(text)) {
    return "🧑‍⚕️";
  }

  if (/产品|版本|FAQ|说明|功能/.test(text)) {
    return "📦";
  }

  if (/制度|流程|审批|企业|内部/.test(text)) {
    return "📋";
  }

  if (/销售|营销|报价|成交|线索/.test(text)) {
    return "💼";
  }

  if (/技术|开发|代码|API|前端|后端|Python/.test(text)) {
    return "🧑‍💻";
  }

  return "🤖";
}

function toAssistantTitle(name: string) {
  const normalizedName = cleanText(name) || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;

  return normalizedName.endsWith(ADMIN_INGEST_ASSISTANT_TITLE_SUFFIX)
    ? normalizedName
    : `${normalizedName}${ADMIN_INGEST_ASSISTANT_TITLE_SUFFIX}`;
}

export function resolveAdminIngestDisplayProfile({
  currentAgent,
  appName,
  adminAvatar,
}: {
  currentAgent?: AdminIngestProfileAgent | null;
  appName?: string;
  adminAvatar?: string;
}): AdminIngestDisplayProfile {
  const hasAgent = !isPlaceholderAgent(currentAgent);
  const normalizedAppName = cleanText(appName) || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;
  const agentName = hasAgent
    ? cleanText(currentAgent?.name) || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME
    : normalizedAppName;
  const assistantName =
    normalizedAppName ||
    cleanText(currentAgent?.assistantName) ||
    agentName ||
    DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;
  const assistantTitle = toAssistantTitle(assistantName);
  const expertName = hasAgent ? agentName : assistantName;
  const tone = inferTone(currentAgent);
  const roleText = cleanText(currentAgent?.category) || cleanText(currentAgent?.role);
  const subtitle = hasAgent
    ? `${expertName}${roleText ? ` · ${roleText}` : ""}`
    : `${assistantName} · 管理员投喂工作台`;
  const avatarUrl = cleanText(currentAgent?.avatarUrl) || (!hasAgent ? cleanText(adminAvatar) : "");
  const avatarEmoji = cleanText(currentAgent?.avatarEmoji) || inferAvatarEmoji(currentAgent);
  const avatarGradient = cleanText(currentAgent?.avatarGradient) || toneGradients[tone];

  return {
    appName: normalizedAppName,
    assistantName,
    assistantTitle,
    agentName,
    expertName,
    subtitle,
    avatarUrl: avatarUrl || undefined,
    avatarEmoji,
    avatarGradient,
    avatarLabel: `${assistantName}头像`,
    tone,
    hasAgent,
  };
}
