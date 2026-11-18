
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  preview: {
    host: "0.0.0.0",
    allowedHosts: [
      "radiant-inspiration-production-77d51767.up.railway.app",
    ],
  },
});
