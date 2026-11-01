# Wollo Share — Android app

Everything the phone build needs lives in this folder. The website, the API and the admin
dashboard stay where they were; the app is a second surface over the same data.

| Path | What it is |
| --- | --- |
| `android/` | The Capacitor (8.6) Gradle project — opened by Android Studio, built from the command line. |
| `app-dist/` | Generated. The app surface (`/app.html`) plus its chunks, copied out of `dist/` and renamed `index.html`. Never edit. |
| `icon/` | Master icon PNGs (1024 and the 512 store sizes). The `res/mipmap-*` sets inside `android/` are cut from these. |
| `android-shell/` | The hand-written WebView activity kept only as a reference for how a remote shell was pointed at the site. |

## Build the APK

Run all three steps from the **project root** — the Capacitor CLI reads `capacitor.config.ts`
there and resolves `webDir` and `android.path` against that directory.

```bash
npm run build          # dist/ (vite build + prerendered SEO pages)
npm run app:bundle     # dist/app.html -> mobile-app/app-dist/
npx cap sync android   # copies app-dist into android/app/src/main/assets/public
cd mobile-app/android && ./gradlew assembleDebug
```

The APK lands at `mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`; a copy is kept
at `mobile-app/wollo-share-debug.apk` for installing on a phone (both are git-ignored).

Toolchain already pinned inside `android/`: Gradle 8.14.3 (`gradle-wrapper.properties` points
at a local zip under `C:/Users/habib/gradle-dl/`), Android Gradle Plugin 8.13, compileSdk 36,
minSdk 24, JDK 21 (`org.gradle.java.home` in `gradle.properties`), SDK path in
`local.properties` — both of those files are machine-specific and ignored by git.

## How the app reaches the data

The bundle is on the device, so `src/app/main.jsx` injects `<base href="https://wollo-share.vercel.app/">`
when it detects Capacitor: links, images and `/materials/*.pdf` then resolve to the live site
instead of the local package. Root-relative `fetch("/api/…")` does **not** — the native bridge
answers those from its own asset server — so the same file wraps `window.fetch` and spells the
site origin onto every path that starts with `/`. `server.url` is deliberately **not** set in
`capacitor.config.ts`: the app opens offline-first from its own bundle, and `CapacitorHttp`
sends the API calls natively so the cross-origin request is not blocked.

Verified on `emulator-5554` with the debug APK: the WebView boots at `https://localhost/`,
`GET https://wollo-share.vercel.app/api/state` returns 200 through the native bridge, the home
tab shows the live counters and the Browse tab lists all 149 programs from the shared row.

## Launcher icon

`android/app/src/main/res/mipmap-*` holds the exported Wollo Share icon (square `ic_launcher.png`,
`ic_launcher_round.png`, plus `_background`/`_foreground`), and `mipmap-anydpi-v26/*.xml` composes
them as the adaptive icon over `@color/ic_launcher_background` (`#F48A56`). The PNGs in `icon/`
are the masters they were cut from.


Admin control comes from the shared state document: the **App** tab of the website dashboard
writes `appSettings` (`enabled`, `welcome`, `message`, `minimumVersion`, `updateUrl`,
`hidePremium`), and the app reads it at boot. Turning the app off, forcing an update or
changing the greeting needs no new APK.
