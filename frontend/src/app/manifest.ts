import type { MetadataRoute } from "next";

// Next.js 16 generates /manifest.webmanifest from this file at build time.
// iOS Safari uses manifest + apple-icon to support "Add to Home Screen" —
// the family-beta path for the Wajha PWA.
//
// display: "standalone" makes the installed app open without the Safari
// URL bar / chrome — feels like a native app on the iPhone home screen.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wajha — AI shopping for Alshaya",
    short_name: "Wajha",
    description:
      "Cross-brand AI discovery for Alshaya Kuwait — fashion and food, one search.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FFFFFF",
    theme_color: "#7C3AED",
    icons: [
      // Next.js generates these from app/icon.tsx + app/apple-icon.tsx
      // at build time; we declare them here for the manifest to reference.
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
    categories: ["shopping", "lifestyle", "food"],
    lang: "en",
    scope: "/",
  };
}
