"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/friends/avatar";

type Friend = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

/** Checkbox list of the user's ACCEPTED friends. Controlled: the parent owns
 * the selected ids. Reuses the accepted-friends query pattern from
 * friends/page.tsx. */
export function FriendMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data: links } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const ids = ((links ?? []) as {
        requester_id: string;
        addressee_id: string;
        status: string;
      }[])
        .filter((r) => r.status === "accepted")
        .map((r) =>
          r.requester_id === user.id ? r.addressee_id : r.requester_id,
        );

      if (ids.length === 0) {
        if (active) {
          setFriends([]);
          setLoading(false);
        }
        return;
      }

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      if (!active) return;

      setFriends(
        ((profs ?? []) as {
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
        }[]).map((p) => ({
          id: p.id,
          name: p.display_name || p.username || "Ven",
          username: p.username,
          avatarUrl: p.avatar_url ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  if (loading) return <p className="text-sm text-zinc-400">Henter venner…</p>;
  if (friends.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Du har ingen venner at invitere endnu. Tilføj nogle venner først.
      </p>
    );
  }

  return (
    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
      {friends.map((f) => {
        const on = selected.includes(f.id);
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => toggle(f.id)}
              aria-pressed={on}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                on
                  ? "border-[var(--brand)]/60 bg-[var(--brand)]/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <Avatar url={f.avatarUrl} name={f.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {f.name}
                </span>
                {f.username ? (
                  <span className="block truncate text-xs text-zinc-400">
                    @{f.username}
                  </span>
                ) : null}
              </span>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  on
                    ? "bg-[var(--brand)] text-zinc-950"
                    : "border border-white/20 text-transparent"
                }`}
              >
                <Check size={14} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
