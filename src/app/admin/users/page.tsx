import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { banUser, unbanUser, removeUser } from "@/lib/admin/actions";
import { ModerationButton } from "@/components/admin/moderation-button";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
  banned_at: string | null;
};

export default async function AdminUsersPage() {
  const currentUser = await requireAdmin();
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, created_at, banned_at")
    .order("created_at", { ascending: false })
    .limit(500);

  // Emails live in auth.users — fetch via the Admin API (server-only).
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const rows = (profiles ?? []) as Profile[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Brugere</h1>
      <p className="text-sm text-zinc-500">{rows.length} brugere</p>

      <ul className="space-y-2">
        {rows.map((u) => {
          const banned = !!u.banned_at;
          const isSelf = u.id === currentUser.id;
          return (
            <li
              key={u.id}
              className="glass-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {emailById.get(u.id) || u.display_name || u.username || u.id}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Oprettet {formatDate(u.created_at)}
                  {banned ? (
                    <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
                      Blokeret
                    </span>
                  ) : null}
                </p>
              </div>

              {isSelf ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300">
                  Dig
                </span>
              ) : (
                <div className="flex shrink-0 gap-2">
                  {banned ? (
                    <ModerationButton
                      action={unbanUser.bind(null, u.id)}
                      confirm="Ophæv udelukkelsen af denne bruger?"
                      pendingText="Ophæver…"
                      variant="neutral"
                    >
                      Ophæv udelukkelse
                    </ModerationButton>
                  ) : (
                    <ModerationButton
                      action={banUser.bind(null, u.id)}
                      confirm="Udeluk denne bruger? De kan ikke logge ind igen."
                      pendingText="Udelukker…"
                      variant="neutral"
                    >
                      Udeluk
                    </ModerationButton>
                  )}
                  <ModerationButton
                    action={removeUser.bind(null, u.id)}
                    confirm="Slet denne bruger permanent? Alle deres fester, invitationer og RSVP'er slettes også. Dette kan ikke fortrydes."
                    pendingText="Sletter…"
                  >
                    Slet
                  </ModerationButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
