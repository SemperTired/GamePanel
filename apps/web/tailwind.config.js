export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        display: ["Rajdhani", "Inter", "sans-serif"],
      },
      colors: {
        panel: "#07111f",
        ink: "#e7f4ff",
        cyan: "#19c7ff",
        royal: "#4f7cff",
        violet: "#8b5cf6",
      },
    },
  },
  plugins: [],
};
