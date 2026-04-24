import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GitHub Pages serves from /<repo>/ by default; override via HOSAKA_BASE env var
// (set by the GH Pages workflow) to support project pages + custom domains.
const base = process.env.HOSAKA_BASE ?? "/";

// Sourcemaps default to on for the hosted build (no Pi RAM constraint).
// Set HOSAKA_SOURCEMAP=0 to disable.
const wantSourcemaps = process.env.HOSAKA_SOURCEMAP !== "0";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      // Hosted SPA never syncs (nodes_enabled=false), so swap the real
      // Automerge-backed repo for a tiny no-op stub. Saves ~1.2 MB of
      // WASM that would otherwise be dead weight in the Vercel bundle.
      {
        find: /^\.\/sync\/repo$/,
        replacement: path.resolve(__dirname, "src/sync/repo.hosted-stub.ts"),
      },
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: wantSourcemaps,
    minify: "esbuild",
    cssMinify: "esbuild",
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Keep the entry chunk small. React + ReactDOM go in their own
        // long-cacheable vendor chunk; everything else (panels, locales)
        // ends up in lazy chunks via dynamic imports in App.tsx.
        manualChunks: (id) => {
          if (id.includes("node_modules/react-dom/")) return "react-vendor";
          if (id.includes("node_modules/react/")) return "react-vendor";
          if (id.includes("node_modules/scheduler/")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
