#!/usr/bin/env node

const DEFAULT_SERVER_URL = "http://localhost:3001";
const SERVER_URL = (process.env.RAG_TEST_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/+$/, "");
const TEST_QUESTIONS = [
  "联创合伙人",
  "联创合伙人计划的资格要求是什么？",
  "新伙伴问我怎么成为联创合伙人，我应该怎么说？"
];

const API_CANDIDATES = [
  {
    path: "/api/chat",
    buildBody: (question) => ({ question })
  },
  {
    path: "/api/knowledge/query",
    buildBody: (question) => ({ query: question, topK: 10 })
  },
  {
    path: "/api/knowledge/qa",
    buildBody: (question) => ({ question })
  },
  {
    path: "/api/qa",
    buildBody: (question) => ({ question })
  },
  {
    path: "/chat",
    buildBody: (question) => ({ question })
  }
];

const MECHANICAL_PATTERNS = [
  { label: "只找到", pattern: /只找到/ },
  { label: "少于请求", pattern: /少于请求/ },
  { label: "引用来源", pattern: /引用来源/ },
  { label: "Provider", pattern: /\bprovider\b/i },
  { label: "Model", pattern: /\bmodel\b/i },
  { label: "fallback", pattern: /\bfallback\b/i },
  { label: "chunk", pattern: /\bchunk\b/i },
  { label: "检索", pattern: /检索/ },
  { label: "相似度", pattern: /相似度/ },
  { label: "score", pattern: /\bscore\b/i },
  { label: "source", pattern: /\bsource\b/i },
  { label: "sources", pattern: /\bsources\b/i },
  { label: "根据知识库显示", pattern: /根据知识库显示/ },
  { label: "作为 AI", pattern: /作为\s*AI/i },
  { label: "综上所述", pattern: /综上所述/ },
  { label: "我无法", pattern: /我无法/ },
  { label: "暂无可引用知识", pattern: /暂无可引用知识/ },
  { label: "没有找到足够依据", pattern: /没有找到足够依据/ }
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
  "话术"
];

function sanitize(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***");
}

function truncate(value, maxLength = 700) {
  const text = sanitize(value);

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function getFetch() {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  try {
    const imported = await import("node-fetch");

    return imported.default;
  } catch {
    throw new Error("当前 Node 环境不支持 global fetch，且项目未安装 node-fetch。请使用 Node 18+，本项目 engines 要求 Node >=22.13.0。");
  }
}

function buildHeaders() {
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  const cookie = process.env.RAG_TEST_COOKIE?.trim();
  const authorization = process.env.RAG_TEST_AUTHORIZATION?.trim();

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (authorization) {
    headers.Authorization = authorization;
  }

  return headers;
}

async function readResponseBody(response) {
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

function readPath(object, path) {
  return path.reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return current[key];
    }

    return undefined;
  }, object);
}

function extractAnswer(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = [
    ["answer"],
    ["content"],
    ["message"],
    ["data", "answer"],
    ["data", "content"],
    ["result", "answer"]
  ];

  for (const path of candidates) {
    const value = readPath(payload, path);

    if (typeof value === "string") {
      return value.trim();
    }
  }

  return "";
}

async function requestQuestion(fetchImpl, candidate, question) {
  const url = `${SERVER_URL}${candidate.path}`;
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(candidate.buildBody(question)),
      redirect: "manual"
    });
  } catch (error) {
    return {
      ok: false,
      path: candidate.path,
      status: "NETWORK_ERROR",
      answer: "",
      error: error instanceof Error ? error.message : String(error),
      responseText: ""
    };
  }

  const body = await readResponseBody(response);
  const location = response.headers.get("location");

  if (!response.ok) {
    return {
      ok: false,
      path: candidate.path,
      status: response.status,
      answer: "",
      error: location ? `HTTP ${response.status}, Location: ${location}` : `HTTP ${response.status}`,
      responseText: truncate(body.text || "(empty response)")
    };
  }

  if (body.json && (body.json.ok === false || body.json.success === false)) {
    return {
      ok: false,
      path: candidate.path,
      status: response.status,
      answer: "",
      error: truncate(body.json.message || body.json.error?.message || "API returned ok=false."),
      responseText: truncate(body.text)
    };
  }

  const answer = body.json ? extractAnswer(body.json) : "";

  if (!answer) {
    return {
      ok: false,
      path: candidate.path,
      status: response.status,
      answer: "",
      error: "接口响应成功，但未在 answer/content/message/data.answer/data.content/result.answer 中找到回答字段。",
      responseText: truncate(body.text)
    };
  }

  return {
    ok: true,
    path: candidate.path,
    status: response.status,
    answer,
    error: "",
    responseText: truncate(body.text)
  };
}

async function discoverApi(fetchImpl) {
  const attempts = [];
  const probeQuestion = TEST_QUESTIONS[0];

  for (const candidate of API_CANDIDATES) {
    const result = await requestQuestion(fetchImpl, candidate, probeQuestion);

    attempts.push(result);

    if (result.ok) {
      return {
        candidate,
        probeResult: result,
        attempts
      };
    }
  }

  return {
    candidate: null,
    probeResult: null,
    attempts
  };
}

function countChineseCharacters(text) {
  return (text.match(/[\u3400-\u9fff]/g) || []).length;
}

