# DEV.md — udviklings- og driftsnoter

Intern dokumentation for festoplysninger, aldersverifikation, env-variabler og
drift. Opdateret oktober 2026.

---

## 1. Entrébetaling (fjernet)

- Appen opretter ikke længere betalte fester eller Stripe Checkout-sessioner.
- Migration `00052` fjerner priser fra festvisningerne, nulstiller eksisterende festpriser og fjerner RPC'erne, der kunne starte nye betalinger.
- `party_payments`, Stripe-webhooken, refusionskoden og udbetalings-jobbet bevares kun til at afstemme, refundere eller frigive betalinger fra før ændringen. Slet ikke betalingsjournalen, mens gamle betalinger stadig kan være åbne.

## 2. Aldersverifikation (MitID via Idura)

- **Broker:** Idura (bygget på Criipto). OIDC authorization-code-flow,
  server-side token-udveksling. Fødselsdatoen rører aldrig browseren.
- **Data:** kun **fødselsdato** gemmes (aldrig CPR) i den ejer-læsbare tabel
  `profile_age`; udadtil eksponeres kun den afledte **alder**
  (`get_profile_age`). GDPR-dataminimering.
- **Kører i TEST-miljø:** `partymakr.test.idura.broker` — kun opdigtede
  test-identiteter fra [MitID Test Tool](https://pp.mitid.dk/test-tool/frontend)
  virker (opret identitet → Register TOTP → login med bruger-ID + TOTP-kode).
- **Produktion kræver** en MitID-produktionsaftale hos Idura (eller anden
  broker, fx Signicat — prissammenligning pågår). Skift derefter `IDURA_*` til
  produktionsværdierne.
- **Fallback-stub:** er `IDURA_*` ikke sat, viser Indstillinger en
  dato-indtastnings-stub (kun til udvikling).
- **Bruges just-in-time** (ikke app-lås): kræves ved *opret fest* (18+),
  *deltag i aldersbegrænset fest*, og giver "Verificeret"-mærket.

⚠️ **Vigtig driftsregel:** så længe Idura kører i test, kan aldersgaten
"bestås" med opdigtede testidentiteter. Brug ikke testverifikation til rigtige
brugere.

---

## 3. Env-variabler

| Variabel | Hvor | Betydning |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alle | Supabase-klient |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Admin-klient til webhook, historiske refusioner og cron |
| `NEXT_PUBLIC_SITE_URL` | Alle | Kanonisk origin til auth- og MitID-links |
| `STRIPE_SECRET_KEY` | Server | Kun historiske betalinger, refusioner og eventuelle gamle udbetalinger |
| `STRIPE_WEBHOOK_SECRET` | Server | Signatur til webhook for gamle Checkout-sessioner |
| `CLAIM_WINDOW_DAYS` | Server | Klagervindue for gamle marketplace-betalinger |
| `CRON_SECRET` | Server | Beskytter cron-ruter til gamle udbetalinger, konto-sletning og reviewpåmindelser |
| `IDURA_ISSUER` / `IDURA_CLIENT_ID` / `IDURA_CLIENT_SECRET` / `IDURA_ACR` | Server | MitID-verifikation |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Alle | Botbeskyttelse på auth-formularer |

Env-ændringer i Vercel kræver altid et **redeploy**.

## 4. Historiske betalinger

Der kan stadig ligge Stripe-betalinger fra før entrébetaling blev fjernet. Webhook, refusionsfunktioner og `/api/payouts/release` håndterer kun de eksisterende rækker i `party_payments`. Der findes ikke længere en app-rute til at starte en ny Checkout-session.

Når alle historiske betalinger er afstemt, refunderet eller frigivet, kan Stripe-webhook, payout-cron, secrets og de tilhørende tabeller vurderes til separat oprydning.

## 5. Cron

`vercel.json` kører `/api/payouts/release` hver 6. time. Den frigiver kun `held`-betalinger, der allerede findes i den historiske betalingsjournal, og springer rækker med åbne klager over. Der oprettes ingen nye betalte fester.

## 6. Migrationer

`supabase/migrations/00001–00052` køres manuelt i Supabase SQL-editoren (ingen lokal stack). Migration `00052` tilføjer festoplysningerne og fjerner adgang til at oprette entrébetalinger.

Vigtigt siden 00030: behold column-lockdown på `parties`. De nye oplysninger leveres gennem de adgangskontrollerede `get_party`- og `nearby_parties`-funktioner; giv ikke direkte tabeladgang uden særskilt vurdering. Skabelon for RPC/triggers/RLS: `00019_join_requests.sql`.

## 7. Test

- **MitID test:** opret en identitet i [MitID Test Tool](https://pp.mitid.dk/test-tool/frontend), og brug testværktøjets aktuelle TOTP-kode.
- Lav en testidentitet under 18 år for at kontrollere aldersafvisningen.

## 8. Udestående før rigtig lancering

- [ ] Rotér secrets, der har været eksponeret: Supabase service role, Stripe-secret (historisk betaling) og `IDURA_CLIENT_SECRET`.
- [ ] Få Idura-produktionsaftale og skift `IDURA_*` fra test til produktion.
- [ ] Tilføj JWKS-signaturvalidering af Idura `id_token`.
- [ ] Opdatér privatlivspolitikken med verificeret alder, køn og de nye frivillige festoplysninger.
- [ ] Hvis der stadig findes åbne historiske Stripe-betalinger: bekræft webhook og payout-cron i produktion, og behandl eventuelle åbne klager.

## 9. Nøglefiler

| Område | Filer |
|---|---|
| Festoplysninger | `src/components/parties/party-form.tsx`, `src/lib/parties/actions.ts`, `src/app/parties/[id]/page.tsx` |
| Entrébetaling fjernet | `supabase/migrations/00052_party_info_and_remove_entry_fees.sql` |
| Historiske Stripe-poster | `src/lib/stripe/client.ts`, `src/lib/stripe/settle.ts`, `src/app/api/payments/stripe/webhook`, `src/app/api/payouts/release` |
| MitID | `src/lib/idura/client.ts`, `src/app/api/verify/mitid/{start,callback}` |
| Alder/køn | `src/lib/age.ts`, `profile_age`, `private.qualifies_for_party` |
| Grupper | `src/components/parties/group-panel.tsx`, `friend-multi-select.tsx`, migration `00033–00035` |
