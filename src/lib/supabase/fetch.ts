/**
 * Node 24's built-in fetch (undici) can throw
 * "controller[kState].transformAlgorithm is not a function" while decompressing
 * gzip/deflate responses. Requesting identity encoding makes the server send an
 * uncompressed response, so undici never takes the broken decompression path.
 *
 * Use this as the `global.fetch` for the server-side Supabase clients (the
 * browser client is unaffected — browsers don't use undici).
 */
export const identityFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("accept-encoding", "identity");
  return fetch(input, { ...init, headers });
};
