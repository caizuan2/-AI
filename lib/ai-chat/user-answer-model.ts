import {
  DEEPSEEK_PRO_MODEL_ID,
  DOUBAO_PRO_MODEL_ID
} from "@/lib/enterprise/ingest-model-options";

export const USER_ANSWER_MODEL_PROVIDERS = [
  "deepseek-pro",
  "doubao-pro"
] as const;

export type UserAnswerModelProvider = typeof USER_ANSWER_MODEL_PROVIDERS[number];

export interface UserAnswerModelOption {
  provider: UserAnswerModelProvider;
  model: string;
  label: string;
  badge: "DS" | "豆";
}

export const DEFAULT_USER_ANSWER_MODEL_PROVIDER: UserAnswerModelProvider = "deepseek-pro";

export const USER_ANSWER_MODEL_OPTIONS: readonly UserAnswerModelOption[] = [
  {
    provider: "deepseek-pro",
    model: DEEPSEEK_PRO_MODEL_ID,
    label: "DeepSeek-V4-Pro",
    badge: "DS"
  },
  {
    provider: "doubao-pro",
    model: DOUBAO_PRO_MODEL_ID,
    label: "Doubao-Seed-2.1-pro",
    badge: "豆"
  }
];

export function parseUserAnswerModelProvider(
  value: unknown
): UserAnswerModelProvider | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return USER_ANSWER_MODEL_PROVIDERS.find((provider) => provider === normalized) ?? null;
}

export function getUserAnswerModelOption(
  provider: UserAnswerModelProvider
) {
  return USER_ANSWER_MODEL_OPTIONS.find((option) => option.provider === provider)
    ?? USER_ANSWER_MODEL_OPTIONS[0];
}
