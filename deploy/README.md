# AI Team OS Phase 14 阿里云生产部署说明

本目录提供 AI Team OS 的生产部署资料、容器定义、Nginx 模板、备份/发布/回滚脚本和上线检查文档。目标环境是独立的阿里云 ECS，公开入口使用独立域名，应用仅监听宿主机回环地址 `127.0.0.1:3022`。

> “部署资料完成”不等于“生产已上线”。只有真实 ECS、域名证书、RDS、生产密钥、健康检查和 Pilot 验收均通过后，才允许创建 live-ready 标签。

## 架构与隔离边界

```text
用户 / APP
    |
    | HTTPS :443
    v
阿里云 DNS -> ECS 安全组 -> Nginx
                              |
                              | HTTP 127.0.0.1:3022
                              v
                         team-os 容器
                              |
                +-------------+-------------+
                |                           |
                v                           v
       RDS PostgreSQL + pgvector       外部 AI Provider
                |
                +-- Redis（仅预留，当前业务未使用）
```

- Nginx 是唯一公网入口，ECS 安全组不开放 `3022`。
- 默认生产拓扑使用阿里云 RDS PostgreSQL，并启用/验证 pgvector。Compose 中 PostgreSQL 仅是显式启用的应急或验收 profile，不是推荐的生产数据库。
- `backup.sh` 从同一份 tmpfs 配置快照选择数据库并生成 PostgreSQL custom dump；写入前按 `pg_database_size` 检查 tmpfs 容量、预留 256 MiB 系统余量并设置文件上限。数据库 dump 与生产环境文件都使用离线/KMS 恢复私钥对应的 X.509 公钥证书加密为 CMS 恢复件。密文、校验和和 metadata 全部验证后才以目录 rename 原子发布。备份目录和异地副本仍必须使用加密磁盘/加密传输。`team_os_storage` 与 `team_os_uploads` 若实际承载头像/文件，须另配加密卷快照、异地复制和恢复演练。
- Redis profile 只为未来缓存和队列预留；当前应用不消费 `REDIS_URL`，生产环境保持关闭。
- Docker 构建仍然构建仓库根目录的 Next.js monolith，并不是一个物理上独立的 Team OS 二进制。隔离依赖独立 ECS/容器/端口与 `deploy/nginx/ai-team-os.conf` 的路由 allowlist；Nginx 对知识库、投喂端、超级管理员、Chat 和 RAG 路由默认返回 `404`。
- 路由 allowlist 是暴露面控制，不替代服务端身份认证、RBAC、套餐校验和企业数据隔离。
- AI Brain 的知识发布/优化适配器会按 `APP_URL` 回调根应用的 `/api/core/ingest` 与 `/api/admin/knowledge/optimize`；模板要求 `APP_URL` 指向独立、受信任的现有知识服务 HTTPS origin，而 `NEXT_PUBLIC_APP_URL` 指向 Team OS 域名。敏感路径继续被 Team OS 公网 allowlist 阻断，不能为图省事将两者配置成同一 origin。
- 运行容器只接收运行时变量白名单，不接收 `DIRECT_URL`、`BACKUP_DATABASE_URL` 或内置数据服务密码；迁移与备份凭据分别只在一次性 migration 容器和 root 运维脚本中使用。

## 目录

```text
deploy/
├── app-production.env.template
├── VERSION_CHECK.json
├── nginx/ai-team-os.conf
├── docker/Dockerfile.production
├── docker/docker-compose.yml
├── scripts/deploy.sh
├── scripts/backup.sh
├── scripts/rollback.sh
├── scripts/server-init.sh
├── scripts/cloud-preflight-check.sh
├── scripts/production-health-check.sh
├── scripts/verify-deployment.mjs
├── DATABASE_MIGRATION.md
├── DOMAIN_SSL_SETUP.md
├── ENTERPRISE_ONBOARDING.md
├── PILOT_COMPANY_TEST.md
├── SECURITY_CHECKLIST.md
└── APP_RELEASE_READINESS.md

docs/cloud/
├── ALIYUN_DEPLOYMENT.md
├── ALIYUN_EXECUTION_GUIDE.md
├── PRODUCTION_COMMANDS.md
├── DATABASE_RELEASE.md
├── HTTPS_SETUP.md
├── DOMAIN_SSL_PRODUCTION.md
├── PRODUCTION_DATABASE.md
└── PILOT_TEST_PLAN.md
```

