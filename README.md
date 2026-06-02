# AI 知识库 App

版本：v1.0.0

AI 知识库 App 是一个“对话式投喂型知识库”。你可以把会议纪要、网页资料、文档、客服对话、销售话术或个人笔记投喂给系统，系统会自动整理为标题、摘要、标签、分类、重要度和质量评分。入库后，你可以直接向知识库提问，并获得带引用来源的中文回答。

## 适合谁使用

- 个人或小团队想把零散资料整理成可搜索、可问答的知识库。
- 产品、运营、销售、客服等角色需要沉淀 FAQ、话术、流程和复盘材料。
- 开发者想要一个 Next.js + Prisma + pgvector + OpenAI 的 RAG MVP 起点。

## v1.0.0 已支持

- 手机号短信验证码登录、注册、退出登录。
- 文本投喂、网页 URL 投喂、文件上传投喂。
- AI 自动整理标题、摘要、标签、分类、重要度和质量评分。
- 手动确认入库、AI 判断后自动入库、仅分析不入库三种保存策略。
- 相似知识检测、合并到已有知识、合并历史。
- 知识列表搜索、标签筛选、分类筛选、状态筛选、质量排序。
- 知识详情查看、编辑、删除、来源追踪、质量提示、AI 补全建议。
- 基于知识库的 RAG 问答，回答包含引用编号和来源卡片。
- 标签管理、分类管理、知识复习、过期检测。
- JSON、Markdown、CSV 导出，以及 JSON 导入和重复检测。
- 统一 API 错误处理、用户数据隔离、rate limit、RAG prompt injection 防护。
- Vercel / Netlify + Supabase 部署配置和生产上线检查清单。

## 主要页面

- `/login`：手机号登录。
- `/register`：手机号注册。
- `/verify`：短信验证码验证。
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
- `/waitlist`：Beta 灰度等待页，未开通用户登录后会进入这里。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui 风格基础组件
- Prisma
- PostgreSQL
- pgvector
- Supabase Auth Phone OTP
- OpenAI API
- node-cron / Vercel Cron / Netlify Scheduled Functions

## 本地启动

项目使用 pnpm。

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

本地和生产环境都使用 Supabase Phone Auth。请先在 Supabase 创建项目，启用 Phone provider，并填写 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

## 环境变量

复制 `.env.example` 到 `.env` 后填写：

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
OPENAI_API_KEY="sk-your-openai-api-key"
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
JOBS_TIMEZONE="Asia/Shanghai"
CRON_SECRET="replace-with-a-random-string"
ADMIN_EMAILS="admin@example.com"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
```

说明：

- `DATABASE_URL`：PostgreSQL 连接地址，生产环境必填。Netlify 生产环境不能使用 localhost。
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase anon key，不要使用 service role key。
- `OPENAI_API_KEY`：OpenAI API key。没有 key 时仅本地开发可使用 mock / fallback；生产环境必须配置真实 key。
- `OPENAI_MODEL`：知识整理和问答模型。
- `OPENAI_EMBEDDING_MODEL`：embedding 模型。
- `JOBS_TIMEZONE`：后台任务时区，默认建议 `Asia/Shanghai`。
- `CRON_SECRET`：Vercel Cron 调用后台任务 API 的密钥，生产环境必须配置。
- `ADMIN_EMAILS`：允许访问 `/admin` 的管理员邮箱，多个邮箱用英文逗号分隔，保留用于历史账号兼容。
- `ADMIN_PHONES`：允许访问 `/admin` 的管理员手机号，必须使用 E.164 格式，多个手机号用英文逗号分隔。
- `ADMIN_USER_IDS`：允许访问 `/admin` 的 Supabase user id，多个 ID 用英文逗号分隔。

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

### 演示数据

项目提供 Prisma seed 脚本：

```bash
pnpm prisma:seed
```

或使用 Prisma 原生命令：

```bash
pnpm exec prisma db seed
```

seed 会创建一个本地 demo 用户，并生成 20 条示例知识和 5 条示例问答记录。示例知识覆盖客户成功、销售赋能、客服支持、产品资料、研发流程、AI 使用规范、市场运营、内部流程、数据分析、安全合规、知识库运营等分类和标签。

seed 可以重复执行。每次执行会先清理 demo 用户名下旧的示例知识和问答，再重建演示数据，不会清理其他用户的数据。登录仍需通过 Supabase Phone Auth 创建对应手机号账号。

生产环境执行：

```bash
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

主要数据表：

- `users`
- `conversations`
- `messages`
- `user_settings`
- `knowledge_items`
- `knowledge_chunks`
- `knowledge_merge_histories`
- `knowledge_completion_suggestions`

## pgvector

`KnowledgeChunk.embedding` 使用 Prisma 的 unsupported 类型：

```prisma
embedding Unsupported("vector(1536)")?
```

迁移会启用 pgvector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

