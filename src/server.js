import config from './config/index.js';
import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`🚀 Server running at http://${config.host}:${config.port}`);
    app.log.info(`📚 Swagger docs at http://localhost:${config.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  //test remote aja
  // Graceful shutdown
  const shutdown = async (signal) => {
    app.log.info(`${signal} received — shutting down gracefully…`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