## 主机前置条件

1. 64 位 Linux ECS，时间同步正常，磁盘和 inode 有告警。
2. Docker Engine、Docker Compose `2.33.1+`、Nginx、Git、Node.js `22.13+`、PostgreSQL client `psql`、curl、flock、sha256sum 已安装；Compose 最低版本来自 `gw_priority` 网络出口选择能力，`psql` 只用于不暴露连接串的 TLS 认证检查，pnpm 由构建镜像固定安装，不在宿主机以 root 执行仓库 package scripts。
3. ECS 到 RDS、AI Provider、镜像仓库和代码源的出站访问已按最小权限放行。
4. `/opt/ai-team-os`、`/var/lib/ai-team-os`、`/var/backups/ai-team-os` 与 `/var/www/ai-team-os/updates` 位于受监控磁盘。
5. RDS 已设置自动备份、跨可用区策略、白名单和 TLS；迁移账号与运行账号分离。
6. 商业上线阻断项已按 `SECURITY_CHECKLIST.md`、`ENTERPRISE_ONBOARDING.md` 和 `APP_RELEASE_READINESS.md` 关闭并由责任人签字。
7. `deploy/`、根 `.dockerignore` 与 `.env.production.template` 来自审核过的部署控制提交，并安装在 root-owned、不可被组/其他用户写入的主机目录；不要直接从普通用户可写 checkout 以 root 运行脚本。精确 SHA 的发布代码可以更新应用与已审批 migration，但不能替换主机固定的 Compose、Dockerfile、Nginx、backup/rollback 和 deployment verifier。脚本会把控制面 hash schema 与组合 SHA-256 写入 release metadata，回滚时按记录的 schema 重新计算；缺少 schema 的 Phase 13 metadata 按 schema 1 验证，Phase 14 使用 schema 2 并包含服务器初始化和生产健康脚本。源码 SHA 与 orchestrator SHA 是两个独立审计身份，均须进入变更单。
8. 发布、状态、备份、更新清单与 `/run/ai-team-os` 锁目录的每一级路径必须由 root 拥有且不可被组/其他用户写入，也不能包含符号链接；脚本会创建或修正叶子目录并拒绝不安全的上级目录、状态文件和旧 release tree。

## 首次配置

在服务器上创建生产环境文件，真实密钥只保存在服务器或阿里云 KMS/Secrets Manager，不进入 Git：

```bash
sudo install -d -m 0750 /etc/ai-team-os
sudo cp .env.production.template /etc/ai-team-os/ai-team-os.env
sudo chown root:root /etc/ai-team-os/ai-team-os.env
sudo chmod 0600 /etc/ai-team-os/ai-team-os.env
sudoedit /etc/ai-team-os/ai-team-os.env
```

安全团队还必须从离线恢复系统或 KMS 导出只含公钥的 X.509 PEM 证书，并安装到固定路径；对应私钥不得放在 ECS：

```bash
sudo install -o root -g root -m 0644 BACKUP_PUBLIC_CERT_SOURCE \
  /etc/ai-team-os/backup-encryption-cert.pem
sudo openssl x509 -in /etc/ai-team-os/backup-encryption-cert.pem -noout
```

必须替换所有域名、数据库连接、部署源和密钥占位值。`APP_URL` 必须是受信知识服务 origin，不能等于 `NEXT_PUBLIC_APP_URL`；RDS CA 必须安装在固定的 `DATABASE_CA_CERT=/etc/ai-team-os/rds-ca.pem`（`root:root 0644`、仅公钥证书），Compose 与备份容器只读挂载同一路径。Prisma 运行/迁移 URL 使用 `sslmode=require&sslaccept=strict`，libpq `BACKUP_DATABASE_URL` 使用 `sslmode=verify-full`、独立备份账号且不能包含 Prisma 专用 `schema` 参数；三条 URL 都必须指定固定 `sslrootcert`，其他宿主机 CA 路径会被拒绝。`BACKUP_ENCRYPTION_CERT` 保持固定公钥证书路径。`PG_BACKUP_IMAGE` 必须保持为审核过的 `image@sha256` 引用，升级 PostgreSQL 客户端镜像需重新扫描并更新 digest。`SESSION_SECRET` 与 `ENCRYPTION_KEY` 必须独立生成、不能复用；兼容变量 `TEAM_OS_INTEGRATION_ENCRYPTION_KEY` 建议留空，如旧环境必须保留则只能与 `ENCRYPTION_KEY` 完全相同。`TEAM_OS_BIND_ADDRESS` 必须保持 `127.0.0.1`，`TEAM_OS_PORT` 保持 `3022`。运维脚本使用严格白名单 dotenv 解析器，键不可重复，值按字面量导入且不会执行 `$()`、反引号、变量展开或转义；含空格的值必须使用成对单引号或双引号。

