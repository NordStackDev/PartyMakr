/**
 * Admin permission keys and their Danish labels. Shared by the guard, the nav,
 * and the team-management UI. Keep in sync with the DB (00003_admin_permissions).
 */
export const ADMIN_PERMISSIONS = [
  { key: "overview", label: "Oversigt & statistik" },
  { key: "users", label: "Brugere" },
  { key: "parties", label: "Fester" },
  { key: "invites", label: "Invitationer" },
  { key: "audit", label: "Aktivitetslog" },
  { key: "moderate", label: "Moderation (handlinger)" },
  { key: "manage_admins", label: "Administrér admins" },
] as const;

export type PermissionKey = (typeof ADMIN_PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: PermissionKey[] = ADMIN_PERMISSIONS.map(
  (p) => p.key,
);

export function permissionLabel(key: string): string {
  return ADMIN_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}
