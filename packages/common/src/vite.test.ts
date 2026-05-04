import { describe, expect, it } from 'vitest';
import { sketchersonVitePlugin } from './vite';
import type { CompiledShellApp } from './gameRuntime';

describe('sketchersonVitePlugin', () => {
  it('configures downstream Vite apps to defer the web package while prebundling router deps', () => {
    const plugins = sketchersonVitePlugin({} as CompiledShellApp);
    const optimizationPlugin = plugins.find((plugin) => plugin.name === 'shell-web-dependency-optimization');

    expect(optimizationPlugin).toBeDefined();
    expect(typeof optimizationPlugin?.config).toBe('function');

    const config = typeof optimizationPlugin?.config === 'function'
      ? optimizationPlugin.config({ command: 'serve', mode: 'development' })
      : null;

    expect(config).toMatchObject({
      optimizeDeps: {
        exclude: ['@7ito/sketcherson-web'],
        include: ['react-router-dom'],
      },
    });
  });
});
