# AI Team OS Phase 14.5 域名与 HTTPS 检查表

> 状态：`PREPARATION ONLY / NOT EXECUTED`。本文没有修改 DNS、ECS 安全组、证书或 Nginx，也没有连接服务器。所有变更必须在批准的人工窗口执行。

完整的 Nginx 原子切换与回退流程以 [DOMAIN_SSL_PRODUCTION.md](./DOMAIN_SSL_PRODUCTION.md) 为准；本文件只列上线检查点。

## 1. DNS 与合规前置

- 确认正式域名所有权、阿里云备案/接入要求、解析负责人和回退负责人。
- 保存变更前的 A、AAAA、CAA、TTL 与权威 DNS 查询结果。
- A/AAAA 只指向批准的 ECS/CDN 入口；无 IPv6 服务能力时不得遗留不可达 AAAA。
- 先降低 TTL 并等待旧 TTL 周期结束，再安排切换；准备可恢复的旧记录。

## 2. ECS 安全组和主机端口

| 端口 | 公网规则 |
| --- | --- |
| `22/tcp` | 只允许受控运维源地址；优先使用密钥和最小权限账号 |
| `80/tcp` | 仅用于固定跳转 HTTPS 或证书验证 |
| `443/tcp` | 对批准的客户端开放 |
| `3022/tcp` | 禁止公网开放；Team OS 只监听 `127.0.0.1:3022` |
| `5432/tcp` | 禁止公网开放；只走 VPC 到 RDS |
| `6379/tcp` | 禁止公网开放；只走私网/容器网络 |

`cloud-preflight-check.sh` 对 80/443 的本机检查只表示端口空闲或由 Nginx 管理，不等于安全组、DNS 或证书已经通过。

## 3. 证书检查

- 证书覆盖正式域名，证书链完整，私钥与证书匹配，剩余有效期满足发布门槛。
- `fullchain.pem` 建议 `root:root 0644`；`privkey.pem` 必须 `root:root 0600`。
- 证书私钥、DNS API Token 和 ACME 账号材料不得进入 Git、镜像、日志或聊天记录。
- 明确续期方式、续期后 `nginx -t`/reload 流程以及到期告警负责人。

## 4. Nginx 候选配置

1. 从 `deploy/nginx/ai-team-os.conf` 生成候选文件，替换示例域名，保持 upstream 为 `127.0.0.1:3022`。
2. 确认 HTTPS、反向代理、gzip、缓存和安全 header 与模板一致；禁止扩大到被冻结的知识库、投喂端或超级管理员路由。
3. 先按主手册在独立候选目录运行 `nginx -t`，不得直接覆盖当前生效配置。
4. 只有候选验证通过，才使用主手册定义的 `flock`、原子安装、再次 `nginx -t`、reload 和失败自动恢复旧配置流程。
5. reload 后保留旧配置副本、证书版本和操作日志，禁止用 restart 掩盖验证失败。

## 5. DNS 切换前验证

依次确认：

- `http://127.0.0.1:3022/api/team-os/status` 与 readiness 均通过；
- 使用 `curl --resolve` 把正式域名临时解析到 ECS，验证 `/team-os`、`/api/team-os/status` 和更新清单；
- 使用 `openssl s_client -verify_return_error` 验证 SNI、证书链和主机名；
- 未知 Host 被拒绝，3022/5432/6379 不可从公网访问；
- Session Cookie 具备生产所需 `Secure`、`HttpOnly`、`SameSite` 属性；日志不输出 Cookie、Token、连接串或客户隐私。

任何一项失败均停止 DNS 切换。

## 6. DNS 切换后验收

- HTTP 只进行预期的固定 HTTPS 跳转，不形成开放重定向。
- HTTPS 页面、状态 API、静态资源与缓存策略正常；TLS 证书与 SNI 正确。
- 外部监控、证书到期监控、Nginx 错误率和应用错误率开始采样。
- 完成企业隔离与冻结模块 smoke test 后，才进入 Pilot Company 验收。

## 7. 回退

DNS、证书或 Nginx 验证失败时：按已批准记录恢复旧 Nginx 配置和旧 DNS 记录，重新运行 `nginx -t` 与 HTTPS 验证，并保留故障证据。禁止通过开放 3022、关闭 TLS 校验、改用明文 HTTP 或删除安全 header 临时绕过问题。

| 检查项 | 状态 | 证据/编号 | 操作者 | 复核人 |
| --- | --- | --- | --- | --- |
| DNS/备案与回退记录 | PENDING |  |  |  |
| 安全组与端口暴露 | PENDING |  |  |  |
| 证书链、权限与续期 | PENDING |  |  |  |
| Nginx candidate 与原子切换 | PENDING |  |  |  |
| `curl --resolve` / OpenSSL 验证 | PENDING |  |  |  |
| DNS 后监控与 smoke test | PENDING |  |  |  |
