# Worktree 2 QA Rules

## Worktree 2 完成任务前强制自测门禁

任何 Worktree 2 任务完成前，必须通过 UI 健康检查。只要出现原生 HTML、CSS 404、Tailwind 未生效、login/register/activate 样式丢失、admin-ingest 样式丢失，一律不允许在最终回复里写“完成”。

## 固定原因与处理原则

Worktree 2 的本地 dev server 和 `next build` 共用 `.next` 目录。边开 `npm run dev -- -p 3021` 边执行 `npm run build` 后，`.next` 可能被生产构建重写，旧 dev 进程继续返回页面，但 CSS 资源会 404 或样式失效，页面就会退化成浏览器原生 HTML。

因此：任何 build 后的页面验收，都必须重新启动 Worktree 2 dev server，并重新跑 UI 健康检查。

## 必须执行的顺序

1. 确认当前路径是 Worktree 2：

   `C:\Users\PC\.codex\worktrees\7927\XT`

   如果任务文本写成 `C:\Users\PC.codex\worktrees\7927\XT`，以本机真实存在的 `.codex` 路径为准。

2. 常规验证：

   ```powershell
   npm run typecheck
   npm run lint
   npm run build
   git diff --check
   ```

3. 如果 `npm run build` 修改了 `public/releases/latest.json`，恢复该生成物后再次执行：

   ```powershell
   git restore -- public/releases/latest.json
   git diff --check
   ```

4. 重新启动本地 dev server。启动脚本必须：

   - 停止 3021 旧进程。
   - 不使用 `$pid` 变量，必须使用 `$ownerPid`。
   - 清理 `.next`。
   - 清理 `node_modules/.cache`。
   - 启动 `npm run dev -- -p 3021`。

   推荐命令：

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/start-worktree2-admin-ingest-dev.ps1
   ```

5. 执行 UI 健康检查：

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/check-worktree2-admin-ingest-ui.ps1
   ```

## UI 健康检查必须输出

每次完成 Worktree 2 任务前，最终报告必须包含：

- login 状态码
- register 状态码
- activate 状态码
- admin-ingest 状态码
- CSS 文件数量
- CSS 是否全部 200
- CSS 是否包含 Tailwind 特征
- 是否疑似原生 HTML
- 浏览器 computed style 检查结论，如可用

## UI 健康检查必须覆盖

HTTP 状态：

- `http://localhost:3021/ingest/login?app=ingest-admin&next=/admin-ingest` 必须 200。
- `http://localhost:3021/ingest/register?app=ingest-admin&next=/ingest/activate` 必须 200。
- `http://localhost:3021/ingest/activate?app=ingest-admin&next=/admin-ingest` 必须 200。
- `http://localhost:3021/admin-ingest?app=ingest-admin&platform=web` 未登录 307 可接受；登录后 200 需人工验收。

CSS 检查：

- 必须解析页面 HTML 中所有 CSS link。
- 每个 CSS URL 都必须返回 200。
- CSS 内容不能为空。
- 至少一个 CSS 文件必须包含 Tailwind 相关特征，例如 `--tw-`、`.flex`、`.rounded`、`.bg-`、`.text-`。

原生 HTML 检查：

- 页面不能只有原生 button/input。
- 页面必须有大量 Tailwind class。
- login/register/activate 必须包含 SaaS auth wrapper。
- 如果按钮存在但缺少 class，判定失败。
- 如果页面缺少 rounded/flex/bg/text/shadow/grid 等 Tailwind 风格特征，判定失败。

浏览器级检查：

- 如果本机可用 Edge/Chrome，脚本必须通过 headless browser 读取 computed style。
- 至少检查登录卡片圆角、按钮圆角、输入框圆角、class 数量。
- 如果浏览器检查不可用，报告必须明确写出：未能进行真实浏览器 computed style 检查，仅完成 HTTP/CSS/HTML 结构检查。

## 人工验收地址

登录页：

`http://localhost:3021/ingest/login?app=ingest-admin&next=/admin-ingest`

注册页：

`http://localhost:3021/ingest/register?app=ingest-admin&next=/ingest/activate`

激活页：

`http://localhost:3021/ingest/activate?app=ingest-admin&next=/admin-ingest`

投喂端：

`http://localhost:3021/admin-ingest?app=ingest-admin&platform=web`

## 最终回复要求

最终回复必须写明：

- 是否修复当前页面原生 HTML。
- 是否升级启动脚本。
- 是否升级 UI 健康检查脚本。
- 是否更新本 QA 文档。
- login/register/activate/admin-ingest 状态码。
- CSS 文件数量与状态。
- CSS 是否包含 Tailwind。
- 是否疑似原生 HTML。
- 是否有浏览器级检查。
- typecheck/lint/build/diff-check 是否通过。
- 是否未修改 Prisma/DB/权限/provider/RAG/知识工厂核心。
