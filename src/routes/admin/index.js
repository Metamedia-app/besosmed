import { adminLogin } from '../../controllers/admin/adminAuthController.js';
import { 
  getAllPosts, 
  takedownPost, 
  untakedownPost,
  banUser, 
  unbanUser 
} from '../../controllers/admin/adminModerationController.js';
import { 
  searchUsersAdmin, 
  searchPostsAdmin 
} from '../../controllers/admin/adminSearchController.js';
import { isAdmin } from '../../middlewares/adminMiddleware.js';

export default async function adminRoutes(fastify) {
  // --- PUBLIC ADMIN ROUTES ---
  
  // Login Admin
  fastify.post('/login', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Login khusus Admin',
      body: {
        type: 'object',
        required: ['nim', 'password'],
        properties: {
          nim: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
    handler: adminLogin,
  });

  // --- PROTECTED ADMIN ROUTES ---
  fastify.register(async (adminGroup) => {
    // Terapkan proteksi: Harus Login & Harus Admin
    adminGroup.addHook('preValidation', fastify.authenticate);
    adminGroup.addHook('preHandler', isAdmin);

    // Get All Posts
    adminGroup.get('/posts', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Melihat semua postingan untuk moderasi',
        security: [{ bearerAuth: [] }],
      },
      handler: getAllPosts,
    });

    // Takedown Post
    adminGroup.post('/posts/:id/takedown', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Takedown postingan secara paksa',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
        },
      },
      handler: takedownPost,
    });

    // Untakedown Post
    adminGroup.post('/posts/:id/untakedown', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Membatalkan takedown postingan (Pulihkan)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
        },
      },
      handler: untakedownPost,
    });

    // Ban User
    adminGroup.post('/users/:id/ban', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Memblokir akun user',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
        },
      },
      handler: banUser,
    });

    // Unban User
    adminGroup.post('/users/:id/unban', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Membuka blokir akun user',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
        },
      },
      handler: unbanUser,
    });

    // Search Users (Admin)
    adminGroup.get('/search/users', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Mencari user (Semua status)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            limit: { type: 'integer' },
            skip: { type: 'integer' },
          },
        },
      },
      handler: searchUsersAdmin,
    });

    // Search Posts (Admin)
    adminGroup.get('/search/posts', {
      schema: {
        tags: ['Admin Dashboard'],
        summary: 'Mencari postingan (Semua status)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            limit: { type: 'integer' },
            skip: { type: 'integer' },
          },
        },
      },
      handler: searchPostsAdmin,
    });
  });
}
