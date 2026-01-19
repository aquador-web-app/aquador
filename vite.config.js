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
      },

      includeAssets: [
        "favicon.ico",
        "favicon-16x16.ico",
        "favicon-32x32.ico",
        "apple-touch-icon.ico",
      ],

      manifest: {
  id: "/",
  scope: "/",
  name: "A'QUA D'OR",
  short_name: "A'QUA D'OR",
  display: "standalone",
  start_url: "/#/login",   // ✅ IMPORTANT
  background_color: "#ffffff",
  theme_color: "#0077b6",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
}
    }),
  ],
});
