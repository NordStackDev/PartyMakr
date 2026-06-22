import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelRequest,
  removeFriend,
} from "@/lib/friends/actions";
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

  const profiles = new Map<string, Profile>();

  // Everyone else with an account — the directory to browse + add from.
  const { data: everyone } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .neq("id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  for (const p of (everyone ?? []) as Profile[]) profiles.set(p.id, p);

  const incoming = rows
    .filter((r) => r.status === "pending" && r.addressee_id === user.id)
    .map((r) => r.requester_id);
  const outgoing = rows
    .filter((r) => r.status === "pending" && r.requester_id === user.id)
    .map((r) => r.addressee_id);
  const friends = rows.filter((r) => r.status === "accepted").map(otherId);

  // The directory excludes people already surfaced in the sections above.
  const connected = new Set<string>([...friends, ...incoming, ...outgoing]);
  const others = ((everyone ?? []) as Profile[])
    .map((p) => p.id)
    .filter((id) => !connected.has(id));

  function Person({ id }: { id: string }) {
    const p = profiles.get(id);
    const name = p?.username
      ? `@${p.username}`
      : p?.display_name || "Bruger uden navn";
    return (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar url={p?.avatar_url ?? null} name={p?.username} size={40} />
        <p className="min-w-0 truncate text-sm font-medium text-white">{name}</p>
      </div>
    );
  }

  const ghost =
    "shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5";
  const empty = rows.length === 0;

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <h1 className="text-xl font-semibold tracking-tight text-white">Venner</h1>

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
                ? "Du har ingen venner endnu. Tilføj folk fra listen nedenfor."
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

      <section className="mt-6">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Alle brugere
        </h2>
        <ul className="mt-2 space-y-2">
          {others.map((id) => (
            <li
              key={id}
              className="glass-card flex items-center gap-2 rounded-2xl p-3"
            >
              <Person id={id} />
              <form
                action={sendFriendRequest.bind(null, id)}
                className="ml-auto shrink-0"
              >
                <button
                  type="submit"
                  className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-zinc-950 transition active:brightness-95"
                >
                  Tilføj
                </button>
              </form>
            </li>
          ))}
          {others.length === 0 ? (
            <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
              Ingen andre brugere endnu.
            </li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}
