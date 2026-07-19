# AI Team OS 多端 APP Shell

这是 AI Team OS 的独立 Flutter 多端壳工程，目标平台为 Android、iOS、Windows 和 macOS。业务能力继续由 `/team-os` Web 模块提供；APP 只负责启动、同源登录、受限 WebView、角色入口、站内消息状态和平台能力边界。

## 认证与安全

- 现有服务端使用 `ai_kb_session` HttpOnly Session Cookie，不是 JWT。
- 账号密码只提交给同源 `/login` 页面，不进入 Dart 状态、日志、URL 或本地文件。
- Session 由系统 WebView CookieStore 持有；APP 不读取、不复制、不通过 JavaScript 返回 Session。
- 退出登录会限时尝试调用 `/api/auth/logout` 使服务端 Session 失效，并独立清理本地 Cookie 与浏览历史；即使服务端暂时不可达，本机退出也不会被无限阻塞。
- Release 只接受正式 HTTPS 域名和标准 443 端口。
- WebView 只允许同源 `/team-os/**`、`/login`、`/register`、`/unlock` 和 `/no-access` 顶层导航。
- 客户端不包含模型 Key、API Key、第三方企业连接 Secret 或签名私钥。

## 服务地址

构建时必须传入企业 HTTPS 地址：

```powershell
flutter run --dart-define=TEAM_OS_BASE_URL=https://team-os.example.com
```

本地调试可显式启用回环 HTTP；该开关在 Release 构建中无效：

```powershell
flutter run --dart-define=TEAM_OS_BASE_URL=http://127.0.0.1:3000 --dart-define=TEAM_OS_ALLOW_INSECURE_LOCAL=true
```

## 角色入口

角色来自已登录会话下的 `GET /api/team-os/organization`，仅用于默认导航：

- `TEAM_OWNER`：企业运营驾驶舱
- `TEAM_MANAGER`：组织与团队管理
- `TRAINER`：AI 培训
- `TEAM_MEMBER`：我的任务

客户端角色不参与授权；所有业务操作仍由服务端 RBAC 判断。

## 消息、推送与文件能力

- APP 读取 Phase 7 站内消息未读数量并提供消息中心入口。
- Android Push、APNs、Windows/macOS 系统通知只建立能力边界，当前没有设备 Token 注册或真实系统推送。
- 相机、图片和文件上传只保留能力说明；当前版本不提前申请宽泛设备权限。

## 构建

```powershell
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=TEAM_OS_BASE_URL=https://team-os.example.com
flutter build windows --release --dart-define=TEAM_OS_BASE_URL=https://team-os.example.com
```

Android 正式签名通过未提交的 `android/key.properties` 提供：

```properties
storeFile=C:/secure/ai-team-os-release.jks
storePassword=<CI_SECRET>
keyAlias=ai-team-os
keyPassword=<CI_SECRET>
```

缺少该文件时可进行无签名 Release 技术构建，但不能对外分发。

Windows 需要 WebView2 Runtime；`flutter_inappwebview` 的 Windows 构建还要求 `nuget.exe` 在 `PATH`。Windows 构建产物是 `build/windows/x64/runner/Release/` 完整目录，不能只复制 `ai_team_os.exe`；正式交付前应对目录内 EXE/DLL 进行 Authenticode 签名，并用 MSIX 或企业安装器封装。

Apple 平台在 macOS 构建机执行：

```bash
flutter build ipa --release --dart-define=TEAM_OS_BASE_URL=https://team-os.example.com
flutter build macos --release --dart-define=TEAM_OS_BASE_URL=https://team-os.example.com
hdiutil create -volname "AI Team OS" -srcfolder "build/macos/Build/Products/Release/AI Team OS.app" -ov -format UDZO build/AI-Team-OS.dmg
```

iOS IPA 与 macOS `.app`/DMG 必须在 macOS + Xcode 环境完成签名、公证和打包；签名证书、Provisioning Profile、公证凭据不得提交到仓库。

当前固定 `flutter_inappwebview 6.2.0-beta.3`，原因是稳定版 `6.1.5` 尚未包含 Android Gradle Plugin 9 兼容修复；后续稳定版包含该修复后应优先升级回稳定通道。本机因 `pub.dev` DNS 不可达使用 Flutter 官方中国社区镜像生成锁文件，CI 必须显式配置可信镜像，或在可访问 `pub.dev` 的环境重新解析并审查锁文件。
