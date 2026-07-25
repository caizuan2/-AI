import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAdminIngestHistoryScope,
  matchesAdminIngestHistoryScope
} from "../lib/enterprise/admin-ingest-history-scope";

const originalSessionSecret = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = "memory-panel-history-scope-test-secret";

test.after(() => {
  if (originalSessionSecret === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = originalSessionSecret;
  }
});

test("memory panel writes carry the captured opaque account scope and abort on scope change", async () => {
  const panelSource = await readFile(
    "components/enterprise-admin/IngestMemoryPanel.tsx",
    "utf8"
  );
  const parentSource = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );

  assert.match(parentSource, /<IngestMemoryPanel[\s\S]*?historyScope=\{historyScope\}/);
  assert.match(panelSource, /historyScope:\s*string/);
  assert.match(
    panelSource,
    /const mutationAbortControllersRef = useRef<Set<AbortController>>/
  );
  assert.match(
    panelSource,
    /useEffect\(\(\) => \{[\s\S]*?controllers\.forEach\(\(controller\) => controller\.abort\(\)\)[\s\S]*?\}, \[historyScope\]\)/
  );

  const operations = [
    {
      name: "handleExtract",
      endpoint: "/api/admin/ingest-memory/extract"
    },
    {
      name: "handleConfirmDraft",
      endpoint: "/api/admin/ingest-memory/drafts"
    },
    {
      name: "handlePublishSavedMemories",
      endpoint: "/api/admin/ingest-memory/publish"
    },
    {
      name: "handleRebuildMemoryIndex",
      endpoint: "/api/admin/ingest-memory/index/rebuild"
    }
  ];

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    const start = panelSource.indexOf(`async function ${operation.name}`);
    const nextStart = index + 1 < operations.length
      ? panelSource.indexOf(`async function ${operations[index + 1].name}`, start)
      : panelSource.indexOf("async function handleTestRuntimeMemoryHit", start);
    const source = panelSource.slice(start, nextStart);

    assert.notEqual(start, -1, `${operation.name} must exist`);
    assert.match(source, new RegExp(operation.endpoint.replaceAll("/", "\\/")));
    assert.match(source, /const mutation = beginHistoryScopedMutation\(\)/);
    assert.match(source, /credentials:\s*"include"/);
    assert.match(source, /signal:\s*mutation\.controller\.signal/);
    assert.match(
      source,
      /"x-admin-ingest-history-scope":\s*mutation\.historyScope/
    );
    assert.match(source, /historyScopeRef\.current !== mutation\.historyScope/);
    assert.match(source, /finishHistoryScopedMutation\(mutation\.controller\)/);
  }
});

test("memory mutation routes reject another account scope before parsing or writes", async () => {
  const routes = [
    {
      file: "app/api/admin/ingest-memory/extract/route.ts",
      handler: "POST",
      before: "request.json()",
      write: "persistMemoryExtraction"
    },
    {
      file: "app/api/admin/ingest-memory/drafts/route.ts",
      handler: "PATCH",
      before: "request.json()",
      write: "updateMemoryDraftStatus"
    },
    {
      file: "app/api/admin/ingest-memory/publish/route.ts",
      handler: "POST",
      before: "request.json()",
      write: "publishMemoryDrafts"
    },
    {
      file: "app/api/admin/ingest-memory/index/rebuild/route.ts",
      handler: "POST",
      before: "rebuildMemoryIndex()",
      write: "rebuildMemoryIndex()"
    }
  ];

  for (const route of routes) {
    const source = await readFile(route.file, "utf8");
    const mutationHandler = source.slice(
      source.indexOf(`export async function ${route.handler}`)
    );
    const guardIndex = mutationHandler.indexOf("matchesAdminIngestHistoryScope");

    assert.notEqual(guardIndex, -1, `${route.file} must validate the history scope`);
    assert.match(mutationHandler, /request\.headers\.get\("x-admin-ingest-history-scope"\)/);
    assert.match(mutationHandler, /INGEST_HISTORY_SCOPE_MISMATCH/);
    assert.match(mutationHandler, /status:\s*409/);
    assert.ok(
      guardIndex < mutationHandler.indexOf(route.before),
      `${route.file} must reject before parsing or mutation preparation`
    );
    assert.ok(
      guardIndex < mutationHandler.lastIndexOf(route.write),
      `${route.file} must reject before its persistent write`
    );
  }
});

test("opaque history scopes accept only the account that created them", () => {
  const accountAScope = createAdminIngestHistoryScope("memory-account-a");
  const accountBScope = createAdminIngestHistoryScope("memory-account-b");

  assert.notEqual(accountAScope, accountBScope);
  assert.equal(accountAScope.includes("memory-account-a"), false);
  assert.equal(matchesAdminIngestHistoryScope("memory-account-a", accountAScope), true);
  assert.equal(matchesAdminIngestHistoryScope("memory-account-b", accountAScope), false);
  assert.equal(matchesAdminIngestHistoryScope("memory-account-b", accountBScope), true);
});
