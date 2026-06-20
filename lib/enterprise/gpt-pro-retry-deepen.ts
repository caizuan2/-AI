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
  return [
    input.originalUserPrompt,
    "",
    "## GPT Pro 质量检查未通过，必须二次深化重写",
    "第一次回复没有达到投喂版 GPT-5.5 Pro 深度要求。请不要补几句，而是完整重写 replyMarkdown，同时保留并完善 JSON 结构。",
    "",
    "未达标原因：",
    ...input.quality.failedReasons.map((reason) => `- ${reason}`),
    "",
    "第一次回复如下，仅供你判断缺失点，不要照搬短回复：",
    limitText(input.firstReplyMarkdown, 7000),
    "",
    "重写要求：",
    "1. replyMarkdown 最低必须至少 3500 个中文字符，建议 3800 到 4600 个中文字符；不要为了短而牺牲深度。",
    "2. 必须像 ChatGPT Pro 深度分析，不像知识库后台摘要。",
    "3. 必须明确包含：大健康控体行业知识库、一线销售话术库、售后答疑库、招商会转化库、用户端调用策略、合规风控、入库优先级。",
    "4. 必须至少给 7 个真实客户问题或问答方向，并说明用户端回答策略；可以覆盖反弹、安全、高血糖/高血压/痛风、头晕心慌、腹泻便秘、老人小孩孕妇、价格异议、平台期、经期等。",
    "5. 必须从未来用户端调用倒推知识库拆分：用户提问 → 检索知识片段 → GPT 二次思考 → 自然回答。",
    "6. 必须至少包含 1 个 Markdown 表格。",
    "7. 必须至少包含 1 个引用块或使用 ↓ 的流程块，方便前端渲染为灰色可复制卡片。",
    "8. 必须明确说明：用户端不是直接背诵资料原文，而是“知识库检索 + GPT 二次思考 + 自然回答”。",
    "9. 禁止出现：OPENAI_TIMEOUT、本地预览、GPT 接口暂不可用、已收到附件、已收到投喂资料、训练价值评分、文件已加入投喂队列。",
    "10. 仍然返回同样 JSON 对象，不要 Markdown 代码围栏。",
    "11. 顶层必须包含 replyMarkdown 字段，replyMarkdown 必须是完整主回复正文，不允许只返回 title、summary、category 或 qa_pairs。"
  ].join("\n");
}
