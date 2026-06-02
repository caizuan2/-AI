# Netlify Cron 与后台任务

当前项目的后台任务使用 Netlify Scheduled Functions。

## 1. 函数目录

```text
netlify/functions/check-stale.ts
netlify/functions/refresh-suggestions.ts
netlify/functions/cleanup-orphans.ts
```

Netlify 会根据 `netlify.toml` 中的配置加载函数目录：

```toml
[functions]
directory = "netlify/functions"
node_bundler = "esbuild"
included_files = ["prisma/**"]
```

## 2. 定时计划

当前计划如下：

```text
check-stale:
0 18 * * *

refresh-suggestions:
15 19 * * *

cleanup-orphans:
0 20 * * *
```

Netlify Scheduled Functions 的 cron 使用 UTC。

## 3. 任务说明

- `check-stale`：检查过期知识，把到期知识标记为 stale。
- `refresh-suggestions`：为低质量知识刷新 AI 补全建议。
- `cleanup-orphans`：清理没有关联 KnowledgeItem 的孤立 chunks。

## 4. HTTP Job 接口

项目也保留 HTTP Job 接口：

```text
GET /api/jobs/check-stale
GET /api/jobs/refresh-suggestions
GET /api/jobs/cleanup-orphans
```

手动触发时必须带：

```text
Authorization: Bearer <CRON_SECRET>
```

未配置或 secret 错误时，接口会返回 401。

## 5. Netlify 后台查看

进入：

```text
Netlify Dashboard -> 你的站点 -> Functions
```

可查看函数执行日志。

## 6. 调整时间

如需改为中国时间凌晨执行，需要换算成 UTC 后修改函数里的 `schedule`。

例如中国时间 02:00 等于 UTC 前一天 18:00：

```ts
export const config = {
  schedule: "0 18 * * *"
};
```

