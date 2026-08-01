import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCareerMentorFixedRuleContexts } from "../lib/ai-chat/career-mentor-fixed-rules";

const sharedTitles = [
  "AGENTS",
  "INDEX",
  "AI讲事业专家执行工作流",
  "客户心理判断模型",
  "行业客户画像库",
  "讲事业话术调用库"
];

function fileNamesFor(stage: Parameters<typeof loadCareerMentorFixedRuleContexts>[0]) {
  return loadCareerMentorFixedRuleContexts(stage).map((context) => (
    context.sourceId?.replace("fixed-rule:career-mentor/", "") ?? ""
  ));
}

function assertSharedRules(stage: Parameters<typeof loadCareerMentorFixedRuleContexts>[0]) {
  const contexts = loadCareerMentorFixedRuleContexts(stage);
  assert.equal(contexts.length >= sharedTitles.length, true);

  for (const title of sharedTitles) {
    assert.ok(contexts.some((context) => context.title.includes(title)));
  }

  for (const context of contexts) {
    assert.match(context.id, /^career-mentor-fixed-rule:/);
    assert.match(context.sourceId ?? "", /^fixed-rule:career-mentor\//);
    assert.equal(context.score, 1);
    assert.ok(context.content.length > 100);
  }
}

const stageFiles = [
  ["ice_breaking", "01_破冰规则.md"],
  ["follow_up", "02_促单跟进规则.md"],
  ["career_presentation", "03_讲事业规则.md"],
  ["objection_handling", "04_锁定问题规则.md"],
  ["closing", "05_成交规则.md"]
] as const;

for (const [stage, expectedFile] of stageFiles) {
  assertSharedRules(stage);
  const fileNames = fileNamesFor(stage);
  assert.ok(fileNames.includes(expectedFile));
  assert.equal(fileNames.filter((fileName) => /^0[1-5]_/.test(fileName)).length, 1);
}

assert.equal(fileNamesFor("objection_handling").includes("异议处理数据库.md"), true);
assert.equal(fileNamesFor("closing").includes("异议处理数据库.md"), true);
assert.equal(fileNamesFor("ice_breaking").includes("异议处理数据库.md"), false);
assert.equal(fileNamesFor("follow_up").includes("异议处理数据库.md"), false);
assert.equal(fileNamesFor("career_presentation").includes("异议处理数据库.md"), false);

assertSharedRules("framework");
assert.deepEqual(
  fileNamesFor("framework").filter((fileName) => /^0[1-5]_/.test(fileName)),
  [
    "01_破冰规则.md",
    "02_促单跟进规则.md",
    "03_讲事业规则.md",
    "04_锁定问题规则.md",
    "05_成交规则.md"
  ]
);

for (const stage of ["maintenance", "unknown"] as const) {
  assertSharedRules(stage);
  assert.equal(fileNamesFor(stage).some((fileName) => /^0[1-5]_/.test(fileName)), false);
}

const masterRule = readFileSync(
  "knowledge/02_AI讲事业沟通五步骤/AGENTS.md",
  "utf8"
);
assert.match(masterRule, /只属于 `expert-career`/);
assert.match(masterRule, /`kb-business-coach`/);
assert.match(masterRule, /不得被瘦身 KKS、AI大健康、三生中国/);
assert.match(masterRule, /Provider 返回的 `replyMarkdown` 必须原样透传/);
assert.match(masterRule, /不增加第二次模型请求/);

for (const fileName of [
  "02_促单跟进规则.md",
  "03_讲事业规则.md",
  "行业客户画像库.md"
]) {
  const content = readFileSync(
    `knowledge/02_AI讲事业沟通五步骤/${fileName}`,
    "utf8"
  );
  assert.doesNotMatch(content, /:contentReference\[/);
}

const providerSourceFiles = [
  "lib/enterprise/deepseek-ingest-client.ts",
  "lib/enterprise/doubao-ingest-client.ts",
  "lib/enterprise/ingest-model-provider.ts"
];

for (const fileName of providerSourceFiles) {
  const content = readFileSync(fileName, "utf8");
  assert.doesNotMatch(content, /career-mentor-fixed-rules/);
}

console.log("ai-chat career fixed rule library tests passed");
