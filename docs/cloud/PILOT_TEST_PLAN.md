# AI Team OS 首个企业 Pilot Company 上线验证计划

本计划验证首个测试企业 `Pilot Company` 的真实生产拓扑和核心业务闭环。所有测试使用合成数据，不使用真实客户、真实员工隐私或未经批准的外部消息接收人。

> 当前状态：`NOT EXECUTED`。空白记录、静态页面存在、本地 mock 或单企业正向测试都不能标记为“首企上线通过”。

## 1. 验收目标

验证以下十项闭环及其权限、企业隔离、异常处理和审计证据：

1. 企业创建；
2. 员工邀请；
3. 发布任务；
4. 员工提交记录；
5. AI Coach 分析；
6. CRM 客户管理；
7. 培训任务；
8. 数据驾驶舱；
9. 消息通知；
10. AI Copilot。

本计划同时保护既有 AI 知识库用户端、管理员投喂端和超级管理员端。Team OS 独立域名上的这些冻结路由应保持不可暴露；真实知识服务集成只能走已认证的独立内部 origin。

## 2. 进入条件

全部满足后才开始业务测试：

- 精确发布 SHA、镜像 ID、当前/上一个 release 和数据库 migration 证据已记录。
- ECS Docker、Nginx、HTTPS、RDS、AI Provider 和内部 health/readiness 通过。
- RDS 快照、逻辑备份、文件卷快照和应用回滚候选已准备。
- 正式 `.env` 为 root-only，日志/SLS 不记录 Cookie、Token、Key、邀请码或客户正文。
- provisioning 路径已通过安全、幂等和审计评审。若只能直接改生产数据库创建企业，本项为 `BLOCKED`，不得继续。
- 测试人员、角色、维护窗口、回退负责人和缺陷响应方式已明确。

## 3. 测试数据与账号

必须创建两个相互隔离的合成企业，才能证明企业隔离：

### Pilot Company

- `Pilot Owner`：企业老板，角色 `TEAM_OWNER`。
- `Pilot Manager`：主管，角色 `TEAM_MANAGER`。
- `Pilot Trainer`：培训师，角色 `TRAINER`。
- `Pilot Member`：员工，角色 `TEAM_MEMBER`。
- 两个团队、两条合成 CRM 客户、两项任务、两门课程和少量合成通知。

### Control Company

- 至少一个 Owner、Manager 和 Member。
- 独立团队、任务、CRM 客户、培训记录和通知。
- 资源 ID 只保存在受控测试记录中，用于跨企业攻击验证。

额外准备：无成员关系账号、`INACTIVE` 成员、`DISABLED` 团队、`DISABLED` 企业、`EXPIRED` 企业及受限套餐。账号使用企业测试邮箱，不在报告中保存密码、Session Cookie、邀请码或数据库 ID 原值。

## 4. 角色权限矩阵

| 能力 | Owner | Manager | Trainer | Member |
| --- | --- | --- | --- | --- |
| 企业/套餐视图 | 自己企业，按产品权限 | 只读授权范围 | 无 Owner 管理权 | 仅个人允许信息 |
| 团队/成员管理 | 自己企业 | 仅授权团队 | 训练职责范围只读 | 无管理权 |
| 任务发布/查看 | 自己企业 | 授权团队 | 按明确授权 | 仅自己的任务/提交 |
| CRM | 按套餐与企业权限 | 授权团队 | 默认无管理权 | 按明确授权 |
| 培训 | 全企业管理 | 授权团队分配 | 创建/管理训练范围 | 仅自己的课程/记录 |
| 数据驾驶舱 | 自己企业 | 授权团队 | 训练指标 | 个人指标 |
| Copilot | Owner 场景 | Manager 场景 | Trainer 场景如已定义 | Employee 场景 |

矩阵必须通过直接 API 请求验证，不能以“按钮不可见”作为授权证据。产品当前合同与矩阵不一致时，按更小权限处理并登记缺陷。

## 5. 共用执行规则

每个用例记录：用例 ID、时间、release SHA、账号角色、企业、入口/API、请求 ID、预期、实际状态码/结果、脱敏截图/日志、结论和缺陷编号。

- 正向用例预期 `2xx` 或产品定义的受控跳转。
- 未登录预期认证错误/登录跳转；角色不足、停用、过期或套餐禁止预期 `403`，或不泄露资源存在性的 `404`。
- 响应、错误、耗时、总数和日志都不能泄露 Control Company 数据。
- AI/消息外部调用失败必须返回受控错误，不得把“接口预留”记录为发送/分析成功。
- 任何 P0/P1、跨企业读取/写入、密钥泄露或不可恢复数据错误立即停止 Pilot。

## 6. 十项核心流程

### P01 企业创建

