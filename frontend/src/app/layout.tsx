import type { Metadata } from "next";
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
  title: "Aura • Discover — powered by Wajha",
  description:
    "AI-powered shopping discovery across Alshaya's Kuwait brands — demo for Nida Unas",
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
