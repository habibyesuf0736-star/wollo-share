import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@supabase/")) return "supabase";
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001"
    }
  }
});
