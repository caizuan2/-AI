import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("final ingest, save and URL requests carry the captured account history scope", async () => {
  const clientSource = await readFile(
    "lib/enterprise/ingest-client.ts",
    "utf8"
  );
  const componentSource = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );

  for (const functionName of [
    "sendCoreIngest",
    "retryDoubaoKnowledgeDraftMetadata",
    "saveKnowledgeDraft",
    "sendUrlIngestPreview"
  ]) {
    const functionStart = clientSource.indexOf(
      `export async function ${functionName}`
    );
    const nextFunction = clientSource.indexOf(
      "\nexport async function ",
      functionStart + 1
    );
    const functionSource = clientSource.slice(
      functionStart,
      nextFunction === -1 ? clientSource.length : nextFunction
    );

    assert.notEqual(functionStart, -1);
    assert.match(functionSource, /historyScope:\s*string/);
    assert.match(
      functionSource,
      /"x-admin-ingest-history-scope":\s*input\.historyScope/
    );

    if (functionName === "saveKnowledgeDraft" || functionName === "sendUrlIngestPreview") {
      assert.match(functionSource, /signal\?:\s*AbortSignal/);
      assert.match(functionSource, /signal:\s*input\.signal/);
    }
  }

  const handleSendSource = componentSource.slice(
    componentSource.indexOf("async function handleSend"),
    componentSource.indexOf("async function handleRetryFailedMessage")
  );

  assert.match(
    handleSendSource,
    /const requestHistoryScope = historyScopeRef\.current/
  );
  assert.ok(
    handleSendSource.indexOf("const requestHistoryScope")
      < handleSendSource.indexOf("await verifyCurrentAccountHistoryScope()"),
    "the account scope must be captured before the async preflight"
  );
  assert.match(
    handleSendSource,
    /sendCoreIngest\(\{[\s\S]*?historyScope:\s*requestHistoryScope/
  );
  assert.match(
    componentSource,
    /retryDoubaoKnowledgeDraftMetadata\(\{[\s\S]*?historyScope:\s*expectedHistoryScope/
  );

  const metadataRecoverySource = componentSource.slice(
    componentSource.indexOf("async function handleRetryDoubaoMetadata"),
    componentSource.indexOf("function handleCancelIngest")
  );
  const saveSource = componentSource.slice(
    componentSource.indexOf("async function handleSave"),
    componentSource.indexOf("function handleUpload")
  );
  const urlSource = componentSource.slice(
    componentSource.indexOf("async function handleUrlIngestSubmit"),
    componentSource.indexOf("function handleToolAction")
  );

  for (const mutationSource of [metadataRecoverySource, saveSource, urlSource]) {
    assert.match(mutationSource, /const expectedHistoryScope = historyScopeRef\.current/);
    assert.match(mutationSource, /const controller = new AbortController\(\)/);
    assert.match(
      mutationSource,
      /accountScopedMutationAbortControllersRef\.current\.add\(controller\)/
    );
    assert.match(
      mutationSource,
      /accountScopedMutationAbortControllersRef\.current\.delete\(controller\)/
    );
    assert.match(
      mutationSource,
      /historyScopeRef\.current !== expectedHistoryScope[\s\S]*?reloadForAccountHistoryChange\(\)/
    );
  }
  assert.match(
    saveSource,
    /saveKnowledgeDraft\(\{[\s\S]*?historyScope:\s*expectedHistoryScope[\s\S]*?signal:\s*controller\.signal/
  );
  assert.ok(
    saveSource.indexOf("historyScopeRef.current !== expectedHistoryScope")
      < saveSource.indexOf("setDraft(result.draft)"),
    "save results must revalidate the current account before updating the page"
  );
  assert.match(
    urlSource,
    /sendUrlIngestPreview\(\{[\s\S]*?historyScope:\s*expectedHistoryScope[\s\S]*?signal:\s*controller\.signal/
  );
  assert.ok(
    urlSource.indexOf("historyScopeRef.current !== expectedHistoryScope")
      < urlSource.indexOf("setDraft(result.draft)"),
    "URL preview results must revalidate the current account before updating the page"
  );
  assert.match(
    componentSource,
    /function isAdminIngestHistoryScopeMismatch[\s\S]*?INGEST_HISTORY_SCOPE_MISMATCH/
  );
  assert.ok(
    (componentSource.match(
      /if \(isAdminIngestHistoryScopeMismatch\(error\)\) \{[\s\S]*?reloadForAccountHistoryChange\(\);/g
    )?.length ?? 0) >= 4,
    "account-scoped mutations must reload immediately after an account scope mismatch"
  );
  assert.match(
    clientSource,
    /payload\?\.errorCode === "INGEST_HISTORY_SCOPE_MISMATCH"[\s\S]*?INGEST_HISTORY_SCOPE_MISMATCH:/
  );
});

test("memory extraction, public links and persistent image uploads are bound to the captured account", async () => {
  const componentSource = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const clientSource = await readFile(
    "lib/enterprise/ingest-client.ts",
    "utf8"
  );
  const memoryRoute = await readFile(
    "app/api/admin/ingest-memory/extract/route.ts",
    "utf8"
  );
  const publicLinkRoute = await readFile(
    "app/api/admin/ingest-conversations/[id]/public-link/route.ts",
    "utf8"
  );
  const imageRoute = await readFile(
    "app/api/admin/ingest-images/route.ts",
    "utf8"
  );
  const memoryPost = memoryRoute.slice(memoryRoute.indexOf("export async function POST"));
  const publicPost = publicLinkRoute.slice(
    publicLinkRoute.indexOf("export async function POST"),
    publicLinkRoute.indexOf("export async function DELETE")
  );
  const publicDelete = publicLinkRoute.slice(publicLinkRoute.indexOf("export async function DELETE"));
  const imagePost = imageRoute.slice(
    imageRoute.indexOf("export async function POST"),
    imageRoute.indexOf("export async function GET")
  );
  const persistImagesStart = clientSource.indexOf(
    "export async function persistAdminIngestUploadImages"
  );
  const persistImagesEnd = clientSource.indexOf(
    "\nexport async function ",
    persistImagesStart + 1
  );
  const persistImagesSource = clientSource.slice(
    persistImagesStart,
    persistImagesEnd
  );

  assert.match(
    componentSource,
    /const accountScopedMutationAbortControllersRef = useRef<Set<AbortController>>/
  );
  assert.match(
    componentSource,
    /accountScopedMutationAbortControllersRef\.current\.forEach\(\(controller\) => \{[\s\S]*?controller\.abort\(\)/
  );
  assert.match(
    componentSource,
    /triggerMemoryExtraction\(\{[\s\S]*?historyScope:\s*requestHistoryScope/
  );
  assert.match(
    componentSource,
    /fetch\("\/api\/admin\/ingest-memory\/extract"[\s\S]*?signal:\s*controller\.signal[\s\S]*?"x-admin-ingest-history-scope":\s*input\.historyScope/
  );
  assert.match(
    componentSource,
    /handleCreateAgentConversationPublicLink[\s\S]*?const expectedHistoryScope = historyScopeRef\.current[\s\S]*?method:\s*"POST"[\s\S]*?"x-admin-ingest-history-scope":\s*expectedHistoryScope/
  );
  assert.match(
    componentSource,
    /handleRevokeAgentConversationPublicLink[\s\S]*?const expectedHistoryScope = historyScopeRef\.current[\s\S]*?method:\s*"DELETE"[\s\S]*?"x-admin-ingest-history-scope":\s*expectedHistoryScope/
  );
  assert.match(
    componentSource,
    /persistAdminIngestUploadImages\([\s\S]*?composerUploads,[\s\S]*?requestHistoryScope,[\s\S]*?imagePersistenceController\.signal/
  );
  assert.match(persistImagesSource, /historyScope:\s*string/);
  assert.match(persistImagesSource, /signal\?:\s*AbortSignal/);
  assert.match(
    persistImagesSource,
    /"x-admin-ingest-history-scope":\s*historyScope/
  );
  assert.match(
    persistImagesSource,
    /getFriendlyIngestError\(response,\s*data\)/
  );

  for (const routeSource of [memoryPost, imagePost]) {
    assert.match(
      routeSource,
      /request\.headers\.get\("x-admin-ingest-history-scope"\)/
    );
    assert.match(routeSource, /INGEST_HISTORY_SCOPE_MISMATCH/);
    assert.match(routeSource, /status:\s*409|},\s*409\)|},\s*409;/);
  }
  assert.match(
    publicLinkRoute,
    /function rejectMismatchedHistoryScope[\s\S]*?request\.headers\.get\("x-admin-ingest-history-scope"\)[\s\S]*?INGEST_HISTORY_SCOPE_MISMATCH[\s\S]*?status:\s*409/
  );

  assert.ok(
    memoryPost.indexOf("matchesAdminIngestHistoryScope")
      < memoryPost.indexOf("request.json()"),
    "memory scope mismatch must be rejected before reading conversation content"
  );
  assert.ok(
    memoryPost.indexOf("matchesAdminIngestHistoryScope")
      < memoryPost.indexOf("persistMemoryExtraction"),
    "memory scope mismatch must be rejected before writing memory"
  );
  assert.ok(
    publicPost.indexOf("rejectMismatchedHistoryScope")
      < publicPost.indexOf("request.json()"),
    "public-link creation must reject a stale account before reading or writing the link"
  );
  assert.ok(
    publicDelete.indexOf("rejectMismatchedHistoryScope")
      < publicDelete.indexOf("request.json()"),
    "public-link revocation must reject a stale account before reading or writing the link"
  );
  assert.ok(
    imagePost.indexOf("matchesAdminIngestHistoryScope")
      < imagePost.indexOf("request.formData()"),
    "image persistence must reject a stale account before reading the upload"
  );
  assert.ok(
    imagePost.indexOf("matchesAdminIngestHistoryScope")
      < imagePost.indexOf("saveAdminIngestImage"),
    "image persistence must reject a stale account before writing a file"
  );
});

test("server mutation routes reject an old-page scope before model calls or writes", async () => {
  const gptRoute = await readFile(
    "app/api/admin/kb/ingest/gpt/route.ts",
    "utf8"
  );
  const saveRoute = await readFile(
    "app/api/admin/kb/save/route.ts",
    "utf8"
  );
  const urlRoute = await readFile(
    "app/api/admin/kb/ingest/url/route.ts",
    "utf8"
  );
  const gptPost = gptRoute.slice(gptRoute.indexOf("export async function POST"));
  const savePost = saveRoute.slice(saveRoute.indexOf("export async function POST"));
  const urlPost = urlRoute.slice(urlRoute.indexOf("export async function POST"));

  for (const routeSource of [gptPost, savePost, urlPost]) {
    assert.match(
      routeSource,
      /request\.headers\.get\("x-admin-ingest-history-scope"\)/
    );
    assert.match(routeSource, /matchesAdminIngestHistoryScope/);
    assert.match(routeSource, /INGEST_HISTORY_SCOPE_MISMATCH/);
    assert.match(routeSource, /status:\s*409|},\s*409\)/);
  }

  assert.ok(
    gptPost.indexOf("matchesAdminIngestHistoryScope")
      < gptPost.indexOf("input = readRequest"),
    "GPT scope mismatch must be rejected before request/model preparation"
  );
  assert.ok(
    gptPost.indexOf("matchesAdminIngestHistoryScope")
      < gptPost.indexOf("runAdminIngestWithSelectedModel"),
    "GPT scope mismatch must be rejected before the selected model runs"
  );
  assert.ok(
    savePost.indexOf("matchesAdminIngestHistoryScope")
      < savePost.indexOf("hasDatabaseUrl"),
    "save scope mismatch must be rejected before database access"
  );
  assert.ok(
    savePost.indexOf("matchesAdminIngestHistoryScope")
      < savePost.indexOf("readSaveRequest"),
    "save scope mismatch must be rejected before parsing save content"
  );
  assert.match(urlPost, /requireAdminIngestChatAccess/);
  assert.match(urlPost, /requireFullAdminIngestAccess/);
  assert.ok(
    urlPost.indexOf("requireFullAdminIngestAccess")
      < urlPost.indexOf("input = readRequest"),
    "URL preview full-ingest access must be enforced before parsing preview content"
  );
  assert.ok(
    urlPost.indexOf("matchesAdminIngestHistoryScope")
      < urlPost.indexOf("input = readRequest"),
    "URL preview scope mismatch must be rejected before preview construction"
  );
});
