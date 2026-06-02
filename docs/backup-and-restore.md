# 备份与恢复手册

本文档用于生产环境的数据库备份、文件备份、恢复操作和灾难恢复演练。目标平台为 Vercel + Supabase。

> 注意：备份策略和保留周期会受 Supabase 套餐、项目区域、Postgres 版本和 PITR 设置影响。上线前必须以 Supabase Dashboard 与官方文档为准复核一次。

## 1. Supabase 自动备份说明

Supabase 数据库备份主要分为 Daily Backups 和 Point-in-Time Recovery。

- Daily Backups：Supabase 会为付费项目提供每日数据库备份。官方当前说明中，Pro 通常可访问最近 7 天，Team 通常可访问最近 14 天，Enterprise 可到更长周期。
- PITR：Point-in-Time Recovery 可作为更细粒度恢复能力，用于恢复到指定时间点。开启 PITR 后，备份逻辑与普通 Daily Backups 不完全相同，应在 Dashboard 的 Point in Time 页面确认可恢复窗口。
- 恢复会造成停机：从 Dashboard 发起恢复时，项目在恢复期间不可访问，停机时长取决于数据库大小。
- 物理备份与逻辑备份不同：新版本 Supabase 项目可能默认使用 physical backups。physical backups 可用于恢复，但不一定提供可下载的 `backup.gz`。
- 自定义数据库角色密码不会出现在可下载备份里。恢复后如果项目使用自定义角色，需要重置相关密码。
- 删除 Supabase project 会删除关联数据和备份，不能作为“重新创建再恢复”的轻量操作。

当前项目的生产要求：

- 生产环境至少启用 Supabase 自动备份能力。
- 如果业务不能接受最长一天数据丢失，应评估开启 PITR。
- 每次正式发布前，除自动备份外，还应手动导出一次数据库或至少导出核心业务数据。
- 自动备份不替代导入导出功能。应用内 JSON/Markdown/CSV 导出只能作为业务数据备份补充，不能替代完整数据库备份。

## 2. 手动导出数据库步骤

手动导出建议保存到加密、可审计、非代码仓库的位置，例如内部对象存储、加密硬盘或企业备份系统。

### 2.1 使用 Supabase CLI 导出

安装并登录 Supabase CLI：

```bash
supabase login
supabase link --project-ref <project-ref>
```

导出数据库：

```bash
mkdir -p backups
supabase db dump --linked -f backups/prod-$(date +%Y%m%d-%H%M%S).sql
```

如果只需要数据或只需要 schema，可根据 Supabase CLI 当前版本查看 `supabase db dump --help`，确认是否使用 `--data-only`、`--schema` 等参数。

### 2.2 使用 pg_dump 导出

从 Supabase Dashboard 获取生产数据库连接串，设置环境变量：

```bash
export DATABASE_URL="postgresql://..."
```

导出为 custom 格式：

```bash
mkdir -p backups
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="backups/prod-$(date +%Y%m%d-%H%M%S).dump"
```

也可以导出为纯 SQL：

```bash
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --file="backups/prod-$(date +%Y%m%d-%H%M%S).sql"
```

### 2.3 导出后检查

- [ ] 备份文件大小合理，不是 0 字节。
- [ ] 备份文件已加密存储。
- [ ] 备份文件没有提交到 Git。
- [ ] 记录备份时间、操作人、项目 ref、数据库版本、应用版本。
- [ ] 至少每月做一次恢复到测试环境的验证。
- [ ] 确认本次导出覆盖范围：仅 `public` schema，还是包含 `auth`、`storage` 等 Supabase 管理 schema。

## 3. Storage 文件备份注意事项

Supabase 数据库备份不包含 Storage API 中的对象文件本体。数据库里通常只保存对象 metadata，真正的文件 bytes 存在 Storage bucket 中。

当前项目的 MVP 文件上传流程主要用于提取文本并入库知识；如果未来把原始文件保存到 Supabase Storage，需要额外备份 Storage。

Storage 备份要求：

- [ ] 单独备份所有生产 bucket 的对象文件。
- [ ] 保留 bucket 名称、object path、content type、文件大小、checksum、创建时间等信息。
- [ ] 备份文件要加密保存，并和数据库备份建立同一时间点的对应关系。
- [ ] 不要只依赖数据库恢复。恢复旧数据库不会自动恢复恢复点之后被删除的 Storage 文件。
- [ ] 如果使用生命周期规则、自动清理或用户删除文件，需要确认这些删除动作是否也会影响备份源。
- [ ] 恢复 Storage 前先在测试 bucket 验证文件路径和权限策略。

可选备份方式：

- 使用 Supabase Storage API 编写脚本定期列出并下载对象。
- 使用支持 S3 兼容接口的同步工具备份到独立对象存储。
- 对大文件或大量对象使用增量备份，并定期校验 checksum。

## 4. 恢复数据库步骤

恢复前必须先确认事故类型：误删数据、错误迁移、配置错误、区域故障、供应商故障，还是安全事件。不同事故的恢复目标不同。

### 4.1 恢复前准备

- [ ] 暂停 Vercel Cron 或后台任务，避免恢复过程中继续写入。
- [ ] 暂停高风险写接口，必要时进入维护模式。
- [ ] 记录当前应用版本、迁移版本、环境变量摘要和事故时间。
- [ ] 确认恢复目标：恢复到当前项目，还是恢复到新 Supabase 项目。
- [ ] 确认 RPO：最多可接受丢失多少数据。
- [ ] 确认 RTO：最多可接受停机多久。
- [ ] 通知相关人员恢复期间可能不可访问。

### 4.2 使用 Supabase Dashboard 恢复

