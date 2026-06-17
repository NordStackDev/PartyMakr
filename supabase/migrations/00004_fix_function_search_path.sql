-- Security Advisor: "Function Search Path Mutable"
-- set_updated_at() (from 00001) was the only function without a pinned
-- search_path. Pinning it prevents search-path-hijacking and clears the lint.
-- All other functions already set search_path.

alter function public.set_updated_at() set search_path = public, pg_temp;
