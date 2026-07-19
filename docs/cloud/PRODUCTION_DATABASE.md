# AI Team OS 阿里云 RDS PostgreSQL 生产上线手册

本文定义 AI Team OS 使用阿里云 RDS PostgreSQL 的创建、连接、迁移、验证、备份和恢复边界。所有 SQL/schema 变更只能来自已审核的 Prisma migration；禁止在生产执行 `prisma db push`、`migrate reset`、drop 或临时手工改表。

> 当前状态：`PENDING RDS PROVISIONING AND RESTORE DRILL`。本文不证明真实 RDS 已创建、pgvector 已启用、migration 已执行或备份可恢复。

## 1. 目标与边界

- RDS 通过 VPC 私网连接 ECS，不开放公网数据库端口。
- 生产数据库必须支持 PostgreSQL `vector` extension；仓库已有 migration 会执行 `CREATE EXTENSION IF NOT EXISTS vector`。
- `DATABASE_URL`、`DIRECT_URL`、`BACKUP_DATABASE_URL` 分别使用运行、迁移、备份身份。
- 正式部署保持 `ENABLE_BUNDLED_POSTGRES=false`；Compose `database` profile 仅用于隔离测试。
- 应用回滚不回滚数据库。任何数据库恢复都需要独立事故审批、停写和恢复演练。
- 数据库 dump 不包含 `team_os_storage`、`team_os_uploads` 等 Docker 卷；文件卷必须另做加密快照和恢复验证。

## 2. RDS 创建清单

在阿里云控制台或 IaC 中创建，变更单至少记录：

1. 地域/可用区与 ECS 网络连通方案；生产高可用、故障转移策略符合业务 RTO。
2. PostgreSQL 版本在所选地域受支持，并确认 `pgvector`/`vector` extension 可用。
3. 存储加密、自动扩容上限、磁盘/连接/CPU/延迟告警已配置。
4. 自动备份窗口、保留期、跨地域/跨故障域策略满足批准的 RPO/RTO。
5. TLS 已启用；Prisma 6 运行/迁移连接使用固定 CA、`sslmode=require` 与 `sslaccept=strict`，libpq 备份连接使用固定 CA 与 `sslmode=verify-full`。
6. 白名单或安全组只允许 ECS 私网来源和受控运维入口，不允许全网。
7. 时区、字符集、连接数和参数组已审核；不要为掩盖连接泄漏盲目增大连接数。
8. 运维审计、慢查询、失败登录、备份失败和存储阈值告警已接入。

建议先在同版本、同 extension 的隔离 RDS 上完整演练，再创建生产实例。

## 3. 数据库和账号分权

由 DBA/RDS 管理员创建数据库与账号，不把管理员凭据放入应用环境：

| 身份 | 环境变量 | 权限边界 |
| --- | --- | --- |
| Runtime | `DATABASE_URL` | 应用正常 CRUD、序列和必要查询；不得创建角色/数据库或管理备份 |
| Migration | `DIRECT_URL` | 仅在发布窗口执行已审核 migration；不注入运行容器 |
| Backup | `BACKUP_DATABASE_URL` | 执行一致性逻辑 dump 所需最小读取权限；不作为运行或迁移账号 |
| DBA/Restore | 不进入 `.env` | 创建实例/库、授权、快照、隔离恢复；只在受控操作面使用 |

账号必须使用独立密码、轮换记录和最小权限。生产 URL 中保留特殊字符时必须做 URL encoding；不要把连接串复制到 shell history、CI log、工单或测试报告。

## 4. 环境配置

在 `/etc/ai-team-os/ai-team-os.env` 配置，不提交真实值：

```text
DATABASE_CA_CERT="/etc/ai-team-os/rds-ca.pem"
DATABASE_URL="postgresql://RUNTIME_IDENTITY:SECRET@PRIVATE_RDS_HOST:5432/DATABASE?sslmode=require&sslrootcert=%2Fetc%2Fai-team-os%2Frds-ca.pem&sslaccept=strict&schema=public"
DIRECT_URL="postgresql://MIGRATION_IDENTITY:SECRET@PRIVATE_RDS_HOST:5432/DATABASE?sslmode=require&sslrootcert=%2Fetc%2Fai-team-os%2Frds-ca.pem&sslaccept=strict&schema=public"
BACKUP_DATABASE_URL="postgresql://BACKUP_IDENTITY:SECRET@PRIVATE_RDS_HOST:5432/DATABASE?sslmode=verify-full&sslrootcert=%2Fetc%2Fai-team-os%2Frds-ca.pem"
ENABLE_BUNDLED_POSTGRES="false"
```

