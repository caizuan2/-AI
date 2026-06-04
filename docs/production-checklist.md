# 生产上线检查清单

本文档用于 Netlify + Supabase PostgreSQL 部署前的最终人工检查。建议每次正式发布前逐项确认，并记录检查人、检查时间和发布版本。

## 1. 部署平台环境变量检查

- [ ] 已在 Netlify Environment variables 中配置生产环境变量。
- [ ] `DATABASE_URL` 指向生产 Supabase Pooler 完整 URI，端口为 `6543`，不是本地数据库。
- [ ] `DIRECT_URL` 指向生产 Supabase Direct 完整 URI，端口为 `5432`，用于 Prisma migrate。
- [ ] `SESSION_SECRET` 已配置为长随机字符串。
- [ ] 至少一个生成 provider key 已配置，且没有写入代码或提交到仓库。
- [ ] `OPENAI_API_KEY` 已配置用于 embedding / 向量检索。
- [ ] `OPENAI_MODEL` 已配置，例如 `gpt-4.1-mini`。
- [ ] `OPENAI_EMBEDDING_MODEL` 已配置，例如 `text-embedding-3-small`。
- [ ] `CRON_SECRET` 已配置为强随机字符串。
- [ ] `JOBS_TIMEZONE` 已配置，默认建议 `Asia/Shanghai`。
- [ ] `ADMIN_PHONES` 或 `ADMIN_USER_IDS` 已配置，且只包含可信管理员。
- [ ] 已区分 Production / Preview / Development 环境变量，避免测试环境误连生产数据。

## 2. Supabase 数据库检查

- [ ] Supabase 项目处于可用状态，数据库连接正常。
- [ ] 生产运行时连接串已使用 Supabase Pooler。
- [ ] 生产迁移连接串已使用 Supabase Direct。
- [ ] 数据库时区、区域和容量符合上线预期。
- [ ] 已确认数据库 schema 为目标环境的生产 schema。
- [ ] 已确认应用使用的数据库账号具备必要权限，但不授予多余管理权限。
- [ ] 已确认没有使用本地测试账号或测试数据库。

## 3. pgvector 是否启用

- [ ] 已在 Supabase SQL Editor 中启用 `vector` 扩展。

```sql
create extension if not exists vector;
```

- [ ] 已确认 `knowledge_chunks.embedding` 字段可使用 `vector` 类型。
- [ ] 已确认向量检索 SQL 可以正常执行。
- [ ] 已确认没有 OpenAI key 时仅本地开发可以降级为关键词搜索。

## 4. Prisma migrate 是否执行

- [ ] 已在生产数据库执行迁移。

```bash
pnpm prisma:migrate:deploy
```

- [ ] 已确认迁移状态正常。

```bash
pnpm exec prisma migrate status
```

- [ ] 已确认没有 pending migrations。
- [ ] 已确认 Prisma Client 已生成。

```bash
pnpm prisma:generate
```

- [ ] 已确认生产数据库表结构包含最新字段，例如 `sessions`、`license_keys`、来源追踪、质量评分、复习、过期状态、合并历史、补全建议等。

## 5. OpenAI API Key 是否配置

- [ ] `QWEN_API_KEY`、`OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY` 至少有一个可用于生成模型。
- [ ] `OPENAI_API_KEY` 已配置在部署平台环境变量中用于 embedding。
- [ ] API key 具备调用所选 chat model 的权限。
- [ ] API key 具备调用所选 embedding model 的权限。
- [ ] 已确认 OpenAI 账户额度、账单和速率限制满足 MVP 使用量。
- [ ] 已确认服务端不会把 `OPENAI_API_KEY` 返回给前端或日志。
- [ ] 已确认无 key 时 mock / fallback 模式仅用于本地开发，生产环境已配置真实 key。

## 6. 文件上传限制

- [ ] `/upload` 页面上传入口可访问。
- [ ] 后端限制文件大小，超限时返回友好错误。
- [ ] 仅允许支持的文件类型：`txt`、`md`、`pdf`、`docx`。
- [ ] 已确认解析失败时不会导致服务崩溃。
- [ ] 已确认上传内容不会绕过用户鉴权。
- [ ] 已确认上传生成的知识来源写入 `sourceType=document`。
- [ ] 已确认大文本会分段处理，避免单次请求过大。

## 7. Rate limit 是否开启

- [ ] middleware 中的 API 基础限流已启用。
- [ ] `/api/ingest/analyze` 已启用更严格限流。
- [ ] `/api/chat` 已启用更严格限流。
- [ ] `/api/knowledge` 已启用更严格限流。
- [ ] 未登录用户无法访问核心 API。
- [ ] 未激活卡密的用户无法访问核心 API。
- [ ] 超出限制时返回统一错误格式和友好提示。
- [ ] 已评估生产多实例部署下的限流风险；如有较高流量，应接入 Redis / Upstash 等共享存储。

## 8. 用户数据隔离检查

- [ ] 所有核心 API 都会校验当前用户。
- [ ] 知识列表只返回当前用户的 `KnowledgeItem`。
- [ ] 知识详情只能访问当前用户自己的知识。
- [ ] 编辑和删除操作都带 `userId` 校验。
- [ ] 检索和问答只使用当前用户的知识 chunks。
- [ ] 标签、分类、复习、导入导出均按当前用户隔离。
- [ ] 删除知识时关联 chunks 会一起删除。
- [ ] 已手动验证用户 A 无法通过 ID 访问用户 B 的知识。

## 9. 备份策略

- [ ] 已启用 Supabase 自动备份或项目所在套餐支持的备份能力。
- [ ] 已确认备份保留周期满足业务要求。
- [ ] 已确认上线前可以手动导出关键数据。
- [ ] 已确认知识库 JSON 导出功能可用。
- [ ] 已保存本次发布前的数据库快照或备份点。
- [ ] 已演练至少一次从备份恢复到测试环境。
- [ ] 已明确谁负责定期检查备份状态。

## 10. 回滚方案

- [ ] 部署平台保留上一个稳定部署版本。
- [ ] 已确认可以在 Netlify Dashboard 中回滚到上一版本。
- [ ] 已记录本次发布的 commit、构建时间和迁移版本。
- [ ] 如果本次包含数据库迁移，已评估迁移是否可逆。
- [ ] 对不可逆迁移，已准备数据备份和人工恢复步骤。
- [ ] 已确认回滚代码后不会因数据库字段缺失或结构不兼容导致服务不可用。
- [ ] 已准备临时关闭后台任务或 Cron 的方案。
- [ ] 已准备紧急禁用 OpenAI 调用、降级页面提示或暂停相关入口的方案。

## 发布前最终命令

上线前建议至少执行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

以上命令通过后，再进行登录、投喂、入库、检索、问答、引用、编辑、删除、导入导出的人工冒烟测试。
