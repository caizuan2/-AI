#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SERVER_URL = "http://localhost:3001";
const SERVER_URL = (process.env.RAG_TEST_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/+$/, "");
const REPORT_DIR = path.join(process.cwd(), "reports");
const JSON_REPORT_PATH = path.join(REPORT_DIR, "chatgpt-style-report.json");
const CSV_REPORT_PATH = path.join(REPORT_DIR, "chatgpt-style-report.csv");
const REQUEST_TIMEOUT_MS = 30_000;

const QUESTIONS = [
  "联创合伙人",
  "联创合伙人计划的资格要求是什么？",
  "新伙伴问我怎么成为联创合伙人，我应该怎么说？",
  "联创合伙人计划能不能直接跟新客户讲？",
  "五星领导人想要这个文档，应该怎么处理？"
];

const API_CANDIDATES = [
  {
    path: "/api/chat",
    bodies: [
      (question) => ({ question })
    ]
  },
  {
    path: "/api/knowledge/query",
    bodies: [
      (question) => ({ query: question, topK: 10 })
    ]
  },
  {
    path: "/api/knowledge/qa",
    bodies: [
      (question) => ({ question }),
      (question) => ({ message: question }),
      (question) => ({ content: question }),
      (question) => ({ messages: [{ role: "user", content: question }] })
    ]
  },
  {
    path: "/api/qa",
    bodies: [
      (question) => ({ question }),
      (question) => ({ message: question }),
      (question) => ({ content: question }),
      (question) => ({ messages: [{ role: "user", content: question }] })
    ]
  },
  {
    path: "/chat",
    bodies: [
      (question) => ({ question }),
      (question) => ({ message: question }),
      (question) => ({ content: question }),
      (question) => ({ messages: [{ role: "user", content: question }] })
    ]
  }
];

const AUTH_CHECK_CANDIDATES = [
  "/api/auth/session",
  "/api/session",
  "/api/me",
  "/api/user"
];

const MECHANICAL_PHRASES = [
  "只找到",
  "少于请求",
  "达到相似度阈值",
  "相似度",
  "引用来源",
  "Provider",
  "Model",
  "fallback",
  "chunk",
  "score",
  "source",
  "sources",
  "retrieval",
  "metadata",
  "debug",
  "检索",
  "召回",
  "暂无可引用知识",
  "没有找到足够依据",
  "根据知识库显示",
  "作为 AI",
  "综上所述"
];

const BAD_STARTS = [
  "只找到",
  "根据知识库",
  "引用来源",
  "未找到",
  "暂无",
  "作为AI",
  "作为 AI"
];

const BUSINESS_KEYWORDS = [
  "联创合伙人",
  "五星",
  "领导人",
  "梦想家园",
  "课程讲师",
  "新伙伴",
  "产品",
  "提成",
  "禁止",
  "公开",
  "承诺",
  "私下",
  "确认"
];

function sanitize(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgresql://***")
    .replace(/(api[_-]?key|token|secret|password)(["'=:\s]+)[^"',\s}]+/gi, "$1$2***");
}

function truncate(value, length = 500) {
  const text = sanitize(value || "");

  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function describeRequestFormat(method, payload) {
  if (method === "GET") {
    return "GET，无请求体";
  }

  if (!payload || typeof payload !== "object") {
    return `${method} JSON，非对象请求体`;
  }

  const keys = Object.keys(payload);

  if (Array.isArray(payload.messages)) {
    return `${method} JSON { messages: [{ role, content }] }`;
  }

  return keys.length
    ? `${method} JSON { ${keys.join(", ")} }`
    : `${method} JSON {}`;
}

function printRequestStart({ path: apiPath, method, format, question }) {
  console.log(`正在请求：${apiPath}`);
  console.log(`请求格式：${format}`);
  console.log(`问题：${question || "-"}`);
}

function createTimeoutController() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId)
  };
}

function isAbortError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("name" in error || "type" in error) &&
      (error.name === "AbortError" || error.type === "aborted")
  );
}

function buildTimeoutMessage(apiPath) {
  return `${apiPath} 单次请求超过 ${Math.round(REQUEST_TIMEOUT_MS / 1000)} 秒，已判定失败并继续后续测试。`;
}

