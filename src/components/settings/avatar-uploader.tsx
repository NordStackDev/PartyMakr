"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { updateAvatar } from "@/lib/profile/actions";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function AvatarUploader({
  userId,
  avatarUrl,
}: {
  userId: string;
  avatarUrl: string | null;
}) {
  const [url, setUrl] = useState(avatarUrl);
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Vælg en billedfil.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Billedet må højst være 5 MB.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const busted = `${publicUrl}?v=${Date.now()}`;

      await updateAvatar(busted);
      setUrl(busted);
      router.refresh();
    } catch {
      setError("Kunne ikke uploade billedet.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setMenuOpen(false);
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { data: files } = await supabase.storage
        .from("avatars")
        .list(userId);
      if (files?.length) {
        await supabase.storage
          .from("avatars")
          .remove(files.map((f) => `${userId}/${f.name}`));
      }
      await updateAvatar("");
      setUrl(null);
      router.refresh();
    } catch {
      setError("Kunne ikke slette billedet.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={pending}
          aria-label="Skift profilbillede"
          className="group relative block h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-white/5 disabled:opacity-60"
        >
          {url ? (
            <Image
              src={url}
              alt="Profilbillede"
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl">
              🎈
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xl opacity-0 transition group-hover:opacity-100">
            {pending ? "…" : "📷"}
          </span>
        </button>

        {menuOpen && !pending ? (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute left-1/2 z-20 mt-2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#1b1530] shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  inputRef.current?.click();
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-zinc-100 hover:bg-white/5"
              >
                {url ? "Skift billede" : "Upload billede"}
              </button>
              {url ? (
                <button
                  type="button"
                  onClick={remove}
                  className="block w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-red-400/10"
                >
                  Slet billede
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-zinc-400">Tryk på billedet for at ændre</p>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}
