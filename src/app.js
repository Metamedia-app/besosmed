import Fastify from 'fastify';

// Plugins
import swaggerPlugin from './plugins/swagger.js';
import corsPlugin from './plugins/cors.js';
import helmetPlugin from './plugins/helmet.js';
import mongoosePlugin from './plugins/mongoose.js';
import jwtPlugin from './plugins/jwt.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import websocketPlugin from './plugins/websocket.js';
import multipartPlugin from './plugins/multipart.js';

// Routes
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth/index.js';
import postRoutes from './routes/posts/index.js';
import userRoutes from './routes/users/index.js';

export async function buildApp(opts = {}) {
  const app = Fastify({
    trustProxy: true, // WAJIB untuk Railway agar IP asli terdeteksi
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
  await app.register(jwtPlugin);
  await app.register(rateLimitPlugin);
  await app.register(websocketPlugin);
  await app.register(multipartPlugin);

  // ── Routes ─────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(postRoutes, { prefix: '/api/v1' });
  await app.register(userRoutes, { prefix: '/api/v1' });

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
