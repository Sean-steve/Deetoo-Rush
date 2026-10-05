import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: {
    '@': repoRoot,
    '@deetoo/types': path.resolve(repoRoot, 'packages/types/src/index.ts'),
    '@deetoo/validation': path.resolve(repoRoot, 'packages/validation/src/index.ts'),
    '@deetoo/config': path.resolve(repoRoot, 'packages/config/src/index.ts'),
    '@deetoo/utils': path.resolve(repoRoot, 'packages/utils/src/index.ts'),
    '@deetoo/auth': path.resolve(repoRoot, 'packages/auth/src/index.ts'),
    '@deetoo/api-client': path.resolve(repoRoot, 'packages/api-client/src/index.ts'),
    '@deetoo/ui': path.resolve(repoRoot, 'packages/ui/src/index.tsx')
  }},
  build: { outDir: path.resolve(repoRoot, 'dist/customer-web'), emptyOutDir: true },
  server: { port: 5173, strictPort: true, proxy: {
    '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    '/health': { target: 'http://127.0.0.1:3000', changeOrigin: false }
  }}
});
