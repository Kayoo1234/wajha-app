import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import DemoWatermark from "@/components/DemoWatermark";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wajha — Aura Discover",
  description:
    "AI-powered shopping discovery across Alshaya's Kuwait brands — fashion + food, one search.",
  // PWA / iOS Add-to-Home-Screen polish. Without appleWebApp, iOS opens
  // the installed icon in Safari with full chrome — defeats the point of
  // a home-screen install. With it, the app launches fullscreen with the
  // status bar styled to match our purple header.
  appleWebApp: {
    capable: true,
    title: "Wajha",
    statusBarStyle: "default",
  },
  applicationName: "Wajha",
  // Manifest is auto-served at /manifest.webmanifest from app/manifest.ts
};

export const viewport: Viewport = {
  themeColor: "#7C3AED",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Don't disable user zoom — accessibility + Arabic-script readability
  // both depend on it.
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col bg-[var(--aura-cream)] text-[var(--foreground)]"
        suppressHydrationWarning
      >
        <Header />
        <main className="flex-1">{children}</main>
        <DemoWatermark />
      </body>
    </html>
  );
}
