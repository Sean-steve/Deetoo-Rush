import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: dir,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  build: {
    outDir: path.resolve(dir, "../../dist/customer-web-next"),
    emptyOutDir: true,
  },
});
