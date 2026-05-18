import { ImageResponse } from "next/og";

// Per-item food card images, generated server-side via Next.js ImageResponse.
// placehold.co's bundled fonts don't render emoji (they show tofu boxes), so
// we generate the cards ourselves using ImageResponse with the Twemoji
// emoji set — same engine that powers app/icon.tsx and app/apple-icon.tsx.
//
// Each request to /api/food-card/RC-BOX-COMBO returns a 600x600 PNG with
// brand color + food emoji + item name. Vercel caches the response at the
// edge so subsequent loads are fast.

type CardSpec = {
  emoji: string;
  brand: string;
  title: string;
  bg: string;
};

const CANES = "#DC2626";
const STARBUCKS = "#006241";

const ITEMS: Record<string, CardSpec> = {
  // Cane's mains
  "RC-BOX-COMBO":       { emoji: "🍗", brand: "Cane's", title: "Box Combo",          bg: CANES },
  "RC-CANIAC-COMBO":    { emoji: "🍗", brand: "Cane's", title: "Caniac Combo",       bg: CANES },
  "RC-SANDWICH-COMBO":  { emoji: "🥪", brand: "Cane's", title: "Sandwich Combo",     bg: CANES },
  "RC-3-FINGER-COMBO":  { emoji: "🍗", brand: "Cane's", title: "3 Finger Combo",     bg: CANES },
  "RC-KIDS-COMBO":      { emoji: "🍗", brand: "Cane's", title: "Kids Combo",         bg: CANES },
  "RC-TAILGATES-25":    { emoji: "🍗", brand: "Cane's", title: "Tailgates · 25",     bg: CANES },
  "RC-TAILGATES-50":    { emoji: "🍗", brand: "Cane's", title: "Tailgates · 50",     bg: CANES },
  "RC-TAILGATES-100":   { emoji: "🍗", brand: "Cane's", title: "Tailgates · 100",    bg: CANES },
  // Cane's sides
  "RC-FRIES":           { emoji: "🍟", brand: "Cane's", title: "Crinkle Fries",      bg: CANES },
  "RC-COLESLAW":        { emoji: "🥗", brand: "Cane's", title: "Coleslaw",           bg: CANES },
  "RC-TEXAS-TOAST":     { emoji: "🍞", brand: "Cane's", title: "Texas Toast",        bg: CANES },
  "RC-EXTRA-SAUCE":     { emoji: "🥫", brand: "Cane's", title: "Extra Sauce",        bg: CANES },
  // Cane's drinks
  "RC-LEMONADE":        { emoji: "🍋", brand: "Cane's", title: "Lemonade",           bg: CANES },
  "RC-SWEET-TEA":       { emoji: "🧋", brand: "Cane's", title: "Sweet Tea",          bg: CANES },
  "RC-WATER":           { emoji: "💧", brand: "Cane's", title: "Bottled Water",      bg: CANES },

  // Starbucks hot espresso
  "SB-LATTE":                  { emoji: "☕", brand: "Starbucks", title: "Caffè Latte",        bg: STARBUCKS },
  "SB-CAPPUCCINO":             { emoji: "☕", brand: "Starbucks", title: "Cappuccino",         bg: STARBUCKS },
  "SB-CAFFE-MOCHA":            { emoji: "☕", brand: "Starbucks", title: "Caffè Mocha",        bg: STARBUCKS },
  "SB-AMERICANO":              { emoji: "☕", brand: "Starbucks", title: "Americano",          bg: STARBUCKS },
  "SB-FLAT-WHITE":             { emoji: "☕", brand: "Starbucks", title: "Flat White",         bg: STARBUCKS },
  "SB-CARAMEL-MACCHIATO":      { emoji: "☕", brand: "Starbucks", title: "Caramel Macchiato",  bg: STARBUCKS },
  "SB-ESPRESSO-DOPPIO":        { emoji: "☕", brand: "Starbucks", title: "Espresso Doppio",    bg: STARBUCKS },
  "SB-VANILLA-LATTE":          { emoji: "☕", brand: "Starbucks", title: "Vanilla Latte",      bg: STARBUCKS },
  "SB-WHITE-MOCHA":            { emoji: "☕", brand: "Starbucks", title: "White Mocha",        bg: STARBUCKS },
  // Iced
  "SB-ICED-LATTE":             { emoji: "🧊", brand: "Starbucks", title: "Iced Latte",         bg: STARBUCKS },
  "SB-ICED-AMERICANO":         { emoji: "🧊", brand: "Starbucks", title: "Iced Americano",     bg: STARBUCKS },
  "SB-COLD-BREW":              { emoji: "🧊", brand: "Starbucks", title: "Cold Brew",          bg: STARBUCKS },
  "SB-NITRO-COLD-BREW":        { emoji: "🧊", brand: "Starbucks", title: "Nitro Cold Brew",    bg: STARBUCKS },
  "SB-ICED-CARAMEL-MACCHIATO": { emoji: "🧊", brand: "Starbucks", title: "Iced Caramel Macchiato", bg: STARBUCKS },
  // Frappuccinos
  "SB-MOCHA-FRAPP":            { emoji: "🥤", brand: "Starbucks", title: "Mocha Frappuccino",  bg: STARBUCKS },
  "SB-CARAMEL-FRAPP":          { emoji: "🥤", brand: "Starbucks", title: "Caramel Frappuccino", bg: STARBUCKS },
  "SB-JAVA-CHIP-FRAPP":        { emoji: "🥤", brand: "Starbucks", title: "Java Chip Frappuccino", bg: STARBUCKS },
  "SB-VANILLA-BEAN-FRAPP":     { emoji: "🥤", brand: "Starbucks", title: "Vanilla Bean Frapp",  bg: STARBUCKS },
  // Refreshers
  "SB-MANGO-DRAGONFRUIT":      { emoji: "🍓", brand: "Starbucks", title: "Mango Dragonfruit",  bg: STARBUCKS },
  "SB-STRAWBERRY-ACAI":        { emoji: "🍓", brand: "Starbucks", title: "Strawberry Açaí",    bg: STARBUCKS },
  "SB-PINK-DRINK":             { emoji: "🍓", brand: "Starbucks", title: "Pink Drink",         bg: STARBUCKS },
  // Tea
  "SB-CHAI-LATTE":             { emoji: "🍵", brand: "Starbucks", title: "Chai Latte",         bg: STARBUCKS },
  "SB-MATCHA-LATTE":           { emoji: "🍵", brand: "Starbucks", title: "Matcha Latte",       bg: STARBUCKS },
  "SB-ICED-GREEN-TEA":         { emoji: "🍵", brand: "Starbucks", title: "Iced Green Tea",     bg: STARBUCKS },
  // Hot choc
  "SB-HOT-CHOCOLATE":          { emoji: "🍫", brand: "Starbucks", title: "Hot Chocolate",      bg: STARBUCKS },
  // Pastry / sandwich / sweet
  "SB-ALMOND-CROISSANT":       { emoji: "🥐", brand: "Starbucks", title: "Almond Croissant",   bg: STARBUCKS },
  "SB-BLUEBERRY-MUFFIN":       { emoji: "🧁", brand: "Starbucks", title: "Blueberry Muffin",   bg: STARBUCKS },
  "SB-CHICKEN-PANINI":         { emoji: "🥪", brand: "Starbucks", title: "Chicken Panini",     bg: STARBUCKS },
  "SB-CHOC-CHIP-COOKIE":       { emoji: "🍪", brand: "Starbucks", title: "Choc-chip Cookie",   bg: STARBUCKS },
  "SB-CHEESECAKE":             { emoji: "🍰", brand: "Starbucks", title: "NY Cheesecake",      bg: STARBUCKS },
};

export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = ITEMS[id];

  // Fallback for unknown IDs — clean gray card with "?"
  if (!item) {
    return new ImageResponse(
      (
        <div
          style={{
            background: "#71717a",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 36,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {id}
        </div>
      ),
      { width: 600, height: 600 },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: item.bg,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 32,
        }}
      >
        <div style={{ fontSize: 220, lineHeight: 1, marginBottom: 8 }}>
          {item.emoji}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: 0.82,
            marginTop: 16,
          }}
        >
          {item.brand}
        </div>
        <div
          style={{
            fontSize: 46,
            fontWeight: 800,
            marginTop: 6,
            textAlign: "center",
            lineHeight: 1.1,
            display: "flex",
          }}
        >
          {item.title}
        </div>
      </div>
    ),
    {
      width: 600,
      height: 600,
      // Twemoji set renders emoji as SVG glyphs so they actually show up
      // (the default system fallback shows tofu/box characters).
      emoji: "twemoji",
    },
  );
}
