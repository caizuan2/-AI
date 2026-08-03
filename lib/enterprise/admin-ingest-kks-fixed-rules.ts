import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const KKS_AGENT_ID = "expert-kks";
const KKS_KNOWLEDGE_BASE_ID = "kb-kks-slim";
const KKS_RULE_RELATIVE_PATH = path.join(
  "knowledge",
  "03_AI瘦身KKS专业师",
  "AGENTS.md",
);

export type KksFixedRuleCandidate = {
  chunkId: string;
  knowledgeItemId: string;
  knowledgeBaseId: string;
  agentId: string;
  tenantId: string;
  namespace: string;
  title: string;
  content: string;
  score: number;
};

type KksFixedRuleInput = {
  tenantId: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
};

let cachedRule: Promise<string> | null = null;

export function isKksFixedRuleScope(input: KksFixedRuleInput): boolean {
  return input.agentId === KKS_AGENT_ID
    && input.knowledgeBaseId === KKS_KNOWLEDGE_BASE_ID
    && input.namespace === KKS_KNOWLEDGE_BASE_ID;
}

async function readKksFixedRule(): Promise<string> {
  if (cachedRule) {
    return cachedRule;
  }

  const absolutePath = path.resolve(process.cwd(), KKS_RULE_RELATIVE_PATH);
  cachedRule = readFile(absolutePath, "utf8")
    .then((content) => content.trim())
    .catch((error: unknown) => {
      cachedRule = null;
      throw error;
    });

  return cachedRule;
}

export async function loadKksFixedRuleCandidates(
  input: KksFixedRuleInput,
): Promise<KksFixedRuleCandidate[]> {
  if (!isKksFixedRuleScope(input)) {
    return [];
  }

  const content = await readKksFixedRule();

  if (!content) {
    return [];
  }

  return [{
    chunkId: "fixed-kks-rules:agents:1",
    knowledgeItemId: "fixed-kks-rules:agents",
    knowledgeBaseId: KKS_KNOWLEDGE_BASE_ID,
    agentId: KKS_AGENT_ID,
    tenantId: input.tenantId,
    namespace: KKS_KNOWLEDGE_BASE_ID,
    title: "AI瘦身KKS专业师固定知识库总规则",
    content,
    score: 1,
  }];
}
