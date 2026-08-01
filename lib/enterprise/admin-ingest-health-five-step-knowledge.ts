import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const HEALTH_AGENT_ID = "expert-health";
const HEALTH_KNOWLEDGE_BASE_ID = "kb-health-expert";
const KNOWLEDGE_DIRECTORY = "knowledge";
const FIVE_STEP_DIRECTORY = "01_同行沟通五步法";
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

type HealthRuleFile = {
  relativePath: string;
  title: string;
};

const STEP_FILES: Record<HealthFiveStepStage, HealthRuleFile> = {
  STEP1: {
    relativePath: path.join(FIVE_STEP_DIRECTORY, "STEP1_破冰卖自己规则.md"),
    title: "同行沟通五步法 第一步 破冰卖自己规则",
  },
  STEP2: {
    relativePath: path.join(FIVE_STEP_DIRECTORY, "STEP2_找需求挖危机规则.md"),
    title: "同行沟通五步法 第二步 找需求挖危机规则",
  },
  STEP3: {
    relativePath: path.join(FIVE_STEP_DIRECTORY, "STEP3_讲系统价值规则.md"),
    title: "同行沟通五步法 第三步 讲系统价值规则",
  },
  STEP4: {
    relativePath: path.join(FIVE_STEP_DIRECTORY, "STEP4_锁定问题解决问题规则.md"),
    title: "同行沟通五步法 第四步 锁定问题解决问题规则",
  },
  STEP5: {
    relativePath: path.join(FIVE_STEP_DIRECTORY, "STEP5_成交规则.md"),
    title: "同行沟通五步法 第五步 成交规则",
  },
};

const COMMAND_FILES = [{
  command: "分析同行聊天",
  relativePath: path.join("commands", "分析同行聊天.md"),
  title: "AI大健康专家指令 分析同行聊天",
}, {
  command: "判断客户阶段",
  relativePath: path.join("commands", "判断客户阶段.md"),
  title: "AI大健康专家指令 判断客户阶段",
}, {
  command: "生成下一句话",
  relativePath: path.join("commands", "生成下一句话.md"),
  title: "AI大健康专家指令 生成下一句话",
}, {
  command: "生成电话沟通方案",
  relativePath: path.join("commands", "生成电话沟通方案.md"),
  title: "AI大健康专家指令 生成电话沟通方案",
}, {
  command: "处理客户异议",
  relativePath: path.join("commands", "处理客户异议.md"),
  title: "AI大健康专家指令 处理客户异议",
}, {
  command: "复盘失败沟通",
  relativePath: path.join("commands", "复盘失败沟通.md"),
  title: "AI大健康专家指令 复盘失败沟通",
}, {
  command: "生成客户跟进计划",
  relativePath: path.join("commands", "生成客户跟进计划.md"),
  title: "AI大健康专家指令 生成客户跟进计划",
}, {
  command: "分析健康同行客户",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 分析健康同行客户",
}, {
  command: "判断同行沟通阶段",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 判断同行沟通阶段",
}, {
  command: "生成破冰方案",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 生成破冰方案",
}, {
  command: "找需求挖危机分析",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 找需求挖危机分析",
}, {
  command: "生成系统价值沟通方案",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 生成系统价值沟通方案",
}, {
  command: "锁定问题解决问题",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 锁定问题解决问题",
}, {
  command: "生成合作推进方案",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 生成合作推进方案",
}, {
  command: "生成同行跟进方案",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 生成同行跟进方案",
}, {
  command: "生成健康同行画像",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 生成健康同行画像",
}, {
  command: "模拟健康同行沟通",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 模拟健康同行沟通",
}, {
  command: "复盘同行沟通记录",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 复盘同行沟通记录",
}, {
  command: "优化同行沟通策略",
  relativePath: "08_commands高级指令库.md",
  title: "AI大健康专家高级指令 优化同行沟通策略",
}] as const;

export type HealthKnowledgeCommand = typeof COMMAND_FILES[number]["command"];

const SUPPORT_FILES = {
  psychology: {
    relativePath: "02_客户心理模型.md",
    title: "AI大健康专家 客户心理模型",
  },
  profile: {
    relativePath: "03_同行客户画像库.md",
    title: "AI大健康专家 同行客户画像库",
  },
  stage: {
    relativePath: "04_客户阶段判断模型.md",
    title: "AI大健康专家 客户阶段判断模型",
  },
  followUp: {
    relativePath: "05_客户跟进策略模型.md",
    title: "AI大健康专家 客户跟进策略模型",
  },
  material: {
    relativePath: "06_素材调用与内容展示规则.md",
    title: "AI大健康专家 素材调用与内容展示规则",
  },
  review: {
    relativePath: "07_沟通复盘与优化规则.md",
    title: "AI大健康专家 沟通复盘与优化规则",
  },
  cases: {
    relativePath: "09_案例库与训练数据结构.md",
    title: "AI大健康专家 案例库与训练数据结构",
  },
  safety: {
    relativePath: "10_知识库安全与输出规范.md",
    title: "AI大健康专家 知识库安全与输出规范",
  },
  routing: {
    relativePath: "11_AI Agent调用优先级路由规则.md",
    title: "AI大健康专家 调用优先级路由规则",
  },
  memory: {
    relativePath: "12_AI Agent记忆库结构规则.md",
    title: "AI大健康专家 记忆库结构规则",
  },
} satisfies Record<string, HealthRuleFile>;

