import { defineConfig } from "tsup";
import { cp } from "fs/promises";
import { existsSync } from "fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: "node18",
  external: ["pino-pretty"],
  async onSuccess() {
    // Copy UI dist files to dist/ui after build
    const uiDistPath = "./ui/dist";
    const targetPath = "./dist/ui";
    
    if (existsSync(uiDistPath)) {
      console.log("Copying UI files to dist/ui...");
      await cp(uiDistPath, targetPath, { recursive: true });
      console.log("UI files copied successfully");
    } else {
      console.log("UI dist not found. Run 'pnpm build:ui' first.");
    }
  },
});
