import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      // Proxy REST + streaming + websocket to the embedded Rust (axum) server
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/stream": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:8080",
        ws: true,
      },
    },
  },
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
    rollupOptions: {
      output: {
        // Keep framework code in a stable cacheable chunk. Route-level lazy imports
        // keep the admin application out of the customer download.
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
    // Strip development logging and debugger statements from the release bundle.
    esbuild: { drop: ["console", "debugger"] },
  },
}));
