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
        {
          url: `http://localhost:${process.env.PORT || 3000}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Autentikasi — Login & Token' },
        { name: 'Posts', description: 'Postingan — CRUD, Like, Komentar, Repost, Share' },
        { name: 'Realtime', description: 'WebSocket — Koneksi real-time' },
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

export default fp(swaggerPlugin, {
  name: 'swagger',
});
