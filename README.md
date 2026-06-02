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
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
SESSION_SECRET="replace-with-a-long-random-session-secret"
OPENAI_API_KEY="sk-your-openai-api-key"
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
JOBS_TIMEZONE="Asia/Shanghai"
CRON_SECRET="replace-with-a-random-string"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
NODE_ENV="production"
NODE_VERSION="22"
```

说明：

- `DATABASE_URL`：PostgreSQL 连接地址，生产环境必填。Netlify 生产环境不能使用 localhost。
- `SESSION_SECRET`：用于 session token 和卡密 hash，生产环境必须填写长随机字符串。
- `OPENAI_API_KEY`：OpenAI API key。没有 key 时仅本地开发可使用 fallback；生产环境必须配置真实 key。
- `OPENAI_MODEL`：知识整理和问答模型。
- `OPENAI_EMBEDDING_MODEL`：embedding 模型。
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
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
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

## 卡密生成

先确保 `DATABASE_URL` 和 `SESSION_SECRET` 已配置，然后运行：

```bash
pnpm license:generate --count 100
```

脚本会生成 `AIKB-XXXX-XXXX-XXXX` 格式卡密，并只把 `keyHash` 写入数据库。终端输出的明文卡密只显示一次，请在安全位置保存。

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
pnpm license:generate --count 10 # 生成卡密
pnpm prisma:generate             # 生成 Prisma Client
pnpm prisma:format               # 格式化 Prisma schema
pnpm db:check                    # 检查生产数据库、pgvector 和关键数据表
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

部署前必须先对生产数据库执行：

```bash
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
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
