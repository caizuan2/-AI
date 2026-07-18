# AI Team OS 阿里云 ECS 人工执行指南

> 状态：`PREPARATION ONLY / NOT EXECUTED`
>
> 本文只提供上线前的人工操作顺序和占位命令，不代表服务器已经连接、软件已经安装、数据库已经迁移或流量已经切换。所有 SSH、系统安装、数据库、Nginx、DNS 和生产发布操作都必须在获批维护窗口由授权人员逐步执行并由第二人复核。

详细设计与安全边界以以下现有文档为准，本文不复制它们的实现细节：

- [阿里云部署 Runbook](./ALIYUN_DEPLOYMENT.md)
- [生产数据库手册](./PRODUCTION_DATABASE.md)
- [生产域名与 HTTPS 手册](./DOMAIN_SSL_PRODUCTION.md)
- [部署目录说明](../../deploy/README.md)

## 0. 执行前 Go/No-Go

开始 SSH 前，变更单必须记录并获批：

1. ECS 实例、地域、私网地址、安全组和操作人员。
2. 审核过的控制面 tag、完整 commit SHA 和发布源码完整 SHA。
3. RDS 实例、TLS、pgvector、账号分权、手工快照和恢复演练证据。
4. 当前线上基线、应用回滚 release 和数据库事故恢复责任人。
5. 正式域名、证书、DNS 回退值和 Nginx 回退配置。
6. Pilot Company 与 Control Company 的隔离测试账号和复核人员。

任何真实 IP、SSH 私钥、数据库连接串、Cookie、Token 或 AI Provider Key 都不得写入本文、Git、工单评论或命令历史。

## 第一步：人工 SSH 登录

以下只是占位示例，不得由脚本、Codex 或 CI 自动执行：

```text
ssh root@服务器IP
```

正式操作优先使用受控运维账号、堡垒机或审批过的密钥，再对必要命令使用 `sudo`。如果组织确实批准 root 登录，也必须限制安全组来源并保存审计记录。

登录后先确认目标实例身份，发现主机名、实例 ID、私网地址或变更单不一致时立即退出，不继续安装或部署。

## 第二步：检查并准备 Docker 环境

控制面代码尚未安装时，先用系统原生命令做只读检查，不安装软件：

```bash
lsb_release -ds
uname -m
nproc
free -h
df -h /
git --version
node --version
docker version
docker compose version
psql --version
sudo ss -lntp
```

检查范围包括 Ubuntu 版本、CPU、内存、磁盘、Docker Engine、Docker Compose、Git、Node 和端口监听。数据库连通性和完整 PASS/FAIL 报告要等控制面安装后在第六步通过仓库脚本完成。只有基础检查满足批准的版本和容量要求后才可继续。

如果 Docker、Compose 或 PostgreSQL client 缺失：

