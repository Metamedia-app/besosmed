import { createStory, getStories, viewStory, getStoryViewers } from '../../controllers/posts/storyController.js';

async function storyRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── POST /stories ────────────────────────────────────────────────────────────
  fastify.post('/stories', {
    ...auth,
    validatorCompiler: () => () => true, // multipart divalidasi manual di controller
    schema: {
      tags: ['Stories'],
      summary: 'Create a New Story',
      description: 'Upload Foto, Video, atau hanya Teks untuk dijadikan story. Ukuran maksimal 50 MB. Story akan hilang otomatis setelah durasi tertentu.',
      consumes: ['multipart/form-data'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Teks story (opsional)' },
          file: { 
            type: 'string', 
            format: 'binary', 
            description: 'Pilih foto atau video (maks 50MB)' 
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        }
      }
    },
    handler: createStory,
  });

  // ── GET /stories ─────────────────────────────────────────────────────────────
  fastify.get('/stories', {
    ...auth,
    schema: {
      tags: ['Stories'],
      summary: 'Get Friend Stories',
      description: 'Mengambil daftar story aktif dari teman (Following) dan diri sendiri, dikelompokkan per user.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                stories: { type: 'array', items: { type: 'object' } }
              }
            }
          }
        }
      }
    },
    handler: getStories,
  });

  // ── POST /stories/:id/view ───────────────────────────────────────────────────
  fastify.post('/:id/view', {
    ...auth,
    schema: {
      tags: ['Stories'],
      summary: 'Record Story View',
      description: 'Dijalankan setiap kali user membuka story orang lain. Otomatis menambah jumlah penonton (real-time).',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID Story' } }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' } }
        }
      }
    },
    handler: viewStory,
  });

  // ── GET /stories/:id/viewers ─────────────────────────────────────────────────
  fastify.get('/:id/viewers', {
    ...auth,
    schema: {
      tags: ['Stories'],
      summary: 'Get Story Viewers',
      description: 'Melihat siapa saja yang sudah menonton story. (Hanya untuk pemilik story).',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID Story' } }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                total_views: { type: 'number' },
                viewers: { type: 'array', items: { type: 'object' } }
              }
            }
          }
        }
      }
    },
    handler: getStoryViewers,
  });
}

export default storyRoutes;
