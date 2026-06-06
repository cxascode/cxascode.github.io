import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-spa-fallback",
      closeBundle() {
        const indexPath = path.resolve("dist/index.html");
        const fallbackPath = path.resolve("dist/404.html");
        fs.copyFileSync(indexPath, fallbackPath);
      },
    },
  ],
});
