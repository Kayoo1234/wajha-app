import { ImageResponse } from "next/og";

// Apple-touch-icon (180x180) — iOS uses this when a user does
// Share → "Add to Home Screen" in Safari. Without this, iOS substitutes
// a generic screenshot icon, which looks like the prototype is broken.
//
// Slightly rounder corner radius via the background gradient so the icon
// reads well at iOS's automatic 22.37% corner rounding.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 120,
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
