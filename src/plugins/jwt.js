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

      // FULL DUPLEX SECURITY: Real-time DB Check
      const User = (await import('../models/User.js')).default;
      const cekUserDb = await User.findById(request.user.id).select('is_banned').lean();

      if (!cekUserDb) {
        throw new Error('User tidak ditemukan di database.');
      }
      if (cekUserDb.is_banned === true) {
        throw new Error('Akun di-banned! KTP dicabut!');
      }

    } catch (err) {
      // Bedakan pesan error banned vs token expired
      const isBannedError = err.message.includes('di-banned');
      reply.status(401).send({
        success: false,
        message: isBannedError 
          ? 'Akun Anda telah ditangguhkan (Banned) oleh Admin.'
          : 'Token tidak valid atau sudah expired. Silakan login kembali.',
      });
    }
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
