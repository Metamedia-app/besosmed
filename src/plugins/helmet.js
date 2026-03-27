import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

async function helmetPlugin(fastify) {
  await fastify.register(helmet, {
    global: true,
    // Allow Swagger UI to load properly
    contentSecurityPolicy: false,
  });
}

export default fp(helmetPlugin, {
  name: 'helmet',
});
