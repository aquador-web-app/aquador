import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    // ✅ Fix blank page on older iOS Safari / WebViews
    legacy({
      targets: ["defaults", "Safari >= 13", "iOS >= 13"],
      // helps when dependencies ship modern syntax
      modernPolyfills: true,
    }),

    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",

      // ✅ iOS Safari is sensitive; avoid aggressive SW behavior
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: false,     // 👈 change
        clientsClaim: false,    // 👈 change
      },

      includeAssets: [
        "favicon.ico",
        "favicon-16x16.ico",
        "favicon-32x32.ico",
        "apple-touch-icon.ico",
      ],
    }),
  ],
});
