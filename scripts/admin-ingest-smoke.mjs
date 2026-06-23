#!/usr/bin/env node

const DEFAULT_SMOKE_URL = "http://localhost:3015/admin-ingest?app=ingest-admin&platform=web";
const smokeUrl = process.env.ADMIN_INGEST_SMOKE_URL || DEFAULT_SMOKE_URL;
const forbiddenFullHtmlSnippets = [
  "Cannot find module",
  "Server Error",
  "缺少必需的错误组件"
];
const forbiddenVisibleSnippets = [
  "This page could not be found",
  "404"
];

class SmokeFailure extends Error {}

function printFailure(message, detail) {
  console.error("❌ admin-ingest smoke failed");
  console.error(`失败 URL: ${smokeUrl}`);
  console.error(message);

  if (detail) {
    console.error(detail);
  }

  console.error("建议：关闭 Worktree 2 dev，备份 .next，重新 build/dev。");
  throw new SmokeFailure(message);
}

function printOk(message) {
  console.log(`✅ ${message}`);
}

function resolveAssetUrl(value, baseUrl) {
  const cleanValue = value.replaceAll("&amp;", "&");

  try {
    return new URL(cleanValue, baseUrl).toString();
  } catch {
    return null;
  }
}

function collectNextStaticAssets(html, baseUrl) {
  const assets = new Set();
  const attrRegex = /\b(?:href|src)=["']([^"']+)["']/g;
  const quotedStaticRegex = /["'](\/_next\/static\/[^"']+)["']/g;
  let match;

  while ((match = attrRegex.exec(html)) !== null) {
    const value = match[1];

    if (value.includes("/_next/static/")) {
      const assetUrl = resolveAssetUrl(value, baseUrl);

      if (assetUrl) {
        assets.add(assetUrl);
      }
    }
  }

  while ((match = quotedStaticRegex.exec(html)) !== null) {
    const assetUrl = resolveAssetUrl(match[1], baseUrl);

    if (assetUrl) {
      assets.add(assetUrl);
    }
  }

  return [...assets];
}

function getVisibleHtmlText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertRequiredAssets(assets) {
  const requiredAssets = [
    { label: "layout.css", test: (url) => url.includes("/_next/static/css/app/layout.css") },
    { label: "webpack chunks", test: (url) => url.includes("/_next/static/chunks/webpack.js") },
    { label: "main-app.js", test: (url) => url.includes("/_next/static/chunks/main-app.js") },
    { label: "page.js", test: (url) => url.includes("/_next/static/chunks/app/admin-ingest/page.js") }
  ];

  for (const asset of requiredAssets) {
    if (!assets.some(asset.test)) {
      printFailure(`缺少 Next 静态资源: ${asset.label}`, `已发现资源:\n${assets.join("\n") || "(none)"}`);
    }
  }
}

async function fetchText(url) {
  let response;

  try {
    response = await fetch(url, {
      redirect: "follow",
      cache: "no-store"
    });
  } catch (error) {
    printFailure("请求失败。", error instanceof Error ? error.message : String(error));
  }

  const text = await response.text();

  return { response, text };
}

async function main() {
  const { response, text: html } = await fetchText(smokeUrl);

  if (response.status !== 200) {
    printFailure(`HTML 状态不是 200: ${response.status}`);
  }

  printOk("/admin-ingest HTML 200");

  for (const snippet of forbiddenFullHtmlSnippets) {
    if (html.includes(snippet)) {
      printFailure(`页面包含错误文本: ${snippet}`);
    }
  }

  const visibleText = getVisibleHtmlText(html);

  for (const snippet of forbiddenVisibleSnippets) {
    if (visibleText.includes(snippet)) {
      printFailure(`页面主体包含错误文本: ${snippet}`);
    }
  }

  const assets = collectNextStaticAssets(html, smokeUrl);

  if (assets.length === 0) {
    printFailure("未发现 /_next/static 静态资源。");
  }

  assertRequiredAssets(assets);

  for (const assetUrl of assets) {
    const asset = await fetch(assetUrl, {
      redirect: "follow",
      cache: "no-store"
    }).catch((error) => {
      printFailure("静态资源请求失败。", `失败资源: ${assetUrl}\n${error instanceof Error ? error.message : String(error)}`);
    });

    if (asset.status !== 200) {
      printFailure("静态资源状态不是 200。", `失败资源: ${assetUrl}\nHTTP 状态: ${asset.status}`);
    }
  }

  printOk("Next static assets 200");
  printOk("no Server Error");
  printOk("no missing chunk");
  printOk("no 404");
}

try {
  await main();
} catch (error) {
  if (error instanceof SmokeFailure) {
    process.exitCode = 1;
  } else {
    console.error("❌ admin-ingest smoke failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
