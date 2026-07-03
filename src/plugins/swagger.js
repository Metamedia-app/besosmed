import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

async function swaggerPlugin(fastify) {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'BeSosmed API',
        description: 'API documentation for BeSosmed — Social Media Backend',
        version: '1.0.0',
      },
      servers: [
        ...(process.env.APP_URL ? [{ url: process.env.APP_URL, description: 'Production (Railway)' }] : []),
        { url: 'http://localhost:3000', description: 'Local Development' },
      ],
      tags: [
        { name: 'Auth', description: 'Autentikasi — Login & Token' },
        { name: 'Profile', description: 'Profil — Data diri, Bio, dan Avatar' },
        { name: 'Posts', description: 'Postingan — CRUD, Like, Komentar, Repost, Share' },
        { name: 'Realtime', description: 'WebSocket — Koneksi real-time' },
        { name: 'Admin Dashboard', description: 'Khusus Admin — Moderasi, Takedown, dan Banning' },
        { name: 'Chat Inbox', description: 'Pesan Pribadi (Inbox) — Enkripsi, Media, dan Realtime' },
        { name: 'Chat Matkul', description: 'Grup Mata Kuliah — Otomatisasi Member, Enkripsi, dan Realtime' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  if (process.env.NODE_ENV === 'production') {
    // Keamanan Produksi: Halaman docs diblokir dengan pesan mengecoh
    fastify.get('/docs', async (request, reply) => {
      return reply.code(403).send({
        status: 'error',
        message: 'Forbidden: API Documentation is disabled in production environment.',
        code: 'DOCS_DISABLED'
      });
    });
  } else {
    // Mode Development: Swagger menyala terang benderang untuk sarana testing
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }
}

export default fp(swaggerPlugin, {
  name: 'swagger',
});
