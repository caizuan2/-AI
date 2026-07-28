# 投喂端 Apple 打包

本打包链路仅用于“小董AI”投喂端：

- iOS：`com.aiknowledge.ingestadmin`，通过 Capacitor 8 生成独立的 `ios-admin-ingest/` 工程并导出签名 IPA。
- macOS：`com.aiknowledge.ingestadmin.desktop`，用当前 `electron/admin-ingest/` 壳生成 Intel + Apple Silicon 的 Universal DMG。
- 版本与 Build 统一读取 `config/admin-ingest/release.json`，不另外维护版本号。
- Apple 入口必须是正式 HTTPS `/admin-ingest` 地址。脚本不会为 HTTP 添加 ATS 例外。

该实现不修改用户端、超级管理员、DeepSeek、豆包或现有 Web/EXE/APK 发布链路。Apple 录音使用 `MediaRecorder`，再复用投喂端现有的 `admin-ingest-native-speech` 事件和云转写接口。

## 构建要求

- Xcode 26 或更新版本。
- Node.js 22.13.0、pnpm 10.12.4。
- Apple Developer 团队和正式 HTTPS 域名。
- iOS：Apple Distribution 证书、匹配 `com.aiknowledge.ingestadmin` 的 Provisioning Profile。
- macOS：Developer ID Application 证书，以及 Apple ID、公证专用密码、Team ID。
- 正式构建默认要求 Git 工作区干净。仅排障时可临时设置 `ALLOW_DIRTY_APPLE_BUILD=1`，该产物不应直接发布。

证书、`.p12`、Provisioning Profile、IPA、DMG、Xcode Archive 和生成的 iOS 工程均已排除在 Git 之外。

## 本地 Mac 构建

iOS：

```bash
export ADMIN_INGEST_APP_URL="https://example.com/admin-ingest"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
export IOS_PROVISIONING_PROFILE="Provisioning Profile Name"
export IOS_SIGNING_STYLE="manual"
export IOS_EXPORT_METHOD="app-store-connect"
pnpm admin-ingest:ios
```

输出：

- `artifacts/admin-ingest/ios/admin-ingest.ipa`
- `artifacts/admin-ingest/ios/manifest.json`

macOS：

```bash
export ADMIN_INGEST_APP_URL="https://example.com/admin-ingest"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
export APPLE_ID="developer@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
pnpm admin-ingest:macos
```

输出：

- `artifacts/admin-ingest/macos/admin-ingest.dmg`
- `artifacts/admin-ingest/macos/manifest.json`

macOS 脚本会在成功前依次通过 `codesign`、Gatekeeper `spctl`、`stapler validate` 和 `hdiutil verify`。任何一项失败都不会标记成功。

## GitHub 手动构建

工作流为 `.github/workflows/admin-ingest-build-apple.yml`，只允许手动触发，不会改动当前 tag 发布和 Web/EXE/APK 流水线。

需要配置以下 Actions Secrets：

- `APPLE_TEAM_ID`
- `APPLE_BUILD_KEYCHAIN_PASSWORD`
- `ADMIN_INGEST_IOS_DISTRIBUTION_P12_BASE64`
- `ADMIN_INGEST_IOS_DISTRIBUTION_P12_PASSWORD`
- `ADMIN_INGEST_IOS_PROVISIONING_PROFILE_BASE64`
- `ADMIN_INGEST_IOS_PROVISIONING_PROFILE_NAME`
- `ADMIN_INGEST_MAC_DEVELOPER_ID_P12_BASE64`
- `ADMIN_INGEST_MAC_DEVELOPER_ID_P12_PASSWORD`
- `APPLE_NOTARY_APPLE_ID`
- `APPLE_NOTARY_APP_SPECIFIC_PASSWORD`

触发时填写正式 HTTPS `app_url`，按需选择 iOS、macOS 和 iOS 导出方式。工作流只上传私有构建 Artifact，不自动创建 Release，不自动公开 IPA/DMG。

## 分发与验收

- iOS 内测优先把 IPA 上传 App Store Connect 后走 TestFlight。Ad Hoc 导出只适用于已登记 UDID 的设备。
- macOS 分发公证后的 DMG。首次启动必须确认 Gatekeeper 正常通过。
- iPhone 真机验收：登录/卡密、会话保持、文字投喂、图片/文件/拍照、麦克风授权、真实录音转写、历史同步。
- Mac 验收：上述功能，加上 Intel/Apple Silicon、DMG 拖拽安装、覆盖升级和首次启动。
- 模型验收仍使用既有方法检查 requested/actual model、非空输出和 `fallbackUsed=false`；本打包变更不调整任何模型链路。
