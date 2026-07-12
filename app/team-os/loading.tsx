export default function TeamOsLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6" aria-label="AI Team OS 加载中">
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="h-64 rounded-xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-44 rounded-xl bg-slate-200" />)}
      </div>
    </div>
  );
}
