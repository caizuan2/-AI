import "server-only";

export type GptOutputIntent =
  | "learning_summary"
  | "user_client_call_plan"
  | "knowledge_draft"
  | "talk_track"
  | "sop"
  | "follow_up"
  | "general";

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyGptOutputIntent(input: string): GptOutputIntent {
  const text = input.trim();

  if (hasAny(text, [/继续|接着|再优化|再改|上一版|前面|基于.*继续/])) {
    return "follow_up";
  }

  if (hasAny(text, [/用户端|给用户.*调用|调用逻辑|调用方案|知识库检索|RAG|二次思考|自然回答/])) {
    return "user_client_call_plan";
  }

  if (hasAny(text, [/入库|保存|知识草稿|入库草稿|标准问答|知识库草稿|可保存/])) {
    return "knowledge_draft";
  }

  if (hasAny(text, [/SOP|流程|步骤|处理链路|处理流程|操作规范/])) {
    return "sop";
  }

  if (hasAny(text, [/话术|销售|客服|售后|招商|转化|异议|客户问答/])) {
    return "talk_track";
  }

  if (hasAny(text, [/学习|总结|优化|提炼|梳理|归纳|分析文件|整理资料/])) {
    return "learning_summary";
  }

  return "general";
}

export function describeGptOutputIntent(intent: GptOutputIntent) {
  switch (intent) {
    case "learning_summary":
      return "学习总结";
    case "user_client_call_plan":
      return "用户端调用方案";
    case "knowledge_draft":
      return "入库草稿";
    case "talk_track":
      return "话术生成";
    case "sop":
      return "SOP 流程";
    case "follow_up":
      return "继续优化";
    default:
      return "自由问答";
  }
}
