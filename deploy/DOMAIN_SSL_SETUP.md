# AI Team OS 阿里云域名与 HTTPS 配置

AI Team OS 使用独立域名和独立 ECS 运行边界。示例域名 `team-os.example.com` 必须在部署前替换，不能把 Team OS 配置覆盖到现有 AI 知识库、投喂端或超级管理员的 Nginx server block。

## 1. DNS 与备案

1. 在阿里云 DNS 创建独立子域名的 `A` 记录，指向 ECS 公网 IP；启用 IPv6 时再创建 `AAAA`。
2. 切流前把 TTL 临时降到 300 秒，稳定后再提升。
3. 确认中国大陆 ECS 的域名备案、公安备案和企业主体信息满足实际业务要求。
4. DNS 生效后验证：

   ```bash
   dig +short team-os.example.com A
   dig +short team-os.example.com AAAA
   ```

不得使用 DNS 切换掩盖应用未通过验收的问题。

## 2. ECS 安全组与主机防火墙

- `22/tcp`：只允许堡垒机、VPN 或固定运维 IP。
- `80/tcp`：公开，仅用于 ACME challenge 与 HTTPS 重定向。
- `443/tcp`：公开，作为唯一业务入口。
- `3022/tcp`：不开放安全组；应用绑定 `127.0.0.1:3022`。
- PostgreSQL/Redis：不向公网开放。RDS 仅允许 ECS 私网地址/安全组访问。

主机验证：

```bash
ss -lntp | grep -E ':(80|443|3022)\b'
curl --fail http://127.0.0.1:3022/api/team-os/status
```

`3022` 若显示为 `0.0.0.0` 或公网可达，停止部署并修正 Compose 环境配置。

## 3. SSL 证书

可使用阿里云 SSL 证书服务或受信任 ACME 客户端。证书私钥不得进入仓库、Docker image 或普通日志。

模板期望以下路径：

```text
/etc/ai-team-os/tls/fullchain.pem
/etc/ai-team-os/tls/privkey.pem
```

建议把它们设置为证书管理器生成文件的只读软链接，并限制目录权限：

```bash
sudo install -d -o root -g root -m 0750 /etc/ai-team-os/tls
sudo chown -R root:root /etc/ai-team-os/tls
sudo chmod 0644 /etc/ai-team-os/tls/fullchain.pem
sudo chmod 0600 /etc/ai-team-os/tls/privkey.pem
```

配置证书到期告警，并在续期后执行 `nginx -t && systemctl reload nginx`。到期监控不能只依赖人工日历。

## 4. 安装 Nginx 配置

1. 复制 `deploy/nginx/ai-team-os.conf` 到 Nginx include 目录。
2. 把全部 `team-os.example.com` 替换成正式域名。
3. 确认 upstream 仍为 `127.0.0.1:3022`。
4. 创建版本清单目录并只复制 Team OS 清单：

   ```bash
   sudo install -d -o root -g root -m 0755 /var/www/ai-team-os/updates
   sudo install -o root -g root -m 0644 deploy/VERSION_CHECK.json \
     /var/www/ai-team-os/updates/VERSION_CHECK.json
   ```

5. 检查并平滑重载：

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   sudo systemctl is-active nginx
   ```

模板只代理 Team OS、必要认证/卡密兼容路径和静态资源，其他根路径返回 `404`。不要为了临时调试把 `location /` 改为全量反向代理。

模板按单层 Nginx 使用 `$remote_addr` 覆盖客户端提供的 `X-Forwarded-For`。若前面增加阿里云 CDN/SLB，必须先用 `set_real_ip_from` 只信任官方且已批准的代理网段并配置正确 `real_ip_header`，验证后的 `$remote_addr` 才能进入审计和限流；禁止直接恢复 `$proxy_add_x_forwarded_for`。

## 5. HSTS 注意事项

模板包含 `Strict-Transport-Security: max-age=31536000; includeSubDomains`。只有在主域及所有子域都永久支持 HTTPS 时才能启用 `includeSubDomains`。首次上线若条件不满足，应在发布审批中先移除 `includeSubDomains` 或使用较短 `max-age` 验证，再逐步提升。HSTS 被浏览器缓存后无法立即撤回。

## 6. 验收

```bash
curl -I http://team-os.example.com/team-os
curl --fail --silent --show-error https://team-os.example.com/api/team-os/status
curl -I https://team-os.example.com/team-os
curl -I https://team-os.example.com/updates/ai-team-os/version.json
openssl s_client -connect team-os.example.com:443 -servername team-os.example.com </dev/null
```

验收标准：

- HTTP 永久跳转 HTTPS，证书链和域名匹配；
- TLS 只接受 1.2/1.3，安全 header 存在；
- 版本清单返回 `no-store`；
- `/_next/static` 可缓存，业务 API 不被静态缓存；
- 未列入 allowlist 的知识库、投喂端、超级管理员和 Chat 路径返回 `404`；
- Nginx access log 不记录 query string，日志中无 Cookie、Authorization、邀请代码或 API Key；
- 外网无法连接 `3022`、RDS 和 Redis。
