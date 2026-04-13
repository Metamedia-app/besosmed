import { getMe, updateMe, uploadAvatar, deleteAvatar } from '../../controllers/users/profileController.js';

async function userRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── GET /me ──────────────────────────────────────────────────────────────────
  fastify.get('/me', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Get My Profile',
      description: 'Mengambil data profil lengkap user yang sedang login.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    nim: { type: 'string' },
                    nama: { type: 'string' },
                    program_studi: { type: 'string' },
                    status_mahasiswa: { type: 'string' },
                    jenis_kelamin: { type: 'string' },
                    bio: { type: 'string' },
                    avatar_url: { type: 'string' },
                    is_online: { type: 'boolean' },
                    tempat_lahir: { type: 'string' },
                    tanggal_lahir: { type: 'string' },
                    agama: { type: 'string' },
                    createdAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: getMe,
  });

  // ── PATCH /me ─────────────────────────────────────────────────────────────────
  fastify.patch('/me', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Update My Profile',
      description: 'Perbarui data profil (saat ini: bio).',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          bio: { type: 'string', description: 'Bio atau deskripsi singkat profil kamu' },
          tempat_lahir: { type: 'string', description: 'Tempat lahir' },
          tanggal_lahir: { type: 'string', description: 'Tanggal lahir (format: dd-mm-yyyy)' },
          agama: { type: 'string', description: 'Agama' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    nim: { type: 'string' },
                    nama: { type: 'string' },
                    bio: { type: 'string' },
                    avatar_url: { type: 'string' },
                    program_studi: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: updateMe,
  });

  // ── POST /me/avatar ───────────────────────────────────────────────────────────
  fastify.post('/me/avatar', {
    ...auth,
    validatorCompiler: () => () => true, // multipart divalidasi di controller
    schema: {
      tags: ['Profile'],
      summary: 'Upload Avatar',
      description: 'Upload foto profil. File akan disimpan di Cloudflare R2 (folder: avatars/). Format yang didukung: JPG, PNG, WEBP, GIF.',
      consumes: ['multipart/form-data'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Pilih foto profil (JPG/PNG/WEBP/GIF)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                avatar_url: { type: 'string', description: 'URL publik foto profil baru' },
              },
            },
          },
        },
      },
    },
    handler: uploadAvatar,
  });

  // ── DELETE /me/avatar ─────────────────────────────────────────────────────────
  fastify.delete('/me/avatar', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Delete Avatar',
      description: 'Hapus foto profil. File akan dihapus dari Cloudflare R2 dan avatar_url akan dikosongkan.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: deleteAvatar,
  });
}

export default userRoutes;
