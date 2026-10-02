import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createAdminIngestSendPreflightGuard } from "../lib/enterprise/admin-ingest-send-preflight";

const source = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
function compile(value: string) {
  return ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
}
const verifySource = source.slice(source.indexOf("  async function verifyCurrentAccountHistoryScope("), source.indexOf("  async function handleSend("));
const ensureSource = source.slice(source.indexOf("  function ensureConversationForSend("), source.indexOf("  function markConversationUsed("));
const gateStart = source.indexOf("    const preflightAttempt =", source.indexOf("  async function handleSend("));
const gateSource = source.slice(gateStart, source.indexOf("    if (!hasActiveAgent)", gateStart));
assert.ok(gateStart > 0);
const capturedScope = source.match(/const requestHistoryScope = historyScopeRef\.current;/)?.[0];
assert.ok(capturedScope);
const createSend = new Function("context", `with (context) { ${compile(verifySource)} ${compile(ensureSource)} return async function send() { ${capturedScope} ${compile(gateSource)} return start(ensureConversationForSend(activeAgent)); }; }`);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}
const reply = (scope = "account-1") => ({ ok: true, json: async () => ({ scope }) });
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

function harness(input: {
  guard?: ReturnType<typeof createAdminIngestSendPreflightGuard>;
  refs?: { historyScope: { current: string }; agent: { current: string }; conversation: { current: string }; transitioning: { current: boolean } };
  conversationId?: string;
  historyScope?: string;
} = {}) {
  const guard = input.guard ?? createAdminIngestSendPreflightGuard();
  const conversationId = input.conversationId ?? "";
  const refs = input.refs ?? {
    historyScope: { current: "account-1" }, agent: { current: "agent-1" },
    conversation: { current: conversationId }, transitioning: { current: false }
  };
  const fetches: ReturnType<typeof deferred<ReturnType<typeof reply>>>[] = [];
  const effects: string[] = [];
  const started: string[] = [];
  let created = 0;
  const context = {
    sendPreflightGuardRef: { current: guard },
    historyScopeRef: refs.historyScope, activeAgentIdRef: refs.agent,
    activeConversationIdRef: refs.conversation, isAccountTransitioningRef: refs.transitioning,
    historyScope: input.historyScope ?? "account-1", requestConversationId: conversationId,
    activeConversationId: conversationId, activeAgent: { id: "agent-1" },
    agentConversations: conversationId ? [{ id: conversationId, agentId: "agent-1", status: "active" }] : [],
    requiresAccountPreflight: true, accountPreflightStartedAt: Date.now(),
    latencyTrace: { mark: () => undefined },
    window: { setTimeout, clearTimeout },
    console: { warn: () => undefined },
    fetch: () => { const request = deferred<ReturnType<typeof reply>>(); fetches.push(request); return request.promise; },
    readAdminIngestHistoryScopeFromApiResponse: (payload: { scope: string }) => payload.scope,
    reloadForAccountHistoryChange: () => { effects.push("reload"); guard.invalidate(); },
    setNoticeMessage: (value: string) => effects.push(`notice:${value}`),
    setErrorMessage: (value: string) => effects.push(`error:${value}`),
    createAgentConversation: () => { created += 1; return { id: `new-${created}`, agentId: "agent-1" }; },
    platformContext: { platform: "web", syncTarget: ["web"] },
    setAgentConversations: () => undefined,
    setActiveConversationScope: (value: string) => { refs.conversation.current = value; },
    start: (value: string) => { started.push(value); return value; }
  };
  return { send: createSend(context) as () => Promise<string | null>, context, guard, refs, fetches, effects, started, created: () => created };
}

