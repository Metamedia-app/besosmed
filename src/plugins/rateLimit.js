import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(fastify) {
  await fastify.register(fastifyRateLimit, {
    global: false, // hanya aktif pada route yang mendaftarkan config rateLimit
    errorResponseBuilder: (_request, context) => ({
      success: false,
      message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(context.ttl / 1000)} detik.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });
}

export default fp(rateLimitPlugin, { name: 'rateLimit' });
