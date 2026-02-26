import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    // ✅ Fix blank page on older iOS Safari / WebViews
    legacy({
      // Use Browserslist-style targets for best results
      targets: ["defaults", "safari >= 12", "ios_saf >= 12"],
      modernPolyfills: true,
    }),

    VitePWA({
  registerType: "prompt",
  strategies: "generateSW",

  workbox: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 300,
          },
        },
      },
    ],
  },

  includeAssets: [
    "favicon.ico",
    "favicon-16x16.ico",
    "favicon-32x32.ico",
    "apple-touch-icon.ico",
  ],
}),
  ],

  // ✅ Force safer JS output for Safari/iOS
  build: {
    target: "es2015",
  },
  esbuild: {
    target: "es2015",
  },
});
