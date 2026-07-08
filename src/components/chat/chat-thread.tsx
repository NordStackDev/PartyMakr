"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Lock, Send } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { markThreadRead, sendMessage } from "@/lib/chat/actions";

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function timeOf(value: string): string {
  return new Date(value).toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Live message view: optimistic send + Realtime INSERT subscription (same
 * channel/cleanup pattern as the nav's notification badge). Locked threads
 * (declined request) are read-only.
 */
export function ChatThread({
  threadId,
  meId,
  locked,
  initial,
}: {
  threadId: string;
  meId: string;
  locked: boolean;
  initial: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const [supabase] = useState(createClient);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Live updates for this thread only (RLS also filters server-side).
  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          if (!active) return;
          const m = payload.new as Msg;
          setMessages((cur) => {
            if (cur.some((x) => x.id === m.id)) return cur;
            // My own message arriving over Realtime replaces its optimistic
            // placeholder (same sender + body) instead of duplicating it.
            const withoutTemp = cur.filter(
              (x) =>
                !(
                  x.id.startsWith("tmp-") &&
                  x.sender_id === m.sender_id &&
                  x.body === m.body
                ),
            );
            return [...withoutTemp, m];
          });
          if (m.sender_id !== meId) markThreadRead(threadId);
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, threadId, meId]);

  // Opening the thread marks my side as read.
  useEffect(() => {
    markThreadRead(threadId);
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const text = draft.trim();
    if (!text || text.length > 2000 || sending) return;
    setDraft("");
    setError(null);
    const temp: Msg = {
      id: `tmp-${Date.now()}`,
      sender_id: meId,
      body: text,
      created_at: new Date().toISOString(),
    };
    setMessages((cur) => [...cur, temp]);
    start(async () => {
      const rollback = () => {
        setMessages((cur) => cur.filter((m) => m.id !== temp.id));
        setDraft(text);
      };
      try {
        const res = await sendMessage(threadId, text);
        if (res?.error) {
          rollback();
          setError(res.error);
        }
      } catch {
        rollback();
        setError("Beskeden kunne ikke sendes. Prøv igen.");
      }
    });
  }

  return (
    <>
      <div className="scroll-touch mt-3 flex-1 space-y-2 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            Ingen beskeder endnu — skriv den første.
          </p>
        ) : null}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  mine
                    ? "max-w-[75%] rounded-2xl rounded-br-md bg-[var(--brand)] px-3.5 py-2 text-sm text-zinc-950"
                    : "max-w-[75%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.08] px-3.5 py-2 text-sm text-zinc-100"
                }
              >
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
                <p
                  className={`mt-0.5 text-[10px] ${mine ? "text-zinc-800" : "text-zinc-400"}`}
                >
                  {timeOf(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {locked ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
          <Lock size={15} className="mt-0.5 shrink-0 text-zinc-400" />
          Samtalen er låst — anmodningen blev afvist.
        </p>
      ) : (
        <>
          {error ? (
            <p className="mt-2 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="mt-2 flex items-center gap-2"
          >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="Skriv en besked…"
            aria-label="Skriv en besked"
            className="auth-input mt-0 flex-1 rounded-full"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-zinc-950 transition active:brightness-95 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
          </form>
        </>
      )}
    </>
  );
}
