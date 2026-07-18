# AI Team OS 生产部署人工命令清单

> 状态：`PREPARATION ONLY / NOT EXECUTED`
>
> 本文件是人工操作速查表，不是自动化脚本。所有命令只能由授权人员在审批窗口逐段核对、逐段执行，不得由 Codex、CI 或本地任务自动 SSH 或连接生产。命令中的 `REPLACE_*`、示例域名、用户名和路径都是不可用占位值；任何占位值未替换时必须停止。

完整说明见 [阿里云人工执行指南](./ALIYUN_EXECUTION_GUIDE.md)、[阿里云部署 Runbook](./ALIYUN_DEPLOYMENT.md)、[生产数据库手册](./PRODUCTION_DATABASE.md) 和 [生产 HTTPS 手册](./DOMAIN_SSL_PRODUCTION.md)。

## 1. 人工 SSH 示例

以下字符串只用于说明操作入口，不得由自动化执行：

```text
ssh root@服务器IP
```

正式环境优先通过受控运维账号、堡垒机或审批过的 SSH key 登录。不要把真实 IP、用户名、私钥路径或密码提交到 Git。

## 2. 固定控制面 tag 与完整 SHA

首次安装控制面可使用以下模式。先在变更单确认 repository、规范 tag 和完整 SHA：

```bash
export REPOSITORY_URL='REPLACE_WITH_REPOSITORY_URL'
export CONTROL_TAG='refs/tags/REPLACE_WITH_REVIEWED_CONTROL_TAG'
export CONTROL_SHA='REPLACE_WITH_FULL_CONTROL_COMMIT_SHA'
export CONTROL_CANDIDATE="${HOME}/ai-team-os-control.candidate"

test ! -e "$CONTROL_CANDIDATE"
[[ "$CONTROL_TAG" =~ ^refs/tags/[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]
[[ "$CONTROL_SHA" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]]
git clone --filter=blob:none --no-checkout "$REPOSITORY_URL" "$CONTROL_CANDIDATE"
git -C "$CONTROL_CANDIDATE" fetch --force --no-tags origin \
  "${CONTROL_TAG}:${CONTROL_TAG}"
test "$(git -C "$CONTROL_CANDIDATE" rev-parse "${CONTROL_TAG}^{commit}")" = "$CONTROL_SHA"
git -C "$CONTROL_CANDIDATE" checkout --detach "$CONTROL_SHA"
test "$(git -C "$CONTROL_CANDIDATE" rev-parse HEAD)" = "$CONTROL_SHA"
git -C "$CONTROL_CANDIDATE" status --short --branch
sudo test ! -e /opt/ai-team-os-control
sudo mv -- "$CONTROL_CANDIDATE" /opt/ai-team-os-control
sudo chown -R root:root /opt/ai-team-os-control
sudo chmod -R go-w /opt/ai-team-os-control
```

不要使用 `git checkout main`、`git pull` 或其他浮动 branch 作为生产发布身份。`test ! -e` 失败时不要覆盖目标，改走受审升级流程。

## 3. 只读服务器与部署文件检查

```bash
cd /opt/ai-team-os-control
sudo bash deploy/scripts/server-init.sh
sudo bash deploy/scripts/cloud-preflight-check.sh
sudo bash -n deploy/scripts/deploy.sh
sudo bash -n deploy/scripts/backup.sh
sudo bash -n deploy/scripts/rollback.sh
sudo bash -n deploy/scripts/production-health-check.sh
node deploy/scripts/verify-deployment.mjs
```

`server-init.sh` 默认是只读审计。现有稳定 ECS 上不得直接使用它的 `--install` 模式；依赖安装必须另开维护窗口。
`cloud-preflight-check.sh` 还要求 PostgreSQL client `psql`，用于在不把连接串放进参数或输出的前提下执行 TLS `SELECT 1`；缺失时结果必须保持 `FAIL`。

## 4. 创建 root-only 环境文件

```bash
sudo install -d -o root -g root -m 0750 /etc/ai-team-os
sudo install -o root -g root -m 0600 \
  /opt/ai-team-os-control/.env.production.template \
  /etc/ai-team-os/ai-team-os.env
sudoedit /etc/ai-team-os/ai-team-os.env
sudo stat -c '%U:%G %a %n' /etc/ai-team-os/ai-team-os.env
```

不得使用 `cat`、`echo`、`env`、`printenv` 或 `set -x` 显示生产值。真实环境文件和备份恢复私钥不得进入 Git。

## 5. Docker Compose 配置检查

```bash
cd /opt/ai-team-os-control
sudo docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  config --quiet
```

生产禁止直接执行以下裸命令：

```text
docker compose up -d
npx prisma migrate deploy
```

原因：裸 `up` 会绕过精确 SHA、迁移前备份、schema 验证、状态元数据和失败恢复；宿主机 Prisma 会绕过固定 migration 镜像和凭据边界。

## 6. 可选的预构建验证

只有审核人员需要提前验证镜像构建时才运行；它不会授权应用切换：

```bash
cd /opt/ai-team-os-control
sudo docker compose \
  --env-file /etc/ai-team-os/ai-team-os.env \
  -f deploy/docker/docker-compose.yml \
  --profile tools build --pull team-os migrate
```

正式发布仍必须重新进入 `deploy.sh`，由它记录精确镜像 ID 并执行完整发布合同。

