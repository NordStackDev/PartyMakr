"use client";

import { useState, useTransition } from "react";

import {
  ADMIN_PERMISSIONS,
  type PermissionKey,
} from "@/lib/admin/permissions";
import {
  addAdmin,
  updateAdminPermissions,
  removeAdmin,
} from "@/lib/admin/actions";

function PermissionCheckboxes({
  selected,
  onToggle,
  idPrefix,
}: {
  selected: Set<string>;
  onToggle: (key: PermissionKey, checked: boolean) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ADMIN_PERMISSIONS.map((p) => (
        <label
          key={p.key}
          htmlFor={`${idPrefix}-${p.key}`}
          className="flex items-center gap-2 text-sm text-zinc-300"
        >
          <input
            id={`${idPrefix}-${p.key}`}
            type="checkbox"
            checked={selected.has(p.key)}
            onChange={(e) => onToggle(p.key, e.target.checked)}
            className="h-4 w-4 accent-amber-400"
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}

/** Form to invite/add a new admin by email with chosen permissions. */
export function AddAdminForm() {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["overview"]));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function toggle(key: PermissionKey, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      try {
        await addAdmin(email, [...selected]);
        setMessage({ ok: true, text: "Admin tilføjet." });
        setEmail("");
        setSelected(new Set(["overview"]));
      } catch (e) {
        setMessage({
          ok: false,
          text: e instanceof Error ? e.message : "Noget gik galt.",
        });
      }
    });
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white">Inviter admin</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Vælg hvilke sektioner og handlinger de får adgang til.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="auth-label">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className="auth-input"
          />
        </label>

        <PermissionCheckboxes
          selected={selected}
          onToggle={toggle}
          idPrefix="add"
        />

        {message ? (
          <p
            className={`text-sm ${
              message.ok ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !email}
          className="btn-primary"
        >
          {pending ? "Tilføjer…" : "Tilføj admin"}
        </button>
      </div>
    </div>
  );
}

/** Editable row for an existing admin: toggle permissions, save, or remove. */
export function AdminRow({
  userId,
  email,
  permissions,
  isSelf,
}: {
  userId: string;
  email: string;
  permissions: string[];
  isSelf: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(permissions));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(key: PermissionKey, checked: boolean) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      await updateAdminPermissions(userId, [...selected]);
      setSaved(true);
    });
  }

  function remove() {
    if (!window.confirm(`Fjern admin-adgang for ${email}?`)) return;
    startTransition(async () => {
      await removeAdmin(userId);
    });
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-white">
          {email}
          {isSelf ? (
            <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
              Dig
            </span>
          ) : null}
        </p>
        {!isSelf ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="shrink-0 rounded-full border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
          >
            Fjern
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <PermissionCheckboxes
          selected={selected}
          onToggle={toggle}
          idPrefix={userId}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
        >
          {pending ? "Gemmer…" : "Gem"}
        </button>
        {saved ? (
          <span className="text-xs text-emerald-300">Gemt</span>
        ) : null}
      </div>
    </div>
  );
}
