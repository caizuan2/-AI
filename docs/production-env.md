# 生产环境变量

Netlify 生产环境需要在控制台填写以下变量。

## 必填变量

```env
DATABASE_URL="postgresql://postgres.your-project-ref:your-url-encoded-db-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20&schema=public"
DIRECT_URL="postgresql://postgres:your-url-encoded-db-password@db.your-project-ref.supabase.co:5432/postgres?schema=public"
SESSION_SECRET="use-a-long-random-session-secret"
QWEN_API_KEY="sk-your-qwen-api-key"
QWEN_MODEL="qwen-plus"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
DEEPSEEK_API_KEY=""
DEEPSEEK_MODEL="deepseek-chat"
AI_PROVIDER="qwen"
AI_FALLBACK_PROVIDER="openai"
AI_SECONDARY_FALLBACK_PROVIDER="deepseek"
LLM_PROVIDER=""
LLM_MODEL=""
EMBEDDING_PROVIDER="openai"
EMBEDDING_MODEL=""
RAG_TOP_K="10"
RAG_MIN_SCORE="0.35"
RAG_MAX_CONTEXT_CHUNKS="12"
RAG_ENABLE_RERANK="true"
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
DIRECT_URL
SESSION_SECRET
QWEN_API_KEY
OPENAI_API_KEY
DEEPSEEK_API_KEY
CRON_SECRET
```
