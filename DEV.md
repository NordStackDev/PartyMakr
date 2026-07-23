# DEV.md — udviklings- og driftsnoter

Intern dokumentation for betalingsmodellerne, aldersverifikation, env-variabler
og drift. Opdateret juli 2026.

---

## 1. Betalingsmodeller

Appen har **to indbyggede betalingsmodeller**, styret af én env-variabel:

```
PAYMENT_MODEL=platform      # DEFAULT — den der kører i produktion nu
PAYMENT_MODEL=marketplace   # Bygget og klar, men SOVENDE indtil den tændes
```

### `platform` (aktiv nu)

- Værten vælger kun **"Fest med entré: ja/nej"** (checkbox i fest-formularen).
- Prisen er **ens for alle betalte fester** og styres af `TICKET_PRICE_DKK`.
  Den **fryses ind i festen ved oprettelse** (`parties.entre_dkk`) — ændres
  env'en senere, påvirker det kun nye fester.
- **Alle penge går til NordStack** (alm. Stripe Checkout, ingen Connect).
- Værter onboarder aldrig hos Stripe og modtager aldrig penge.
- **Anti-scam-egenskab:** en fup-vært tjener 0 kr — der er intet motiv til at
  oprette falske fester. Gæstens maksimale tab er én billetpris, som platformen
  kan refundere med det samme (pengene står hos os).

### `marketplace` (sovende — PDF'ens/rådgiverens model)

Tændes med `PAYMENT_MODEL=marketplace` + redeploy. Så aktiveres:

- **Værten sætter selv billetprisen** (nummerfelt i formularen).
- Checkout viser **to separate linjer** (krav fra betalingsflow-memoet):
  - `Billet til festen (vært) …… X kr.`
  - `PartyMakr platformgebyr …… PLATFORM_FEE_DKK kr.`
- **Connect-onboarding for værter**: "Tilslut udbetalinger" dukker op i
  Indstillinger. Express-konto, forudfyldt business-profil (MCC 7922 +
  beskrivelse), så værten kun skal igennem **identitet + bankkonto** (KYC —
  lovpligtigt for alle der modtager penge; kan ikke undgås).
- **Escrow:** gæstens penge lander hos platformen og **holdes tilbage**, til
  festen er afholdt **+ klagevindue** (`CLAIM_WINDOW_DAYS`, default 3 dage).
  Derefter overfører udbetalings-jobbet værtens andel automatisk
  (Stripe Transfer). Platformgebyret beholder NordStack.
- **Klager:** en betalt `going`-gæst kan efter festens starttid melde
  *"festen fandt ikke sted"* (knap på fest-siden). En åben klage **pauser hele
  festens udbetalinger** (`payout_status='disputed'`), til den er afgjort.
- **Aflysning:** sletter værten festen, refunderes **alle** gennemførte
  betalinger automatisk, før festen slettes (virker i begge modes).

### Betalingsflow (begge modes)

```
Gæst klikker "Anmod og betal" (solo) / "Send til vært og betal" (gruppe)
  → Stripe Checkout (betaler med det samme = pay-at-request)
  → betaling landet → anmodningen oprettes hos værten
  → vært GODKENDER  → gæst/gruppe er 'going' (pengene står)
  → vært AFVISER    → automatisk fuld refundering
  → gæst fortryder  → automatisk fuld refundering
```

I `marketplace` fortsætter det derefter:

```
  → fest afholdes → +CLAIM_WINDOW_DAYS uden klager
  → cron /api/payouts/release → Stripe Transfer af værtens andel
  → payout_status: held → released
```

### Escrow-bogholderi (`party_payments`)

| Kolonne | Betydning |
|---|---|
| `amount_dkk` | Billetdelen (entré × personer) |
| `fee_dkk` | Platformgebyr-delen (0 i platform-mode) |
| `host_amount_dkk` | Værtens andel (0 i platform-mode — markerer escrow) |
| `payout_status` | `na` → `held` → `released` / `refunded` / `disputed` |
| `payout_due_at` | Festens slut (eller start+6t) + klagevindue |
| `transfer_ref` | Stripe Transfer-id efter frigivelse |

