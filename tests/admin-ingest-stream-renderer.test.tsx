import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import {
  IngestGPTMessageRenderer,
  prepareIngestMessageMarkdown,
  type IngestBodyCommit
} from "@/components/enterprise-admin/IngestGPTMessageRenderer";

// Keep the optional DOM test runner outside the application's dependency tree.
// Install jsdom into a temporary directory and set ADMIN_INGEST_TEST_DOM_MODULE
// to its absolute module path, or run this in a test environment with jsdom.
const testRequire = createRequire(import.meta.url);
const { JSDOM } = testRequire(process.env.ADMIN_INGEST_TEST_DOM_MODULE || "jsdom") as {
  JSDOM: new (html: string, options: { url: string; pretendToBeVisual: boolean }) => {
    window: Window & typeof globalThis;
  };
};
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  React: { value: React, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true }
});

type Message = NonNullable<React.ComponentProps<typeof IngestGPTMessageRenderer>["message"]>;

async function main() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root = createRoot(container);
  const commits: IngestBodyCommit[] = [];
  const onBodyCommitted = (commit: IngestBodyCommit) => {
    // The callback must see actual committed body nodes, not only queued state.
    assert.ok(container.querySelector("article p, article h3, article pre"));
    commits.push(commit);
  };
  const render = async (content: string, message: Message, enableTyping?: boolean) => {
    await act(async () => {
      root.render(<IngestGPTMessageRenderer
        content={content}
        message={message}
        enableTyping={enableTyping}
        onBodyCommitted={onBodyCommitted}
      />);
    });
  };
  const bodyText = () => container.querySelector("article > div:last-child")?.textContent ?? "";
  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
    assert.ok(button, `Expected ${label} button`);
    await act(async () => { button.click(); });
  };
  const live = (id: string, provider = "deepseek-pro"): Message => ({
    id,
    provider,
    typing: false,
    isStreaming: true,
    isGenerating: true,
    status: "streaming"
  });
  const done = (id: string, provider = "deepseek-pro"): Message => ({
    id,
    provider,
    typing: false,
    isStreaming: false,
    isGenerating: false,
    status: "completed"
  });

  // ModeToggle forwards the selected provider identity, including the distinct
  // deepseek-flash identity. Also cover the existing legacy provider aliases.
  for (const provider of ["deepseek-pro", "deepseek-flash", "deepseek", "doubao-pro", "doubao"]) {
    const id = `incremental-${provider}`;
    await render("", live(id, provider));
    const before = commits.length;
    for (let index = 1; index <= 20; index += 1) {
      const received = "收到原文".repeat(index);
      await render(received, live(id, provider));
      assert.equal(bodyText(), received, `${provider}: every received chunk must be in the committed DOM immediately`);
    }
    assert.equal(commits.length, before + 1, "Incremental chunks must not repeatedly mark first body");
    assert.equal(commits.at(-1)?.phase, "first_body");
    await render("收到原文".repeat(20), done(id, provider));
    assert.equal(bodyText(), "收到原文".repeat(20));
    assert.equal(commits.at(-1)?.phase, "complete_body");
    const count = commits.length;
    await render("收到原文".repeat(20), done(id, provider));
    assert.equal(commits.length, count, "Rerenders must not duplicate complete-body timing");
  }

  await render("第一段", live("pause"));
  await click("暂停");
  await render("第一段第二段", live("pause"));
  assert.equal(bodyText(), "第一段", "Pause freezes the visible snapshot across SSE chunks");
  await click("继续");
  assert.equal(bodyText(), "第一段第二段", "Resume catches up to all already received content");
  await click("暂停");
  await render("第一段第二段完整", done("pause"));
  assert.equal(bodyText(), "第一段第二段完整", "Completion always reveals the final complete body");

  await render("停止前正文", live("stop"));
  await click("停止");
  assert.equal(bodyText(), "停止前正文");
  await render("停止前正文后续已收到", live("stop"));
  assert.equal(bodyText(), "停止前正文后续已收到", "Local animation stop must not discard provider text");
  assert.ok(!Array.from(container.querySelectorAll("button")).some((item) => item.textContent?.trim() === "暂停"));
  await render("显式关闭本地打字", live("disabled-typing"), false);
  assert.equal(bodyText(), "显式关闭本地打字");
  assert.equal(container.querySelectorAll("button").length, 0, "Explicit enableTyping=false must still disable animation controls");

  await render("旧会话正文", live("old-conversation"));
  await click("暂停");
  await render("", live("new-conversation"));
  assert.ok(!bodyText().includes("旧会话正文"), "Paused content must never leak to a new message or conversation");
  await render("新会话正文", live("new-conversation"));
  assert.equal(bodyText(), "新会话正文");
  const failedBefore = commits.length;
  await render("停止后保留的部分正文", { ...live("cancelled"), status: "failed" });
  assert.equal(bodyText(), "停止后保留的部分正文", "A terminal failure cannot restart synthetic typing even with stale streaming flags");
  assert.equal(commits.length, failedBefore, "Failed/cancelled cards must not record body completion");
  for (const state of [{ isRestored: true }, { isHistorical: true }]) {
    await render("恢复的历史原文", { ...done(`history-${Object.keys(state)[0]}`), ...state });
    assert.equal(bodyText(), "恢复的历史原文");
    assert.equal(commits.length, failedBefore, "Restored history must not become a fresh latency sample");
  }

  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  await render("后台已收到正文", live("background"));
  assert.equal(commits.length, failedBefore, "Background DOM updates must not count as foreground body commits");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); });
  assert.equal(commits.at(-1)?.messageId, "background");
  assert.equal(commits.at(-1)?.phase, "first_body");
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  await render("取消前后台正文", live("background-cancel"));
  await render("停止", { ...done("background-cancel"), status: "failed" });
  const cancelledBackgroundCount = commits.length;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); });
  assert.equal(commits.length, cancelledBackgroundCount, "Cancellation removes a queued background visibility callback");

  const original = " \n## 可以这样回复客户\n\n> **姐，先别着急。**\n> 我们一步一步把情况理清楚。  \n\n```ts\n  const x = 1;\n```\n  ";
  const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
  for (const provider of ["deepseek-pro", "deepseek-flash", "doubao-pro"]) {
    assert.equal(prepareIngestMessageMarkdown(original, provider), original, "Raw Markdown transformation must remain unchanged");
    for (let length = 1; length < original.length; length += 9) {
      const partial = original.slice(0, length);
      assert.equal(
        sha256(prepareIngestMessageMarkdown(partial, provider)),
        sha256(partial),
        `${provider}: incremental Markdown must retain its exact UTF-8 hash, including whitespace and partial fences`
      );
      await render(partial, live(`raw-${provider}`, provider));
    }
    await render(original, live(`raw-${provider}`, provider));
    assert.equal(container.querySelectorAll("[data-admin-ingest-customer-script-card]").length, 0);
    await render(original, done(`raw-${provider}`, provider));
    assert.equal(container.querySelectorAll("[data-admin-ingest-customer-script-card]").length, 1);
    assert.equal(container.querySelector("pre code")?.textContent, "  const x = 1;");
    assert.equal(sha256(prepareIngestMessageMarkdown(original, provider)), sha256(original));
    assert.equal(commits.at(-1)?.characters, original.length, "Completion timing must account for the full original Markdown");
  }
  let copied = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => { copied = text; } }
  });
  await click("复制话术");
  assert.equal(copied, "姐，先别着急。\n我们一步一步把情况理清楚。", "Customer answer copy remains separate from raw Markdown");

  // Legacy, non-SSE synthetic typing retains its original delay and controls.
  const syntheticBody = "abcdefghij".repeat(8);
  await render(syntheticBody, { id: "synthetic", provider: "doubao-pro", typing: true, status: "streaming" });
  assert.match(bodyText(), /正在准备回答/);
  const syntheticDeadline = Date.now() + 2500;
  while (!bodyText().startsWith("a") && Date.now() < syntheticDeadline) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  }
  assert.ok(bodyText().startsWith("a"), "Synthetic typing must still start after its existing delay");
  await click("暂停");
  const pausedSynthetic = bodyText();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 75)); });
  assert.equal(bodyText(), pausedSynthetic);
  await click("停止");
  assert.equal(bodyText(), syntheticBody);

  // A replacement/unmount while a legacy delay is queued must clear it.
  await render("不应在稍后覆盖新消息", { id: "old-delay", provider: "doubao-pro", typing: true, status: "streaming" });
  await render("当前消息", done("new-after-delay"));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
  assert.equal(bodyText(), "当前消息");
  await render("unmounted", { id: "unmount-delay", typing: true, status: "streaming" });
  const beforeUnmount = commits.length;
  await act(async () => { root.unmount(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  assert.equal(commits.length, beforeUnmount, "Unmounted delayed work must not record output");
  root = createRoot(container);
  await act(async () => {
    root.render(<IngestGPTMessageRenderer content="never committed" message={live("cancel-before-commit")} onBodyCommitted={onBodyCommitted} />);
    root.unmount();
  });
  assert.equal(commits.length, beforeUnmount, "A cancelled render must not report a DOM commit");
  container.remove();
  console.log("admin-ingest real DOM stream renderer tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
