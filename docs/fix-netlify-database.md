# 修复 Netlify `database:false`

线上 `/api/health` 如果返回：

```json
{
  "status": "ok",
  "database": false,
  "openai": true,
  "auth": true,
  "license": true
}
```

说明登录 session 配置和 OpenAI 已配置，但 Netlify 的 PostgreSQL 连接不可用，或生产数据库还没有应用最新 migration。

## 1. 不要使用 localhost

Netlify 生产环境不能使用：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_knowledge_base?schema=public"
```

`localhost` 在 Netlify Function 里指向 Netlify 自己的运行容器，不是你的电脑，也不是 Supabase。

## 2. 获取 Supabase 数据库连接串

进入：

```text
Supabase Dashboard -> Project Settings -> Database -> Connection string
```

复制两条连接串：

- Pooler URI：给 Netlify Functions 运行时使用，填写到 `DATABASE_URL`。
- Direct URI：给 Prisma CLI 迁移使用，填写到 `DIRECT_URL`。

不要只把 `db.xxx.supabase.co:5432` 改成 `6543`。Supabase Pooler 的 host、用户名格式和参数通常都不同，必须复制完整 Pooler URI，然后把 `[YOUR-PASSWORD]` 替换为数据库密码。

如果密码包含 `@`、`#`、`:`、`/`、空格等字符，需要先做 URL encode。

示例格式：

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20&schema=public"
DIRECT_URL="postgresql://postgres:your-url-encoded-db-password@db.your-project-ref.supabase.co:5432/postgres?schema=public"
```

## 3. 填入 Netlify

进入：

```text
Netlify Dashboard -> Site configuration -> Environment variables
```

添加或更新：

```env
DATABASE_URL="你的 Supabase PostgreSQL URI"
DIRECT_URL="你的 Supabase Direct URI"
```

确认不要填本地地址、不要保留 `[YOUR-PASSWORD]`，也不要把引号内换行。`DATABASE_URL` 必须是 Pooler URI；`DIRECT_URL` 必须是 Direct URI。

项目运行时只读取 `DATABASE_URL`。Prisma CLI 迁移会读取 `DIRECT_URL`。请不要只填写 `POSTGRES_URL`、`POSTGRES_PRISMA_URL`、`SUPABASE_DATABASE_URL` 或其他别名。

## 4. 启用 pgvector

进入 Supabase SQL Editor 执行：

```sql
create extension if not exists vector;
```

## 5. 执行 Prisma 迁移

在本机 PowerShell 执行：

```powershell
cd D:\XT
$env:DATABASE_URL="你的 Supabase PostgreSQL URI"
$env:DIRECT_URL="你的 Supabase Direct URI"
pnpm prisma:migrate:deploy
pnpm db:check
```

`pnpm db:check` 应输出：

```text
Database connection: ok
pgvector extension: enabled
users table: exists
sessions table: exists
license_keys table: exists
knowledge_chunks table: exists
```

## 6. 重新部署 Netlify

修改环境变量后，在 Netlify 点：

```text
Deploys -> Trigger deploy -> Clear cache and deploy site
```

部署完成后打开：

```text
https://stately-sawine-1efd4d.netlify.app/api/health
```

目标结果：

```json
{
  "status": "ok",
  "database": true,
  "openai": true,
  "auth": true,
  "license": true
}
```
