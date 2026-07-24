import fp from 'fastify-plugin';
import fastifyMultipart from '@fastify/multipart';

async function multipartPlugin(fastify) {
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max per file
      files: 5,                    // max 5 file per request
    },
  });
}

export default fp(multipartPlugin, { name: 'multipart' });
