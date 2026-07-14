# AI Team OS 生产域名与 HTTPS 上线手册

本文用于把 AI Team OS 独立域名安全地绑定到阿里云 ECS Nginx。它不包含真实域名、EIP、证书或私钥，也不代表 DNS/HTTPS 已经生效。

> 当前状态：`PENDING REAL-DOMAIN VERIFICATION`。完成本文的配置模板不等于证书签发、ICP备案、DNS 生效或公网验收通过。

## 1. 前置条件

- 正式域名及其所有权已确认；若 ECS 位于中国大陆，备案和实际监管要求已由责任人确认完成。
- ECS 具有固定 EIP，安全组只开放受控 SSH、80 和 443。
- `team-os` 容器已在 `127.0.0.1:3022` 通过状态与 readiness 检查。
- `deploy/nginx/ai-team-os.conf` 来自已审核的 root-owned 部署控制提交。
- 证书私钥只保存在 ECS 受控目录或证书服务，不进入 Git、镜像、聊天、工单正文或截图。
- Team OS 独立域名与知识服务 `APP_URL` 使用不同 origin。

## 2. DNS 规划

建议使用独立子域，例如 `team-os.company.example`：

| 记录 | 主机记录 | 值 | 说明 |
| --- | --- | --- | --- |
| A | Team OS 子域 | ECS EIP | 未配置 IPv6 时只创建 A |
| AAAA | Team OS 子域 | ECS IPv6 | 只有 IPv6 安全组、Nginx 和回源全部验证后创建 |
| CAA | 根域/子域 | 批准的 CA | 可选，但应与实际证书签发机构一致 |

首次切换前降低 TTL；稳定后再按运维策略恢复。不要用 wildcard DNS 把未知子域全部指向生产 ECS。变更前后记录：

```bash
export TEAM_OS_DOMAIN='team-os.your-company.example'
dig +short A "$TEAM_OS_DOMAIN"
dig +short AAAA "$TEAM_OS_DOMAIN"
dig +short CAA "$TEAM_OS_DOMAIN"
```

DNS 未切换时可用 `curl --resolve` 验证候选 ECS，避免把未通过健康检查的服务直接暴露给用户。

## 3. 证书申请

可使用阿里云 SSL 证书服务或受控 ACME 客户端。生产要求：

- SAN 包含完整 Team OS 域名，证书链完整，私钥算法和长度符合组织安全基线。
- 证书和私钥来源可审计，明确续期负责人、到期告警和紧急轮换流程。
- 推荐 DNS-01 完成首次签发，或在受控窗口使用 standalone HTTP-01，避免 Nginx 在证书不存在时无法加载 443 配置。
- 使用 HTTP-01 时，仅允许 `/.well-known/acme-challenge/`；不得临时开放应用内部 health、管理或知识服务路由。

Nginx 模板默认读取：

```text
/etc/ai-team-os/tls/fullchain.pem
/etc/ai-team-os/tls/privkey.pem
```

安装证书示例：

```bash
sudo install -d -o root -g root -m 0750 /etc/ai-team-os/tls
sudo install -o root -g root -m 0644 FULLCHAIN_SOURCE \
  /etc/ai-team-os/tls/fullchain.pem
sudo install -o root -g root -m 0600 PRIVATE_KEY_SOURCE \
  /etc/ai-team-os/tls/privkey.pem
```

`FULLCHAIN_SOURCE` 和 `PRIVATE_KEY_SOURCE` 必须替换为证书服务生成的受控文件路径，不能直接复制上述占位命令。续期后必须执行 `nginx -t`，成功后才 reload；失败时保留当前有效证书。

## 4. 安装 Nginx 配置

先在 root-only 暂存目录渲染，不直接覆盖生效配置。替换模板中的全部 `team-os.example.com` 后，用独立最小主配置验证候选文件：

