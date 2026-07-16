import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainActivity = readFileSync(
  "android/app/src/main/java/com/aiknowledge/chat/MainActivity.java",
  "utf8"
);
const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");

function readSection(startMarker: string, endMarker: string) {
  const start = mainActivity.indexOf(startMarker);
  const end = mainActivity.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `Missing section start: ${startMarker}`);
  assert.notEqual(end, -1, `Missing section end: ${endMarker}`);

  return mainActivity.slice(start, end);
}

test("APK user shell recovers only main-frame transient failures", () => {
  assert.match(mainActivity, /onReceivedError\(WebView view, WebResourceRequest request, WebResourceError error\)/);
  assert.match(mainActivity, /!adminShell\s*&&\s*request\.isForMainFrame\(\)\s*&&\s*isTransientNetworkError/);
  assert.match(mainActivity, /WebViewClient\.ERROR_UNKNOWN/);
  assert.match(mainActivity, /WebViewClient\.ERROR_HOST_LOOKUP/);
  assert.match(mainActivity, /WebViewClient\.ERROR_CONNECT/);
  assert.match(mainActivity, /WebViewClient\.ERROR_TIMEOUT/);
  assert.match(mainActivity, /WebViewClient\.ERROR_IO/);
  assert.match(mainActivity, /onReceivedHttpError/);
  assert.match(mainActivity, /statusCode == 502 \|\| statusCode == 503 \|\| statusCode == 504/);
  assert.match(
    mainActivity,
    /APP_ORIGIN\.equals\([\s\S]*?&&\s*isAllowedShellRoute\(uri, false\)/
  );
  assert.match(mainActivity, /activeUserMainFrameUrl != null[\s\S]*?!failingUrl\.equals\(activeUserMainFrameUrl\)/);
});

test("APK user shell provides bounded automatic and manual retry", () => {
  assert.match(mainActivity, /NETWORK_RETRY_DELAYS_MS\s*=\s*\{\s*2000L,\s*5000L,\s*10000L\s*\}/);
  assert.match(mainActivity, /networkRetryAttempt >= NETWORK_RETRY_DELAYS_MS\.length/);
  assert.match(mainActivity, /networkRecoveryHandler\.postDelayed\(networkRetryRunnable, delayMs\)/);
  assert.match(mainActivity, /loadDataWithBaseURL\(/);
  assert.match(mainActivity, /<h1>网络暂时无法连接<\/h1>/);
  assert.match(mainActivity, /onclick='retryApp\(\)'/);
  assert.match(mainActivity, /window\.addEventListener\('online',retryApp\)/);
  assert.match(mainActivity, /public void retryApp\(\)/);
  assert.match(mainActivity, /retryLastFailedUserPage\(webView, true\)/);
  assert.match(mainActivity, /public void onResume\(\)/);
  assert.match(mainActivity, /retryLastFailedUserPage\(webView, false\)/);
  assert.match(mainActivity, /evaluateJavascript\([\s\S]*?window\.location\.replace/);
  assert.doesNotMatch(mainActivity, /webView\.loadUrl\(lastFailedUserUrl\)/);
  assert.match(mainActivity, /public void onDestroy\(\)\s*\{\s*cancelNetworkRetry\(\)/);
});

test("APK network recovery preserves user session and does not affect admin shell", () => {
  const recoverySection = readSection(
    "private static boolean isRecoverableUserUrl",
    "private static String getSafeUpdateFileName"
  );

  assert.match(recoverySection, /APP_ORIGIN\.equals/);
  assert.match(recoverySection, /isAdminShell\(\)/);
  assert.doesNotMatch(recoverySection, /LEGACY_APP_ORIGIN/);
  assert.doesNotMatch(recoverySection, /openExternalBrowser/);
  assert.doesNotMatch(recoverySection, /clearCache/);
  assert.doesNotMatch(recoverySection, /clearHistory/);
  assert.doesNotMatch(recoverySection, /removeAllCookies/);
  assert.doesNotMatch(recoverySection, /deleteAllData/);
});

test("APK release uses the stable legacy-compatible signing certificate", () => {
  assert.match(releaseWorkflow, /secrets\.ANDROID_RELEASE_KEYSTORE_BASE64/);
  assert.match(releaseWorkflow, /android\.injected\.signing\.store\.file/);
  assert.match(releaseWorkflow, /2a010b24419a9cd7847784bf640e34a0d48caa39e295e16091b0373ed089a9b7/);
  assert.match(releaseWorkflow, /APK certificate mismatch/);
  assert.match(releaseWorkflow, /Published APK certificate mismatch/);
  assert.doesNotMatch(releaseWorkflow, /android-debug-keystore-v1/);
});
