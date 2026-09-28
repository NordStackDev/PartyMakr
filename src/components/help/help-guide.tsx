"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { markOnboarded } from "@/lib/profile/actions";
import { helpOpened, subscribeOpenHelp } from "@/lib/help-controls";

type Step = { title: string; desc: string };

const GUEST_STEPS: Step[] = [
  {
    title: "Find fester",
    desc: "Se offentlige og private fester i nærheden af dig på kortet.",
  },
  {
    title: "Anmod om at deltage",
    desc: "Send en anmodning til festen og vent på, at værten godkender dig.",
  },
  {
    title: "Betal entré",
    desc: "Betal entréen (25 kr) samt evt. ekstra for mad, pynt, snacks m.m.",
  },
];

const HOST_STEPS: Step[] = [
  {
    title: "Opret din fest",
    desc: "Vælg en offentlig eller privat fest på kortet, og udfyld detaljerne.",
  },
  {
    title: "Godkend gæster",
    desc: "Gennemgå anmodninger og godkend, hvem der må deltage i festen.",
  },
  {
    title: "Afhold festen",
    desc: "Afhold festen som planlagt. Så er alt klar til betaling.",
  },
  {
    title: "Modtag betaling",
    desc: "Få betaling for festen fra dine gæster, efter festen er afholdt.",
  },
];

export function HelpGuide() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"guest" | "host">("guest");
  // Render the overlay into <body> (not the phone-frame card) so it escapes the
  // card's backdrop-filter containing block and the map's stacking contexts —
  // otherwise the sheet renders below the nav instead of covering the frame.
  // useSyncExternalStore gives false during SSR and true once on the client,
  // without a setState-in-effect (which the lint rules disallow).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // True while the guide is being shown for the first time (onboarded_at null);
  // closing then records that the user has seen it.
  const pendingOnboard = useRef(false);

  // Open the guide and tell the bottom-nav to close its pull-up menu (so they
  // don't stack). Used by both the auto-open and the "Hjælp" button.
  const openGuide = useCallback(() => {
    setOpen(true);
    helpOpened();
  }, []);

  // Auto-open once for first-time users (persisted on the profile).
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      if (active && data && data.onboarded_at == null) {
        pendingOnboard.current = true;
        openGuide();
      }
    })();
    return () => {
      active = false;
    };
  }, [openGuide]);

  // Open on demand from the "Hjælp" menu button.
  useEffect(() => subscribeOpenHelp(openGuide), [openGuide]);

  // Focus the close button on open; close on Escape.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    if (pendingOnboard.current) {
      pendingOnboard.current = false;
      void markOnboarded();
    }
  }

  const steps = role === "guest" ? GUEST_STEPS : HOST_STEPS;

  if (!mounted) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[1200] ${open ? "" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label="Luk hjælp"
        tabIndex={open ? 0 : -1}
        onClick={close}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sådan bruger du PartyMakr"
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[88%] max-w-[480px] overflow-y-auto rounded-t-3xl border-t border-white/12 bg-[#1c1610]/95 p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Sådan bruger du PartyMakr
            </h2>
            <p className="mt-1 text-sm text-zinc-300">
              Kom hurtigt i gang. Vælg din rolle nedenfor.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Luk"
            onClick={close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Role toggle */}
        <div
          role="tablist"
          aria-label="Vælg rolle"
          className="mt-4 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/5 p-1"
        >
          {(
            [
              { key: "guest", label: "Gæst" },
              { key: "host", label: "Vært" },
            ] as const
          ).map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={role === r.key}
              onClick={() => setRole(r.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                role === r.key
                  ? "bg-[#FCBE4F] text-zinc-950"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol className="mt-5 space-y-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FCBE4F] text-sm font-bold text-zinc-950">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="mt-0.5 text-sm text-zinc-300">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={close}
          className="btn-primary mt-6 w-full"
        >
          Forstået, lad os feste!
        </button>
      </div>
    </div>,
    document.body,
  );
}
