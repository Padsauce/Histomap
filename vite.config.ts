import { defineConfig } from "vite";

// base "./" : l'application fonctionne à n'importe quelle adresse (GitHub Pages, sous-dossier…)
export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 1500 }
});
