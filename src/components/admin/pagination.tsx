import Link from "next/link";

export const PAGE_SIZE = 25;

/**
 * Link-based pagination. Preserves the other query params (e.g. search/filter)
 * and sets `page`. Renders nothing when there's a single page.
 */
export function Pagination({
  basePath,
  page,
  pageCount,
  query = {},
}: {
  basePath: string;
  page: number;
  pageCount: number;
  query?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v) sp.set(k, v);
    }
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };

  const linkClass =
    "inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-zinc-200 transition hover:bg-white/5";

  return (
    <div className="flex items-center justify-between pt-2 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          ← Forrige
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-zinc-400">
        Side {page} af {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass}>
          Næste →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
