import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  description: "Find parties happening near you — on a map, not a feed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="club-bg relative flex min-h-screen flex-col items-center justify-center sm:px-4">
          {/* Neon club glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-600/30 blur-3xl" />
            <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl" />
            <div className="absolute -bottom-10 left-1/4 h-80 w-80 rounded-full bg-pink-600/20 blur-3xl" />
          </div>

          <div className="glass-card relative flex min-h-screen w-full max-w-[420px] flex-1 flex-col text-zinc-100 sm:my-6 sm:min-h-0 sm:rounded-[2rem] sm:shadow-2xl sm:overflow-hidden">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
