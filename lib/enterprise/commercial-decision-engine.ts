export type CommercialUserType = "learner" | "buyer" | "enterprise" | "operator";
export type CommercialIntent = "learn" | "compare" | "evaluate" | "purchase" | "operate" | "train" | "support";
export type CommercialScenario = "education" | "pre_sales" | "closing" | "after_sales" | "training" | "operation";
export type CommercialOutputMode = "explain" | "compare" | "guide" | "sales_script" | "training" | "sop";

export interface CommercialIntentAnalysis {
  primaryIntent: CommercialIntent;
  commercialIntentScore: number;
  urgency: "low" | "medium" | "high";
  wantsSalesScript: boolean;
  wantsDecisionSupport: boolean;
  keywords: string[];
}

export interface CommercialScenarioDetection {
  scenario: CommercialScenario;
  confidence: number;
  evidence: string[];
}

export interface CommercialRagDecision {
  shouldRetrieve: boolean;
  queryFocus: string[];
  retrievalPriority: "commercial_value" | "proof" | "faq" | "sop" | "risk_boundary";
  recommendedTopK: number;
}

export interface CommercialOutputStrategy {
  mode: CommercialOutputMode;
  userType: CommercialUserType;
  scenario: CommercialScenario;
  objective: "educate" | "convert" | "retain" | "train" | "operate";
  tone: "professional" | "consultative" | "sales_enablement" | "training_coach";
  sections: string[];
  callToAction: string;
  ragDecision: CommercialRagDecision;
  conversionPrinciples: string[];
}

export interface CommercialDecisionContext {
  query?: string;
  user?: unknown;
  content?: string;
  category?: string;
  tags?: string[];
  commercialValue?: number;
  conversionPower?: number;
  salesDifficulty?: number;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = clean(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result.slice(0, limit);
}

function textFromContext(context: CommercialDecisionContext | string) {
  if (typeof context === "string") {
    return clean(context);
  }

  return clean([
    context.query,
    context.content,
    context.category,
    ...(context.tags ?? [])
  ].filter(Boolean).join(" "));
}

export class CommercialDecisionEngine {
  analyzeUserIntent(query: string): CommercialIntentAnalysis {
    const text = clean(query);
    const wantsSalesScript = /话术|回复|客户说|怎么说|可复制|销售|客服|异议/.test(text);
    const wantsDecisionSupport = /怎么选|是否|能不能|该不该|对比|优缺点|方案|决策|判断/.test(text);
    const purchaseSignals = /买|购买|下单|价格|贵|便宜|成交|转化|促单|报价/.test(text);
    const trainSignals = /培训|训练|课程|新人|演练|考核/.test(text);
    const operateSignals = /运营|投喂|入库|SOP|流程|执行|增长|复用|分发/.test(text);
    const supportSignals = /售后|退款|投诉|没效果|风险|禁忌|过期/.test(text);
    const compareSignals = /对比|区别|优缺点|哪个好|差异/.test(text);
    const commercialIntentScore = clamp01(
      0.2
      + (wantsSalesScript ? 0.18 : 0)
      + (wantsDecisionSupport ? 0.12 : 0)
      + (purchaseSignals ? 0.22 : 0)
      + (trainSignals ? 0.12 : 0)
      + (operateSignals ? 0.12 : 0)
      + (supportSignals ? 0.1 : 0)
    );
    const primaryIntent: CommercialIntent = trainSignals
      ? "train"
      : operateSignals
        ? "operate"
        : supportSignals
          ? "support"
          : purchaseSignals
            ? "purchase"
            : compareSignals
              ? "compare"
              : wantsDecisionSupport
                ? "evaluate"
                : "learn";

    return {
      primaryIntent,
      commercialIntentScore,
      urgency: /马上|立刻|现在|尽快|急|卡住|投诉/.test(text) ? "high" : commercialIntentScore >= 0.62 ? "medium" : "low",
      wantsSalesScript,
      wantsDecisionSupport,
      keywords: uniqueStrings(text.match(/[\u3400-\u9fffa-zA-Z0-9]{2,}/g) ?? [], 10)
    };
  }

