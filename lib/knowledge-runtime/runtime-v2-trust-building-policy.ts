import type { RuntimeV2Input, RuntimeV2Source } from "./runtime-v2-types";

function firstTitle(sources?: RuntimeV2Source[]) {
  return sources?.map((source) => source.title?.trim()).find(Boolean);
}

export function buildRuntimeV2TrustBuildingMessage(input: RuntimeV2Input, sources: RuntimeV2Source[] = []) {
  const title = firstTitle(sources);
  const evidence = title ? `我会结合“${title}”这类资料来判断，` : "";

  return {
    answer: [
      "### 先建立信任，再推进判断",
      "",
      "客户问效果、案例、真假或安全感时，重点不是马上保证结果，而是让客户知道判断依据和适用边界。",
      "",
      "建议这样处理：",
      "1. 先承认客户谨慎是正常的。",
      "2. 再说明结果要看基础、作息和执行情况。",
      "3. 最后邀请客户补充目标和当前状态，再给适配建议。",
    ].join("\n"),
    customerCopy: `${evidence}我先不跟您说绝对结果，因为每个人基础、作息和执行情况都不一样。您把当前目标和基础情况告诉我，我再帮您判断适不适合，以及从哪一步开始更稳。`,
    trustPoints: [
      "不做绝对承诺，先讲判断边界。",
      "用客户目标和基础情况做适配。",
      "把下一步变成低压力补充信息。",
    ],
    nextAction: "请客户补充目标和当前状态，再给适配建议。",
    query: input.query,
  };
}
