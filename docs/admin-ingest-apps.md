# 管理员投喂端 Web / EXE / APK 壳层

本阶段只新增管理员投喂版壳层，不复用用户端 `/chat-ui`、用户端 EXE 或用户端 APK。

## Web

```text
http://localhost:3015/admin-ingest?app=ingest-admin&platform=web
```

## Windows EXE

独立 Electron 入口：

```text
electron/admin-ingest/main.js
```

默认 URL：

```text
http://localhost:3015/admin-ingest?app=ingest-admin&platform=exe
```

运行：

```powershell
npm run admin-ingest:desktop:dev
```

打包：

```powershell
npm run admin-ingest:desktop:build
```

配置要求：

- 应用名：`AI知识库投喂端`
- 持久 session：`persist:admin-ingest`
- 阻止 `/chat-ui`
- 外部链接由系统浏览器打开

## Android APK

独立 APK 壳层配置：

```text
apps/admin-ingest-android/admin-ingest-app.config.json
```

建议包名：

```text
com.aiknowledge.ingestadmin
```

默认 URL：

```text
http://10.0.2.2:3015/admin-ingest?app=ingest-admin&platform=apk
```

当前仓库已有 Android 项目是既有用户端/管理员打包链路，本阶段不修改 `android/**` 或 `flutter_app/**`，因此尚未生成独立投喂版 APK。下一步应基于 `apps/admin-ingest-android` 新建独立 Android WebView 工程，继续保持包名、App 名称和默认 URL 独立。