function readCookiePair(cookieHeader) {
  if (!cookieHeader) {
    return { name: "", value: "" };
  }

  const pairs = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf("=");

      if (separatorIndex === -1) {
        return { name: item, value: "" };
      }

      return {
        name: item.slice(0, separatorIndex).trim(),
        value: item.slice(separatorIndex + 1).trim()
      };
    })
    .filter((item) => item.name);

  return pairs.find((item) => item.name === "ai_kb_session") || pairs[0] || { name: "", value: "" };
}

function maskCookieValue(value) {
  if (!value) {
    return "未提供";
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

function resolveCookieAuth() {
  const directCookie = process.env.RAG_TEST_COOKIE?.trim();
  const cookieName = process.env.RAG_TEST_COOKIE_NAME?.trim();
  const cookieValue = process.env.RAG_TEST_COOKIE_VALUE?.trim();

  if (directCookie) {
    const pair = readCookiePair(directCookie);

    return {
      detected: true,
      source: "RAG_TEST_COOKIE",
      header: directCookie,
      name: pair.name || "未识别",
      maskedValue: maskCookieValue(pair.value),
      warning: ""
    };
  }

  if (cookieName && cookieValue) {
    return {
      detected: true,
      source: "RAG_TEST_COOKIE_NAME/RAG_TEST_COOKIE_VALUE",
      header: `${cookieName}=${cookieValue}`,
      name: cookieName,
      maskedValue: maskCookieValue(cookieValue),
      warning: ""
    };
  }

  return {
    detected: false,
    source: cookieName || cookieValue ? "RAG_TEST_COOKIE_NAME/RAG_TEST_COOKIE_VALUE" : "未设置",
    header: "",
    name: cookieName || "未提供",
    maskedValue: cookieValue ? maskCookieValue(cookieValue) : "未提供",
    warning: cookieName || cookieValue
      ? "检测到部分 Cookie 环境变量，但 RAG_TEST_COOKIE_NAME 和 RAG_TEST_COOKIE_VALUE 必须同时设置。"
      : ""
  };
}

const COOKIE_AUTH = resolveCookieAuth();

async function getFetch() {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  try {
    const imported = await import("node-fetch");

    return imported.default;
  } catch {
    throw new Error("当前 Node 环境不支持 global fetch，且项目未安装 node-fetch。请使用 Node 18+；当前 package.json engines 要求 Node >=22.13.0。");
  }
}

function buildHeaders(options = {}) {
  const includeContentType = options.includeContentType !== false;
  const headers = {
    Accept: "application/json"
  };
  const authorization = process.env.RAG_TEST_AUTHORIZATION?.trim();

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (COOKIE_AUTH.header) {
    headers.Cookie = COOKIE_AUTH.header;
  }

  if (authorization) {
    headers.Authorization = authorization;
  }

  return headers;
}

function buildAuthFailureMessage(status) {
  return [
    `HTTP ${status} 鉴权失败。`,
    `当前 Cookie 名称：${COOKIE_AUTH.name || "未提供"}`,
    "请确认浏览器 Application → Cookies 中复制的是 ai_kb_session 的完整 Value。",
    `请确认登录的是同一个本地地址，例如 ${SERVER_URL}。`,
    "请重新登录后复制最新 Cookie。"
  ].join(" ");
}

function getPowerShellCookieCommandExample() {
  if (COOKIE_AUTH.name && COOKIE_AUTH.name !== "未提供" && COOKIE_AUTH.name !== "未识别") {
    return `$env:RAG_TEST_COOKIE='${COOKIE_AUTH.name}=你的完整CookieValue'; pnpm test:chatgpt-style`;
  }

  return "$env:RAG_TEST_COOKIE='ai_kb_session=你的完整CookieValue'; pnpm test:chatgpt-style";
}

async function readBody(response) {
  const text = await response.text();

  if (!text) {
    return { text: "", json: null };
  }

  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function readPath(payload, keys) {
  return keys.reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return current[key];
    }

    return undefined;
  }, payload);
}

function extractAnswer(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const paths = [
    ["answer"],
    ["content"],
    ["message"],
    ["data", "answer"],
    ["data", "content"],
    ["result", "answer"],
    ["result", "content"]
  ];

  for (const keys of paths) {
    const value = readPath(payload, keys);

    if (typeof value === "string") {
      return value.trim();
    }
  }

  return "";
}

