-- Extend the pre-approval chat filter (00022/00023): besides addresses, also
-- block PHONE NUMBERS and E-MAILS until the guest's request is accepted — so
-- the conversation can't be moved off the platform before approval.
--
-- Note: since 00024 threads only exist AFTER approval, this filter is a
-- dormant safety net. It matters the day pre-approval chat is (re)introduced.

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
    -- Street name with a Danish road suffix + house number (with/without
    -- spaces): "danmarksgade 12b", "skolegade32aarhus".
    body_l ~ '[a-zæøå]{2,}(vej|gade|all[eé]|boulevard|stræde|sti|torv|plads|vænge|gyde|toft|krog|holm|have|mark|kær|bakke|høj|dal|eng|løkke|hegn)[a-zæøå]*\s*\d{1,3}'
    -- Postcode + capitalised town: "9000 Aalborg", "9000Aalborg".
    or new.body ~ '\y\d{4}\s*[A-ZÆØÅ]'
    -- Postcode glued to a lowercase town: "9000aalborg".
    or body_l ~ '\y\d{4}[a-zæøå]{3,}\y'
    -- GPS coordinates: "57.0488, 9.9217".
    or body_l ~ '\d{1,3}[.,]\d{3,}\s*,\s*\d{1,3}[.,]\d{3,}'
    -- Map links.
    or body_l ~ '(maps\.google|google\.[a-z.]+/maps|goo\.gl/maps|openstreetmap\.org|maps\.apple|findvej\.dk)'
    -- Danish phone number with country code: "+45 12345678", "+4512345678".
    or body_l ~ '(\+|00)\s?45\s?(\d ?){7}\d'
    -- Bare 8-digit number, optionally space-grouped: "12345678",
    -- "12 34 56 78". Space-only separators on purpose — dotted dates like
    -- "24.12.2026" must NOT trip the filter. \y keeps longer digit runs out.
    or body_l ~ '\y(\d ?){7}\d\y'
    -- E-mail address.
    or body_l ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
  then
    raise exception 'Kontaktoplysninger og adresser kan først deles, når anmodningen er godkendt.';
  end if;

  return new;
end;
$$;

revoke all on function public.filter_party_message() from public, anon, authenticated;
