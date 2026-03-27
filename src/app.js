import Fastify from 'fastify';

// Plugins
import swaggerPlugin from './plugins/swagger.js';
import corsPlugin from './plugins/cors.js';
import helmetPlugin from './plugins/helmet.js';
import mongoosePlugin from './plugins/mongoose.js';

// Routes
import healthRoutes from './routes/health.js';

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    ...opts,
  });

  // ── Plugins ────────────────────────────────────────────
  await app.register(corsPlugin);
  await app.register(helmetPlugin);
  await app.register(swaggerPlugin);
  await app.register(mongoosePlugin);

  // ── Routes ─────────────────────────────────────────────
  await app.register(healthRoutes);

  // ── Global Error Handler ───────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      message: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    });
  });

  return app;
}
