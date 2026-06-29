import { getDashboardStats } from '../../controllers/admin/adminDashboardController.js';
import { isAdmin } from '../../middlewares/adminMiddleware.js';

export default async function adminDashboardRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate, isAdmin] };

  // GET /api/v1/admin/dashboard
  fastify.get('/dashboard', {
    ...auth,
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Get Dashboard Statistics',
      description: 'Mengembalikan ringkasan statistik real-time dan data chart interaksi. Hanya untuk Admin.',
      querystring: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            enum: ['7', '30'],
            default: '7',
            description: 'Rentang waktu data chart: 7 hari atau 30 hari terakhir',
          },
        },
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
                summary: {
                  type: 'object',
                  properties: {
                    total_users: { type: 'number' },
                    total_posts: { type: 'number' },
                    total_likes: { type: 'number' },
                    total_reposts: { type: 'number' },
                  },
                },
                interaction_chart: {
                  type: 'object',
                  properties: {
                    range_days: { type: 'number' },
                    labels: { type: 'array', items: { type: 'string' } },
                    data: { type: 'array', items: { type: 'number' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: getDashboardStats,
  });
}