1. 通过已批准 provisioning 入口创建 `Pilot Company`，绑定唯一 Owner 和套餐。
2. 重复同一个幂等请求，确认不会生成第二个企业、Owner、订阅或孤立关联。
3. 验证 canonical Tenant、TenantCompany、TeamOrganization 和成员关系一致。
4. 使用普通 Member/Control Owner 尝试创建或接管 Pilot，必须拒绝。
5. 禁用/过期 Pilot 后，除受控续费/支持入口外，业务 API 全部拒绝。

当前没有安全 provisioning API、canonical 映射或全局停用门禁证据时，本用例结论必须为 `BLOCKED`，禁止用手工 SQL 绕过。

### P02 员工邀请

1. Owner 邀请 Manager、Trainer、Member，验证邮箱、角色、有效期、状态和重复邀请策略。
2. Manager 只能邀请/管理产品明确允许的授权团队成员。
3. 未注册邮箱只产生邀请，不应无认证直接成为成员。
4. 过期、已接受、篡改、跨企业和重放的邀请码必须拒绝。
5. 如真实邮件投递未实现，标记“记录已创建/外发未验证”，不能写“邀请已发送”。

### P03 发布任务

1. Owner/Manager 向 Pilot 授权团队发布任务，设置标题、说明、截止时间、目标数和提交要求。
2. Pilot Member 可见自己的任务；Control Company、未授权团队和 Trainer 默认不可见。
3. 校验分页、排序、过期日期、超长输入和重复提交。
4. 套餐/企业/团队禁用后直接调用创建 API，必须服务端拒绝。

入口：`/team-os/tasks`、`/api/team-os/tasks`。

### P04 员工提交记录

1. Pilot Member 提交文本、总结及允许的证据引用，验证状态与完成进度更新。
2. 其他 Member 不能替该员工提交；Control Company 不能使用已知 task ID 提交。
3. 重放/并发提交不会产生未经定义的重复完成记录。
4. 不上传真实聊天截图或客户文件；文件类型、大小、恶意内容和访问权限需单独测试。

入口：`/team-os/tasks/my`、`/team-os/tasks/[id]/submit`、`/api/team-os/tasks/[id]/submit`。

### P05 AI Coach 分析

1. 使用 Pilot 的合成任务提交执行分析，确认结果只引用 Pilot 上下文。
2. Control Company 的 task/submission ID、body companyId、query companyId 均不能影响分析范围。
3. 验证 Provider 超时、限流、错误 Key、空内容和超大输入的脱敏错误。
4. 日志不能包含 prompt/response 正文、Provider Key 或客户隐私。
5. 如果当前只是预留/规则化输出，明确记录实际能力，不得宣称真实模型效果通过。

入口：`/team-os/ai-coach/analyze`、`/api/team-os/ai-coach/analyze`。

### P06 CRM 客户管理

1. 创建、查看、修改两条合成客户及跟进记录，验证 Owner/Manager 范围。
2. Member/Trainer 未授权访问必须拒绝。
3. Pilot 会话直接读取/修改 Control customer ID 必须返回 `403/404` 且不泄露存在性。
4. 套餐禁用 CRM 时直接调用全部 CRM API，必须服务端拒绝。
5. AI 分析只使用当前企业数据，异常不泄露客户内容。

入口：`/team-os/crm`、`/api/team-os/crm/*`。

### P07 培训任务

1. Owner/Trainer 创建课程；Owner/Manager 向授权团队或 Member 分配。
2. Member 只能看到和完成自己的培训，记录状态、评分和完成时间一致。
3. Trainer 不获得企业/CRM/套餐的额外权限。
4. Pilot 不能查看/分配 Control 课程或成员。
5. 模拟、推荐、评估若调用 AI，重复执行 P05 的隔离与错误测试。

入口：`/team-os/training`、`/api/team-os/training/*`。

### P08 数据驾驶舱

1. 用数据库受控查询核对 Pilot 团队、任务、CRM、培训、AI 指标。
2. Owner 看企业范围，Manager 看授权团队，Trainer 看训练范围，Member 看个人范围。
3. Control 数据不计入 Pilot 的总数、趋势、导出、分页或缓存。
4. 空数据、边界日期、时区、慢查询和较大数据量下结果稳定。
5. 缓存键若存在必须包含 companyId、角色/权限版本，停用后不能继续读旧缓存。

入口：`/team-os/analytics`、`/api/team-os/analytics/*`。

### P09 消息通知

1. 生成 Pilot 站内通知，验证可见范围、未读数、标记已读和偏好设置。
2. Pilot 不能读取或更新 Control notification ID。
3. 停用成员/企业后，旧会话不能继续读取通知。
4. 邮件、企业微信、钉钉、飞书和系统 Push 只有真实接收端收到且有 Provider 回执时才算通过。
5. 当前未实现的外发渠道标记 `SKIPPED/BLOCKED`，不得用测试 API 的成功响应冒充送达。

