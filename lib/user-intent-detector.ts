export type UserIntent =
  | "cold_user"
  | "warm_user"
  | "hot_user"
  | "buyer_user"
  | "objection_user"
  | "retention_user"
  | "service_user"
  | "knowledge_user";

export type CommercialExecutionMode =
  | "educate"
  | "nurture"
  | "convert"
  | "deliver"
  | "recover"
  | "answer";

export interface CommercialExecutionMetadata {
  version: "ai-knowledge-os-v6";
  intent: UserIntent;
  mode: CommercialExecutionMode;
  stageLabel: string;
  confidence: number;
  commercialGoal: string;
  responseStrategy: string;
  recommendedMoves: string[];
  avoid: string[];
  suggestedNextStep: string;
}

interface IntentRule {
  intent: UserIntent;
  mode: CommercialExecutionMode;
  stageLabel: string;
  commercialGoal: string;
  responseStrategy: string;
  recommendedMoves: string[];
  avoid: string[];
  suggestedNextStep: string;
  patterns: RegExp[];
}

const DEFAULT_AVOID = [
  "不要夸大承诺",
  "不要绕开知识库边界",
  "不要把推测说成确定结论"
];

const INTENT_RULES: IntentRule[] = [
  {
    intent: "buyer_user",
    mode: "deliver",
    stageLabel: "已购买 / 已成交用户",
    commercialGoal: "先保障交付体验，再引导复购、续费或转介绍。",
    responseStrategy: "优先给清晰步骤、交付边界和售后确认点。",
    recommendedMoves: ["确认购买状态", "给出下一步操作", "补充服务边界", "提示后续跟进"],
    avoid: ["不要继续强推成交", "不要忽略售后问题", ...DEFAULT_AVOID],
    suggestedNextStep: "给用户一个可立即执行的交付动作，并确认是否需要人工跟进。",
    patterns: [/已买|买了|下单|付款|支付|订单|售后|发货|退款|退货|续费|复购|已经购买/]
  },
  {
    intent: "hot_user",
    mode: "convert",
    stageLabel: "高意向 / 临门一脚",
    commercialGoal: "降低决策阻力，推动明确的下一步转化动作。",
    responseStrategy: "先接住需求，再给选择建议、成交动作和风险边界。",
    recommendedMoves: ["确认预算或使用场景", "给出推荐方案", "提供成交下一步", "保留人工确认口径"],
    avoid: ["不要只解释产品", "不要给模糊下一步", ...DEFAULT_AVOID],
    suggestedNextStep: "给出一个低摩擦行动，例如预约、试用、确认方案或提交资料。",
    patterns: [/怎么买|怎么下单|马上|现在|今天|直接买|付款|价格多少|报价|套餐|报名|开通|成交|转化|签约/]
  },
  {
    intent: "objection_user",
    mode: "convert",
    stageLabel: "异议处理 / 犹豫用户",
    commercialGoal: "把异议拆成真实顾虑，推动继续沟通而不是硬性说服。",
    responseStrategy: "先承认感受，再回到价值、风险、场景和证据。",
    recommendedMoves: ["复述顾虑", "解释价值对应点", "给案例或依据", "提出低风险下一步"],
    avoid: ["不要直接反驳客户", "不要急着降价", ...DEFAULT_AVOID],
    suggestedNextStep: "追问异议来源，并给一段可复制的柔和回应话术。",
    patterns: [/太贵|贵了|不值|考虑一下|担心|不放心|怕|风险|有没有保障|对比|竞品|便宜|不相信|靠谱吗|犹豫/]
  },
  {
    intent: "warm_user",
    mode: "nurture",
    stageLabel: "中意向 / 评估用户",
    commercialGoal: "补齐认知、建立信任，并引导用户暴露真实需求。",
    responseStrategy: "给结构化说明、适用场景和判断标准。",
    recommendedMoves: ["解释核心价值", "给适用/不适用场景", "提出诊断问题", "引导继续补充背景"],
    avoid: ["不要过早成交逼单", "不要堆概念", ...DEFAULT_AVOID],
    suggestedNextStep: "问一个能判断需求成熟度的问题，再给对应建议。",
    patterns: [/了解|咨询|看看|适合|怎么用|有什么用|区别|对比|方案|流程|案例|效果|能不能|是否可以/]
  },
  {
    intent: "cold_user",
    mode: "educate",
    stageLabel: "冷启动 / 初次了解",
    commercialGoal: "先让用户听懂价值，不急于成交。",
    responseStrategy: "用低门槛语言解释问题、价值和使用场景。",
    recommendedMoves: ["先讲清是什么", "说明解决什么问题", "给简单例子", "邀请用户补充场景"],
    avoid: ["不要使用过多内部术语", "不要直接推销", ...DEFAULT_AVOID],
    suggestedNextStep: "用一句话说明价值，再给一个简单的场景示例。",
    patterns: [/第一次|不了解|新手|小白|是什么|介绍|讲一下|说明一下|怎么理解|从头讲/]
  },
  {
    intent: "retention_user",
    mode: "recover",
    stageLabel: "留存 / 挽回用户",
    commercialGoal: "先处理不满，再恢复信任和继续使用意愿。",
    responseStrategy: "先道歉或共情，再定位问题、给补救动作和跟进节点。",
    recommendedMoves: ["承认体验问题", "询问具体原因", "给补救方案", "约定跟进时间"],
    avoid: ["不要甩锅", "不要要求用户自己承担复杂排查", ...DEFAULT_AVOID],
    suggestedNextStep: "给出明确补救动作，并让用户选择是否继续沟通。",
    patterns: [/不想用了|退订|取消|投诉|差评|不满意|失望|没效果|不用了|流失|挽回/]
  },
  {
    intent: "service_user",
    mode: "deliver",
    stageLabel: "服务支持 / 问题处理",
    commercialGoal: "快速解决问题，减少摩擦，沉淀可复用服务话术。",
    responseStrategy: "按问题定位、排查步骤、处理结果和升级路径组织回答。",
    recommendedMoves: ["确认问题现象", "给排查步骤", "说明升级条件", "保留服务边界"],
    avoid: ["不要跳过诊断直接承诺结果", "不要让用户反复描述", ...DEFAULT_AVOID],
    suggestedNextStep: "先给用户一个最短排查路径，再说明何时转人工。",
    patterns: [/报错|失败|打不开|登录不了|注册不了|卡住|怎么处理|怎么办|故障|问题|无法|不能|异常/]
  }
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function scoreRule(rule: IntentRule, text: string) {
  return rule.patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function clampConfidence(value: number) {
  return Math.max(0.35, Math.min(0.95, value));
}

export function getCommercialIntentLabel(intent: UserIntent) {
  return INTENT_RULES.find((rule) => rule.intent === intent)?.stageLabel ?? "知识问答 / 资料确认";
}

export function detectUserIntent(input: string): CommercialExecutionMetadata {
  const text = normalizeText(input);
  const ranked = INTENT_RULES
    .map((rule) => ({ rule, score: scoreRule(rule, text) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0];

  if (!selected) {
    return {
      version: "ai-knowledge-os-v6",
      intent: "knowledge_user",
      mode: "answer",
      stageLabel: "知识问答 / 资料确认",
      confidence: 0.42,
      commercialGoal: "先基于知识库准确回答，再在需要时给出可执行下一步。",
      responseStrategy: "保持事实边界，优先结构化说明和引用依据。",
      recommendedMoves: ["先回答核心问题", "标明知识库依据", "提示可补充信息", "给出下一步建议"],
      avoid: DEFAULT_AVOID,
      suggestedNextStep: "如果问题涉及客户沟通，再把回答转成可复制话术。"
    };
  }

  const scoreGap = selected.score - (ranked[1]?.score ?? 0);
  const confidence = clampConfidence(0.58 + selected.score * 0.12 + scoreGap * 0.08);

  return {
    version: "ai-knowledge-os-v6",
    intent: selected.rule.intent,
    mode: selected.rule.mode,
    stageLabel: selected.rule.stageLabel,
    confidence,
    commercialGoal: selected.rule.commercialGoal,
    responseStrategy: selected.rule.responseStrategy,
    recommendedMoves: selected.rule.recommendedMoves,
    avoid: selected.rule.avoid,
    suggestedNextStep: selected.rule.suggestedNextStep
  };
}

export function formatIntentConfidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
