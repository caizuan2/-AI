# AI 知识库 App

版本：v1.0.0

AI 知识库 App 是一个“对话式投喂型知识库”。你可以把会议纪要、网页资料、文档、客服对话、销售话术或个人笔记投喂给系统，系统会自动整理为标题、摘要、标签、分类、重要度和质量评分。入库后，你可以直接向知识库提问，并获得带引用来源的中文回答。

## 已支持功能

- 手机号 + 密码注册、登录、退出登录。
- 登录后通过卡密激活，未激活用户不能访问核心知识库功能。
- 文本投喂、网页 URL 投喂、文件上传投喂。
- AI 自动整理标题、摘要、标签、分类、重要度和质量评分。
- 手动确认入库、AI 判断后自动入库、仅分析不入库三种保存策略。
- 相似知识检测、知识合并、合并历史。
- 知识列表搜索、标签筛选、分类筛选、状态筛选、质量排序。
- 知识详情查看、编辑、删除、来源追踪、质量提示、AI 补全建议。
- 基于知识库的 RAG 问答，回答包含引用编号和来源卡片。
- 标签管理、分类管理、知识复习、过期检测。
- JSON、Markdown、CSV 导出，以及 JSON 导入和重复检测。
- 统一 API 错误处理、用户数据隔离、rate limit、RAG prompt injection 防护。
- Netlify + PostgreSQL + pgvector 部署配置。

## 主要页面

- `/login`：手机号登录。
- `/register`：手机号注册。
- `/unlock`：输入卡密激活知识库。
- `/ingest`：投喂文本或网页链接。
- `/upload`：上传 `txt`、`md`、`pdf`、`docx` 文件。
- `/knowledge`：查看、搜索和筛选知识。
- `/knowledge/[id]`：查看详情、编辑、删除、补全知识。
- `/chat`：基于知识库提问。
- `/settings`：保存策略、过期周期、导入导出。
- `/tags`：标签管理。
- `/categories`：分类管理。
- `/review`：知识复习。
- `/admin`：管理后台，仅管理员可访问。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui 风格基础组件
- Prisma
- PostgreSQL
- pgvector
- OpenAI API
- node-cron / Netlify Scheduled Functions

## 本地启动

项目使用 `pnpm@10.12.4` 和 Node.js 22。

```bash
pnpm install
cp .env.example .env
```

准备 PostgreSQL + pgvector 数据库后执行：

```bash
pnpm exec prisma migrate dev
pnpm prisma:generate
pnpm dev
```

打开：

```text
http://localhost:3000
```

## 环境变量

