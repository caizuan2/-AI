# AI Team OS 阿里云 ECS 生产部署 Runbook

本文定义 AI Team OS 在阿里云 ECS 上使用 Docker + Nginx 的部署、停止、恢复和验收流程。它是操作手册，不是“已经上线”的证明。任何步骤只有在变更单中附上命令输出、时间、操作者、发布 SHA 和复核人后，才能标记为通过。

> 当前状态：`NOT DEPLOYED / NOT VERIFIED`。不得仅凭本文、Phase 14 tag 或本地 Docker 构建宣称阿里云部署、首企验收或商业上线完成。

### 2026-07-13 只读 ECS 审计快照

本次仅通过受控 SSH 和外部 HTTP 做只读检查，没有安装软件、写入生产目录、迁移数据库、reload Nginx 或切换流量：

- 主机为 Ubuntu 24.04.4 LTS，约 7.1 GiB 内存、79 GiB 根盘（约 43 GiB 可用），Node.js 22.22.3、Git 2.43.0、Nginx 1.24.0；`/run` 是 tmpfs，未启用 swap。
- Docker Engine 与 Docker Compose 均未安装；只监听 80，443 与回环 3022 未监听。
- `/opt/ai-team-os`、`/var/lib/ai-team-os`、`/etc/ai-team-os/ai-team-os.env` 均不存在。
- 既有知识库健康、数据库健康、投喂登录、公开专家市场与发布清单端点返回 200；未登录聊天按预期重定向。`/team-os`、`/api/team-os/status` 和 `/api/team-os/company` 返回 404。
- 因正式域名/证书、RDS、生产密钥、备份恢复演练和 Pilot/Control Company 账号证据均未提供，结论为 `NO-GO`。
- 当前 `server-init.sh --install` 使用临时的全局 Debian/systemd 启动抑制文件，并已通过持久 state/nonce/hash 校验支持识别和安全恢复由自身创建的 stale guard；但该恢复路径尚未在独立演练机完成 SIGKILL/OOM/断电演练。因此在该稳定共享 ECS 上仍只允许默认只读审计，禁止执行安装模式，直至独立演练通过。

## 1. 范围与保护边界

- 独立公开域名只暴露 `/team-os`、`/api/team-os/*`、必要登录路由、静态资源和独立版本清单。
- `team-os` 容器仅绑定 ECS 回环地址 `127.0.0.1:3022`，Nginx 是唯一公网入口。
- 正式数据库使用阿里云 RDS PostgreSQL；Compose 内置 PostgreSQL/Redis profile 不用于正式生产。
- Redis 当前只是预留，应用尚未消费 `REDIS_URL`，不要为“组件完整”而在生产启用。
- `APP_URL` 指向独立、受信任的现有知识服务 HTTPS origin；它不得等于 Team OS 的 `NEXT_PUBLIC_APP_URL`。
- 本阶段不修改 AI 知识库用户端、管理员投喂端、超级管理员、Chat、RAG、登录、卡密或移动端源码。
- Docker 镜像构建仓库根 Next.js 工程；逻辑隔离不等于物理拆分，必须依赖独立 ECS/端口、Nginx allowlist、服务端鉴权和企业数据隔离共同保护。

## 2. 目标拓扑

```text
Web / Android / iOS / Windows / macOS
                 |
                 | HTTPS 443
                 v
        Alibaba Cloud DNS / WAF（可选）
                 |
                 v
     ECS Security Group -> Nginx
                              |
                              | HTTP 127.0.0.1:3022
                              v
                       AI Team OS container
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
      RDS PostgreSQL      AI Provider     Knowledge service
       private/TLS          HTTPS           HTTPS/internal

Redis：当前关闭；只有业务真实接入共享缓存/队列后另行评审启用。
```

## 3. 服务器与云资源要求

Pilot 起点不是容量承诺。正式规格必须以压测结果和业务并发为准。

