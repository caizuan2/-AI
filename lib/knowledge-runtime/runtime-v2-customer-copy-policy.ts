import type { RuntimeV2Input, RuntimeV2Memory, RuntimeV2OutputMode } from "./runtime-v2-types";

const MAX_CUSTOMER_COPY_LENGTH = 700;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function compact(value: string): string {
  const next = value.replace(/\n{3,}/g, "\n\n").trim();
  return next.length > MAX_CUSTOMER_COPY_LENGTH
    ? `${next.slice(0, MAX_CUSTOMER_COPY_LENGTH).trim()}...`
    : next;
}

function prefixForMode(mode: RuntimeV2OutputMode): string {
  if (mode === "sales_closing" || mode === "sales_followup") return "可以这样推进成交：";
  if (mode === "customer_reply") return "可以直接这样回复客户：";
  if (mode === "explain" || mode === "analysis") return "可以这样解释：";
  if (mode === "sop") return "可以按这几个步骤处理：";
  if (mode === "faq") return "可以这样回答：";
  return "可以这样回复：";
}

function readCustomerCopyCandidate(rawValue: unknown): string {
  const raw = rawValue as Record<string, unknown> | null;
  const candidates = raw
    ? [
        raw.customerCopy,
        raw.customer_copy,
        raw.customerAnswer,
        raw.customer_answer,
        raw.finalAnswer,
        raw.final_answer,
        raw.answer,
      ]
    : [rawValue];

  for (const candidate of candidates) {
    const text = clean(candidate);
    if (text) return compact(text);
  }

  return "";
}

export function buildRuntimeV2CustomerCopy(rawValue: unknown, input: RuntimeV2Input): string {
  const copy = readCustomerCopyCandidate(rawValue);

  if (copy) return copy;

  return `${prefixForMode(input.outputMode)}我先确认一下您的具体情况，再给您一个更稳妥的方案。`;
}

export function buildRuntimeV2MemoryAwareCustomerCopy(
  rawValue: unknown,
  input: RuntimeV2Input,
  memories: RuntimeV2Memory[] = [],
): string {
  const copy = readCustomerCopyCandidate(rawValue);

  if (copy) {
    return copy;
  }

  if (memories.length === 0) {
    return buildRuntimeV2CustomerCopy(rawValue, input);
  }

  const memoryTitle = memories[0]?.title ?? "已有经验";

  return compact(`${prefixForMode(input.outputMode)}结合${memoryTitle}，我先确认一下您的具体情况，再给您一个更稳妥的方案。`);
}
