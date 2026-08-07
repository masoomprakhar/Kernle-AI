import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-haas)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-haas-display)", "Inter", "system-ui", "sans-serif"],
        pricing: ["var(--font-inter-display)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#181d26",
        "ink-active": "#0d1218",
        body: "#333840",
        muted: {
          DEFAULT: "#f8fafc",
          foreground: "#41454d",
        },
        hairline: "#dddddd",
        "border-strong": "#9297a0",
        canvas: "#ffffff",
        "surface-soft": "#f8fafc",
        "surface-strong": "#e0e2e6",
        "surface-dark": "#181d26",
        "surface-dark-elevated": "#1d1f25",
        coral: "#aa2d00",
        forest: "#0a2e0e",
        cream: "#f5e9d4",
        peach: "#fcab79",
        mint: "#a8d8c4",
        yellow: "#f4d35e",
        mustard: "#d9a441",
        link: {
          DEFAULT: "#1b61c9",
          active: "#1a3866",
        },
        info: {
          DEFAULT: "#254fad",
          border: "#458fff",
        },
        success: {
          DEFAULT: "#006400",
          border: "#39bf45",
        },
        "pricing-ink": "#1d1f25",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
      borderRadius: {
        xs: "2px",
        sm: "6px",
        md: "10px",
        lg: "12px",
        pill: "9999px",
      },
      spacing: {
        section: "96px",
      },
      maxWidth: {
        content: "1280px",
      },
      fontSize: {
        "display-xl": ["48px", { lineHeight: "1.1", fontWeight: "500" }],
        "display-lg": ["40px", { lineHeight: "1.2", fontWeight: "400" }],
        "display-md": ["32px", { lineHeight: "1.2", fontWeight: "400" }],
        "title-lg": ["24px", { lineHeight: "1.35", letterSpacing: "0.12px", fontWeight: "400" }],
        "title-md": ["20px", { lineHeight: "1.5", fontWeight: "400" }],
        "title-sm": ["18px", { lineHeight: "1.4", fontWeight: "500" }],
        "label-md": ["16px", { lineHeight: "1.4", fontWeight: "500" }],
        button: ["16px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-md": ["14px", { lineHeight: "1.25", fontWeight: "400" }],
        caption: ["14px", { lineHeight: "1.35", letterSpacing: "0.16px", fontWeight: "500" }],
      },
      boxShadow: {
        none: "none",
        "cta-soft": "0 1px 2px rgba(27, 97, 201, 0.08), 0 4px 12px rgba(24, 29, 38, 0.08)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
