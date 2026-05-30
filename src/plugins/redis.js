import fp from 'fastify-plugin';
import fastifyRedis from '@fastify/redis';
import config from '../config/index.js';

async function redisPlugin(fastify) {
  if (config.redisUrl) {
    try {
      await fastify.register(fastifyRedis, {
        url: config.redisUrl,
        closeClient: true,
      });
      fastify.log.info('Redis connected successfully (Cache-Ready)!');
    } catch (err) {
      fastify.log.error(`Redis connection failed: ${err.message}`);
    }
  } else {
    fastify.log.warn('REDIS_URL is not set. Real-time Caching will be safely bypassed.');
  }
}

export default fp(redisPlugin, { name: 'redis' });
