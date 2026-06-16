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
      <body className="min-h-full flex flex-col items-center bg-zinc-100 dark:bg-zinc-950">
        <div className="flex w-full max-w-[420px] flex-1 flex-col bg-background sm:my-6 sm:rounded-[2rem] sm:shadow-2xl sm:overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
