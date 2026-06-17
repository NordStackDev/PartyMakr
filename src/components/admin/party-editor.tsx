"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateParty, deleteParty } from "@/lib/admin/actions";

type PartyForm = {
  title: string;
  description: string;
  address: string;
  visibility: "public" | "private";
  capacity: string;
};

export function PartyEditor({
  partyId,
  initial,
  canModerate,
}: {
  partyId: string;
  initial: PartyForm;
  canModerate: boolean;
}) {
  const [form, setForm] = useState<PartyForm>(initial);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  function set<K extends keyof PartyForm>(key: K, value: PartyForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setToast(null);
    startTransition(async () => {
      try {
        await updateParty(partyId, form);
        setToast({ ok: true, text: "Fest gemt." });
      } catch (e) {
        setToast({
          ok: false,
          text: e instanceof Error ? e.message : "Noget gik galt.",
        });
      }
    });
  }

  function remove() {
    if (!window.confirm("Slet denne fest permanent?")) return;
    startTransition(async () => {
      try {
        await deleteParty(partyId);
        router.push("/admin/parties");
      } catch (e) {
        setToast({
          ok: false,
          text: e instanceof Error ? e.message : "Kunne ikke slette.",
        });
      }
    });
  }

  const disabled = !canModerate;

  return (
    <section className="glass-card rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white">Detaljer</h2>

      {toast ? (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
            toast.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-red-400/40 bg-red-400/10 text-red-300"
          }`}
        >
          {toast.text}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="auth-label">Titel</span>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            disabled={disabled}
            className="auth-input"
          />
        </label>
        <label className="block">
          <span className="auth-label">Beskrivelse</span>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            disabled={disabled}
            rows={3}
            className="auth-input resize-none"
          />
        </label>
        <label className="block">
          <span className="auth-label">Adresse</span>
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            disabled={disabled}
            className="auth-input"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="auth-label">Synlighed</span>
            <select
              value={form.visibility}
              onChange={(e) =>
                set("visibility", e.target.value as "public" | "private")
              }
              disabled={disabled}
              className="auth-input"
            >
              <option value="public">Offentlig</option>
              <option value="private">Privat</option>
            </select>
          </label>
          <label className="block">
            <span className="auth-label">Kapacitet</span>
            <input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              disabled={disabled}
              placeholder="Ubegrænset"
              className="auth-input"
            />
          </label>
        </div>

        {canModerate ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="btn-primary"
            >
              {pending ? "Gemmer…" : "Gem ændringer"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
            >
              Slet fest
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
