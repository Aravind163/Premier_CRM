// ── Shared design tokens ─────────────────────────────────────────────
export const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Light mode G tokens
export const G = {
  bg:          "#f0f5f1",
  sidebar:     "#1a3d2b",
  card:        "#ffffff",
  surface:     "#F1F5F9",
  border:      "rgba(27,77,46,0.18)",
  accent:      "#2d6a4f",
  accentLight: "#52b788",
  textMain:    "#1a3d2b",
  textSub:     "#4a7a5a",
  textLabel:   "#3d6b50",
  font:        "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

// Returns theme-aware G tokens based on isDark flag
export function getG(isDark) {
  if (!isDark) return G;
  return {
    bg:          "#090D16",
    sidebar:     "#0d1f17",
    card:        "#111827",
    border:      "#22314D",
    accent:      "#17a370",
    accentLight: "#34D399",
    textMain:    "#F8FAFC",
    textSub:     "#94A3B8",
    textLabel:   "#34D399",
    font:        "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  };
}

// Row color palette – one per product category/type
export const ROW_COLORS = {
  yarn:    { bg: "rgba(252,231,153,0.22)", border: "rgba(220,180,40,0.22)",  dot: "#d4a017" },
  cloth:   { bg: "rgba(186,225,255,0.22)", border: "rgba(80,160,230,0.22)",  dot: "#3a9bd5" },
  dhoti:   { bg: "rgba(200,245,200,0.22)", border: "rgba(60,180,90,0.18)",   dot: "#2e9e50" },
  blouse:  { bg: "rgba(255,210,220,0.22)", border: "rgba(220,80,110,0.20)",  dot: "#d0455e" },
  uniform: { bg: "rgba(220,200,255,0.22)", border: "rgba(140,90,230,0.20)",  dot: "#7b4cc7" },
  Others:  { bg: "rgba(255,230,200,0.22)", border: "rgba(230,150,60,0.20)",  dot: "#d07a2a" },
  bundle:  { bg: "rgba(200,240,240,0.22)", border: "rgba(50,180,180,0.20)",  dot: "#2aadad" },
  hank:    { bg: "rgba(240,225,200,0.22)", border: "rgba(190,140,80,0.20)",  dot: "#b07030" },
  cone:    { bg: "rgba(210,230,210,0.22)", border: "rgba(90,150,90,0.20)",   dot: "#4a904a" },
};

export const ROW_COLORS_DARK = {
  yarn:    { bg: "rgba(252,231,153,0.08)", border: "rgba(220,180,40,0.15)",  dot: "#d4a017" },
  cloth:   { bg: "rgba(186,225,255,0.08)", border: "rgba(80,160,230,0.15)",  dot: "#3a9bd5" },
  dhoti:   { bg: "rgba(200,245,200,0.08)", border: "rgba(60,180,90,0.12)",   dot: "#2e9e50" },
  blouse:  { bg: "rgba(255,210,220,0.08)", border: "rgba(220,80,110,0.12)",  dot: "#d0455e" },
  uniform: { bg: "rgba(220,200,255,0.08)", border: "rgba(140,90,230,0.12)",  dot: "#7b4cc7" },
  Others:  { bg: "rgba(255,230,200,0.08)", border: "rgba(230,150,60,0.12)",  dot: "#d07a2a" },
  bundle:  { bg: "rgba(200,240,240,0.08)", border: "rgba(50,180,180,0.12)",  dot: "#2aadad" },
  hank:    { bg: "rgba(240,225,200,0.08)", border: "rgba(190,140,80,0.12)",  dot: "#b07030" },
  cone:    { bg: "rgba(210,230,210,0.08)", border: "rgba(90,150,90,0.12)",   dot: "#4a904a" },
};

export function getRowColors(isDark) {
  return isDark ? ROW_COLORS_DARK : ROW_COLORS;
}

export const statusColor = (s) => {
  const map = {
    approved:   { bg: "rgba(45,106,79,0.12)",  color: "#1a5fa0", border: "rgba(45,106,79,0.30)" },
    pending:    { bg: "rgba(200,160,40,0.12)",  color: "#8a6510", border: "rgba(200,160,40,0.30)" },
    declined:   { bg: "rgba(200,60,50,0.10)",   color: "#a03025", border: "rgba(200,60,50,0.26)" },
    active:     { bg: "rgba(45,106,79,0.12)",   color: "#1a5fa0", border: "rgba(45,106,79,0.30)" },
    inactive:   { bg: "rgba(150,150,150,0.12)", color: "#5a5a5a", border: "rgba(150,150,150,0.28)" },
    delivered:  { bg: "rgba(45,106,79,0.12)",   color: "#8a6510", border: "rgba(45,106,79,0.30)" },
    processing: { bg: "rgba(60,130,200,0.10)",  color: "#1a5fa0", border: "rgba(60,130,200,0.26)" },
    dispatched: { bg: "rgba(124,90,200,0.12)",  color: "#5a3d9e", border: "rgba(124,90,200,0.28)" },
  };
  return map[(s || "").toLowerCase()] || map.pending;
};