function evaluateAnswer(question, answer) {
  const trimmed = answer.trim();
  const mechanicalMatches = MECHANICAL_PATTERNS
    .filter((item) => item.pattern.test(trimmed))
    .map((item) => item.label);
  const matchedBusinessKeywords = BUSINESS_KEYWORDS.filter((keyword) => trimmed.includes(keyword));
  const missingBusinessKeywords = question.includes("联创合伙人") && matchedBusinessKeywords.length < 2;
  const tooLong = countChineseCharacters(trimmed) > 500;
  const empty = trimmed.length === 0;
  const suggestions = [];

  if (empty) {
    suggestions.push("接口返回了空回答，先检查 API 返回字段或生成链路。");
  }

  if (mechanicalMatches.length > 0) {
    suggestions.push("继续收紧 RAG system prompt 和 answer 清洗逻辑，移除调试/引用/检索相关表达。");
  }

  if (tooLong) {
    suggestions.push("回答可能过长，建议在 prompt 中要求普通业务问题用 1-3 段直接回答。");
  }

  if (missingBusinessKeywords) {
    suggestions.push("回答缺少联创合伙人业务关键点，建议检查召回内容、fallback 文案或业务大脑 prompt。");
  }

  if (suggestions.length === 0) {
    suggestions.push("无需修改，当前回答已基本符合自然、简洁、直接的 ChatGPT 风格。");
  }

  return {
    pass: !empty && mechanicalMatches.length === 0 && !tooLong && !missingBusinessKeywords,
    empty,
    tooLong,
    mechanicalMatches,
    matchedBusinessKeywords,
    missingBusinessKeywords,
    suggestions
  };
}

function printDivider() {
  console.log("=".repeat(88));
}

function printDiscoveryFailure(attempts) {
  printDivider();
  console.log("ChatGPT 风格测试：接口发现失败");
  console.log(`服务地址：${SERVER_URL}`);
  console.log("");

  for (const attempt of attempts) {
    console.log(`- ${attempt.path}`);
    console.log(`  状态：${attempt.status}`);
    console.log(`  错误：${sanitize(attempt.error || "未知错误")}`);

    if (attempt.responseText) {
      console.log(`  响应：${attempt.responseText}`);
    }
  }

  console.log("");
  console.log("建议修改方向：");
  console.log("- 确认本地服务已启动，例如 pnpm dev -- -p 3001。");
  console.log("- 当前项目真实问答接口是 POST /api/chat，请确认登录态可用。");
  console.log("- 如果接口需要登录，请设置 RAG_TEST_COOKIE 后再运行，例如 PowerShell: $env:RAG_TEST_COOKIE='你的 cookie'; pnpm test:chatgpt-style。");
  printDivider();
}

function printQuestionReport(result) {
  printDivider();
  console.log(`问题：${result.question}`);
  console.log("");
  console.log("回答：");
  console.log(result.answer || "(空)");
  console.log("");
  console.log(`是否通过：${result.evaluation.pass ? "通过" : "失败"}`);
  console.log(`命中的机械化表达：${result.evaluation.mechanicalMatches.length > 0 ? result.evaluation.mechanicalMatches.join("、") : "无"}`);
  console.log(`是否缺少业务关键词：${result.evaluation.missingBusinessKeywords ? "是" : "否"}`);
  console.log(`命中的业务关键词：${result.evaluation.matchedBusinessKeywords.length > 0 ? result.evaluation.matchedBusinessKeywords.join("、") : "无"}`);

  if (result.evaluation.tooLong) {
    console.log("长度提示：回答可能过长");
  }

  console.log("建议修改方向：");
  for (const suggestion of result.evaluation.suggestions) {
    console.log(`- ${suggestion}`);
  }
}

async function main() {
  const fetchImpl = await getFetch();
  const discovery = await discoverApi(fetchImpl);

  if (!discovery.candidate || !discovery.probeResult) {
    printDiscoveryFailure(discovery.attempts);
    process.exitCode = 1;
    return;
  }

  const results = [];
  results.push({
    question: TEST_QUESTIONS[0],
    answer: discovery.probeResult.answer,
    evaluation: evaluateAnswer(TEST_QUESTIONS[0], discovery.probeResult.answer)
  });

  for (const question of TEST_QUESTIONS.slice(1)) {
    const response = await requestQuestion(fetchImpl, discovery.candidate, question);

    if (!response.ok) {
      results.push({
        question,
        answer: "",
        evaluation: {
          pass: false,
          empty: true,
          tooLong: false,
          mechanicalMatches: [],
          matchedBusinessKeywords: [],
          missingBusinessKeywords: true,
          suggestions: [
            `接口请求失败：${response.error}`,
            response.responseText ? `响应摘要：${response.responseText}` : "无响应正文。"
          ]
        }
      });
      continue;
    }

    results.push({
      question,
      answer: response.answer,
      evaluation: evaluateAnswer(question, response.answer)
    });
  }

  const passed = results.every((result) => result.evaluation.pass);

  printDivider();
  console.log("ChatGPT 风格测试报告");
  console.log(`服务地址：${SERVER_URL}`);
  console.log(`实际使用的问答 API 路径：${discovery.candidate.path}`);
  console.log(`测试问题数：${results.length}`);
  console.log(`总体结果：${passed ? "通过" : "失败"}`);

  for (const result of results) {
    printQuestionReport(result);
  }

  printDivider();
  console.log(passed
    ? "结论：回答已基本符合 ChatGPT 风格。"
    : "结论：仍有回答不符合 ChatGPT 风格，请按上方建议继续调整 prompt、API 输出清洗或前端渲染。");
  printDivider();

  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  console.error("ChatGPT 风格测试脚本执行失败：");
  console.error(sanitize(error instanceof Error ? error.stack || error.message : String(error)));
  process.exitCode = 1;
});
