# AI Team OS Phase 14.5 数据库上线检查表

> 状态：`PREPARATION ONLY / NOT EXECUTED`。本文只定义人工发布窗口的放行顺序，不证明 RDS、备份、migration 或恢复已经执行。禁止把本文中的占位信息替换为真实凭据后提交 Git。

详细操作以 [PRODUCTION_DATABASE.md](./PRODUCTION_DATABASE.md) 和 [DATABASE_MIGRATION.md](../../deploy/DATABASE_MIGRATION.md) 为准；本文件只保留上线检查点，避免形成第二套漂移流程。

## 1. RDS PostgreSQL 前置条件

- ECS 与 RDS 使用同一 VPC/受控网络；RDS `5432` 不对公网开放。
- 生产连接强制 TLS，并验证所需 CA；RDS 白名单只允许应用主机或受控发布网络。
- PostgreSQL 主版本、字符集、时区和 `pgvector`/`vector` extension 已在同规格隔离环境演练。
- RDS 高可用、自动备份、时间点恢复、连接数、存储与告警策略已启用并留存截图或工单证据。
- 生产管理员账号不进入应用环境文件。

## 2. 数据库身份分离

| 变量 | 身份用途 | 生产边界 |
| --- | --- | --- |
| `DATABASE_URL` | 应用运行 | 仅正常 CRUD 所需最小权限 |
| `DIRECT_URL` | Prisma migration | 仅在受控发布窗口注入一次性 migration 容器 |
| `BACKUP_DATABASE_URL` | 一致性逻辑备份 | 不得回退到运行或 migration 身份；不能包含 Prisma `schema` 查询参数 |
| `BACKUP_ENCRYPTION_CERT` | 备份加密公钥证书 | 只放 X.509 公钥证书；恢复私钥必须位于独立恢复控制面 |

三个数据库 URL 均不得写进命令行、日志、截图、工单正文或镜像层。实际配置文件为 `/etc/ai-team-os/ai-team-os.env`，必须由 `root:root` 持有且权限为 `0600`。

## 3. 发布前证据

在允许 migration 前，发布负责人和复核人必须记录：

- 批准的完整 Git commit SHA、规范 tag ref 和候选镜像 ID；
- 当前线上 release、镜像 ID、应用状态与 readiness 结果；
- 待执行 migration 清单、SQL 审核结论、锁表/耗时/兼容性评估；
- RDS 实例 ID、手工快照 ID、创建时间与保留期；
- `backup.sh` 生成的 CMS 加密恢复集、SHA-256、metadata 和异地副本位置；
- 同版本隔离 RDS 的恢复演练记录；
- 对应文件卷快照或对象存储备份，确保数据库记录与附件能一致恢复。

缺少任一项时结论为 `NO-GO`。

## 4. 固定上线顺序

1. 冻结发布内容，记录当前应用和数据库基线。
2. 创建并验证 RDS 手工快照。
3. 人工运行 `deploy/scripts/backup.sh`；验证恢复集是加密文件、校验和与 metadata 一致。
4. 再次审核精确 commit 内的 pending migration。
5. 由 `deploy/scripts/deploy.sh` 在一次性 Compose `migrate` 容器内执行 `prisma migrate status`、`prisma migrate deploy` 和再次 `status`。
6. 运行 schema/`pgvector` 检查以及企业 A 无法读取企业 B 数据的隔离验收。
7. migration 成功后才允许切换 `team-os` 容器，并执行状态、readiness 和关键业务 smoke test。

生产禁止：`prisma db push`、`prisma migrate reset`、手工改表、删除数据库、先裸执行 `docker compose up -d` 再补 migration，或在宿主机直接运行带生产凭据的 `npx prisma migrate deploy`。

## 5. 回滚与恢复边界

- `deploy/scripts/rollback.sh` 只回滚应用 release/镜像；它不执行逆向 migration，也不恢复 dump。
- 向后兼容 migration 出现应用问题时，优先切回已验证的兼容应用版本，同时保留数据库证据。
- 破坏性或不兼容 schema 事故必须进入独立数据库恢复审批：先恢复到新的隔离 RDS，验证 schema、数据量、租户隔离和附件一致性，再决定连接切换。
- 禁止覆盖唯一生产实例后再测试，也禁止把未经演练的 dump 直接恢复到生产。

## 6. Go / No-Go 记录

| 检查项 | 状态 | 证据/编号 | 操作者 | 复核人 | UTC 时间 |
| --- | --- | --- | --- | --- | --- |
| RDS 私网、TLS、白名单 | PENDING |  |  |  |  |
| `pgvector` 与版本兼容 | PENDING |  |  |  |  |
| migration SQL 审核与演练 | PENDING |  |  |  |  |
| RDS 手工快照 | PENDING |  |  |  |  |
| CMS 加密逻辑备份与 SHA | PENDING |  |  |  |  |
| 隔离恢复演练 | PENDING |  |  |  |  |
| schema 与企业隔离验证 | PENDING |  |  |  |  |

只有所有项目为 `PASS` 且有双人复核，才可进入生产切换。