## 7. 迁移前独立加密备份

标准 `deploy.sh` 会自动在 migration 前调用同一备份脚本。若变更单要求先单独生成一份证据备份，可执行：

```bash
export APPROVED_RELEASE='REPLACE_WITH_APPROVED_RELEASE_ID'
cd /opt/ai-team-os-control
sudo bash deploy/scripts/backup.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --release "$APPROVED_RELEASE" \
  --reason pre-migration
```

继续前必须确认 RDS 手工快照已完成，备份目录内只有 CMS 密文、checksum 和 metadata，并已完成隔离恢复演练。只看到备份文件不算备份可用。

## 8. 隔离环境 migration 演练

下列命令只用于与生产同版本的隔离演练；生产发布不得绕过 `deploy.sh` 单独执行：

```bash
export TEAM_OS_MIGRATION_IMAGE='ai-team-os-migration:REPLACE_WITH_APPROVED_RELEASE_ID'
export ISOLATED_ENV_FILE='/REPLACE_WITH_ROOT_ONLY_ISOLATED_ENV_FILE'
test "$ISOLATED_ENV_FILE" != /etc/ai-team-os/ai-team-os.env
sudo test -f "$ISOLATED_ENV_FILE"
cd /opt/ai-team-os-control
sudo env TEAM_OS_MIGRATION_IMAGE="$TEAM_OS_MIGRATION_IMAGE" docker compose \
  --env-file "$ISOLATED_ENV_FILE" \
  -f deploy/docker/docker-compose.yml \
  --profile tools run --rm --no-deps migrate migrate status
sudo env TEAM_OS_MIGRATION_IMAGE="$TEAM_OS_MIGRATION_IMAGE" docker compose \
  --env-file "$ISOLATED_ENV_FILE" \
  -f deploy/docker/docker-compose.yml \
  --profile tools run --rm --no-deps migrate migrate deploy
sudo env TEAM_OS_MIGRATION_IMAGE="$TEAM_OS_MIGRATION_IMAGE" docker compose \
  --env-file "$ISOLATED_ENV_FILE" \
  -f deploy/docker/docker-compose.yml \
  --profile tools run --rm --no-deps migrate migrate status
```

顺序固定为 `backup → status → deploy → status → schema/readiness`。生产禁止 `migrate dev`、`db push`、`migrate reset` 和手工修改 `_prisma_migrations`。

## 9. 标准生产发布命令

生产唯一入口是 `deploy.sh`。先由两人核对 tag 和完整 SHA：

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

脚本内部执行 `build → baseline → encrypted backup → prisma migrate deploy/status → schema verify → team-os cutover → health → state commit`。任一步失败都停止后续 Nginx、DNS 和 Pilot 操作；数据库 migration 永远不会自动反向回滚。

## 10. 内部健康检查

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

健康脚本退出码只有 `0` 可放行；`1` 或 `2` 都必须停止。不得把包含 Cookie、Token、客户数据或 AI 响应内容的原始响应保存到普通日志。

## 11. Nginx 与 HTTPS 预验证

Nginx 的候选配置、原子安装和失败恢复命令只维护在 [生产域名与 HTTPS 手册](./DOMAIN_SSL_PRODUCTION.md)。执行 DNS 前至少检查：

```bash
sudo nginx -t

export TEAM_OS_DOMAIN='team-os.example.invalid'
export ECS_PUBLIC_IP='REPLACE_WITH_ECS_PUBLIC_IP'
curl --disable --noproxy '*' --resolve "${TEAM_OS_DOMAIN}:443:${ECS_PUBLIC_IP}" \
  --fail --silent --show-error \
  "https://${TEAM_OS_DOMAIN}/api/team-os/status"
openssl s_client \
  -connect "${ECS_PUBLIC_IP}:443" \
  -servername "$TEAM_OS_DOMAIN" \
  -verify_return_error </dev/null
```

`.invalid` 是故意不可解析的示例后缀，操作员必须替换为已审批正式域名。证书或 Host/SNI 不匹配时禁止修改 DNS。

## 12. 应用回滚命令

只选择 `/opt/ai-team-os/releases/` 中带可信 release metadata 的已记录版本：

```bash
export TARGET_RELEASE_ID='REPLACE_WITH_RECORDED_RELEASE_ID'
cd /opt/ai-team-os-control
sudo env CONFIRM_ROLLBACK=true \
  bash deploy/scripts/rollback.sh \
  --env-file /etc/ai-team-os/ai-team-os.env \
  --target "$TARGET_RELEASE_ID"
```

`rollback.sh` 只切换应用镜像和版本清单，不执行 Prisma、不恢复备份、不逆向 migration。旧应用与当前 schema 不兼容时禁止应用回滚，改走独立数据库事故流程。

## 13. 人工证据清单

每段命令执行后记录：

- UTC 时间、操作者、复核人和变更单编号。
- 控制面 SHA、发布 SHA、runtime/migration 镜像 ID。
- 变更前 current/previous release。
- RDS 快照 ID、加密备份目录和 checksum；不记录连接串。
- migration status、schema 检查、健康检查退出码。
- Nginx config test、证书链、DNS 前后验证。
- Pilot/Control Company 企业隔离结果。

任何证据不完整、命令输出与预期不符或需要临时绕过安全检查时，结论必须保持 `NO-GO`。
