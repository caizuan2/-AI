import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";

export type IngestUserBehaviorSummary = {
  savedTypePreference: string[];
  preferredFormat: string;
  frequentAgents: string[];
  frequentKnowledgeBases: string[];
  feedbackTrend: "positive" | "negative" | "mixed" | "unknown";
  updatedAt: number;
};

export function summarizeIngestUserBehavior(input: {
  memories: IngestMemoryItem[];
  savedDrafts?: IngestMemoryItem[];
  feedback?: Array<{ rating?: "up" | "down" | string; agentId?: string; knowledgeBaseId?: string }>;
}): IngestUserBehaviorSummary {
  const saved = input.savedDrafts?.length ? input.savedDrafts : input.memories;
  const typeCounts = new Map<string, number>();
  const agentCounts = new Map<string, number>();
  const kbCounts = new Map<string, number>();

  for (const item of saved) {
    typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1);
    if (item.agentId) {
      agentCounts.set(item.agentId, (agentCounts.get(item.agentId) ?? 0) + 1);
    }
    if (item.knowledgeBaseId) {
      kbCounts.set(item.knowledgeBaseId, (kbCounts.get(item.knowledgeBaseId) ?? 0) + 1);
    }
  }

  const up = input.feedback?.filter((item) => item.rating === "up").length ?? 0;
  const down = input.feedback?.filter((item) => item.rating === "down").length ?? 0;

  return {
    savedTypePreference: Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]).map(([type]) => type).slice(0, 5),
    preferredFormat: typeCounts.has("script")
      ? "客户话术优先"
      : typeCounts.has("sop")
        ? "SOP步骤优先"
        : "自然解释优先",
    frequentAgents: Array.from(agentCounts.entries()).sort((a, b) => b[1] - a[1]).map(([agentId]) => agentId).slice(0, 5),
    frequentKnowledgeBases: Array.from(kbCounts.entries()).sort((a, b) => b[1] - a[1]).map(([kbId]) => kbId).slice(0, 5),
    feedbackTrend: up === 0 && down === 0 ? "unknown" : up >= down * 1.5 ? "positive" : down > up ? "negative" : "mixed",
    updatedAt: Date.now()
  };
}
