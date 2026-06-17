/**
 * Node 24's built-in fetch (undici) can throw
 * "controller[kState].transformAlgorithm is not a function" while decompressing
 * gzip/deflate responses. On that version only, we force identity encoding so
 * undici never takes the broken decompression path.
 *
 * Everywhere else (Vercel's Node runtime, browsers) we keep the native fetch so
 * Supabase responses stay gzip-compressed — disabling compression in production
 * just makes every payload bigger and slower.
 */
const needsIdentityEncoding =
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string" &&
  process.versions.node.startsWith("24.");

export const identityFetch: typeof fetch = needsIdentityEncoding
  ? (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("accept-encoding", "identity");
      return fetch(input, { ...init, headers });
    }
  : fetch;
