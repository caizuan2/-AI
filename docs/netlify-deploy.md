# Netlify 正式部署指南

本文档用于把当前 AI 知识库 APP 部署到 Netlify + Supabase。

## 1. Netlify 控制台配置

进入：

```text
Netlify Dashboard -> Add new project -> Import an existing project
```

选择当前 Git 仓库后，在构建配置中填写：

```text
Framework preset:
Next.js

Base directory / Root directory:
.

Build command:
pnpm prisma:generate && pnpm build

Publish directory:
.next

Functions directory:
netlify/functions

Node version:
20
```

项目根目录已提供 [netlify.toml](../netlify.toml)，Netlify 会优先读取其中的配置：

```toml
[build]
command = "pnpm prisma:generate && pnpm build"
publish = ".next"

[build.environment]
NODE_VERSION = "20"
PNPM_VERSION = "11.3.0"

[functions]
directory = "netlify/functions"
node_bundler = "esbuild"
included_files = ["prisma/**"]
```

## 2. 生产环境变量

进入：

```text
Netlify Dashboard -> Site configuration -> Environment variables
```

按照 [Netlify 环境变量说明](./netlify-env.md) 填写所有变量。

## 3. Supabase 配置

进入 Supabase SQL Editor：

```text
Supabase Dashboard -> 你的项目 -> SQL Editor -> New query
```

启用 pgvector：

```sql
create extension if not exists vector;
```

进入 Auth URL 配置：

```text
Supabase Dashboard -> Authentication -> URL Configuration
```

填写：

```text
Site URL:
https://你的-netlify-site.netlify.app

Redirect URLs:
https://你的-netlify-site.netlify.app/**
http://localhost:3000/**
```

## 4. 本地预检查

在项目根目录执行：

```powershell
cd D:\XT

corepack enable
corepack prepare pnpm@11.3.0 --activate

pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm lint
pnpm typecheck
pnpm test:security
pnpm build
```

## 5. 数据库迁移

生产数据库迁移不要放进 Netlify build command。部署前在本机或 CI 手动执行：

```powershell
cd D:\XT

$env:DATABASE_URL="你的 Supabase PostgreSQL 生产连接串"

pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
```

看到下面结果后再部署：

```text
Database schema is up to date!
```

## 6. Git 部署

确认环境变量和迁移完成后，推送生产分支：

```powershell
cd D:\XT

git add .
git commit -m "chore: prepare netlify deployment"
git push origin main
```

Netlify 会自动构建并发布。

## 7. Netlify CLI 部署

也可以使用 CLI：

```powershell
cd D:\XT

pnpm --package=netlify-cli dlx netlify login
pnpm --package=netlify-cli dlx netlify init
pnpm --package=netlify-cli dlx netlify build
pnpm --package=netlify-cli dlx netlify deploy --build
pnpm --package=netlify-cli dlx netlify deploy --build --prod
```

`netlify build` 需要先完成 `netlify init` 或 `netlify link`，否则 CLI 无法找到站点 ID。

## 8. 定时任务

项目使用 Netlify Scheduled Functions。详见 [Netlify Cron 说明](./netlify-cron.md)。

## 9. 上线测试

部署完成后访问：

```text
https://你的-netlify-site.netlify.app
```

按顺序测试：

1. 打开首页。
2. 注册账号。
3. 登录账号。
4. 访问 `/ingest`。
5. 输入测试知识并执行 AI 分析。
6. 点击确认入库。
7. 访问 `/knowledge`，确认知识存在。
8. 访问 `/chat`，基于知识库提问。
9. 确认回答包含引用来源。
10. 测试 `/upload` 上传小于 4MB 的文件。
11. 测试 `/settings` 导入导出。
12. 用管理员账号访问 `/admin` 和 `/admin/analytics`。

