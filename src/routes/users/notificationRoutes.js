import { getNotifications, markAsRead, markAllAsRead } from '../../controllers/users/notificationController.js';

async function notificationRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /notifications - Mengambil daftar notifikasi
  fastify.get('/notifications', {
    ...auth,
    schema: {
      tags: ['Notification'],
      summary: 'Get My Notifications',
      description: 'Mengambil daftar notifikasi terbaru dengan pesan yang sudah dikelompokkan (Gaya Facebook).',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
          skip: { type: 'integer', default: 0 }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getNotifications
  });

  // PATCH /notifications/read - Menandai semua dibaca
  fastify.patch('/notifications/read', {
    ...auth,
    schema: {
      tags: ['Notification'],
      summary: 'Mark All as Read',
      description: 'Menandai semua notifikasi user sebagai terbaca.',
      security: [{ bearerAuth: [] }]
    },
    handler: markAllAsRead
  });

  // PATCH /notifications/:id/read - Menandai satu dibaca
  fastify.patch('/notifications/:id/read', {
    ...auth,
    schema: {
      tags: ['Notification'],
      summary: 'Mark Single Notification as Read',
      description: 'Menandai satu notifikasi tertentu sebagai terbaca.',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: markAsRead
  });
}

export default notificationRoutes;
