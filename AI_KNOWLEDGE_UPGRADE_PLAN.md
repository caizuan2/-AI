# AI 知识库升级计划

本文档记录当前项目扫描结果和 AI 知识库升级方案。当前阶段只做规划，不直接大规模修改业务代码、UI、数据库或认证逻辑。

## 1. 当前项目扫描结果

### 1.1 技术栈

- 前端框架：Next.js App Router。
- 语言：TypeScript。
- 样式：Tailwind CSS v3，配合项目内 `components/ui/*` 的 shadcn/ui 风格基础组件。
- 后端：Next.js Route Handlers，位于 `app/api/**/route.ts`。
- 数据库：PostgreSQL。
- ORM：Prisma。
- 向量能力：pgvector，当前 `KnowledgeChunk.embedding` 使用 `vector(1536)`。
- AI Provider：已有 OpenAI、Qwen、DeepSeek Provider 封装。
- 构建工具：pnpm，Node.js 要求 `>=22.13`。
- 部署相关：已有 Netlify 配置和跨端包装文档。

### 1.2 构建方式

当前 `package.json` 中主要脚本包括：

- `pnpm dev`：启动 Next.js 开发服务。
- `pnpm build`：执行 Prisma generate 后构建 Next.js。
- `pnpm start`：启动 Next.js 生产服务。
- `pnpm typecheck`：TypeScript 检查。
- `pnpm test:security`：安全相关测试。
- `pnpm rag:reindex`：重建知识库索引。
- `pnpm jobs:*`：任务类脚本。

### 1.3 现有前端路由

工作台页面位于 `app/(workspace)/*`：

- `/chat`：知识库问答页面。
- `/ingest`：对话式投喂。
- `/upload`：文件上传解析。
- `/knowledge`：知识库列表。
- `/knowledge/[id]`：知识详情。
- `/review`：复习。
- `/tags`：标签管理。
- `/categories`：分类管理。
- `/settings`：设置。
- `/feedback`：反馈。

管理员页面位于 `app/admin/*`：

- `/admin`：管理员总览。
- `/admin/analytics`：分析。
- `/admin/licenses`：卡密管理。

### 1.4 现有后端 API

已有核心 API：

- `/api/chat`：知识库问答。
- `/api/knowledge`：知识创建与列表。
- `/api/knowledge/[id]`：知识详情、更新、删除。
- `/api/knowledge/query`：知识查询。
- `/api/upload/analyze`：文件解析。
- `/api/ingest/analyze`：投喂内容整理。
- `/api/tags`、`/api/categories`：标签和分类。
- `/api/admin/*`：管理员统计、用户、卡密等。
- `/api/auth/*`、`/api/license/*`：登录、注册、会话、卡密。

### 1.5 现有数据库模型

当前 `prisma/schema.prisma` 已包含：

- `User`
- `Session`
- `LicenseKey`
- `ActivationLog`
- `UserSettings`
- `Conversation`
- `Message`
- `KnowledgeItem`
- `KnowledgeChunk`
- `KnowledgeMergeHistory`
- `KnowledgeCompletionSuggestion`
- `Feedback`
- `AnalyticsEvent`
- `KnowledgeQueryLog`
- `AiCache`
- `RateLimitEvent`

其中 `KnowledgeItem` 和 `KnowledgeChunk` 已经覆盖知识正文、摘要、标签、分类、来源、切片和向量字段，因此后续不能重复创建同名 `knowledge_chunks` 表；应在现有模型上增量扩展，或新增关联表。

### 1.6 现有登录与权限

当前认证链路：

- `lib/auth/session.ts`：基于 session cookie 的登录态。
- `lib/auth/guards.ts`：`requireLicensedUser()`，要求用户登录并通过卡密授权。
- `lib/auth/license.ts`：卡密激活和授权校验。
- `lib/admin.ts`：通过 `ADMIN_USER_IDS`、`ADMIN_PHONES` 和内置 bootstrap 手机号判断管理员。
- `middleware.ts`：页面保护、API 限流和安全响应头。

当前权限特点：

- 已有登录、卡密和管理员判断。
- 还没有细粒度 RBAC 角色模型。
- `kb_admin`、`super_admin` 这类角色尚未落库。
- 现有知识管理接口主要按 `userId` 隔离。
- `/api/knowledge/[id]` 当前存在物理删除逻辑，后续升级必须收紧。

### 1.7 现有文件解析和 RAG 能力

当前文件解析：

- `lib/upload/file-text.ts` 支持 `.txt`、`.md`、`.pdf`、`.docx`。
- `/api/upload/analyze` 最大文件大小当前为 4MB。
- OCR、ASR、视频解析、PPT、Excel 暂未形成完整 provider 抽象。

