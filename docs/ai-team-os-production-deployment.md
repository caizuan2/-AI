# AI Team OS 生产部署说明

本文档定义 AI Team OS 1.0.0 的 Web 生产部署、数据库迁移、验证与回滚流程。真实密码、Token、数据库连接串、模型 Key、签名证书和公证凭据只能保存在部署平台 Secrets 或主机受控环境文件中，禁止提交到 Git。

## 1. 当前架构与边界

当前 `apps/team-os` 是根 Next.js App Router 工程中的独立业务模块，真实路由由 `app/team-os` 和 `app/api/team-os` 装配。它不是可单独构建的 Next 应用。因此当前生产镜像会构建整个根 Web 工程；上线前必须同时回归 AI 知识库用户端、管理员投喂端和超级管理员端。

生产请求链路：

```text
Web / Android / iOS / Windows / macOS
  -> DNS + CDN/WAF + TLS
  -> reverse proxy / load balancer
  -> Next.js application service
  -> PostgreSQL + pgvector
  -> external AI providers
  -> existing knowledge service adapter
```

建议由 CDN/WAF 终止公网 TLS，应用端口仅绑定 `127.0.0.1` 或私有网络。多实例部署前，还需要把进程内限流、缓存、任务锁和临时文件迁移到共享基础设施；否则先保持单应用实例并配合数据库备份和外部对象存储。

## 2. 运行基线

- Node.js：22（与 `.node-version`、CI 和 Docker 镜像一致）
- pnpm：10.12.4
- PostgreSQL：启用 pgvector，生产连接强制 TLS
- Web：Next.js 14，使用 `pnpm start` 运行；本阶段不修改全局 `next.config.mjs`，不启用 standalone
- 数据库：容器编排不创建数据库，`DATABASE_URL` 必须连接已经备份和受监控的外部生产数据库

本地 Node 版本即使更高，也不能替代 Node 22 的发布验证。

## 3. 环境变量

复制模板但不要提交副本：

```powershell
Copy-Item .env.production.example .env.production
```

必填分类：

- 数据库：`DATABASE_URL`、`DIRECT_URL`
- AI：`AI_PROVIDER` 和所选 provider 的 Key；当前知识向量链路始终还需要 `OPENAI_API_KEY` 与 embedding model
- 地址：`NEXT_PUBLIC_APP_URL`、`APP_URL`，均使用正式 HTTPS 域名
- 会话：`SESSION_SECRET`
- 集成凭据：`ENCRYPTION_KEY` 与当前运行时实际读取的 `TEAM_OS_INTEGRATION_ENCRYPTION_KEY`
- 根应用兼容：同一部署开放卡密、管理员、附件或定时任务时，还要配置 `LICENSE_SECRET`、`ADMIN_TOKEN`、Netlify Blobs 与 `CRON_SECRET`

`SESSION_SECRET`、`LICENSE_SECRET` 和 `ADMIN_TOKEN` 应独立生成。集成加密密钥必须是 32 字节 base64url 或 64 位十六进制值，例如：

```bash
openssl rand -hex 32
```

新部署只需设置 `ENCRYPTION_KEY`；为兼容既有环境，运行时仍优先读取
`TEAM_OS_INTEGRATION_ENCRYPTION_KEY`。如果两个变量同时存在，必须保持完全一致，
否则旧企业连接记录可能无法解密。

部署平台应限制环境文件权限；日志、工单、截图和 CI 输出中均不得打印这些值。

在注入真实环境变量后，先运行只输出变量名和检查结果、不输出变量值的校验：

```powershell
pnpm team-os:env:check
```

## 4. 安全、日志与错误监控

所有 Team OS API 继续通过既有 Session、用户端产品权限、卡密和各模块 RBAC 守卫；
企业范围由服务端根据有效成员关系解析，客户端传入的 `companyId` 不是授权依据。任务模块
额外拒绝停用成员和停用团队的列表、创建与提交请求。

Phase 12 新增的生产日志是 JSON 结构化 stdout/stderr 日志，支持 `info`、`warn`、
`error`：