| 项目 | Pilot 建议起点 | 正式要求 |
| --- | --- | --- |
| ECS | Ubuntu 22.04/24.04 LTS、4 vCPU、8 GiB RAM | x86_64、时钟同步、受支持安全更新、CPU/内存有告警 |
| 磁盘 | 80 GiB 系统盘 + 独立数据/备份盘 | 加密、inode/空间告警；release、Docker、日志、备份容量单独评估 |
| 内存临时区 | `/run` 为 tmpfs，生产变更窗口禁用 swap | 环境快照与数据库明文 dump 只短暂存在于 tmpfs；容量不足改用独立加密备份 worker |
| Docker | Engine + Compose v2 | Compose `2.33.1+`；版本和 daemon 配置进入证据 |
| Node/Git | Node.js 22、Git、curl、flock、sha256sum | 只用于运维检查；应用依赖在固定 Docker 镜像内安装 |
| Nginx | 当前发行版安全维护版本 | 配置测试、日志轮转、证书续期告警 |
| RDS | PostgreSQL，所选地域/版本支持 pgvector | 私网、TLS、自动备份、手工快照、恢复演练、账号分权 |
| 网络 | ECS、RDS 同 VPC 或受控私网互通 | 最小出站；RDS、3022、Redis 不向公网开放 |
| 日志 | Docker/Nginx 本地轮转 | 接入阿里云 SLS 或等效集中式、受控保留和告警 |

安全组建议：

- 入站 `22/tcp`：只允许堡垒机、VPN 或固定运维出口；禁止全网开放。
- 入站 `80/tcp`：只用于 ACME challenge 和 HTTPS 跳转。
- 入站 `443/tcp`：业务入口；需要时在前面加 WAF/CDN。
- 不创建 `3022`、`5432`、`6379` 公网入站规则。
- RDS 白名单只允许 ECS 私网来源或受控安全组，不允许 `0.0.0.0/0`。

## 4. 上线前必须准备的证据

在变更单记录，不能放入 Git：

1. ECS 实例 ID、地域/可用区、私网 IP、安全组规则截图。
2. RDS 实例 ID、引擎版本、pgvector 支持、TLS 和备份策略。
3. 正式域名、备案/合规状态、证书主体、有效期和续期负责人。
4. 精确发布 commit SHA、审核过的 tag、镜像 ID、orchestrator SHA-256。
5. 切换前当前容器、当前 release、数据库 migration 状态和可用回滚 release。
6. RDS 手工快照 ID、逻辑备份文件、SHA-256、隔离恢复演练记录。
7. 商业 Go-Live 阻断项的责任人和关闭证据。

## 5. 首次主机初始化

以普通运维账号登录，只有明确的系统操作使用 `sudo`。初始化脚本默认只读审计，不会启动、停止或重启服务：

```bash
cd /opt/ai-team-os-control
sudo bash deploy/scripts/server-init.sh
```

只有只读报告明确列出缺失包、维护窗口已批准、apt 仓库快照已评审且候选版本满足 Node `22.13+`、Compose `2.33.1+` 时，才执行显式双重确认的安装。脚本会在实际安装前检查候选版本，不满足就停止；Debian maintainer script 仍属于变更风险，因此现有稳定 ECS 上必须先做快照并安排人工监护。安装后再次运行只读审计：

```bash
sudo bash deploy/scripts/server-init.sh --install --confirm-install
sudo bash deploy/scripts/server-init.sh
```

初始化后人工复核：

```bash
lsb_release -a
docker version
docker compose version
git --version
node --version
nginx -v
timedatectl status
```

如果初始化脚本失败，停止部署并修复主机环境；不要绕过版本、权限或安全检查。主机上的部署控制目录必须来自已审核提交，且由 `root:root` 持有、组和其他用户不可写：

```bash
sudo chown -R root:root /opt/ai-team-os-control
sudo chmod -R go-w /opt/ai-team-os-control
```

部署脚本会把 Compose、Dockerfile、Nginx 模板、环境解析器和运维脚本视为主机信任控制面。精确发布源码可以更新应用和已审批 migration，但不能在部署时替换这套 root-owned 控制面。

## 6. 生产环境文件

从模板创建主机环境文件，真实密钥只能写入主机受控文件或阿里云 KMS/Secrets Manager：