当前 RAG：

- `lib/knowledge/chunks.ts`：切片和 embedding。
- `lib/rag/retriever.ts`：混合检索基础能力。
- `KnowledgeChunk.embedding`：pgvector。
- `scripts/rebuild-knowledge-index.ts`：索引重建。

## 2. 升级目标边界

### 2.1 用户端

用户端只允许：

- 基于知识库提问。
- 查看自己的历史会话。
- 使用文字、附件、语音、图片、拍照、相册、文件作为问题输入来源。
- 使用快速模式、专家模式、深度思考、智能搜索等问答模式。

用户端禁止：

- 投喂知识库。
- 管理知识库。
- 删除知识库。
- 查看管理员投喂任务、失败原因、审计日志。

### 2.2 管理员端

管理员端用于知识投喂和知识运营：

- 对话投喂。
- 文字投喂。
- 文件、文档、PPT、图片、音频、视频投喂。
- 查看投喂任务、解析状态、失败原因、标签、分类、审计日志。
- 重试失败任务。

管理员端删除边界：

- `kb_admin` 不允许删除历史知识库文件。
- `kb_admin` 不允许物理删除知识库数据。
- `super_admin` 如需删除，也必须是软删除，并写入审计日志。

## 3. 推荐新增模块目录

当前项目主要使用 `app`、`components`、`lib`、`scripts`、`prisma` 结构。为了不破坏现有结构，建议新增 `modules` 作为领域模块承载层，Route Handlers 和页面再调用这些模块。

建议目录：

```text
modules/
  ai_chat/
    domain/
    services/
    adapters/
    types.ts
  ai_knowledge/
    domain/
    services/
    repositories/
    types.ts
  admin_ingestion/
    domain/
    services/
    jobs/
    types.ts
  file_processor/
    adapters/
      text.ts
      markdown.ts
      pdf.ts
      word.ts
      excel.ts
      ppt.ts
      image-ocr.ts
      audio-asr.ts
      video.ts
    index.ts
    types.ts
  vector_search/
    adapters/
      pgvector.ts
      qdrant.ts
      milvus.ts
      pinecone.ts
      elasticsearch.ts
    index.ts
    types.ts
  audit_log/
    services/
    types.ts
```

约束：

- 第一阶段只创建文档，不创建目录。
- 后续创建模块时必须保证每个模块被实际 API 或页面引用。
- 不要创建“空组件”或未接入的服务。
- 不要把旧业务整块搬迁到新模块，先用适配层包裹已有能力。

## 4. 后端接口设计

### 4.1 用户端接口

新增接口建议：

```text
POST /api/ai/chat/ask
GET  /api/ai/chat/history
GET  /api/ai/chat/conversations
```

`POST /api/ai/chat/ask` 请求结构：

```json
{
  "question": "用户问题",
  "mode": "fast",
  "enable_deep_thinking": false,
  "enable_web_search": false,
  "conversation_id": "optional",
  "attachments": []
}
```

实现策略：

- 第一版内部复用现有 `/api/chat` 的 RAG 能力。
- 新接口只暴露用户提问能力，不暴露知识投喂字段。
- 响应继续支持引用来源，但避免暴露 Provider、Model、chunk、fallback 等内部调试信息。
- 所有查询必须绑定当前用户或租户范围，防止 IDOR。

### 4.2 管理员端接口

新增接口建议：

```text
POST /api/admin/kb/ingest/text
POST /api/admin/kb/ingest/chat
POST /api/admin/kb/ingest/file
GET  /api/admin/kb/files
GET  /api/admin/kb/jobs
GET  /api/admin/kb/jobs/:id
POST /api/admin/kb/jobs/:id/retry
GET  /api/admin/kb/audit-logs
```

禁止为 `kb_admin` 暴露：

```text
DELETE /api/admin/kb/files/:id
DELETE /api/admin/kb/chunks/:id
DELETE /api/admin/kb/reset
DELETE /api/admin/kb/clear
```

如果已有删除能力需要保留：

- 普通用户和 `kb_admin` 返回 403。
- 仅 `super_admin` 可以软删除。
- 必须写 `audit_logs`。
- 禁止直接物理删除历史文件和知识数据。

## 5. 数据库增量设计

### 5.1 复用现有表

优先复用：

- `User`
- `Conversation`
- `Message`
- `KnowledgeItem`
- `KnowledgeChunk`
- `KnowledgeQueryLog`
- `RateLimitEvent`

原因：

- 这些模型已经覆盖用户、会话、消息、知识项、切片、日志和限流。
- 直接创建新的 `knowledge_chunks` 表会和现有表冲突。
- 迁移风险更低。

### 5.2 建议新增模型