部署脚本默认读取 `/etc/ai-team-os/ai-team-os.env`，也可用 `--env-file` 显式覆盖：

生产窗口前先运行纯只读阿里云预检；它检查 Ubuntu、CPU、内存、磁盘/inode、Docker/Compose/Buildx、Git、Node、80/443/3022、环境文件权限和 PostgreSQL TLS `SELECT 1`，不会安装软件、启动服务、构建镜像或执行 migration：

```bash
sudo bash deploy/scripts/cloud-preflight-check.sh \
  --env-file /etc/ai-team-os/ai-team-os.env
```

预检必须全部 `PASS` 才能继续，且本机端口检查不等于 ECS 安全组、DNS 或 HTTPS 已经验收。详细人工步骤见 `docs/cloud/ALIYUN_EXECUTION_GUIDE.md`。

```bash
sudo env CONFIRM_MIGRATIONS=true bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env
```

`deploy.sh` 无位置参数，从 `DEPLOY_SOURCE_MODE`、`DEPLOY_RELEASE_REF`、`DEPLOY_REPOSITORY_URL` 或 `DEPLOY_SOURCE_ARCHIVE` 读取不可变发布源。Git 模式的 ref 只接受完整 commit SHA 或规范化的 `refs/tags/...`，并且还必须提供完整 `DEPLOY_RELEASE_SHA`；脚本会核对 fetch 后的 commit，tag 的签名验证应在 CI 完成。启动时它先把 root-only 生产环境复制到无 swap 的 tmpfs，后续备份、migration、Compose 构建和切换全部读取同一快照，避免凭据轮换造成跨数据库操作。`CONFIRM_MIGRATIONS=true` 必须由本次命令显式传入，不能长期写进环境文件。

使用经 CI 从精确提交生成的干净 `git archive` 时，必须同时提供归档对应的提交 SHA；脚本不会从未受信任的文件名猜测版本：

```bash
sudo install -d -o root -g root -m 0750 /var/lib/ai-team-os/incoming
sudo install -o root -g root -m 0600 REVIEWED_ARCHIVE_SOURCE \
  /var/lib/ai-team-os/incoming/ai-team-os-release.tar
sudo env CONFIRM_MIGRATIONS=true bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --source-mode archive \
  --archive /var/lib/ai-team-os/incoming/ai-team-os-release.tar \
  --release-sha <full-commit-sha> \
  --archive-sha256 <archive-sha256>
```

归档必须来自已审核提交且没有顶层目录前缀；脚本先把输入复制成 root-owned `0600` 快照，后续 SHA、commit-id、条目类型检查和解包只读取该快照，避免校验后换包。发布记录也必须保存 `DEPLOY_SOURCE_ARCHIVE_SHA256`。归档模式固定记录 `commit/<sha>`，拒绝额外伪装成 tag 的 release ref；`DEPLOY_RELEASE_SHA` 只标识源码提交，不能替代归档文件的传输校验。

## 标准发布流程

1. 在 CI 对同一提交运行 lint、typecheck、build、Prisma validate、部署契约检查和容器配置检查。
2. 记录当前容器镜像、提交 SHA、数据库 migration 状态和最近可用 release，作为回滚基线。
3. 按 `DATABASE_MIGRATION.md` 完成 RDS 快照和逻辑备份，并验证备份文件校验和。
4. 对精确提交的全部 pending migration 完成审批，再以一次性命令设置 `CONFIRM_MIGRATIONS=true` 执行 `deploy.sh`。依赖安装、lint、typecheck、部署合同和 build 都在无生产密钥的构建镜像内完成。
5. 脚本同时确认 `/api/team-os/status` 的 `success=true` 与内部 `/api/health?database=true&schema=true&ai=true` 的 `ok=true`；失败会尝试恢复切换前的内容寻址镜像，但绝不自动回滚数据库。
6. 执行 `PILOT_COMPANY_TEST.md`，尤其是 A/B 企业越权与停用状态测试。
7. 经业务、安全和运维共同批准后才允许切换 DNS 或正式开放用户。

