"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clock3, PartyPopper } from "lucide-react";

const OFFER_ENDS_AT = new Date("2027-12-31T23:59:00+01:00").getTime();

type TimeRemaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

function getTimeRemaining(): TimeRemaining {
  const difference = Math.max(0, OFFER_ENDS_AT - Date.now());

  return {
    days: Math.floor(difference / 86_400_000),
    hours: Math.floor((difference / 3_600_000) % 24),
    minutes: Math.floor((difference / 60_000) % 60),
    seconds: Math.floor((difference / 1_000) % 60),
    expired: difference === 0,
  };
}

export function FreeFirstYearNotice() {
  const [isOpen, setIsOpen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updateTimer = () => setTimeRemaining(getTimeRemaining());
    updateTimer();
    const interval = window.setInterval(updateTimer, 1_000);

    return () => window.clearInterval(interval);
  }, [isOpen]);

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => setIsOpen((open) => !open)}
      className="relative isolate w-full cursor-pointer overflow-hidden rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_88%_12%,rgba(252,190,79,0.18),transparent_38%),#1a140e] px-4 py-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.28)] transition hover:border-amber-200/25 active:scale-[0.99]"
    >
      <div
        aria-hidden
        className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent"
      />

      <div className="relative flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 -rotate-3 items-center justify-center rounded-2xl bg-[var(--brand)] text-zinc-950 shadow-[0_7px_20px_rgba(252,190,79,0.24)]">
          <PartyPopper size={21} strokeWidth={2.2} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-zinc-400">
            En lille velkomst fra os
          </p>
          <p className="font-display mt-0.5 text-[1.08rem] font-semibold leading-tight text-white">
            Dit første år er gratis
          </p>
        </div>

        <div
          aria-hidden
          className="flex shrink-0 items-baseline gap-1 px-1 text-amber-200"
        >
          <span className="font-sans text-2xl font-black leading-none tabular-nums">
            1
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.12em]">
            år
          </span>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-amber-100/70">
        <Clock3 size={12} aria-hidden />
        <span>{isOpen ? "Skjul nedtælling" : "Se nedtælling"}</span>
        <ChevronDown
          size={13}
          aria-hidden
          className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      <div
        aria-hidden={!isOpen}
        className={`relative grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
          isOpen
            ? "mt-3 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/10 pt-3 text-center">
          {timeRemaining?.expired ? (
            <p className="text-sm font-semibold text-zinc-200">
              Tilbuddet er udløbet
            </p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-zinc-400">
                Tilbuddet slutter 31. december 2027 kl. 23.59
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  [timeRemaining?.days ?? 0, "dage"],
                  [timeRemaining?.hours ?? 0, "timer"],
                  [timeRemaining?.minutes ?? 0, "min."],
                  [timeRemaining?.seconds ?? 0, "sek."],
                ].map(([value, label]) => (
                  <span key={label} className="flex flex-col">
                    <span className="font-mono text-lg font-bold tabular-nums text-amber-200">
                      {String(value).padStart(2, "0")}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                      {label}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </button>
  );
}
