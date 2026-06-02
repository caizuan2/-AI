# 修复 Netlify `database:false`

线上 `/api/health` 如果返回：

```json
{
  "status": "ok",
  "database": false,
  "openai": true,
  "supabase": true
}
```

说明 Supabase Auth 和 OpenAI 已配置，但 Netlify 的 PostgreSQL 连接不可用。

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

复制 PostgreSQL URI。Serverless 部署建议使用 Supabase pooler 连接串，然后把 `[YOUR-PASSWORD]` 替换为数据库密码。

如果密码包含 `@`、`#`、`:`、`/`、空格等字符，需要先做 URL encode。

示例格式：

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
```

也可以使用 Supabase 提供的 direct connection URI，但在 serverless 环境更容易耗尽连接数。

## 3. 填入 Netlify

进入：

```text
Netlify Dashboard -> Site configuration -> Environment variables
```

添加或更新：

```env
DATABASE_URL="你的 Supabase PostgreSQL URI"
```

确认不要填本地地址、不要保留 `[YOUR-PASSWORD]`，也不要把引号内换行。

项目运行时也会识别以下常见别名，但推荐统一使用 `DATABASE_URL`：

```text
POSTGRES_PRISMA_URL
POSTGRES_URL
SUPABASE_DATABASE_URL
SUPABASE_DB_URL
```

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
pnpm prisma:migrate:deploy
pnpm db:check
```

`pnpm db:check` 应输出：

```text
Database connection: ok
pgvector extension: enabled
users table: exists
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
  "supabase": true
}
```