并创建 HNSW cosine 索引：

```sql
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx"
ON "knowledge_chunks"
USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;
```

没有 OpenAI key 或 embedding 不可用时，系统会降级为关键词检索。

## 常用命令

```bash
pnpm dev                         # 启动开发服务器
pnpm build                       # 生产构建
pnpm start                       # 启动生产服务
pnpm lint                        # ESLint 检查
pnpm typecheck                   # TypeScript 类型检查
pnpm test:security               # RAG prompt injection 防护测试
pnpm jobs                        # 启动本地后台任务 worker
pnpm jobs:once                   # 手动执行一次后台任务
pnpm prisma:seed                 # 创建演示数据
pnpm prisma:generate             # 生成 Prisma Client
pnpm prisma:format               # 格式化 Prisma schema
pnpm db:check                    # 检查生产数据库、pgvector 和关键数据表
pnpm prisma:migrate:create -- --name change-name
pnpm prisma:migrate:deploy       # 部署迁移
pnpm prisma:studio               # 打开 Prisma Studio
```

## 后台任务

本地或自托管环境可以运行：

```bash
pnpm jobs
```

后台任务包括：

- 检查过期知识，将到期的 `active` 知识标记为 `stale`。
- 为低质量知识刷新补全建议。
- 清理孤立的 `knowledge_chunks`。
- 输出带任务名、时间和执行结果的日志。

Vercel 不运行长驻 worker，改用 `vercel.json` 中的 Cron 配置调用：

- `GET /api/jobs/check-stale`
- `GET /api/jobs/refresh-suggestions`
- `GET /api/jobs/cleanup-orphans`

这些接口会校验：

```text
Authorization: Bearer <CRON_SECRET>
```

## 部署到 Vercel + Supabase

部署前请先阅读：

- [生产上线检查清单](./docs/production-checklist.md)
- [v1.0.0 发布说明](./docs/release-v1.md)
- [生产日志与监控](./docs/monitoring.md)

基本步骤：

1. 在 Supabase 创建项目。
2. 启用 `vector` 扩展。
3. 配置 Supabase Auth 的 Site URL 和 Redirect URLs。
4. 在 Vercel 配置生产环境变量。
5. 执行 Prisma 生产迁移。
6. 部署到 Vercel。
7. 做登录、投喂、入库、检索、问答、引用、编辑、删除、导入导出冒烟测试。

Vercel 环境变量至少包括：

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
CRON_SECRET="use-a-long-random-secret"
JOBS_TIMEZONE="Asia/Shanghai"
ADMIN_EMAILS="admin@example.com"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
```

推荐部署前命令：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

## 部署到 Netlify + Supabase

项目已包含 [netlify.toml](./netlify.toml) 和 Netlify Scheduled Functions。

详细步骤见：

- [Netlify 部署指南](./docs/netlify-deploy.md)
- [Netlify 数据库修复指南](./docs/fix-netlify-database.md)

Netlify 环境变量与 Vercel 基本一致，至少包括：

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
CRON_SECRET="use-a-long-random-secret"
JOBS_TIMEZONE="Asia/Shanghai"
ADMIN_EMAILS="admin@example.com"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
```

Netlify Functions 的请求体限制比本地开发更严格，当前文件上传限制为 `4MB`。

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

核心 API 会先校验登录用户，再按用户或 IP 限流。当前主要限流：

- `/api/ingest/analyze`：每用户每分钟 10 次。
- `/api/chat`：每用户每分钟 20 次。
- `/api/knowledge`：列表每用户每分钟 60 次，创建每用户每分钟 20 次。

生产多实例环境下，建议将限流存储迁移到 Redis / Upstash。

## Beta 灰度测试

v1.0.0 支持 Beta 灰度模式。`users.betaAccess` 控制用户是否能进入核心工作台。

- 未登录用户访问核心页面会先进入登录页。
- 已登录但没有 `betaAccess` 的普通用户会进入 `/waitlist`。
- 用户可以在 `/waitlist` 申请测试资格，系统会记录 `betaRequestedAt`。
- 管理员可以在 `/admin` 的“Beta 测试资格”区域为用户开启或关闭 `betaAccess`。
- 管理员由 `ADMIN_PHONES`、`ADMIN_EMAILS` 或 `ADMIN_USER_IDS` 控制，admin API 会二次校验权限。

本地演示账号 `demo@example.com` 通过 seed 默认拥有 `betaAccess`，可以直接进入知识库。

## 安全说明

- 核心页面和 API 都需要登录。
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
- 生产级监控、告警和自动备份恢复演练。
- 完整端到端自动化测试套件。

## 发布文档

- [CHANGELOG](./CHANGELOG.md)
- [v1.0.0 发布说明](./docs/release-v1.md)
- [生产上线检查清单](./docs/production-checklist.md)
- [生产日志与监控](./docs/monitoring.md)
