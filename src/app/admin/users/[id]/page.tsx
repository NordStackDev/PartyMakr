import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { UserEditor } from "@/components/admin/user-editor";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId: viewerId, permissions } = await requirePermission("users");
  const canModerate = permissions.includes("moderate");
  const canManageAdmins = permissions.includes("manage_admins");

  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: authUser }, { data: profile }, { data: adminRow }] =
    await Promise.all([
      admin.auth.admin.getUserById(id),
      supabase
        .from("profiles")
        .select("display_name, username, bio, created_at, banned_at")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("admin_users")
        .select("permissions")
        .eq("user_id", id)
        .maybeSingle(),
    ]);

  if (!authUser?.user || !profile) {
    notFound();
  }

  const email = authUser.user.email ?? "—";
  const emailConfirmed = !!authUser.user.email_confirmed_at;
  const banned = !!profile.banned_at;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Brugere
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-white">{email}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>Oprettet {formatDate(profile.created_at)}</span>
          <span
            className={`rounded-full px-2 py-0.5 ${
              emailConfirmed
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {emailConfirmed ? "E-mail bekræftet" : "Ikke bekræftet"}
          </span>
          {banned ? (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
              Blokeret
            </span>
          ) : null}
        </p>
      </div>

      <UserEditor
        userId={id}
        emailConfirmed={emailConfirmed}
        banned={banned}
        profile={{
          display_name: profile.display_name,
          username: profile.username,
          bio: profile.bio,
        }}
        adminPermissions={adminRow ? (adminRow.permissions as string[]) : null}
        isSelf={id === viewerId}
        canModerate={canModerate}
        canManageAdmins={canManageAdmins}
      />
    </div>
  );
}