- 基础鉴权沿用冻结的全局 `auth.*` / `product.*` 请求与跳转日志，不修改登录流程。
  当前登录接口尚无统一的成功/失败专用审计事件；该项必须在获得登录核心变更授权后补齐，
  在此之前视为商业切流阻塞项。
- Team OS 权限拒绝和 API 异常写入 `team_os.production.permission_denied` 或
  `team_os.production.api_error`；响应保留既有统一 JSON，并通过
  `x-team-os-error-id` 响应头返回可用于排障的错误编号。
- AI、Workflow、CRM 与知识调用分别记录 `ai_call`、`workflow_execution`、
  `crm_operation`、`knowledge_call`。
- 异常记录包含错误编号、时间、模块、请求 ID、用户 ID 与企业 ID；上下文暂时无法解析时
  对应字段为 `null`，不得用请求体中的未授权值补齐。

Team OS 的生产错误元数据只保留错误类型、错误码和状态码，不写入原始 message/stack；
业务日志只记录服务端解析的标识符和操作结果。底层日志层还会递归脱敏密码、Cookie、
Authorization、Token、API Key、数据库连接串、prompt 与正文，并限制字符串、数组和对象
大小。生产环境必须把容器 stdout/stderr 接入具备保留期和告警规则的集中式日志平台；
进程内最近日志仅用于诊断，不是持久监控。

## 5. 性能与容量策略

- 本阶段只增加与真实查询形状匹配的复合索引，不改数据模型字段或业务查询结果。
- 带客户和企业数据的 API 保持私有、动态响应，不进入公共 CDN 缓存；CDN 只缓存带内容哈希
  的静态资源。跨实例缓存必须包含 `companyId` 与权限版本，未满足前不启用。
- Notification、Workflow、Copilot、AI Brain 等列表继续使用现有页大小或 `take` 上限；
  旧任务列表仍保持原 API 合同，上线大租户前必须完成分页压测，不能在本阶段静默截断数据。
- App Router 的 `loading.tsx` 保留现有分段加载体验；本阶段不为追求懒加载重构稳定页面。
- AI 和知识调用保留现有超时、速率限制和降级链。多实例前需把进程内限流与缓存迁移到
  Redis 等共享基础设施。

发布容量测试至少记录 P50/P95/P99 API 延迟、数据库慢查询、AI provider 等待时间、错误率、
并发用户数与单企业最大数据量。未达到目标时，不应通过放宽超时掩盖问题。

## 6. 安装与发布前验证

从经过审核的不可变 commit 或 tag 构建：

```powershell
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm lint
pnpm typecheck
pnpm test:team-os:production
pnpm exec tsx apps/team-os/features/workflow/tests/workflow-contract.test.ts
pnpm exec tsx apps/team-os/features/copilot/tests/copilot-contract.test.ts
pnpm exec tsx apps/team-os/features/ai-brain/tests/ai-brain-contract.test.ts
pnpm build
```

`pnpm build` 的现有 `prebuild` 会更新根应用的 `version.json` 与 `public/releases/latest.json` 工作副本。验证完成后必须检查 `git diff`，不得把无关的知识库发布元数据混入 Team OS 提交。

## 7. 数据库迁移

1. 确认生产备份及恢复点可用。
2. 在隔离的迁移作业或受控运维终端设置生产 `DATABASE_URL` 与 `DIRECT_URL`。
3. 只执行部署型迁移，不得执行 reset、force reset 或 drop。

```powershell
pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

迁移失败时停止应用发布，不允许通过跳过迁移继续上线。应用容器不内置数据库，也不在启动命令中自动迁移，避免并发副本重复执行 schema 变更。
本次索引迁移使用普通 `CREATE INDEX`；在大表上可能等待或持有写锁，必须先在同等规模副本
查看 `EXPLAIN`/锁等待并安排维护窗口，不能在高峰期直接执行。

## 8. Docker 构建与启动

先做不打印变量值的 Compose 语法检查：

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

构建不可变镜像并启动：

```powershell
docker build --pull --tag ai-team-os:1.0.0 .
docker compose --env-file .env.production -f docker-compose.production.yml up --detach --no-build
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Compose 只启动应用服务，并通过 `.env.production` 连接外部数据库。`team_os_storage` 卷保留根应用仍可能使用的服务端文件；数据库与对象存储仍必须单独备份。

