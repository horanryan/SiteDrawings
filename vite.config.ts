import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/konva/") || id.includes("/node_modules/react-konva/")) {
            return "canvas";
          }
          if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/react/")) {
            return "react";
          }
        },
      },
    },
  },
});