以上是不可直接使用的占位格式。`BACKUP_DATABASE_URL` 是 libpq URL，不能携带 Prisma 的 `schema` 参数，也不能使用 Prisma 专用的 `sslaccept`。将阿里云审核通过的 RDS CA 公钥证书安装到宿主机固定路径 `/etc/ai-team-os/rds-ca.pem`，保持 `root:root`、`0644`，不得包含私钥。Compose 会把同一宿主机路径只读挂载到 runtime 与 migration 容器；`backup.sh` 会把它只读挂载到临时 PostgreSQL 客户端容器。不要在 URL 中填写其他宿主机路径：部署预检会拒绝，避免出现“宿主机 psql 通过、容器看不到 CA”的假绿。环境文件本身保持 `root:root 0600`，CA 不进入镜像层或 Git。

## 5. 上线前兼容验证

在隔离环境使用与生产相同的 RDS 主版本/extension：

1. 从批准 commit 构建 migration 镜像。
2. 执行全部 committed migrations。
3. 先运行 `cloud-preflight-check.sh`，确认 Runtime、Migration、Backup 三个身份都通过固定 CA 与主机名校验的只读 `SELECT 1`；再执行 `prisma migrate status` 和 `verify-team-os-schema.mjs`。
4. 验证 `vector` extension、向量列和索引可用。
5. 以接近生产规模检查 migration 锁等待、执行时间和磁盘增长。
6. 以 Runtime 账号运行完整业务回归，确认它没有 migration/管理员权限。
7. 用 Backup 账号生成 dump，并恢复到全新隔离数据库。

任何 migration 需要长时间锁表、重写大表或不可向后兼容时，必须拆成单独维护窗口和扩展/迁移/收缩方案；不能交给自动部署碰运气。

## 6. 备份与迁移顺序

正式变更前同时具备：RDS 手工快照、逻辑备份、文件卷快照和上一个应用 release。先手工执行并记录一份逻辑备份：

```bash
export APPROVED_RELEASE='REPLACE_WITH_APPROVED_RELEASE_ID'
cd /opt/ai-team-os-control
sudo bash deploy/scripts/backup.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --release "$APPROVED_RELEASE" \
  --reason pre-production-migration
```

`backup.sh` 先验证 `/run/ai-team-os` 是 tmpfs 且主机未启用 swap，再创建一份 root-only 配置快照，并从同一快照读取备份连接、加密配置和生成数据库 dump，避免凭据轮换造成混合恢复集。开始 dump 前会读取 `pg_database_size`，核对 tmpfs 可用量、固定保留至少 256 MiB 给系统，并对写入进程设置文件大小上限；容量不足时在写入前停止，必须改用经审批的独立加密备份 worker，不能扩大 `/run` 挤占系统内存。digest 固定的 PostgreSQL 客户端容器生成 custom-format dump 并执行 `pg_restore --list` 后，明文 dump 立即用固定 X.509 公钥证书加密为 `database.dump.cms`；配置加密为 `configuration.env.cms`。持久备份目录只发布两个 CMS 密文、SHA-256 与 metadata；metadata 额外记录非敏感的接收证书 SHA-256 指纹，证书轮换后必须用该指纹选择对应的离线私钥。对应私钥保存在 ECS 外的 KMS/HSM 或离线恢复库。全部验证后隐藏候选目录才原子 rename；任一步失败会删除候选集。恢复时不得把旧密钥覆盖到错误环境，测试报告只能记录目录名、哈希和时间，不能附内容。

随后只通过受控发布脚本迁移：

```bash
sudo env CONFIRM_MIGRATIONS=true \
  bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --source-mode git \
  --release-ref "$RELEASE_REF" \
  --release-sha "$RELEASE_SHA"
```

脚本自身会再次执行 pre-migration backup，然后运行：

1. `prisma migrate deploy`；
2. `prisma migrate status`；
3. Team OS 关键表/列 schema verifier；
4. 新应用切换后的 database/schema/AI readiness。

备份、migration、status 或 schema verifier 任一失败都必须停止发布。不得改写 migration history、跳过失败 migration 或用 `db push` 继续。

## 7. 上线后数据库验证

至少保存以下证据，但不得保存连接串或业务敏感数据：

- RDS 实例健康、主备/高可用、存储和连接数状态。
- `prisma migrate status` 无 pending/failed migration。
- `verify-team-os-schema.mjs` 返回 `ok=true` 及检查表数量。
- `/api/health?database=true&schema=true&ai=true` 返回 `ok=true`，该内部端点不公开给不受信网络。
- Team OS 组织、任务、CRM、培训、通知等只访问 Pilot Company 数据。
- query/body/path ID 的企业 A/B 越权测试全部拒绝。
- 慢查询、连接池、CPU、IO、锁等待和错误告警已实际验证。

