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
        // NetworkOnly for all Supabase auth endpoints — never serve stale tokens
        urlPattern: /^https:\/\/.*\.supabase\.co\/auth\//,
        handler: 'NetworkOnly',
      },
      {
        // NetworkFirst with short expiration for other Supabase API calls
        urlPattern: /^https:\/\/.*\.supabase\.co\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 300, // 5 minutes
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        // CacheFirst for JS/CSS app shell assets
        urlPattern: /\.(?:js|css)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'app-shell-cache',
          expiration: {
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
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
