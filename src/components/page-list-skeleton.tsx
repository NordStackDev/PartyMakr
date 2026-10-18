export function PageListSkeleton({
  showSearch = false,
  rows = 5,
}: {
  showSearch?: boolean;
  rows?: number;
}) {
  return (
    <main
      className="pb-nav flex flex-1 flex-col px-5 py-5"
      aria-busy="true"
      aria-label="Indlæser siden"
    >
      <div className="h-7 w-36 rounded-lg bg-white/10 motion-safe:animate-pulse" />
      {showSearch ? (
        <div className="mt-5 h-11 rounded-full bg-white/10 motion-safe:animate-pulse" />
      ) : null}
      <div className="mt-5 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="glass-card flex items-center gap-3 rounded-2xl p-3 motion-safe:animate-pulse"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-white/10" />
              <div className="h-2.5 w-1/2 rounded bg-white/[0.07]" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Indlæser…</span>
    </main>
  );
}
