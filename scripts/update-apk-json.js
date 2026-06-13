const fs = require("fs");

const path = "public/releases/latest.json";

const raw = fs.readFileSync(path, "utf-8");
const json = JSON.parse(raw || "{}");

// 安全初始化（关键）
if (!json.user) json.user = {};

json.user.apk_url =
  "https://github.com/caizuan2/-AI/releases/latest/download/ai-knowledge-chat-latest.apk";

json.user.build = (json.user.build || 102) + 1;
json.user.version = "1.0." + json.user.build;

json.updated_at = new Date().toISOString();

fs.writeFileSync(path, JSON.stringify(json, null, 2));

console.log("✅ latest.json 已更新");
