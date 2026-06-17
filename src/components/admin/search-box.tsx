/**
 * Native GET search form. Submitting reloads the page with `?q=…` (and drops
 * `page`, so results start at page 1). No client JS required.
 */
export function SearchBox({
  placeholder = "Søg…",
  defaultValue = "",
}: {
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <form method="get" className="flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="auth-input mt-0 flex-1"
      />
      <button
        type="submit"
        className="rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
      >
        Søg
      </button>
    </form>
  );
}
