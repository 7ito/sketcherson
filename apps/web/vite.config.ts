import { createSketchersonApp } from '../../packages/common/src/gameRuntime';
import { sketchersonVitePlugin } from '../../packages/common/src/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import shellConfig from '../../shell.config';

const app = createSketchersonApp(shellConfig, { relativeSourceBaseUrl: new URL('../../', import.meta.url) });

export default defineConfig({
  plugins: [react(), ...sketchersonVitePlugin(app)],
  publicDir: false,
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