复制 `.env.example` 到 `.env` 后填写：

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20&schema=public"
DIRECT_URL="postgresql://postgres:your-url-encoded-db-password@db.your-project-ref.supabase.co:5432/postgres?schema=public"
SESSION_SECRET="replace-with-a-long-random-session-secret"
LICENSE_SECRET="replace-with-a-long-random-license-secret"
ADMIN_TOKEN="replace-with-a-long-random-admin-token"
QWEN_API_KEY="sk-your-qwen-api-key"
QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL="qwen-plus"
OPENAI_API_KEY="sk-your-openai-api-key"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"
AI_PROVIDER="qwen"
AI_FALLBACK_PROVIDER="openai"
AI_SECONDARY_FALLBACK_PROVIDER="deepseek"
RAG_TOP_K="8"
RAG_MIN_SCORE="0.72"
RAG_MAX_CONTEXT_CHARS="12000"
RAG_CACHE_TTL_SECONDS="3600"
RATE_LIMIT_PER_USER_PER_MINUTE="20"
RATE_LIMIT_GLOBAL_PER_MINUTE="500"
INGEST_MAX_CHUNK_CHARS="1200"
INGEST_CHUNK_OVERLAP_CHARS="150"
INGEST_BATCH_SIZE="20"
JOBS_TIMEZONE="Asia/Shanghai"
CRON_SECRET="replace-with-a-random-string"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
NODE_ENV="production"
NODE_VERSION="22"
```

说明：

- `DATABASE_URL`：Prisma Client 运行时连接地址，Netlify 生产环境必须使用 Supabase Pooler 完整 URI。
- `DIRECT_URL`：Prisma CLI 迁移连接地址，生产环境必须使用 Supabase Direct 完整 URI。
- `SESSION_SECRET`：用于 session token，生产环境必须填写长随机字符串。
- `LICENSE_SECRET`：用于 Netlify Functions 卡密 HMAC-SHA256 hash，生产环境必须填写 32 位以上随机字符串。
- `ADMIN_TOKEN`：用于 `/admin/licenses` 调用 Netlify 卡密管理接口，生产环境必须填写长随机 token。
- `QWEN_API_KEY`：Qwen / 千问 API key，默认生成 provider 使用它。
- `QWEN_BASE_URL`：Qwen OpenAI-compatible base URL，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`。
- `QWEN_MODEL`：Qwen 生成模型，建议 `qwen-plus`，低成本场景可改 `qwen-flash`。
- `OPENAI_API_KEY`：OpenAI API key。用于高质量生成兜底和默认 embedding；生产环境必须配置真实 key。
- `OPENAI_BASE_URL`：OpenAI-compatible base URL，默认 `https://api.openai.com/v1`。
- `OPENAI_MODEL`：高质量兜底生成模型，建议 `gpt-4.1-mini`。
- `OPENAI_EMBEDDING_MODEL`：默认 embedding 模型，建议 `text-embedding-3-small`。DeepSeek 不作为 embedding provider。
- `DEEPSEEK_API_KEY`：DeepSeek chat provider key，可作为低成本生成/分析模型。
- `DEEPSEEK_BASE_URL`：DeepSeek OpenAI-compatible base URL，默认 `https://api.deepseek.com`。
- `DEEPSEEK_MODEL`：DeepSeek 生成模型，建议 `deepseek-chat`。
- `AI_PROVIDER`：主生成 provider，可选 `qwen`、`openai` 或 `deepseek`，默认 `qwen`。
- `AI_FALLBACK_PROVIDER`：主 provider 失败时的第一兜底 provider，建议 `openai`。
- `AI_SECONDARY_FALLBACK_PROVIDER`：第二兜底 provider，建议 `deepseek`。
- `RAG_TOP_K`、`RAG_MIN_SCORE`、`RAG_MAX_CONTEXT_CHARS`：RAG 检索条数、最低分数和上下文长度上限。
- `RAG_CACHE_TTL_SECONDS`：RAG 答案缓存时间，默认 3600 秒。
- `RATE_LIMIT_PER_USER_PER_MINUTE`、`RATE_LIMIT_GLOBAL_PER_MINUTE`：用户级和全局限流。
- `INGEST_MAX_CHUNK_CHARS`、`INGEST_CHUNK_OVERLAP_CHARS`、`INGEST_BATCH_SIZE`：投喂 chunk 切分和 embedding 批处理参数。
- `JOBS_TIMEZONE`：后台任务时区，默认建议 `Asia/Shanghai`。
- `CRON_SECRET`：后台任务 HTTP 接口密钥，生产环境必须配置。
- `ADMIN_PHONES`：允许访问 `/admin` 的管理员手机号，建议使用 E.164 格式，多个手机号用英文逗号分隔。
- `ADMIN_USER_IDS`：允许访问 `/admin` 的用户 id，多个 ID 用英文逗号分隔。

不要把真实 key 写进代码或提交到仓库。

## 数据库初始化

本地可以用 Docker 快速启动 pgvector 数据库：

```bash
docker run --name ai-kb-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=ai_knowledge_base \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16
```

然后执行迁移：

```bash
pnpm exec prisma migrate dev
pnpm prisma:generate
```

生产环境执行：

```bash
export DATABASE_URL="你的 Supabase Pooler 完整 URI"
export DIRECT_URL="你的 Supabase Direct 完整 URI"
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
pnpm db:check
```

主要数据表：

- `users`
- `sessions`
- `license_keys`
- `conversations`
- `messages`
- `user_settings`
- `knowledge_items`
- `knowledge_chunks`
- `knowledge_merge_histories`
- `knowledge_completion_suggestions`

## 卡密生成与激活

生产环境卡密闭环使用同一个 Netlify 站点内的 Functions + Netlify Blobs：

```text
后台页面: /admin/licenses
健康检查: /api/admin/health
生成卡密: /api/admin/generate
查询卡密: /api/admin/check-code
激活卡密: /api/activate
```

在 Netlify 后台设置 `LICENSE_SECRET` 和 `ADMIN_TOKEN` 后重新部署。打开 `/admin/licenses`，输入 `ADMIN_TOKEN`，点击“检查连接”，然后生成新卡密。生成的新卡密会写入 Netlify Blobs，同站点 `/unlock` 激活页可以立即使用。

旧的 `pnpm license:generate` 仍保留给本地 Prisma 表测试，不再作为线上生产卡密生成入口。

## 演示数据

项目提供 Prisma seed 脚本：

```bash
pnpm prisma:seed
```

