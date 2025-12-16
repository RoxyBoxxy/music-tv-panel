/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./views/**/*.ejs",
    "./views/*.ejs",
    "./*.ejs",
    "./public/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        fluxtv: {
          bg: "#05000b",
          purple: "#b36bff",
          purpleSoft: "#8b5bff"
        }
      },
      fontFamily: {
        display: ["system-ui", "sans-serif"],
        body: ["system-ui", "sans-serif"]
      },
      boxShadow: {
        neon: "0 0 35px rgba(179,107,255,0.8)"
      },
      animation: {
        "float-slow": "float 12s ease-in-out infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-15px,0)" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 25px rgba(179,107,255,0.4)" },
          "50%": { boxShadow: "0 0 45px rgba(179,107,255,0.9)" }
        }
      }
    },
  },
  plugins: [],
}