async function requestApi(fetchImpl, candidate, bodyBuilder, question) {
  const url = `${SERVER_URL}${candidate.path}`;
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(bodyBuilder(question)),
      redirect: "manual"
    });
  } catch (error) {
    return {
      ok: false,
      path: candidate.path,
      status: "NETWORK_ERROR",
      answer: "",
      error: error instanceof Error ? error.message : String(error),
      responseText: "",
      bodyName: bodyBuilder.name || "anonymous"
    };
  }

  const body = await readBody(response);
  const location = response.headers.get("location");

  if (!response.ok) {
    return {
      ok: false,
      path: candidate.path,
      status: response.status,
      answer: "",
      error: response.status === 401
        ? buildAuthFailureMessage(response.status)
        : location
          ? `HTTP ${response.status}; Location: ${location}`
          : `HTTP ${response.status}`,
      responseText: truncate(body.text, 500),
      bodyName: bodyBuilder.name || "anonymous"
    };
  }

  if (body.json && (body.json.ok === false || body.json.success === false)) {
    return {
      ok: false,
      path: candidate.path,
      status: response.status,
      answer: "",
      error: truncate(body.json.message || body.json.error?.message || "API returned ok=false.", 500),
      responseText: truncate(body.text, 500),
      bodyName: bodyBuilder.name || "anonymous"
    };
  }

  const answer = body.json ? extractAnswer(body.json) : "";

  if (!answer) {
    return {
      ok: false,
      path: candidate.path,
      status: response.status,
      answer: "",
      error: "响应成功，但没有在 answer/content/message/data.answer/data.content/result.answer/result.content 中找到回答字段。",
      responseText: truncate(body.text, 500),
      bodyName: bodyBuilder.name || "anonymous"
    };
  }

  return {
    ok: true,
    path: candidate.path,
    status: response.status,
    answer,
    error: "",
    responseText: truncate(body.text, 500),
    bodyName: bodyBuilder.name || "anonymous"
  };
}

async function checkLoginState(fetchImpl) {
  const attempts = [];

  for (const authPath of AUTH_CHECK_CANDIDATES) {
    const url = `${SERVER_URL}${authPath}`;
    let response;

    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: buildHeaders({ includeContentType: false }),
        redirect: "manual"
      });
    } catch (error) {
      attempts.push({
        path: authPath,
        status: "NETWORK_ERROR",
        exists: false,
        message: error instanceof Error ? error.message : String(error),
        responseText: ""
      });
      continue;
    }

    const body = await readBody(response);
    const location = response.headers.get("location");
    const exists = ![404, 405].includes(response.status);
    let message = "";

    if (response.status === 401 || response.status === 403) {
      message = buildAuthFailureMessage(response.status);
    } else if (location) {
      message = `HTTP ${response.status}; Location: ${location}`;
    } else if (response.ok) {
      message = "已响应";
    } else if (!exists) {
      message = "不存在或不支持该方法";
    } else {
      message = `HTTP ${response.status}`;
    }

    attempts.push({
      path: authPath,
      status: response.status,
      exists,
      message,
      responseText: truncate(body.text, 200)
    });
  }

  return attempts;
}

async function discoverApi(fetchImpl) {
  const attempts = [];
  const probeQuestion = QUESTIONS[0];

  for (const candidate of API_CANDIDATES) {
    for (const bodyBuilder of candidate.bodies) {
      const attempt = await requestApi(fetchImpl, candidate, bodyBuilder, probeQuestion);

      attempts.push(attempt);

      if (attempt.ok) {
        return {
          candidate,
          bodyBuilder,
          probeResult: attempt,
          attempts
        };
      }

      if (attempt.status === 401 || attempt.status === 403) {
        break;
      }
    }
  }

  return {
    candidate: null,
    bodyBuilder: null,
    probeResult: null,
    attempts
  };
}

function countChineseCharacters(answer) {
  return (answer.match(/[\u3400-\u9fff]/g) || []).length;
}

function findMechanicalPhrases(answer) {
  const lowerAnswer = answer.toLowerCase();

  return MECHANICAL_PHRASES.filter((phrase) => {
    if (/^[A-Za-z]+$/.test(phrase)) {
      return new RegExp(`\\b${phrase}\\b`, "i").test(answer);
    }

    return lowerAnswer.includes(phrase.toLowerCase());
  });
}

