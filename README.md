# PartyMakr

A location-based party discovery app. Find parties happening near you on a map — public events, friends' gatherings, or private parties shared with you.

---

## English

### Concept

PartyMakr is a social app for discovering parties around you. Unlike swipe-based apps such as Tinder, PartyMakr is built around a **map-first experience**: when you open the app, you see actual parties happening near your location rather than scrolling through profiles. This makes the experience less superficial and centered on real events instead of appearances.

### How it works

1. **Sign up / log in** to create an account.
2. **Share your location** so the app can find parties near you.
3. **Browse the map** to see parties in your area — both public events and private parties that have been shared with you.
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
| Maps             | Mapbox or Google Maps (TBD)               |
| Styling          | Tailwind CSS (recommended)                |

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

PartyMakr er en social app til at finde fester i nærheden af dig. I modsætning til swipe-baserede apps som Tinder er PartyMakr bygget op om en **kort-først-oplevelse**: når du åbner appen, ser du faktiske fester, der finder sted i nærheden af din placering, i stedet for at scrolle gennem profiler. Det gør oplevelsen mindre overfladisk og centreret om rigtige events frem for udseende.

### Sådan fungerer det

1. **Opret bruger / log ind** for at oprette en konto.
2. **Del din placering**, så appen kan finde fester i nærheden.
3. **Se kortet** med fester i dit område — både offentlige events og private fester, du er blevet inviteret til.
4. **Opret din egen fest**, sæt den som offentlig eller privat, og inviter folk.

### Kernefunktioner (MVP)

- Brugerlogin (email/adgangskode, social login senere)
- Placeringstilladelse og live kortvisning
- Opret, rediger og slet fester
- Offentlig vs. privat synlighed
- Festdetaljer: titel, beskrivelse, placering, tidspunkt, vært, gæsteliste
- Find fester inden for en justerbar radius

### Tech stack

| Lag              | Valg                                       |
| ---------------- | ------------------------------------------ |
| Frontend         | Next.js (React) — App Router + TypeScript  |
| Hosting          | Vercel                                     |
| Database & Auth  | Supabase (Postgres + Auth + Storage)       |
| Kort             | Mapbox eller Google Maps (101: Tag stilling)       |
| Styling          | Tailwind CSS (anbefalet)                   |

### Roadmap

- **Fase 1 — Web app (MVP)**: responsiv Next.js-webapp deployet på Vercel.
- **Fase 2 — PWA**: kan installeres på telefoner, virker offline.
- **Fase 3 — Native mobil**: pak webappen ind med Capacitor eller React Native til iOS og Android, så størstedelen af React-koden genbruges.

### Hvorfor netop denne stack

- **Next.js + Vercel**: hurtig udvikling, serverless deploy, god udvikleroplevelse.
- **Supabase**: Postgres med indbygget auth, row-level security, realtime og storage — perfekt for et lille team, og skalerer med jer.
- **Web-først**: én kodebase i starten; native apps kommer, når produktet er valideret.