Beløbene **fryses på rækken ved betaling** — settle/frigivelse afhænger aldrig
af flag eller env på et senere tidspunkt.

### Klage-afgørelse (manuel i v1)

Ved en åben klage: undersøg sagen, og derefter enten:

- **Klagen afvises** (festen fandt sted):
  ```sql
  update party_claims set status='rejected' where party_id='<id>';
  update party_payments set payout_status='held'
    where party_id='<id>' and payout_status='disputed';
  ```
  → næste cron-kørsel udbetaler.
- **Klagen tages til følge** (ingen fest): refundér betalingerne i
  Stripe-dashboardet, og:
  ```sql
  update party_claims set status='upheld' where party_id='<id>';
  update party_payments set payout_status='refunded', status='refunded'
    where party_id='<id>' and payout_status='disputed';
  ```

Et admin-panel til dette er ikke bygget endnu.

---

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

⚠️ **Vigtig driftsregel:** så længe Idura kører i test, må betalte fester ikke
åbnes for rigtige fremmede — 18+-gaten kan "bestås" med opdigtede identiteter.

---

## 3. Env-variabler

| Variabel | Hvor | Betydning |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alle | Supabase-klient |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Admin-klient (webhook, settle, refunds, cron) |
| `NEXT_PUBLIC_SITE_URL` | Alle | Kanonisk origin (`https://partymakr.app`). Fallback: Vercels `VERCEL_PROJECT_PRODUCTION_URL` via `getSiteURL()` |
| `STRIPE_SECRET_KEY` | Server | Stripe. `sk_test_` lokalt, `sk_live_` kun i Vercel |
| `STRIPE_WEBHOOK_SECRET` | Server | Webhook-signatur (`/api/payments/stripe/webhook`) |
| `TICKET_PRICE_DKK` | Server | Platform-mode: fast entré (0 = betalte fester slået fra) |
| `PAYMENT_MODEL` | Server | `platform` (default) / `marketplace` |
| `PLATFORM_FEE_DKK` | Server | Marketplace-mode: gebyr pr. billet oven i værtens pris |
| `CLAIM_WINDOW_DAYS` | Server | Marketplace-mode: klagevindue efter festen (default 3) |
| `CRON_SECRET` | Server | Beskytter `/api/payouts/release` (Vercel cron sender den som Bearer) |
| `IDURA_ISSUER` / `IDURA_CLIENT_ID` / `IDURA_CLIENT_SECRET` / `IDURA_ACR` | Server | MitID-verifikation (test-broker p.t.) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Alle | Bot-beskyttelse på auth-formularer |

Env-ændringer i Vercel kræver altid et **redeploy**.

---

## 4. Aktivér marketplace-modellen (tjekliste til den dag)

1. Kør migration **00046** (hvis ikke allerede kørt — den er dormant-sikker).
2. Sæt i Vercel: `PAYMENT_MODEL=marketplace`, `PLATFORM_FEE_DKK=<gebyr>`,
   `CLAIM_WINDOW_DAYS=3`, `CRON_SECRET=<lang tilfældig streng>` → redeploy.
3. Verificér i Stripe (live): Connect platform-profil er godkendt (er den ✓).
4. Test end-to-end: vært tilslutter udbetalinger → opret fest med billetpris →
   gæst betaler (to linjer i checkout) → godkend → efter fest + vindue: tjek at
   cron frigiver (`released` + Transfer i Stripe-dashboardet).
5. Test klagevejen: klage før frigivelse → `disputed` → manuel afgørelse.
6. Beslut refusionspolitik for **platformgebyret** ved aflysning/afvisning
   (p.t. refunderes ALT, inkl. gebyret).

---

## 5. Cron

