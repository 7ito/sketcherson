import { createReadStream } from 'node:fs';
import { cp, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { CompiledShellApp, ShellGameAssetMount } from './gameRuntime';

type NextMiddleware = (error?: unknown) => void;

const SHELL_RUNTIME_CONFIG_MODULE_ID = 'virtual:shell-runtime-config';
const RESOLVED_SHELL_RUNTIME_CONFIG_MODULE_ID = `\0${SHELL_RUNTIME_CONFIG_MODULE_ID}`;

export function sketchersonVitePlugin(app: CompiledShellApp): Plugin[] {
  return [shellGameAssetsPlugin(app), shellRuntimeConfigPlugin(app), shellWebDependencyOptimizationPlugin(), shellHtmlPlugin(app)];
}

function shellRuntimeConfigPlugin(app: CompiledShellApp): Plugin {
  return {
    name: 'shell-runtime-config',
    resolveId(id) {
      return id === SHELL_RUNTIME_CONFIG_MODULE_ID ? RESOLVED_SHELL_RUNTIME_CONFIG_MODULE_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_SHELL_RUNTIME_CONFIG_MODULE_ID) {
        return null;
      }

      return app.browser.runtimeModuleCode;
    },
  };
}

function shellWebDependencyOptimizationPlugin(): Plugin {
  return {
    name: 'shell-web-dependency-optimization',
    config() {
      return {
        optimizeDeps: {
          exclude: ['@7ito/sketcherson-web'],
          include: ['react-router-dom'],
        },
      };
    },
  };
}

function shellGameAssetsPlugin(app: CompiledShellApp): Plugin {
  let outputDirectory = '';

  return {
    name: 'shell-game-assets',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      if (!app.build.assets) {
        return;
      }

      const mount = app.build.assets;
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: NextMiddleware) => {
        serveShellGameAsset(app, mount, request, response, next).catch(next);
      });
    },
    async writeBundle() {
      if (!app.build.assets) {
        return;
      }

      const outputAssetDirectory = join(outputDirectory, app.build.assets.publicBasePath.replace(/^\/+|\/+$/g, ''));
      await cp(app.build.assets.sourceDir, outputAssetDirectory, { recursive: true, force: true });
    },
  };
}

async function serveShellGameAsset(
  app: CompiledShellApp,
  mount: ShellGameAssetMount,
  request: IncomingMessage,
  response: ServerResponse,
  next: NextMiddleware,
): Promise<void> {
  const assetRequest = app.assets.resolveRequest(new URL(request.url ?? '/', 'http://localhost').pathname);

  if (assetRequest.kind === 'pass') {
    next();
    return;
  }

  if (assetRequest.kind === 'forbidden') {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }

  const relativePath = assetRequest.relativePath;
  if (!relativePath) {
    next();
    return;
  }

  const assetPath = resolve(mount.sourceDir, relativePath);

  let assetStat;
  try {
    assetStat = await stat(assetPath);
  } catch {
    next();
    return;
  }

  if (!assetStat.isFile()) {
    next();
    return;
  }

  response.setHeader('Content-Type', assetRequest.contentType ?? 'application/octet-stream');
  createReadStream(assetPath).pipe(response);
}

function shellHtmlPlugin(app: CompiledShellApp): Plugin {
  return {
    name: 'shell-html-config',
    transformIndexHtml(html) {
      return app.html.renderIndexHtml(html);
    },
  };
}
