export type IngestModelProvider = "openai" | "deepseek" | "deepseek-pro" | "deepseek-flash" | "doubao" | "doubao-pro" | "qwen" | "kimi";

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

export const ADMIN_INGEST_MODEL_STORAGE_KEY = "admin-ingest-selected-model-deepseek-pro-primary-v1";
export const DEEPSEEK_PRO_MODEL_ID = "deepseek-v4-pro";
export const DEEPSEEK_FLASH_MODEL_ID = "deepseek-v4-flash";
export const DOUBAO_PRO_MODEL_ID = "doubao-seed-2-1-pro-260628";

const LEGACY_DOUBAO_MODEL_IDENTIFIERS = new Set([
  "豆包 2.0 Pro",
  "doubao-seed-2-0-pro-260215"
].map((value) => value.toLowerCase()));

const LEGACY_DEEPSEEK_MODEL_IDS = new Set([
  "deepseek-chat",
  "deepseek-reasoner"
]);

function readRuntimeEnv(name: string) {
  return typeof process !== "undefined" ? process.env[name]?.trim() ?? "" : "";
}

export function isOpenAIIngestEnabled() {
  return readRuntimeEnv("AI_ENABLE_GPT_55").toLowerCase() === "true"
    || readRuntimeEnv("NEXT_PUBLIC_AI_ENABLE_GPT_55").toLowerCase() === "true"
    || readRuntimeEnv("AI_ENABLE_OPENAI_INGEST").toLowerCase() === "true"
    || readRuntimeEnv("NEXT_PUBLIC_AI_ENABLE_OPENAI_INGEST").toLowerCase() === "true";
}

export const INGEST_DEFAULT_DEEPSEEK_PROVIDER: IngestModelProvider = "deepseek-pro";

export const ALL_INGEST_MODEL_OPTIONS: IngestModelOption[] = [
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
    defaultModel: DEEPSEEK_PRO_MODEL_ID,
    description: "适合高质量中文资料整理、复杂知识拆解、SOP 和最终正文生成。",
    scenario: "深度总结 / SOP / 标准问答 / 最终知识正文",
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
    defaultModel: DEEPSEEK_FLASH_MODEL_ID,
    description: "适合低成本批量处理、草稿生成和快速资料初筛。",
    scenario: "低成本 / 批量 / 草稿",
    speedLabel: "极速",
    depthLabel: "Flash",
    requiresApiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL"
  },
  {
    provider: "doubao-pro",
    label: "Doubao-Seed-2.1-pro",
    shortLabel: "豆包 Pro",
    displayName: "Doubao-Seed-2.1-pro",
    modelEnvKey: "DOUBAO_PRO_MODEL",
    defaultModel: DOUBAO_PRO_MODEL_ID,
    description: "适合中文知识整理、沟通话术和完整 Markdown 正文生成。",
    scenario: "中文知识 / 沟通话术 / 完整正文",
    speedLabel: "均衡",
    depthLabel: "Pro",
    requiresApiKeyEnv: "ARK_API_KEY",
    baseUrlEnv: "DOUBAO_BASE_URL"
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

export const INGEST_MODEL_OPTIONS: IngestModelOption[] = ALL_INGEST_MODEL_OPTIONS.filter((option) => (
  option.provider !== "openai" || isOpenAIIngestEnabled()
));

export const DISABLED_INGEST_MODEL_OPTIONS: IngestModelOption[] = ALL_INGEST_MODEL_OPTIONS.filter((option) => (
  option.provider === "openai" && !isOpenAIIngestEnabled()
));

export const DEFAULT_INGEST_MODEL_OPTION = INGEST_MODEL_OPTIONS.find((option) => option.provider === INGEST_DEFAULT_DEEPSEEK_PROVIDER)
  ?? INGEST_MODEL_OPTIONS.find((option) => option.provider === "deepseek-pro")
  ?? INGEST_MODEL_OPTIONS[0]
  ?? ALL_INGEST_MODEL_OPTIONS.find((option) => option.provider === INGEST_DEFAULT_DEEPSEEK_PROVIDER)
  ?? ALL_INGEST_MODEL_OPTIONS[0];
export const INGEST_MODEL_DISPLAY_NAMES = INGEST_MODEL_OPTIONS.map((option) => option.label);

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

const DISPLAY_MODEL_LABELS = new Set([
  ...ALL_INGEST_MODEL_OPTIONS.flatMap((option) => [
    option.label,
    option.displayName,
    option.shortLabel,
    option.defaultModel
  ]),
  "GPT-5.5",
  "GPT-5.5 超高",
  "GPT-5.5 专业版",
  "GPT-4.1-mini",
  "DeepSeek-V4-Pro",
  "DeepSeek-V4-Flash",
  "DeepSeek Flash",
  "deepseek-chat",
  "deepseek-reasoner",
  "Kimi 128K",
  "Kimi-K2.7-Code-HighSpeed",
  "Qwen Plus",
  "千问",
  "豆包",
  "豆包 Pro",
  "豆包 2.0 Pro",
  "doubao-seed-2-0-pro-260215"
].map(normalizeLabel));

function isOpenAIModelLike(value: string | null | undefined) {
  const normalized = normalizeLabel(value);

  return Boolean(normalized && (
    normalized === "openai"
    || normalized.includes("openai")
    || normalized.includes("gpt")
  ));
}

export function normalizeIngestModelProvider(value: string | null | undefined): IngestModelProvider {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return INGEST_DEFAULT_DEEPSEEK_PROVIDER;
  }

  if (normalized === "openai" || normalized === "gpt" || normalized.includes("gpt")) {
    return isOpenAIIngestEnabled() ? "openai" : INGEST_DEFAULT_DEEPSEEK_PROVIDER;
  }

  if (normalized === "deepseek") {
    return "deepseek-pro";
  }

  if (normalized === "deepseek-pro") {
    return "deepseek-pro";
  }

  if (normalized === "deepseek-flash") {
    return "deepseek-flash";
  }

  if (normalized === "doubao" || normalized === "doubao-pro" || normalized.includes("doubao") || normalized.includes("豆包")) {
    return "doubao-pro";
  }

  if (normalized === "qwen") {
    return "qwen";
  }

  if (normalized === "kimi") {
    return "kimi";
  }

  return INGEST_DEFAULT_DEEPSEEK_PROVIDER;
}

