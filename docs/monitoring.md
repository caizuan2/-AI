# 生产日志与监控

本文档说明 v1.0.0 的日志字段、监控重点和生产排障方式。

## 日志目标

生产日志用于回答四类问题：

- 哪个 API 请求出错了：通过 `requestId` 串联请求和错误。
- AI 调用是否慢或失败：记录模型、耗时和 token 估算。
- RAG 检索是否命中：记录候选数量、命中数量和相似度。
- 是否存在异常流量：结合 rate limit 日志和 Vercel Functions 日志观察。

日志默认输出为 JSON line，适合接入 Vercel Logs、Log Drains、Datadog、Axiom、Better Stack 或其他日志平台。

## API requestId

所有 `/api/*` 请求都会在 middleware 中生成或沿用请求头：

```text
x-request-id
```

响应头也会带上同一个 `x-request-id`，方便前端、浏览器 Network 面板和服务端日志关联。

API 请求日志示例：

```json
{
  "timestamp": "2026-06-02T00:00:00.000Z",
  "level": "info",
  "event": "api.request",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "method": "POST",
  "path": "/api/chat",
  "queryKeys": [],
  "hasForwardedFor": true
}
```

注意：日志只记录 query key，不记录 query value。

## API 错误日志

所有 `apiError` 会输出脱敏错误日志：

```json
{
  "timestamp": "2026-06-02T00:00:00.000Z",
  "level": "warn",
  "event": "api.error",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "error": {
    "errorName": "ValidationError",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "message": "请求参数不正确。"
  }
}
```

500 及以上错误使用 `error` 级别，4xx 使用 `warn` 级别。

## AI 调用日志

以下 OpenAI 调用会记录日志：

- embedding 生成
- 知识整理
- RAG 回答
- 知识补全建议

日志字段：

- `operation`：调用场景，例如 `knowledge_structurer`、`rag_answer`。
- `provider`：当前为 `openai`。
- `model`：实际返回模型或配置模型。
- `durationMs`：调用耗时。
- `estimatedInputTokens`：输入 token 估算。
- `estimatedOutputTokens`：输出 token 估算。
- `estimatedTotalTokens`：总 token 估算。
- `actualInputTokens` / `actualOutputTokens` / `actualTotalTokens`：如果 OpenAI 返回 usage，则记录实际 usage。

成功日志示例：

```json
{
  "timestamp": "2026-06-02T00:00:00.000Z",
  "level": "info",
  "event": "ai.call",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "operation": "rag_answer",
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "durationMs": 1280,
  "estimatedInputTokens": 1800,
  "estimatedOutputTokens": 260,
  "estimatedTotalTokens": 2060,
  "contextCount": 5
}
```

失败日志示例：

```json
{
  "timestamp": "2026-06-02T00:00:00.000Z",
  "level": "error",
  "event": "ai.call_failed",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "operation": "knowledge_structurer",
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "durationMs": 2400,
  "estimatedInputTokens": 1200,
  "error": {
    "errorName": "APIError"
  }
}
```

## RAG 检索日志

每次 `retrieveKnowledge` 都会记录：

- `mode`：`hybrid`、`vector` 或 `keyword`。
- `topK`：请求返回数量。
- `minSimilarity`：过滤阈值。
- `hitCount`：最终命中数量。
- `totalCandidates`：合并前后候选总数。
- `filteredCandidates`：通过相似度阈值的候选数。
- `vectorCandidateCount`：向量候选数量。
- `keywordCandidateCount`：关键词候选数量。
- `maxSimilarity`：最高相似度。
- `minResultSimilarity`：返回结果中的最低相似度。
- `avgSimilarity`：返回结果平均相似度。
- `insufficient`：结果是否不足。

示例：

```json
{
  "timestamp": "2026-06-02T00:00:00.000Z",
  "level": "info",
  "event": "rag.retrieval",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "mode": "hybrid",
  "topK": 5,
  "minSimilarity": 0.12,
  "hitCount": 4,
  "totalCandidates": 12,
  "filteredCandidates": 4,
  "maxSimilarity": 0.82,
  "avgSimilarity": 0.61,
  "insufficient": false
}
```

## 隐私与脱敏规则

`lib/logger.ts` 会自动清洗敏感字段。

不会记录：

- 用户投喂正文
- 用户问题原文
- RAG 回答全文
- chunkText
- summary
- sourceUrl
- email
- cookie
- authorization header
- password
- API key
- DATABASE_URL
- secret

错误日志只记录安全的错误类别、状态码和应用错误码。未知底层错误不会记录原始 message 或 stack，避免泄露数据库连接串、OpenAI key、用户内容或第三方响应细节。

## Vercel 查看方式

在 Vercel Dashboard：

1. 打开项目。
2. 进入 Logs。
3. 使用 `requestId`、`event`、`path`、`operation` 过滤日志。
4. 重点观察：
   - `api.error`
   - `ai.call_failed`
   - `api.rate_limited`
   - `rag.retrieval` 中 `insufficient=true`

如需长期保留和检索，建议配置 Log Drains 到 Axiom、Datadog、Better Stack 或其他日志平台。

## 管理后台

管理员可以访问：

```text
/admin
```

后台会调用 `/api/admin/overview` 展示：

- 用户数量
- 知识总数
- 今日 AI 调用次数
- 最近错误日志
- 系统健康状态

访问控制使用 `ADMIN_EMAILS` / `ADMIN_USER_IDS` 环境变量。页面会做服务端校验，API 也会再次执行管理员权限校验。最近错误日志来自当前运行实例的内存窗口，仅用于快速排障；生产长期留存仍应依赖 Vercel Logs 或外部日志平台。

## 建议监控指标

### API

- 5xx 错误率。
- 4xx 错误率。
- `/api/chat` P95/P99 延迟。
- `/api/ingest/analyze` P95/P99 延迟。
- `/api/knowledge` 创建失败率。
- `api.rate_limited` 次数。

### AI

- `ai.call_failed` 次数。
- 各 `operation` 平均耗时和 P95。
- `estimatedTotalTokens` 总量和单请求峰值。
- OpenAI actual usage，如果日志平台支持聚合。

### RAG

- `hitCount=0` 次数。
- `insufficient=true` 比例。
- `avgSimilarity` 长期下降趋势。
- `mode=keyword` 占比异常升高，可能意味着 embedding 生成失败或 pgvector 查询异常。

### 后台任务

- Vercel Cron 是否按时触发。
- `/api/jobs/check-stale` 是否返回 200。
- `/api/jobs/refresh-suggestions` 是否返回 200。
- `/api/jobs/cleanup-orphans` 是否返回 200。

## 建议告警

- 5 分钟内出现连续 5 次 `ai.call_failed`。
- 10 分钟内 `/api/chat` 5xx 错误率超过 2%。
- 10 分钟内 `rag.retrieval` 的 `hitCount=0` 比例超过 50%。
- Vercel Cron 连续两次失败。
- OpenAI usage 或账单接近预算上限。

## 排障流程

1. 从前端报错或浏览器 Network 面板复制 `x-request-id`。
2. 在 Vercel Logs 搜索该 requestId。
3. 查看同一 requestId 下的 `api.request`、`rag.retrieval`、`ai.call` 或 `api.error`。
4. 如果是 AI 问题，检查 `operation`、`model`、`durationMs` 和 token 估算。
5. 如果是 RAG 问题，检查 `hitCount`、`filteredCandidates`、`avgSimilarity` 和 `mode`。
6. 如果是权限或数据问题，检查 API status code，但不要把用户正文复制到日志系统。