  classifyUserType(user: unknown): CommercialUserType {
    const text = typeof user === "string"
      ? user
      : user && typeof user === "object"
        ? JSON.stringify(user)
        : "";

    if (/企业|团队|老板|公司|渠道|招商|代理|门店|B端/.test(text)) {
      return "enterprise";
    }

    if (/运营|管理员|投喂|知识库|客服主管|销售主管|培训/.test(text)) {
      return "operator";
    }

    if (/客户|顾客|购买|买家|价格|成交|意向/.test(text)) {
      return "buyer";
    }

    return "learner";
  }

  detectScenario(context: CommercialDecisionContext | string): CommercialScenarioDetection {
    const text = textFromContext(context);
    const evidence: string[] = [];

    if (/成交|转化|下单|报价|价格|异议|促单|客户说|客户担心/.test(text)) {
      evidence.push("成交或异议信号");
      return { scenario: "closing", confidence: 0.82, evidence };
    }

    if (/话术|回复|咨询|需求|卖点|价值/.test(text)) {
      evidence.push("售前沟通信号");
      return { scenario: "pre_sales", confidence: 0.72, evidence };
    }

    if (/售后|退款|投诉|没效果|风险|反弹|禁忌/.test(text)) {
      evidence.push("售后风险信号");
      return { scenario: "after_sales", confidence: 0.74, evidence };
    }

    if (/培训|训练|课程|新人|演练|考核/.test(text)) {
      evidence.push("销售训练信号");
      return { scenario: "training", confidence: 0.76, evidence };
    }

    if (/运营|入库|投喂|SOP|流程|复用|分发|增长/.test(text)) {
      evidence.push("运营执行信号");
      return { scenario: "operation", confidence: 0.7, evidence };
    }

    return { scenario: "education", confidence: 0.58, evidence: ["默认学习理解场景"] };
  }

  decideOutputStrategy(context: CommercialDecisionContext): CommercialOutputStrategy {
    const text = textFromContext(context);
    const intent = this.analyzeUserIntent(text);
    const userType = this.classifyUserType(context.user ?? `${context.category ?? ""} ${(context.tags ?? []).join(" ")}`);
    const scenario = this.detectScenario(context).scenario;
    const mode: CommercialOutputMode = scenario === "closing" || intent.wantsSalesScript
      ? "sales_script"
      : scenario === "training" || intent.primaryIntent === "train"
        ? "training"
        : scenario === "operation" || intent.primaryIntent === "operate"
          ? "sop"
          : intent.primaryIntent === "compare"
            ? "compare"
            : intent.wantsDecisionSupport
              ? "guide"
              : "explain";
    const objective = mode === "sales_script"
      ? "convert"
      : mode === "training"
        ? "train"
        : mode === "sop"
          ? "operate"
          : scenario === "after_sales"
            ? "retain"
            : "educate";

    return {
      mode,
      userType,
      scenario,
      objective,
      tone: mode === "sales_script"
        ? "sales_enablement"
        : mode === "training"
          ? "training_coach"
          : userType === "buyer"
            ? "consultative"
            : "professional",
      sections: this.chooseSections(mode, scenario),
      callToAction: this.chooseCallToAction(mode, scenario),
      ragDecision: this.buildRagDecision(text, mode, scenario, context),
      conversionPrinciples: this.buildConversionPrinciples(mode, scenario, context)
    };
  }

