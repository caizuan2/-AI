# AI Team OS 首个企业 Pilot 验收方案

本方案要求在与生产拓扑一致的隔离环境执行。测试数据不得使用真实客户隐私，所有请求保存 request ID、角色、企业、期望与实际状态码作为证据。

## 测试数据

创建两个完全独立的企业：

- 企业 A：Owner A、Manager A、Trainer A、Member A1、Member A2；团队 A1/A2。
- 企业 B：Owner B、Manager B、Trainer B、Member B1；团队 B1。
- 每个企业各有任务、提交、CRM 客户、课程、培训分配、看板数据和站内通知。
- 再准备一个无成员关系账号、一个 `INACTIVE` 成员、一个 `DISABLED` 团队、一个 `DISABLED` 企业和一个 `EXPIRED` 企业。

所有资源 ID、companyId、teamId 和 userId 记录在受控测试表中，不能把邀请码、Cookie 或密码写入报告。

## 1. 基础访问与角色

逐个账号登录并验证：

- Owner 只能管理自己的企业、团队、成员、套餐视图和企业集成。
- Manager 只能管理授权团队，不得管理其他企业或 Owner 级设置。
- Trainer 只能访问培训职责范围。
- Member 只能访问自己的任务、提交、通知和允许的业务数据。
- 未登录返回认证错误/重定向；无成员关系账号返回 `403` 或受控无权限页面。

客户端隐藏按钮不是通过证据，必须直接调用 API 验证拒绝。

## 2. A/B 企业隔离攻击测试

每个 Team OS 读写 API 至少执行以下三类攻击：

1. **Query 越权**：A 的有效会话发送 `?companyId=<B>`，包括 organization、members、company、subscription、usage、features、CRM、training、dashboard、notifications。
2. **Body 越权**：在 POST/PATCH JSON 中把 `companyId` 或 `teamId` 改为 B，同时保留 A 的 Cookie。
3. **Path 资源越权**：A 直接访问或修改已知的 B task/submission/customer/course/assignment/workflow/notification ID。

预期结果：服务端返回 `403` 或不泄露存在性的 `404`；响应体、总数、错误、日志和耗时都不能泄露 B 的名称、邮箱、资源状态或内容；数据库不能产生跨企业写入。

补充测试：

- 同时提供互相冲突的 query/body companyId，服务端必须拒绝而不是任选一个。
- 使用 B 的 teamId 配合 A 的 companyId，必须拒绝。
- 修改分页、排序、筛选和导出参数，结果仍只含当前企业。
- 使用已删除/过期资源 ID 重放请求，不得恢复越权关系。
- 并发执行两次创建/邀请/提交，验证幂等或唯一约束不产生重复记录。

## 3. 停用与到期状态

- `TeamMember.INACTIVE`：立即失去企业读取和写入权限，旧会话也必须失败。
- `TeamOrganization.DISABLED`：团队成员不得继续操作该团队资源。
- `TenantCompany.DISABLED` / `EXPIRED`：除受控续费/支持入口外，所有业务 API 必须拒绝。
- 套餐 `EXPIRED` / `CANCELLED`：受限业务 API 必须在服务端拒绝。
- 禁用后重试旧链接、旧 Cookie、已知 path ID 和缓存页面，均不能绕过。

当前实现对成员/团队 active 状态有局部检查，但企业状态和套餐 feature guard 尚未证明在每个业务 API 强制执行。任一请求仍成功即为商业上线阻断，不得按“UI 已禁用”放行。

## 4. 业务闭环

### 组织与邀请

1. Owner A 创建团队、编辑团队、查看成员。
2. Manager A 验证自己的管理边界。
3. 为已注册 active 邮箱生成邀请，确认 7 天有效期、角色和重复邀请限制。
4. Owner 按同一邮箱和同一角色添加成员，确认邀请转 `ACCEPTED`。
5. 验证未注册邮箱只能留下邀请记录，不能直接成为成员；当前没有邀请码自助接受和真实邮件投递。

### 任务

1. 主管向 A 团队发布任务，A 团队员工分别只能看到任务并提交自己的完成记录。
2. 员工看到自己的任务、提交文本/证据/总结。
3. 主管看到提交记录，状态与完成进度一致。
4. B 账号和 A 的非授权成员无法查看或提交。

### CRM 与 AI 分析

1. A 新建虚拟客户、阶段记录和跟进记录。
2. AI 分析仅使用 A 的 CRM/知识上下文，不引用 B 数据。
3. AI Provider 超时、限流、无 Key 时返回受控错误，不泄露 prompt、Key 或客户隐私。
4. 套餐不允许 CRM/AI 时直接调用 API 必须被拒绝。

### AI Brain 与知识适配

1. 候选知识提取、审核、发布和优化必须使用企业 A 的受控知识范围，不能读取企业 B。
2. 根 `/api/core/ingest` 与 `/api/admin/knowledge/optimize` 在 Team OS 公网域名继续返回 `404`；内部调用必须走单独的受认证 origin。
3. 在内部 origin 尚未实现并通过正向发布、越权拒绝和日志脱敏测试前，本项结论必须为 `BLOCKED`，不能临时扩大 Nginx allowlist。

### 培训与数据看板

1. Owner/Trainer 创建课程；Owner/Manager 向授权团队或成员分配培训；Member 完成训练记录。
2. 看板指标与 A 的数据库记录核对；B 数据不计入。
3. 空数据、分页上限、大数据量和慢查询场景正常。

### 消息通知

1. 创建站内通知，验证当前用户/团队可见范围、未读数和已读更新。
2. A 不能读取或标记 B 的 notification ID。
3. 邮件、企业微信、钉钉、飞书以及 Android/iOS/Windows/macOS 系统推送当前没有真实外发闭环；测试结果应为受控跳过/未投递，不能写“发送成功”。

## 5. 部署与故障演练

- Nginx 只暴露 allowlist，知识库/投喂端/超级管理员/Chat 路径在 Team OS 域名返回 `404`。
- 3022、RDS、Redis 均不可从公网访问。
- 停止 Team OS 容器，验证 5xx 告警；重启后会话和数据一致。
- 模拟 AI Provider 超时、RDS 连接耗尽和磁盘告警。
- 执行逻辑备份并在隔离库恢复。
- 使用上一 release 演练应用回滚，确认数据库没有被脚本自动回滚。
- 检查日志不含 query string、Cookie、密码、API Key、邀请代码和客户内容。

## 6. APP 验收

APP 仅在 `APP_RELEASE_READINESS.md` 阻断全部关闭后进入分发验收。至少覆盖：正式包标识、签名/公证、HTTPS 域名、登录 Cookie、退出清理、同源导航限制、站内通知、版本清单校验、强制更新，以及离线/弱网。当前外部 push 和自动更新未完成，不计为通过。

## Go / No-Go

必须全部满足才可 Go：

- A/B 企业 query、body、path 越权测试 100% 通过；
- 停用/到期/套餐限制在服务端强制执行；
- provisioning API、企业标识映射和成员邀请闭环达到开通要求；
- 备份恢复、应用回滚、监控告警通过；
- Web 与计划发布的平台构建、签名、版本、安装/升级测试通过；
- 没有 P0/P1 缺陷，P2 缺陷有书面接受与期限；
- 业务、安全、运维签字。

测试报告必须明确 tag 只是部署资料基线。未通过项不能用“后续优化”替代 No-Go。