```bash
sudo install -d -o root -g root -m 0750 /etc/ai-team-os
sudo install -o root -g root -m 0600 \
  /opt/ai-team-os-control/.env.production.template \
  /etc/ai-team-os/ai-team-os.env
sudoedit /etc/ai-team-os/ai-team-os.env
```

分别从阿里云官方/安全团队批准的来源取得 RDS CA 公钥证书，以及从离线恢复系统/KMS 取得只含公钥的备份接收者证书；任何私钥不得进入 ECS：

```bash
sudo install -o root -g root -m 0644 RDS_CA_CERT_SOURCE \
  /etc/ai-team-os/rds-ca.pem
sudo openssl x509 -in /etc/ai-team-os/rds-ca.pem -noout
sudo install -o root -g root -m 0644 BACKUP_PUBLIC_CERT_SOURCE \
  /etc/ai-team-os/backup-encryption-cert.pem
sudo openssl x509 -in /etc/ai-team-os/backup-encryption-cert.pem -noout
```

至少完成以下配置，且不得在终端输出它们的值：

- `DATABASE_CA_CERT=/etc/ai-team-os/rds-ca.pem`：固定的 RDS CA 公钥证书路径；Compose/备份容器只读挂载同一路径。
- `DATABASE_URL`：应用最小权限账号，RDS 私网地址，使用固定 CA、`sslmode=require`、`sslaccept=strict`。
- `DIRECT_URL`：独立 migration 账号和 RDS 直连地址，使用相同固定 CA 与严格证书校验。
- `BACKUP_DATABASE_URL`：独立备份账号，libpq URL，使用固定 CA 与 `sslmode=verify-full`，不带 Prisma `schema` 参数。
- `BACKUP_ENCRYPTION_CERT=/etc/ai-team-os/backup-encryption-cert.pem`：只含公钥的备份接收者证书。
- `NEXT_PUBLIC_APP_URL`：Team OS 正式 HTTPS origin。
- `APP_URL`：独立受信知识服务 origin，不能与上一项相同。
- `SESSION_SECRET`、`ENCRYPTION_KEY`、`LICENSE_SECRET`：独立高熵值，不复用。
- `AI_PROVIDER` 以及选定 Provider Key；当前构建校验还要求有效的 `OPENAI_API_KEY`。
- `TEAM_OS_BIND_ADDRESS=127.0.0.1`、`TEAM_OS_PORT=3022`。
- `ENABLE_BUNDLED_POSTGRES=false`、`ENABLE_BUNDLED_REDIS=false`。
- `DEPLOY_REPOSITORY_URL`：不含账号密码；使用受控 SSH deploy key/agent 或主机 credential helper。

严格 dotenv 解析器拒绝未知键、重复键和占位值，也不会执行 `$()`、反引号或变量展开。环境文件权限必须保持：

```bash
sudo stat -c '%U:%G %a %n' /etc/ai-team-os/ai-team-os.env
# 期望：root:root 600 /etc/ai-team-os/ai-team-os.env
```

## 7. 发布前检查

在 CI 对同一精确 SHA 完成 lint、typecheck、build、Prisma validate、Team OS 契约、Compose、Dockerfile、Nginx 和 shell 检查。ECS 上再检查：

```bash
cd /opt/ai-team-os-control
sudo bash -n deploy/scripts/deploy.sh
sudo bash -n deploy/scripts/backup.sh
sudo bash -n deploy/scripts/rollback.sh
sudo docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  config --quiet
sudo nginx -t
```

发布前记录当前基线：

```bash
sudo cat /var/lib/ai-team-os/current-release 2>/dev/null || true
sudo cat /var/lib/ai-team-os/previous-release 2>/dev/null || true
sudo docker ps --filter label=com.docker.compose.project=ai-team-os
sudo docker inspect \
  --format '{{.Config.Image}} {{.Image}} {{.State.Status}}' \
  "$(sudo docker ps -q --filter label=com.docker.compose.project=ai-team-os --filter label=com.docker.compose.service=team-os)" \
  2>/dev/null || true
```

