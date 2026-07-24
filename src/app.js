import Fastify from 'fastify';

// Plugins
import swaggerPlugin from './plugins/swagger.js';
import corsPlugin from './plugins/cors.js';
import helmetPlugin from './plugins/helmet.js';
import mongoosePlugin from './plugins/mongoose.js';
import jwtPlugin from './plugins/jwt.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import socketioPlugin from './plugins/socketio.js';
import multipartPlugin from './plugins/multipart.js';
import redisPlugin from './plugins/redis.js';

// Routes
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth/index.js';
import postRoutes from './routes/posts/index.js';
import storyRoutes from './routes/posts/storyRoutes.js';
import userRoutes from './routes/users/index.js';
import notificationRoutes from './routes/users/notificationRoutes.js';
import adminRoutes from './routes/admin/index.js';
import adminUserRoutes from './routes/admin/adminUserRoutes.js';
import adminMajorRoutes from './routes/admin/adminMajorRoutes.js';
import adminSubjectRoutes from './routes/admin/adminSubjectRoutes.js';
import chatRoutes from './routes/chat/index.js';
import communityChatRoutes from './routes/chat/communityChatRoutes.js';
import subjectChatRoutes from './routes/chat/subjectChatRoutes.js';
import subjectFeatureRoutes from './routes/chat/subjectFeatureRoutes.js';
import systemRoutes from './routes/system/index.js';
import adminDashboardRoutes from './routes/admin/adminDashboardRoutes.js';
import { startReminderService } from './services/reminderService.js';
import { sharePostPreview } from './controllers/posts/shareController.js';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  await app.register(socketioPlugin);
  await app.register(multipartPlugin);
  await app.register(redisPlugin);

  // ── Static Files (.well-known untuk Android Deep Link) ──
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: false
  });

  // ── Public Routes (Tanpa Auth — untuk WhatsApp/Telegram Preview) ──
  app.get('/post/:postId', {
    schema: {
      hide: true // Sembunyikan dari Swagger
    }
  }, sharePostPreview);

  // ── Routes ─────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(postRoutes, { prefix: '/api/v1' });
  await app.register(storyRoutes, { prefix: '/api/v1' });
  await app.register(userRoutes, { prefix: '/api/v1' });
  await app.register(notificationRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(adminUserRoutes, { prefix: '/api/v1/admin' });
  await app.register(adminMajorRoutes, { prefix: '/api/v1/admin' });
  await app.register(adminSubjectRoutes, { prefix: '/api/v1/admin' });
  await app.register(chatRoutes, { prefix: '/api/v1/chat' });
  await app.register(communityChatRoutes, { prefix: '/api/v1/chat' });
  await app.register(subjectChatRoutes, { prefix: '/api/v1/chat-matkul' });
  await app.register(subjectFeatureRoutes, { prefix: '/api/v1/chat' });
  await app.register(systemRoutes, { prefix: '/api/v1/system' });
  await app.register(adminDashboardRoutes, { prefix: '/api/v1/admin' });

  // ── Global Error Handler test12 ───────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    // Tangkap error jika ukuran file melebihi batas (berlaku untuk semua upload chat/post/story)
    if (error.code === 'FST_ERR_FILE_TOO_LARGE') {
      return reply.status(413).send({
        success: false,
        message: 'Batas upload media max 10 mb'
      });
    }

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      message: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    });
  });

  // 7. Start Background Services
  startReminderService();

  return app;
}
