import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import config from '../config/index.js';

async function jwtPlugin(fastify) {
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtExpiresIn, // '30d'
    },
  });

  // Decorator: fastify.authenticate — dipakai di route yang butuh auth
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({
        success: false,
        message: 'Token tidak valid atau sudah expired. Silakan login kembali.',
      });
    }
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