function getSuggestion(failures, warnings) {
  if (failures.some((item) => item.includes("鉴权失败") || item.includes("未登录"))) {
    return `接口存在，但鉴权失败。请确认 Cookie 名称和值来自 ${SERVER_URL} 的 ai_kb_session，并用命令：${getPowerShellCookieCommandExample()}`;
  }

  if (failures.some((item) => item.includes("无法找到可用问答接口") || item.includes("请求失败"))) {
    return "当前没有拿到可用问答响应。优先确认 dev server 已启动，并检查问答 API 路径和响应结构。";
  }

  if (failures.some((item) => item.includes("机械化") || item.includes("调试"))) {
    return "优先检查 lib/ai/rag-output.ts 的清洗规则，以及 app/api/chat/route.ts 返回 answer 前是否仍拼接了来源、检索或 fallback 文案。";
  }

  if (failures.some((item) => item.includes("开头"))) {
    return "优先检查 lib/ai/rag-prompt.ts 的 system prompt，要求模型直接给答案，不要用知识库报告式开头。";
  }

  if (failures.some((item) => item.includes("空回答") || item.includes("请求失败"))) {
    return "优先检查本地 dev server、登录态 RAG_TEST_COOKIE，以及 app/api/chat/route.ts 的鉴权和返回结构。";
  }

  if (failures.some((item) => item.includes("过长")) || warnings.some((item) => item.includes("过长"))) {
    return "优先在 lib/ai/rag-prompt.ts 中限制普通问题 150-350 字，并避免固定模板化分段。";
  }

  if (warnings.some((item) => item.includes("业务关键词"))) {
    return "优先检查 lib/rag/retriever.ts 的召回词和 app/api/chat/route.ts 的 partial/fallback 自然答案。";
  }

  return "无需修改，当前回答已基本符合自然、简洁、直接的 ChatGPT 风格。";
}

function evaluateAnswer(question, answer) {
  const trimmed = answer.trim();
  const failures = [];
  const warnings = [];
  const mechanicalPhrasesFound = findMechanicalPhrases(trimmed);
  const answerLength = countChineseCharacters(trimmed);
  const businessKeywordsFound = BUSINESS_KEYWORDS.filter((keyword) => trimmed.includes(keyword));
  const startsBadly = BAD_STARTS.find((item) => trimmed.startsWith(item));

  if (!trimmed) {
    failures.push("空回答");
  }

  if (mechanicalPhrasesFound.length > 0) {
    failures.push(`包含机械化/调试表达：${mechanicalPhrasesFound.join("、")}`);
  }

  if (startsBadly) {
    failures.push(`回答开头不自然：${startsBadly}`);
  }

  if (answerLength > 1000) {
    failures.push(`回答过长：${answerLength} 个中文字符，超过 1000`);
  } else if (answerLength > 600) {
    warnings.push(`回答可能过长：${answerLength} 个中文字符，超过 600`);
  }

  if (question.includes("联创合伙人") && businessKeywordsFound.length < 2) {
    warnings.push(`联创合伙人业务关键词不足：仅命中 ${businessKeywordsFound.length} 个`);
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    mechanicalPhrasesFound,
    businessKeywordsFound,
    answerLength,
    suggestion: getSuggestion(failures, warnings)
  };
}

function makeFailureResult(question, failures, warnings = [], answer = "") {
  return {
    question,
    answer,
    passed: false,
    failures,
    warnings,
    mechanicalPhrasesFound: [],
    businessKeywordsFound: [],
    answerLength: countChineseCharacters(answer),
    suggestion: getSuggestion(failures, warnings)
  };
}

function ensureReportsDir() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function csvEscape(value) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, "\\n")}"`;
}

function writeReports(report) {
  ensureReportsDir();
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  const header = [
    "question",
    "passed",
    "answerLength",
    "failures",
    "warnings",
    "mechanicalPhrasesFound",
    "businessKeywordsFound",
    "answer"
  ];
  const rows = report.results.map((result) => [
    result.question,
    result.passed,
    result.answerLength,
    result.failures.join(" | "),
    result.warnings.join(" | "),
    result.mechanicalPhrasesFound.join(" | "),
    result.businessKeywordsFound.join(" | "),
    result.answer
  ].map(csvEscape).join(","));

  fs.writeFileSync(CSV_REPORT_PATH, [header.join(","), ...rows].join("\n"), "utf8");
}