`vercel.json` kører `/api/payouts/release` **hver 6. time**. Jobbet:
frigiver `held`-betalinger med overskredet `payout_due_at`, springer fester med
åbne klager over (markerer `disputed`), og efterlader rækker hvor værten mangler
payout-konto til næste kørsel. Idempotent (idempotency-key pr. reference).
I platform-mode er der aldrig `held`-rækker → jobbet er en no-op.

---

## 6. Migrationer

`supabase/migrations/00001–00046`. Køres manuelt i Supabase SQL-editoren
(ingen lokal stack). Vigtigt siden 00030: **column-lockdown-ritualet** — nye
kolonner på `parties` skal tilføjes både i `grant select (...)` og i
`get_party`/`nearby_parties` (drop + recreate + re-grant på den eksakte
signatur). Skabelon for RPC/triggers/RLS: `00019_join_requests.sql`.

Escrow-relaterede: `00043` (pay-at-request), `00044` (fee-kolonne),
`00045` (platform-pris, drop Connect-gate), `00046` (escrow + claims).

---

## 7. Test

- **Stripe test-mode:** kort `4242 4242 4242 4242` (vilkårlig udløb/CVC).
  Onboarding i test er klik-igennem. Live kræver HTTPS (kun deployet site).
- **MitID test:** identitet i [test-tool](https://pp.mitid.dk/test-tool/frontend),
  TOTP-koden står direkte i test-tool'et ("Current TOTP").
  Lav en identitet med nylig fødselsdato for at teste under-18-afvisning.
- **MobilePay som betalingsmetode i Stripe:** aktiveres i Stripe-dashboardet
  (Settings → Payment methods) — test kører fint med kort alene.

---

## 8. Udestående før rigtig lancering

- [ ] **Rul secrets** der har været eksponeret under udviklingen:
      `STRIPE_SECRET_KEY` (live), `IDURA_CLIENT_SECRET` — opdatér Vercel + `.env.local`.
- [ ] **Idura produktionsaftale** (eller Signicat — pristilbud indhentes) →
      skift `IDURA_*` til prod. Indtil da: ingen betalte fester for fremmede.
- [ ] **Stripe webhook i prod:** endpoint `https://partymakr.app/api/payments/stripe/webhook`
      (event `checkout.session.completed`) → `STRIPE_WEBHOOK_SECRET` i Vercel.
      Uden den afstemmes betalinger kun når gæsten returnerer fra checkout.
- [ ] **JWKS-signaturvalidering** af Idura id_token (hærdning — tokenet hentes
      i dag direkte fra token-endpointet over TLS, men signaturen verificeres ikke).
- [ ] **Privatlivspolitik** opdateres: verificeret alder + køn gemmes.
- [ ] Admin-værktøj til klage-afgørelser (v1 er manuel, se §1).
- [ ] Refusionspolitik for platformgebyr besluttes (jf. memoets pkt. 6).

---

## 9. Nøglefiler

| Område | Filer |
|---|---|
| Betalings-flag | `src/lib/payments/mode.ts` |
| Stripe | `src/lib/stripe/client.ts` (Checkout, Connect, Transfer, refund), `settle.ts` (settle/reconcile/refund-sweep), `actions.ts` (Connect-onboarding) |
| Betalings-ruter | `src/app/api/payments/start`, `src/app/api/payments/stripe/webhook`, `src/app/api/payouts/release` (cron) |
| MitID | `src/lib/idura/client.ts`, `src/app/api/verify/mitid/{start,callback}` |
| Alder/køn | `src/lib/age.ts`, `profile_age`-tabellen, `private.qualifies_for_party` |
| Grupper | `src/components/parties/group-panel.tsx`, `friend-multi-select.tsx`, migration `00033–00035` |
| Gæste-UI | `src/components/parties/rsvp-buttons.tsx`, `claim-button.tsx`, `verify-age-notice.tsx` |
| Server actions | `src/lib/parties/actions.ts` |
