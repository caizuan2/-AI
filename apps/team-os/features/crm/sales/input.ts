import { ValidationError } from "@/lib/errors";
import {
  CRM_CONTRACT_STATUSES,
  CRM_LEAD_SOURCES,
  CRM_LEAD_STATUSES,
  CRM_OPPORTUNITY_STAGES,
  CRM_OPPORTUNITY_STATUSES,
  CRM_RECEIVABLE_STATUSES,
  type ChangeCrmOpportunityStageInput,
  type ChangeCrmContractStatusInput,
  type CreateCrmContractInput,
  type CreateCrmLeadInput,
  type CreateCrmOpportunityInput,
  type CreateCrmReceivableInput,
  type CrmContractListFilters,
  type CrmLeadListFilters,
  type CrmLeadStatus,
  type CrmOpportunityListFilters,
  type CrmOpportunityStage,
  type CrmReceivableListFilters,
  type RecordCrmPaymentInput,
  type UpdateCrmLeadInput,
  type ConvertCrmLeadInput
} from "@/apps/team-os/features/crm/sales/types";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORBIDDEN_REQUEST_KEYS = new Set(["companyId", "role", "appType"]);
const CUSTOMER_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function object(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  return value;
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  const rejected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  const forbidden = rejected.find((key) => FORBIDDEN_REQUEST_KEYS.has(key));
  if (forbidden) {
    throw new ValidationError(`字段 ${forbidden} 由服务端根据当前成员身份确定，不允许提交。`);
  }
  if (rejected.length > 0) {
    throw new ValidationError(`请求包含不支持的字段：${rejected.join("、")}。`);
  }
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, maxLength);
}

function nullableText(value: unknown, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return requiredText(value, label, maxLength);
}

function enumValue<T extends string>(
  value: unknown,
  label: string,
  values: readonly T[],
  optional = false
): T | undefined {
  if (optional && (value === undefined || value === null || value === "")) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ValidationError(`${label}不正确。`);
  }
  return value as T;
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
) {
  if (value === undefined || value === null || value === "") return undefined;
  return integer(value, label, minimum, maximum);
}

function money(value: unknown, label: string) {
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) {
    throw new ValidationError(`${label}必须是字符串格式的非负金额，最多保留两位小数。`);
  }
  return value;
}

function optionalMoney(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return money(value, label);
}

function dateTime(value: unknown, label: string) {
  const normalized = requiredText(value, label, 64);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ValidationError(`${label}必须是有效的 ISO 日期时间。`);
  }
  return parsed.toISOString();
}

function optionalDateTime(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return dateTime(value, label);
}

function nullableDateTime(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return dateTime(value, label);
}

