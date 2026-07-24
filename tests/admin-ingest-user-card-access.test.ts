import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  capabilitiesForIngestTier,
  resolveIngestAccessTierFromFacts
} from "../lib/enterprise/ingest-access-policy";
import { isAuthFailure } from "../lib/enterprise/ingest-response-normalizer";

const activeFacts = {
  isActive: true,
  isSuperAdmin: false,
  hasPrivilegedIngestRole: false,
  hasActiveIngestLicense: false,
  hasActiveUserLicense: false,
  hasLegacyUserLicense: false
};

test("ingest access tier keeps user cards chat-only and ingest cards full", () => {
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasActiveUserLicense: true
  }), "chat_only");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    isSuperAdmin: true
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    isActive: false,
    isSuperAdmin: true,
    hasActiveUserLicense: true,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true
  }), "none");
});

test("dual-card accounts prefer active ingest and safely downgrade to active user access", () => {
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true,
    hasActiveUserLicense: true
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: false,
    hasActiveUserLicense: true
  }), "chat_only");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true,
    hasActiveUserLicense: false
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true
  }), "none");
});

test("capabilities expose only chat for user cards", () => {
  assert.deepEqual(capabilitiesForIngestTier("chat_only"), {
    enterPortal: true,
    chat: true,
    aiControl: false,
    trainingMemory: false,
    saveKnowledge: false
  });
  assert.deepEqual(capabilitiesForIngestTier("full_ingest"), {
    enterPortal: true,
    chat: true,
    aiControl: true,
    trainingMemory: true,
    saveKnowledge: true
  });
  assert.equal(isAuthFailure(200, {
    success: true,
    data: {
      authenticated: true,
      hasIngestPortalAccess: true,
      hasIngestAccess: false,
      accessTier: "chat_only"
    }
  }), false, "chat-only must not be mistaken for a logged-out session");
});

test("registration and activation accept only user or ingest cards", () => {
  const registerRoute = readFileSync("app/api/ingest/auth/register/route.ts", "utf8");
  const activateRoute = readFileSync("app/api/ingest/auth/activate-license/route.ts", "utf8");
  const resetRoute = readFileSync("app/api/ingest/auth/reset-password/route.ts", "utf8");
  const authPortal = readFileSync("components/enterprise-admin/IngestSaasAuthPortal.tsx", "utf8");

  assert.match(registerRoute, /appType !== "user_app" && appType !== "ingest_admin"/);
  assert.match(activateRoute, /appType !== "user_app" && appType !== "ingest_admin"/);
  assert.match(resetRoute, /appType === "user_app" \|\| appType === "ingest_admin"/);
  assert.match(registerRoute, /appType,\s+ip:/);
  assert.match(activateRoute, /appType: input\.appType/);
  assert.match(resetRoute, /hasRedeemedLicenseForAppType\(user\.id, appType\)/);
  assert.doesNotMatch(registerRoute, /appType: "ingest_admin"/);
  assert.doesNotMatch(activateRoute, /appType: "ingest_admin"/);
  assert.match(authPortal, /typeof source\.hasIngestAccess === "boolean"/);
  assert.match(
    authPortal,
    /if \(authState\.hasIngestAccess \|\| authState\.accessTier === "full_ingest"\)/,
    "chat-only users must remain on activation so an ingest card can upgrade the account"
  );
});

test("chat-only UI hides advanced navigation and knowledge save without removing chat tools", () => {
  const page = readFileSync("app/admin-ingest/page.tsx", "utf8");
  const modeToggle = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const shell = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const actions = readFileSync("components/enterprise-admin/IngestKnowledgeDraftActions.tsx", "utf8");

  assert.match(page, /accessTier=\{access\.accessTier\}/);
  assert.match(page, /capabilities=\{access\.capabilities\}/);
  assert.match(modeToggle, /accessTier === "full_ingest" && activeRailKey !== "experts"/);
  assert.match(modeToggle, /const effectiveMode = capabilities\.aiControl \|\| capabilities\.trainingMemory \? mode : "chat"/);
  assert.match(modeToggle, /const effectiveRailKey = !capabilities\.trainingMemory/);
  assert.match(modeToggle, /activeRailKey: effectiveRailKey/);
  assert.match(modeToggle, /: "回答已生成。"/);
  assert.match(shell, /item\.key !== "tasks" && item\.key !== "memory"/);
  assert.match(shell, /if \(!canSaveKnowledge\)/);
  assert.match(actions, /\{canSaveKnowledge \? \(/);
  assert.match(actions, /title="复制"/);
  assert.match(actions, /title=\{isParsing \? "生成中" : "重新生成"\}/);
});

test("server gates prevent chat-only writes and internal prompt preview exposure", () => {
  const gptRoute = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
  const saveRoute = readFileSync("app/api/admin/kb/save/route.ts", "utf8");
  const authGuard = readFileSync("lib/enterprise/admin-ingest-auth.ts", "utf8");
  const promptPreview = readFileSync("app/api/admin/ingest-memory/prompt-preview/route.ts", "utf8");
  const savePost = saveRoute.slice(saveRoute.indexOf("export async function POST"));

  assert.match(gptRoute, /hasFullIngestAccess && enterpriseActor && hasDatabaseUrl\(\) && structuredForTrainingLog/);
  assert.match(gptRoute, /input\.operation === "retry_doubao_metadata"[\s\S]*requireFullAdminIngestAccess/);
  assert.ok(
    savePost.indexOf("await requireFullAdminIngestAccess()")
      < savePost.indexOf("await saveDraftOnlyKnowledge"),
    "full access must be checked before any KnowledgeItem save path"
  );
  assert.match(authGuard, /throw new IngestFullAccessRequiredError\(\)/);
  assert.match(promptPreview, /requireAdminIngestActor\(request\)/);
  assert.doesNotMatch(promptPreview, /requireAdminIngestChatActor/);
  assert.match(gptRoute, /buildAdminIngestPublishedMemoryContext/);
  assert.match(
    readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    /!capabilities\.trainingMemory[\s\S]*CHAT_ONLY_SERVER_GROUNDING/,
    "chat-only must rely on server-side GPT grounding without fetching prompt preview"
  );
});

test("license monitor refreshes server-rendered capabilities without downgrading on network errors", () => {
  const gate = readFileSync("components/enterprise-admin/IngestLicenseInvalidGate.tsx", "utf8");

  assert.match(gate, /const nextTier = readAccessTier\(await response\.json\(\)\)/);
  assert.match(gate, /nextTier !== accessTierRef\.current/);
  assert.match(gate, /router\.refresh\(\)/);
  assert.doesNotMatch(gate, /accessTierRef\.current = nextTier/);
  assert.match(gate, /Network failures and aborted checks must not invalidate/);
});
