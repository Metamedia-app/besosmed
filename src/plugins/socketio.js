import fp from 'fastify-plugin';
import fastifySocketIO from '@wick_studio/fastify-socket.io';
import { setIO } from '../services/wsService.js';

async function socketioPlugin(fastify) {
  await fastify.register(fastifySocketIO, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Tunggu sampai server benar-benar siap
  fastify.ready((err) => {
    if (err) throw err;

    const io = fastify.io;
    
    // Kirim instance IO ke service agar bisa dipakai di controller manapun
    setIO(io);

    // Middleware Autentikasi JWT
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      try {
        const decoded = fastify.jwt.verify(token);
        socket.user = decoded; // Simpan data user di socket
        next();
      } catch (err) {
        return next(new Error('Authentication error: Token invalid'));
      }
    });

    io.on('connection', (socket) => {
      const userId = socket.user.id;
      const userNama = socket.user.nama;

      console.log(`[Socket.io] User connected: ${userNama} (${userId}) - ID: ${socket.id}`);

      // Masuk ke Room pribadi (untuk notifikasi targeted)
      socket.join(`user:${userId}`);

      socket.on('disconnect', (reason) => {
        console.log(`[Socket.io] User disconnected: ${userNama} (${userId}) - Reason: ${reason}`);
      });

      // Response handshake sukses
      socket.emit('connected', {
        message: `Halo ${userNama}, kamu terhubung via Socket.io!`,
        user_id: userId
      });
    });
  });
}

export default fp(socketioPlugin, { name: 'socketio' });
