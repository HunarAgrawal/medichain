import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks stay cached across app releases.
        codeSplitting: {
          groups: [
            { name: "ethers", test: /node_modules[\\/](ethers|@noble|@adraffy)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // The suite is small; running files sequentially is faster than spinning up workers.
    fileParallelism: false,
  },
});
