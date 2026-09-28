-- Post-party ratings and reversible account deletion.

-- ============================================================================
-- Account deletion: keep the Auth user for 30 days so a normal login can
-- restore the account, while keeping the profile out of public discovery.
-- ============================================================================

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

create index if not exists profiles_deletion_requested_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "active profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (
    deletion_requested_at is null
    or id = auth.uid()
  );

-- ============================================================================
-- party_reviews: one immutable rating per direction for a specific party.
-- Comments are private to the reviewer and recipient; public profiles expose
-- only aggregate scores through the summary RPC below.
-- ============================================================================

create table public.party_reviews (
  party_id    uuid not null references public.parties(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  primary key (party_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);

create index party_reviews_reviewee_idx
  on public.party_reviews (reviewee_id, created_at desc);

alter table public.party_reviews enable row level security;

create policy "reviewer or recipient reads private reviews"
  on public.party_reviews for select
  to authenticated
  using (reviewer_id = auth.uid() or reviewee_id = auth.uid());

-- No direct client write policy. The RPC validates the completed-party role,
-- rating window and uniqueness before inserting.
create function public.submit_party_review(
  p_party_id uuid,
  p_reviewee_id uuid,
  p_rating int,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewer uuid := auth.uid();
  v_host uuid;
  v_ended_at timestamptz;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_reviewer is null then
    raise exception 'Du skal være logget ind.';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Vælg en vurdering mellem 1 og 5 stjerner.';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'Din kommentar må højst være 500 tegn.';
  end if;

  select host_id, coalesce(ends_at, starts_at + interval '6 hours')
    into v_host, v_ended_at
  from public.parties
  where id = p_party_id;

  if v_host is null then
    raise exception 'Festen findes ikke.';
  end if;
  if v_ended_at > now() then
    raise exception 'Du kan først vurdere efter festen er slut.';
  end if;
  if v_ended_at < now() - interval '30 days' then
    raise exception 'Vurderingsperioden på 30 dage er udløbet.';
  end if;

  if v_reviewer = v_host then
    if not exists (
      select 1 from public.party_attendees
      where party_id = p_party_id
        and user_id = p_reviewee_id
        and status = 'going'
    ) then
      raise exception 'Du kan kun vurdere gæster, der deltog.';
    end if;
  elsif p_reviewee_id = v_host then
    if not exists (
      select 1 from public.party_attendees
      where party_id = p_party_id
        and user_id = v_reviewer
        and status = 'going'
    ) then
      raise exception 'Kun deltagende gæster kan vurdere værten.';
    end if;
  else
    raise exception 'Du kan kun vurdere værten eller gæster på denne fest.';
  end if;

  insert into public.party_reviews (party_id, reviewer_id, reviewee_id, rating, comment)
  values (p_party_id, v_reviewer, p_reviewee_id, p_rating, v_comment);
exception
  when unique_violation then
    raise exception 'Du har allerede sendt en vurdering for denne fest.';
end;
$$;

revoke all on function public.submit_party_review(uuid, uuid, int, text) from public, anon;
grant execute on function public.submit_party_review(uuid, uuid, int, text)
  to authenticated;

create function public.get_profile_rating_summary(p_profile_id uuid)
returns table (
  host_average double precision,
  host_count bigint,
  guest_average double precision,
  guest_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(avg(r.rating) filter (where p.host_id = p_profile_id), 0)::double precision,
    count(*) filter (where p.host_id = p_profile_id),
    coalesce(avg(r.rating) filter (where p.host_id <> p_profile_id), 0)::double precision,
    count(*) filter (where p.host_id <> p_profile_id)
  from public.party_reviews r
  join public.parties p on p.id = r.party_id
  where r.reviewee_id = p_profile_id
    and exists (
      select 1 from public.profiles profile
      where profile.id = p_profile_id
        and (
          profile.deletion_requested_at is null
          or profile.id = auth.uid()
        )
    );
$$;

revoke all on function public.get_profile_rating_summary(uuid) from public, anon;
grant execute on function public.get_profile_rating_summary(uuid) to authenticated;

-- The column-lockdown migration predates the self-set gender field. Keep the
-- existing safe profile columns available, but never expose deletion state.
revoke update on public.profiles from authenticated;
grant update (
  username, display_name, bio, avatar_url, search_radius_km, onboarded_at, gender
) on public.profiles to authenticated;

notify pgrst, 'reload schema';
