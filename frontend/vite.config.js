
import { rm } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const excludeDownloadsFromAndroidBuild = {
  name: "exclude-downloads-from-android-build",
  apply: "build",
  async closeBundle() {
    await rm(path.resolve("dist/downloads"), { recursive: true, force: true });
  },
};

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "android" ? [excludeDownloadsFromAndroidBuild] : []),
  ],
  preview: {
    host: "0.0.0.0",
    allowedHosts: [
      "radiant-inspiration-production-77d51767.up.railway.app",
    ],
  },
}));