部署不会自动回滚数据库。应用回滚必须先确认旧版本与当前 schema 兼容：

```bash
sudo env CONFIRM_ROLLBACK=true bash deploy/scripts/rollback.sh \
  --env-file /etc/ai-team-os/ai-team-os.env
```

必须显式设置 `CONFIRM_ROLLBACK=true`。可用 `--target <release-id-or-absolute-release-directory>` 指定已记录 release，也可用 `--tag <git-tag>` 从受保护的 release metadata 中选择唯一匹配项；两者都不传时读取 previous state。脚本只接受具有发布元数据的 release，不直接接受任意镜像引用。数据库恢复必须走独立的事故审批流程，不能由应用回滚脚本触发。

发布或回滚后，以 root 在 ECS 运行只读健康报告：

```bash
sudo bash deploy/scripts/production-health-check.sh \
  --env-file /etc/ai-team-os/ai-team-os.env
```

报告分别标记容器、状态 API、数据库/schema、AI 配置和消息表就绪情况；没有专用鉴权探针时，消息“投递”只能标记为未验证，不能把 schema 存在误报为通知已送达。脚本要求 root、`/run/ai-team-os` 为 tmpfs 且没有活动 swap，原始响应不会写入共享 `/tmp`；退出码 `0/1/2` 分别表示 healthy、unhealthy、degraded/unverified，生产放行只接受 `0`。

四端发布统一从 `deploy/app-production.env.template` 取正式 HTTPS origin，并通过 Flutter `--dart-define=TEAM_OS_BASE_URL=...` 注入。该模板不会被 Flutter 自动读取，不能包含 API Key、密码或服务端密钥。

## Compose 使用约束

生产环境只允许通过 `deploy.sh` 切换 `team-os`；禁止直接运行裸 `docker compose up -d`，否则会绕过精确 SHA、迁移前备份、schema 验证、状态 metadata 和失败恢复。生产窗口可独立运行的 Compose 命令仅限 `config --quiet` 等只读配置验证。

Compose 中的 PostgreSQL 与 Redis profile 只供明确隔离的非生产环境使用。隔离环境必须使用独立 env、数据库、卷和网络，不能读取 `/etc/ai-team-os/ai-team-os.env`；内置服务不向宿主机发布端口，但仍需强密码、卷备份和恢复演练。不得在正式 RDS 已启用时误启用内置 PostgreSQL。

## 验收入口

- `https://<TEAM_OS_DOMAIN>/team-os`
- `https://<TEAM_OS_DOMAIN>/api/team-os/status`
- `https://<TEAM_OS_DOMAIN>/updates/ai-team-os/version.json`

以下路径在 Team OS 独立域名上应返回 `404`：知识库用户端、投喂端、超级管理员、Chat 和其他未列入 allowlist 的路径。登录相关路径只用于共用现有会话体系，不表示可以在本阶段修改登录、卡密或鉴权逻辑。

## 发布停止条件

出现以下任一情况立即停止切流：

- 备份不可恢复、migration 状态异常或 RDS/pgvector 不可用；
- `/api/team-os/status` 非 2xx，或登录/会话产生循环跳转；
- 企业 A 能通过 query、body 或企业 B 的资源 ID 读取/修改 B 数据；
- `DISABLED`/`EXPIRED` 企业仍能调用受保护业务 API；
- 套餐限制仅在 UI 显示、服务端未拒绝受限功能；
- `APP_URL` 未指向经过鉴权、企业隔离和可用性验证的独立知识服务 origin，或误与 Team OS 公网 origin 相同；
- 阿里云 SLS/集中式不可篡改日志、告警和保留策略尚未实际配置；
- 日志出现密码、Cookie、API Key、邀请代码或客户隐私；
- APP 仍使用占位标识、未签名包或无法校验的更新清单。