```bash
sudo install -d -o root -g root -m 0750 /etc/ai-team-os/nginx-candidate
sudo install -o root -g root -m 0640 \
  /opt/ai-team-os-control/deploy/nginx/ai-team-os.conf \
  /etc/ai-team-os/nginx-candidate/ai-team-os.conf
sudoedit /etc/ai-team-os/nginx-candidate/ai-team-os.conf
if sudo grep -Fq 'team-os.example.com' /etc/ai-team-os/nginx-candidate/ai-team-os.conf; then
  echo '仍有域名占位符，停止安装' >&2
  exit 1
fi

sudo tee /etc/ai-team-os/nginx-candidate/nginx.conf >/dev/null <<'NGINX'
pid /run/nginx-ai-team-os-candidate.pid;
events {}
http {
  include /etc/nginx/mime.types;
  include /etc/ai-team-os/nginx-candidate/ai-team-os.conf;
}
NGINX
sudo chown root:root /etc/ai-team-os/nginx-candidate/nginx.conf
sudo chmod 0640 /etc/ai-team-os/nginx-candidate/nginx.conf
sudo nginx -t -c /etc/ai-team-os/nginx-candidate/nginx.conf
```

候选验证通过后，用独占变更锁执行备份和原子安装，并在 reload 前验证完整生产配置。完整验证或 reload 任一步失败时，错误陷阱会恢复旧文件、重新验证并 reload 旧配置：

```bash
sudo flock -n /run/lock/ai-team-os-nginx.lock bash -s <<'ROOT'
set -Eeuo pipefail
TARGET=/etc/nginx/conf.d/ai-team-os.conf
CANDIDATE=/etc/ai-team-os/nginx-candidate/ai-team-os.conf
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/etc/ai-team-os/nginx-candidate/ai-team-os.conf.before-${STAMP}"
HAD_OLD=false
ROLLBACK_NEEDED=false

rollback_config() {
  local original_status=${1:-1}
  set +e
  if [[ "$ROLLBACK_NEEDED" == true ]]; then
    if [[ "$HAD_OLD" == true ]]; then
      install -o root -g root -m 0644 "$BACKUP" "$TARGET"
    else
      rm -f -- "$TARGET"
    fi
    nginx -t && systemctl reload nginx
  fi
  exit "$original_status"
}
trap 'rollback_config $?' ERR
trap 'rollback_config 130' INT
trap 'rollback_config 143' TERM

if [[ -f "$TARGET" && ! -L "$TARGET" ]]; then
  install -o root -g root -m 0600 "$TARGET" "$BACKUP"
  HAD_OLD=true
elif [[ -e "$TARGET" || -L "$TARGET" ]]; then
  echo '现有 Nginx 目标不是普通文件，拒绝替换' >&2
  exit 1
fi

install -o root -g root -m 0644 "$CANDIDATE" \
  /etc/nginx/conf.d/.ai-team-os.conf.new
ROLLBACK_NEEDED=true
mv -Tf /etc/nginx/conf.d/.ai-team-os.conf.new "$TARGET"
nginx -t
systemctl reload nginx
ROLLBACK_NEEDED=false
trap - ERR INT TERM
ROOT
```

上线前复核以下约束没有被放宽：

- 默认 HTTP/HTTPS 虚拟主机拒绝未知 Host；HTTP 跳转使用固定正式域名，不使用不可信 `$host`。
- upstream 仍是 `127.0.0.1:3022`，不能改成公网地址。
- 公开 allowlist 仅包含 Team OS、必要登录/API、Next 静态资源和版本清单。
- AI 知识库、投喂端、超级管理员、Chat、RAG 和内部 knowledge adapter 路由保持 `404`。
- `/updates/ai-team-os/version.json` 为 `no-store`；带内容哈希的 `/_next/static` 可长期缓存；业务 API 不缓存。
- access log 不记录 query string、Cookie、Authorization、Referer 或请求 body。
- `X-Forwarded-For` 从可信 `$remote_addr` 重建，不能盲目信任客户端注入值。
- HSTS 的 `includeSubDomains` 只有在所有相关子域都支持 HTTPS 后才保留；不满足时必须经过安全评审调整。

## 5. 安全组和防火墙验证