function buildSummary(results) {
  return {
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    warnings: results.filter((item) => item.warnings.length > 0).length
  };
}

function printDivider() {
  console.log("=".repeat(96));
}

function printStartupInfo() {
  printDivider();
  console.log("ChatGPT 风格测试启动信息");
  console.log(`当前 serverUrl：${SERVER_URL}`);
  console.log(`是否检测到 RAG_TEST_COOKIE：${COOKIE_AUTH.detected ? "是" : "否"}`);
  console.log(`Cookie 来源：${COOKIE_AUTH.source}`);
  console.log(`Cookie 名称：${COOKIE_AUTH.name}`);
  console.log(`Cookie 值预览：${COOKIE_AUTH.maskedValue}`);

  if (COOKIE_AUTH.warning) {
    console.log(`Cookie 配置警告：${COOKIE_AUTH.warning}`);
  }
}

function printAuthTroubleshooting() {
  console.log("鉴权失败排查：");
  console.log(`- 当前 Cookie 名称：${COOKIE_AUTH.name || "未提供"}`);
  console.log("- 请确认浏览器 Application → Cookies 中复制的是 ai_kb_session 的完整 Value。");
  console.log(`- 请确认登录的是同一个本地地址，例如 ${SERVER_URL}。`);
  console.log("- 请重新登录后复制最新 Cookie。");
  console.log(`- PowerShell 示例：${getPowerShellCookieCommandExample()}`);
}

function printAuthCheckSummary(attempts) {
  console.log("登录状态检测：");

  if (!attempts.length) {
    console.log("- 未执行");
    return;
  }

  const existingAttempts = attempts.filter((attempt) => attempt.exists);

  if (!existingAttempts.length) {
    console.log("- /api/auth/session、/api/session、/api/me、/api/user 均未发现可用登录状态接口，继续测试 /api/chat。");
    return;
  }

  for (const attempt of attempts) {
    if (!attempt.exists) {
      continue;
    }

    console.log(`- ${attempt.path} => ${attempt.status} ${attempt.message ? `(${sanitize(attempt.message)})` : ""}`);

    if (attempt.responseText) {
      console.log(`  响应前 200 字：${attempt.responseText}`);
    }
  }
}

function printAttemptSummary(attempts) {
  console.log("接口探测记录：");

  for (const attempt of attempts) {
    console.log(`- ${attempt.path} => ${attempt.status} ${attempt.error ? `(${sanitize(attempt.error)})` : ""}`);

    if (attempt.responseText) {
      console.log(`  响应前 500 字：${attempt.responseText}`);
    }
  }
}

function printResult(result) {
  printDivider();
  console.log(`问题：${result.question}`);
  console.log("");
  console.log("回答：");
  console.log(result.answer || "(空)");
  console.log("");
  console.log(`是否通过：${result.passed ? "通过" : "失败"}`);
  console.log(`失败原因：${result.failures.length ? result.failures.join("；") : "无"}`);
  console.log(`警告：${result.warnings.length ? result.warnings.join("；") : "无"}`);
  console.log(`命中的机械化表达：${result.mechanicalPhrasesFound.length ? result.mechanicalPhrasesFound.join("、") : "无"}`);
  console.log(`命中的业务关键词：${result.businessKeywordsFound.length ? result.businessKeywordsFound.join("、") : "无"}`);
  console.log(`建议修改方向：${result.suggestion}`);
}

