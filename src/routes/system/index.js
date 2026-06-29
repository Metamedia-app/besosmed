import { getConfig } from '../../controllers/system/systemController.js';

export default async function systemRoutes(fastify) {
  fastify.get('/config', {
    schema: {
      tags: ['System'],
      summary: 'Get App Configuration & Version',
      description: 'Mendapatkan konfigurasi aplikasi seperti versi minimum untuk force update dan status maintenance.',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                latest_version: { type: 'string' },
                min_required_version: { type: 'string' },
                update_url: { type: 'string' },
                maintenance_mode: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, getConfig);
}
