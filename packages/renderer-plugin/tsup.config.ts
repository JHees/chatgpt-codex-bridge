import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "browser",
  noExternal: ["lucide"],
  target: "es2023",
  clean: true,
  dts: true,
  sourcemap: false,
  minify: false,
  outDir: "dist",
});