后续迁移建议新增：

```text
UserRoleAssignment
KnowledgeFile
IngestionJob
AuditLog
ChatAttachment
```

说明：

- `UserRoleAssignment`：在不破坏现有 `User` 的前提下新增 RBAC。
- `KnowledgeFile`：记录原始文件，不直接暴露 `storagePath`。
- `IngestionJob`：记录解析、切片、向量化状态。
- `AuditLog`：记录管理员投喂、重试、软删除、权限拒绝等危险动作。
- `ChatAttachment`：记录用户提问附件，不把文件路径直接返回前端。

### 5.3 现有表增量字段建议

后续可考虑给现有模型加字段：

- `KnowledgeItem`
  - `fileId`
  - `ingestionJobId`
  - `deletedAt`
  - `deletedByUserId`
  - `retentionPolicy`
  - `visibilityScope`
- `KnowledgeChunk`
  - `fileId`
  - `summary`
  - `embeddingStatus`
  - `embeddingModel`
  - `chunkType`
  - `metadata`
- `Conversation`
  - 可继续用 `metadata` 保存 `mode`、`enableDeepThinking`、`enableWebSearch`，避免过早改表。

## 6. RBAC 设计

建议角色：

- `user`：只能提问和查看自己的会话。
- `kb_admin`：可投喂、查看投喂任务、重试失败任务、查看审计日志，但不能删除。
- `super_admin`：系统管理员，可管理角色，可执行受控软删除。

兼容现有逻辑：

- 保留 `requireUser()`、`requireLicensedUser()`。
- 保留 `isAdminUser()` 作为 bootstrap super admin 判断。
- 新增 `requireRole(role)`、`requireAnyRole(roles)` 时内部复用现有 session。
- 未配置 RBAC 前，环境变量 admin 视为 `super_admin`。
- 不改变现有登录、注册、卡密激活流程。

## 7. 文件处理流程

标准流程：

1. 上传原始文件。
2. 校验文件大小、扩展名、MIME 类型和必要的文件头。
3. 写入私有存储。
4. 创建 `KnowledgeFile`。
5. 创建 `IngestionJob`。
6. 异步解析。
7. 文本清洗。
8. 语义切片。
9. embedding 向量化。
10. 写入 pgvector 或抽象向量库。
11. 写入或更新 `KnowledgeItem` / `KnowledgeChunk`。
12. 更新 `IngestionJob` 状态。
13. 写入 `AuditLog`。

第一版支持顺序：

1. TXT / Markdown。
2. PDF。
3. Word。
4. Excel。
5. PPT。
6. 图片 OCR provider 预留。
7. 音频 ASR provider 预留。
8. 视频转写和关键帧 provider 预留。

## 8. Vector Search 抽象

建议接口：

```ts
type VectorSearchProvider = {
  upsertDocumentChunks(chunks: UpsertChunkInput[]): Promise<UpsertChunkResult>;
  searchSimilar(input: SearchSimilarInput): Promise<SearchSimilarResult[]>;
};
```

删除能力不暴露给 `kb_admin`：

- 不提供普通删除方法给管理端。
- 需要清理时只允许系统维护任务或 `super_admin` 软删除后异步清理。
- 所有清理任务必须写审计日志。

第一版 provider：

- `pgvector`：复用现有 `KnowledgeChunk.embedding`。

后续可选 provider：

- Qdrant。
- Milvus。
- Pinecone。
- Elasticsearch。

## 9. 前端升级方案

### 9.1 用户端

建议新增或渐进改造：

- 新用户问答入口：`app/(workspace)/ai/page.tsx` 或在确认后替换 `/chat`。
- 保留现有 `/chat`，直到新用户端稳定。
- 页面风格参考 DeepSeek / 豆包：
  - 顶部菜单。
  - 新建对话。
  - 中间提示语。
  - 快速模式 / 专家模式。
  - 深度思考。
  - 智能搜索。
  - 上传。
  - 语音。
  - 相机。
  - 相册。
  - 文件。

用户端必须隐藏：

- 知识投喂。
- 知识库管理。
- 删除入口。
- 管理员任务。
- 审计日志。

### 9.2 管理员端

建议新增：

```text
app/admin/kb/page.tsx
app/admin/kb/ingest/page.tsx
app/admin/kb/files/page.tsx
app/admin/kb/jobs/page.tsx
app/admin/kb/audit-logs/page.tsx
```

管理员端能力：

- 知识库总览。
- 对话投喂。
- 文字投喂。
- 文件上传投喂。
- 投喂任务列表。
- 文件列表。
- 解析失败任务。
- 标签分类。
- 审计日志。

管理员端不展示删除按钮；后端仍必须做 403 权限拦截。

