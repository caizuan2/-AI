# AI Team OS 生产安全检查清单

状态标记：`PASS` 必须有可复验的命令、请求或截图证据；`BLOCKED` 表示商业上线阻断；`N/A` 必须说明原因。静态代码存在不等于生产验证通过。

## 当前已知上线阻断

1. 缺少安全的企业 provisioning API；不能审计、幂等地创建并绑定 `Tenant`、`TenantCompany`、套餐与 Owner。
2. `Tenant` / `tenantId` / `TenantCompany.id` / `TeamOrganization.companyId` 的 canonical 映射尚未形成完整生产迁移与集成测试。
3. Feature Guard 尚未证明在 CRM、AI Coach、培训等每个受限业务 API 服务端强制执行；只调用 features/check 或隐藏 UI 不足以授权。
4. `TenantCompany.DISABLED/EXPIRED` 尚未证明能全局阻止所有业务 API。
5. 缺少真实数据库的 A/B 企业 query/body/path 越权集成测试与 RLS 等数据库纵深隔离证明。
6. 移动端标识、签名、公证、安装器、自动更新和真实外部 push 未达到发布条件。
7. AI Brain 知识发布/优化当前通过 `APP_URL` 调用根 `/api/core/ingest` 与 `/api/admin/knowledge/optimize`；Nginx 不应公开这些冻结路径，必须先实现并验证仅内部可达、受认证的服务 origin。
8. Cookie 鉴权写 API 尚未形成可确认的 Origin/Referer/CSRF Token 防护；`SameSite=Lax` 不能替代完整 CSRF 门禁。
9. 当前仅提供应用脱敏日志、Docker `json-file` 轮转和 Nginx 本地日志模板；阿里云 SLS/集中式不可篡改采集、查询权限、告警和保留策略必须在 ECS 上落地后才能 Go。

以上任一项未关闭时，Phase 13 tag 只能用于部署资料验收，不能视为商业切流批准。

## 网络与 HTTPS

- [ ] `3022` 仅监听 `127.0.0.1`，安全组和防火墙不开放。
- [ ] RDS/Redis 无公网端口，RDS 白名单仅含受控私网来源。
- [ ] 80 只做 ACME/跳转，443 为唯一业务入口。
- [ ] TLS 1.2/1.3、完整证书链、自动续期和到期告警通过。
- [ ] HSTS 的 `includeSubDomains` 已评估所有子域，未准备好时已降低策略。
- [ ] Nginx allowlist 已验，未授权知识库、投喂端、超级管理员、Chat 路径返回 404。
- [ ] API 限流、上传大小、超时与安全 header 在真实 HTTPS 响应中可见。

## 会话与 Cookie

- [ ] 生产 Session Cookie 具有 `Secure`、`HttpOnly`、合理 `SameSite`、受限 Path/Domain。
- [ ] 登录后 Session 轮换；退出、停用账号和高风险事件使服务端 Session 失效。
- [ ] CSRF 防护覆盖所有 Cookie 鉴权的写 API；Origin/Referer 策略经过测试。
- [ ] CORS 不允许任意源或携带凭据的通配符。
- [ ] APP WebView 不读取/复制 HttpOnly Cookie，退出同时调用服务端 logout 并清理本地 Cookie。

## 身份、RBAC 与企业隔离

- [ ] 所有 Team OS API 都先验证服务端用户，不信任客户端 userId/role。
- [ ] companyId 来自 active TeamMember/TeamOrganization 关系；请求 query/body 仅作选择并必须重新授权。
- [ ] Owner、Manager、Trainer、Member 的读写矩阵逐 API 验证。
- [ ] A/B 企业 query、body、path 资源 ID 越权全部返回 403/404 且无信息泄露。
- [ ] `INACTIVE` 成员、`DISABLED` 团队、`DISABLED/EXPIRED` 企业旧会话立即失效。
- [ ] 套餐 feature guard 在每个受限业务 API 执行，不能由前端绕过。
- [ ] Prisma 复合关系/索引防止 teamId 与 companyId 错配；孤立数据扫描为零。
- [ ] 已评估数据库 RLS 或其他纵深防御；若不采用，风险接受和补偿控制已签字。

