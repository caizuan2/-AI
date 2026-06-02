# 生产环境变量

Netlify 生产环境需要在控制台填写以下变量。

## 必填变量

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
SESSION_SECRET="use-a-long-random-session-secret"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
CRON_SECRET="use-a-long-random-secret"
JOBS_TIMEZONE="Asia/Shanghai"
ADMIN_PHONES="+8613812345678"
ADMIN_USER_IDS=""
NODE_ENV="production"
NODE_VERSION="22"
```

## 管理员配置

管理员可以通过两种方式配置，至少填写一种：

```text
ADMIN_PHONES
ADMIN_USER_IDS
```

手机号必须使用 E.164 格式，例如 `+8613812345678`。

## 敏感变量

不要把真实密钥提交到 Git：

```text
DATABASE_URL
SESSION_SECRET
OPENAI_API_KEY
CRON_SECRET
```