seed 会创建一个已激活的本地 demo 用户，并生成 20 条示例知识和 5 条示例问答记录。

```text
Demo user phone: +8613812345678
Demo user password: demo-password-123
```

seed 可以重复执行。每次执行会先清理 demo 用户名下旧的示例知识和问答，再重建演示数据，不会清理其他用户的数据。

## pgvector

`KnowledgeChunk.embedding` 使用 Prisma 的 unsupported 类型：

```prisma
embedding Unsupported("vector(1536)")?
```

迁移会启用 pgvector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

没有 OpenAI key 或 embedding 不可用时，本地开发会降级为关键词检索；生产环境需要配置真实 OpenAI key。

Qwen、OpenAI、DeepSeek 仅用于生成能力，默认不用于 embedding。大规模生产检索建议继续使用 OpenAI `text-embedding-3-small` + pgvector HNSW/IVFFlat 索引。

## 常用命令

```bash
pnpm dev                         # 启动开发服务器
pnpm build                       # 生产构建
pnpm start                       # 启动生产服务
pnpm lint                        # ESLint 检查
pnpm typecheck                   # TypeScript 类型检查
pnpm test:security               # RAG prompt injection 防护测试
pnpm test:production-license -- https://your-site.netlify.app YOUR_ADMIN_TOKEN
pnpm jobs                        # 启动本地后台任务 worker
pnpm jobs:once                   # 手动执行一次后台任务
pnpm prisma:seed                 # 创建演示数据
pnpm license:generate --count 10 # 仅本地 Prisma 表测试卡密
pnpm prisma:generate             # 生成 Prisma Client
pnpm prisma:format               # 格式化 Prisma schema
pnpm db:check                    # 检查生产数据库、pgvector 和关键数据表
pnpm ingest:schema:check         # 检查投喂依赖表和字段
pnpm rag:check                   # dry-run 检查 RAG env/database/schema/vector/provider 配置
pnpm prisma:migrate:create -- --name change-name
pnpm prisma:migrate:deploy       # 部署迁移
pnpm prisma:studio               # 打开 Prisma Studio
```

## Netlify 部署

详细步骤见：

- [Netlify 部署指南](./docs/netlify-deploy.md)
- [Netlify 环境变量](./docs/netlify-env.md)
- [Netlify 数据库修复指南](./docs/fix-netlify-database.md)

Netlify 构建配置：

```text
Build command: pnpm prisma:generate && pnpm build
Publish directory: .next
Functions directory: netlify/functions
Node version: 22
```

生产数据库迁移不要阻塞 Netlify Build。优先在本机或 CI 对生产数据库执行：

```bash
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

如果生产库出现 `DATABASE_SCHEMA_MISSING`，可以用管理员 token 调用 Netlify Function 幂等补齐缺失表结构：

```bash
curl -X POST "https://你的站点/api/admin/db-repair" \
  -H "x-admin-token: 你的_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"confirm\":\"REPAIR_DATABASE_SCHEMA\"}"
```

## API 行为

所有业务 API 使用统一 JSON 返回：

```json
{
  "success": true,
  "data": {}
}
```

错误返回：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不正确。"
  }
}
```

核心 API 会先校验登录用户，再检查卡密激活状态。未登录返回 401，未激活返回“请先输入卡密激活知识库。”

## 安全说明

- 不保存明文密码，密码使用 bcrypt hash。
- 不保存明文卡密，卡密使用 hash 校验。
- Session 使用 HttpOnly Cookie，数据库只保存 token hash。
- 核心页面和 API 都需要登录并激活卡密。
- 知识数据按 `userId` 隔离。
- pgvector raw SQL 使用 Prisma 参数化查询。
- 文件上传限制类型和大小。
- RAG prompt 明确区分系统指令、用户问题和检索上下文。
- 知识内容中的“忽略之前指令”等文本不会改变系统指令。
- 不会把 OpenAI API key 暴露给前端。

## v1.0.0 暂未包含

- 多轮对话历史持久化到 `conversations` / `messages` 主流程。
- 团队空间、组织、多角色权限和审计日志。
- 知识图谱、语音导入、微信导入、浏览器插件。
- Redis / Upstash 分布式限流。
- 长文档和批量任务的完整异步队列。
- 生产级监控告警和完整端到端自动化测试套件。

## 发布文档

- [CHANGELOG](./CHANGELOG.md)
- [v1.0.0 发布说明](./docs/release-v1.md)
- [生产上线检查清单](./docs/production-checklist.md)
- [生产日志与监控](./docs/monitoring.md)