## 9. 健康检查与冒烟测试

容器 liveness 使用静态状态端点：

```text
GET /api/team-os/status
```

它只能证明 Next 进程能够响应。正式切流前还要在内网执行数据库、AI 与 schema readiness：

```text
GET /api/health?database=true&schema=true&ai=true
```

不要把包含内部诊断信息的 health 端点暴露给不受信任的公网监控。随后至少验证：

- `/team-os` 登录、企业选择和角色入口
- 企业 A 无法读取或写入企业 B 的任务、成员、CRM、培训、Workflow、Copilot 和 AI Brain 数据
- 未登录、角色不足、套餐禁用和输入错误分别返回预期状态码与统一 JSON
- AI provider 超时、数据库不可用时返回脱敏错误编号，不输出 prompt、Token、Key 或客户隐私
- AI 知识库用户端、管理员投喂端、超级管理员端的既有冒烟路径保持正常

## 10. 版本、发布与回滚

AI Team OS 使用独立版本元数据，不修改根知识库的 `version.json`：

| 字段 | 值 |
| --- | --- |
| 产品 | AI Team OS |
| Version | 1.0.0 |
| Build number | 2026071301 |
| Release date | 2026-07-13 |
| Environment | 运行时由 `TEAM_OS_ENVIRONMENT` 或 `NODE_ENV` 解析 |

状态端点会返回这组非敏感版本信息。发布步骤：

1. 记录发布 commit、镜像 digest、数据库迁移版本、检查人和批准时间。
2. 保留上一个稳定镜像及其环境配置引用，不复制明文 Secret。
3. 先部署新容器并完成内网 readiness，再切换反向代理流量。
4. 失败时先切回旧镜像；数据库回滚必须按已审核的迁移恢复方案执行，禁止直接 reset。
5. 查看脱敏日志并保存错误编号、企业 ID、用户 ID 与请求时间，禁止保存密码、Session、API Key 或原始客户隐私。

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml down
docker image inspect ai-team-os:1.0.0 --format '{{.Id}}'
```

`down` 不带 `--volumes`，避免删除持久卷。

## 11. CI/CD 与多端商业发布阻塞项

`.github/workflows/ai-team-os-production-readiness.yml` 为 Team OS 独立质量门禁，执行 Web、
Prisma、contract、Docker 配置及 Flutter 静态检查；Android 技术构建只允许通过手工输入开启，
且不上传为商业发布资产。Windows 与 Apple 的签名产物必须在具备企业证书的受控 runner
完成，不能复用旧知识库发布工作流中的调试签名。

Flutter Shell 位于 `apps/team-os-mobile`，本阶段仅验证，不修改该工程。当前不能宣布多端商业发布完成，原因包括：

- `pubspec.yaml` 仍为 `0.1.0+1`，尚未与 1.0.0 发布号对齐。
- Android、iOS 与 macOS identifier 仍含 `com.xxx.ai.teamos` 占位命名，必须在具备正式品牌与证书后审核替换。
- Android 缺少受控生产 keystore 时只能做无签名技术构建，不得分发。
- Windows 必须交付完整 Release 目录，并完成 Authenticode 签名与 MSIX/企业安装器封装。
- iOS IPA 和 macOS DMG 必须在 macOS/Xcode 环境完成签名、Provisioning、Archive、公证与安装验证。
- APP Release 必须传入正式 `TEAM_OS_BASE_URL=https://...`，不得包含任何服务端模型 Key。

这些阻塞解除前，只能把 APK/EXE/IPA/DMG 结果标记为技术验证，不得标记为商业稳定版。
`ai-team-os-phase12-production-stable` 仅冻结本阶段已经验证的源码与生产准备配置，不能作为
商业发布批准、生产切流批准或任何 APP 分发凭证。
