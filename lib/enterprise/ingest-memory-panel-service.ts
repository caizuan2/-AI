import { createMemoryMergePlan, findSimilarMemoryDrafts } from "@/lib/enterprise/ingest-memory-draft-merger";
import { updateAgentLearningFromConversation } from "@/lib/enterprise/ingest-agent-learning-loop";
import {
  canonicalizeCareerMemoryDraft,
  createCareerMemoryDraftDedupKey,
  resolveCareerMemoryScope
} from "@/lib/enterprise/ingest-memory-career-scope";
import {
  appendAgentLearningEvent,
  listMemoryDrafts,
  loadAgentLearningEvents,
  saveMemoryDraft
} from "@/lib/enterprise/ingest-memory-store";
import type {
  IngestAgentLearningEvent,
  IngestAgentLearningState,
  IngestMemoryExtractionInput,
  IngestMemoryExtractionResult,
  IngestMemoryItem,
  IngestMemoryPanelSummary
} from "@/lib/enterprise/ingest-memory-types";

let careerMemoryPersistenceQueue: Promise<void> = Promise.resolve();

async function persistMemoryExtractionInternal(input: {
  extraction: IngestMemoryExtractionResult;
  source: IngestMemoryExtractionInput;
}, careerScope: NonNullable<ReturnType<typeof resolveCareerMemoryScope>> | null) {
  const savedDrafts: IngestMemoryItem[] = [];
  const existingDedupKeys = careerScope
    ? new Set((await listMemoryDrafts({
        agentId: careerScope.agentId,
        knowledgeBaseId: careerScope.knowledgeBaseId,
        ownerAdminId: input.source.ownerAdminId,
        ownerUserId: input.source.ownerUserId
      }))
        .map(createCareerMemoryDraftDedupKey)
        .filter((key): key is string => Boolean(key)))
    : null;

  for (const draft of input.extraction.draftCandidates) {
    const nextDraft = careerScope ? canonicalizeCareerMemoryDraft(draft) : draft;
    const dedupKey = careerScope ? createCareerMemoryDraftDedupKey(nextDraft) : null;

    if (dedupKey && existingDedupKeys?.has(dedupKey)) {
      continue;
    }

    savedDrafts.push(await saveMemoryDraft(nextDraft));

    if (dedupKey) {
      existingDedupKeys?.add(dedupKey);
    }
  }

  const learningState = updateAgentLearningFromConversation({
    agentId: input.source.agentId,
    knowledgeBaseId: input.source.knowledgeBaseId,
    messages: input.source.messages,
    extractedMemories: input.extraction.memories,
    savedKnowledge: input.source.saveIntent
  });
  const event: IngestAgentLearningEvent = {
    id: `learn-${input.source.conversationId}-${Date.now()}`,
    agentId: learningState.agentId,
    knowledgeBaseId: learningState.knowledgeBaseId,
    ownerAdminId: input.source.ownerAdminId,
    ownerUserId: input.source.ownerUserId,
    conversationId: input.source.conversationId,
    summary: input.extraction.learningSummary ?? "本轮形成训练记忆摘要。",
    topics: learningState.learnedTopics,
    riskBoundaries: learningState.riskBoundaries ?? [],
    corrections: learningState.recentCorrections ?? [],
    createdAt: Date.now(),
    source: "admin-ingest-memory-layer-v1"
  };

  if (!careerScope || savedDrafts.length > 0) {
    await appendAgentLearningEvent(event);
  }

  return {
    savedDrafts,
    learningState
  };
}

export async function persistMemoryExtraction(input: {
  extraction: IngestMemoryExtractionResult;
  source: IngestMemoryExtractionInput;
}) {
  const careerScope = resolveCareerMemoryScope(input.source);

  if (!careerScope) {
    return persistMemoryExtractionInternal(input, null);
  }

  const persistence = careerMemoryPersistenceQueue.then(() => (
    persistMemoryExtractionInternal(input, careerScope)
  ));
  careerMemoryPersistenceQueue = persistence.then(
    () => undefined,
    () => undefined
  );

  return persistence;
}

export async function buildAgentLearningState(input: {
  agentId?: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  includeLegacyUnowned?: boolean;
} = {}): Promise<IngestAgentLearningState | null> {
  const events = await loadAgentLearningEvents(input);
  const first = events[0];

  if (!first) {
    return null;
  }

  return {
    agentId: first.agentId,
    knowledgeBaseId: first.knowledgeBaseId,
    ownerAdminId: first.ownerAdminId,
    ownerUserId: first.ownerUserId,
    learnedTopics: Array.from(new Set(events.flatMap((event) => event.topics))).slice(0, 12),
    preferredAnswerStyle: "根据近期投喂，优先保持自然短段落、可执行话术和风险边界提示。",
    riskBoundaries: Array.from(new Set(events.flatMap((event) => event.riskBoundaries))).slice(0, 8),
    recentCorrections: Array.from(new Set(events.flatMap((event) => event.corrections))).slice(0, 8),
    updatedAt: first.createdAt
  };
}

export async function buildMemoryPanelSummary(input: {
  agentId?: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  includeLegacyUnowned?: boolean;
} = {}): Promise<IngestMemoryPanelSummary> {
  const drafts = await listMemoryDrafts(input);
  const agentLearning = await buildAgentLearningState(input);
  const mergeSuggestions = drafts
    .slice(0, 6)
    .flatMap((draft) => {
      const similar = findSimilarMemoryDrafts({ candidate: draft, drafts }).map((item) => item.draft);

      return similar.length > 0 ? [createMemoryMergePlan({ items: [draft, ...similar.slice(0, 2)] })] : [];
    })
    .slice(0, 4);
  const recentTopics = Array.from(new Set([
    ...(agentLearning?.learnedTopics ?? []),
    ...drafts.flatMap((draft) => draft.tags ?? []),
    ...drafts.map((draft) => draft.category ?? "")
  ].filter(Boolean))).slice(0, 12);

  return {
    ok: true,
    ownerAdminId: input.ownerAdminId ?? input.ownerUserId,
    includesLegacyUnowned: Boolean(input.ownerAdminId || input.ownerUserId),
    memoryCount: drafts.length,
    draftCount: drafts.filter((draft) => draft.status === "draft").length,
    recentTopics,
    memories: drafts.slice(0, 20),
    draftCandidates: drafts.filter((draft) => draft.status === "draft").slice(0, 20),
    agentLearning,
    mergeSuggestions
  };
}
