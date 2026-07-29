// Shared by blockTemplates.js (per-block background override) and
// staticSiteGenerator.js (site-wide theme CSS variables) - one place for
// "hex in, usable CSS out" instead of duplicating color math in both.

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// amount: 0-100, percent to darken by (RGB channel multiply) - used to derive
// a hover shade from a single stored primary color instead of asking the
// user to pick two colors.
function darkenHex(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const factor = 1 - clamp(amount, 0, 100) / 100;
  const r = clamp(Math.round(((num >> 16) & 0xff) * factor), 0, 255);
  const g = clamp(Math.round(((num >> 8) & 0xff) * factor), 0, 255);
  const b = clamp(Math.round((num & 0xff) * factor), 0, 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Per-block background override, as an inline style string so it wins over
// the block's own Tailwind bg-* class without needing to touch or remove it.
// The overlay (bgImage + bgOverlayOpacity both set) is a solid-color gradient
// stacked on top of the image in the same background-image value - no extra
// wrapper element needed to darken an image for text legibility.
function buildBgStyle(props) {
  const { bgColor, bgImage, bgOverlayOpacity } = props || {};
  if (!bgColor && !bgImage) return "";
  const parts = [];
  if (bgColor) parts.push(`background-color:${bgColor}`);
  if (bgImage) {
    const opacity = bgOverlayOpacity ? Number(bgOverlayOpacity) : 0;
    const overlay = opacity > 0 ? `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity})),` : "";
    parts.push(`background-image:${overlay}url('${bgImage}')`, "background-size:cover", "background-position:center");
  }
  return parts.join(";");
}

// The site-wide theme CSS custom properties, applied at the document/body
// root so every block's arbitrary-value Tailwind classes (tw-bg-[var(--theme-primary,...)])
// resolve against it. Falls back to the seeded "Bucksbox Violet" preset's
// exact values when no theme is set, so an untouched site renders unchanged.
function buildThemeStyle(theme) {
  const colors = theme?.colors || {};
  const primary = colors.primary || "#6D28D9";
  const accent = colors.accent || "#F59E0B";
  const background = colors.background || "#FAFAFC";
  const text = colors.text || "#1F2937";
  const fontHeading = theme?.fontHeading || "Manrope";
  const fontBody = theme?.fontBody || "Inter";
  return [
    `--theme-primary:${primary}`,
    `--theme-primary-hover:${darkenHex(primary, 12)}`,
    `--theme-accent:${accent}`,
    `--theme-background:${background}`,
    `--theme-text:${text}`,
    `--theme-font-heading:'${fontHeading}'`,
    `--theme-font-body:'${fontBody}'`,
  ].join(";");
}

const GOOGLE_FONTS = {
  Inter: "Inter:wght@400;500;600;700",
  Poppins: "Poppins:wght@400;500;600;700",
  Manrope: "Manrope:wght@400;500;600;700",
  "Playfair Display": "Playfair+Display:wght@400;600;700",
  Montserrat: "Montserrat:wght@400;500;600;700",
  Roboto: "Roboto:wght@400;500;700",
  Lora: "Lora:wght@400;500;600;700",
  "Work Sans": "Work+Sans:wght@400;500;600;700",
};

// Only fonts in the curated GOOGLE_FONTS list get a <link> - anything else
// (or the default Inter/Manrope pairing, already loaded some other way today)
// is left alone rather than guessing at a Google Fonts family query string.
function googleFontsHref(theme) {
  const families = [...new Set([theme?.fontHeading, theme?.fontBody].filter((f) => f && GOOGLE_FONTS[f]))];
  if (!families.length) return null;
  const familyParams = families.map((f) => `family=${GOOGLE_FONTS[f]}`).join("&");
  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
}

module.exports = { darkenHex, buildBgStyle, buildThemeStyle, googleFontsHref, GOOGLE_FONTS };
