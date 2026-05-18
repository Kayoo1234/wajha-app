import { ImageResponse } from "next/og";

// Wajha icon — generated at build time via Next.js ImageResponse. Avoids
// shipping a static PNG so the icon is always in sync with brand colors.
// 192x192 is the PWA-spec icon for Android / Chrome Add-to-Home-Screen.

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 130,
          background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "-0.04em",
        }}
      >
        W
      </div>
    ),
    { ...size },
  );
}
