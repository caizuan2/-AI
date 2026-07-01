import type {
  RuntimeV2ABScripts,
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2SalesCustomerStage,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2ABScriptInput {
  scope: RuntimeV2Input;
  customerStage?: RuntimeV2SalesCustomerStage | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  sources?: RuntimeV2Source[] | null;
}

function readText(input: RuntimeV2Input) {
  return [
    input.query,
    ...(input.messages ?? []).slice(-4).map((message) => message.content),
  ].join("\n");
}

function hasSignal(signals: RuntimeV2DealSignal[] | null | undefined, key: string) {
  return Boolean(signals?.some((signal) => signal.key === key));
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function resolveTopic(text: string, signals: RuntimeV2DealSignal[] | null | undefined) {
  if (hasSignal(signals, "asking_cycle") || hasAny(text, [/33\s*循环|77\s*循环|怎么选|周期/])) {
    return {
      name: "33/77选择",
      softPoint: "先看你现在的基础和目标，不用急着定。",
      directPoint: "如果想轻启动先看33；如果作息饮食更乱，77会更稳一点。",
      question: "你现在更想先轻启动，还是希望周期更稳？",
    };
  }

  if (hasSignal(signals, "asking_price") || hasAny(text, [/太贵|价格|预算|优惠|便宜/])) {
    return {
      name: "价格顾虑",
      softPoint: "先不急着看价格，关键是看它能不能解决你真正卡住的点。",
      directPoint: "我先帮你判断适不适合，再看有没有必要开始，避免花冤枉钱。",
      question: "你更担心预算，还是担心不适合自己？",
    };
  }

  if (hasSignal(signals, "asking_effect") || hasAny(text, [/没效果|有没有用|有效|担心|靠谱不/])) {
    return {
      name: "效果信任",
      softPoint: "担心效果很正常，我不会直接给你承诺结果。",
      directPoint: "先看你的基础、目标和执行条件，再判断适不适合继续。",
      question: "你最担心的是坚持不了，还是之前试过没变化？",
    };
  }

  if (hasSignal(signals, "ready_signal") || hasAny(text, [/怎么开始|怎么买|报名|下单|现在做|怎么付/])) {
    return {
      name: "开始动作",
      softPoint: "可以，我们先把开始前的信息对齐，避免一上来套固定方案。",
      directPoint: "我先确认两个基础信息，然后给你一个更稳的开始安排。",
      question: "你现在的目标和当前基础大概是什么？",
    };
  }

  return {
    name: "沟通承接",
    softPoint: "可以的，你先不用急着决定。",
    directPoint: "我先把选择变简单一点，帮你判断当前最适合怎么接。",
    question: "你现在最卡的是效果、价格，还是不知道自己适不适合？",
  };
}

export function generateABCustomerScripts(input: RuntimeV2ABScriptInput): RuntimeV2ABScripts {
  const text = readText(input.scope);
  const signals = input.dealSignals ?? [];
  const topic = resolveTopic(text, signals);
  const hasKnowledge = (input.sources?.length ?? 0) > 0;
  const knowledgeLine = hasKnowledge ? "我会结合小董AI大脑里的资料帮你判断，不让你盲选。" : "我先按你的情况帮你拆清楚，不让你盲选。";

  const variantA = {
    label: "温和建立信任",
    message: [
      "可以的，你先不用急着决定。",
      topic.softPoint,
      knowledgeLine,
      `你先告诉我：${topic.question}`,
    ].join("\n"),
    bestFor: "适合客户犹豫、怕被催、信任不足或担心效果时使用。",
  };

  const variantB = {
    label: "直接推进下一步",
    message: [
      topic.directPoint,
      "你不用现在就定，我先帮你把下一步判断条件列出来。",
      `先回我一个点：${topic.question}`,
    ].join("\n"),
    bestFor: "适合客户主动问细节、问怎么开始、已经愿意继续沟通时使用。",
  };

  const useA =
    input.silenceRisk?.silenceRisk === "high" ||
    input.silenceRisk?.riskType === "price_pressure" ||
    input.silenceRisk?.riskType === "effect_doubt" ||
    input.customerStage === "hesitating" ||
    input.customerStage === "inactive";
  const useB =
    input.dealProbability?.probability === "high" ||
    input.customerStage === "ready_to_decide" ||
    hasSignal(signals, "ready_signal");

  return {
    variantA,
    variantB,
    recommendation: useB && !useA ? "B" : "A",
    reason: useB && !useA
      ? `客户围绕「${topic.name}」已经出现推进信号，适合直接收敛到下一步。`
      : `客户围绕「${topic.name}」仍有顾虑，先用温和话术建立信任更稳。`,
  };
}
