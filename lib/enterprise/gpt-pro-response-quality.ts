import "server-only";

import {
  classifyGptOutputIntent,
  describeGptOutputIntent,
  type GptOutputIntent
} from "@/lib/enterprise/gpt-output-intent-classifier";
import { detectFixedTemplateRisk } from "@/lib/enterprise/gpt-fixed-template-detector";

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

export interface GptProResponseQualityReport {
  ok: boolean;
  intent: GptOutputIntent;
  intentLabel: string;
  chineseCharCount: number;
  customerQuestionCount: number;
  missingSignals: string[];
  forbiddenPhrases: string[];
  failedReasons: string[];
  hasTable: boolean;
  hasCopyableBlockSignal: boolean;
  hasUserClientRetrievalLogic: boolean;
  fixedTemplateRisk: boolean;
  sectionTitles: string[];
}

export function countChineseCharacters(text: string) {
  return (text.match(/[\u3400-\u9fff]/g) ?? []).length;
}

export function countCustomerQuestions(text: string) {
  const questionMarks = text.match(/[？?]/g)?.length ?? 0;
  const explicitQuestionLines = text.match(/(?:客户|用户|顾客|代理|一线人员|售后)[^。\n]{0,36}(?:问|提问|问题|疑问)[：:]/g)?.length ?? 0;

  return Math.max(questionMarks, explicitQuestionLines);
}

function getMinChineseCharCount(intent: GptOutputIntent) {
  switch (intent) {
    case "learning_summary":
    case "user_client_call_plan":
    case "knowledge_draft":
      return 900;
    case "talk_track":
    case "sop":
      return 650;
    case "follow_up":
      return 420;
    default:
      return 360;
  }
}

function getIntentSignals(intent: GptOutputIntent): Array<{ label: string; pattern: RegExp }> {
  switch (intent) {
    case "learning_summary":
      return [
        { label: "结合资料正文或附件内容", pattern: /资料|文件|附件|正文|内容|原文|片段/ },
        { label: "总结核心逻辑或关键观点", pattern: /总结|核心|逻辑|观点|要点|抓到|提炼/ }
      ];
    case "user_client_call_plan":
      return [
        { label: "用户端检索知识库", pattern: /用户端|用户提问|客户端|前端/ },
        { label: "知识库检索 + GPT 二次思考", pattern: /(知识库检索|检索知识|检索相关知识片段|RAG)[\s\S]*(GPT|大模型|二次思考|二次推理|自然回答)|GPT[\s\S]*(检索|知识片段)[\s\S]*(自然回答|二次思考)/ }
      ];
    case "knowledge_draft":
      return [
        { label: "可保存入库草稿", pattern: /入库|保存|草稿|知识库|标准问答/ },
        { label: "分类或标签", pattern: /分类|标签|适用 Agent|适用场景/ }
      ];
    case "talk_track":
      return [
        { label: "可复制话术", pattern: /话术|可以这样|建议这样|客户.*说|销售|客服|售后|招商/ }
      ];
    case "sop":
      return [
        { label: "步骤或流程", pattern: /SOP|流程|步骤|先.*再|↓|处理链路/ }
      ];
    case "follow_up":
      return [
        { label: "基于前文继续优化", pattern: /继续|优化|上一版|前面|调整|补充|基于/ }
      ];
    default:
      return [
        { label: "直接回应当前问题", pattern: /可以|建议|核心|先|如果|这/ }
      ];
  }
}

export function assessGptProResponseQuality(
  replyMarkdown: string,
  options: {
    userInput?: string;
  } = {}
): GptProResponseQualityReport {
  const text = replyMarkdown.trim();
  const intent = classifyGptOutputIntent(options.userInput ?? "");
  const intentLabel = describeGptOutputIntent(intent);
  const templateReport = detectFixedTemplateRisk({
    userInput: options.userInput ?? "",
    replyMarkdown: text
  });
  const chineseCharCount = countChineseCharacters(text);
  const customerQuestionCount = countCustomerQuestions(text);
  const hasTable = /\|[^\n]+\|\s*\n\s*\|[-:\s|]+\|/.test(text);
  const hasCopyableBlockSignal = /(^|\n)>\s+|↓|流程[:：]|建议话术[:：]|标准话术[:：]|回答公式[:：]/.test(text);
  const hasUserClientRetrievalLogic = /用户端[^。；\n]*(不是|不能)[^。；\n]*(背诵|照搬|直接输出|原文)/.test(text)
    && /(知识库检索|检索知识|检索相关知识片段|RAG)[^。；\n]*(GPT|大模型|二次思考|二次推理|自然回答)/.test(text);
  const missingSignals = getIntentSignals(intent)
    .filter((signal) => !signal.pattern.test(text))
    .map((signal) => signal.label);
  const forbiddenPhrases = GPT_PRO_FORBIDDEN_PHRASES.filter((phrase) => text.includes(phrase));
  const minChineseCharCount = getMinChineseCharCount(intent);
  const needsCopyableSignal = intent === "user_client_call_plan" || intent === "talk_track" || intent === "sop" || intent === "knowledge_draft";
  const failedReasons = [
    chineseCharCount < minChineseCharCount ? `${intentLabel}回复深度不足，中文字符数至少 ${minChineseCharCount}，当前 ${chineseCharCount}` : "",
    missingSignals.length > 0 ? `缺少关键层次：${missingSignals.join("、")}` : "",
    needsCopyableSignal && !hasCopyableBlockSignal ? "缺少流程块、引用块或可复制话术块" : "",
    intent === "user_client_call_plan" && !hasUserClientRetrievalLogic ? "缺少“知识库检索 + GPT 二次思考 + 自然回答”的用户端调用逻辑" : "",
    templateReport.fixedTemplateRisk ? "疑似套用固定大纲，未贴合当前提示词意图" : "",
    forbiddenPhrases.length > 0 ? `包含禁用表达：${forbiddenPhrases.join("、")}` : ""
  ].filter(Boolean);

  return {
    ok: failedReasons.length === 0,
    intent,
    intentLabel,
    chineseCharCount,
    customerQuestionCount,
    missingSignals,
    forbiddenPhrases,
    failedReasons,
    hasTable,
    hasCopyableBlockSignal,
    hasUserClientRetrievalLogic,
    fixedTemplateRisk: templateReport.fixedTemplateRisk,
    sectionTitles: templateReport.sectionTitles
  };
}
