export function cleanUserFacingRagAnswer(answer: string) {
  return answer
    .replace(/^\s*引用来源[:：].*$/gim, "")
    .replace(/^\s*来源[:：].*$/gim, "")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/根据知识库(?:显示|资料|内容)?[，,：:]?\s*/g, "")
    .replace(/根据检索结果[，,：:]?\s*/g, "")
    .replace(/根据提供的上下文[，,：:]?\s*/g, "")
    .replace(/综上所述[，,。]?\s*/g, "")
    .replace(/作为(?:一个)?\s*AI[，,，。]?\s*/gi, "")
    .replace(/只找到\s*\d+\s*条相关知识[，,。；;]?\s*/g, "")
    .replace(/少于请求的\s*\d+\s*条[，,。；;]?\s*/g, "")
    .replace(/已找到\s*\d+\s*条相关(?:候选)?知识(?:，其中\s*\d+\s*条用于回答)?[，,。；;]?\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