async function main() {
  const fetchImpl = await getFetch();
  printStartupInfo();
  const authChecks = await checkLoginState(fetchImpl);
  printAuthCheckSummary(authChecks);
  const discovery = await discoverApi(fetchImpl);
  let apiPath = "";
  let results = [];

  if (!discovery.candidate || !discovery.bodyBuilder || !discovery.probeResult) {
    const authAttempt = discovery.attempts.find((item) => item.path === "/api/chat" && (item.status === 401 || item.status === 403));
    const networkError = discovery.attempts.find((item) => item.status === "NETWORK_ERROR");

    apiPath = authAttempt ? "/api/chat (鉴权失败)" : "";
    const failure = networkError
      ? [
          `请求失败：${networkError.error}`,
          "如果 dev server 未启动，请先运行 pnpm dev -- -p 3001。"
        ]
      : authAttempt
        ? [
            "接口存在，但鉴权失败。",
            buildAuthFailureMessage(authAttempt.status)
          ]
      : [
          "无法找到可用问答接口。",
          "请检查问答 API 路径和响应结构。"
        ];

    results = QUESTIONS.map((question) => makeFailureResult(question, failure));

    const report = {
      timestamp: new Date().toISOString(),
      serverUrl: SERVER_URL,
      apiPath,
      auth: {
        cookieDetected: COOKIE_AUTH.detected,
        cookieSource: COOKIE_AUTH.source,
        cookieName: COOKIE_AUTH.name,
        cookieValuePreview: COOKIE_AUTH.maskedValue,
        checks: authChecks
      },
      summary: buildSummary(results),
      results
    };

    writeReports(report);
    printDivider();
    console.log("ChatGPT 风格测试报告");
    console.log(`服务地址：${SERVER_URL}`);
    console.log(`实际使用的问答 API 路径：${apiPath || "未找到可用接口"}`);
    printAttemptSummary(discovery.attempts);
    if (authAttempt) {
      printAuthTroubleshooting();
    }
    for (const result of results) {
      printResult(result);
    }
    printDivider();
    console.log(`JSON 报告：${JSON_REPORT_PATH}`);
    console.log(`CSV 报告：${CSV_REPORT_PATH}`);
    console.log("总体结果：失败");
    printDivider();
    process.exitCode = 1;
    return;
  }

  apiPath = discovery.candidate.path;
  results.push({
    question: QUESTIONS[0],
    answer: discovery.probeResult.answer,
    ...evaluateAnswer(QUESTIONS[0], discovery.probeResult.answer)
  });

  for (const question of QUESTIONS.slice(1)) {
    const response = await requestApi(fetchImpl, discovery.candidate, discovery.bodyBuilder, question);

    if (!response.ok) {
      results.push(makeFailureResult(question, [
        `请求失败：${response.error}`,
        response.responseText ? `响应前 500 字：${response.responseText}` : "无响应正文"
      ]));
      continue;
    }

    results.push({
      question,
      answer: response.answer,
      ...evaluateAnswer(question, response.answer)
    });
  }

  const report = {
    timestamp: new Date().toISOString(),
    serverUrl: SERVER_URL,
    apiPath,
    auth: {
      cookieDetected: COOKIE_AUTH.detected,
      cookieSource: COOKIE_AUTH.source,
      cookieName: COOKIE_AUTH.name,
      cookieValuePreview: COOKIE_AUTH.maskedValue,
      checks: authChecks
    },
    summary: buildSummary(results),
    results
  };
  const passed = report.summary.failed === 0;

  writeReports(report);
  printDivider();
  console.log("ChatGPT 风格测试报告");
  console.log(`服务地址：${SERVER_URL}`);
  console.log(`实际使用的问答 API 路径：${apiPath}`);
  console.log(`总数：${report.summary.total}；通过：${report.summary.passed}；失败：${report.summary.failed}；警告：${report.summary.warnings}`);

  for (const result of results) {
    printResult(result);
  }

  printDivider();
  console.log(`JSON 报告：${JSON_REPORT_PATH}`);
  console.log(`CSV 报告：${CSV_REPORT_PATH}`);
  console.log(`总体结果：${passed ? "通过" : "失败"}`);
  printDivider();
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  const result = makeFailureResult("脚本执行", [
    `脚本异常：${sanitize(error instanceof Error ? error.message : String(error))}`
  ]);
  const report = {
    timestamp: new Date().toISOString(),
    serverUrl: SERVER_URL,
    apiPath: "",
    summary: buildSummary([result]),
    results: [result]
  };

  writeReports(report);
  console.error("ChatGPT 风格测试脚本执行失败：");
  console.error(sanitize(error instanceof Error ? error.stack || error.message : String(error)));
  console.error(`JSON 报告：${JSON_REPORT_PATH}`);
  console.error(`CSV 报告：${CSV_REPORT_PATH}`);
  process.exitCode = 1;
});
