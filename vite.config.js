import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Split large vendor libraries into separate cacheable chunks so the
        // app chunk stays under Vite's 500 kB warning threshold.
        manualChunks: {
          ethers: ["ethers"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
