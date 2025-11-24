import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    hmr: {
      host: "localhost",
      port: 5173,
    },
  },
});