## 8. 备份策略

建议按业务批准的 RPO/RTO确定具体频率和保留期，而不是照抄固定天数：

- RDS 自动备份与时间点恢复：由 RDS 策略执行并持续监控。
- 每次 migration 前：手工 RDS 快照 + `backup.sh` custom dump。
- 定期逻辑备份：写入 root-only 目录，校验 SHA-256，加密并复制到独立故障域。
- 文件卷：对 `team_os_storage`、`team_os_uploads` 做独立 ECS 云盘/对象存储快照。
- 配置：`BACKUP_ENCRYPTION_CERT=/etc/ai-team-os/backup-encryption-cert.pem` 只存公钥证书，私钥留在独立恢复控制面；报告只保存恢复集、文件哈希和时间，不保存内容。
- 恢复演练：按 RPO/RTO 周期在隔离实例真实恢复，不能只运行 `pg_restore --list`。
- 删除：保留期到期需要审计，不能让同一被攻陷主机拥有所有异地备份删除权限。

## 9. 恢复流程

优先恢复到新的隔离 RDS 实例/数据库，不直接覆盖现有生产：

1. 宣布事故、冻结写入、记录当前应用 release、镜像、migration 和时间点。
2. 选择已验证的 RDS 快照或 CMS 加密 custom dump，复核 SHA-256、时间点和依赖的文件卷快照。
   先把 `metadata.txt` 的 `recipient_cert_fingerprint_sha256` 与恢复证书执行 `openssl x509 -noout -fingerprint -sha256` 后去掉冒号并转小写的结果精确比对；不一致立即停止。随后在隔离恢复机通过 KMS/HSM 或离线私钥把数据库与配置密文解密到受控 tmpfs，禁止把私钥复制到生产 ECS：

   ```bash
   openssl cms -decrypt -inform DER \
     -in configuration.env.cms \
     -recip backup-encryption-cert.pem \
     -inkey RECOVERY_PRIVATE_KEY \
     -out /run/ai-team-os-recovery/recovered.env
   openssl cms -decrypt -inform DER \
     -in database.dump.cms \
     -recip backup-encryption-cert.pem \
     -inkey RECOVERY_PRIVATE_KEY \
     -out /run/ai-team-os-recovery/database.dump
   pg_restore --list /run/ai-team-os-recovery/database.dump >/dev/null
   chmod 0600 /run/ai-team-os-recovery/recovered.env \
     /run/ai-team-os-recovery/database.dump
   ```

   `/run/ai-team-os-recovery` 必须事先验证为 tmpfs；演练完成立即删除明文恢复文件。只有一次由独立私钥完成的解密、`pg_restore` 和业务校验全部成功，才能证明公钥证书与恢复私钥匹配。

3. 以 DBA/Restore 身份恢复到新实例，不使用 Runtime 账号。
4. 确认 `vector` extension、migration status、Team OS schema、行数/约束和关键数据一致性。
5. 用隔离应用执行 Pilot Company 与 Control Company 的权限/业务回归。
6. 评估当前/回滚应用与恢复后 schema 的兼容性。
7. 经数据库、安全、业务和运维批准后，原子更新受控连接配置并重启应用。
8. 验证 readiness、错误率和审计日志；保留原实例直到恢复窗口关闭。

应用 `rollback.sh` 不会执行上述流程。没有停写点、恢复演练或文件卷一致性时，不得宣称“数据库已可回滚”。

## 10. 数据隔离与 Go/No-Go

生产数据库可连接、schema 正确仍不足以商业上线。以下任一项未通过即 `NO-GO`：

- canonical Tenant/TenantCompany/TeamOrganization 映射和安全 provisioning 未完成。
- 企业 A/B query、body、path ID 越权集成测试未在真实数据库通过。
- `DISABLED`/`EXPIRED` 企业、停用成员、套餐 feature guard 未在每个受限 API 服务端执行。
- RDS TLS、账号分权、自动备份、手工快照、异地副本或恢复演练缺失。
- 数据库日志/备份泄露连接串、客户隐私或密钥。

## 11. 证据表

| 项目 | 状态 | 证据位置 | 负责人/复核人 | 时间 |
| --- | --- | --- | --- | --- |
| RDS 私网/TLS/白名单 | PENDING |  |  |  |
| pgvector 可用 | PENDING |  |  |  |
| 账号分权 | PENDING |  |  |  |
| migration status | PENDING |  |  |  |
| Team OS schema verifier | PENDING |  |  |  |
| RDS 快照和逻辑备份 | PENDING |  |  |  |
| 隔离恢复演练 | PENDING |  |  |  |
| A/B 企业隔离 | PENDING |  |  |  |
