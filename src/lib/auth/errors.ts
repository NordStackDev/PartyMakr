/**
 * Maps Supabase auth error codes to Danish messages. Supabase returns its
 * messages in English, so we translate the common ones by code and fall back
 * to the original message for anything we haven't mapped.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Forkert e-mail eller adgangskode.",
  email_not_confirmed: "Din e-mail er ikke bekræftet endnu.",
  user_already_exists: "Den e-mail er allerede registreret.",
  email_exists: "Den e-mail er allerede registreret.",
  weak_password: "Adgangskoden er for svag. Vælg en stærkere.",
  same_password: "Den nye adgangskode skal være forskellig fra den gamle.",
  over_email_send_rate_limit: "For mange forsøg. Prøv igen om lidt.",
  over_request_rate_limit: "For mange forsøg. Prøv igen om lidt.",
  validation_failed: "Tjek de indtastede oplysninger.",
};

export function translateAuthError(error: {
  code?: string;
  message: string;
}): string {
  if (error.code && MESSAGES[error.code]) {
    return MESSAGES[error.code];
  }
  return error.message;
}
