# 跨平台客户端打包说明

当前项目是 Next.js App Router Web 应用，后端 API Routes、Prisma、Supabase、OpenAI、Netlify Functions 都已经围绕 Web 运行时设计。为了不推翻现有架构，四端发布建议采用“托管 Web 应用 + 原生外壳”的最小改造方案。

## 推荐策略

- Android APK / iOS IPA：使用 Capacitor 包装线上 Web 应用。
- macOS DMG / Windows EXE 或 MSIX：使用 Tauri 或 Electron 包装线上 Web 应用。
- 服务端能力继续部署在 Netlify + Supabase，不在移动端或桌面端内置数据库、Prisma 或 OpenAI key。

这样可以保持同一套 UI、路由、API 调用和用户数据隔离，同时减少四端维护成本。

## Android / iOS

建议使用 Capacitor。它适合把现有 Web 产品封装为移动端 App，并由 Android Studio / Xcode 输出安装包。

```bash
pnpm add @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
pnpm exec cap init "AI 知识库" "com.aikb.app"
pnpm exec cap add android
pnpm exec cap add ios
```

在 `capacitor.config.ts` 中把 `server.url` 指向生产站点：

```ts
const config = {
  appId: "com.aikb.app",
  appName: "AI 知识库",
  webDir: ".next",
  server: {
    url: "https://stately-sawine-1efd4d.netlify.app",
    cleartext: false
  }
};

export default config;
```

构建 Android：

```bash
pnpm exec cap open android
```

在 Android Studio 中执行签名配置并生成 APK 或 AAB。

构建 iOS：

```bash
pnpm exec cap open ios
```

在 Xcode 中配置 Team、Bundle ID 和签名，然后 Archive 输出 IPA。

## macOS / Windows

建议优先使用 Tauri，因为安装包体积更小。桌面端继续访问线上 Netlify 应用，不在本地启动 Next.js 服务。

```bash
pnpm add -D @tauri-apps/cli
pnpm exec tauri init
```

在 Tauri 配置中把窗口首页指向生产站点：

```json
{
  "build": {
    "frontendDist": "../.next",
    "devUrl": "http://localhost:3000"
  },
  "app": {
    "windows": [
      {
        "title": "AI 知识库",
        "url": "https://stately-sawine-1efd4d.netlify.app"
      }
    ]
  }
}
```

构建桌面包：

```bash
pnpm exec tauri build
```

输出格式由 Tauri bundler 和目标系统决定：

- macOS：DMG
- Windows：EXE / MSI，可进一步配置 MSIX

## 什么时候需要更大改造

如果未来需要离线使用、端侧向量库、本地文件永久索引、系统托盘常驻、桌面端后台同步等能力，需要单独设计本地运行时。那会涉及本地数据库、同步协议、密钥托管和离线冲突处理，不建议在当前 MVP 阶段引入。

## 上线前检查

- 生产站点 `/api/health?database=true&schema=true&ai=true&vector=true` 返回 `ok=true`。
- 移动端登录、卡密激活、投喂、问答、引用跳转都能正常工作。
- 不把 `OPENAI_API_KEY`、`QWEN_API_KEY`、`DEEPSEEK_API_KEY`、`DATABASE_URL` 写入客户端配置。
- Capacitor / Tauri 只保存公开站点 URL 和非敏感应用配置。
- iOS、Android、macOS、Windows 分别完成真实设备 smoke test。
