export type IngestModelProvider = "openai" | "deepseek";

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
    provider: "deepseek",
    label: "DeepSeek-V4-Pro",
    shortLabel: "DeepSeek",
    displayName: "DeepSeek-V4-Pro",
    modelEnvKey: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
    description: "适合中文资料整理、知识拆解、SOP 和成本敏感的投喂任务。",
    scenario: "中文总结 / SOP / 标准问答 / 资料归纳",
    speedLabel: "均衡",
    depthLabel: "Pro",
    requiresApiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL"
  }
];

export const DEFAULT_INGEST_MODEL_OPTION = INGEST_MODEL_OPTIONS[0];
export const INGEST_MODEL_DISPLAY_NAMES = INGEST_MODEL_OPTIONS.map((option) => option.label);

export function normalizeIngestModelProvider(value: string | null | undefined): IngestModelProvider {
  return value?.trim().toLowerCase() === "deepseek" ? "deepseek" : "openai";
}

export function getIngestModelOptionByProvider(provider: string | null | undefined) {
  const normalized = normalizeIngestModelProvider(provider);

  return INGEST_MODEL_OPTIONS.find((option) => option.provider === normalized) ?? DEFAULT_INGEST_MODEL_OPTION;
}

export function getIngestModelOptionByLabel(label: string | null | undefined) {
  const value = (label ?? "").trim();
  const lower = value.toLowerCase();

  return INGEST_MODEL_OPTIONS.find((option) =>
    option.label === value ||
    option.displayName === value ||
    option.shortLabel === value ||
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