从 ECS 本机确认应用只监听回环地址：

```bash
sudo ss -lntp | grep ':3022'
curl --fail --silent --show-error \
  http://127.0.0.1:3022/api/team-os/status
```

从外部受控测试机确认：

- 80 可访问但业务请求跳转 HTTPS；ACME challenge 按计划工作。
- 443 可访问且 Host/SNI 正确。
- 3022、5432、6379 无法从公网连接。
- 未知 Host 不返回 Team OS 内容。

不要把“连接超时”作为唯一安全证据；同时保存安全组、防火墙和监听地址证据。

## 6. DNS 切换前验证

```bash
export TEAM_OS_DOMAIN='team-os.your-company.example'
export ECS_PUBLIC_IP='REPLACE_WITH_ECS_PUBLIC_IP'

curl --resolve "${TEAM_OS_DOMAIN}:443:${ECS_PUBLIC_IP}" \
  --fail --silent --show-error \
  "https://${TEAM_OS_DOMAIN}/api/team-os/status"
curl --resolve "${TEAM_OS_DOMAIN}:443:${ECS_PUBLIC_IP}" \
  --head --fail --silent --show-error \
  "https://${TEAM_OS_DOMAIN}/team-os"
openssl s_client \
  -connect "${ECS_PUBLIC_IP}:443" \
  -servername "$TEAM_OS_DOMAIN" \
  -verify_return_error </dev/null
```

只有状态端点返回预期模块、版本、生产环境和精确 `releaseSha`，且证书链校验成功，才允许进入 DNS 变更窗口。

## 7. DNS 生效后验收

```bash
curl -I "http://${TEAM_OS_DOMAIN}/team-os"
curl -I "https://${TEAM_OS_DOMAIN}/team-os"
curl --fail --silent --show-error \
  "https://${TEAM_OS_DOMAIN}/api/team-os/status"
curl -I "https://${TEAM_OS_DOMAIN}/updates/ai-team-os/version.json"
```

验收项：

1. HTTP 跳转到固定正式 HTTPS 域名，没有开放重定向。
2. TLS 仅接受组织批准的协议/密码套件，SAN、链、SNI 和有效期正确。
3. `Secure`、`HttpOnly`、合理 `SameSite` 的 Session Cookie 在真实登录流程中可见；退出和停用后会话失效。
4. API、安全 header、限流、上传大小和超时在真实响应中符合模板。
5. 版本清单 `no-store`；静态资源缓存正确；业务 API 未被 CDN/WAF 错误缓存。
6. 未授权路由返回 `404`；登录流程无重定向循环。
7. Nginx/应用日志无 query、Cookie、Token、Key、邀请代码或客户内容。
8. 证书到期、Nginx 5xx、容器异常和域名解析异常告警已实际触发测试。

## 8. APP 同源配置

Android、Windows、iOS、macOS 最终都应使用同一正式 HTTPS origin，但不在本阶段直接修改移动端源码。受控发布构建使用既有：

```text
--dart-define=TEAM_OS_BASE_URL=https://正式-Team-OS-域名
```

正式包还必须完成平台 identifier、签名/公证、安装/升级、Cookie/退出、弱网和版本清单校验。域名可访问不代表 APP 可发布。

## 9. 证据与回退

| 项目 | 状态 | 证据位置 | 操作人/复核人 | 时间 |
| --- | --- | --- | --- | --- |
| DNS A/AAAA/CAA | PENDING |  |  |  |
| 证书链/SAN/有效期 | PENDING |  |  |  |
| Nginx config test | PENDING |  |  |  |
| 3022/RDS/Redis 公网阻断 | PENDING |  |  |  |
| HTTPS 页面/API | PENDING |  |  |  |
| Cookie/Session/CSRF | PENDING |  |  |  |
| 告警与续期演练 | PENDING |  |  |  |

DNS 或 HTTPS 验证失败时，把 DNS 恢复到变更前记录；不要删除当前有效证书，不要用 `ssl_verify` 关闭、HTTP 明文或开放 3022 作为临时绕过方案。
