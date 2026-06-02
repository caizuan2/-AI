# Netlify 环境变量配置

本文档列出 Netlify 部署当前项目需要填写的全部环境变量。

## 1. 填写位置

进入：

```text
Netlify Dashboard -> 你的站点 -> Site configuration -> Environment variables
```

建议只在 Production 环境填写生产数据库和生产密钥。

## 2. 完整变量列表

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_CHAT_INPUT_COST_PER_1M="0.40"
OPENAI_CHAT_OUTPUT_COST_PER_1M="1.60"
OPENAI_EMBEDDING_COST_PER_1M="0.02"
JOBS_TIMEZONE="Asia/Shanghai"
CRON_SECRET="use-a-long-random-secret"
ADMIN_EMAILS="admin@example.com"
ADMIN_USER_IDS=""
```

## 3. 变量说明

- `DATABASE_URL`：Supabase PostgreSQL 生产连接串，必须是生产库，不要使用本地地址。
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase Project URL。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase anon key。
- `OPENAI_API_KEY`：真实 OpenAI API key，生产环境必须配置。
- `OPENAI_MODEL`：知识整理和 RAG 问答模型，建议 `gpt-4.1-mini`。
- `OPENAI_EMBEDDING_MODEL`：embedding 模型，建议 `text-embedding-3-small`。
- `OPENAI_CHAT_INPUT_COST_PER_1M`：输入 token 成本估算。
- `OPENAI_CHAT_OUTPUT_COST_PER_1M`：输出 token 成本估算。
- `OPENAI_EMBEDDING_COST_PER_1M`：embedding token 成本估算。
- `JOBS_TIMEZONE`：后台任务日志和本地 worker 使用的时区，建议 `Asia/Shanghai`。
- `CRON_SECRET`：保护 HTTP Job 接口的随机密钥。
- `ADMIN_EMAILS`：管理员邮箱，多个邮箱用英文逗号分隔。
- `ADMIN_USER_IDS`：管理员 Supabase user id，多个 ID 用英文逗号分隔。

## 4. 敏感变量

以下变量必须作为敏感配置管理，不要提交到代码仓库：

```text
DATABASE_URL
OPENAI_API_KEY
CRON_SECRET
```

## 5. 本地与生产区别

本地开发使用：

```text
.env
```

Netlify 生产环境使用：

```text
Netlify Dashboard -> Site configuration -> Environment variables
```

本地可以使用 mock fallback；生产环境必须配置真实 `OPENAI_API_KEY`，否则 AI 分析、embedding、RAG 问答会拒绝降级。

## 6. 配置检查

部署前确认：

- `DATABASE_URL` 可以连接 Supabase 生产数据库。
- Supabase Auth 的 Site URL 指向 Netlify 生产域名。
- `OPENAI_API_KEY` 具备调用 chat model 和 embedding model 的权限。
- `CRON_SECRET` 是随机长字符串。
- `ADMIN_EMAILS` 包含至少一个可登录的管理员邮箱。

