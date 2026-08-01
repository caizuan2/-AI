import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import type { CareerMentorStage } from "@/lib/ai-chat/career-mentor";
import type { GptIngestKnowledgeContext } from "@/lib/enterprise/gpt-ingest-memory";

const CAREER_MENTOR_RULE_DIRECTORY = path.join(
  "knowledge",
  "02_AI讲事业沟通五步骤"
);

const SHARED_RULE_FILES = [
  "AGENTS.md",
  "INDEX.md",
  "AI讲事业专家执行工作流.md",
  "客户心理判断模型.md",
  "行业客户画像库.md",
  "讲事业话术调用库.md"
] as const;

const STAGE_RULE_FILES = {
  ice_breaking: ["01_破冰规则.md"],
  follow_up: ["02_促单跟进规则.md"],
  career_presentation: ["03_讲事业规则.md"],
  objection_handling: ["04_锁定问题规则.md", "异议处理数据库.md"],
  closing: ["05_成交规则.md", "异议处理数据库.md"],
  framework: [
    "01_破冰规则.md",
    "02_促单跟进规则.md",
    "03_讲事业规则.md",
    "04_锁定问题规则.md",
    "05_成交规则.md"
  ],
  maintenance: [],
  unknown: []
} satisfies Record<CareerMentorStage, readonly string[]>;

const ruleContentCache = new Map<string, string>();

function loadRuleFile(fileName: string) {
  const cached = ruleContentCache.get(fileName);

  if (cached) {
    return cached;
  }

  const absolutePath = path.join(
    process.cwd(),
    CAREER_MENTOR_RULE_DIRECTORY,
    fileName
  );
  const content = readFileSync(absolutePath, "utf8").trim();

  if (!content) {
    throw new Error(`AI讲事业固定规则文件为空：${fileName}`);
  }

  ruleContentCache.set(fileName, content);
  return content;
}

function toRuleContext(fileName: string): GptIngestKnowledgeContext {
  return {
    id: `career-mentor-fixed-rule:${fileName}`,
    title: `AI讲事业固定规则：${fileName.replace(/\.md$/i, "")}`,
    content: loadRuleFile(fileName),
    sourceId: `fixed-rule:career-mentor/${fileName}`,
    score: 1
  };
}

export function loadCareerMentorFixedRuleContexts(
  stage: CareerMentorStage
): GptIngestKnowledgeContext[] {
  const stageFiles = STAGE_RULE_FILES[stage] ?? [];
  const fileNames = [...SHARED_RULE_FILES, ...stageFiles];

  return fileNames.map(toRuleContext);
}
