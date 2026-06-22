import "server-only";

import type { GptProResponseQualityReport } from "@/lib/enterprise/gpt-pro-response-quality";

function limitText(value: string, maxLength: number) {
  const text = value.trim();

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n...（内容过长，已截断给 GPT 二次深化）`;
}

export function buildGptProRetryDeepenPrompt(input: {
  originalUserPrompt: string;
  firstReplyMarkdown: string;
  quality: GptProResponseQualityReport;
}) {
  const intentLine = `当前用户意图：${input.quality.intentLabel}。`;

  return [
    input.originalUserPrompt,
    "",
    "## GPT Pro 动态意图质量检查未通过，必须围绕当前意图二次深化",
    intentLine,
    "第一次回复没有达到投喂版 GPT-5.5 Pro 深度要求。请不要补几句，也不要套固定大纲；请完整重写 replyMarkdown，同时保留并完善 JSON 结构。",
    "",
    "未达标原因：",
    ...input.quality.failedReasons.map((reason) => `- ${reason}`),
    "",
    "第一次回复如下，仅供你判断缺失点，不要照搬短回复：",
    limitText(input.firstReplyMarkdown, 7000),
    "",
    "重写要求：",
    "1. 优先回答管理员当前提示词，不要把所有请求都写成“总体判断 / 资料分层 / 用户端调用策略 / 入库优先级”的固定报告。",
    "2. 必须像 ChatGPT Pro 深度分析，不像知识库后台摘要。",
    "3. 如果用户意图是学习总结，就聚焦核心逻辑、关键观点、可复用知识点和缺失资料，不必强行写入库草稿。",
    "4. 如果用户意图是用户端调用方案，必须说明：用户提问 → 检索知识片段 → GPT 二次思考 → 自然回答，并给流程或示例。",
    "5. 如果用户意图是入库草稿，重点输出可保存草稿、分类、标签、适用 Agent、标准问答和合规边界。",
    "6. 如果用户意图是话术或 SOP，重点输出可复制话术、场景区分、处理步骤和风险提醒。",
    "7. 可以使用标题、表格、引用块或 ↓ 流程块，但结构必须跟随本次意图自然变化。",
    "8. 如果质量问题是 fixedTemplateRisk，请主动换一种更贴合当前提示词的结构，不要重复上一版大纲。",
    "9. 禁止出现：OPENAI_TIMEOUT、本地预览、GPT 接口暂不可用、已收到附件、已收到投喂资料、训练价值评分、文件已加入投喂队列。",
    "10. 仍然返回同样 JSON 对象，不要 Markdown 代码围栏。",
    "11. 顶层必须包含 replyMarkdown 字段，replyMarkdown 必须是完整主回复正文，不允许只返回 title、summary、category 或 qa_pairs。"
  ].join("\n");
}
