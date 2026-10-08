import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
export default defineConfig({
  root: dir,
  plugins: [react()],
  resolve: {alias: {
    "@deetoo/types":path.resolve(root,"packages/types/src/index.ts"),
    "@deetoo/utils":path.resolve(root,"packages/utils/src/index.ts"),
    "@deetoo/api-client":path.resolve(root,"packages/api-client/src/index.ts"),
    "@deetoo/auth-web":path.resolve(root,"packages/auth-web/src/index.ts"),
  }},
  server: { host: "127.0.0.1", port: 5174, strictPort: true, proxy: {
    "/api": {target:"http://127.0.0.1:3000",changeOrigin:false},
    "/health": {target:"http://127.0.0.1:3000",changeOrigin:false},
  } },
  preview: { port: 4174, strictPort: true },
  build: {
    outDir: path.resolve(dir, "../../dist/customer-web-next"),
    emptyOutDir: true,
  },
});
