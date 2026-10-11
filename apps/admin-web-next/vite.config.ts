import react from "@vitejs/plugin-react";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {defineConfig} from "vite";
const dir=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root:dir,
  plugins:[react()],
  server:{host:"127.0.0.1",port:5178,strictPort:true,proxy:{"/api":{target:process.env.DEETOO_API_ORIGIN||"http://127.0.0.1:3000",changeOrigin:true}}},
  preview:{host:"127.0.0.1",port:4178,strictPort:true},
  build:{outDir:path.resolve(dir,"../../dist/admin-web-next"),emptyOutDir:true},
});
