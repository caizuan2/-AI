import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IngestCustomerScriptCard } from "@/components/enterprise-admin/IngestCustomerScriptCard";
import {
  buildIngestMarkdownSegments,
  prepareIngestMessageMarkdown
} from "@/components/enterprise-admin/IngestGPTMessageRenderer";
import {
  extractAdminIngestCustomerScriptTargets,
  toAdminIngestCustomerScriptCopyText
} from "@/lib/enterprise/admin-ingest-customer-script";
import { copyAdminIngestText } from "@/lib/enterprise/admin-ingest-clipboard";

const screenshotFixture = [
  "## 开场话术：一个能让她停下来的故事",
  "",
  "你发一段语音或文字，用自然的口吻这样说：",
  "",
  "> “姐，我跟你聊个事。我朋友圈里有个宝妈，之前也是在家带孩子，做过两年微商，天天发圈累得要死。”",
  "",
  "这个故事的骨架是建立共鸣，不是客户话术。",
  "",
  "## 她追问后，你下一步怎么接",
  "",
  "她大概率会问你怎么做，这时候可以这样回复：",
  "",
  "> “其实很简单，就是八个字：自用省钱，分享赚钱。你不用囤货，也不用天天刷屏。”",
  "",
  "这段话包含三个钩子，但这些分析不应进入复制卡片。",
  "",
  "## 如果她今晚就说“我也想试试”",
  "",
  "先确认她理解了模式本质，再发这一段：",
  "",
  "> “姐，你得先想清楚，这件事不是赚快钱，是像种一棵树。你如果能接受这个节奏，我就手把手带你。”"
].join("\n");

async function main() {
  const targets = extractAdminIngestCustomerScriptTargets(screenshotFixture);

  assert.equal(targets.length, 3, "The three customer-facing quotes should each become one card.");
  assert.equal(
    targets[0]?.copyText,
    "“姐，我跟你聊个事。我朋友圈里有个宝妈，之前也是在家带孩子，做过两年微商，天天发圈累得要死。”"
  );
  assert.equal(
    targets[1]?.copyText,
    "“其实很简单，就是八个字：自用省钱，分享赚钱。你不用囤货，也不用天天刷屏。”"
  );
  assert.equal(
    targets[2]?.copyText,
    "“姐，你得先想清楚，这件事不是赚快钱，是像种一棵树。你如果能接受这个节奏，我就手把手带你。”"
  );
  assert.equal(
    targets[0]?.sourceMarkdown,
    "> “姐，我跟你聊个事。我朋友圈里有个宝妈，之前也是在家带孩子，做过两年微商，天天发圈累得要死。”",
    "The derived card must retain an exact pointer to the original Markdown span."
  );

  const completedSegments = buildIngestMarkdownSegments(screenshotFixture, true);
  const streamingSegments = buildIngestMarkdownSegments(screenshotFixture, false);

  assert.equal(
    completedSegments.filter((segment) => segment.type === "customer-script").length,
    3,
    "Completed messages should render each detected target through the card segment."
  );
  assert.equal(
    streamingSegments.some((segment) => segment.type === "customer-script"),
    false,
    "Streaming messages must keep the ordinary Markdown rendering until the body is complete."
  );

  const multiLineTarget = extractAdminIngestCustomerScriptTargets([
    "### 可以这样回复客户",
    "> **姐，先别着急。**",
    "> 我们一步一步把情况理清楚。"
  ].join("\n"));

  assert.equal(multiLineTarget.length, 1);
  assert.equal(
    multiLineTarget[0]?.copyText,
    "姐，先别着急。\n我们一步一步把情况理清楚。"
  );
  assert.equal(
    toAdminIngestCustomerScriptCopyText([
      "> **姐，先别着急。**",
      "> 我们一步一步把情况理清楚。"
    ]),
    multiLineTarget[0]?.copyText
  );

  const nonCustomerQuotes = [
    "## 引用来源",
    "> 《企业资料》第三章：这里是资料原文，不是客户话术。",
    "",
    "## 注意事项",
    "> 这是操作风险提示，不应该出现复制客户话术按钮。",
    "",
    "## 这个话术为什么有效",
    "> 这是一段策略分析，不是需要发给客户的直接沟通内容。",
    "",
    "> 这是没有任何客户沟通语境的普通引用内容。"
  ].join("\n");

  assert.deepEqual(
    extractAdminIngestCustomerScriptTargets(nonCustomerQuotes),
    [],
    "Sources, warnings, and generic quotes must retain the original blockquote rendering."
  );

  const staleCustomerContext = [
    "## 开场话术",
    "先分析客户所在阶段。",
    "再确认她当前的顾虑。",
    "检查资料是否齐全。",
    "说明方案的适用条件。",
    "补充风险和限制。",
    "列出知识库依据。",
    "最后进入引用材料。",
    "> 这是一段相距很远的资料引用，不应沿用早先的话术标题。"
  ].join("\n");

  assert.deepEqual(
    extractAdminIngestCustomerScriptTargets(staleCustomerContext),
    [],
    "A stale customer-script heading must not turn later source quotes into cards."
  );

  const fencedExample = [
    "## 开场话术",
    "```markdown",
    "> “代码块里的示例不能变成卡片。”",
    "```"
  ].join("\n");

  assert.deepEqual(
    extractAdminIngestCustomerScriptTargets(fencedExample),
    [],
    "Quoted examples inside code fences must never become customer-script cards."
  );

  const exactDeepSeekMarkdown = "\n# DeepSeek 深度思考原文\n\n> 原始引用块必须逐字符保留。  \n";
  const exactDoubaoMarkdown = "\n# 豆包深度思考原文\n\n> 原始引用块必须逐字符保留。  \n";

  assert.equal(
    prepareIngestMessageMarkdown(exactDeepSeekMarkdown, "deepseek"),
    exactDeepSeekMarkdown
  );
  assert.equal(
    prepareIngestMessageMarkdown(exactDoubaoMarkdown, "doubao"),
    exactDoubaoMarkdown
  );
  assert.equal(
    prepareIngestMessageMarkdown(exactDeepSeekMarkdown, "deepseek-pro"),
    exactDeepSeekMarkdown
  );
  assert.equal(
    prepareIngestMessageMarkdown(exactDoubaoMarkdown, "doubao-pro"),
    exactDoubaoMarkdown
  );

  const cardMarkup = renderToStaticMarkup(
    <IngestCustomerScriptCard content={targets[0]?.copyText ?? ""} />
  );

  assert.match(cardMarkup, /data-admin-ingest-customer-script-card="true"/);
  assert.match(cardMarkup, /可直接发给客户/);
  assert.match(cardMarkup, /复制话术/);
  assert.match(cardMarkup, /姐，我跟你聊个事/);

  let clipboardValue = "";
  const copied = await copyAdminIngestText(targets[1]?.copyText ?? "", {
    clipboard: {
      writeText: async (value) => {
        clipboardValue = value;
      }
    },
    document: null
  });

  assert.equal(copied, true);
  assert.equal(clipboardValue, targets[1]?.copyText);

  console.log("admin-ingest customer script card tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
