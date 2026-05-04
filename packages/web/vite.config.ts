import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSketchersonApp } from '@7ito/sketcherson-common/gameRuntime';
import { sketchersonVitePlugin } from '@7ito/sketcherson-common/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import shellConfig from '../../shell.config';

const repoRootUrl = pathToFileURL(`${resolve(dirname(fileURLToPath(import.meta.url)), '../..')}/`);

export default defineConfig(({ mode }) => {
  const testApp = mode === 'test'
    ? createSketchersonApp(shellConfig, { relativeSourceBaseUrl: repoRootUrl })
    : null;

  return {
    plugins: [react(), ...(testApp ? sketchersonVitePlugin(testApp) : [])],
    build: {
      emptyOutDir: false,
      lib: {
        entry: 'src/index.tsx',
        name: 'SketchersonWeb',
        fileName: 'sketcherson-web',
        formats: ['es', 'umd'],
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'virtual:shell-runtime-config'],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            'react-dom/client': 'ReactDOMClient',
            'react-router-dom': 'ReactRouterDOM',
            'virtual:shell-runtime-config': 'SketchersonRuntimeConfig',
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  };
});
