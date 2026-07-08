-- Flagging of platform-circumvention attempts in chat.
--
-- Every message now goes through send_party_message(). If it contains contact
-- info / addresses / references to other platforms ("søg mit navn på
-- facebook"), the attempt is recorded in chat_flags for the admin panel:
--   * before approval  -> message BLOCKED + flagged
--   * after approval   -> message delivered + silently flagged
-- The flag must survive a blocked send, so blocking RETURNS 'blocked' instead
-- of raising (an exception would roll the flag back too).
--
-- The direct INSERT policy on party_messages is dropped: all sends go through
-- the RPC, so attempts can never dodge the flagging. The BEFORE INSERT filter
-- trigger (00022-00025) stays as a defense-in-depth backstop.

-- ============================================================================
-- chat_flags
-- ============================================================================

create table public.chat_flags (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid references public.party_threads(id) on delete set null,
  party_id   uuid references public.parties(id) on delete set null,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  -- true = the message was blocked (pre-approval); false = delivered, flagged.
  blocked    boolean not null,
  created_at timestamptz not null default now()
);

create index chat_flags_created_idx on public.chat_flags (created_at desc);
create index chat_flags_sender_idx on public.chat_flags (sender_id);

alter table public.chat_flags enable row level security;
-- No policies on purpose: written only by send_party_message (SECURITY
-- DEFINER), read only by the admin panel's service-role client.

-- ============================================================================
-- Shared pattern check (single source of truth for RPC + backstop trigger)
-- ============================================================================

create function private.is_suspicious_message(p_body text)
returns boolean
language plpgsql
immutable
as $$
declare
  body_l text := lower(p_body);
begin
  return
    -- Street name with a Danish road suffix + house number.
    body_l ~ '[a-zæøå]{2,}(vej|gade|all[eé]|boulevard|stræde|sti|torv|plads|vænge|gyde|toft|krog|holm|have|mark|kær|bakke|høj|dal|eng|løkke|hegn)[a-zæøå]*\s*\d{1,3}'
    -- Postcode + town ("9000 Aalborg", "9000Aalborg", "9000aalborg").
    or p_body ~ '\y\d{4}\s*[A-ZÆØÅ]'
    or body_l ~ '\y\d{4}[a-zæøå]{3,}\y'
    -- GPS coordinates.
    or body_l ~ '\d{1,3}[.,]\d{3,}\s*,\s*\d{1,3}[.,]\d{3,}'
    -- Map links.
    or body_l ~ '(maps\.google|google\.[a-z.]+/maps|goo\.gl/maps|openstreetmap\.org|maps\.apple|findvej\.dk)'
    -- Danish phone numbers ("+45 12345678", "12345678", "12 34 56 78").
    or body_l ~ '(\+|00)\s?45\s?(\d ?){7}\d'
    or body_l ~ '\y(\d ?){7}\d\y'
    -- E-mail addresses.
    or body_l ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    -- Other platforms ("snap"/"insta" bounded so "snaps" isn't caught).
    or body_l ~ '\y(facebook|messenger|instagram|whatsapp|telegram|discord|tiktok|viber|signal)\y'
    or body_l ~ '\y(insta|snap|snapchat|fb)\y'
    -- "søg mit navn ...", "find mig ...", "find os ..."
    or body_l ~ '(søg|find)\s+(mig|os|mit\s*navn)';
end;
$$;

revoke all on function private.is_suspicious_message(text)
  from public, anon, authenticated;

-- Backstop trigger now uses the shared check (same behaviour as 00025, wider
-- patterns). Still raises — direct inserts are being removed anyway.
create or replace function public.filter_party_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party  uuid;
  v_guest  uuid;
  approved boolean;
begin
  select party_id, guest_id into v_party, v_guest
  from public.party_threads where id = new.thread_id;
  if v_party is null then
    return new;
  end if;

  select exists (
    select 1 from public.party_join_requests r
    where r.party_id = v_party
      and r.user_id = v_guest
      and r.status = 'accepted'
  ) into approved;

  if not approved and private.is_suspicious_message(new.body) then
    raise exception 'Kontaktoplysninger og adresser kan først deles, når anmodningen er godkendt.';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- send_party_message: the only way to send — validates, flags, blocks
-- ============================================================================

create function public.send_party_message(p_thread_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t          public.party_threads%rowtype;
  v_host     uuid;
  approved   boolean;
  suspicious boolean;
  body_t     text := trim(p_body);
begin
  if body_t = '' or char_length(body_t) > 2000 then
    raise exception 'Beskeden skal være mellem 1 og 2000 tegn.';
  end if;

  select * into t from public.party_threads where id = p_thread_id;
  if t.id is null then
    raise exception 'Samtalen findes ikke.';
  end if;

  select host_id into v_host from public.parties where id = t.party_id;
  if auth.uid() is null
     or (auth.uid() <> t.guest_id and auth.uid() is distinct from v_host) then
    raise exception 'Kun deltagere kan skrive i samtalen.';
  end if;

  if t.locked then
    raise exception 'Samtalen er låst.';
  end if;

  select exists (
    select 1 from public.party_join_requests r
    where r.party_id = t.party_id
      and r.user_id = t.guest_id
      and r.status = 'accepted'
  ) into approved;

  suspicious := private.is_suspicious_message(body_t);

  if suspicious then
    insert into public.chat_flags (thread_id, party_id, sender_id, body, blocked)
    values (t.id, t.party_id, auth.uid(), body_t, not approved);
  end if;

  if suspicious and not approved then
    return 'blocked'; -- return (not raise!) so the flag above COMMITS
  end if;

  insert into public.party_messages (thread_id, sender_id, body)
  values (t.id, auth.uid(), body_t);

  return 'ok';
end;
$$;

revoke all on function public.send_party_message(uuid, text) from public, anon;
grant execute on function public.send_party_message(uuid, text) to authenticated;

-- All sends go through the RPC from now on.
drop policy "participants can write in open threads" on public.party_messages;

notify pgrst, 'reload schema';
