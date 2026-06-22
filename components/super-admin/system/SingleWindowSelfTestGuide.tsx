export function SingleWindowSelfTestGuide() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">单窗口自测方式</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        不再一次性打开多个浏览器窗口。只打开超级管理员首页，再通过左侧菜单逐项进入检查页面。
      </p>
      <div className="mt-5 rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100">
        <pre className="whitespace-pre-wrap break-words">{`cd "C:\\Users\\PC\\.codex\\worktrees\\9ef0\\XT"
npm run dev

$base="http://localhost:3000"
Start-Process "$base/super-admin"`}</pre>
      </div>
      <ol className="mt-5 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-2 xl:grid-cols-5">
        {["三端同步", "设备会话", "平台版本", "环境连通性检查", "系统健康状态"].map((item, index) => (
          <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="font-semibold text-slate-950">{index + 1}. </span>
            {item}
          </li>
        ))}
      </ol>
    </section>
  );
}
