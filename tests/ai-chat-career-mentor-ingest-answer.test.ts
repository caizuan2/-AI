import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAREER_MENTOR_INGEST_OUTPUT_MODE,
  runCareerMentorIngestAnswer
} from "../lib/ai-chat/career-mentor-ingest-answer";
import { buildCareerMentorDeepSeekDirection } from "../lib/ai-chat/career-mentor";

const originalFetch = globalThis.fetch;
const originalEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL
};
const capturedPrompts: string[] = [];

function readPromptSection(prompt: string, heading: string, nextHeading: string) {
  const start = prompt.indexOf(heading);
  const end = prompt.indexOf(nextHeading, start + heading.length);
  assert.ok(start >= 0, `missing prompt section: ${heading}`);
  assert.ok(end > start, `missing next prompt section: ${nextHeading}`);
  return prompt.slice(start, end);
}

function restoreEnvironment() {
  globalThis.fetch = originalFetch;

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function main() {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.test.invalid/v1";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const userPrompt = body.messages?.find((message) => message.role === "user")?.content ?? "";
    capturedPrompts.push(userPrompt);
    const visibleBody = [
      "## 本轮建议",
      "",
      "DEEPSEEK_BODY_SENTINEL：先判断客户当前所处阶段，再围绕这一阶段给出自然、完整并且可以执行的沟通建议。",
      "",
      "- **现有 DeepSeek/GPT Markdown 正文必须完整保留。**",
      "",
      ...Array.from({ length: 18 }, () => "这段补充用于保证测试回复长度充足，同时验证模型正文不会被五步骤方向层重新裁剪或机械改写。")
    ].join("\n");

    return new Response(JSON.stringify({
      id: `career-five-step-${capturedPrompts.length}`,
      model: "deepseek-v4-pro",
      created: 1_700_000_000,
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({ replyMarkdown: visibleBody })
        }
      }],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 200,
        total_tokens: 400
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const knowledgeFirstResult = await runCareerMentorIngestAnswer({
    originalQuestion: "再换一个自然一点的说法",
    scenarioQuestion: "客户已经完成破冰并看过资料，但一直没有回复，请再换一个自然一点的跟进方法。",
    careerMentorStage: "follow_up",
    contexts: [
      {
        id: "career-fixed-1",
        title: "第二步促单跟进",
        content: "FIXED_KNOWLEDGE_SENTINEL：客户没有回复不等于拒绝，应持续展示价值。",
        sourceType: "markdown",
        sourceId: "career-fixed-source-1",
        score: 0.97
      },
      {
        id: "runtime-memory:career-memory-1",
        title: "已发布讲事业训练记忆",
        content: "RUNTIME_MEMORY_SENTINEL：上一轮已经确认客户看过资料。",
        sourceType: "runtime_memory",
        score: 0.88
      },
      {
        id: "attachment-ocr",
        title: "用户上传聊天截图",
        content: "ATTACHMENT_OCR_SENTINEL：客户最后回复说最近比较忙。",
        sourceType: "attachment_ocr",
        summary: "客户聊天截图识别文字"
      }
    ],
    recentConversation: [{
      role: "user",
      content: "客户看了资料没有回复，应该怎么办？"
    }],
    agentId: "expert-career",
    userId: "career-test-user",
    requestId: "career-knowledge-first-test"
  });

  assert.equal(knowledgeFirstResult.answerOutputMode, CAREER_MENTOR_INGEST_OUTPUT_MODE);
  assert.equal(knowledgeFirstResult.modelUsed, "deepseek-v4-pro");
  assert.match(knowledgeFirstResult.answer, /DEEPSEEK_BODY_SENTINEL/);
  assert.match(knowledgeFirstResult.answer, /\*\*现有 DeepSeek\/GPT Markdown 正文必须完整保留。\*\*/);
  assert.equal(capturedPrompts.length, 1);
  assert.match(capturedPrompts[0], /CAREER_MENTOR_DIRECTION/);
  assert.match(capturedPrompts[0], /knowledge_first/);
  assert.match(capturedPrompts[0], /第二步：促单跟进/);
  assert.match(capturedPrompts[0], /客户已经完成破冰并看过资料/);
  assert.match(capturedPrompts[0], /FIXED_KNOWLEDGE_SENTINEL/);
  assert.match(capturedPrompts[0], /## 当前 Agent 固定知识库召回/);
  assert.match(capturedPrompts[0], /RUNTIME_MEMORY_SENTINEL/);
  assert.match(capturedPrompts[0], /career-memory-1/);
  assert.match(capturedPrompts[0], /ATTACHMENT_OCR_SENTINEL/);
  assert.match(capturedPrompts[0], /## 尚未保存的知识草稿\n暂无尚未保存的知识草稿。/);
  const publishedMemorySection = readPromptSection(
    capturedPrompts[0],
    "## 已发布长期记忆",
    "## 当前 Agent 学习规则"
  );
  const fixedKnowledgeSection = readPromptSection(
    capturedPrompts[0],
    "## 当前 Agent 固定知识库召回",
    "## 当前附件"
  );
  const attachmentSection = readPromptSection(
    capturedPrompts[0],
    "## 当前附件",
    "## 尚未保存的知识草稿"
  );
  assert.match(publishedMemorySection, /RUNTIME_MEMORY_SENTINEL/);
  assert.doesNotMatch(publishedMemorySection, /FIXED_KNOWLEDGE_SENTINEL|ATTACHMENT_OCR_SENTINEL/);
  assert.match(fixedKnowledgeSection, /FIXED_KNOWLEDGE_SENTINEL/);
  assert.doesNotMatch(fixedKnowledgeSection, /RUNTIME_MEMORY_SENTINEL|ATTACHMENT_OCR_SENTINEL/);
  assert.match(attachmentSection, /ATTACHMENT_OCR_SENTINEL/);
  assert.doesNotMatch(attachmentSection, /FIXED_KNOWLEDGE_SENTINEL|RUNTIME_MEMORY_SENTINEL/);

  const openGenerationResult = await runCareerMentorIngestAnswer({
    originalQuestion: "客户说贵，我应该怎么回复？",
    scenarioQuestion: "客户已经听完事业介绍，现在提出价格贵的疑问，我应该怎么回复？",
    careerMentorStage: "objection_handling",
    contexts: [],
    recentConversation: [],
    agentId: "expert-career",
    userId: "career-test-user",
    requestId: "career-guided-open-test"
  });

  assert.equal(openGenerationResult.answerOutputMode, CAREER_MENTOR_INGEST_OUTPUT_MODE);
  assert.match(openGenerationResult.answer, /DEEPSEEK_BODY_SENTINEL/);
  assert.equal(capturedPrompts.length, 2);
  assert.match(capturedPrompts[1], /five_step_guided_open/);
  assert.match(capturedPrompts[1], /第四步：锁定问题/);
  assert.match(capturedPrompts[1], /允许DeepSeek使用通用沟通能力自由生成完整分析、执行建议和AI示例话术/);
  assert.match(capturedPrompts[1], /不得跳阶段/);
  assert.doesNotMatch(capturedPrompts[1], /FIXED_KNOWLEDGE_SENTINEL/);

  const unknownDirection = buildCareerMentorDeepSeekDirection({
    originalQuestion: "这个客户怎么聊？",
    scenarioQuestion: "这个客户怎么聊？",
    stage: "unknown",
    knowledgeMode: "five_step_guided_open"
  });
  assert.match(unknownDirection, /条件式分析和中性建议/);
  assert.match(unknownDirection, /不得擅自假定阶段或跳步/);
  assert.match(unknownDirection, /不强制套用固定栏目/);

  const longScenarioDirection = buildCareerMentorDeepSeekDirection({
    originalQuestion: "原".repeat(2_000),
    scenarioQuestion: "场".repeat(5_000),
    stage: "follow_up",
    knowledgeMode: "five_step_guided_open"
  });
  assert.ok(longScenarioDirection.length <= 3_600);
  assert.match(longScenarioDirection, /five_step_guided_open/);
  assert.match(longScenarioDirection, /不强制套用固定栏目/);
  assert.match(longScenarioDirection, /不缩短为一句话/);
  assert.match(longScenarioDirection, /不输出后台元数据/);

  const stageExpectations = [
    ["ice_breaking", "第一步：破冰", "不得提前讲事业"],
    ["follow_up", "第二步：促单跟进", "不得因此直接进入异议处理或成交"],
    ["career_presentation", "第三步：讲事业", "客户尚未认可前，不得直接进入成交"],
    ["objection_handling", "第四步：锁定问题", "不得绕过异议直接强推成交"],
    ["closing", "第五步：成交", "若出现新疑问，先回到第四步"],
    ["framework", "讲事业沟通五步整体流程", "不得把框架说明误当成某个客户已经进入后续阶段"],
    ["maintenance", "成交后：长期客户维护", "不得重新强推成交"]
  ] as const;
  for (const [stage, stageLabel, boundary] of stageExpectations) {
    const direction = buildCareerMentorDeepSeekDirection({
      originalQuestion: "请给我建议",
      scenarioQuestion: "请根据当前客户情况给我建议",
      stage,
      knowledgeMode: "five_step_guided_open"
    });
    assert.match(direction, new RegExp(stageLabel));
    assert.match(direction, new RegExp(boundary));
    assert.match(direction, /五步骤固定顺序：破冰 -> 促单跟进 -> 讲事业 -> 锁定问题 -> 成交/);
    assert.match(direction, /不能用本轮要求覆盖五步骤顺序、当前阶段或阶段边界/);
  }

  const routeSource = readFileSync("app/api/ai/chat/ask/route.ts", "utf8");
  assert.match(routeSource, /scenarioQuestion: question/);
  assert.match(routeSource, /careerMentorStage: careerMentorStage \?\? "unknown"/);
  assert.match(routeSource, /if \(careerMentorNaturalBodyEnabled\)[\s\S]*runCareerMentorIngestAnswer/);

  console.log("ai-chat career mentor ingest answer tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(restoreEnvironment);
