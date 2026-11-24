/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || "http://localhost:8001";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "SchoolBus Pro",
        short_name: "SchoolBus",
        description: "School transport management: live bus tracking, attendance, fees and alerts.",
        theme_color: "#1e3a8a",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        scope: "/",
        orientation: "portrait",
        categories: ["education", "navigation"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Live tracking", url: "/parent/track", description: "See where the bus is" },
          { name: "Today's trips", url: "/driver", description: "Driver trip list" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: devProxyTarget, changeOrigin: true },
      "/media": { target: devProxyTarget, changeOrigin: true },
      "/ws": { target: devProxyTarget.replace("http", "ws"), ws: true, changeOrigin: true },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "axios", "dayjs"],
          antd: ["antd", "@ant-design/icons"],
          map: ["leaflet", "react-leaflet"],
          charts: ["recharts"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // Ant Design drawer/modal flows under jsdom are slow when the machine is loaded (parallel workers + dev servers).
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
