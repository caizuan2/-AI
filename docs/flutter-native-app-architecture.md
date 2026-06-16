# Flutter 原生 App 升级架构方案

## 目标与边界

本方案用于将现有 WebView / Capacitor APK 演进为 Flutter 原生客户端。后端 AI 知识库系统、数据库、登录/注册、卡密激活、管理员端逻辑、API 路由和现有 CI/CD 均保持不变。

目标架构：

```text
Flutter App
  -> REST API（现有 Next.js API）
  -> AI 知识库系统（现有服务与数据库）
```

Flutter 客户端只替换移动端展示与交互层，不改变服务端业务规则。

## 客户端模块划分

### 1. App Shell

- `main.dart`：应用入口，初始化环境、主题、路由、错误收集。
- `AppRouter`：登录、激活、聊天、设置、更新弹窗等页面路由。
- `SessionScope`：维护当前用户、登录状态、卡密激活状态。
- `ApiClient`：统一封装现有 REST API，处理 cookie/token、错误码、超时、重试。

建议目录：

```text
flutter_app/
  lib/
    app/
      app.dart
      router.dart
      theme.dart
    core/
      api_client.dart
      app_config.dart
      result.dart
      storage.dart
    features/
      auth/
      activation/
      chat/
      attachments/
      update/
      profile/
```

### 2. 聊天模块

功能：

- GPT 风格消息列表。
- 用户消息 / AI 消息气泡。
- Markdown 渲染，支持代码块、列表、引用。
- 流式输出状态：`idle / sending / streaming / failed / done`。
- 消息重试、复制、反馈入口。

建议组件：

```text
features/chat/
  data/chat_api.dart
  domain/chat_message.dart
  domain/chat_conversation.dart
  state/chat_controller.dart
  ui/chat_page.dart
  ui/chat_message_list.dart
  ui/chat_bubble.dart
  ui/markdown_answer.dart
  ui/chat_input_bar.dart
```

API 对接保持现有端点：

- `POST /api/ai/chat/ask`
- `GET /api/ai/chat/conversations`
- `GET /api/ai/chat/history?conversation_id=...`

如果现有接口暂未提供真正 SSE 流式响应，Flutter 端先使用“分段打字机动画”模拟流式输出；后端未来支持 SSE 时，仅替换 `ChatApi.ask()` 的实现。

### 3. 输入与附件模块

功能：

- 文本输入。
- 加号菜单：图片、文件、拍照、扫描。
- 图片上传。
- 文件上传。
- 上传进度、失败重试、附件预览。
- 语音输入：客户端语音转文字后填入输入框。

建议组件：

```text
features/attachments/
  data/attachment_api.dart
  domain/chat_attachment.dart
  state/attachment_controller.dart
  ui/attachment_menu.dart
  ui/attachment_preview_strip.dart
```

API 对接保持现有端点：

- `POST /api/ai/chat/attachments`
- `GET /api/ai/chat/attachments/download?key=...`
- 可继续使用现有 `/api/upload/analyze` 与 `/api/knowledge`，不改变后端。

### 4. 用户系统

功能：

- 登录。
- 注册。
- 当前用户信息。
- 卡密激活。
- 退出登录。

建议组件：

```text
features/auth/
  data/auth_api.dart
  domain/current_user.dart
  state/auth_controller.dart
  ui/login_page.dart
  ui/register_page.dart

features/activation/
  data/activation_api.dart
  ui/activation_page.dart
```

API 对接保持现有端点：

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/license/redeem`
- `POST /api/activate`

### 5. 更新系统

功能：

- 启动时检查 `public/releases/latest.json`。
- 对比当前版本号与 build。
- 支持可选更新。
- 支持强制更新。
- Android 打开 APK 下载页或 GitHub Release。
- iOS 跳转 App Store / TestFlight。

建议组件：

```text
features/update/
  data/update_api.dart
  domain/update_manifest.dart
  domain/version_compare.dart
  state/update_controller.dart
  ui/update_dialog.dart
