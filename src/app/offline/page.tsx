import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline — PartyMakr",
};

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-amber-300">
        <WifiOff size={28} />
      </span>
      <h1 className="text-xl font-semibold tracking-tight text-white">
        Du er offline
      </h1>
      <p className="max-w-xs text-sm text-zinc-300">
        Tjek din internetforbindelse og prøv igen. Kort og sider, du allerede har
        besøgt, vises stadig.
      </p>
    </main>
  );
}
