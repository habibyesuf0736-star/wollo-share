import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The APK ships the app surface itself, so it opens instantly and keeps its saved library
 * offline. Everything it reads — the shared state document and the material files — still
 * comes from the live site, which is why the bundle injects a <base href> when it detects
 * it is running on a device, and why the requests go out through native HTTP instead of
 * the WebView's cross-origin rules.
 *
 * Everything the phone needs lives under `mobile-app/`: the generated Gradle project, the
 * bundled surface and the master icons. Capacitor itself must still be run from this root,
 * because the CLI resolves both `webDir` and `android.path` against the folder holding this
 * file.
 */
const config: CapacitorConfig = {
  appId: "com.wolloshare.app",
  appName: "Wollo Share",
  webDir: "mobile-app/app-dist",
  android: {
    path: "mobile-app/android",
  },
  server: {
    androidScheme: "https",
    cleartext: false,
    allowNavigation: ["wollo-share.vercel.app"],
  },
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