const COMMAND_SUPPORT_KEYS: Record<HealthKnowledgeCommand, Array<keyof typeof SUPPORT_FILES>> = {
  分析同行聊天: ["profile", "psychology", "stage"],
  判断客户阶段: ["stage", "psychology"],
  生成下一句话: ["psychology", "stage"],
  生成电话沟通方案: ["profile", "stage"],
  处理客户异议: ["psychology", "stage"],
  复盘失败沟通: ["review", "stage"],
  生成客户跟进计划: ["followUp", "stage"],
  分析健康同行客户: ["profile", "psychology", "stage"],
  判断同行沟通阶段: ["stage", "psychology"],
  生成破冰方案: ["profile", "stage"],
  找需求挖危机分析: ["psychology", "profile", "stage"],
  生成系统价值沟通方案: ["profile", "stage"],
  锁定问题解决问题: ["psychology", "stage"],
  生成合作推进方案: ["stage", "memory"],
  生成同行跟进方案: ["followUp", "material", "stage", "memory"],
  生成健康同行画像: ["profile", "psychology"],
  模拟健康同行沟通: ["profile", "psychology", "stage", "cases"],
  复盘同行沟通记录: ["review", "stage", "cases", "memory"],
  优化同行沟通策略: ["review", "stage"],
};

const CORE_RULE_FILES = [SUPPORT_FILES.safety, SUPPORT_FILES.routing] as const;

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
      /锁定问题|解决问题|太贵|没钱|考虑一下|再考虑|商量|家人|反对|没效果|怕做不好|免费体验|比较一下|再观察|不确定|异议|顾虑|担心|质疑/,
    ]),
    STEP5: countMatches(normalized, [
      /成交|合作推进|合作确认|收网|怎么加入|如何加入|怎么开始|什么时候开始|付款|支付|微信还是支付宝|下单|报名|我试试|启动客户/,
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

export function resolveHealthKnowledgeCommand(query: string): HealthKnowledgeCommand | null {
  const normalized = normalizeRuleQuery(query);
  const matched = COMMAND_FILES.find(({ command }) => normalized.includes(`/${command}`));

  return matched?.command ?? null;
}

function resolveSupportFiles(
  query: string,
  command: HealthKnowledgeCommand | null,
): HealthRuleFile[] {
  const normalized = normalizeRuleQuery(query);
  const keys = new Set<keyof typeof SUPPORT_FILES>(command ? COMMAND_SUPPORT_KEYS[command] : []);

  if (/心理|真实意图|为什么这样|防御|购买动机|客户温度/.test(normalized)) {
    keys.add("psychology");
  }
  if (/画像|客户类型|哪类同行|直销|微商|保险|实体老板|创业者|团队长/.test(normalized)) {
    keys.add("profile");
  }
  if (/阶段|哪一步|当前步骤|判断客户/.test(normalized)) {
    keys.add("stage");
  }
  if (/跟进|沉默|重新激活|未来7天|联系谁|下次沟通/.test(normalized)) {
    keys.add("followUp");
  }
  if (/素材|案例|发什么内容|内容展示|朋友圈/.test(normalized)) {
    keys.add("material");
  }
  if (/复盘|失败沟通|没有推进|哪里出错|沟通评分|优化沟通/.test(normalized)) {
    keys.add("review");
  }
  if (/案例|模拟|训练|成功沟通|失败案例|学习点/.test(normalized)) {
    keys.add("cases");
  }
  if (/上次|之前聊|历史沟通|同行档案|客户档案|已完成|继续推进|继续跟进|长期记忆|记忆更新|下一步动作/.test(normalized)) {
    keys.add("memory");
  }

  return Array.from(keys, (key) => SUPPORT_FILES[key]);
}

function readRuleFile(relativePath: string): Promise<string> {
  const absolutePath = path.resolve(process.cwd(), KNOWLEDGE_DIRECTORY, relativePath);
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
  relativePath: string;
  title: string;
  tenantId: string;
}): HealthFiveStepRuleCandidate[] {
  const stableId = input.relativePath.replace(/\.md$/i, "").replace(/[^a-z0-9一-龥_-]+/gi, "-");

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
  const selectedCommand = resolveHealthKnowledgeCommand(input.query);

  if (!selectedStage && !selectedCommand && !isHealthPeerCommunicationQuery(input.query)) {
    return [];
  }

  const selectedRule = selectedStage ? STEP_FILES[selectedStage] : null;
  const selectedCommandFile = selectedCommand
    ? COMMAND_FILES.find(({ command }) => command === selectedCommand) ?? null
    : null;
  const requestedFiles: HealthRuleFile[] = [{
    relativePath: path.join(FIVE_STEP_DIRECTORY, "AGENTS.md"),
    title: "AI大健康专家同行沟通五步法总规则",
  },
  ...(selectedRule ? [selectedRule] : []),
  ...CORE_RULE_FILES,
  ...(selectedCommandFile ? [selectedCommandFile] : []),
  ...resolveSupportFiles(input.query, selectedCommand)];
  const uniqueFiles = requestedFiles.filter((file, index, files) => (
    files.findIndex((candidate) => candidate.relativePath === file.relativePath) === index
  ));
  const loadedFiles = await Promise.all(uniqueFiles.map(async (rule) => ({
    ...rule,
    content: await readRuleFile(rule.relativePath),
  })));

  return loadedFiles.flatMap((rule) => toRuleCandidates({
    ...rule,
    tenantId: input.tenantId,
  }));
}
