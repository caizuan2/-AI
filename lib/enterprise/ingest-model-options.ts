export type IngestModelProvider = "openai" | "deepseek" | "deepseek-pro" | "deepseek-flash" | "qwen" | "kimi";

export interface IngestModelOption {
  provider: IngestModelProvider;
  label: string;
  shortLabel: string;
  displayName: string;
  modelEnvKey: string;
  defaultModel: string;
  description: string;
  scenario: string;
  speedLabel: string;
  depthLabel: string;
  requiresApiKeyEnv: string;
  baseUrlEnv?: string;
}

export const ADMIN_INGEST_MODEL_STORAGE_KEY = "admin-ingest-selected-model";

export const INGEST_MODEL_OPTIONS: IngestModelOption[] = [
  {
    provider: "openai",
    label: "GPT-5.5 超高",
    shortLabel: "GPT-5.5",
    displayName: "GPT-5.5 专业版",
    modelEnvKey: "OPENAI_MODEL",
    defaultModel: "gpt-5.5",
    description: "适合深度投喂、复杂文件总结、知识结构化和高质量话术生成。",
    scenario: "深度分析 / 知识入库 / 用户端调用策略",
    speedLabel: "深度",
    depthLabel: "超高",
    requiresApiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL"
  },
  {
    provider: "kimi",
    label: "Kimi-K2.7-Code-HighSpeed",
    shortLabel: "Kimi",
    displayName: "Kimi-K2.7-Code-HighSpeed",
    modelEnvKey: "KIMI_MODEL",
    defaultModel: "kimi-k2.7-code-highspeed",
    description: "适合 PDF / Word / PPT 等长文档投喂和大上下文解析。",
    scenario: "文档投喂 / 长上下文 / 文件解析",
    speedLabel: "长文档",
    depthLabel: "128K",
    requiresApiKeyEnv: "KIMI_API_KEY",
    baseUrlEnv: "KIMI_BASE_URL"
  },
  {
    provider: "deepseek-pro",
    label: "DeepSeek-V4-Pro",
    shortLabel: "DeepSeek",
    displayName: "DeepSeek-V4-Pro",
    modelEnvKey: "DEEPSEEK_PRO_MODEL",
    defaultModel: "deepseek-chat",
    description: "适合中文资料整理、知识拆解、SOP 和成本敏感的投喂任务。",
    scenario: "中文总结 / SOP / 标准问答 / 资料归纳",
    speedLabel: "均衡",
    depthLabel: "Pro",
    requiresApiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL"
  },
  {
    provider: "deepseek-flash",
    label: "DeepSeek-V4-Flash",
    shortLabel: "Flash",
    displayName: "DeepSeek-V4-Flash",
    modelEnvKey: "DEEPSEEK_FLASH_MODEL",
    defaultModel: "deepseek-chat",
    description: "适合低成本批量处理、草稿生成和快速资料初筛。",
    scenario: "低成本 / 批量 / 草稿",
    speedLabel: "极速",
    depthLabel: "Flash",
    requiresApiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL"
  },
  {
    provider: "qwen",
    label: "Qwen Plus",
    shortLabel: "Qwen",
    displayName: "Qwen Plus",
    modelEnvKey: "QWEN_MODEL",
    defaultModel: "qwen-plus",
    description: "适合中文知识总结、资料归纳和企业知识投喂的均衡模型。",
    scenario: "中文知识总结 / 企业资料归纳 / 标准问答",
    speedLabel: "均衡",
    depthLabel: "Plus",
    requiresApiKeyEnv: "QWEN_API_KEY",
    baseUrlEnv: "QWEN_BASE_URL"
  }
];

export const DEFAULT_INGEST_MODEL_OPTION = INGEST_MODEL_OPTIONS[0];
export const INGEST_MODEL_DISPLAY_NAMES = INGEST_MODEL_OPTIONS.map((option) => option.label);

