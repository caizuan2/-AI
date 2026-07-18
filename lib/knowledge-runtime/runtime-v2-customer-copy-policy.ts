import type { RuntimeV2Input, RuntimeV2Memory, RuntimeV2OutputMode, RuntimeV2Source } from "./runtime-v2-types";
import { extractRuntimeV2CustomerScript } from "./runtime-v2-customer-script-extractor";

const MAX_CUSTOMER_COPY_LENGTH = 700;

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

export function buildRuntimeV2CustomerCopy(rawValue: unknown, input: RuntimeV2Input): string {
  const copy = extractRuntimeV2CustomerScript(rawValue, input);

  if (copy) return copy;

  return `${prefixForMode(input.outputMode)}请先把当前目标、基础情况和最卡住的一点告诉我，我再给您更贴合实际的建议。`;
}

export function buildRuntimeV2MemoryAwareCustomerCopy(
  rawValue: unknown,
  input: RuntimeV2Input,
  memories: RuntimeV2Memory[] = [],
  sources: RuntimeV2Source[] = [],
): string {
  const copy = extractRuntimeV2CustomerScript(rawValue, input, { memories, sources });

  if (copy) {
    return copy;
  }

  if (memories.length === 0) {
    return buildRuntimeV2CustomerCopy(rawValue, input);
  }

  const memoryTitle = memories[0]?.title ?? "已有经验";

  return compact(`${prefixForMode(input.outputMode)}结合${memoryTitle}，我先确认一下您的具体情况，再给您一个更稳妥的方案。`);
}
