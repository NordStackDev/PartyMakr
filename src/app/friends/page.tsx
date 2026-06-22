import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import {
  acceptFriendRequest,
  declineFriendRequest,
  cancelRequest,
  removeFriend,
} from "@/lib/friends/actions";
import { FindFriends } from "@/components/friends/find-friends";
import { Avatar } from "@/components/friends/avatar";

type Friendship = {
  requester_id: string;
  addressee_id: string;
  status: string;
};
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export default async function FriendsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: links } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const rows = (links ?? []) as Friendship[];
  const otherId = (r: Friendship) =>
    r.requester_id === user.id ? r.addressee_id : r.requester_id;

  const ids = [...new Set(rows.map(otherId))];
  const profiles = new Map<string, Profile>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", ids);
    for (const p of (data ?? []) as Profile[]) profiles.set(p.id, p);
  }

  const incoming = rows
    .filter((r) => r.status === "pending" && r.addressee_id === user.id)
    .map((r) => r.requester_id);
  const outgoing = rows
    .filter((r) => r.status === "pending" && r.requester_id === user.id)
    .map((r) => r.addressee_id);
  const friends = rows.filter((r) => r.status === "accepted").map(otherId);

  function Person({ id }: { id: string }) {
    const p = profiles.get(id);
    const name = p?.display_name || p?.username || "Bruger";
    return (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar url={p?.avatar_url ?? null} name={name} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{name}</p>
          {p?.username ? (
            <p className="truncate text-xs text-zinc-400">@{p.username}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const ghost =
    "shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5";
  const empty = rows.length === 0;

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <h1 className="text-xl font-semibold tracking-tight text-white">Venner</h1>

      <div className="mt-4">
        <FindFriends />
      </div>

      {incoming.length > 0 ? (
        <section className="mt-6">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Venneanmodninger
          </h2>
          <ul className="mt-2 space-y-2">
            {incoming.map((id) => (
              <li
                key={id}
                className="glass-card flex items-center gap-2 rounded-2xl p-3"
              >
                <Person id={id} />
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <form action={acceptFriendRequest.bind(null, id)}>
                    <button
                      type="submit"
                      className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-zinc-950 transition active:brightness-95"
                    >
                      Acceptér
                    </button>
                  </form>
                  <form action={declineFriendRequest.bind(null, id)}>
                    <button type="submit" className={ghost}>
                      Afvis
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Dine venner{friends.length > 0 ? ` · ${friends.length}` : ""}
        </h2>
        <ul className="mt-2 space-y-2">
          {friends.map((id) => (
            <li
              key={id}
              className="glass-card flex items-center gap-2 rounded-2xl p-3"
            >
              <Person id={id} />
              <form
                action={removeFriend.bind(null, id)}
                className="ml-auto shrink-0"
              >
                <button type="submit" className={ghost}>
                  Fjern
                </button>
              </form>
            </li>
          ))}
          {friends.length === 0 ? (
            <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
              {empty
                ? "Du har ingen venner endnu. Søg efter folk ovenfor for at tilføje dem."
                : "Ingen venner endnu."}
            </li>
          ) : null}
        </ul>
      </section>

      {outgoing.length > 0 ? (
        <section className="mt-6">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Sendt
          </h2>
          <ul className="mt-2 space-y-2">
            {outgoing.map((id) => (
              <li
                key={id}
                className="glass-card flex items-center gap-2 rounded-2xl p-3"
              >
                <Person id={id} />
                <form
                  action={cancelRequest.bind(null, id)}
                  className="ml-auto shrink-0"
                >
                  <button type="submit" className={ghost}>
                    Annullér
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
