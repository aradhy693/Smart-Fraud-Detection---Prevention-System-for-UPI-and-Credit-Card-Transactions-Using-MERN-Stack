/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95"
        }
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0, 0, 0, 0.34)",
        glow: "0 0 0 1px rgba(124, 58, 237, 0.18), 0 18px 60px rgba(0, 0, 0, 0.38)"
      }
    }
  },
  plugins: []
};
