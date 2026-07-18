import "server-only";

import { AppError } from "@/lib/errors";
import { OPENAI_PLACEHOLDER_API_KEY } from "@/lib/server-config-core";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PREFERRED_MODEL = "gpt-5.5";
const DEFAULT_MODEL_DISPLAY_NAME = "GPT-5.5 超高";
const DEFAULT_MODEL_PRIORITY = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.3",
  "gpt-4.5",
  "o3"
];

export interface ResolvedOpenAIModel {
  model: string;
  baseUrl: string;
  apiKey: string;
  mode: "fixed" | "highest";
  candidates: string[];
  availableModelsChecked: boolean;
  displayName: string;
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readOpenAIKey() {
  const apiKey = readEnv("OPENAI_API_KEY");

  if (!apiKey || apiKey.includes(OPENAI_PLACEHOLDER_API_KEY)) {
    throw new AppError("MISSING_AI_API_KEY", "未配置 OpenAI API Key，已使用本地预览模型。", 500);
  }

  return apiKey;
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function unique(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function readPriority() {
  const preferred = readEnv("OPENAI_PREFERRED_MODEL") || DEFAULT_PREFERRED_MODEL;
  const configuredPriority = readEnv("OPENAI_MODEL_PRIORITY")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return unique([preferred, ...configuredPriority, ...DEFAULT_MODEL_PRIORITY]);
}

function readDisplayName(model: string) {
  const configured = readEnv("OPENAI_MODEL_DISPLAY_NAME") || readEnv("OPENAI_MODEL_LABEL");

  if (configured) {
    return configured;
  }

  if (model === DEFAULT_PREFERRED_MODEL) {
    return DEFAULT_MODEL_DISPLAY_NAME;
  }

  return model;
}

async function listAvailableModels(input: {
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}) {
  const response = await fetch(`${input.baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`
    },
    signal: input.signal,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new AppError("OPENAI_REQUEST_FAILED", "无法读取 OpenAI 模型列表，已回退到本地优先级。", 502);
  }

  const payload = await response.json().catch(() => null) as {
    data?: Array<{ id?: string }>;
  } | null;

  return new Set((payload?.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id)));
}

export async function resolveHighestOpenAIModel(options: {
  preferredModel?: string | null;
  signal?: AbortSignal;
} = {}): Promise<ResolvedOpenAIModel> {
  const apiKey = readOpenAIKey();
  const baseUrl = normalizeBaseUrl(readEnv("OPENAI_BASE_URL"));
  const configuredModel = readEnv("OPENAI_MODEL") || "auto";
  const mode = configuredModel.toLowerCase() === "auto" ? "highest" : "fixed";
  const candidates = mode === "fixed"
    ? [configuredModel]
    : unique([options.preferredModel ?? "", ...readPriority()]);

  if (mode === "fixed") {
    return {
      model: configuredModel,
      baseUrl,
      apiKey,
      mode,
      candidates,
      availableModelsChecked: false,
      displayName: readDisplayName(configuredModel)
    };
  }

  try {
    const availableModels = await listAvailableModels({
      baseUrl,
      apiKey,
      signal: options.signal
    });
    const selected = candidates.find((model) => availableModels.has(model)) ?? candidates[0] ?? DEFAULT_PREFERRED_MODEL;

    return {
      model: selected,
      baseUrl,
      apiKey,
      mode,
      candidates,
      availableModelsChecked: true,
      displayName: readDisplayName(selected)
    };
  } catch {
    const selected = candidates[0] ?? DEFAULT_PREFERRED_MODEL;

    return {
      model: selected,
      baseUrl,
      apiKey,
      mode,
      candidates,
      availableModelsChecked: false,
      displayName: readDisplayName(selected)
    };
  }
}
