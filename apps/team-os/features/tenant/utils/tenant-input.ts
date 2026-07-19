import { ValidationError } from "@/lib/errors";
import {
  TEAM_OS_FEATURE_KEYS,
  type FeatureCheckInput,
  type TeamOsFeatureKey,
  type UpgradeIntentInput
} from "@/apps/team-os/features/tenant/types";

const MAX_IDENTIFIER_LENGTH = 191;
const featureKeySet = new Set<string>(TEAM_OS_FEATURE_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalIdentifier(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${label}必须是字符串。`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw new ValidationError(`${label}长度不能超过 ${MAX_IDENTIFIER_LENGTH} 个字符。`);
  }

  return normalized;
}

function requiredIdentifier(value: unknown, label: string) {
  const normalized = optionalIdentifier(value, label);
  if (!normalized) {
    throw new ValidationError(`请提供${label}。`);
  }
  return normalized;
}

function parseFeatureKey(value: unknown): TeamOsFeatureKey {
  if (typeof value !== "string") {
    throw new ValidationError("请提供功能标识。");
  }

  const normalized = value.trim().toLowerCase();
  if (!featureKeySet.has(normalized)) {
    throw new ValidationError("功能标识不受支持。");
  }

  return normalized as TeamOsFeatureKey;
}

export function parseTenantCompanyQuery(searchParams: URLSearchParams): { companyId?: string } {
  return {
    companyId: optionalIdentifier(searchParams.get("companyId"), "企业 ID")
  };
}

export function parseFeatureCheckQuery(searchParams: URLSearchParams): FeatureCheckInput {
  return {
    companyId: optionalIdentifier(searchParams.get("companyId"), "企业 ID"),
    featureKey: parseFeatureKey(searchParams.get("featureKey"))
  };
}

export function parseUpgradeIntentInput(value: unknown): UpgradeIntentInput {
  if (!isRecord(value)) {
    throw new ValidationError("请求体必须是合法 JSON 对象。");
  }

  return {
    companyId: requiredIdentifier(value.companyId, "企业 ID"),
    targetPlanId: requiredIdentifier(value.targetPlanId, "目标套餐 ID")
  };
}
