"use client";

import { useState } from "react";

const MIN = 1;
const MAX = 250;

export function RadiusSlider({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const pct = ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="auth-label">Søgeradius</span>
        <span className="text-base font-bold text-amber-300">{value} km</span>
      </div>

      <input
        type="range"
        name={name}
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="pm-range mt-3"
        style={{
          background: `linear-gradient(to right, #fcbe4f 0%, #fcbe4f ${pct}%, rgba(255,255,255,0.14) ${pct}%, rgba(255,255,255,0.14) 100%)`,
        }}
      />

      <div className="mt-1 flex justify-between text-xs text-zinc-400">
        <span>{MIN} km</span>
        <span>{MAX} km</span>
      </div>
      <span className="mt-2 block text-xs text-zinc-400">
        Hvor langt væk fester vises på kortet.
      </span>
    </div>
  );
}