```

版本判断规则：

```text
remote.build > local.build  -> 发现新版本
remote.force_update == true -> 强制更新
remote.minimum_build > local.build -> 强制更新
```

下载来源保持现有发布体系：

- GitHub Release APK / EXE assets。
- `public/releases/latest.json`。
- 下载页 URL。

### 6. 下载与发布

Android：

- Flutter 产物：`app-release.apk` 或 `app-release.aab`。
- 内测 / 自分发用 APK。
- 上架 Google Play 用 AAB。
- 更新检查仍读取现有 `latest.json`。

iOS：

- 使用 `Runner.xcworkspace`。
- 配置 Bundle ID、Signing、Capabilities。
- 上架 App Store / TestFlight。
- 更新提示跳转 App Store。

## API 适配策略

Flutter 不改后端，只做 API Adapter。

建议统一封装：

```dart
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.cookieStore,
  });

  Future<ApiResponse<T>> get<T>(String path);
  Future<ApiResponse<T>> post<T>(String path, {Object? body});
  Future<ApiResponse<T>> multipart<T>(String path, List<AppFile> files);
}
```

移动端请求基地址：

```text
Production: https://stately-sawine-1efd4d.netlify.app
Local Dev:  http://10.0.2.2:3000
```

Cookie 会话方案：

- 继续使用现有后端 session cookie。
- Flutter 使用 cookie jar 持久化。
- `GET /api/auth/me` 作为启动态恢复入口。

## 状态管理建议

推荐轻量结构：

- `Riverpod`：全局状态、异步加载、依赖注入。
- `dio`：HTTP、multipart、拦截器。
- `flutter_secure_storage`：敏感会话信息。
- `shared_preferences`：非敏感设置。
- `flutter_markdown`：Markdown 渲染。
- `file_picker` / `image_picker`：附件选择。
- `speech_to_text`：语音输入。
- `url_launcher`：更新下载跳转。

这些依赖只属于新的 Flutter 工程，不加入现有 Next.js 项目依赖。

## 页面清单

第一阶段 MVP：

- `SplashPage`：启动、恢复会话、检查更新。
- `LoginPage`：登录。
- `RegisterPage`：注册。
- `ActivationPage`：卡密激活。
- `ChatPage`：聊天主界面。
- `ConversationDrawer`：历史会话。
- `ProfilePage`：用户信息、退出登录。
- `UpdateDialog`：更新提示。

第二阶段增强：

- 知识库列表。
- 知识详情。
- 搜索筛选。
- 设置页。
- 离线草稿箱。
- 本地消息缓存。

## 迁移步骤

### Phase 1：Flutter 壳工程

1. 新建 `flutter_app/`。
2. 配置 Android/iOS 包名。
3. 实现 `ApiClient`、环境配置、主题、路由。
4. 接入登录、注册、当前用户接口。

### Phase 2：聊天闭环

1. 实现聊天页。
2. 接入会话列表、历史消息、发送消息。
3. 接入附件上传。
4. 实现 Markdown 渲染和复制。

### Phase 3：更新与分发

1. 接入 `latest.json`。
2. 实现强制更新弹窗。
3. Android 支持 APK 下载。
4. iOS 支持 App Store / TestFlight 跳转。

### Phase 4：上架准备

1. 隐私政策、权限说明。
2. Android target SDK、签名、AAB。
3. iOS Signing、Capabilities、ATS 配置。
4. 崩溃日志和用户反馈。

## CI/CD 规划

保留现有 Web / API / Release workflow，不破坏现有发布。

新增独立 Flutter workflow：

```text
.github/workflows/flutter-mobile.yml
```

流程：

```text
checkout
setup flutter
flutter pub get
flutter analyze
flutter test
flutter build apk --release
flutter build appbundle --release
upload GitHub Release assets
```

iOS 构建建议单独使用 macOS runner：

```text
flutter build ipa --release
upload TestFlight / App Store Connect
```

## 风险与处理

- 后端是 session cookie：Flutter 必须正确持久化 cookie。
- 现有接口不是 SSE：先模拟流式，后端未来升级后再接入真流式。
- 文件上传差异：移动端需统一 MIME、文件名、大小限制。
- App Store 审核：必须补隐私政策、权限说明、账号删除说明。
- 自动更新：iOS 不允许 APK 式自更新，只能跳转 App Store/TestFlight。

## 最小落地原则

本方案不改变：

- 数据库 schema。
- Prisma migration。
- 登录/注册/卡密系统。
- 管理员端功能。
- 现有 API 路由。
- 现有 Web / Electron / Capacitor 构建。

Flutter 客户端作为新增移动端工程独立演进，通过现有 REST API 与 AI 知识库系统对接。
