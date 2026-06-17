import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { AddAdminForm, AdminRow } from "@/components/admin/admin-manager";

type AdminUser = {
  user_id: string;
  permissions: string[];
};

export default async function AdminTeamPage() {
  const { user } = await requirePermission("manage_admins");
  const supabase = await createClient();

  const { data: admins } = await supabase
    .from("admin_users")
    .select("user_id, permissions")
    .order("created_at", { ascending: true });

  const rows = (admins ?? []) as AdminUser[];

  // Resolve emails via the Admin API.
  const adminClient = createAdminClient();
  const { data: authData } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Admins</h1>
        <p className="text-sm text-zinc-500">
          {rows.length} admin{rows.length === 1 ? "" : "s"} · styr hvad hver
          enkelt kan se og gøre.
        </p>
      </div>

      <AddAdminForm />

      <div className="space-y-3">
        {rows.map((a) => (
          <AdminRow
            key={a.user_id}
            userId={a.user_id}
            email={emailById.get(a.user_id) || a.user_id}
            permissions={a.permissions}
            isSelf={a.user_id === user.id}
          />
        ))}
      </div>
    </div>
  );
}