1. 停止本次部署。
2. 在独立维护窗口按审核过的 [Docker 官方 Ubuntu 安装流程](https://docs.docker.com/engine/install/ubuntu/) 和系统包变更流程人工安装；`psql` 只用于脱敏的认证连接检查。
3. `server-init.sh` 已使用持久 state/nonce/hash 校验识别并安全恢复由自身创建的 stale guard；但该恢复路径尚需在独立演练机完成异常中断和服务状态复核，因此当前稳定 ECS 仍只允许默认只读审计，禁止直接运行 `--install`。
4. 安装后重新执行上述原生命令；控制面安装后再执行第六步的两个只读脚本并保存输出。

“启动 Docker”在本阶段只表示 Docker daemon 已运行，不表示提前启动 Team OS 应用容器。

## 第三步：创建受控部署目录

首次部署由授权人员创建固定目录并检查每一级路径不是符号链接：

```bash
sudo install -d -o root -g root -m 0750 /opt/ai-team-os
sudo install -d -o root -g root -m 0750 /var/lib/ai-team-os
sudo install -d -o root -g root -m 0700 /var/backups/ai-team-os
sudo install -d -o root -g root -m 0750 /var/www/ai-team-os/updates
sudo install -d -o root -g root -m 0750 /etc/ai-team-os
```

部署控制面必须为 `root:root` 且不可被组或其他用户写入。不得把普通用户可写 checkout 直接作为 root 部署控制面。

## 第四步：拉取并固定审核版本

首次安装控制面时只接受审核过的规范 tag 和完整 SHA。命令中的全部占位值必须先由第二人核对：

```bash
export REPOSITORY_URL='REPLACE_WITH_REPOSITORY_URL'
export CONTROL_TAG='refs/tags/REPLACE_WITH_REVIEWED_CONTROL_TAG'
export CONTROL_SHA='REPLACE_WITH_FULL_CONTROL_COMMIT_SHA'
export CONTROL_CANDIDATE="${HOME}/ai-team-os-control.candidate"

test ! -e "$CONTROL_CANDIDATE"
[[ "$CONTROL_TAG" =~ ^refs/tags/[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]
[[ "$CONTROL_SHA" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]]
git clone --filter=blob:none --no-checkout \
  "$REPOSITORY_URL" "$CONTROL_CANDIDATE"
git -C "$CONTROL_CANDIDATE" fetch --force --no-tags origin \
  "${CONTROL_TAG}:${CONTROL_TAG}"
test "$(git -C "$CONTROL_CANDIDATE" rev-parse "${CONTROL_TAG}^{commit}")" = "$CONTROL_SHA"
git -C "$CONTROL_CANDIDATE" checkout --detach "$CONTROL_SHA"
test "$(git -C "$CONTROL_CANDIDATE" rev-parse HEAD)" = "$CONTROL_SHA"
sudo test ! -e /opt/ai-team-os-control
sudo mv -- "$CONTROL_CANDIDATE" /opt/ai-team-os-control
sudo chown -R root:root /opt/ai-team-os-control
sudo chmod -R go-w /opt/ai-team-os-control
```

只有校验全部通过后，才可按变更单把 candidate 安装为 root-owned 控制面。`test ! -e` 失败时必须停止并走升级评审，禁止用 `rm -rf` 或 `git pull` 覆盖现有控制面。应用发布源码由 `deploy.sh` 使用另一组审核过的 release tag 和完整 SHA 获取，不能部署浮动 branch HEAD。

## 第五步：配置生产环境变量

从仓库模板创建主机私密环境文件：

```bash
sudo install -o root -g root -m 0600 \
  /opt/ai-team-os-control/.env.production.template \
  /etc/ai-team-os/ai-team-os.env
sudoedit /etc/ai-team-os/ai-team-os.env
sudo stat -c '%U:%G %a %n' /etc/ai-team-os/ai-team-os.env
```

从阿里云官方/安全团队批准的来源取得 RDS CA 公钥证书并安装到固定容器可见路径；不得把数据库客户端私钥放在这里：

```bash
sudo install -o root -g root -m 0644 RDS_CA_CERT_SOURCE \
  /etc/ai-team-os/rds-ca.pem
sudo openssl x509 -in /etc/ai-team-os/rds-ca.pem -noout
```

环境文件期望权限为 `root:root 600`。禁止用 `echo`、`cat`、`set -x` 或进程参数输出真实值。至少人工核对：

- `DATABASE_CA_CERT=/etc/ai-team-os/rds-ca.pem`；三条数据库 URL 使用不同职责账号并固定该 CA，Prisma 身份开启 `sslaccept=strict`，备份身份使用 `sslmode=verify-full`。
- `NEXT_PUBLIC_APP_URL` 是 Team OS 正式 HTTPS origin。
- `APP_URL` 是独立受信知识服务 origin，不能与 `NEXT_PUBLIC_APP_URL` 相同。
- `SESSION_SECRET`、`ENCRYPTION_KEY` 独立且为高熵值。
- `AI_PROVIDER` 与审批过的 Provider Key 一致；不得把任何 Key 暴露给客户端。
- `BACKUP_ENCRYPTION_CERT` 指向 ECS 上只含公钥的 X.509 证书；恢复私钥不得进入 ECS。
- `TEAM_OS_BIND_ADDRESS=127.0.0.1`、`TEAM_OS_PORT=3022`。
- 正式 RDS 场景保持 `ENABLE_BUNDLED_POSTGRES=false`、`ENABLE_BUNDLED_REDIS=false`。

## 第六步：验证 Docker 与部署配置

本步骤只验证 daemon、配置和镜像构建条件，不手工启动生产应用：

```bash
sudo systemctl is-active docker
sudo docker version
sudo docker compose version
cd /opt/ai-team-os-control
sudo bash deploy/scripts/server-init.sh
sudo bash deploy/scripts/cloud-preflight-check.sh
sudo bash -n deploy/scripts/deploy.sh
sudo bash -n deploy/scripts/backup.sh
sudo bash -n deploy/scripts/rollback.sh
sudo bash -n deploy/scripts/production-health-check.sh
sudo docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  config --quiet
sudo nginx -t
```

生产禁止先裸执行 `docker compose up -d`。`deploy.sh` 会从精确发布版本构建 versioned runtime/migration 镜像，并在备份、迁移和 schema 检查通过后才切换 `team-os` 容器。

## 第七步：备份、数据库迁移与应用切换

执行前必须已经取得 RDS 手工快照，并确认逻辑备份所需的公钥证书、容量和异地恢复流程。生产标准入口只有 `deploy.sh`：

```bash
export RELEASE_REF='refs/tags/REPLACE_WITH_APPROVED_RELEASE_TAG'
export RELEASE_SHA='REPLACE_WITH_FULL_APPROVED_COMMIT_SHA'

cd /opt/ai-team-os-control
sudo env CONFIRM_MIGRATIONS=true \
  bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --source-mode git \
  --release-ref "$RELEASE_REF" \
  --release-sha "$RELEASE_SHA"
```

该入口的固定顺序是：校验环境和源码身份 → 构建镜像 → 记录旧基线 → 创建并验证迁移前加密备份 → `prisma migrate deploy`/status → Team OS schema 检查 → 切换应用容器 → readiness → 原子更新发布状态。

禁止在宿主机直接运行 `npx prisma migrate deploy`，禁止在迁移前启动候选应用，禁止生产执行 `migrate dev`、`db push` 或 `migrate reset`。部署失败时脚本不会自动回滚数据库。

## 第八步：健康检查与证据归档

发布脚本成功后，以 root 运行只读、脱敏健康检查：

```bash
cd /opt/ai-team-os-control
sudo bash deploy/scripts/production-health-check.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --format text

curl --disable --noproxy '*' --fail --silent --show-error \
  http://127.0.0.1:3022/api/team-os/status
curl --disable --noproxy '*' --fail --silent --show-error \
  'http://127.0.0.1:3022/api/health?database=true&schema=true&ai=true'
```

健康脚本只有退出码 `0` 才能进入 Nginx/HTTPS 预验证；退出码 `1` 为失败，`2` 为 degraded/unverified，二者都是 `NO-GO`。随后按 [生产域名与 HTTPS 手册](./DOMAIN_SSL_PRODUCTION.md) 完成 `nginx -t`、`curl --resolve`、证书链验证和 DNS 切换。

最终证据至少保存：UTC 时间、操作者/复核人、release SHA、镜像 ID、备份目录及校验和、migration status、健康报告、Nginx 配置测试、TLS 验证、Pilot/Control Company 隔离结果。证据不得包含响应正文中的客户数据或任何凭据。

## 停止与回退

以下任一项出现时立即停止后续步骤：

- 服务器身份、tag、完整 SHA、控制面 hash 或镜像 ID 不一致。
- RDS 快照、加密逻辑备份或隔离恢复演练缺失。
- migration、schema、数据库、AI 或消息检查失败/未验证。
- 443 证书链、Cookie/Session、日志脱敏或企业隔离未通过。
- 无已记录应用回滚 release，或旧应用与迁移后 schema 不兼容。

应用回滚必须使用 `rollback.sh` 和已记录 release；它不会逆向 migration 或恢复数据库。数据库恢复是独立事故流程，不能作为普通应用回滚的一部分。
