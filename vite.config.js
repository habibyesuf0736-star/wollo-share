import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (mode === "production" && env.VITE_DATA_MODE !== "supabase") {
    throw new Error("Production builds require VITE_DATA_MODE=supabase.");
  }

  if (env.VITE_DATA_MODE === "supabase" && (!supabaseUrl || !supabasePublishableKey)) {
    throw new Error("Supabase mode requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  if (mode === "production") {
    let parsedSupabaseUrl;
    try {
      parsedSupabaseUrl = new URL(supabaseUrl);
    } catch {
      throw new Error("VITE_SUPABASE_URL must be a valid HTTPS URL for production.");
    }
    if (parsedSupabaseUrl.protocol !== "https:") {
      throw new Error("VITE_SUPABASE_URL must use HTTPS for production.");
    }
  }

  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          ...(env.VITE_DATA_MODE === "supabase" && {
            manualChunks(id) {
              if (id.includes("@supabase/")) return "supabase";
            }
          })
        }
      }
    }
  };
});
