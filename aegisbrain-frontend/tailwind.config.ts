import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        paper: "#F2F6FD", // page background, a blue-tinted white
        mist: "#E4ECFA", // soft blue surfaces
        ice: "#D3E1FB", // hairlines and borders
        ink: "#0B1A33", // text and dark panels
        muted: "#5B6B86", // secondary text
        cobalt: "#2B54F0", // the one accent
        allow: "#0F9D6B",
        hold: "#B7791F",
        deny: "#D42B4D",
      },
    },
  },
  plugins: [],
};

export default config;