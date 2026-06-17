# PartyMakr

A location-based party discovery app. Find parties happening near you on a map — public events, friends' gatherings, or private parties shared with you.

---

## English

### Concept

PartyMakr is a social app for discovering parties around you. Unlike swipe-based apps such as Tinder, PartyMakr is built around a **map-first experience**: when you open the app, you see actual parties happening near your location rather than scrolling through profiles. This makes the experience less superficial and centered on real events instead of appearances.

### How it works

1. **Sign up / log in** to create an account.
2. **Share your location** so the app can find parties near you.
3. **Browse the map** to see parties in your area, both public events and private parties that have been shared with you.
4. **Create your own party**, set it as public or private, and invite people.

### Core features (MVP)

- User authentication (email/password, plus social login later)
- Location permission and live map view
- Create, edit, and delete parties
- Public vs. private party visibility
- Party details: title, description, location, time, host, guest list
- Discover parties within a configurable radius

### Tech stack

| Layer            | Choice                                    |
| ---------------- | ----------------------------------------- |
| Frontend         | Next.js (React) — App Router + TypeScript |
| Hosting          | Vercel                                    |
| Database & Auth  | Supabase (Postgres + Auth + Storage)      |
| Maps             | Leaflet + OpenStreetMap (no API key)      |
| Styling          | Tailwind CSS v4                           |

### Roadmap

- **Phase 1 — Web app (MVP)**: responsive Next.js webapp deployed on Vercel.
- **Phase 2 — PWA**: installable on phones, offline-friendly.
- **Phase 3 — Native mobile**: wrap the webapp using Capacitor or React Native for iOS and Android, reusing most of the React codebase.

### Why this stack

- **Next.js + Vercel**: fast iteration, serverless deployment, great DX.
- **Supabase**: Postgres with built-in auth, row-level security, realtime updates, and storage — perfect for a small team starting out, and scales later.
- **Web-first**: one codebase to begin with; native apps follow once the product is validated.

---

## Dansk

### Koncept

PartyMakr er en social app til at finde fester i nærheden af dig. I modsætning til swipe-baserede apps som Tinder er PartyMakr bygget op om et direkte produkt til brugeren som gør det lettere og finde fest eller sammenkomst: når du åbner appen, ser du faktiske fester, der finder sted i nærheden af din placering, i stedet for at scrolle gennem profiler. Det gør oplevelsen mindre overfladisk og centreret om rigtige events frem for udseende.

Sådan fungerer det

1. **Opret bruger / log ind** for at oprette en konto.
2. **Del din placering**, så appen kan finde fester i nærheden.
3. **Se kortet** med fester i dit område — både offentlige events og private fester, du er blevet inviteret til.
4. **Opret din egen fest**, sæt den som offentlig eller privat, og inviter folk.

### Kernefunktioner (MVP)

- Brugerlogin (email/adgangskode måske telefonnummer senere?, social login senere også såsom facebook, instagram google?)
- Placeringstilladelse og live kortvisning - SKAL godkendes af brugeren grundet GDPR.
- Opret, rediger og slet fester, samt overvåge dem indei admin panelet.
- Offentlig vs. privat synlighed p åfester.
- Festdetaljer: titel, beskrivelse, placering, tidspunkt, vært, gæsteliste, andre ting?
- Find fester inden for en justerbar radius via en slider på indstillinger.

### Tech stack

| Lag              | Valg                                       |
| ---------------- | ------------------------------------------ |
| Frontend         | Next.js (React) — App Router + TypeScript  |
| Hosting          | Vercel                                     |
| Database & Auth  | Supabase (Postgres + Auth + Storage)       |
| Kort             | Leaflet + OpenStreetMap (ingen API-nøgle)  |
| Styling          | Tailwind CSS v4                            |

### Roadmap

- **Fase 1 — Web app (MVP)**: responsiv Next.js-webapp deployet på Vercel.
- **Fase 2 — PWA**: kan installeres på telefoner, virker offline.
- **Fase 3 — Native mobil**: pak webappen ind med Capacitor eller React Native til iOS og Android, så størstedelen af React-koden genbruges.