## 10. 五端打包方案

当前项目是 Next.js，因此建议：

- Web HTML：继续使用现有 Next.js 构建。
- Android APK：使用 Capacitor 包装 Web。
- iOS IPA：使用 Capacitor 包装 Web。
- macOS DMG：优先 Tauri，其次 Electron。
- Windows EXE：优先 Tauri，其次 Electron。

后续新增脚本建议：

```text
scripts/build-android.sh
scripts/build-ios.sh
scripts/build-macos.sh
scripts/build-web.sh
scripts/build-windows.sh
```

脚本约束：

- 不删除源码。
- 不删除数据库。
- 不清理非构建目录。
- 构建前检查依赖和环境。
- 构建失败输出明确原因。

## 11. 分阶段执行路线

### 阶段 0：准备分支

建议用户确认后创建：

```powershell
git checkout -b feature/ai-knowledge-upgrade
```

当前不自动创建分支，避免和现有未确认改动冲突。

### 阶段 1：RBAC 和审计基础

- 新增 RBAC 模型或角色分配表。
- 新增权限 guard。
- 新增 audit log service。
- 收紧知识删除接口。
- 保留现有登录和卡密。

### 阶段 2：模块骨架

- 新增 `modules/ai_chat`。
- 新增 `modules/admin_ingestion`。
- 新增 `modules/file_processor`。
- 新增 `modules/vector_search`。
- 新增 `modules/audit_log`。
- 只接入最小可运行服务，不创建无引用文件。

### 阶段 3：用户端问答 API

- 新增 `/api/ai/chat/ask`。
- 新增历史会话接口。
- 复用现有 RAG。
- 支持 mode 和开关字段。
- 保存会话和消息。

### 阶段 4：管理员投喂 API

- 新增文字投喂。
- 新增对话投喂。
- 新增文件投喂。
- 新增任务列表和任务详情。
- 新增 retry。
- 新增审计日志查询。

### 阶段 5：文件处理和任务化

- 把解析、切片、embedding 从请求主链路拆到 job。
- 先支持现有 TXT / Markdown / PDF / Word。
- 再逐步增加 Excel / PPT。
- OCR / ASR / 视频只做 provider 接口和任务状态，不硬编码假结果。

### 阶段 6：向量检索抽象

- 用 `pgvector` adapter 包裹现有检索。
- 统一 upsert/search 接口。
- 为 Qdrant / Milvus / Pinecone / Elasticsearch 预留 adapter。

### 阶段 7：前端用户端

- 新增或渐进替换用户 AI Chat 页面。
- 用户侧只展示提问能力。
- 保留现有问答体验和历史会话。

### 阶段 8：前端管理员端

- 新增管理员知识库后台。
- 管理投喂任务、失败原因、文件列表、审计日志。
- 前端隐藏删除，后端强制禁止。

### 阶段 9：测试

- 用户不能访问管理员接口。
- `kb_admin` 能投喂。
- `kb_admin` 不能删除。
- 普通用户能提问。
- 普通用户不能投喂。
- 非法文件类型被拒绝。
- 过大文件被拒绝。
- 失败任务可查看原因和 retry。
- 管理员投喂写审计日志。
- 删除被拦截或仅 `super_admin` 软删除。
- 问答基于知识库。
- 无资料时不编造。

### 阶段 10：五端构建脚本

- 新增 Web、Android、iOS、macOS、Windows 构建脚本。
- 保持脚本安全，不删除源码和数据库。

## 12. 风险与回滚策略

### 12.1 主要风险

- 现有知识删除接口是物理删除，需要先改成受控软删除。
- 现有管理员判断不是完整 RBAC，需要谨慎增量引入。
- 文件解析、embedding 和向量写入如果在同步请求中执行，容易导致超时。
- 多端包装不能先于 Web 稳定，否则问题定位成本高。
- 新模块如果未接入真实路由，会形成死代码。

### 12.2 回滚策略

- 每个阶段单独提交。
- 数据库迁移只新增字段和表，不删除表和列。
- 删除能力先禁用或软删除，不做物理删除。
- 新接口与旧接口并行一段时间。
- 新用户端页面先通过独立路由验证。
- 保留旧 `/chat`，直到新 `/api/ai/chat/ask` 稳定。

## 13. 当前阶段结论

当前项目已经具备：

- 登录态。
- 卡密授权。
- 管理员入口。
- 知识投喂基础。
- 文件解析基础。
- 知识库问答。
- pgvector 切片检索。
- Tailwind / Next.js Web 构建基础。

下一步不建议直接大改页面或数据库。建议先确认分支和提交范围，再按“RBAC + 审计 + 新 API 并行接入”的顺序增量实施。