export function getIngestModelOptionByProvider(provider: string | null | undefined) {
  const normalized = normalizeIngestModelProvider(provider);

  return INGEST_MODEL_OPTIONS.find((option) => option.provider === normalized) ?? DEFAULT_INGEST_MODEL_OPTION;
}

export function getIngestModelOptionByLabel(label: string | null | undefined) {
  const value = (label ?? "").trim();
  const lower = value.toLowerCase();

  if (isOpenAIModelLike(value) && !isOpenAIIngestEnabled()) {
    return DEFAULT_INGEST_MODEL_OPTION;
  }

  const exactMatch = INGEST_MODEL_OPTIONS.find((option) =>
    option.label === value ||
    option.displayName === value ||
    option.shortLabel === value
  );

  if (exactMatch) {
    return exactMatch;
  }

  if (LEGACY_DOUBAO_MODEL_IDENTIFIERS.has(lower)) {
    return INGEST_MODEL_OPTIONS.find((option) => option.provider === "doubao-pro")
      ?? DEFAULT_INGEST_MODEL_OPTION;
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

  if (!isOpenAIIngestEnabled() && isOpenAIModelLike(model)) {
    return "";
  }

  return model && !isIngestDisplayModelLabel(model) ? model : "";
}

export function resolveIngestActualModel(provider: string | null | undefined) {
  const normalized = normalizeIngestModelProvider(provider);

  if (normalized === "deepseek-pro") {
    const configured = readRuntimeEnv("DEEPSEEK_PRO_MODEL") || readRuntimeEnv("DEEPSEEK_MODEL");

    return configured && !LEGACY_DEEPSEEK_MODEL_IDS.has(configured.toLowerCase())
      ? configured
      : DEEPSEEK_PRO_MODEL_ID;
  }

  if (normalized === "deepseek-flash") {
    const configured = readRuntimeEnv("DEEPSEEK_FLASH_MODEL") || readRuntimeEnv("DEEPSEEK_MODEL");

    return configured && !LEGACY_DEEPSEEK_MODEL_IDS.has(configured.toLowerCase())
      ? configured
      : DEEPSEEK_FLASH_MODEL_ID;
  }

  if (normalized === "doubao-pro") {
    return readRuntimeEnv("DOUBAO_PRO_MODEL") || readRuntimeEnv("DOUBAO_MODEL") || DOUBAO_PRO_MODEL_ID;
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

export function normalizeIngestModelSelection(input: {
  provider?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}) {
  const rawValues = [
    input.provider,
    input.selectedModelLabel,
    input.modelDisplayName,
    input.preferredModel
  ].filter(Boolean).map((value) => String(value));
  const normalizedFrom = rawValues.find((value) => isOpenAIModelLike(value) && !isOpenAIIngestEnabled()) ?? null;
  const option = normalizedFrom
    ? DEFAULT_INGEST_MODEL_OPTION
    : input.provider
      ? getIngestModelOptionByProvider(input.provider)
      : getIngestModelOption(input);
  const preferredActualModel = sanitizeIngestPreferredModel(input.preferredModel);
  const actualModel = preferredActualModel || resolveIngestActualModel(option.provider);

  return {
    option,
    provider: option.provider,
    actualModel,
    requestedModel: input.preferredModel || input.selectedModelLabel || input.modelDisplayName || input.provider || "",
    label: option.label,
    displayModelLabel: option.label,
    normalizedFrom,
    disabledReason: normalizedFrom ? "GPT-5.5/OpenAI is temporarily disabled for admin-ingest; normalized to DeepSeek." : null
  };
}

export function resolveIngestModelRuntime(input: {
  provider?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}) {
  const selection = normalizeIngestModelSelection(input);

  return {
    option: selection.option,
    provider: selection.provider,
    displayModelLabel: selection.displayModelLabel,
    actualModel: selection.actualModel,
    requestedModel: selection.requestedModel,
    normalizedFrom: selection.normalizedFrom,
    disabledReason: selection.disabledReason
  };
}
