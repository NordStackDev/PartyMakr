import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PartyMakr",
  description: "Find fester i nærheden af dig — på et kort, ikke et feed.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#120d22",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="da"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="club-bg relative flex min-h-screen flex-col items-center justify-center sm:px-4">
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

          <div className="glass-card relative flex min-h-screen w-full max-w-[420px] flex-1 flex-col pt-[env(safe-area-inset-top)] text-zinc-100 sm:my-6 sm:min-h-0 sm:pt-0 sm:shadow-2xl sm:rounded-[2rem] sm:overflow-hidden">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
