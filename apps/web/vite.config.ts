import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Vite config for the Cloister Console front-end.
// Dev server pinned to 5180. Ships as an installable PWA with an offline app shell.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "robots.txt"],
      manifest: {
        name: "Cloister Console",
        short_name: "Cloister",
        description: "Private, compliant stablecoin payments on any EVM chain.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#050506",
        theme_color: "#050506",
        lang: "en",
        categories: ["finance", "business"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the app shell + code chunks. Keep the heavy, on-demand assets
        // (29 MB gnark WASM prover, the pdf.js worker) OUT of precache — they are
        // runtime-cached the first time a feature needs them.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,mjs}"],
        globIgnores: ["**/gnark/**", "**/pdf.worker*"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/gnark\/.*\.(wasm|js)$/,
            handler: "CacheFirst",
            options: { cacheName: "cloister-gnark", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /\/assets\/pdf\.worker.*\.mjs$/,
            handler: "CacheFirst",
            options: { cacheName: "cloister-pdfworker", expiration: { maxEntries: 4 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
});
