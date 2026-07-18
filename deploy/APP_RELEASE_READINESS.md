# AI Team OS APP 正式发布准备状态

结论：当前 Flutter Shell 可用于工程与 WebView 集成验证，但 Android、iOS、Windows、macOS 均未达到企业正式分发条件。`deploy/VERSION_CHECK.json` 当前把各平台标记为 `unpublished`，下载 URL、SHA-256 和发布时间为空；不得把技术构建当作已发布安装包。

## 当前基线

- Flutter 版本：`apps/team-os-mobile/pubspec.yaml` 为 `0.1.0+1`。
- Web 版本：AI Team OS `1.0.0`，build `2026071301`。
- Android/iOS/macOS 标识仍为占位值 `com.xxx.ai.teamos`，Windows CompanyName 也含 `com.xxx.ai`。
- APP 使用系统 WebView 的 `ai_kb_session` HttpOnly Session Cookie，不实现独立 JWT/Token 安全存储；账号密码不应进入 Dart 状态或日志。
- WebView Release 只允许构建时指定的正式 HTTPS origin，并限制 `/team-os` 与必要登录路径。
- 站内通知可通过 Web API 验证；设备 Token 注册和 Android Push、APNs、Windows/macOS 原生推送未完成。
- 版本清单是服务端契约文件，当前客户端没有完整的拉取、比较、下载、哈希/签名校验和强制更新闭环。

## 共同发布门槛

- [ ] 企业正式包名、产品名、Publisher/Team ID 已冻结且不可再随意修改。
- [ ] `0.1.0+1` 已升级为批准的正式 version/build，每个平台与清单一致。
- [ ] `TEAM_OS_BASE_URL` 指向正式独立 HTTPS 域名，证书链和同源导航通过。
- [ ] 登录、Session 续期、退出清理、账号停用和弱网/离线测试通过。
- [ ] 无 API Key、模型 Key、证书私钥或密码打入安装包。
- [ ] 隐私政策、权限说明、数据删除、日志与崩溃采集合规完成。
- [ ] SBOM、依赖许可证、漏洞扫描和 Flutter beta 依赖风险已审核。
- [ ] 自动更新客户端实现完成，HTTPS 清单与安装包 SHA-256/签名一致。
- [ ] 下载 URL 可用，回滚版本和最低版本策略经过演练。

## Android

当前阻断：

- `applicationId`/namespace 仍是 `com.xxx.ai.teamos`。
- Release keystore、alias、密码和 CI Secret 尚未形成可审计生产配置。
- 未验证 Play App Signing/企业 MDM 分发、目标 SDK 政策和真机兼容矩阵。
- 没有 FCM 设备 Token 注册与真实 push。
- 没有客户端自动更新与 APK SHA-256 校验闭环。

发布前必须：使用企业持有的唯一 applicationId；在未提交的安全存储提供 signing config；执行 `flutter build apk --release` 或 appbundle；用 `apksigner verify --verbose --print-certs` 验证；在多 Android 版本真机测试安装、升级、登录、WebView、文件/相机权限和退出。

## iOS

说明：Phase 13 的 `VERSION_CHECK.json` 按任务范围只声明 Android、Windows、macOS 直连更新契约；iOS 在 App Store/TestFlight 发布闭环完成前不进入该下载清单，也不应由客户端消费该强制更新字段。

当前阻断：

- Bundle Identifier 仍是占位值。
- Apple Developer Team、Distribution Certificate、Provisioning Profile 未配置。
- 没有 APNs entitlement、设备 Token 注册和真实 push。
- 未完成 Archive、TestFlight、隐私清单、App Store 审核和升级测试。

正式 IPA 必须在 macOS + Xcode 构建机完成签名与 Archive；证书和 profile 只存放在受控 Keychain/CI Secret。Windows 上不能宣称 iOS 构建或签名成功。

## Windows

当前阻断：

- CompanyName/Publisher 仍含占位值，正式应用标识未冻结。
- 未配置企业 Authenticode 证书、时间戳服务和签名流水线。
- Flutter 输出是包含 EXE/DLL 的完整目录，未封装 MSIX/企业安装器。
- WebView2 Runtime、升级/卸载、用户数据保留和自动更新未完成验收。
- 没有 Windows 原生通知实现。

发布前必须对完整 Release 目录进行依赖核验，对所有交付二进制签名，封装安装器，并在干净 Windows 10/11 x64 环境验证首次安装、覆盖升级、回滚和卸载。

## macOS

当前阻断：

- Bundle Identifier 和版权主体仍为占位值。
- Developer ID、entitlements、Hardened Runtime、notarization 和 staple 未完成。
- DMG 只存在构建命令说明，没有可验证的签名/公证产物。
- APNs/macOS 通知和自动更新未完成。

正式 DMG 必须在 macOS 构建，执行 codesign、notarytool 与 stapler 验证，并在受支持 Intel/Apple Silicon 设备上测试。Windows 上不能宣称 macOS 构建、公证成功。

## 自动更新清单

Nginx 提供：

```text
https://<TEAM_OS_DOMAIN>/updates/ai-team-os/version.json
```

只有满足以下条件后才能把平台从 `unpublished` 改为已发布：

1. 安装包已完成平台签名/公证并通过安装测试。
2. `latestVersion`、`latestBuild` 与包内元数据完全一致。
3. `downloadUrl` 使用 HTTPS、不可变版本路径且可用。
4. `sha256` 由最终签名产物计算并由第二人复核。
5. `minimumBuild` 和 `forceUpdate` 经业务/安全批准。
6. 客户端已实现清单读取、版本比较、下载完整性验证和失败回退。
7. 强制更新不会造成登录死循环或无法恢复的客户端锁死。

当前清单 `forceUpdate=false`、`releaseStatus=unpublished` 是正确的安全状态，不应为了“看起来上线”提前改为发布。

## 发布证据

每个平台应保留：源码提交 SHA、Flutter/Dart/Xcode/Gradle/MSVC 版本、构建日志、包版本/build、签名证书指纹、安装包 SHA-256、恶意软件扫描、安装/升级/回滚用例、下载 URL 和发布审批。缺少任何关键证据时结论为 No-Go。