function readRuntimeEnv(name: string) {
  return typeof process !== "undefined" ? process.env[name]?.trim() ?? "" : "";
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

const DISPLAY_MODEL_LABELS = new Set([
  ...INGEST_MODEL_OPTIONS.flatMap((option) => [
    option.label,
    option.displayName,
    option.shortLabel
  ]),
  "GPT-5.5",
  "GPT-5.5 超高",
  "DeepSeek-V4-Pro",
  "DeepSeek-V4-Flash",
  "DeepSeek Flash",
  "Kimi 128K",
  "Kimi-K2.7-Code-HighSpeed",
  "Qwen Plus",
  "千问"
].map(normalizeLabel));

export function normalizeIngestModelProvider(value: string | null | undefined): IngestModelProvider {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "deepseek") {
    return "deepseek-pro";
  }

  if (normalized === "deepseek-pro") {
    return "deepseek-pro";
  }

  if (normalized === "deepseek-flash") {
    return "deepseek-flash";
  }

  if (normalized === "qwen") {
    return "qwen";
  }

  if (normalized === "kimi") {
    return "kimi";
  }

  return "openai";
}

export function getIngestModelOptionByProvider(provider: string | null | undefined) {
  const normalized = normalizeIngestModelProvider(provider);

  return INGEST_MODEL_OPTIONS.find((option) => option.provider === normalized) ?? DEFAULT_INGEST_MODEL_OPTION;
}

export function getIngestModelOptionByLabel(label: string | null | undefined) {
  const value = (label ?? "").trim();
  const lower = value.toLowerCase();
  const exactMatch = INGEST_MODEL_OPTIONS.find((option) =>
    option.label === value ||
    option.displayName === value ||
    option.shortLabel === value
  );

  if (exactMatch) {
    return exactMatch;
  }

  return INGEST_MODEL_OPTIONS.find((option) =>
    lower.includes(option.provider) ||
    lower.includes(option.defaultModel.toLowerCase()) ||
    lower.includes(option.shortLabel.toLowerCase())
  ) ?? DEFAULT_INGEST_MODEL_OPTION;
}

export function getIngestModelOption(input: {
  provider?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}) {
  if (input.provider) {
    return getIngestModelOptionByProvider(input.provider);
  }

  return getIngestModelOptionByLabel(input.selectedModelLabel || input.modelDisplayName || input.preferredModel);
}

export function isIngestDisplayModelLabel(value: string | null | undefined) {
  const normalized = normalizeLabel(value);

  return Boolean(normalized && DISPLAY_MODEL_LABELS.has(normalized));
}

export function sanitizeIngestPreferredModel(value: string | null | undefined) {
  const model = (value ?? "").trim();

  return model && !isIngestDisplayModelLabel(model) ? model : "";
}

export function resolveIngestActualModel(provider: string | null | undefined) {
  const normalized = normalizeIngestModelProvider(provider);

  if (normalized === "deepseek-pro") {
    return readRuntimeEnv("DEEPSEEK_PRO_MODEL")
      || readRuntimeEnv("DEEPSEEK_MODEL")
      || "deepseek-chat";
  }

  if (normalized === "deepseek-flash") {
    return readRuntimeEnv("DEEPSEEK_FLASH_MODEL")
      || readRuntimeEnv("DEEPSEEK_MODEL")
      || "deepseek-chat";
  }

  if (normalized === "kimi") {
    return readRuntimeEnv("KIMI_MODEL") || "kimi-k2.7-code-highspeed";
  }

  if (normalized === "qwen") {
    return readRuntimeEnv("QWEN_MODEL") || "qwen-plus";
  }

  const openAIModel = readRuntimeEnv("OPENAI_MODEL");
  const fixedOpenAIModel = openAIModel && openAIModel.toLowerCase() !== "auto" ? openAIModel : "";

  return fixedOpenAIModel
    || readRuntimeEnv("OPENAI_PREFERRED_MODEL")
    || "gpt-5.5";
}

export function resolveIngestModelRuntime(input: {
  provider?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}) {
  const option = input.provider
    ? getIngestModelOptionByProvider(input.provider)
    : getIngestModelOption(input);
  const displayModelLabel = input.selectedModelLabel
    || input.modelDisplayName
    || option.label;
  const preferredActualModel = sanitizeIngestPreferredModel(input.preferredModel);

  return {
    option,
    provider: option.provider,
    displayModelLabel,
    actualModel: preferredActualModel || resolveIngestActualModel(option.provider)
  };
}
