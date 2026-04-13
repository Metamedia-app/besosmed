import { createPost } from '../../controllers/posts/createPost.js';
import { getFeed } from '../../controllers/posts/getFeed.js';
import { getPost } from '../../controllers/posts/getPost.js';
import { editPost } from '../../controllers/posts/editPost.js';
import { deletePost } from '../../controllers/posts/deletePost.js';
import { likePost } from '../../controllers/posts/likePost.js';
import { addComment, getComments } from '../../controllers/posts/commentPost.js';
import { repostPost, sharePost } from '../../controllers/posts/repostPost.js';
import { addConnection, removeConnection } from '../../services/wsService.js';

async function postRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // Feed
  fastify.get('/posts', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Get Feed',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 10 },
          before: { type: 'string' },
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getFeed
  });

  // Create
  fastify.post('/posts', {
    ...auth,
    // Kita buat validator palsu supaya Fastify tidak error 'body must be object' 
    // karena data multipart divalidasi manual di controller.
    validatorCompiler: () => () => true,
    schema: { 
      tags: ['Posts'], 
      summary: 'Create Post',
      description: 'Upload media (foto/video) dengan caption. Gunakan multipart/form-data.',
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          caption: { type: 'string', description: 'Teks postingan' },
          files: { 
            type: 'array',
            items: {
              type: 'string',
              format: 'binary'
            },
            description: 'Pilih satu atau banyak foto/video sekaligus' 
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: createPost
  });

  // Detail
  fastify.get('/posts/:id', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Post Detail',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      security: [{ bearerAuth: [] }]
    },
    handler: getPost
  });

  // Edit
  fastify.patch('/posts/:id', {
    ...auth,
    validatorCompiler: () => () => true, // multipart divalidasi di controller
    schema: { 
      tags: ['Posts'], 
      summary: 'Edit Post',
      description: `Edit caption, tambah media baru, atau hapus media lama.\n\n**Cara hapus media lama:** isi field \`remove_media\` dengan JSON array berisi key media, contoh: \`["posts/images/uuid.png"]\``,
      consumes: ['multipart/form-data'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          caption: { type: 'string', description: 'Caption baru (opsional)' },
          remove_media: { 
            type: 'string', 
            description: 'JSON array key media yang dihapus, contoh: ["posts/images/uuid.png"]' 
          },
          files: { 
            type: 'array',
            items: {
              type: 'string',
              format: 'binary'
            },
            description: 'Tambah satu atau banyak foto/video baru' 
          },
        },
      },
      security: [{ bearerAuth: [] }]
    },
    handler: editPost
  });

  // Delete
  fastify.delete('/posts/:id', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Delete Post',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      security: [{ bearerAuth: [] }]
    },
    handler: deletePost
  });

  // Like
  fastify.post('/posts/:id/like', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Toggle Like',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      security: [{ bearerAuth: [] }]
    },
    handler: likePost
  });

  // List Comments
  fastify.get('/posts/:id/comments', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'List Comments',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          parent_id: { type: 'string', description: 'ID komentar utama (untuk ambil balasannya)' },
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getComments
  });

  // Add/Reply Comment
  fastify.post('/posts/:id/comments', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Add/Reply Comment',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', description: 'Isi komentar' },
          parent_id: { type: 'string', description: 'Isi jika ingin membalas komentar lain' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: addComment
  });

  // Repost
  fastify.post('/posts/:id/repost', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Repost',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      security: [{ bearerAuth: [] }] 
    },
    handler: repostPost
  });

  // Share
  fastify.post('/posts/:id/share', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Share Post',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      security: [{ bearerAuth: [] }] 
    },
    handler: sharePost
  });

  // WebSocket
  fastify.get('/ws', {
    websocket: true,
    schema: { 
      tags: ['Realtime'], 
      summary: 'WS Connection',
      querystring: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      }
    },
    handler: (connection, request) => {
      const { socket } = connection;
      let user;
      try {
        user = fastify.jwt.verify(request.query.token);
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Token tidak valid.' }));
        socket.close();
        return;
      }

      const userId = user.id;
      addConnection(userId, socket);
      fastify.log.info(`[WS] User connected: ${user.nama} (${userId})`);

      socket.send(JSON.stringify({
        type: 'connected',
        message: `Halo ${user.nama}, kamu terhubung!`,
        user_id: userId
      }));

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ping') {
            try {
              socket.send(JSON.stringify({ type: 'pong' }));
            } catch (err) {
              fastify.log.error(`[WS] Error sending pong to ${user.nama}: ${err.message}`);
            }
          }
        } catch (err) {
          fastify.log.error(`[WS] Invalid message from ${user.nama}: ${err.message}`);
        }
      });

      socket.on('close', () => {
        fastify.log.info(`[WS] User disconnected: ${user.nama} (${userId})`);
        removeConnection(userId);
      });

      socket.on('error', (err) => {
        fastify.log.error(`[WS] Socket error for ${user.nama}: ${err.message}`);
        removeConnection(userId);
      });
    }
  });
}

export default postRoutes;
