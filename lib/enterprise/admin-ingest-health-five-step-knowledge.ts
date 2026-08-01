import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const HEALTH_AGENT_ID = "expert-health";
const HEALTH_KNOWLEDGE_BASE_ID = "kb-health-expert";
const RULE_DIRECTORY = path.join("knowledge", "01_同行沟通五步法");
const MAX_RULE_CHUNK_CHARS = 3_200;

export type HealthFiveStepStage = "STEP1" | "STEP2" | "STEP3" | "STEP4" | "STEP5";

export type HealthFiveStepRuleCandidate = {
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

type HealthFiveStepRuleInput = {
  query: string;
  tenantId: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
};

const STEP_FILES: Record<HealthFiveStepStage, { fileName: string; title: string }> = {
  STEP1: {
    fileName: "STEP1_破冰卖自己规则.md",
    title: "同行沟通五步法 第一步 破冰卖自己规则",
  },
  STEP2: {
    fileName: "STEP2_找需求挖危机规则.md",
    title: "同行沟通五步法 第二步 找需求挖危机规则",
  },
  STEP3: {
    fileName: "STEP3_讲系统价值规则.md",
    title: "同行沟通五步法 第三步 讲系统价值规则",
  },
  STEP4: {
    fileName: "STEP4_锁定问题解决问题规则.md",
    title: "同行沟通五步法 第四步 锁定问题解决问题规则",
  },
  STEP5: {
    fileName: "STEP5_成交规则.md",
    title: "同行沟通五步法 第五步 成交规则",
  },
};

const fileCache = new Map<string, Promise<string>>();

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHealthExpertScope(input: HealthFiveStepRuleInput): boolean {
  return clean(input.agentId).toLowerCase() === HEALTH_AGENT_ID
    && clean(input.knowledgeBaseId).toLowerCase() === HEALTH_KNOWLEDGE_BASE_ID
    && clean(input.namespace).toLowerCase() === HEALTH_KNOWLEDGE_BASE_ID;
}

function normalizeRuleQuery(query: string): string {
  return clean(query)
    .replace(/\u0000/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function countMatches(query: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(query) ? 1 : 0), 0);
}

export function resolveHealthFiveStepStage(query: string): HealthFiveStepStage | null {
  const normalized = normalizeRuleQuery(query);

  if (!normalized) {
    return null;
  }

  const scores: Record<HealthFiveStepStage, number> = {
    STEP1: countMatches(normalized, [
      /破冰|刚加|新好友|刚认识|第一次聊|怎么开场|开场白|群里认识|不熟|防备|朋友圈/,
    ]),
    STEP2: countMatches(normalized, [
      /找需求|挖需求|危机|痛点|瓶颈|人脉|团队不好带|新人|培训|复制|投入产出|现状|为什么做|线上还是线下/,
    ]),
    STEP3: countMatches(normalized, [
      /讲系统|系统价值|解决方案|怎么介绍|如何介绍|ai获客|ai培训|沟通助手|团队管理|素材库|现场演示|有什么方法/,
    ]),
    STEP4: countMatches(normalized, [
      /太贵|没钱|考虑一下|再考虑|商量|家人|反对|没效果|怕做不好|免费体验|比较一下|再观察|不确定|异议|顾虑|担心|质疑/,
    ]),
    STEP5: countMatches(normalized, [
      /成交|收网|怎么加入|如何加入|怎么开始|什么时候开始|付款|支付|微信还是支付宝|下单|报名|我试试|启动客户/,
    ]),
  };
  const priority: HealthFiveStepStage[] = ["STEP5", "STEP4", "STEP3", "STEP2", "STEP1"];
  let selected: HealthFiveStepStage | null = null;
  let selectedScore = 0;

  for (const stage of priority) {
    if (scores[stage] > selectedScore) {
      selected = stage;
      selectedScore = scores[stage];
    }
  }

  return selectedScore > 0 ? selected : null;
}

export function isHealthPeerCommunicationQuery(query: string): boolean {
  const normalized = normalizeRuleQuery(query);

  return /同行|客户|微信|聊天|沟通|话术|怎么回|回复|好友|团队|市场|平台|系统|人脉|新人|成交|异议|顾虑/.test(normalized);
}

function readRuleFile(fileName: string): Promise<string> {
  const absolutePath = path.resolve(process.cwd(), RULE_DIRECTORY, fileName);
  const cached = fileCache.get(absolutePath);

  if (cached) {
    return cached;
  }

  const pending = readFile(absolutePath, "utf8")
    .then((content) => content.trim())
    .catch((error: unknown) => {
      fileCache.delete(absolutePath);
      throw error;
    });
  fileCache.set(absolutePath, pending);
  return pending;
}

function appendBoundedBlock(chunks: string[], block: string): void {
  let remaining = block.trim();

  while (remaining.length > MAX_RULE_CHUNK_CHARS) {
    let splitAt = remaining.lastIndexOf("\n", MAX_RULE_CHUNK_CHARS);

    if (splitAt < Math.floor(MAX_RULE_CHUNK_CHARS * 0.6)) {
      splitAt = MAX_RULE_CHUNK_CHARS;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }
}

function chunkRuleMarkdown(content: string): string[] {
  const chunks: string[] = [];
  const sections = content.split(/\n(?=#{1,3}\s)/g);
  let current = "";

  for (const section of sections) {
    const next = current ? `${current}\n${section}` : section;

    if (next.length <= MAX_RULE_CHUNK_CHARS) {
      current = next;
      continue;
    }

    if (current) {
      appendBoundedBlock(chunks, current);
    }

    current = section;
  }

  if (current) {
    appendBoundedBlock(chunks, current);
  }

  return chunks.filter(Boolean);
}

function toRuleCandidates(input: {
  content: string;
  fileName: string;
  title: string;
  tenantId: string;
}): HealthFiveStepRuleCandidate[] {
  const stableId = input.fileName.replace(/\.md$/i, "").replace(/[^a-z0-9一-龥_-]+/gi, "-");

  return chunkRuleMarkdown(input.content).map((content, index) => ({
    chunkId: `fixed-health-five-step:${stableId}:${index + 1}`,
    knowledgeItemId: `fixed-health-five-step:${stableId}`,
    knowledgeBaseId: HEALTH_KNOWLEDGE_BASE_ID,
    agentId: HEALTH_AGENT_ID,
    tenantId: input.tenantId,
    namespace: HEALTH_KNOWLEDGE_BASE_ID,
    title: `${input.title}（${index + 1}）`,
    content,
    score: 1,
  }));
}

export async function loadHealthFiveStepRuleCandidates(
  input: HealthFiveStepRuleInput,
): Promise<HealthFiveStepRuleCandidate[]> {
  if (!isHealthExpertScope(input)) {
    return [];
  }

  const selectedStage = resolveHealthFiveStepStage(input.query);

  if (!selectedStage && !isHealthPeerCommunicationQuery(input.query)) {
    return [];
  }

  const selectedRule = selectedStage ? STEP_FILES[selectedStage] : null;
  const requestedFiles = [{
    fileName: "AGENTS.md",
    title: "AI大健康专家同行沟通五步法总规则",
  }, ...(selectedRule ? [selectedRule] : [])];
  const loadedFiles = await Promise.all(requestedFiles.map(async (rule) => ({
    ...rule,
    content: await readRuleFile(rule.fileName),
  })));

  return loadedFiles.flatMap((rule) => toRuleCandidates({
    ...rule,
    tenantId: input.tenantId,
  }));
}
