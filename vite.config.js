import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy: w trybie deweloperskim żądania /api kierujemy do lokalnego serwera (server.js),
// który dopiero woła Anthropic API z kluczem trzymanym po stronie serwera.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});