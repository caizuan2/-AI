# Netlify 环境变量配置

本文档列出 Netlify 部署当前项目需要填写的全部环境变量。

## 1. 填写位置

进入：

```text
Netlify Dashboard -> 你的站点 -> Site configuration -> Environment variables
```

建议只在 Production 环境填写生产数据库和生产密钥。

## 2. 完整变量列表

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20&schema=public"
DIRECT_URL="postgresql://postgres:your-url-encoded-db-password@db.your-project-ref.supabase.co:5432/postgres?schema=public"
SESSION_SECRET="use-a-long-random-session-secret"
LICENSE_SECRET="use-a-long-random-license-secret"
ADMIN_TOKEN="use-a-long-random-admin-token"
NETLIFY_BLOBS_SITE_ID="your-netlify-site-id"
NETLIFY_BLOBS_TOKEN="your-netlify-personal-access-token"
QWEN_API_KEY="sk-your-qwen-api-key"
QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL="qwen-plus"
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"
AI_PROVIDER="qwen"
AI_FALLBACK_PROVIDER="openai"
AI_SECONDARY_FALLBACK_PROVIDER="deepseek"
LLM_PROVIDER=""
LLM_MODEL=""
EMBEDDING_PROVIDER="openai"
EMBEDDING_MODEL=""
RAG_TOP_K="10"
RAG_MIN_SCORE="0.35"
RAG_SIMILARITY_THRESHOLD="0.35"
RAG_MAX_CONTEXT_CHUNKS="12"
RAG_MAX_CONTEXT_CHARS="12000"
RAG_ENABLE_RERANK="true"
OPENAI_CHAT_INPUT_COST_PER_1M="0.40"
OPENAI_CHAT_OUTPUT_COST_PER_1M="1.60"
OPENAI_EMBEDDING_COST_PER_1M="0.02"
JOBS_TIMEZONE="Asia/Shanghai"
CRON_SECRET="use-a-long-random-secret"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
NODE_ENV="production"
NODE_VERSION="22"
```

## 3. 变量说明

- `DATABASE_URL`：运行时数据库连接串，必须使用 Supabase Pooler 完整 URI，不要只把 direct connection 的端口改成 `6543`。
- `DIRECT_URL`：Prisma CLI 迁移连接串，必须使用 Supabase Direct 完整 URI。`prisma migrate deploy` 会通过它执行 DDL。
- `SESSION_SECRET`：用于 session token，生产环境必须配置为长随机字符串。
- `LICENSE_SECRET`：用于 Netlify Functions 卡密 HMAC-SHA256 hash，生产环境必须单独配置。
- `ADMIN_TOKEN`：用于 `/admin/licenses` 调用 `/api/admin/*` 卡密管理接口，生产环境必须配置。
- `NETLIFY_BLOBS_SITE_ID`：Netlify Site ID。若 Functions 未自动注入 Blobs 上下文，则必须配置。
- `NETLIFY_BLOBS_TOKEN`：Netlify Personal Access Token。若 Functions 未自动注入 Blobs 上下文，则必须配置。
- `QWEN_API_KEY` / `QWEN_MODEL`：Qwen 生成 provider，可作为默认业务问答模型。
- `OPENAI_API_KEY`：OpenAI API key；默认用于 embedding，也可作为生成兜底 provider。
- `OPENAI_MODEL`：OpenAI 生成模型，建议 `gpt-4.1-mini`。
- `OPENAI_EMBEDDING_MODEL`：embedding 模型，建议 `text-embedding-3-small`。
- `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`：DeepSeek 生成 provider，可作为第二兜底。
- `AI_PROVIDER`、`AI_FALLBACK_PROVIDER`、`AI_SECONDARY_FALLBACK_PROVIDER`：生成模型调用顺序。
- `LLM_PROVIDER` / `LLM_MODEL`：兼容别名；原生 `AI_PROVIDER` 和具体模型变量优先。
- `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL`：embedding 兼容别名；当前 embedding provider 为 `openai`。
- `RAG_TOP_K`：初次召回条数，建议 10。
- `RAG_MIN_SCORE` / `RAG_SIMILARITY_THRESHOLD`：最低相似度阈值，二者兼容；建议 0.25-0.45。
- `RAG_MAX_CONTEXT_CHUNKS`、`RAG_MAX_CONTEXT_CHARS`：最终传入大模型的片段数量和上下文长度上限。
- `RAG_ENABLE_RERANK`：是否启用本地重排序，默认 true。
- `OPENAI_CHAT_INPUT_COST_PER_1M`：输入 token 成本估算。
- `OPENAI_CHAT_OUTPUT_COST_PER_1M`：输出 token 成本估算。
- `OPENAI_EMBEDDING_COST_PER_1M`：embedding token 成本估算。
- `JOBS_TIMEZONE`：后台任务日志和本地 worker 使用的时区，建议 `Asia/Shanghai`。
- `CRON_SECRET`：保护 HTTP Job 接口的随机密钥。
- `ADMIN_PHONES`：管理员手机号，必须使用 E.164 格式，多个手机号用英文逗号分隔。
- `ADMIN_USER_IDS`：管理员用户 id，多个 ID 用英文逗号分隔。
- `NODE_ENV`：生产环境填写 `production`。
- `NODE_VERSION`：Netlify Node.js 版本，填写 `22`。

## 4. 敏感变量

以下变量必须作为敏感配置管理，不要提交到代码仓库：

```text
DATABASE_URL
DIRECT_URL
SESSION_SECRET
QWEN_API_KEY
OPENAI_API_KEY
DEEPSEEK_API_KEY
CRON_SECRET
LICENSE_SECRET
ADMIN_TOKEN
NETLIFY_BLOBS_TOKEN
```

可以用 Node.js 生成 `SESSION_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 5. 本地与生产区别

本地开发使用：

```text
.env
```

Netlify 生产环境使用：

```text
Netlify Dashboard -> Site configuration -> Environment variables
```

本地可以使用 mock fallback；生产环境必须至少配置一个真实生成 provider。向量检索建议配置真实 `OPENAI_API_KEY` 和 `OPENAI_EMBEDDING_MODEL`，否则系统会退到关键词召回，检索质量会下降。

## 6. 配置检查

部署前确认：

- `DATABASE_URL` 是 Supabase Pooler URI，host 形如 `aws-0-region.pooler.supabase.com`，端口为 `6543`，并包含 `pgbouncer=true`。
- `DIRECT_URL` 是 Supabase Direct URI，host 形如 `db.your-project-ref.supabase.co`，端口为 `5432`。
- `DATABASE_URL` / `DIRECT_URL` 都替换了真实数据库密码，且密码已 URL encode。
- `SESSION_SECRET` 已配置，且不要和其他项目共用。
- `LICENSE_SECRET` 已配置，且后续不要随意更换，否则旧卡密 hash 会不匹配。
- `ADMIN_TOKEN` 已配置，用于登录 `/admin/licenses` 页面后操作卡密。
- 如果 `/api/admin/health` 返回 `BLOBS_TEST_FAILED` 且 message 提到 `siteID, token`，请配置 `NETLIFY_BLOBS_SITE_ID` 和 `NETLIFY_BLOBS_TOKEN`。
- 至少一个生成 provider key 可用；`OPENAI_API_KEY` 具备调用 embedding model 的权限。
- `CRON_SECRET` 是随机长字符串。
- `ADMIN_PHONES` 或 `ADMIN_USER_IDS` 至少配置一种管理员身份。
- 线上卡密必须在 `/admin/licenses` 生成，或用 `/api/admin/generate` 生成，不再使用本地 Flask/SQLite 或 Prisma 脚本作为生产卡密来源。
- 执行过 `pnpm prisma:migrate:deploy`，并用 `pnpm db:check` 确认 `users`、`sessions`、`license_keys`、`knowledge_chunks` 表存在。

如果线上 `/api/health` 返回 `database:false`，说明 `DATABASE_URL` 缺失、连接失败，或生产 migration 尚未应用，按 [Netlify 数据库修复指南](./fix-netlify-database.md) 排查。
