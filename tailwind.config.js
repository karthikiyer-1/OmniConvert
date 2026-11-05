/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        elevated: v("elevated"),
        fg: v("fg"),
        muted: v("muted"),
        subtle: v("subtle"),
        line: v("line"),
        accent: v("accent"),
        success: v("success"),
        danger: v("danger"),
      },
      fontSize: {
        // Apple-like scale: [size, { lineHeight, letterSpacing }]
        caption: ["12px", { lineHeight: "16px", letterSpacing: "0" }],
        footnote: ["13px", { lineHeight: "18px", letterSpacing: "-0.003em" }],
        body: ["15px", { lineHeight: "22px", letterSpacing: "-0.009em" }],
        callout: ["17px", { lineHeight: "26px", letterSpacing: "-0.022em" }],
        lead: ["21px", { lineHeight: "30px", letterSpacing: "-0.016em" }],
        title: ["24px", { lineHeight: "30px", letterSpacing: "-0.02em" }],
        headline: ["40px", { lineHeight: "44px", letterSpacing: "-0.03em" }],
        hero: ["64px", { lineHeight: "68px", letterSpacing: "-0.035em" }],
      },
      borderRadius: {
        card: "28px",
      },
      boxShadow: {
        // Layered, diffused, barely-there.
        popover: "0 0 0 1px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.04), 0 16px 40px rgb(0 0 0 / 0.08)",
        modal: "0 0 0 1px rgb(0 0 0 / 0.04), 0 24px 80px rgb(0 0 0 / 0.16)",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        400: "400ms",
      },
    },
  },
  plugins: [],
};
