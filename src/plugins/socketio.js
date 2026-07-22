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

    // Middleware Autentikasi JWT (dengan Real-Time DB Check)
    io.use(async (socket, next) => {
      const authHeader = socket.handshake.headers?.authorization;
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const token = socket.handshake.auth?.token || socket.handshake.query?.token || headerToken;
      
      console.log(`[Socket.io Debug] Incoming request. Token found? ${!!token}`);

      if (!token) {
        console.log(`[Socket.io Debug] Connection rejected: Token missing`);
        return next(new Error('Authentication error: Token missing'));
      }

      try {
        const decoded = fastify.jwt.verify(token);
        
        // FULL-DUPLEX SECURITY CHECK: Tolak koneksi jika user di-ban
        const { default: User } = await import('../models/User.js');
        const user = await User.findById(decoded.id).select('is_banned');
        
        if (!user || user.is_banned) {
          console.log(`[Socket.io Debug] Connection rejected: User Banned!`);
          return next(new Error('Authentication error: Akun Anda telah ditangguhkan (Banned) oleh Admin.'));
        }

        socket.user = decoded; // Simpan data user di socket
        next();
      } catch (err) {
        console.log(`[Socket.io Debug] Token invalid error: ${err.message}`);
        return next(new Error('Authentication error: Token invalid atau kadaluarsa'));
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

      // Kirim daftar user yang SUDAH online ke user yang BARU connect
      // Supaya FE tidak "buta" soal siapa yang online saat pertama kali buka app
      const onlineRooms = io.sockets.adapter.rooms;
      const onlineUserIds = [];
      onlineRooms.forEach((_, roomName) => {
        if (roomName.startsWith('user:')) {
          onlineUserIds.push(roomName.replace('user:', ''));
        }
      });
      socket.emit('initial_online_users', { userIds: onlineUserIds });

      // Broadcast status online ke semua user (Indikator Realtime)
      io.emit('user_status_change', {
        userId: userId.toString(),
        status: 'online',
      });

      socket.on('disconnect', async (reason) => {
        console.log(`[Socket.io] User disconnected: ${userNama} (${userId}) - Reason: ${reason}`);

        // Cek apakah user benar-benar offline (semua tab tertutup)
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        if (sockets.length === 0) {
          io.emit('user_status_change', {
            userId: userId.toString(),
            status: 'offline',
          });
        }
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
