import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function fmt(value: string): string {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Party = {
  id: string;
  title: string;
  visibility: "public" | "private";
  starts_at: string;
};

export default async function MyPartiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("parties")
    .select("id, title, visibility, starts_at")
    .eq("host_id", user.id)
    .order("starts_at", { ascending: true });

  const parties = (data ?? []) as Party[];

  return (
    <main className="flex flex-1 flex-col px-5 py-5 pb-28">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Mine fester
        </h1>
        <Link
          href="/parties/new"
          className="rounded-full bg-[#FCBE4F] px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-[#fdca6b]"
        >
          + Opret fest
        </Link>
      </div>

      <ul className="mt-5 space-y-2">
        {parties.map((p) => (
          <li key={p.id}>
            <Link
              href={`/parties/${p.id}`}
              className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-white/[0.07]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {p.title}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      p.visibility === "public"
                        ? "bg-amber-400/15 text-amber-300"
                        : "bg-zinc-500/20 text-zinc-300"
                    }`}
                  >
                    {p.visibility === "public" ? "Offentlig" : "Privat"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Starter {fmt(p.starts_at)}
                </p>
              </div>
              <span className="shrink-0 text-zinc-400">→</span>
            </Link>
          </li>
        ))}
        {parties.length === 0 ? (
          <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
            Du er ikke vært for nogen fester endnu.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
