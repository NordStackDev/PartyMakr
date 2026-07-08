-- App-wide realtime: the client keeps ONE channel per user (see
-- src/components/realtime/realtime-provider.tsx) that triggers a page
-- refresh whenever something concerning the user changes. Realtime respects
-- RLS, so subscribers only receive rows they are allowed to SELECT.
--
-- Already published: profiles, parties, party_invites (00002),
-- notifications (00013), party_messages (00021). Add the two missing ones.
-- party_attendees is left out on purpose: the flows that matter also touch
-- requests/threads/notifications, and attendee events on public parties
-- would fan out to every user.

alter publication supabase_realtime add table public.party_threads;
alter publication supabase_realtime add table public.party_join_requests;