function textArray(
  value: unknown,
  label: string,
  options: { maxItems: number; maxLength: number; optional?: boolean }
) {
  if (value === undefined && options.optional) return undefined;
  if (!Array.isArray(value) || value.length > options.maxItems) {
    throw new ValidationError(`${label}必须是最多 ${options.maxItems} 项的数组。`);
  }
  const normalized = value.map((item) => requiredText(item, label, options.maxLength));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${label}不能包含重复项。`);
  }
  return normalized;
}

function jsonObject(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new ValidationError(`${label}必须是 JSON 对象。`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 20_000) {
    throw new ValidationError(`${label}内容过大。`);
  }
  return value;
}

function email(value: unknown) {
  const normalized = optionalText(value, "邮箱", 254);
  if (normalized && !EMAIL_PATTERN.test(normalized)) {
    throw new ValidationError("邮箱格式不正确。");
  }
  return normalized?.toLowerCase();
}

function booleanQuery(value: string | null, label: string) {
  if (value === null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ValidationError(`${label}必须是 true 或 false。`);
}

function parsePageFilters(
  searchParams: URLSearchParams,
  allowedKeys: readonly string[]
) {
  const unknown = Array.from(new Set(searchParams.keys())).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw new ValidationError(`查询参数包含不支持的字段：${unknown.join("、")}。`);
  }
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("每页数量必须是 1 到 100 之间的整数。");
  }
  return {
    q: optionalText(searchParams.get("q"), "搜索内容", 100),
    teamId: optionalText(searchParams.get("teamId"), "团队 ID", 120),
    ownerId: optionalText(searchParams.get("ownerId"), "负责人 ID", 120),
    cursor: optionalText(searchParams.get("cursor"), "分页游标", 512),
    limit
  };
}

export function parseCrmLeadListFilters(searchParams: URLSearchParams): CrmLeadListFilters {
  const allowed = ["q", "teamId", "ownerId", "cursor", "limit", "source", "status"];
  return {
    ...parsePageFilters(searchParams, allowed),
    source: enumValue(searchParams.get("source"), "线索来源", CRM_LEAD_SOURCES, true),
    status: enumValue(searchParams.get("status"), "线索状态", CRM_LEAD_STATUSES, true)
  };
}

export function parseCreateCrmLeadInput(value: unknown): CreateCrmLeadInput {
  const body = object(value);
  assertAllowedKeys(body, [
    "teamId", "ownerId", "name", "companyName", "contactName", "phone", "email",
    "wechat", "industry", "source", "sourceDetail", "score", "scoreReason",
    "estimatedValue", "lastContactAt", "nextFollowUpAt", "tags", "notes"
  ]);
  const phone = optionalText(body.phone, "手机号", 40);
  const mail = email(body.email);
  const wechat = optionalText(body.wechat, "微信号", 80);
  if (!phone && !mail && !wechat) {
    throw new ValidationError("手机号、邮箱和微信号至少填写一项。");
  }
  return {
    teamId: optionalText(body.teamId, "团队 ID", 120),
    ownerId: optionalText(body.ownerId, "负责人 ID", 120),
    name: requiredText(body.name, "线索名称", 160),
    companyName: optionalText(body.companyName, "企业名称", 200),
    contactName: optionalText(body.contactName, "联系人", 120),
    phone,
    email: mail,
    wechat,
    industry: optionalText(body.industry, "行业", 120),
    source: enumValue(body.source, "线索来源", CRM_LEAD_SOURCES)!,
    sourceDetail: optionalText(body.sourceDetail, "来源说明", 500),
    score: body.score === undefined ? 0 : integer(body.score, "线索评分", 0, 100),
    scoreReason: jsonObject(body.scoreReason, "评分依据"),
    estimatedValue: optionalMoney(body.estimatedValue, "预计价值"),
    lastContactAt: optionalDateTime(body.lastContactAt, "最近联系时间"),
    nextFollowUpAt: optionalDateTime(body.nextFollowUpAt, "下次跟进时间"),
    tags: textArray(body.tags ?? [], "标签", { maxItems: 30, maxLength: 40 }) ?? [],
    notes: optionalText(body.notes, "备注", 5_000) ?? ""
  };
}

export function parseUpdateCrmLeadInput(value: unknown): UpdateCrmLeadInput {
  const body = object(value);
  assertAllowedKeys(body, ["teamId", "ownerId", "status", "lostReason", "nextFollowUpAt"]);
  if (Object.keys(body).length === 0) {
    throw new ValidationError("至少提交一个需要更新的字段。");
  }
  const status = enumValue(body.status, "线索状态", CRM_LEAD_STATUSES, true);
  if (status === "CONVERTED") {
    throw new ValidationError("线索转化必须使用专用转化接口。");
  }
  return {
    teamId: nullableText(body.teamId, "团队 ID", 120),
    ownerId: nullableText(body.ownerId, "负责人 ID", 120),
    status,
    lostReason: nullableText(body.lostReason, "失效原因", 1_000),
    nextFollowUpAt: nullableDateTime(body.nextFollowUpAt, "下次跟进时间")
  };
}

export function parseConvertCrmLeadInput(value: unknown): ConvertCrmLeadInput {
  const body = object(value);
  assertAllowedKeys(body, ["teamId", "ownerId", "customerName", "tags", "notes", "level"]);
  return {
    teamId: optionalText(body.teamId, "团队 ID", 120),
    ownerId: optionalText(body.ownerId, "负责人 ID", 120),
    customerName: optionalText(body.customerName, "客户名称", 160),
    tags: textArray(body.tags, "标签", { maxItems: 30, maxLength: 40, optional: true }),
    notes: optionalText(body.notes, "客户备注", 5_000),
    level: enumValue(body.level, "客户等级", CUSTOMER_LEVELS, true)
  };
}

export function parseCrmOpportunityListFilters(
  searchParams: URLSearchParams
): CrmOpportunityListFilters {
  const allowed = [
    "q", "teamId", "ownerId", "cursor", "limit", "customerId", "stage", "status"
  ];
  return {
    ...parsePageFilters(searchParams, allowed),
    customerId: optionalText(searchParams.get("customerId"), "客户 ID", 120),
    stage: enumValue(searchParams.get("stage"), "商机阶段", CRM_OPPORTUNITY_STAGES, true),
    status: enumValue(searchParams.get("status"), "商机状态", CRM_OPPORTUNITY_STATUSES, true)
  };
}

export function parseCreateCrmOpportunityInput(value: unknown): CreateCrmOpportunityInput {
  const body = object(value);
  assertAllowedKeys(body, [
    "customerId", "primaryContactId", "teamId", "ownerId", "name", "amount",
    "probability", "expectedCloseDate", "nextAction", "competitors", "decisionChain"
  ]);
  return {
    customerId: requiredText(body.customerId, "客户 ID", 120),
    primaryContactId: optionalText(body.primaryContactId, "首要联系人 ID", 120),
    teamId: optionalText(body.teamId, "团队 ID", 120),
    ownerId: optionalText(body.ownerId, "负责人 ID", 120),
    name: requiredText(body.name, "商机名称", 200),
    amount: money(body.amount, "商机金额"),
    probability: integer(body.probability, "成交概率", 0, 100),
    expectedCloseDate: optionalDateTime(body.expectedCloseDate, "预计成交时间"),
    nextAction: requiredText(body.nextAction, "下一步行动", 2_000),
    competitors: textArray(body.competitors ?? [], "竞争对手", { maxItems: 30, maxLength: 120 }) ?? [],
    decisionChain: jsonObject(body.decisionChain, "决策链")
  };
}

export function parseChangeCrmOpportunityStageInput(
  value: unknown
): ChangeCrmOpportunityStageInput {
  const body = object(value);
  assertAllowedKeys(body, ["toStage", "reason", "probability", "expectedCloseDate", "nextAction"]);
  return {
    toStage: enumValue(body.toStage, "目标阶段", CRM_OPPORTUNITY_STAGES)!,
    reason: requiredText(body.reason, "阶段变更原因", 2_000),
    probability: optionalInteger(body.probability, "成交概率", 0, 100),
    expectedCloseDate: nullableDateTime(body.expectedCloseDate, "预计成交时间"),
    nextAction: optionalText(body.nextAction, "下一步行动", 2_000)
  };
}

export function parseCrmContractListFilters(
  searchParams: URLSearchParams
): CrmContractListFilters {
  const allowed = [
    "q", "teamId", "ownerId", "cursor", "limit", "customerId", "opportunityId", "status"
  ];
  return {
    ...parsePageFilters(searchParams, allowed),
    customerId: optionalText(searchParams.get("customerId"), "客户 ID", 120),
    opportunityId: optionalText(searchParams.get("opportunityId"), "商机 ID", 120),
    status: enumValue(searchParams.get("status"), "合同状态", CRM_CONTRACT_STATUSES, true)
  };
}

export function parseCreateCrmContractInput(value: unknown): CreateCrmContractInput {
  const body = object(value);
  assertAllowedKeys(body, [
    "customerId", "opportunityId", "teamId", "ownerId", "contractNo", "title",
    "amount", "signedAt", "startDate", "endDate", "terms", "fileUrls", "notes"
  ]);
  const startDate = optionalDateTime(body.startDate, "合同开始时间");
  const endDate = optionalDateTime(body.endDate, "合同结束时间");
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new ValidationError("合同结束时间不能早于开始时间。");
  }
  const fileUrls = textArray(body.fileUrls ?? [], "合同文件", {
    maxItems: 20,
    maxLength: 2_000
  }) ?? [];
  for (const fileUrl of fileUrls) {
    let url: URL;
    try {
      url = new URL(fileUrl);
    } catch {
      throw new ValidationError("合同文件地址必须是有效 URL。");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new ValidationError("合同文件地址只支持 HTTP 或 HTTPS。");
    }
  }
  return {
    customerId: requiredText(body.customerId, "客户 ID", 120),
    opportunityId: optionalText(body.opportunityId, "商机 ID", 120),
    teamId: optionalText(body.teamId, "团队 ID", 120),
    ownerId: optionalText(body.ownerId, "负责人 ID", 120),
    contractNo: requiredText(body.contractNo, "合同编号", 120),
    title: requiredText(body.title, "合同标题", 200),
    amount: money(body.amount, "合同金额"),
    signedAt: optionalDateTime(body.signedAt, "签约时间"),
    startDate,
    endDate,
    terms: jsonObject(body.terms, "合同条款"),
    fileUrls,
    notes: optionalText(body.notes, "合同备注", 5_000) ?? ""
  };
}

export function parseChangeCrmContractStatusInput(
  value: unknown
): ChangeCrmContractStatusInput {
  const body = object(value);
  assertAllowedKeys(body, ["status", "reason", "signedAt"]);
  return {
    status: enumValue(body.status, "合同状态", CRM_CONTRACT_STATUSES)!,
    reason: requiredText(body.reason, "状态变更原因", 2_000),
    signedAt: optionalDateTime(body.signedAt, "签约时间")
  };
}

export function parseCrmReceivableListFilters(
  searchParams: URLSearchParams
): CrmReceivableListFilters {
  const allowed = [
    "q", "teamId", "ownerId", "cursor", "limit", "customerId", "contractId",
    "status", "overdueOnly"
  ];
  return {
    ...parsePageFilters(searchParams, allowed),
    customerId: optionalText(searchParams.get("customerId"), "客户 ID", 120),
    contractId: optionalText(searchParams.get("contractId"), "合同 ID", 120),
    status: enumValue(searchParams.get("status"), "回款状态", CRM_RECEIVABLE_STATUSES, true),
    overdueOnly: booleanQuery(searchParams.get("overdueOnly"), "仅看逾期")
  };
}

export function parseCreateCrmReceivableInput(value: unknown): CreateCrmReceivableInput {
  const body = object(value);
  assertAllowedKeys(body, [
    "customerId", "contractId", "teamId", "ownerId", "installmentNo", "amount",
    "dueDate", "reminderAt", "notes"
  ]);
  return {
    customerId: requiredText(body.customerId, "客户 ID", 120),
    contractId: requiredText(body.contractId, "合同 ID", 120),
    teamId: optionalText(body.teamId, "团队 ID", 120),
    ownerId: optionalText(body.ownerId, "负责人 ID", 120),
    installmentNo: integer(body.installmentNo, "回款期次", 1, 10_000),
    amount: money(body.amount, "应收金额"),
    dueDate: dateTime(body.dueDate, "应收日期"),
    reminderAt: optionalDateTime(body.reminderAt, "提醒时间"),
    notes: optionalText(body.notes, "回款备注", 5_000) ?? ""
  };
}

export function parseRecordCrmPaymentInput(value: unknown): RecordCrmPaymentInput {
  const body = object(value);
  assertAllowedKeys(body, ["amount", "receivedAt", "notes"]);
  const amount = money(body.amount, "本次回款金额");
  if (Number(amount) <= 0) {
    throw new ValidationError("本次回款金额必须大于 0。");
  }
  return {
    amount,
    receivedAt: optionalDateTime(body.receivedAt, "回款时间"),
    notes: optionalText(body.notes, "回款说明", 2_000)
  };
}

const LEAD_TRANSITIONS: Record<CrmLeadStatus, readonly CrmLeadStatus[]> = {
  NEW: ["UNASSIGNED", "ASSIGNED", "CONTACTED", "DISQUALIFIED", "RECYCLED"],
  UNASSIGNED: ["ASSIGNED", "DISQUALIFIED", "RECYCLED"],
  ASSIGNED: ["UNASSIGNED", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "RECYCLED"],
  CONTACTED: ["ASSIGNED", "QUALIFIED", "DISQUALIFIED", "RECYCLED"],
  QUALIFIED: ["CONTACTED", "ASSIGNED", "DISQUALIFIED", "RECYCLED"],
  CONVERTED: [],
  DISQUALIFIED: ["RECYCLED"],
  RECYCLED: ["UNASSIGNED", "ASSIGNED"]
};

const OPPORTUNITY_TRANSITIONS: Record<CrmOpportunityStage, readonly CrmOpportunityStage[]> = {
  DISCOVERY: ["QUALIFICATION", "LOST"],
  QUALIFICATION: ["SOLUTION", "LOST"],
  SOLUTION: ["QUOTATION", "LOST"],
  QUOTATION: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["CONTRACT", "LOST"],
  CONTRACT: ["WON", "LOST"],
  WON: [],
  LOST: []
};

export function assertCrmLeadTransition(from: CrmLeadStatus, to: CrmLeadStatus) {
  if (from === to) return;
  if (!LEAD_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(`线索状态不能从 ${from} 变更为 ${to}。`);
  }
}

export function assertCrmOpportunityStageTransition(
  from: CrmOpportunityStage,
  to: CrmOpportunityStage
) {
  if (from === to || !OPPORTUNITY_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(`商机阶段不能从 ${from} 变更为 ${to}。`);
  }
}

export function parseCrmEntityId(value: string, label: string) {
  return requiredText(value, label, 120);
}
