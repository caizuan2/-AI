# AI Team OS 1.0.0 发布检查清单

发布负责人应为每一项记录证据链接、检查人和时间。本清单区分“Phase 12 源码冻结基线”与
“商业生产发布”：源码质量门禁通过后可以创建阶段基线标签，但任何商业阻塞项未通过时，
不得分发 APP、宣称商业稳定或切换生产流量。

## 代码与边界

- [ ] 当前 commit 来自 `feature-ai-team-os`，并已记录 Phase 12 checkpoint。
- [ ] `git status`、`git diff --stat`、`git diff` 已人工检查。
- [ ] 未修改 AI 知识库用户端、管理员投喂端、超级管理员、RAG 或 Chat 核心逻辑。
- [ ] 未提交 `.env.production`、证书、keystore、Provisioning Profile、API Key、数据库转储或客户数据。
- [ ] 未提交 APK、EXE、IPA、DMG、MSIX、ZIP、`.next`、`build`、`dist`、`releases` 或 `node_modules` 产物。
- [ ] 只显式暂存本次文件，未使用 `git add .`。

## Web 与质量门禁

- [ ] 使用 Node 22 和 pnpm 10.12.4 完成依赖安装。
- [ ] `pnpm exec prisma validate` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm typecheck` 通过。
- [ ] Workflow、Copilot、AI Brain contract tests 通过。
- [ ] `pnpm test:team-os:production` 通过。
- [ ] `pnpm build` 通过，且构建生成的旧应用版本元数据未混入提交。
- [ ] `/team-os` 与关键 Team OS 页面完成桌面端、移动端冒烟。

## 数据库与租户隔离

- [ ] 已创建可验证的生产备份和恢复点。
- [ ] `DATABASE_URL` 使用受限运行账号和 TLS；`DIRECT_URL` 仅供受控迁移作业使用。
- [ ] 已审核 `companyId`、`teamId`、`userId`、`createdAt` 的查询与索引计划。
- [ ] `pnpm prisma:migrate:deploy` 与 `pnpm exec prisma migrate status` 在目标环境通过。
- [ ] 企业 A 不能按 ID、列表、搜索、导出或关联接口访问企业 B 数据。
- [ ] OWNER、MANAGER、TRAINER、MEMBER 的允许与拒绝路径均有证据。
- [ ] 回滚旧应用版本时与当前 schema 向后兼容，或已有经审核的恢复步骤。

## 安全

- [ ] `SESSION_SECRET`、加密密钥、管理员 Secret 与 provider Key 均独立生成并存于 Secrets 管理系统。
- [ ] `TEAM_OS_INTEGRATION_ENCRYPTION_KEY` 是有效的 32 字节 base64url 或 64 位十六进制密钥。
- [ ] 登录、越权、AI、Workflow、CRM、知识调用和异常日志已验证脱敏。
- [ ] 已获得登录核心变更授权并补齐登录成功/失败专用审计事件。
- [ ] 日志不包含密码、Cookie、Authorization、Session、数据库凭据、API Key、原始附件或客户隐私。
- [ ] API 输入校验、鉴权、租户过滤、错误编号和非 2xx 状态已验证。
- [ ] CDN/WAF、TLS、速率限制、CORS、Cookie Secure/HttpOnly/SameSite 策略已审核。
- [ ] 数据库、AI provider 和对象存储故障均有降级或明确错误响应。

## Docker 与部署

- [ ] `.env.production` 已在 Git ignore 中，且主机文件权限受限。
- [ ] `docker compose --env-file .env.production -f docker-compose.production.yml config --quiet` 通过。
- [ ] `docker build --pull --tag ai-team-os:1.0.0 .` 通过。
- [ ] 镜像以非 root 用户运行，liveness 通过。
- [ ] `/api/health?database=true&schema=true&ai=true` 内网 readiness 通过。
- [ ] CDN/反向代理只把必要路径和端口暴露到公网。
- [ ] 已记录镜像 digest、发布 commit、迁移版本和上一个稳定镜像。
- [ ] 已演练切回旧镜像；回滚命令不会删除卷或重置数据库。

## APP 构建与签名（商业发布阻塞，不阻塞源码基线标签）

- [ ] Flutter `pubspec.yaml` 已由后续获准变更对齐 `1.0.0+<build>`。
- [ ] `flutter pub get`、`flutter analyze`、`flutter test` 通过。
- [ ] `com.xxx.ai.teamos` 占位 identifier 已由正式组织 identifier 替换并审核。
- [ ] Android Release APK/AAB 使用生产 keystore 签名，已验证证书与安装升级。
- [ ] Windows 完整 Release 目录已签名，并通过 MSIX/企业安装器安装、升级和卸载验证。
- [ ] iOS 已在 macOS/Xcode 完成 Archive、正式签名、Provisioning 与真机/TestFlight 验证。
- [ ] macOS `.app`/DMG 已签名、公证、staple，并通过 Gatekeeper 安装验证。
- [ ] 所有 Release 构建使用正式 HTTPS `TEAM_OS_BASE_URL`，客户端中不存在服务端 Key。

## 业务与冻结模块回归

- [ ] AI Team OS 企业、套餐、任务、组织、CRM、培训、分析、通知、Copilot、Workflow、AI Brain 主路径通过。
- [ ] AI 知识库用户端登录、问答、引用和附件链路正常。
- [ ] 管理员投喂端正常。
- [ ] 超级管理员端正常。
- [ ] RAG 与 Chat 核心输出格式未变化。

## 发布批准

- [ ] 安全负责人批准。
- [ ] 数据库负责人批准。
- [ ] Web 与 APP 发布负责人批准。
- [ ] 商业条款、隐私政策、数据处理协议、支持与事故响应联系人已确认。
- [ ] Web、Prisma、Team OS contract 与源码边界门禁已关闭，允许创建仅代表源码冻结的 `ai-team-os-phase12-production-stable`。
- [ ] 所有商业阻塞项已关闭，允许分发 APP、宣称商业稳定并切换生产流量。
