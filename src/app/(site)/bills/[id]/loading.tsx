export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden border border-[var(--line-strong)] bg-white">
        <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
        <div className="p-6">
          <div className="skeleton-line h-3 w-32" />
          <div className="mt-4 skeleton-line h-10 w-3/4" />
          <div className="mt-3 skeleton-line h-4 w-full" />
          <div className="mt-2 skeleton-line h-4 w-5/6" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={`border p-4 ${
              index === 0
                ? 'border-slate-950 bg-slate-950'
                : index === 1
                  ? 'border-slate-300 bg-white'
                  : index === 2
                    ? 'border-[#8c1d18] bg-[#b32018]'
                    : 'border-forest-900 bg-forest-900'
            }`}
          >
            <div className="skeleton-line h-3 w-24" />
            <div className="mt-4 skeleton-line h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        <div className="space-y-6">
          <div className="surface-card skeleton-line h-80" />
          <div className="surface-card skeleton-line h-96" />
        </div>
        <div className="space-y-6">
          <div className="surface-card skeleton-line h-72" />
          <div className="surface-card skeleton-line h-72" />
        </div>
      </div>
    </div>
  );
}