首次部署没有旧 release 时也要明确记录“无应用回滚基线”；这不等于数据库不需要备份。

## 8. 执行精确版本部署

不要部署浮动 branch HEAD。变更单必须先写入完整 commit SHA，并验证 tag 指向该 SHA。以下变量仅作示例，操作员必须替换为已审批值：

```bash
export RELEASE_REF='refs/tags/ai-team-os-phase14-rc-REPLACE_WITH_CHANGE_ID'
export RELEASE_SHA='REPLACE_WITH_FULL_APPROVED_COMMIT_SHA'

cd /opt/ai-team-os-control
sudo env CONFIRM_MIGRATIONS=true \
  bash deploy/scripts/deploy.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --source-mode git \
  --release-ref "$RELEASE_REF" \
  --release-sha "$RELEASE_SHA"
```

RC tag 必须在 CI/变更审批完成后创建并固定到同一精确 SHA；`ai-team-os-phase14-production-live-ready` 只能在真实云部署、HTTPS、RDS、健康检查和 Pilot 验收全部通过后创建，不能预先作为首次部署输入。`REPLACE_WITH_FULL_APPROVED_COMMIT_SHA` 是故意不可用的占位值，必须替换为 40 或 64 位完整 SHA；脚本会拒绝不匹配的 release、生产占位密钥、不安全端口和错误数据库 TLS 配置。

脚本顺序为：把生产环境冻结为无 swap 的 root-only tmpfs 快照并完成校验 → 拉取并核对精确 SHA → 构建 versioned runtime/migration 镜像 → 捕获旧基线 → 从同一环境快照生成并验证数据库 dump、将数据库和配置加密成 CMS 恢复集 → `prisma migrate deploy`/status → Team OS schema 验证 → 只替换 `team-os` 容器 → 状态身份和 database/schema/AI readiness → 原子更新 current/previous 状态。release metadata 记录 orchestrator hash schema；Phase 14 schema 2 会把 `server-init.sh`、`cloud-preflight-check.sh` 与 `production-health-check.sh` 三项主机控制纳入控制面哈希，旧 Phase 13 metadata 缺少该字段时按 schema 1 验证。

部署失败时脚本会尽力恢复切换前应用，但永远不会自动回滚数据库。只要出现备份、migration、schema 或 readiness 失败，就停止后续 DNS/企业验收。

## 9. 启动、停止和运行状态

正常部署和升级只使用 `deploy.sh`，不要手工 `docker compose up` 覆盖版本化镜像。临时停止/启动现有容器时先按 Compose label 精确选择：

```bash
CONTAINER_ID=$(sudo docker ps -aq \
  --filter label=com.docker.compose.project=ai-team-os \
  --filter label=com.docker.compose.service=team-os)
test -n "$CONTAINER_ID"
sudo docker stop "$CONTAINER_ID"
sudo docker start "$CONTAINER_ID"
```

不要执行 `docker compose down --volumes`，也不要删除 `team_os_storage`、`team_os_uploads` 或数据库备份。检查状态：

```bash
sudo docker ps --filter label=com.docker.compose.project=ai-team-os
curl --fail --silent --show-error \
  http://127.0.0.1:3022/api/team-os/status
curl --fail --silent --show-error \
  'http://127.0.0.1:3022/api/health?database=true&schema=true&ai=true'
```

使用只读健康脚本生成脱敏报告：

```bash
cd /opt/ai-team-os-control
sudo bash deploy/scripts/production-health-check.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --format json > /tmp/ai-team-os-health.json
```

脚本检查容器、状态身份、数据库、AI 和消息路由。未提供受控认证 header 文件时，消息 API 返回 `401/403` 只证明路由和鉴权门禁可达，不证明真实通知已投递，此时报告为 `degraded/unverified` 并返回退出码 `2`；生产放行只接受退出码 `0`。探针必须以 root 运行，原始响应只会短暂保存在无 swap 的 `/run/ai-team-os` tmpfs 中，并由独占锁串行清理；报告不得包含数据库 URL、Cookie 或 AI Key。归档前复核 `/tmp/ai-team-os-health.json` 这一脱敏报告并移入受控证据库。

