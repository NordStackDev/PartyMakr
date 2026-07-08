-- Tighten the chat address filter (00022): also catch addresses written
-- WITHOUT spaces, e.g. "skolegade32aarhus", "Skolegade32", "9000Aalborg" and
-- "9000aalborg". Replaces the function only — the trigger from 00022 stays.

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
    -- Street name with a Danish road suffix followed by a house number —
    -- with or without spaces: "danmarksgade 12b", "skolegade32aarhus".
    body_l ~ '[a-zæøå]{2,}(vej|gade|all[eé]|boulevard|stræde|sti|torv|plads|vænge|gyde|toft|krog|holm|have|mark|kær|bakke|høj|dal|eng|løkke|hegn)[a-zæøå]*\s*\d{1,3}'
    -- Postcode followed by a capitalised town, with or without a space:
    -- "9000 Aalborg", "9000Aalborg" (original body, so prose years survive).
    or new.body ~ '\y\d{4}\s*[A-ZÆØÅ]'
    -- Postcode glued to a lowercase town: "9000aalborg".
    or body_l ~ '\y\d{4}[a-zæøå]{3,}\y'
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

revoke all on function public.filter_party_message() from public, anon, authenticated;
