# Netlify 正式部署指南

本文档用于把当前 AI 知识库 APP 部署到 Netlify，并使用 Supabase PostgreSQL 作为数据库。

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
22
```

项目根目录已提供 [netlify.toml](../netlify.toml)，Netlify 会优先读取其中的配置：

```toml
[build]
command = "pnpm prisma:generate && pnpm build"
publish = ".next"

[build.environment]
NODE_VERSION = "22"
PNPM_VERSION = "10.12.4"

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

## 3. 数据库配置

进入 Supabase SQL Editor：

```text
Supabase Dashboard -> 你的项目 -> SQL Editor -> New query
```

启用 pgvector：

```sql
create extension if not exists vector;
```

当前认证使用手机号 + 密码 + HttpOnly Cookie，卡密激活后才能访问核心功能。

## 4. 本地预检查

在项目根目录执行：

```powershell
cd D:\XT

corepack enable
corepack prepare pnpm@10.12.4 --activate

pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm lint
pnpm typecheck
pnpm test:security
pnpm build
```

## 5. 数据库迁移

不要把 `pnpm prisma:migrate:deploy` 放进 Netlify build command。Supabase Direct connection 可能依赖 IPv6，Netlify build 阶段可能连不上。生产数据库迁移应在本机、CI、或 Supabase SQL Editor 单独执行：

```powershell
cd D:\XT

$env:DATABASE_URL="你的 Supabase Pooler 完整 URI，端口 6543，包含 pgbouncer=true"
$env:DIRECT_URL="你的 Supabase Direct 完整 URI，端口 5432"

pnpm prisma:migrate:deploy
pnpm exec prisma migrate status
pnpm db:check
```

`DATABASE_URL` 供 Prisma Client 运行时使用，Netlify Functions 必须填 Pooler URI；`DIRECT_URL` 供 Prisma CLI 迁移使用，必须填 Direct URI。不要只修改端口，务必从 Supabase Dashboard 复制对应类型的完整连接串。

看到下面结果后再部署：

```text
Database schema is up to date!
```

如果部署后 `/api/health` 返回 `database:false`，不要继续测试投喂和问答，先按 [Netlify 数据库修复指南](./fix-netlify-database.md) 修复生产数据库连接。

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
3. 使用卡密激活账号。
4. 登录账号。
5. 访问 `/ingest`。
6. 输入测试知识并执行 AI 分析。
7. 点击确认入库。
8. 访问 `/knowledge`，确认知识存在。
9. 访问 `/chat`，基于知识库提问。
10. 确认回答包含引用来源。
11. 测试 `/upload` 上传小于 4MB 的文件。
12. 测试 `/settings` 导入导出。
13. 用管理员账号访问 `/admin` 和 `/admin/analytics`。
