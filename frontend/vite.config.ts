import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      //
      // =====================================================
      // SERVICE WORKER CUSTOMIZADO
      // =====================================================
      //

      strategies: "injectManifest",

      srcDir: "src",

      filename: "sw.ts",

      registerType: "autoUpdate",

      //
      // =====================================================
      // MANIFESTO DO NEXO
      // =====================================================
      //

      manifest: {
        name: "NEXO",

        short_name: "NEXO",

        description:
          "Seu segundo cérebro pessoal.",

        theme_color: "#0c0d11",

        background_color: "#0c0d11",

        display: "standalone",

        start_url: "/",

        icons: [
          {
            src: "pwa-192x192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },

          {
            src: "pwa-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      },

      //
      // =====================================================
      // INJECT MANIFEST
      // =====================================================
      //

      injectManifest: {
        globPatterns: [
          "**/*.{js,css,html,svg,woff,woff2}"
        ]
      }
    })
  ]
});