入口：`/team-os/notifications`、`/api/team-os/notifications/*`。

### P10 AI Copilot

1. Owner、Manager、Member 分别进入对应 Copilot 场景，验证角色入口和最小数据范围。
2. 提问中注入 Control companyId、资源 ID 或“忽略权限”指令，不能突破服务端隔离。
3. 答案不包含 Control 数据、系统 prompt、API Key、Cookie 或未经授权的知识内容。
4. Provider 超时/限流、知识服务失败时返回可恢复的脱敏错误。
5. AI Brain 发布/优化只有独立内部 `APP_URL` 经过认证和隔离验证后才能测试；禁止为测试扩大公网 Nginx allowlist。

入口：`/team-os/copilot/*`、`/api/team-os/copilot/*`。

## 7. 强制跨企业攻击矩阵

对每个读写 API 至少执行：

1. Query：Pilot Cookie + `?companyId=<Control>`。
2. Body：Pilot Cookie + Control `companyId`/`teamId`/`userId`。
3. Path：Pilot Cookie 直接访问 Control task/customer/course/notification 等资源 ID。
4. 冲突：query/body/path 同时携带不同企业标识。
5. 分页/筛选/排序/搜索/导出：结果仍只含 Pilot。
6. 旧 Session：成员/企业停用后重放原请求。
7. 并发/幂等：重复邀请、提交、分配和升级不会产生重复记录或跨企业写入。

任何响应体、计数、错误、日志或时间差泄露 Control 名称、邮箱、状态或内容，都视为失败。

## 8. 部署与故障演练

- Nginx allowlist、未知 Host、HTTP→HTTPS、安全 header、限流和日志脱敏。
- 3022、RDS、Redis 公网不可达。
- 停止/启动 Team OS 容器，确认告警、会话和数据恢复。
- 模拟 RDS 不可用、连接耗尽、AI Provider 超时和磁盘阈值。
- 在隔离数据库恢复 pre-migration dump，并运行 schema/业务校验。
- 以已记录 release 演练应用回滚，确认数据库没有被自动回滚。
- 检查 SLS/Nginx/Docker 日志中没有密码、Cookie、Authorization、Key、邀请码、prompt 或客户内容。

## 9. APP 连接验收

本阶段不修改移动端源码。只有 Web 生产域名完成 HTTPS 后，才能用既有 build-time `TEAM_OS_BASE_URL` 构建四端候选包。每个平台仍需：

- 企业正式 identifier、签名/公证和证书轮换；
- 正式 HTTPS origin、同源导航、Session 登录/退出；
- 安装、覆盖升级、回滚、弱网、文件/相机权限；
- 版本清单读取、版本比较、下载哈希/签名验证；
- 宣传范围内的真实 Push 端到端验收。

任一平台仍为占位标识、未签名或 `unpublished` 时，只能标记技术验证，不能商业分发。

## 10. 通过标准

全部满足才可 `GO`：

- 十项核心流程的正向、权限、异常和审计用例通过。
- A/B 企业 query/body/path 越权测试 100% 通过。
- `INACTIVE`、`DISABLED`、`EXPIRED` 和套餐限制在每个受限 API 服务端生效。
- provisioning、canonical 企业映射、邀请、登录/Session/CSRF 达到生产要求。
- HTTPS、RDS、备份恢复、应用回滚、SLS/告警实际演练通过。
- 没有 P0/P1；P2 有书面风险接受、责任人和期限。
- 业务、安全、数据库、运维和 APP 发布责任人签字。

当前已知 canonical tenant/provisioning、全业务 Feature Guard、全局停用/过期门禁、真实 A/B 隔离、CSRF、AI Brain 内部身份、SLS 和四端签名发布等证据未关闭时，结论必须为 `NO-GO`。

## 11. 结果记录

| 用例 | 状态 | Release SHA | 证据位置 | 缺陷 | 执行/复核 |
| --- | --- | --- | --- | --- | --- |
| P01 企业创建 | NOT RUN |  |  |  |  |
| P02 员工邀请 | NOT RUN |  |  |  |  |
| P03 发布任务 | NOT RUN |  |  |  |  |
| P04 员工提交 | NOT RUN |  |  |  |  |
| P05 AI Coach | NOT RUN |  |  |  |  |
| P06 CRM | NOT RUN |  |  |  |  |
| P07 培训 | NOT RUN |  |  |  |  |
| P08 数据驾驶舱 | NOT RUN |  |  |  |  |
| P09 消息通知 | NOT RUN |  |  |  |  |
| P10 AI Copilot | NOT RUN |  |  |  |  |
| A/B 企业隔离 | NOT RUN |  |  |  |  |
| 备份恢复/回滚 | NOT RUN |  |  |  |  |

最终结论只能由上述证据生成，不能因创建了 tag、容器启动或首页可打开而自动转为通过。
