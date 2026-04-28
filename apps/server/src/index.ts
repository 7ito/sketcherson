import { createSketchersonApp } from '@sketcherson/common/game';
import shellConfig from '../../../shell.config';
import { createGameServer } from './createServer';
import { logServerError, logServerEvent } from './logger';

const app = createSketchersonApp(shellConfig);
const server = createGameServer(app.server.options());

server
  .start()
  .then((port) => {
    logServerEvent('info', 'server.ready', {
      port,
    });
  })
  .catch((error) => {
    logServerError('server.start_failed', error);
    process.exitCode = 1;
  });
