import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // ✅ USE generateSW (default, SAFE)
      strategies: "generateSW",

      // ✅ allow your large bundle
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
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
