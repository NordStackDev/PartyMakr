"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";

import {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  type UserSearchResult,
} from "@/lib/friends/actions";
import { Avatar } from "@/components/friends/avatar";

export function FindFriends() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();

  // Debounced fetch only — no synchronous setState here (the input handler owns
  // the loading/clear states).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) return;
    const t = setTimeout(async () => {
      const r = await searchUsers(term);
      setResults(r);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function onChange(value: string) {
    setQ(value);
    if (value.trim().length < 1) {
      setResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  function setStatus(id: string, status: UserSearchResult["status"]) {
    setResults((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  return (
    <section>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Søg efter navn eller brugernavn"
          aria-label="Søg efter venner"
          className="auth-input mt-0 pl-9"
        />
      </div>

      {q.trim().length > 0 ? (
        <ul className="mt-3 space-y-2">
          {searching && results.length === 0 ? (
            <li className="px-1 text-sm text-zinc-400">Søger…</li>
          ) : null}
          {!searching && results.length === 0 ? (
            <li className="px-1 text-sm text-zinc-400">
              Ingen brugere fundet. (Folk er kun søgbare når de har sat navn eller
              brugernavn.)
            </li>
          ) : null}

          {results.map((r) => (
            <li
              key={r.id}
              className="glass-card flex items-center gap-3 rounded-2xl p-3"
            >
              <Avatar url={r.avatar_url} name={r.username} size={40} />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                {r.username ? `@${r.username}` : r.display_name || "Bruger uden navn"}
              </p>

              {r.status === "none" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await sendFriendRequest(r.id);
                      setStatus(r.id, "outgoing");
                    })
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-zinc-950 transition active:brightness-95 disabled:opacity-60"
                >
                  <UserPlus size={14} /> Tilføj
                </button>
              ) : r.status === "incoming" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await acceptFriendRequest(r.id);
                      setStatus(r.id, "friends");
                    })
                  }
                  className="shrink-0 rounded-full border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-60"
                >
                  Acceptér
                </button>
              ) : (
                <span className="shrink-0 px-2 text-xs font-medium text-zinc-400">
                  {r.status === "friends" ? "Venner" : "Anmodet"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
