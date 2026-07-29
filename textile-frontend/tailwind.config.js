/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  corePlugins: {
    // IMPORTANT: disables Tailwind's base CSS reset, so it does not change
    // the look of any of the app's existing inline-style pages — Tailwind
    // is added here purely for its utility classes (grid, flex, gap, etc.).
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        pine: "#0F2138", pinedeep: "#081422", moss: "#1F5C99", mossdeep: "#164672",
        fern: "#5B9BD9", emerald: "#2E7A72", turmeric: "#D69426", turmericlight: "#EEC15E",
        rust: "#B23A3A", plum: "#3A5C8C", indigo: "#4A2E7A",
        ink: "#101B28", slate: "#526073", ivory: "#F5F7FA", parchment: "#EAEFF5", line: "#DBE3EC",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};