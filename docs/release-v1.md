# v1.0.0 正式发布说明

发布日期：2026-06-02

## 发布定位

v1.0.0 是“对话式投喂型 AI 知识库”的第一个正式闭环版本。它覆盖从知识投喂、AI 整理、确认入库、检索问答、引用来源到知识维护的完整 MVP 流程，并具备生产部署所需的鉴权、数据隔离、迁移、限流和部署文档。

## 当前已完成功能

### 用户与权限

- Supabase Auth 登录、注册和退出登录。
- localhost 本地开发登录 fallback，方便没有 Supabase 配置时调试。
- 未登录用户不能访问 `/ingest`、`/upload`、`/knowledge`、`/chat`、`/settings` 等核心页面。
- 核心 API 按当前用户校验权限。
- 知识数据、检索结果、导入导出、标签、分类和复习数据均按 `userId` 隔离。

### 知识投喂与整理

- `/ingest` 支持输入文本和 URL。
- 后端可识别 URL，抓取网页标题、正文和来源链接。
- `/upload` 支持上传 `txt`、`md`、`pdf`、`docx`。
- AI 整理标题、摘要、标签、分类、重要度和质量评分。
- 无 OpenAI API key 时仅本地开发提供 mock fallback；生产环境必须配置真实 key。
- 支持三种保存策略：
  - 手动确认入库
  - AI 判断后自动入库
  - 永不自动入库，仅分析

### 知识入库与维护

- 创建 `KnowledgeItem` 并按 800-1200 中文字符切分 chunks。
- 有 OpenAI key 时生成 embedding；无 key 时跳过 embedding 并保留本地可用流程。
- 支持相似知识提示、合并到已有知识和合并历史展示。
- 知识详情页支持查看、编辑、删除。
- 删除知识时级联删除 chunks。
- 展示来源类型、来源标题、来源 URL、来源消息 ID 和创建时间。
- 展示清晰度、完整度、有用性、可信度评分。
- 低质量知识展示补充提示。
- 支持 AI 补全建议和继续补充原知识。

### 检索与问答

- `/api/search` 支持 hybrid search：向量检索 + 关键词检索。
- 检索结果支持 rerank、importance 加权、更新时间加权和过期状态降权。
- 低相似度结果会被过滤。
- `/chat` 基于 top 5 chunks 生成中文回答。
- 回答包含引用编号，例如 `[1]`、`[2]`。
- sources 区域展示来源卡片，并支持点击进入知识详情。
- 无相关知识时明确提示“知识库中没有找到足够依据”。
- RAG prompt 已加入 prompt injection 防护。

### 管理能力

- `/knowledge` 支持搜索、标签筛选、分类筛选、状态筛选、质量排序和分页。
- `/tags` 支持标签列表、数量统计、重命名、删除和合并。
- `/categories` 支持分类列表、数量统计、重命名、删除和合并。
- `/review` 每天推荐重要知识，并支持标记已掌握、需要复习、已过期。
- `/settings` 支持保存策略、默认过期提醒周期、导入导出入口。
- 支持 JSON、Markdown、CSV 导出。
- 支持 JSON 导入和重复知识检测。

### 后端与部署

- Prisma schema 已覆盖用户、会话、消息、知识、chunks、设置、合并历史、补全建议等表。
- PostgreSQL 使用 pgvector，embedding 字段使用 `Unsupported("vector(1536)")`。
- 统一 API 响应格式：`success: true` / `success: false`。
- 统一错误类型：`AppError`、`ValidationError`、`UnauthorizedError`、`NotFoundError`、`AIError`、`RateLimitError`。
- 核心 API 已加 rate limit。
- 后台任务支持过期检查、低质量补全建议刷新和孤立 chunks 清理。
- 已提供 Vercel + Supabase 部署说明、生产检查清单和迁移命令。

## 仍未完成的功能

- 多轮对话历史尚未持久化到 `Conversation` / `Message` 主流程；当前 `/chat` 历史主要为页面会话内状态。
- 限流是进程内存实现；多实例生产环境建议改为 Redis / Upstash 等共享限流。
- 长文档、批量导入和大规模 embedding 重算尚未接入完整异步队列。
- 未提供团队空间、组织、多角色权限和审计日志。
- 未提供知识图谱、语音导入、微信导入、浏览器插件等高级入口。
- 未提供完整端到端自动化测试套件。
- 未接入生产级监控、告警、错误追踪和自动备份恢复演练。

## 发布验证

发布前必须通过：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

建议上线后人工冒烟测试：

- 登录和退出登录。
- 在 `/ingest` 投喂一段文本并确认入库。
- 在 `/ingest` 输入 URL 并确认来源链接被记录。
- 在 `/upload` 上传一个小型 `txt` 或 `md` 文件。
- 在 `/knowledge` 搜索、筛选并进入详情。
- 编辑并删除一条测试知识。
- 在 `/chat` 提问，确认回答包含引用来源。
- 在 `/settings` 导出 JSON、Markdown、CSV，并测试 JSON 导入重复检测。

## 部署前人工配置

- Vercel Production 环境变量：
  - `DATABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `OPENAI_EMBEDDING_MODEL`
  - `CRON_SECRET`
  - `JOBS_TIMEZONE`
- Supabase 启用 `vector` 扩展。
- 执行 Prisma 生产迁移。
- 配置 Supabase Auth Site URL 和 Redirect URLs。
- 确认 OpenAI key 额度、模型权限和账单状态。
- 确认备份策略和回滚方案。

## 相关文档

- [README](../README.md)
- [生产上线检查清单](./production-checklist.md)