## API 与输入

- [ ] JSON 类型、长度、枚举、分页上限、文件类型和大小均在服务端校验。
- [ ] 资源不存在与无权访问不泄露跨企业存在性。
- [ ] 批量、导出、搜索、排序和过滤同样强制企业范围。
- [ ] 重放、并发提交和幂等键测试不会生成重复扣费/邀请/任务。
- [ ] API 错误使用稳定错误编号/request ID，不返回堆栈、SQL 或密钥。
- [ ] SSRF、路径穿越、恶意文件、XSS、Markdown/HTML 注入和大请求已测试。

## 数据库、备份与密钥

- [ ] RDS TLS、自动备份、手工快照、跨故障域副本和恢复演练通过。
- [ ] migration 使用独立账号、固定版本 `prisma migrate deploy`，禁止 reset/db push。
- [ ] 运行账号、迁移账号、备份账号权限分离。
- [ ] 生产 `.env` 为 root:root 0600，未进入镜像层、Git、工单或聊天记录。
- [ ] SESSION、ENCRYPTION、AI Provider、数据库等密钥独立且具有轮换方案。
- [ ] 第三方企业连接配置加密保存，解密 Key 不与数据同库存储。
- [ ] 备份加密、校验和验证、保留期和删除审计完整。

## 日志与监控

- [ ] Nginx 不记录 query string、Cookie、Authorization 或请求 body。
- [ ] 应用日志不记录密码、Session、API Key、邀请代码、AI 原始 prompt/response 或客户隐私。
- [ ] 认证失败、权限拒绝、企业越权、AI 异常、workflow、CRM 和数据库异常具有脱敏审计。
- [ ] error/warn/info 分级正确，request ID、user、company、module 可追踪但不泄露隐私。
- [ ] 告警覆盖 5xx、登录异常、越权激增、RDS 连接、磁盘、容器重启、证书和备份失败。
- [ ] 日志访问最小权限、不可篡改保留和到期删除策略已配置。

## 容器与供应链

- [ ] 镜像由固定提交构建并记录 digest，依赖锁文件和漏洞扫描通过。
- [ ] 容器非 root、只读文件系统、`no-new-privileges`、drop capabilities 生效。
- [ ] 挂载卷权限受控，镜像和日志中没有密钥。
- [ ] 生产拉取来源受信任，tag 不作为唯一完整性标识。
- [ ] 回滚 release 已保存，旧镜像与当前 schema 兼容性已验证。
- [ ] CI 构建产物未包含 APK/EXE/DMG、node_modules、`.next` 等不应提交文件。

## APP 与更新

- [ ] Android applicationId、iOS/macOS Bundle ID、Windows publisher 均为企业正式标识。
- [ ] Android/iOS/macOS/Windows 正式签名与证书轮换方案完成。
- [ ] APP 只连接固定 HTTPS origin，WebView 顶层导航保持同源 allowlist。
- [ ] `VERSION_CHECK.json` 由 HTTPS 提供，下载 URL、SHA-256、版本/build 与签名包一致。
- [ ] 客户端真实消费清单，验证签名/哈希，并覆盖可选与强制更新流程。
- [ ] Android Push、APNs、Windows/macOS 系统通知如在宣传范围内，已真实端到端验收。

## 签字

| 领域 | 负责人 | 结论 | 证据位置 | 日期 |
| --- | --- | --- | --- | --- |
| 业务 |  |  |  |  |
| 安全 |  |  |  |  |
| 数据库 |  |  |  |  |
| 运维 |  |  |  |  |
| APP 发布 |  |  |  |  |
