# Changelog

All notable changes to this project are documented here.

## v1.0.0 - 2026-06-02

### Added

- 对话式知识投喂流程：用户可以在 `/ingest` 输入文本或 URL，由 AI 整理为标题、摘要、标签、分类、重要度和质量评分；本地开发可使用 fallback。
- 知识入库流程：支持手动确认入库、AI 判断后自动入库、仅分析不自动入库三种策略。
- 知识去重与合并：确认入库前检索相似知识，支持创建新知识、合并到已有知识或放弃保存。
- 文件上传投喂：`/upload` 支持 `txt`、`md`、`pdf`、`docx`，并限制文件大小。
- 知识管理：`/knowledge` 支持搜索、标签筛选、分类筛选、状态筛选、质量排序、分页和空状态。
- 知识详情：支持查看来源、质量评分、chunks、合并历史、补全建议、编辑和删除。
- RAG 问答：`/chat` 支持基于当前用户知识库回答问题，展示引用编号和来源卡片。
- 检索能力：封装 hybrid search，结合向量检索、关键词检索、importance 加权、更新时间加权和低相似度过滤。
- Prompt injection 防护：RAG prompt 明确区分系统指令、用户问题和检索上下文，不执行知识内容中的指令。
- 用户认证：支持手机号 + 密码注册登录，使用 HttpOnly Cookie session，并加入卡密激活门禁。
- 用户数据隔离：核心 API 按当前用户读取、写入、检索和导出知识。
- 统一错误处理：新增 `AppError` 系列错误和统一 API success/error 响应格式。
- Rate limit：对核心 API 增加用户级或 IP 级限流。
- 标签与分类管理：新增 `/tags`、`/categories`，支持重命名、删除和合并。
- 知识复习：新增 `/review`，支持重要知识推荐和复习状态更新。
- 知识过期检测：支持 `expiresAt`、`status`、默认过期周期和后台 stale 检查。
- 导入导出：`/settings` 支持 JSON、Markdown、CSV 导出，以及 JSON 导入和重复检测。
- 后台任务：使用 `node-cron` 和 Netlify Scheduled Functions 检查过期知识、刷新补全建议、清理孤立 chunks。
- 部署准备：新增 Netlify + Supabase PostgreSQL 配置、pgvector 说明、生产检查清单和 v1 发布说明。

### Changed

- 项目版本升级为 `1.0.0`。
- 包管理器明确为 `pnpm@10.12.4`。
- Netlify 构建命令调整为 `pnpm prisma:generate && pnpm build`。
- README 调整为面向真实用户和部署人员的 v1 使用说明。

### Security

- 核心业务 API 均要求登录。
- 知识数据按 `userId` 隔离。
- pgvector 查询使用 Prisma 参数化 raw SQL，避免 SQL 注入。
- RAG 回答只基于检索上下文，不执行上下文中的恶意指令。
- 文件上传限制类型和大小。
- 不在代码中写入真实 OpenAI API key。

### Known Gaps

- 多轮对话历史尚未持久化到 `conversations` / `messages` 主流程。
- 限流目前为内存实现，多实例生产环境建议接入 Redis / Upstash。
- 长文档处理仍以同步 API 流程为主，尚未接入完整队列系统。
- 尚未提供团队空间、角色权限、审计日志和知识图谱。
- 尚未提供生产级监控告警、自动备份恢复演练和端到端测试套件。
