# AI Team OS Phase 13 阿里云生产部署说明

本目录提供 AI Team OS 的生产部署资料、容器定义、Nginx 模板、备份/发布/回滚脚本和上线检查文档。目标环境是独立的阿里云 ECS，公开入口使用独立域名，应用仅监听宿主机回环地址 `127.0.0.1:3022`。

> `ai-team-os-phase13-production-release-ready` 只表示部署资料与源代码基线已冻结，不代表商业功能验收通过、移动端安装包已发布或已经批准生产切流。

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
- `backup.sh` 只负责 PostgreSQL custom dump；`team_os_storage` 与 `team_os_uploads` 若实际承载头像/文件，必须在 ECS 上另配加密卷快照、异地复制和恢复演练，数据库 dump 不能替代文件卷备份。
- Redis profile 只为未来缓存和队列预留；当前应用不消费 `REDIS_URL`，生产环境保持关闭。
- Docker 构建仍然构建仓库根目录的 Next.js monolith，并不是一个物理上独立的 Team OS 二进制。隔离依赖独立 ECS/容器/端口与 `deploy/nginx/ai-team-os.conf` 的路由 allowlist；Nginx 对知识库、投喂端、超级管理员、Chat 和 RAG 路由默认返回 `404`。
- 路由 allowlist 是暴露面控制，不替代服务端身份认证、RBAC、套餐校验和企业数据隔离。
- AI Brain 的知识发布/优化适配器会按 `APP_URL` 回调根应用的 `/api/core/ingest` 与 `/api/admin/knowledge/optimize`；模板要求 `APP_URL` 指向独立、受信任的现有知识服务 HTTPS origin，而 `NEXT_PUBLIC_APP_URL` 指向 Team OS 域名。敏感路径继续被 Team OS 公网 allowlist 阻断，不能为图省事将两者配置成同一 origin。
- 运行容器只接收运行时变量白名单，不接收 `DIRECT_URL`、`BACKUP_DATABASE_URL` 或内置数据服务密码；迁移与备份凭据分别只在一次性 migration 容器和 root 运维脚本中使用。

## 目录

```text
deploy/
├── VERSION_CHECK.json
├── nginx/ai-team-os.conf
├── docker/Dockerfile.production
├── docker/docker-compose.yml
├── scripts/deploy.sh
├── scripts/backup.sh
├── scripts/rollback.sh
├── scripts/verify-deployment.mjs
├── DATABASE_MIGRATION.md
├── DOMAIN_SSL_SETUP.md
├── ENTERPRISE_ONBOARDING.md
├── PILOT_COMPANY_TEST.md
├── SECURITY_CHECKLIST.md
└── APP_RELEASE_READINESS.md
```

## 主机前置条件

1. 64 位 Linux ECS，时间同步正常，磁盘和 inode 有告警。
2. Docker Engine、Docker Compose `2.33.1+`、Nginx、Git、Node.js 22、curl、flock、sha256sum 已安装；Compose 最低版本来自 `gw_priority` 网络出口选择能力，pnpm 由构建镜像固定安装，不在宿主机以 root 执行仓库 package scripts。
3. ECS 到 RDS、AI Provider、镜像仓库和代码源的出站访问已按最小权限放行。
4. `/opt/ai-team-os`、`/var/lib/ai-team-os`、`/var/backups/ai-team-os` 与 `/var/www/ai-team-os/updates` 位于受监控磁盘。
5. RDS 已设置自动备份、跨可用区策略、白名单和 TLS；迁移账号与运行账号分离。
6. 商业上线阻断项已按 `SECURITY_CHECKLIST.md`、`ENTERPRISE_ONBOARDING.md` 和 `APP_RELEASE_READINESS.md` 关闭并由责任人签字。
7. `deploy/`、根 `.dockerignore` 与 `.env.production.template` 来自审核过的部署控制提交，并安装在 root-owned、不可被组/其他用户写入的主机目录；不要直接从普通用户可写 checkout 以 root 运行脚本。精确 SHA 的发布代码可以更新应用与已审批 migration，但不能替换主机固定的 Compose、Dockerfile、Nginx、backup/rollback 和 deployment verifier。脚本会把该控制面的组合 SHA-256 写入 release metadata，回滚时重新计算并核对；源码 SHA 与 orchestrator SHA 是两个独立审计身份，均须进入变更单。
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

