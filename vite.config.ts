import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@deetoo/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
        '@deetoo/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
        '@deetoo/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
        '@deetoo/utils': path.resolve(__dirname, 'packages/utils/src/index.ts'),
        '@deetoo/auth': path.resolve(__dirname, 'packages/auth/src/index.ts'),
        '@deetoo/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
        '@deetoo/ui': path.resolve(__dirname, 'packages/ui/src/index.tsx'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
