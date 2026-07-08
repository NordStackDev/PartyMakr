-- Address filter for party chat: until the guest's join request is ACCEPTED,
-- neither side can send address-like content (street + house number, postcode
-- + town, GPS coordinates, or map links). Enforced as a BEFORE INSERT trigger
-- so it can't be bypassed by calling the API directly. Heuristic by design —
-- it catches the typical Danish patterns, not every possible phrasing.

create function public.filter_party_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party  uuid;
  v_guest  uuid;
  approved boolean;
  body_l   text;
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

  if approved then
    return new;
  end if;

  body_l := lower(new.body);

  if
    -- Street name with a Danish road suffix followed by a house number,
    -- e.g. "danmarksgade 12b", "østre allé 4".
    body_l ~ '[a-zæøå]{2,}(vej|gade|all[eé]|boulevard|stræde|sti|torv|plads|vænge|gyde|toft|krog|holm|have|mark|kær|bakke|høj|dal|eng|løkke|hegn)[a-zæøå]*\s+\d{1,3}[a-z]?\y'
    -- Postcode followed by a capitalised town, e.g. "9000 Aalborg"
    -- (checked against the original body so years in prose don't trip it).
    or new.body ~ '\y\d{4}\s+[A-ZÆØÅ]'
    -- GPS coordinates, e.g. "57.0488, 9.9217".
    or body_l ~ '\d{1,3}[.,]\d{3,}\s*,\s*\d{1,3}[.,]\d{3,}'
    -- Map links.
    or body_l ~ '(maps\.google|google\.[a-z.]+/maps|goo\.gl/maps|openstreetmap\.org|maps\.apple|findvej\.dk)'
  then
    raise exception 'Adresser kan først deles, når anmodningen er godkendt.';
  end if;

  return new;
end;
$$;

create trigger before_party_message_filter
  before insert on public.party_messages
  for each row execute function public.filter_party_message();

-- Trigger functions aren't API endpoints — keep them off PostgREST.
revoke all on function public.filter_party_message() from public, anon, authenticated;
