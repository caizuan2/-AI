import "server-only";

export const GPT_PRO_FORBIDDEN_PHRASES = [
  "OPENAI_TIMEOUT",
  "本地预览",
  "GPT 接口暂不可用",
  "已收到附件",
  "已收到投喂资料",
  "训练价值评分",
  "当前可沉淀的信息",
  "文件已加入投喂队列"
];

const REQUIRED_SIGNALS: Array<{ key: string; label: string; pattern: RegExp }> = [
  {
    key: "bigHealthKnowledge",
    label: "大健康控体行业知识库",
    pattern: /大健康控体行业知识库|科学控体.*知识库|体重管理.*知识体系/
  },
  {
    key: "salesTalkTrack",
    label: "一线销售话术库",
    pattern: /一线销售话术库|销售话术库|一线人员.*话术|销售.*话术/
  },
  {
    key: "afterSalesFaq",
    label: "售后答疑库",
    pattern: /售后答疑库|售后.*问答|售后.*SOP|异常反应.*处理/
  },
  {
    key: "eventConversion",
    label: "招商会转化库",
    pattern: /招商会转化库|招商会.*转化|招商.*话术|招商.*成交/
  },
  {
    key: "userClientCallPlan",
    label: "用户端调用策略",
    pattern: /用户端调用策略|用户端调用|用户提问.*检索|检索知识库.*GPT/
  },
  {
    key: "complianceRisk",
    label: "合规风控",
    pattern: /合规风控|合规.*风险|风险边界|不能.*承诺|不替代.*(医生|医疗|诊断)/
  },
  {
    key: "ingestPriority",
    label: "入库优先级",
    pattern: /入库优先级|第一批入库|第二批入库/
  }
];

export interface GptProResponseQualityReport {
  ok: boolean;
  chineseCharCount: number;
  customerQuestionCount: number;
  missingSignals: string[];
  forbiddenPhrases: string[];
  failedReasons: string[];
}

export function countChineseCharacters(text: string) {
  return (text.match(/[\u3400-\u9fff]/g) ?? []).length;
}

function countCustomerQuestions(text: string) {
  const questionMarks = text.match(/[？?]/g)?.length ?? 0;
  const explicitQuestionLines = text.match(/(?:客户|用户|顾客|代理|一线人员|售后)[^。\n]{0,36}(?:问|提问|问题|疑问)[：:]/g)?.length ?? 0;

  return Math.max(questionMarks, explicitQuestionLines);
}

export function assessGptProResponseQuality(replyMarkdown: string): GptProResponseQualityReport {
  const text = replyMarkdown.trim();
  const chineseCharCount = countChineseCharacters(text);
  const customerQuestionCount = countCustomerQuestions(text);
  const missingSignals = REQUIRED_SIGNALS
    .filter((signal) => !signal.pattern.test(text))
    .map((signal) => signal.label);
  const forbiddenPhrases = GPT_PRO_FORBIDDEN_PHRASES.filter((phrase) => text.includes(phrase));
  const failedReasons = [
    chineseCharCount < 2500 ? `中文字符数不足 2500，当前 ${chineseCharCount}` : "",
    customerQuestionCount < 5 ? `客户问题/问答方向少于 5 个，当前 ${customerQuestionCount}` : "",
    missingSignals.length > 0 ? `缺少关键层次：${missingSignals.join("、")}` : "",
    forbiddenPhrases.length > 0 ? `包含禁用表达：${forbiddenPhrases.join("、")}` : ""
  ].filter(Boolean);

  return {
    ok: failedReasons.length === 0,
    chineseCharCount,
    customerQuestionCount,
    missingSignals,
    forbiddenPhrases,
    failedReasons
  };
}
