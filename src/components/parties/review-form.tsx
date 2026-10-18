"use client";

import { Star } from "lucide-react";
import { useState, useTransition } from "react";

import { submitPartyReview } from "@/lib/reviews/actions";

export function ReviewForm({
  partyId,
  revieweeId,
  revieweeName,
  submitted = false,
}: {
  partyId: string;
  revieweeId: string;
  revieweeName: string;
  submitted?: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(submitted);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="text-sm text-emerald-300">
        Du har sendt din vurdering af {revieweeName}.
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!rating) {
          setError("Vælg mindst én stjerne.");
          return;
        }
        setError(null);
        start(async () => {
          const result = await submitPartyReview(
            partyId,
            revieweeId,
            rating,
            comment,
          );
          if (result.error) setError(result.error);
          else setDone(true);
        });
      }}
    >
      <div>
        <p className="text-sm font-semibold text-white">Vurdér {revieweeName}</p>
        <div className="mt-2 flex gap-1" aria-label="Vælg antal stjerner">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} stjerner`}
              className="rounded p-1 text-amber-300 transition hover:bg-amber-400/10"
            >
              <Star size={22} fill={value <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="auth-label">Privat kommentar (valgfri)</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={500}
          rows={3}
          className="auth-input resize-none"
          placeholder="Hvad fungerede godt, eller hvad kan blive bedre?"
        />
      </label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="btn-secondary disabled:opacity-60"
      >
        {pending ? "Gemmer…" : "Send vurdering"}
      </button>
    </form>
  );
}
