import type { Metadata, Viewport } from "next";
import { Nunito, Fredoka } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { BottomNav } from "@/components/nav/bottom-nav";
import { HelpGuide } from "@/components/help/help-guide";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

// Body / UI — soft, rounded, highly legible (harmonises with the logo).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

// Display / brand — rounded & chunky, echoes the PARTYMAKR wordmark.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PartyMakr",
  description: "Find fester i nærheden af dig på et kort, ikke i et feed.",
  applicationName: "PartyMakr",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PartyMakr",
  },
};

export const viewport: Viewport = {
  themeColor: "#14100b",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom intentionally left enabled for WCAG 2.2 (no maximumScale lock).
};

// Run the server functions next to the Supabase project (eu-central-1 /
// Frankfurt) so auth + DB round-trips stay in-region instead of crossing the
// Atlantic. Cascades to every route under the root layout.
export const preferredRegion = "fra1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="da"
      className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only z-[2000] rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-zinc-950 focus:not-sr-only focus:absolute focus:left-1/2 focus:top-2 focus:-translate-x-1/2"
        >
          Spring til indhold
        </a>
        <div className="club-bg relative flex min-h-dvh flex-col items-center justify-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:px-4">
          {/* Neon club glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            {/* Rotating aurora */}
            <div className="aurora absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax]" />
            {/* Drifting glow blobs */}
            <div className="glow-a absolute -left-24 -top-24 h-96 w-96 rounded-full bg-amber-500/55 blur-3xl" />
            <div className="glow-b absolute -right-20 top-1/3 h-96 w-96 rounded-full bg-[#63bfcb]/55 blur-3xl" />
            <div className="glow-c absolute -bottom-10 left-1/4 h-96 w-96 rounded-full bg-amber-400/45 blur-3xl" />
          </div>

          <div className="glass-card relative flex h-dvh w-full max-w-[420px] flex-col overflow-hidden pt-[env(safe-area-inset-top)] text-zinc-100 sm:my-6 sm:h-[min(860px,90dvh)] sm:pt-0 sm:shadow-2xl sm:rounded-[2rem]">
            <div
              id="main"
              tabIndex={-1}
              className="@container/frame scroll-touch flex min-h-0 flex-1 flex-col overflow-y-auto outline-none"
            >
              {children}
            </div>
            <BottomNav />
            <HelpGuide />
          </div>
        </div>
        <ServiceWorkerRegister />
        <RealtimeProvider />
      </body>
    </html>
  );
}
