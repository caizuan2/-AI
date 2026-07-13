# AI Team OS 生产数据库迁移与回滚

本流程面向阿里云 RDS PostgreSQL。生产优先使用 RDS + pgvector，Compose 内置 PostgreSQL 只用于隔离验收或应急环境。任何人不得直接编辑生产表结构、运行 `prisma migrate reset`、删除数据库或通过 Prisma Studio 手工修复生产数据。

## 角色分离

- 运行账号：只拥有应用正常 CRUD 所需权限，配置在 `DATABASE_URL`。
- 迁移账号：仅在受控发布窗口使用，配置在 `DIRECT_URL`，不进入应用运行容器的长期凭据范围。
- 备份/恢复账号：按 RDS 最小权限配置在不含 Prisma `schema` 参数的 `BACKUP_DATABASE_URL`，由运维保管。
- 审批人：确认备份恢复点、迁移内容、停机窗口和回滚决策。

`TeamOrganization.companyId`、各 Team OS 业务表的 `companyId`、`TenantCompany.id` 以及共享知识域使用的 `Tenant`/`User.tenantId` 映射必须在迁移前核对。当前部分代码假设这些标识相同；发现不一致时先停止，不能用临时 SQL 强行对齐。

## 1. 发布前备份

1. 记录当前应用提交 SHA、镜像 digest、release 目录和 `prisma migrate status` 输出。
2. 创建 RDS 手工快照，并记录快照 ID、创建时间、实例 ID 与保留期。
3. 运行逻辑备份：

   ```bash
   sudo bash deploy/scripts/backup.sh \
     --env-file /etc/ai-team-os/ai-team-os.env \
     --reason pre-migration
   ```

4. 确认备份文件仅 root 可读，校验 SHA-256，保存脚本生成的元数据。
5. 在隔离数据库完成一次恢复演练；只看到备份文件不等于备份可用。
6. 记录发布期间允许的数据损失窗口（RPO）和恢复时间目标（RTO）。

备份日志不能输出连接串或密码。备份文件应使用 KMS 管理的密钥加密，并复制到与 ECS 不同故障域的受控存储。

## 2. 迁移前验证

在与发布提交一致的干净源代码中执行：

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma validate
pnpm exec prisma migrate status
```

检查 RDS 上 pgvector 状态：

```sql
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';
```

如果扩展不存在或版本不兼容，由数据库管理员通过受审变更启用；不要把高权限扩展安装混入普通应用发布脚本。

逐个审查待执行 migration：

- 是否会锁大表、全表重写或长时间建立索引；
- 是否包含删除列、修改类型、收紧非空约束等不可逆操作；
- 新旧应用是否可同时读取当前 schema；
- `companyId`、`teamId`、`userId`、`createdAt` 索引是否与查询一致；
- 是否需要先回填数据再切换读取逻辑。

无法保证向后兼容时必须拆为 expand -> migrate/backfill -> contract 多次发布。

## 3. 执行迁移

进入维护窗口，先阻止并发发布。推荐只通过 `deploy.sh` 完成 backup -> migration -> cutover；它要求本次命令显式设置 `CONFIRM_MIGRATIONS=true`。如果必须独立演练 migration，先从同一精确提交构建并固定镜像变量，再运行：

```bash
export TEAM_OS_MIGRATION_IMAGE=ai-team-os-migration:<approved-release-id>
docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  --profile tools build migrate

docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  --profile tools run --rm migrate migrate status

docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  --profile tools run --rm migrate migrate deploy
```

只允许 `prisma migrate deploy`，禁止在生产执行 `migrate dev`、`db push` 或 `migrate reset`。迁移失败时保留完整错误编号和 migration 名称，但对外日志隐藏连接串与客户数据。

## 4. 迁移后验证

```bash
docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  --profile tools run --rm migrate migrate status

curl --fail --silent --show-error \
  http://127.0.0.1:3022/api/team-os/status
```

随后执行：

1. 验证 migration 表无 failed/pending 记录。
2. 验证 Team OS 关键索引存在，查询计划使用企业范围条件。
3. 使用企业 A/B 数据执行读写隔离测试。
4. 验证应用日志、RDS 慢查询与错误率无异常。
5. 验证知识库、投喂端和超级管理员原服务未被 Team OS 容器或 Nginx 配置替换。

## 5. 回滚原则

应用回滚不等于数据库回滚：

```bash
sudo env CONFIRM_ROLLBACK=true bash deploy/scripts/rollback.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --target <release-id-or-absolute-release-directory>
```

- `rollback.sh` 只能回滚应用 release/镜像，并验证健康状态；它永不自动逆向 migration 或恢复数据库。
- 只有 migration 向后兼容时，旧应用才可以连接当前 schema。
- 对破坏性迁移，优先发布修复 migration；不得手写修改 `_prisma_migrations`。
- 数据库恢复会覆盖恢复点之后的数据，只能在业务、运维、安全共同批准且隔离新写入后执行。

数据库恢复步骤：创建新 RDS 实例或隔离数据库 -> 从快照/逻辑备份恢复 -> 校验 schema 与租户隔离 -> 校验数据量和关键业务 -> 切换连接 -> 保留故障实例取证。不得直接覆盖唯一生产实例后再验证。

## 迁移记录模板

每次上线必须记录：

- 发布提交 SHA / 镜像 digest / tag；
- migration 名称与校验值；
- RDS 实例 ID、快照 ID、逻辑备份路径与 SHA-256；
- 开始/结束时间、执行人、复核人；
- 迁移前后 `migrate status`；
- 健康检查和 A/B 企业隔离结果；
- 应用回滚目标及数据库恢复决策。
