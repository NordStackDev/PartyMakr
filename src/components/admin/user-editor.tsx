"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  ADMIN_PERMISSIONS,
  type PermissionKey,
} from "@/lib/admin/permissions";
import {
  updateUserProfile,
  grantAdmin,
  sendPasswordReset,
  adminResendConfirmation,
  banUser,
  unbanUser,
  removeUser,
  removeAdmin,
} from "@/lib/admin/actions";

type Profile = {
  display_name: string | null;
  username: string | null;
  bio: string | null;
};

export function UserEditor({
  userId,
  emailConfirmed,
  banned,
  profile,
  adminPermissions,
  isSelf,
  canModerate,
  canManageAdmins,
}: {
  userId: string;
  emailConfirmed: boolean;
  banned: boolean;
  profile: Profile;
  adminPermissions: string[] | null;
  isSelf: boolean;
  canModerate: boolean;
  canManageAdmins: boolean;
}) {
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  function run(
    fn: () => Promise<void>,
    success: string,
    onSuccess?: () => void,
  ) {
    setToast(null);
    return fn()
      .then(() => {
        setToast({ ok: true, text: success });
        onSuccess?.();
      })
      .catch((e) =>
        setToast({
          ok: false,
          text: e instanceof Error ? e.message : "Noget gik galt.",
        }),
      );
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            toast.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-red-400/40 bg-red-400/10 text-red-300"
          }`}
        >
          {toast.text}
        </p>
      ) : null}

      <ProfileSection
        userId={userId}
        profile={profile}
        canEdit={canModerate}
        onResult={run}
      />

      {canManageAdmins ? (
        <AdminRoleSection
          userId={userId}
          current={adminPermissions}
          isSelf={isSelf}
          onResult={run}
        />
      ) : null}

      {canModerate ? (
        <ActionsSection
          userId={userId}
          emailConfirmed={emailConfirmed}
          banned={banned}
          isSelf={isSelf}
          onResult={run}
        />
      ) : null}
    </div>
  );
}

function ProfileSection({
  userId,
  profile,
  canEdit,
  onResult,
}: {
  userId: string;
  profile: Profile;
  canEdit: boolean;
  onResult: (
    fn: () => Promise<void>,
    success: string,
    onSuccess?: () => void,
  ) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <section className="glass-card rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white">Profil</h2>
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="auth-label">Visningsnavn</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={!canEdit}
            className="auth-input"
          />
        </label>
        <label className="block">
          <span className="auth-label">Brugernavn</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!canEdit}
            className="auth-input"
          />
        </label>
        <label className="block">
          <span className="auth-label">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={!canEdit}
            rows={3}
            className="auth-input resize-none"
          />
        </label>
        {canEdit ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                onResult(
                  () =>
                    updateUserProfile(userId, {
                      display_name: displayName,
                      username,
                      bio,
                    }),
                  "Profil gemt.",
                ),
              )
            }
            className="btn-primary"
          >
            {pending ? "Gemmer…" : "Gem profil"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AdminRoleSection({
  userId,
  current,
  isSelf,
  onResult,
}: {
  userId: string;
  current: string[] | null;
  isSelf: boolean;
  onResult: (
    fn: () => Promise<void>,
    success: string,
    onSuccess?: () => void,
  ) => void;
}) {
  const isAdmin = current !== null;
  const [selected, setSelected] = useState<Set<string>>(
    new Set(current ?? []),
  );
  const [pending, startTransition] = useTransition();

  function toggle(key: PermissionKey, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Admin-rolle</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs ${
            isAdmin
              ? "bg-amber-400/15 text-amber-300"
              : "bg-white/10 text-zinc-300"
          }`}
        >
          {isAdmin ? "Admin" : "Almindelig bruger"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ADMIN_PERMISSIONS.map((p) => (
          <label
            key={p.key}
            className="flex items-center gap-2 text-sm text-zinc-300"
          >
            <input
              type="checkbox"
              checked={selected.has(p.key)}
              onChange={(e) => toggle(p.key, e.target.checked)}
              className="h-4 w-4 accent-amber-400"
            />
            {p.label}
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              onResult(
                () => grantAdmin(userId, [...selected]),
                isAdmin ? "Tilladelser opdateret." : "Bruger gjort til admin.",
              ),
            )
          }
          className="btn-primary"
        >
          {pending
            ? "Gemmer…"
            : isAdmin
              ? "Gem tilladelser"
              : "Gør til admin"}
        </button>
        {isAdmin && !isSelf ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Fjern admin-adgang for denne bruger?")) return;
              startTransition(() =>
                onResult(() => removeAdmin(userId), "Admin-adgang fjernet."),
              );
            }}
            className="rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
          >
            Fjern admin
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActionsSection({
  userId,
  emailConfirmed,
  banned,
  isSelf,
  onResult,
}: {
  userId: string;
  emailConfirmed: boolean;
  banned: boolean;
  isSelf: boolean;
  onResult: (
    fn: () => Promise<void>,
    success: string,
    onSuccess?: () => void,
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const act = (
    fn: () => Promise<void>,
    success: string,
    confirm?: string,
    onSuccess?: () => void,
  ) => {
    if (confirm && !window.confirm(confirm)) return;
    startTransition(() => onResult(fn, success, onSuccess));
  };

  return (
    <section className="glass-card rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white">Handlinger</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            act(() => sendPasswordReset(userId), "Nulstillingsmail sendt.")
          }
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
        >
          Send nulstillingsmail
        </button>

        {!emailConfirmed ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => adminResendConfirmation(userId),
                "Bekræftelsesmail sendt.",
              )
            }
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
          >
            Gensend bekræftelse
          </button>
        ) : null}

        {!isSelf ? (
          banned ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() => unbanUser(userId), "Udelukkelse ophævet.")
              }
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
            >
              Ophæv udelukkelse
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(
                  () => banUser(userId),
                  "Bruger udelukket.",
                  "Udeluk denne bruger? De kan ikke logge ind igen.",
                )
              }
              className="rounded-full border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-60"
            >
              Udeluk
            </button>
          )
        ) : null}

        {!isSelf ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => removeUser(userId),
                "Bruger slettet.",
                "Slet denne bruger permanent? Alle deres data slettes. Dette kan ikke fortrydes.",
                () => router.push("/admin/users"),
              )
            }
            className="rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
          >
            Slet bruger
          </button>
        ) : null}
      </div>
    </section>
  );
}
