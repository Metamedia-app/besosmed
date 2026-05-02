import { createPost } from '../../controllers/posts/createPost.js';
import { getFeed } from '../../controllers/posts/getFeed.js';
import { getPost } from '../../controllers/posts/getPost.js';
import { editPost } from '../../controllers/posts/editPost.js';
import { deletePost } from '../../controllers/posts/deletePost.js';
import { likePost, getLikers } from '../../controllers/posts/likePost.js';
import { addComment, getComments, getCommentTree, deleteComment } from '../../controllers/posts/commentPost.js';
import { repostPost, sharePost, unrepostPost } from '../../controllers/posts/repostPost.js';
import { getReportReasons, reportPost } from '../../controllers/posts/reportController.js';

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

  // Get Likers (List who liked)
  fastify.get('/posts/:id/likers', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Get Post Likers',
      description: 'Mengambil daftar siapa saja yang menyukai postingan ini (Paginated).',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
          skip: { type: 'integer', default: 0 }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getLikers
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

  // Get Comment Tree (Thread)
  fastify.get('/posts/:id/comments/:commentId/tree', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Get Comment Thread (Tree)',
      description: 'Mengambil seluruh balasan dalam satu thread (flat list) untuk performa tinggi.',
      params: { 
        type: 'object', 
        properties: { 
          id: { type: 'string', description: 'Post ID' },
          commentId: { type: 'string', description: 'Root Comment ID' } 
        } 
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getCommentTree
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

  // Delete Comment
  fastify.delete('/posts/:id/comments/:commentId', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Delete Comment',
      description: 'Menghapus komentar (Hanya oleh pemilik komentar).',
      params: { 
        type: 'object', 
        properties: { 
          id: { type: 'string', description: 'Post ID' },
          commentId: { type: 'string', description: 'Comment ID' } 
        } 
      },
      security: [{ bearerAuth: [] }]
    },
    handler: deleteComment
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

  // Unrepost
  fastify.delete('/posts/:id/repost', {
    ...auth,
    schema: { 
      tags: ['Posts'], 
      summary: 'Unrepost',
      description: 'Membatalkan repost yang sudah dilakukan.',
      params: { type: 'object', properties: { id: { type: 'string', description: 'Original Post ID' } } },
      security: [{ bearerAuth: [] }] 
    },
    handler: unrepostPost
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

  // Get Report Reasons
  fastify.get('/posts/report-reasons', {
    schema: {
      tags: ['Posts'],
      summary: 'Get Report Reasons',
      description: 'Mengambil daftar alasan yang didukung untuk melaporkan postingan.',
    },
    handler: getReportReasons
  });

  // Report Post
  fastify.post('/posts/:id/report', {
    ...auth,
    schema: {
      tags: ['Posts'],
      summary: 'Report Post',
      description: 'Melaporkan postingan yang melanggar pedoman komunitas.',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['reason_type'],
        properties: {
          reason_type: { type: 'string', description: 'Jenis pelanggaran dari list reasons' },
          reason_text: { type: 'string', description: 'Detail tambahan (opsional)' },
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: reportPost
  });

}

export default postRoutes;
