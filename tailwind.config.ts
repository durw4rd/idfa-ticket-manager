import type { Config } from "tailwindcss";

// Colours are CSS variables (RGB channels) defined in app/globals.css, so light and dark mode
// share one set of class names. Use these tokens rather than raw Tailwind colours.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "media",
  theme: {
    // One type scale for the whole app. Titles add `font-display` (semi-condensed, bold).
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      sm: ["0.875rem", { lineHeight: "1.25rem" }],
      base: ["1rem", { lineHeight: "1.5rem" }],
      lg: ["1.25rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }],
      xl: ["2rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }],
    },
    // One radius for surfaces, plus pills for buttons, chips and avatars
    borderRadius: {
      none: "0",
      DEFAULT: "0.75rem",
      full: "9999px",
    },
    extend: {
      colors: {
        paper: token("paper"),
        surface: token("surface"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        line: token("line"),
        "line-strong": token("line-strong"),
        spark: token("spark"),
        danger: token("danger"),
        ok: token("ok"),
        "on-crew": token("on-crew"),
        crew: {
          0: token("crew-0"),
          1: token("crew-1"),
          2: token("crew-2"),
          3: token("crew-3"),
          4: token("crew-4"),
          5: token("crew-5"),
        },
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
      },
      spacing: {
        tabbar: "4rem",
      },
    },
  },
  plugins: [],
};
export default config;
