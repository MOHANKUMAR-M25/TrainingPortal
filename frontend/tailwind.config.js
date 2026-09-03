/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Small-phone breakpoint (iPhone SE / older Androids are 320–414px wide).
      screens: {
        xs: "420px"
      },
      colors: {
        german: {
          black: "#0f0f0f",
          red: "#DD0000",
          gold: "#FFCC00"
        },
        brand: {
          50: "#fffbea",
          100: "#fff3c4",
          500: "#f0b429",
          600: "#de911d",
          700: "#cb6e17"
        }
      },
      fontFamily: {
        display: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      animation: {
        "fade-in-up": "fadeInUp 0.7s ease-out both",
        "fade-in": "fadeIn 1s ease-out both"
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        }
      }
    }
  },
  plugins: []
};
