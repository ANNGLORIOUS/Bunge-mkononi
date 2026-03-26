export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="surface-card p-6">
        <div className="skeleton-line h-3 w-32" />
        <div className="mt-4 skeleton-line h-10 w-3/4" />
        <div className="mt-3 skeleton-line h-4 w-full" />
        <div className="mt-2 skeleton-line h-4 w-5/6" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="surface-panel p-4">
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
