import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The phone surface is a second entry in the same project, so it ships from
    // /mobile.html on the site's own origin and needs no separate host or API base.
    rollupOptions: {
      input: { main: "index.html", mobile: "mobile.html" }
    }
  }
});
