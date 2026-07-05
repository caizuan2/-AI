import { buildAgentLearningState } from "@/lib/enterprise/ingest-memory-panel-service";
import { listMemoryDrafts } from "@/lib/enterprise/ingest-memory-store";
import type {
  IngestMemoryConversationMessage,
  IngestMemoryItem,
  IngestMemoryRetrieveResult
} from "@/lib/enterprise/ingest-memory-types";
import { rankMemoryCandidates, type MemoryRankCandidate } from "@/lib/enterprise/ingest-memory-ranker";
import { findMatchedMemoryFields, scoreTextSimilarity } from "@/lib/enterprise/ingest-memory-vectorizer";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function inferPreferredType(query: string): IngestMemoryItem["type"] | undefined {
  if (/话术|回复|客户说|怎么说|可复制/.test(query)) return "script";
  if (/步骤|流程|SOP|执行|清单/.test(query)) return "sop";
  if (/风险|合规|不能|禁忌|边界/.test(query)) return "risk";
  if (/问题|为什么|怎么办|如何/.test(query)) return "faq";
  if (/异议|太贵|没效果|不相信|反驳/.test(query)) return "objection";
  if (/策略|打法|路径|转化|成交/.test(query)) return "strategy";

  return undefined;
}

function buildQueryText(input: {
  query: string;
  messages?: IngestMemoryConversationMessage[];
}) {
  const recentMessages = (input.messages ?? [])
    .slice(-4)
    .map((message) => normalizeText(message.content))
    .filter(Boolean)
    .join("\n");

  return [input.query, recentMessages].filter(Boolean).join("\n");
}

function isUsableMemory(memory: IngestMemoryItem) {
  return memory.status !== "rejected" && memory.status !== ("failed" as IngestMemoryItem["status"]) && Boolean(memory.content?.trim());
}

function synthesizeLearningMemory(input: {
  agentId?: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  query: string;
  messages?: IngestMemoryConversationMessage[];
}): Promise<IngestMemoryItem | null> {
  return buildAgentLearningState({
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    ownerAdminId: input.ownerAdminId,
    ownerUserId: input.ownerUserId
  }).then((learning) => {
    if (!learning) {
      return null;
    }

    const content = [
      learning.preferredAnswerStyle,
      ...(learning.learnedTopics.length ? [`已学习主题：${learning.learnedTopics.join("、")}`] : []),
      ...(learning.riskBoundaries?.length ? [`风险边界：${learning.riskBoundaries.join("、")}`] : []),
      ...(learning.recentCorrections?.length ? [`最近修正：${learning.recentCorrections.join("、")}`] : [])
    ].filter(Boolean).join("\n");

    if (!content) {
      return null;
    }

    return {
      id: `agent-learning-${learning.agentId}-${learning.updatedAt}`,
      type: "agent_preference",
      title: "Agent 已学习回答偏好",
      content,
      summary: learning.preferredAnswerStyle,
      agentId: learning.agentId,
      knowledgeBaseId: learning.knowledgeBaseId,
      ownerAdminId: learning.ownerAdminId,
      ownerUserId: learning.ownerUserId,
      tags: ["Agent学习", "回答偏好"],
      category: "Agent学习",
      confidence: 0.82,
      status: "confirmed",
      createdAt: learning.updatedAt,
      updatedAt: learning.updatedAt,
      meta: {
        source: "agent-learning-state"
      }
    } satisfies IngestMemoryItem;
  });
}

export async function retrieveRelevantMemories(input: {
  query: string;
  conversationId?: string;
  agentId?: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  messages?: IngestMemoryConversationMessage[];
  limit?: number;
  minScore?: number;
}): Promise<IngestMemoryRetrieveResult> {
  const warnings: string[] = [];
  const query = normalizeText(input.query);

  if (!query) {
    return {
      ok: true,
      query,
      memories: [],
      warnings: ["EMPTY_QUERY"]
    };
  }

  const [scopedDrafts, globalDrafts, learningMemory] = await Promise.all([
    listMemoryDrafts({
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      ownerAdminId: input.ownerAdminId,
      ownerUserId: input.ownerUserId
    }),
    input.ownerAdminId || input.ownerUserId
      ? listMemoryDrafts({
          ownerAdminId: input.ownerAdminId,
          ownerUserId: input.ownerUserId
        })
      : listMemoryDrafts(),
    synthesizeLearningMemory(input)
  ]);
  const queryText = buildQueryText({ query, messages: input.messages });
  const byId = new Map<string, IngestMemoryItem>();

  for (const memory of [...scopedDrafts, ...globalDrafts]) {
    if (isUsableMemory(memory)) {
      byId.set(memory.id, memory);
    }
  }

  if (learningMemory) {
    byId.set(learningMemory.id, learningMemory);
  }

  const candidates: MemoryRankCandidate[] = Array.from(byId.values())
    .map((memory) => {
      let similarityScore = scoreTextSimilarity(queryText, memory);

      if (input.conversationId && memory.sourceConversationId === input.conversationId) {
        similarityScore = Math.max(similarityScore, 0.28);
      }

      if (memory.agentId === input.agentId && memory.knowledgeBaseId === input.knowledgeBaseId) {
        similarityScore = Math.max(similarityScore, 0.2);
      }

      return {
        memory,
        similarityScore,
        matchedFields: findMatchedMemoryFields(queryText, memory)
      };
    });

  const memories = rankMemoryCandidates({
    query: queryText,
    candidates,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    preferredType: inferPreferredType(query),
    limit: input.limit ?? 5,
    minScore: input.minScore ?? 0.25
  });

  if (!memories.length) {
    warnings.push("NO_RELEVANT_MEMORY");
  }

  return {
    ok: true,
    query,
    memories,
    warnings
  };
}