必须替换所有域名、数据库连接、部署源和密钥占位值。`APP_URL` 必须是受信知识服务 origin，不能等于 `NEXT_PUBLIC_APP_URL`；`BACKUP_DATABASE_URL` 必须使用独立备份账号且不能包含 Prisma 专用 `schema` 参数。`PG_BACKUP_IMAGE` 必须保持为审核过的 `image@sha256` 引用，升级 PostgreSQL 客户端镜像需重新扫描并更新 digest。`SESSION_SECRET` 与 `ENCRYPTION_KEY` 必须独立生成、不能复用；兼容变量 `TEAM_OS_INTEGRATION_ENCRYPTION_KEY` 建议留空，如旧环境必须保留则只能与 `ENCRYPTION_KEY` 完全相同。`TEAM_OS_BIND_ADDRESS` 必须保持 `127.0.0.1`，`TEAM_OS_PORT` 保持 `3022`。运维脚本使用严格白名单 dotenv 解析器，键不可重复，值按字面量导入且不会执行 `$()`、反引号、变量展开或转义；含空格的值必须使用成对单引号或双引号。

部署脚本默认读取 `/etc/ai-team-os/ai-team-os.env`，也可用 `--env-file` 显式覆盖：

```bash
sudo env CONFIRM_MIGRATIONS=true bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env
```

`deploy.sh` 无位置参数，从 `DEPLOY_SOURCE_MODE`、`DEPLOY_RELEASE_REF`、`DEPLOY_REPOSITORY_URL` 或 `DEPLOY_SOURCE_ARCHIVE` 读取不可变发布源。Git 模式还必须提供完整 `DEPLOY_RELEASE_SHA`，脚本会核对 fetch 后的 commit；tag 的签名验证应在 CI 完成。`CONFIRM_MIGRATIONS=true` 必须由本次命令显式传入，不能长期写进环境文件。

使用经 CI 从精确提交生成的干净 `git archive` 时，必须同时提供归档对应的提交 SHA；脚本不会从未受信任的文件名猜测版本：

```bash
sudo env CONFIRM_MIGRATIONS=true bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --source-mode archive \
  --archive /tmp/ai-team-os-release.tar \
  --release-sha <full-commit-sha> \
  --archive-sha256 <archive-sha256>
```

归档必须来自已审核提交且没有顶层目录前缀；脚本会在解压前核对 `DEPLOY_SOURCE_ARCHIVE_SHA256`，发布记录也必须保存该值。`DEPLOY_RELEASE_SHA` 只标识源码提交，不能替代归档文件的传输校验。

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

必须显式设置 `CONFIRM_ROLLBACK=true`，也可用 `--target <release-id-or-absolute-release-directory>` 指定已记录 release；不传 `--target` 时读取 previous state。脚本只接受具有发布元数据的 release，不直接接受任意镜像引用。数据库恢复必须走独立的事故审批流程，不能由应用回滚脚本触发。

## Compose 使用约束

默认只启动 Team OS：

```bash
docker compose --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  up -d team-os
```

只有非生产隔离环境明确需要时，才启用内置数据库或 Redis：

```bash
docker compose --env-file /etc/ai-team-os/ai-team-os.env \
  --profile database -f deploy/docker/docker-compose.yml up -d postgres
docker compose --env-file /etc/ai-team-os/ai-team-os.env \
  --profile cache -f deploy/docker/docker-compose.yml up -d redis
```

内置服务不向宿主机发布端口，但仍需强密码、卷备份和恢复演练。不得在正式 RDS 已启用时误启用内置 PostgreSQL。

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
