/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "JetBrains Mono", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        elevated: v("elevated"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        subtle: v("subtle"),
        accent: v("accent"),
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
        violet: v("violet"),
      },
      borderRadius: { xl2: "14px", "4xl": "2rem" },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px -4px rgb(0 0 0 / 0.08)",
        float: "0 2px 6px rgb(0 0 0 / 0.04), 0 24px 48px -12px rgb(0 0 0 / 0.18)",
        modal: "0 0 0 0.5px rgb(0 0 0 / 0.1), 0 40px 100px -20px rgb(0 0 0 / 0.45)",
      },
    },
  },
  plugins: [],
};
