# iOS IPA 打包说明

iOS IPA 必须在 macOS + Xcode + Apple Developer 账号环境下完成签名打包。Windows 环境只能保留配置和脚本，不能生成可安装的真实 IPA；仓库中不要提交证书、Apple ID、Provisioning Profile、`.p12`、`.mobileprovision` 或导出的 IPA。

## 环境准备

1. 安装 Xcode，并打开一次完成命令行工具初始化。
2. 如 iOS 工程存在 Podfile，请安装 CocoaPods：`sudo gem install cocoapods`。
3. 运行 `pnpm install`，确保 `@capacitor/ios` 已安装。
4. 准备 Apple Developer Team、Bundle ID、签名证书和 Provisioning Profile。

## 用户端 IPA

用户端入口是 `https://stately-sawine-1efd4d.netlify.app/chat-ui`，配置文件是 `capacitor.ios.user.config.ts`。

```bash
bash scripts/build-ios-user-ipa.sh
```

可选环境变量：

```bash
export APPLE_TEAM_ID="你的 Team ID"
export IOS_SIGNING_STYLE="automatic"
export IOS_EXPORT_METHOD="development"
export IOS_PROVISIONING_PROFILE="你的 Profile 名称"
bash scripts/build-ios-user-ipa.sh
```

输出路径：

- `dist-app/ios/ai-knowledge-chat.ipa`
- `dist-app/ios/ai-knowledge-chat-latest.ipa`

## 管理员端 IPA

管理员端入口是 `https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest`，配置文件是 `capacitor.ios.admin.config.ts`。

```bash
bash scripts/build-ios-admin-ipa.sh
```

输出路径：

- `dist-app/admin-ios/ai-knowledge-admin.ipa`
- `dist-app/admin-ios/ai-knowledge-admin-latest.ipa`

## Xcode 手动打包

1. 运行对应脚本或执行 `npx cap add ios --config capacitor.ios.user.config.ts` / `npx cap sync ios --config capacitor.ios.user.config.ts`。
2. 打开 `ios/App/App.xcworkspace`。
3. 在 Signing & Capabilities 中选择 Team，并确认 Bundle Identifier 与对应配置一致。
4. 选择 `Any iOS Device`。
5. 使用 Xcode 菜单 `Product -> Archive`。
6. 在 Organizer 中选择 Archive，并按实际分发方式 Export IPA。

## 分发建议

- 内测建议使用 TestFlight。
- 企业内部分发必须遵守 Apple Developer Enterprise Program 规则。
- 大文件建议通过 GitHub Release 或对象存储发布，不要直接提交到 Git。
- 不要提交 `dist-app/`、`.ipa`、签名证书、Provisioning Profile 或任何密钥。
