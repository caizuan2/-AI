#!/usr/bin/env node

import { createRequire } from "module";

const require = createRequire(import.meta.url);

function hasPlaywright() {
  try {
    require.resolve("@playwright/test");
    return true;
  } catch {
    try {
      require.resolve("playwright");
      return true;
    } catch {
      return false;
    }
  }
}

if (!hasPlaywright()) {
  console.log("BROWSER_QA_UNAVAILABLE");
  console.log("reason: Playwright is not installed in this workspace.");
  console.log("apiFallback: run verify-admin-ingest-auth.mjs and verify-admin-ingest-gpt-flow.mjs");
  process.exit(0);
}

console.log("BROWSER_QA_UNAVAILABLE");
console.log("reason: Browser automation script is intentionally not active without a committed Playwright dependency.");
