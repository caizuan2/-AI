import {
  BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES,
  BUSINESS_OUTPUT_ENFORCER_VERSION,
  evaluateBusinessOutputEnforcer,
  type BusinessOutputEnforcerSectionTitle
} from "@/lib/business-output-enforcer";

export interface BusinessSchemaGuardValidation {
  version: typeof BUSINESS_OUTPUT_ENFORCER_VERSION;
  valid: boolean;
  isCompliant: boolean;
  presentSections: BusinessOutputEnforcerSectionTitle[];
  missingSections: BusinessOutputEnforcerSectionTitle[];
  emptySections: BusinessOutputEnforcerSectionTitle[];
  requiredOrderValid: boolean;
}

export interface BusinessSchemaGuardInput {
  response: string;
  intent?: string | null;
  businessStrategy?: string | null;
  standardReply?: string | null;
  nextAction?: string | null;
}

export interface BusinessSchemaGuardResult {
  response: string;
  validation: BusinessSchemaGuardValidation;
  repaired: boolean;
  hardEnforced: boolean;
  rewriteApplied: boolean;
  enforcementMode: "pass" | "rewrite" | "safe_fallback";
  initialValidation: BusinessSchemaGuardValidation;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncateText(value: string, limit: number) {
  const normalized = normalizeText(value).replace(/\s+/g, " ");

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function extractExistingSection(response: string, title: BusinessOutputEnforcerSectionTitle) {
  const heading = `【${title}】`;
  const start = response.indexOf(heading);

  if (start < 0) {
    return "";
  }

  const bodyStart = start + heading.length;
  const nextSectionStarts = BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES
    .filter((sectionTitle) => sectionTitle !== title)
    .map((sectionTitle) => response.indexOf(`【${sectionTitle}】`, bodyStart))
    .filter((index) => index >= 0);
  const bodyEnd = nextSectionStarts.length > 0 ? Math.min(...nextSectionStarts) : response.length;

  return response.slice(bodyStart, bodyEnd).trim();
}

function buildFallbackSection(
  title: BusinessOutputEnforcerSectionTitle,
  input: BusinessSchemaGuardInput,
  originalResponse: string
) {
  const intent = normalizeText(input.intent) || "knowledge_user";
  const strategy = normalizeText(input.businessStrategy) || "先基于知识库资料回答，再结合用户当前意图给出可执行下一步。";
  const standardReply = normalizeText(input.standardReply) || normalizeText(originalResponse) || "当前知识库资料不足，需要先补充客户场景后再给出可复制话术。";
  const nextAction = normalizeText(input.nextAction) || "请补充客户当前场景、主要顾虑和是否需要人工确认。";

  switch (title) {
    case "用户意图":
      return intent;
    case "业务问题分析":
      return originalResponse
        ? `已根据知识库资料和用户问题进行判断：${truncateText(originalResponse, 420)}`
        : "当前回答缺少可分析内容，需要先确认用户问题和知识库命中结果。";
    case "商业执行策略":
      return strategy;
    case "推荐动作":
      return [
        "- ACTION_1：先基于知识库资料回答用户核心问题。",
        "- ACTION_2：结合当前意图给出可执行沟通建议。",
        "- ACTION_3：涉及价格、订单、合同、退款或售后时，引导人工确认。"
      ].join("\n");
    case "标准回复话术":
      return standardReply;
    case "下一步行动":
      return nextAction;
    default:
      return "";
  }
}

function hasRequiredSectionOrder(response: string) {
  let previousIndex = -1;

  for (const title of BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES) {
    const currentIndex = response.indexOf(`【${title}】`);

    if (currentIndex < 0 || currentIndex <= previousIndex) {
      return false;
    }

    previousIndex = currentIndex;
  }

  return true;
}

function rewriteBusinessOutput(input: BusinessSchemaGuardInput, originalResponse: string) {
  return BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES
    .map((title) => {
      const existingBody = extractExistingSection(originalResponse, title);
      const body = existingBody || buildFallbackSection(title, input, originalResponse);

      return `【${title}】\n${body}`;
    })
    .join("\n\n");
}

function buildSafeFallbackResponse(input: BusinessSchemaGuardInput, originalResponse: string) {
  return BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES
    .map((title) => `【${title}】\n${buildFallbackSection(title, input, originalResponse)}`)
    .join("\n\n");
}

export function validateOutputSchema(response: string): BusinessSchemaGuardValidation {
  const compliance = evaluateBusinessOutputEnforcer(response);
  const requiredOrderValid = hasRequiredSectionOrder(response);
  const emptySections = BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES.filter((title) => {
    if (compliance.missingSections.includes(title)) {
      return false;
    }

    return !extractExistingSection(response, title);
  });
  const valid = compliance.isCompliant && requiredOrderValid && emptySections.length === 0;

  return {
    version: BUSINESS_OUTPUT_ENFORCER_VERSION,
    valid,
    isCompliant: valid,
    presentSections: compliance.presentSections,
    missingSections: compliance.missingSections,
    emptySections,
    requiredOrderValid
  };
}

export function guardBusinessOutputSchema(input: BusinessSchemaGuardInput): BusinessSchemaGuardResult {
  const originalResponse = normalizeText(input.response);
  const initialValidation = validateOutputSchema(originalResponse);

  if (initialValidation.valid) {
    return {
      response: originalResponse,
      validation: initialValidation,
      repaired: false,
      hardEnforced: true,
      rewriteApplied: false,
      enforcementMode: "pass",
      initialValidation
    };
  }

  const rewrittenResponse = rewriteBusinessOutput(input, originalResponse);
  const rewrittenValidation = validateOutputSchema(rewrittenResponse);

  if (rewrittenValidation.valid) {
    return {
      response: rewrittenResponse,
      validation: rewrittenValidation,
      repaired: true,
      hardEnforced: true,
      rewriteApplied: true,
      enforcementMode: "rewrite",
      initialValidation
    };
  }

  const safeFallbackResponse = buildSafeFallbackResponse(input, originalResponse);
  const safeFallbackValidation = validateOutputSchema(safeFallbackResponse);

  return {
    response: safeFallbackResponse,
    validation: safeFallbackValidation,
    repaired: true,
    hardEnforced: true,
    rewriteApplied: true,
    enforcementMode: "safe_fallback",
    initialValidation
  };
}
