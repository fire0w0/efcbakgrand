import { resolve } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import { createApp } from './app';
import { config } from './config';
import { openStore } from './store';

const store = openStore();
const app = createApp(store.read);
const httpServer = createHttpServer(app);
if (process.argv.includes('--production')) {
  app.use(express.static('dist'));
  app.get(['/', '/hub', '/hub/:id', '/grandma', '/grandma/:id'], (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  app.use(vite.middlewares);
}
httpServer.listen(config.port, config.host, () => console.log(`Bakeria ready: http://localhost:${config.port}`));
