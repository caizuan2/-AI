import type {
  IngestAgentLearningState,
  IngestMemoryConversationMessage,
  IngestMemoryItem
} from "@/lib/enterprise/ingest-memory-types";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractCorrections(messages: IngestMemoryConversationMessage[]) {
  return unique(messages
    .filter((message) => message.role === "user")
    .map((message) => message.content ?? "")
    .filter((content) => /不是|不对|应该|改成|方向|不要|记住/.test(content))
    .map((content) => content.replace(/\s+/g, " ").slice(0, 80))
  ).slice(0, 6);
}

export function updateAgentLearningFromConversation(input: {
  agentId?: string;
  knowledgeBaseId?: string;
  messages: IngestMemoryConversationMessage[];
  extractedMemories: IngestMemoryItem[];
  userFeedback?: Array<{ rating?: string; note?: string }>;
  savedKnowledge?: boolean;
}): IngestAgentLearningState {
  const learnedTopics = unique(input.extractedMemories.flatMap((memory) => [
    memory.category ?? "",
    memory.title,
    ...(memory.tags ?? [])
  ])).slice(0, 10);
  const riskBoundaries = unique(input.extractedMemories
    .filter((memory) => memory.type === "risk")
    .map((memory) => memory.summary ?? memory.title)
  ).slice(0, 6);
  const recentCorrections = extractCorrections(input.messages);
  const hasScript = input.extractedMemories.some((memory) => memory.type === "script" || memory.tags?.includes("话术"));
  const hasSop = input.extractedMemories.some((memory) => memory.type === "sop");

  return {
    agentId: input.agentId ?? "default-agent",
    knowledgeBaseId: input.knowledgeBaseId,
    learnedTopics,
    preferredAnswerStyle: hasScript
      ? "偏好自然可复制的话术表达，先给判断，再给可执行说法。"
      : hasSop
        ? "偏好步骤清楚、短段落、可直接照做的 SOP。"
        : "偏好 ChatGPT 式自然解释，短段落、结论优先。",
    riskBoundaries,
    recentCorrections,
    updatedAt: Date.now()
  };
}