async function main() {
  const double = harness();
  const first = double.send();
  const second = double.send();
  assert.equal(await second, null);
  assert.equal(double.fetches.length, 1, "slow auth double-click must not run a second preflight");
  double.fetches[0].resolve(reply());
  assert.equal(await first, "new-1");
  assert.equal(double.created(), 1);
  assert.equal(double.started.length, 1);
  // Invoke the same stale render after its first preflight has released. The
  // refs now point to the new conversation, so the old empty draft cannot resend.
  assert.equal(await double.send(), null);
  assert.equal(double.created(), 1);
  assert.equal(double.fetches.length, 1);

  // Reusing account A's render after account B is loaded must reject before
  // auth/upload/model, even for an identical system agent and empty draft.
  const oldAccountRender = harness();
  oldAccountRender.guard.invalidate();
  oldAccountRender.refs.historyScope.current = "account-2";
  assert.equal(await oldAccountRender.send(), null);
  assert.equal(oldAccountRender.fetches.length, 0);
  assert.equal(oldAccountRender.created(), 0);
  assert.deepEqual(oldAccountRender.started, []);
  assert.deepEqual(oldAccountRender.effects, []);
  const newAccountRender = harness({ guard: oldAccountRender.guard, refs: oldAccountRender.refs, historyScope: "account-2" });
  const currentAccountSend = newAccountRender.send();
  assert.equal(newAccountRender.fetches.length, 1);
  newAccountRender.fetches[0].resolve(reply("account-2"));
  assert.equal(await currentAccountSend, "new-1");

  const sharedGuard = createAdminIngestSendPreflightGuard();
  const refs = { historyScope: { current: "account-1" }, agent: { current: "agent-1" }, conversation: { current: "a" }, transitioning: { current: false } };
  const a = harness({ guard: sharedGuard, refs, conversationId: "a" });
  const b = harness({ guard: sharedGuard, refs, conversationId: "b" });
  const sendA = a.send();
  refs.conversation.current = "b";
  const sendB = b.send();
  assert.equal(a.fetches.length, 1);
  assert.equal(b.fetches.length, 1, "another conversation must not be blocked by the first preflight");
  a.fetches[0].resolve(reply());
  assert.equal(await sendA, null, "a changed preflight target must not clear the new conversation composer");
  assert.deepEqual(a.started, []);
  assert.deepEqual(a.effects, []);
  b.fetches[0].resolve(reply());
  assert.equal(await sendB, "b");

  // The account verifier catches network failures; the reservation must still
  // release so the original draft can be retried without creating a new chat.
  const retry = harness();
  const rejected = retry.send();
  retry.fetches[0].reject(new Error("temporary network failure"));
  assert.equal(await rejected, null);
  const retrySend = retry.send();
  assert.equal(retry.fetches.length, 2);
  retry.fetches[1].resolve(reply());
  assert.equal(await retrySend, "new-1");
  assert.equal(retry.created(), 1);

  const denied = harness();
  const deniedSend = denied.send();
  denied.fetches[0].resolve({ ...reply(), ok: false });
  assert.equal(await deniedSend, null);
  assert.deepEqual(denied.started, []);
  assert.ok(denied.effects.includes("reload"));
  const deniedRetry = denied.send();
  denied.fetches[1].resolve(reply());
  assert.equal(await deniedRetry, "new-1");

  for (const staleBy of ["account", "agent", "conversation", "unmount"] as const) {
    const stale = harness();
    const pending = stale.send();
    if (staleBy === "account") {
      stale.guard.invalidate();
      stale.refs.historyScope.current = "account-2";
    } else if (staleBy === "agent") {
      stale.refs.agent.current = "agent-2";
    } else if (staleBy === "conversation") {
      stale.refs.conversation.current = "another-chat";
    } else {
      stale.guard.dispose();
    }
    stale.fetches[0].reject(new Error("late auth failure"));
    assert.equal(await pending, null);
    assert.deepEqual(stale.effects, [], `${staleBy}: stale auth may not show errors or reload the current UI`);
    assert.deepEqual(stale.started, []);
    assert.equal(stale.created(), 0);
  }

  // Old finally cleanup cannot release a replacement token after account
  // reset / StrictMode cleanup and setup, even when the same scope returns.
  const staleFinally = harness();
  const oldSend = staleFinally.send();
  staleFinally.guard.dispose();
  staleFinally.guard.activate();
  const newSend = staleFinally.send();
  staleFinally.fetches[0].resolve(reply());
  assert.equal(await oldSend, null);
  assert.equal(await staleFinally.send(), null, "old release must not unlock the new in-flight reservation");
  assert.equal(staleFinally.fetches.length, 2);
  staleFinally.fetches[1].resolve(reply());
  assert.equal(await newSend, "new-1");

  // A truly unexpected verifier exception also passes through the same finally.
  const thrown = harness();
  thrown.context.window.setTimeout = (() => { throw new Error("unexpected verifier exception"); }) as unknown as typeof setTimeout;
  await assert.rejects(thrown.send(), /unexpected verifier exception/);
  thrown.context.window.setTimeout = setTimeout;
  const afterThrow = thrown.send();
  thrown.fetches[0].resolve(reply());
  assert.equal(await afterThrow, "new-1");
  await flush();

  assert.match(source, /sendPreflightGuardRef\.current\.invalidate\(\)/);
  assert.match(source, /guard\.activate\(\);\s*return \(\) => guard\.dispose\(\)/);
  const releasedAt = source.indexOf("sendPreflightGuardRef.current.release(preflightAttempt)");
  const preparationClaimAt = source.indexOf("preparingConversationIdsRef.current = {", releasedAt);
  assert.doesNotMatch(source.slice(releasedAt, preparationClaimAt), /\bawait\b/, "preflight release must hand off synchronously to the existing request guard");
  console.log("Admin ingest send preflight boundary tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
