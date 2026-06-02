import { prisma } from "@/lib/prisma-client";
import type { KnowledgeCompletionSuggestion } from "@/lib/ai/knowledge-completion-core";
import { AIError } from "@/lib/errors";
import {
  isLowQualityKnowledge,
  type KnowledgeQualityScores
} from "@/lib/knowledge/quality";
import { hasUsableOpenAIKey, isAIFallbackAllowed } from "@/lib/server-config-core";

export type CompletionSuggestionMode = "ai" | "local";

export type KnowledgeForCompletionSuggestions = KnowledgeQualityScores & {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  category: string;
  importance: number;
};

export interface CompletionSuggestionsResult {
  suggestions: KnowledgeCompletionSuggestion[];
  mode: CompletionSuggestionMode;
  model: string | null;
}

export interface CompletionSuggestionsOptions {
  requestId?: string;
  userId?: string;
}

type StoredCompletionSuggestion = {
  id: string;
  title: string;
  detail: string;
  question: string;
  priority: number;
};

function serializeStoredSuggestion(suggestion: StoredCompletionSuggestion): KnowledgeCompletionSuggestion {
  return {
    id: suggestion.id,
    title: suggestion.title,
    detail: suggestion.detail,
    question: suggestion.question,
    priority: suggestion.priority
  };
}

export function buildLocalCompletionSuggestions(
  item: KnowledgeForCompletionSuggestions
): KnowledgeCompletionSuggestion[] {
  const suggestions: KnowledgeCompletionSuggestion[] = [];

  if (item.completenessScore < 4) {
    suggestions.push({
      id: "missing-context",
      title: "补充背景和适用场景",
      detail: "说明这条知识适用于什么业务场景、对象和前提条件。",
      question: "这条知识适用于哪些具体场景？有哪些前提条件或适用对象？",
      priority: 1
    });
  }

  if (item.confidenceScore < 4 || !/来源|依据|文档|会议|数据|客户|用户/.test(item.content)) {
    suggestions.push({
      id: "missing-evidence",
      title: "补充来源依据",
      detail: "补充这条知识来自哪里，以及是否有数据、文档或会议结论支撑。",
      question: "这条知识的来源是什么？有没有文档、数据、会议结论或客户反馈可以作为依据？",
      priority: 2
    });
  }

  if (item.clarityScore < 4) {
    suggestions.push({
      id: "clarify-terms",
      title: "澄清关键术语和结论",
      detail: "把容易产生歧义的术语、判断标准和最终结论说清楚。",
      question: "这条知识里有哪些关键术语、判断标准或结论需要进一步澄清？",
      priority: 3
    });
  }

  if (item.usefulnessScore < 4 || !/步骤|流程|需要|如果|则|建议|操作/.test(item.content)) {
    suggestions.push({
      id: "add-actions",
      title: "补充可执行步骤",
      detail: "补充遇到该情况时应该怎么做、由谁负责、下一步动作是什么。",
      question: "遇到这类情况时，具体应该按哪些步骤执行？谁负责？下一步动作是什么？",
      priority: 4
    });
  }

  suggestions.push({
    id: "add-boundaries",
    title: "补充例外和边界",
    detail: "说明哪些情况不适用，以及遇到例外时如何处理。",
    question: "这条知识有哪些不适用的情况、例外条件或边界？遇到例外时应该如何处理？",
    priority: 5
  });

  suggestions.push({
    id: "add-validation",
    title: "补充验证方式",
    detail: "说明未来如何判断这条知识仍然正确，或需要谁来复核。",
    question: "后续应该如何验证这条知识仍然有效？需要哪些指标、证据或负责人来复核？",
    priority: 5
  });

  if (!isLowQualityKnowledge(item)) {
    suggestions.push({
      id: "add-example",
      title: "补充示例",
      detail: "增加一个真实或抽象示例，让后续问答更容易引用。",
      question: "能否补充一个示例，说明这条知识在真实场景中如何使用？",
      priority: 5
    });
  }

  const unique = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));

  return Array.from(unique.values())
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 5);
}

export async function generateCompletionSuggestions(
  item: KnowledgeForCompletionSuggestions,
  options: CompletionSuggestionsOptions = {}
): Promise<CompletionSuggestionsResult> {
  if (hasUsableOpenAIKey()) {
    try {
      const { suggestKnowledgeCompletions } = await import("@/lib/ai/knowledge-completion-core");
      const result = await suggestKnowledgeCompletions(item, {
        requestId: options.requestId,
        userId: options.userId
      });

      return {
        suggestions: result.suggestions,
        mode: "ai",
        model: result.model
      };
    } catch (error) {
      if (!isAIFallbackAllowed()) {
        throw error;
      }
      // Keep background jobs and degraded environments useful when AI is unavailable.
    }
  } else if (!isAIFallbackAllowed()) {
    throw new AIError("生产环境必须配置真实 OPENAI_API_KEY，不能使用本地补全建议 fallback。");
  }

  return {
    suggestions: buildLocalCompletionSuggestions(item),
    mode: "local",
    model: null
  };
}

export async function refreshCompletionSuggestionsForItem(
  item: KnowledgeForCompletionSuggestions,
  options: CompletionSuggestionsOptions = {}
): Promise<CompletionSuggestionsResult> {
  const result = await generateCompletionSuggestions(item, options);

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeCompletionSuggestion.deleteMany({
      where: { knowledgeItemId: item.id }
    });

    if (result.suggestions.length === 0) {
      return;
    }

    await tx.knowledgeCompletionSuggestion.createMany({
      data: result.suggestions.map((suggestion) => ({
        knowledgeItemId: item.id,
        title: suggestion.title,
        detail: suggestion.detail,
        question: suggestion.question,
        priority: suggestion.priority,
        mode: result.mode,
        model: result.model
      }))
    });
  });

  const storedSuggestions = await prisma.knowledgeCompletionSuggestion.findMany({
    where: { knowledgeItemId: item.id },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      detail: true,
      question: true,
      priority: true
    }
  });

  return {
    suggestions: storedSuggestions.map(serializeStoredSuggestion),
    mode: result.mode,
    model: result.model
  };
}
