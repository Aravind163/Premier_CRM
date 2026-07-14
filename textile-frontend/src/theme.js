// ── Shared design tokens ─────────────────────────────────────────────
export const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Light mode G tokens
export const G = {
  bg:          "#F5F7FA",
  sidebar:     "#0F2138",
  card:        "#ffffff",
  surface:     "#EAEFF5",
  border:      "rgba(15, 33, 56, 0.18)",
  accent:      "#1F5C99",
  accentLight: "#5B9BD9",
  textMain:    "#0F2138",
  textSub:     "#526073",
  textLabel:   "#101B28",
  font:        "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

// Returns theme-aware G tokens based on isDark flag
export function getG(isDark) {
  if (!isDark) return G;
  return {
    bg:          "#081422",
    sidebar:     "#081422",
    card:        "#0F2138",
    border:      "#1F3A5C",
    accent:      "#1F5C99",
    accentLight: "#5B9BD9",
    textMain:    "#F5F7FA",
    textSub:     "#8C96A3",
    textLabel:   "#5B9BD9",
    font:        "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  };
}

// Row color palette – one per product category/type
export const ROW_COLORS = {
  yarn:    { bg: "rgba(247,232,203,0.22)", border: "rgba(214,148,38,0.22)",  dot: "#D69426" },
  cloth:   { bg: "rgba(216,230,243,0.22)", border: "rgba(91,155,217,0.22)",  dot: "#5B9BD9" },
  dhoti:   { bg: "rgba(234,239,245,0.22)", border: "rgba(46,122,114,0.18)",   dot: "#1F5C99" },
  blouse:  { bg: "rgba(255,210,220,0.22)", border: "rgba(178,58,58,0.20)",  dot: "#B23A3A" },
  uniform: { bg: "rgba(231,220,242,0.22)", border: "rgba(140,90,230,0.20)",  dot: "#4A2E7A" },
  Others:  { bg: "rgba(247,232,203,0.22)", border: "rgba(214,148,38,0.20)",  dot: "#D69426" },
  bundle:  { bg: "rgba(219,236,233,0.22)", border: "rgba(46,122,114,0.20)",  dot: "#2aadad" },
  hank:    { bg: "rgba(247,232,203,0.22)", border: "rgba(168,112,31,0.20)",  dot: "#A8701F" },
  cone:    { bg: "rgba(234,239,245,0.22)", border: "rgba(46,122,114,0.20)",   dot: "#2E7A72" },
};

export const ROW_COLORS_DARK = {
  yarn:    { bg: "rgba(247,232,203,0.08)", border: "rgba(214,148,38,0.15)",  dot: "#D69426" },
  cloth:   { bg: "rgba(216,230,243,0.08)", border: "rgba(91,155,217,0.15)",  dot: "#5B9BD9" },
  dhoti:   { bg: "rgba(234,239,245,0.08)", border: "rgba(46,122,114,0.12)",   dot: "#1F5C99" },
  blouse:  { bg: "rgba(255,210,220,0.08)", border: "rgba(178,58,58,0.12)",  dot: "#B23A3A" },
  uniform: { bg: "rgba(231,220,242,0.08)", border: "rgba(140,90,230,0.12)",  dot: "#4A2E7A" },
  Others:  { bg: "rgba(247,232,203,0.08)", border: "rgba(214,148,38,0.12)",  dot: "#D69426" },
  bundle:  { bg: "rgba(219,236,233,0.08)", border: "rgba(46,122,114,0.12)",  dot: "#2aadad" },
  hank:    { bg: "rgba(247,232,203,0.08)", border: "rgba(168,112,31,0.12)",  dot: "#A8701F" },
  cone:    { bg: "rgba(234,239,245,0.08)", border: "rgba(46,122,114,0.12)",   dot: "#2E7A72" },
};

export function getRowColors(isDark) {
  return isDark ? ROW_COLORS_DARK : ROW_COLORS;
}

export const statusColor = (s) => {
  const map = {
    pending:    { bg: "rgba(214,148,38,0.12)",  color: "#8A5A0E", border: "rgba(214,148,38,0.30)" },
    assigned:   { bg: "rgba(123,76,199,0.12)",  color: "#3A2560", border: "rgba(123,76,199,0.30)" },
    approved:   { bg: "rgba(15,33,56,0.12)",  color: "#3A5C8C", border: "rgba(15,33,56,0.30)" },
    declined:   { bg: "rgba(178,58,58,0.10)",   color: "#96302F", border: "rgba(178,58,58,0.26)" },
    active:     { bg: "rgba(15,33,56,0.12)",   color: "#3A5C8C", border: "rgba(15,33,56,0.30)" },
    inactive:   { bg: "rgba(150,150,150,0.12)", color: "#526073", border: "rgba(150,150,150,0.28)" },
    delivered:  { bg: "rgba(15,33,56,0.12)",   color: "#8A5A0E", border: "rgba(15,33,56,0.30)" },
    processing: { bg: "rgba(58,92,140,0.10)",  color: "#3A5C8C", border: "rgba(58,92,140,0.26)" },
    dispatched: { bg: "rgba(74,46,122,0.12)",  color: "#3A2560", border: "rgba(74,46,122,0.28)" },
  };
  return map[(s || "").toLowerCase()] || map.pending;
};