import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  INDUSTRY_COACH_SKILL_KEYS,
  INDUSTRY_STANDARD_STATUSES,
  type CoachRuleDimension,
  type CoachRuleRules,
  type CreateCoachRuleInput,
  type CreateIndustryStandardInput,
  type IndustryCoachSkillKey,
  type IndustryStandardStatus
} from "@/apps/team-os/features/industry-coach/types";

const MAX_CRITERIA_PER_DIMENSION = 12;

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${label}格式不正确。`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function positiveVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new ValidationError("标准版本必须是 1 到 10000 之间的整数。");
  }
  return value;
}

function standardStatus(value: unknown): IndustryStandardStatus {
  if (typeof value !== "string" || !INDUSTRY_STANDARD_STATUSES.includes(value as IndustryStandardStatus)) {
    throw new ValidationError("标准状态不正确。");
  }
  return value as IndustryStandardStatus;
}

function criteriaList(value: unknown, skillKey: IndustryCoachSkillKey) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CRITERIA_PER_DIMENSION) {
    throw new ValidationError(`${skillKey} 必须包含 1 到 ${MAX_CRITERIA_PER_DIMENSION} 条评分标准。`);
  }
  return value.map((criterion) => requiredText(criterion, `${skillKey} 评分标准`, 300));
}

function ruleDimension(value: unknown, skillKey: IndustryCoachSkillKey): CoachRuleDimension {
  if (!isPlainObject(value)) {
    throw new ValidationError(`${skillKey} 评分维度格式不正确。`);
  }
  if (value.weight !== 20) {
    throw new ValidationError(`${skillKey} 权重必须为 20。`);
  }

  return {
    weight: 20,
    criteria: criteriaList(value.criteria, skillKey)
  };
}

export function parseCoachRuleRules(value: unknown): CoachRuleRules {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !isPlainObject(value.dimensions)) {
    throw new ValidationError("评分规则必须使用 schemaVersion 1 和完整 dimensions。");
  }

  const dimensionKeys = Object.keys(value.dimensions);
  if (
    dimensionKeys.length !== INDUSTRY_COACH_SKILL_KEYS.length ||
    dimensionKeys.some((key) => !INDUSTRY_COACH_SKILL_KEYS.includes(key as IndustryCoachSkillKey))
  ) {
    throw new ValidationError("评分规则必须且只能包含五个销售能力维度。");
  }

  return {
    schemaVersion: 1,
    dimensions: {
      ice_breaking: ruleDimension(value.dimensions.ice_breaking, "ice_breaking"),
      needs_discovery: ruleDimension(value.dimensions.needs_discovery, "needs_discovery"),
      product_presentation: ruleDimension(value.dimensions.product_presentation, "product_presentation"),
      objection_handling: ruleDimension(value.dimensions.objection_handling, "objection_handling"),
      closing_progress: ruleDimension(value.dimensions.closing_progress, "closing_progress")
    }
  };
}

export function parseIndustryCompanyId(value: unknown, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ValidationError("企业 ID 不能为空。");
    }
    return undefined;
  }
  return requiredText(value, "企业 ID", 120);
}

export function parseCreateIndustryStandardInput(body: unknown): CreateIndustryStandardInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  return {
    companyId: parseIndustryCompanyId(body.companyId, true)!,
    category: requiredText(body.category, "标准分类", 80),
    title: requiredText(body.title, "标准标题", 160),
    content: requiredText(body.content, "标准内容", 30_000),
    version: positiveVersion(body.version),
    status: standardStatus(body.status)
  };
}

export function parseCreateCoachRuleInput(body: unknown): CreateCoachRuleInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  return {
    companyId: parseIndustryCompanyId(body.companyId, true)!,
    name: requiredText(body.name, "规则名称", 120),
    description: optionalText(body.description, "规则描述", 2_000),
    rules: parseCoachRuleRules(body.rules)
  };
}
