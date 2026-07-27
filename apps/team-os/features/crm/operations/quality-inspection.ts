import type {
  DeterministicQualityInspection
} from "@/apps/team-os/features/crm/operations/types";

const NEED_KEYWORDS = [
  "需求",
  "需要",
  "希望",
  "目标",
  "痛点",
  "预算",
  "采购",
  "计划",
  "场景",
  "问题"
];

const OBJECTION_KEYWORDS = [
  "但是",
  "担心",
  "太贵",
  "价格高",
  "再考虑",
  "不确定",
  "有风险",
  "没时间",
  "暂时不",
  "不需要",
  "不合适"
];

const OBJECTION_RESPONSE_KEYWORDS = [
  "理解",
  "方案",
  "建议",
  "可以",
  "因为",
  "针对",
  "解决",
  "验证"
];

const NEXT_STEP_KEYWORDS = [
  "下一步",
  "稍后",
  "明天",
  "下周",
  "回访",
  "安排",
  "发送",
  "报价",
  "签约",
  "跟进",
  "确认时间"
];

const PRICE_KEYWORDS = [
  "报价",
  "价格",
  "优惠",
  "折扣",
  "多少钱",
  "预算",
  "费用"
];

const SENSITIVE_KEYWORDS = [
  "保证效果",
  "绝对",
  "百分百",
  "稳赚",
  "回扣",
  "私下转账",
  "贿赂",
  "虚开发票",
  "绕过审批"
];

function matchedKeywords(text: string, keywords: readonly string[]) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function uniqueLinesContaining(text: string, keywords: readonly string[]) {
  const lines = text
    .split(/[\r\n。！？!?]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return Array.from(new Set(lines.filter((line) => keywords.some((keyword) => line.includes(keyword)))))
    .slice(0, 12);
}

function questionLines(text: string) {
  return Array.from(new Set(
    text
      .split(/[\r\n。！？!?]+/)
      .map((line) => line.trim())
      .filter((line) => (
        /[？?]/.test(line) ||
        /(是否|什么|多少|怎么|如何|为何|为什么|哪一|有没有|能否|可以吗)/.test(line)
      ))
  )).slice(0, 12);
}

export function inspectConversationDeterministically(input: {
  content: string;
  transcript: string;
  summary: string;
  durationSeconds: number;
}): DeterministicQualityInspection {
  const text = [input.content, input.transcript, input.summary].filter(Boolean).join("\n");
  const needMatches = matchedKeywords(text, NEED_KEYWORDS);
  const objections = uniqueLinesContaining(text, OBJECTION_KEYWORDS);
  const priceRequests = uniqueLinesContaining(text, PRICE_KEYWORDS);
  const sensitiveWords = matchedKeywords(text, SENSITIVE_KEYWORDS);
  const questions = questionLines(text);
  const nextStepMatches = matchedKeywords(text, NEXT_STEP_KEYWORDS);
  const objectionResponseMatches = matchedKeywords(text, OBJECTION_RESPONSE_KEYWORDS);

  const needScore = Math.min(20, needMatches.length * 5);
  const questionScore = Math.min(20, questions.length * 7);
  const objectionScore = objections.length === 0
    ? 20
    : Math.min(20, objectionResponseMatches.length * 7);
  const nextStepScore = Math.min(20, nextStepMatches.length * 7);
  const complianceScore = Math.max(0, 20 - sensitiveWords.length * 8);
  const score = Math.max(
    0,
    Math.min(100, needScore + questionScore + objectionScore + nextStepScore + complianceScore)
  );

  const issues: DeterministicQualityInspection["issues"] = [];
  const suggestions: string[] = [];
  if (needScore < 10) {
    issues.push({ code: "NEEDS_NOT_CLEAR", message: "客户需求和业务场景识别不足。", severity: "MEDIUM" });
    suggestions.push("补问客户当前场景、目标、痛点、预算和采购时间。");
  }
  if (questionScore < 10) {
    issues.push({ code: "KEY_QUESTIONS_MISSING", message: "关键问题数量不足。", severity: "MEDIUM" });
    suggestions.push("使用开放式问题确认决策链、预算、时间表和成功标准。");
  }
  if (objections.length > 0 && objectionResponseMatches.length === 0) {
    issues.push({ code: "OBJECTION_UNHANDLED", message: "检测到异议，但未识别到明确回应。", severity: "HIGH" });
    suggestions.push("先复述并确认客户异议，再给出针对性的证据与下一步验证方案。");
  }
  if (nextStepScore === 0) {
    issues.push({ code: "NEXT_STEP_MISSING", message: "未约定明确的下一步行动。", severity: "HIGH" });
    suggestions.push("结束沟通前明确责任人、下一步动作和完成时间。");
  }
  if (sensitiveWords.length > 0) {
    issues.push({ code: "SENSITIVE_WORDS", message: "沟通中出现高风险或不当承诺词。", severity: "HIGH" });
    suggestions.push("删除绝对化承诺和不合规表述，并按企业审批与合规流程沟通。");
  }
  if (input.durationSeconds > 0 && input.durationSeconds < 40) {
    issues.push({ code: "CALL_TOO_SHORT", message: "通话不足 40 秒，可能未形成有效沟通。", severity: "LOW" });
    suggestions.push("补充确认客户身份、需求与下一次联系安排。");
  }

  return {
    score,
    validCall: input.durationSeconds > 0 ? input.durationSeconds >= 40 && score >= 60 : null,
    matchedRules: {
      deterministic: true,
      version: "crm-quality-v1",
      dimensions: {
        needs: { score: needScore, matches: needMatches },
        keyQuestions: { score: questionScore, count: questions.length },
        objections: {
          score: objectionScore,
          objectionCount: objections.length,
          responseMatches: objectionResponseMatches
        },
        nextStep: { score: nextStepScore, matches: nextStepMatches },
        compliance: { score: complianceScore, matches: sensitiveWords }
      }
    },
    needs: uniqueLinesContaining(text, NEED_KEYWORDS),
    objections,
    priceRequests,
    sensitiveWords,
    issues,
    unresolvedQuestions: questions.slice(-3),
    suggestions
  };
}
