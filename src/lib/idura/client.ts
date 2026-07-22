import "server-only";

// Idura Verify (Criipto-based) OIDC client for age verification via MitID.
// Confidential client: the code→token exchange happens here on the server with
// the client secret, so the verified birthdate never touches the browser.

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
};

let cachedDiscovery: Discovery | null = null;

function issuer(): string {
  const v = process.env.IDURA_ISSUER;
  if (!v) throw new Error("IDURA_ISSUER is not set");
  return v.replace(/\/+$/, "");
}

/** True when the real MitID flow is configured (else the app uses the stub). */
export function iduraConfigured(): boolean {
  return Boolean(
    process.env.IDURA_ISSUER &&
      process.env.IDURA_CLIENT_ID &&
      process.env.IDURA_CLIENT_SECRET,
  );
}

/** Where to send a user to start age verification: straight to MitID when
 * configured, else to settings (which hosts the dev stub). */
export function verifyStartHref(): string {
  return iduraConfigured() ? "/api/verify/mitid/start" : "/settings";
}

async function discovery(): Promise<Discovery> {
  if (cachedDiscovery) return cachedDiscovery;
  const res = await fetch(`${issuer()}/.well-known/openid-configuration`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Idura discovery failed (${res.status})`);
  }
  cachedDiscovery = (await res.json()) as Discovery;
  return cachedDiscovery;
}

export async function buildAuthorizeUrl(args: {
  redirectUri: string;
  state: string;
  nonce: string;
}): Promise<string> {
  const d = await discovery();
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.IDURA_CLIENT_ID!);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", args.state);
  u.searchParams.set("nonce", args.nonce);
  if (process.env.IDURA_ACR) {
    u.searchParams.set("acr_values", process.env.IDURA_ACR);
  }
  return u.toString();
}

export async function exchangeCode(args: {
  code: string;
  redirectUri: string;
}): Promise<{ idToken: string | null }> {
  const d = await discovery();
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: process.env.IDURA_CLIENT_ID!,
      client_secret: process.env.IDURA_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Idura token exchange failed (${res.status}): ${t}`);
  }
  const json = (await res.json()) as { id_token?: string };
  return { idToken: json.id_token ?? null };
}

export type IduraClaims = {
  nonce?: string;
  birthdate?: string;
  age?: number | string;
  [k: string]: unknown;
};

/**
 * Decode the id_token payload. We receive it directly from the token endpoint
 * over TLS (confidential client), so we don't re-verify the signature here —
 * add JWKS verification if you want defense-in-depth.
 */
export function decodeIdToken(idToken: string): IduraClaims {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("Malformed id_token");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload) as IduraClaims;
}

/**
 * Best-effort verified birthdate (YYYY-MM-DD) from the claims. If the product
 * returns only an age (GDPR-minimal), approximate the birth year — good enough
 * for age-gating; returns null if neither is present.
 */
export function birthdateFromClaims(claims: IduraClaims): string | null {
  if (
    typeof claims.birthdate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(claims.birthdate)
  ) {
    return claims.birthdate;
  }
  const age =
    typeof claims.age === "string" ? parseInt(claims.age, 10) : claims.age;
  if (typeof age === "number" && Number.isFinite(age) && age >= 0 && age <= 120) {
    const year = new Date().getFullYear() - age;
    return `${year}-01-01`;
  }
  return null;
}
