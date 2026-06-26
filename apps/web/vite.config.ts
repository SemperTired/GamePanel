import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 4000),
    proxy: {
      "/api": "http://127.0.0.1:4100",
      "/ws": { target: "ws://127.0.0.1:4100", ws: true },
    },
  },
});