  optimizeForConversion(response: string, context: CommercialDecisionContext = {}) {
    const strategy = this.decideOutputStrategy({ ...context, content: `${context.content ?? ""} ${response}` });
    const trimmed = clean(response);
    const needsCustomerScript = strategy.mode === "sales_script" && !/可复制给客户|客户话术|标准回复/.test(trimmed);
    const optimizedResponse = needsCustomerScript
      ? `${trimmed}\n\n## 可复制给客户\n您这个问题可以先不用着急做决定，我们先确认您的真实情况和主要顾虑，再给您一个更适合的方案。`
      : trimmed;

    return {
      optimizedResponse,
      strategy,
      improvements: uniqueStrings([
        strategy.mode === "sales_script" ? "补充客户可复制话术" : null,
        strategy.ragDecision.shouldRetrieve ? `优先检索：${strategy.ragDecision.queryFocus.join(" / ")}` : null,
        strategy.objective === "convert" ? "输出要落到下一步行动" : null
      ], 5)
    };
  }

  private chooseSections(mode: CommercialOutputMode, scenario: CommercialScenario) {
    if (mode === "sales_script") {
      return ["判断", "回复思路", "可复制给客户", "跟进动作"];
    }

    if (mode === "training") {
      return ["训练目标", "关键话术", "演练步骤", "考核要点"];
    }

    if (mode === "sop") {
      return ["结论", "操作步骤", "注意事项", "复盘指标"];
    }

    if (mode === "compare") {
      return ["核心结论", "对比分析", "适用场景", "建议选择"];
    }

    if (scenario === "after_sales") {
      return ["判断", "安抚说明", "处理边界", "下一步"];
    }

    return ["核心结论", "关键分析", "建议动作"];
  }

  private chooseCallToAction(mode: CommercialOutputMode, scenario: CommercialScenario) {
    if (mode === "sales_script" || scenario === "closing") {
      return "确认客户顾虑后推进到体验、评估或下单下一步。";
    }

    if (mode === "training") {
      return "把知识转成演练脚本并做销售复盘。";
    }

    if (mode === "sop") {
      return "按步骤执行，并把结果回填为可复用知识。";
    }

    return "先补齐关键信息，再决定是否转成销售或运营资产。";
  }

  private buildRagDecision(
    text: string,
    mode: CommercialOutputMode,
    scenario: CommercialScenario,
    context: CommercialDecisionContext
  ): CommercialRagDecision {
    const queryFocus = uniqueStrings([
      context.category,
      ...(context.tags ?? []),
      mode === "sales_script" ? "客户异议" : null,
      scenario === "closing" ? "成交话术" : null,
      scenario === "after_sales" ? "售后边界" : null,
      /案例|证明|检测|数据/.test(text) ? "证明材料" : null,
      /步骤|流程|SOP/.test(text) ? "执行步骤" : null
    ], 8);

    return {
      shouldRetrieve: queryFocus.length > 0 || text.length >= 80,
      queryFocus: queryFocus.length > 0 ? queryFocus : ["核心知识", "客户场景"],
      retrievalPriority: scenario === "closing"
        ? "commercial_value"
        : scenario === "after_sales"
          ? "risk_boundary"
          : mode === "sop"
            ? "sop"
            : /案例|证明|检测|数据/.test(text)
              ? "proof"
              : "faq",
      recommendedTopK: mode === "sales_script" || scenario === "closing" ? 6 : 4
    };
  }

  private buildConversionPrinciples(
    mode: CommercialOutputMode,
    scenario: CommercialScenario,
    context: CommercialDecisionContext
  ) {
    return uniqueStrings([
      "先理解客户真实目标，再输出建议。",
      mode === "sales_script" ? "话术必须可复制、自然、不夸大承诺。" : null,
      scenario === "closing" ? "每次回答都要承接到明确下一步。" : null,
      scenario === "after_sales" ? "先安抚，再给边界和处理路径。" : null,
      (context.salesDifficulty ?? 0) >= 0.66 ? "高风险问题必须优先说明适用边界。" : null,
      (context.commercialValue ?? 0) >= 0.68 ? "高价值知识应沉淀为销售训练资产。" : null
    ], 6);
  }
}