## 10. 回滚

应用回滚只能选择 `/opt/ai-team-os/releases/` 下具有 `.release.env` 的已记录 release：

```bash
export TARGET_RELEASE_ID='REPLACE_WITH_RECORDED_RELEASE_ID'
cd /opt/ai-team-os-control
sudo env CONFIRM_ROLLBACK=true \
  bash deploy/scripts/rollback.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --target "$TARGET_RELEASE_ID"
```

“回滚指定 tag”必须先把 tag 解析为完整 commit SHA，再从受控 release metadata 找到 `SOURCE_SHA` 完全相同的 release ID。不要把任意 Git tag、任意镜像 tag 或目录直接当作可信回滚目标；以当前脚本 `--help` 和 release metadata 为准。

回滚前必须确认旧应用与当前数据库 schema 兼容。`rollback.sh` 只切换应用镜像和版本清单，不执行 Prisma、不恢复 dump、不反向 migration。数据库恢复是独立事故流程，需要停写、审批、RDS 快照/逻辑备份选择和恢复后验证。

## 11. 域名切换与外部验收

先在本机或受控测试机通过 `--resolve` 验证 ECS，再变更 DNS：

```bash
export TEAM_OS_DOMAIN='team-os.your-company.example'
export ECS_PUBLIC_IP='REPLACE_WITH_ECS_PUBLIC_IP'
curl --resolve "${TEAM_OS_DOMAIN}:443:${ECS_PUBLIC_IP}" \
  --fail --silent --show-error \
  "https://${TEAM_OS_DOMAIN}/api/team-os/status"
```

DNS 生效后验证：

```bash
curl -I "http://${TEAM_OS_DOMAIN}/team-os"
curl -I "https://${TEAM_OS_DOMAIN}/team-os"
curl --fail --silent --show-error \
  "https://${TEAM_OS_DOMAIN}/api/team-os/status"
openssl s_client \
  -connect "${TEAM_OS_DOMAIN}:443" \
  -servername "$TEAM_OS_DOMAIN" </dev/null
```

还必须从外网确认 `3022` 不可达，并验证 Team OS 独立域名上的知识库用户端、投喂端、超级管理员、Chat、RAG 路由返回 `404`。这些检查只证明暴露面，不证明业务权限正确。

## 12. APP 连接准备

所有端使用同一个正式 Team OS HTTPS origin，但本阶段不修改移动端源码。正式构建时通过既有 build-time 配置注入：

```bash
flutter build apk --release \
  --dart-define=TEAM_OS_BASE_URL="https://${TEAM_OS_DOMAIN}"
flutter build windows --release \
  --dart-define=TEAM_OS_BASE_URL="https://${TEAM_OS_DOMAIN}"
```

iOS/macOS 必须在受控 macOS/Xcode 构建机完成。`TEAM_OS_BASE_URL` 只能包含正式 HTTPS origin，不能包含路径、凭据或任何服务端 API Key。四端仍须完成正式 identifier、签名/公证、安装/升级和版本清单校验；未完成时保持 unpublished，不能分发。

## 13. 停止上线条件

以下任一项成立即为 `NO-GO`：

- 精确 SHA、当前基线、回滚 release 或备份恢复证据缺失。
- RDS/pgvector/TLS、migration status、Team OS schema 或 AI readiness 失败。
- HTTPS、Session/Cookie、CSRF/API 权限、日志脱敏或 SLS 告警未实际验证。
- 企业 A 可通过 query/body/path ID 读取或修改企业 B 数据。
- `DISABLED`/`EXPIRED` 企业、停用成员或套餐禁用仍能调用受限 API。
- AI Brain 内部知识服务 origin 的认证和隔离未验证。
- APP 仍是占位 identifier、未签名包，或更新清单/包哈希未闭环。
- Pilot Company 十项业务闭环存在 P0/P1、真实消息被误报成功或使用真实客户隐私测试。

只有业务、安全、数据库、运维和 APP 发布责任人共同签字后，才可把“部署技术验证”提升为“商业上线批准”。
