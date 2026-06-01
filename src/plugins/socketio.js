import fp from 'fastify-plugin';
import fastifySocketIO from '@wick_studio/fastify-socket.io';
import { setIO } from '../services/wsService.js';
import Conversation from '../models/Conversation.js';
import { createAdapter } from '@socket.io/redis-adapter';


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

    // REDIS PUB/SUB ADAPTER (Fail-Safe: hanya aktif jika REDIS_URL terpasang)
    if (fastify.redis) {
      const pubClient = fastify.redis.duplicate();
      io.adapter(createAdapter(fastify.redis, pubClient));
      fastify.log.info('Socket.io Redis Pub/Sub Adapter berhasil diaktifkan!');
    }

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

      // Masuk ke Room Percakapan (Inbox & Group)
      // Ini supaya broadcast pesan grup lebih efisien
      // Masuk ke Room Percakapan (Inbox & Group) secara asinkron
      if (userId) {
        Conversation.find({ participants: userId }).select('_id').lean()
          .then(userConvs => {
            userConvs.forEach(c => {
              socket.join(`chat:${c._id.toString()}`);
            });
            console.log(`[Socket.io] User ${userNama} joined ${userConvs.length} chat rooms.`);
          })
          .catch(err => {
            console.error('[Socket.io] Error joining rooms:', err.message);
          });
      }

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