1. 打开 Supabase Dashboard。
2. 进入目标项目。
3. 打开 `Database > Backups`。
4. 选择最接近事故前的备份点。
5. 如果启用了 PITR，选择事故发生前的具体时间点。
6. 阅读恢复确认提示，确认恢复会导致项目暂时不可访问。
7. 发起恢复。
8. 等待 Dashboard 显示恢复完成。
9. 恢复完成后执行“恢复后需要重新检查的内容”。

### 4.3 使用手动备份恢复到测试环境

优先把手动备份恢复到测试 Supabase 项目，确认数据和应用行为正常，再决定是否切生产。

custom dump 恢复：

```bash
export TARGET_DATABASE_URL="postgresql://..."

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "$TARGET_DATABASE_URL" \
  backups/prod-YYYYMMDD-HHMMSS.dump
```

纯 SQL 恢复：

```bash
export TARGET_DATABASE_URL="postgresql://..."

psql "$TARGET_DATABASE_URL" \
  --set ON_ERROR_STOP=on \
  --file backups/prod-YYYYMMDD-HHMMSS.sql
```

恢复到 Supabase 托管项目时，注意不要误删或覆盖 Supabase 管理 schema。对生产执行 `--clean` 前必须先在测试环境验证。

## 5. 恢复后需要重新检查的内容

数据库与扩展：

- [ ] `pgvector` 扩展存在。
- [ ] `knowledge_chunks.embedding` 字段仍为 vector 类型。
- [ ] Prisma migration 状态正常。

```bash
pnpm exec prisma migrate status
```

- [ ] 如果恢复点早于最新迁移，重新执行：

```bash
pnpm prisma:migrate:deploy
pnpm prisma:generate
```

认证与权限：

- [ ] Supabase Auth 用户可登录。
- [ ] 应用 `users` 表与 Supabase Auth 用户一致。
- [ ] 管理员 `ADMIN_EMAILS` / `ADMIN_USER_IDS` 配置仍正确。
- [ ] 普通用户不能访问其他用户知识。
- [ ] 未获得 `betaAccess` 的用户仍进入 `/waitlist`。

业务数据：

- [ ] `/knowledge` 列表可加载。
- [ ] 知识详情、编辑、删除可用。
- [ ] chunks 数量与 KnowledgeItem 数量匹配，没有大量孤立 chunks。
- [ ] RAG 检索能返回相关结果。
- [ ] `/chat` 回答有引用来源。
- [ ] 反馈、标签、分类、复习、导入导出功能可用。

AI 与任务：

- [ ] `OPENAI_API_KEY`、模型和 embedding 模型仍配置正确。
- [ ] 本地开发环境没有 OpenAI key 时 mock / fallback 模式仍可运行；生产环境必须重新配置真实 key。
- [ ] Vercel Cron 或后台任务恢复启用。
- [ ] `/api/jobs/check-stale`、`/api/jobs/refresh-suggestions`、`/api/jobs/cleanup-orphans` 可正常执行。

Storage：

- [ ] 如果使用 Supabase Storage，bucket 存在。
- [ ] 文件路径与数据库 metadata 对得上。
- [ ] 文件访问权限和 RLS policy 正常。
- [ ] 缺失文件已从 Storage 备份恢复。

监控与日志：

- [ ] Vercel Logs 没有持续 5xx。
- [ ] `/admin` 系统健康状态正常。
- [ ] 最近错误日志没有大量数据库错误。
- [ ] 已记录恢复时间、恢复点、操作人和验证结果。

## 6. 灾难恢复演练步骤

建议至少每季度演练一次，重大版本上线前额外演练一次。

### 6.1 演练准备

- [ ] 指定演练负责人、执行人和观察人。
- [ ] 定义演练场景，例如误删知识表、错误迁移、Storage 文件丢失、OpenAI key 失效。
- [ ] 确认演练只在测试项目或临时项目执行，不碰生产数据。
- [ ] 准备最近一次生产手动备份。
- [ ] 准备测试 Supabase 项目和测试 Vercel 环境变量。
- [ ] 记录预期 RPO 和 RTO。

### 6.2 演练执行

1. 创建或选择一个空的测试 Supabase 项目。
2. 启用 `vector` 扩展。

```sql
create extension if not exists vector;
```

3. 恢复数据库备份到测试项目。
4. 如果有 Storage 备份，恢复文件到测试 bucket。
5. 在 Vercel Preview 或本地 `.env` 中切换到测试项目连接串。
6. 执行迁移状态检查。

```bash
pnpm exec prisma migrate status
```

7. 执行构建检查。

```bash
pnpm lint
pnpm typecheck
pnpm build
```

8. 做核心流程冒烟测试：
   - 登录
   - 投喂
   - 分析
   - 入库
   - 检索
   - 问答
   - 引用
   - 编辑
   - 删除
   - 导入导出
   - 反馈提交
   - 管理后台查看反馈

9. 记录实际恢复耗时、数据缺口和失败步骤。
10. 修正文档、脚本或权限配置。

### 6.3 演练复盘

- [ ] 实际 RTO 是否满足目标。
- [ ] 实际 RPO 是否满足目标。
- [ ] 备份文件是否容易找到且权限正确。
- [ ] 恢复命令是否可以无歧义执行。
- [ ] 是否有人依赖个人账号、个人电脑或未共享密钥。
- [ ] 是否遗漏 Storage 文件、Auth 用户或环境变量。
- [ ] 是否需要开启 PITR 或提升备份频率。
- [ ] 是否需要自动化导出脚本和恢复脚本。
- [ ] 是否更新了本文档和 `docs/production-checklist.md`。

## 参考资料

- Supabase Database Backups: https://supabase.com/docs/guides/platform/backups
- Supabase Database Backups Feature: https://supabase.com/features/database-backups
- Supabase CLI: https://supabase.com/docs/reference/cli
