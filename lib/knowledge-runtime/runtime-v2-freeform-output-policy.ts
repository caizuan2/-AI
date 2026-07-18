import { classifyRuntimeV2UserIntent } from "./runtime-v2-intent-classifier";
import type { RuntimeV2Input } from "./runtime-v2-types";

export function buildFreeformOutputInstruction(input: RuntimeV2Input): string {
  const profile = classifyRuntimeV2UserIntent(input);

  return [
    "[Freeform First Output Policy]",
    "1. 先直接解决用户当前问题，再考虑展示结构。",
    "2. 不要先套固定模板，不要每次都写同一套“先确认/再建议/最后引导”。",
    "3. 已命中的知识、Memory 和最近对话要进入正文判断，不只放在引用区。",
    "4. 用户要求表格时，主答案必须保留 Markdown 表格或清晰对比结构。",
    "5. 用户要求客户回复时，必须给可直接微信发送的话术。",
    "6. 健康、控体、效果类内容必须保留合规边界，不承诺固定结果。",
    `Intent=${profile.intent}; outputMode=${profile.outputMode}; requiresTable=${profile.requiresTable}; requiresCustomerCopy=${profile.requiresCustomerCopy}.`,
  ].join("\n");
}
