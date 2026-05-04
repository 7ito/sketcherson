import { createSketchersonApp } from '@7ito/sketcherson-common/game';
import { createGameServer, logServerError, logServerEvent } from '@7ito/sketcherson-server';
import shellConfig from '../../../shell.config';

const app = createSketchersonApp(shellConfig);
const server = createGameServer(app.server.options({
  appOrigin: process.env.APP_ORIGIN,
  corsOrigin: process.env.CORS_ORIGIN,
}));

server
  .start(undefined, readHostArg(process.argv))
  .then((port) => {
    logServerEvent('info', 'server.ready', {
      port,
    });
  })
  .catch((error) => {
    logServerError('server.start_failed', error);
    process.exitCode = 1;
  });

function readHostArg(argv: string[]): string | undefined {
  const hostIndex = argv.indexOf('--host');
  if (hostIndex === -1) {
    return undefined;
  }

  return argv[hostIndex + 1];
}