### Hvorfor netop denne stack

- **Next.js + Vercel**: hurtig udvikling, serverless deploy, god udvikleroplevelse.
- **Supabase**: Postgres med indbygget auth, row-level security, realtime og storage — perfekt for et lille team, og skalerer med jer. 
- **Fast API**: (Udvikles i Python) når vi skal skalere dataen, og der kommer mange på, skal der udvikles et API.
- **Web-først**: én kodebase i starten; native apps kommer, når produktet er valideret.

---

## Design system

A dark **"club" base with gold as the main colour** and a teal contrast accent
(taken from the logo's party hat). Built with Tailwind CSS v4; the reusable
brand classes live in `src/app/globals.css`.

### Colour palette

| Token | Hex | Usage |
| --- | --- | --- |
| **Gold — primary** | `#FCBE4F` | Main brand colour: primary buttons (dark text), links, highlights, party map markers |
| Gold — hover | `#fdca6b` | Primary-button hover |
| Gold — light | `#FDE3A7` | Gradient start (wordmark, charts, logo) |
| Gold — deep | `#E8972E` | Gradient end |
| **Teal — contrast** | `#63bfcb` | Secondary accent: aurora/glow, the "me" map marker |
| Base / background | `#120d22` | App background, safe areas, glass base |
| Glass | `white 4%` fill, `white 10%` border | Frosted cards (`.glass-card`) |

### Text hierarchy (Tailwind `zinc`)

| Level | Class | Use |
| --- | --- | --- |
| Primary | `text-white` / `zinc-100` | Headings, key values |
| Secondary | `zinc-200` / `zinc-300` | Body, descriptions, labels |
| Muted | `zinc-400` | Hints, timestamps, counts |

### Status colours (semantic)

| Meaning | Colour |
| --- | --- |
| Going / accepted / active | Emerald (`emerald-400`) |
| Pending | Amber (`amber-400`) |
| Declined / blocked / destructive | Red (`red-400`) |
| Public / private party | Gold / muted zinc |

### Gradients

- **Wordmark · charts · logo:** ` #FDE3A7 → #FCBE4F → #E8972E` (left → right).
- **Background aurora:** a slowly rotating gold ↔ teal conic gradient over the
  dark base, with three drifting glow blobs (gold / teal / orange). All motion
  is paused under `prefers-reduced-motion`.

### Typography

- **Geist Sans** for UI and **Geist Mono** for code/emails, loaded via
  `next/font`.

### Logo & icons

- **Logo:** a balloon mark + **PARTYMAKR** wordmark in gold; a standalone
  balloon mark is used for headers and the favicon
  (`public/pm-mark.png`, `src/app/icon.png`).
- **Icons:** [lucide-react](https://lucide.dev) — one consistent line-icon set,
  no emoji.

### Reusable brand classes (`globals.css`)

`brand-gradient` · `club-bg` · `glass-card` ·
`btn-primary` / `btn-secondary` / `btn-ghost` ·
`auth-input` / `auth-label` / `auth-link` ·
`.aurora` + `glow-a/b/c` · `.pm-spinner` · `.pm-range`

### Implementation notes

- **Maps:** Leaflet + OpenStreetMap tiles (no API key), loaded client-only via
  `dynamic(..., { ssr: false })`; gold/teal marker pins.
- **Date picker:** react-datepicker with the Danish locale
  (`dd/MM/yyyy HH:mm`), themed dark/gold.
- **Mobile:** `viewport-fit=cover`, a dark `themeColor`, and safe-area insets so
  there are no white borders on phones.

> The app UI is in **Danish**; this design reference is kept in English for
> convenience.

Skrivelse fra det uformelle møde. 
Man skal kunne sortere på alder fx? 

Forretningsmodel
Gæsterne skal betal hvis de gerne vil have vist detaljerne for en specifik fest. 

Kollegier afholder nogen fester fx og gæsterne downloader appen fx for lad os sige en drink eller 2.

Søgemuligheder 
Alder
Køn
Sted

Måske et billede på festen



Rate hinadnen på fest vært / fest afholder 
Rate hinaden som gæst også 