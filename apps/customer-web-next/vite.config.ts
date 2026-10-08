import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { resolveCustomerRuntime } from "./src/integration/mode";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
export default defineConfig(({command})=>{
  const target=resolveCustomerRuntime({
    dev:command!=="build",
    intent:process.env.VITE_CUSTOMER_NEXT_BACKEND_MODE,
    channel:process.env.DEETOO_CUSTOMER_RELEASE_CHANNEL,
    approved:process.env.DEETOO_CUSTOMER_RELEASE_APPROVED,
    certificateSha:process.env.DEETOO_CUSTOMER_RELEASE_CERTIFIED_SHA,
    sourceSha:process.env.GITHUB_SHA,
  });
  if(command==="build" && process.env.VITE_CUSTOMER_NEXT_BACKEND_MODE==="connected" && target!=="connected"){
    throw new Error("Connected customer build blocked: protected staging approval or SHA-bound production certification missing.");
  }
  return {
  root: dir,
  plugins: [react()],
  define: {__DEETOO_CUSTOMER_RELEASE_CONNECTED__:JSON.stringify(command==="build"&&target==="connected")},
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
};
});
