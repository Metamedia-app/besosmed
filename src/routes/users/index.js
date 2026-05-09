import { getMe, updateMe, uploadAvatar, deleteAvatar, changePassword, getUserProfile } from '../../controllers/users/profileController.js';
import { linkGoogleAccount } from '../../controllers/auth/googleAuthController.js';
import { followUser, unfollowUser, getFollowers, getFollowing } from '../../controllers/users/followController.js';
import { searchUsers } from '../../controllers/users/searchUser.js';
import { getUserPosts } from '../../controllers/posts/getUserPosts.js';
import { updateFcmToken, removeFcmToken } from '../../controllers/users/fcmController.js';

async function userRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── GET /search ──────────────────────────────────────────────────────────────
  fastify.get('/search', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Search Users',
      description: 'Mencari mahasiswa berdasarkan nama, nim, atau program studi.',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Kata kunci pencarian (nama/nim/prodi)' },
          limit: { type: 'integer', default: 20 },
          skip: { type: 'integer', default: 0 }
        }
      },
      security: [{ bearerAuth: [] }],
    },
    handler: searchUsers,
  });

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

  // ── GET /users/:id ────────────────────────────────────────────────────────────
  fastify.get('/:id', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Get Other User Profile',
      description: 'Melihat profil publik user lain lengkap dengan status hubungan (is_following, follows_me).',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID User yang ingin dilihat' } }
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
                user: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    nim: { type: 'string' },
                    nama: { type: 'string' },
                    program_studi: { type: 'string' },
                    bio: { type: 'string' },
                    avatar_url: { type: 'string' },
                    followers_count: { type: 'number' },
                    following_count: { type: 'number' },
                    is_following: { type: 'boolean' },
                    follows_me: { type: 'boolean' },
                    createdAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: getUserProfile,
  });

  // ── GET /users/:id/posts ──────────────────────────────────────────────────────
  fastify.get('/:id/posts', {
    ...auth,
    schema: {
      tags: ['Posts'],
      summary: 'Get User Activity (Posts & Reposts)',
      description: 'Mengambil gabungan postingan asli dan repost milik user tertentu. Sangat efisien untuk halaman profil.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID User yang ingin dilihat' } }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 10 },
          before: { type: 'string', description: 'Cursor timestamp untuk pagination' }
        }
      },
      security: [{ bearerAuth: [] }],
    },
    handler: getUserPosts,
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

  // ── PATCH /me/password ────────────────────────────────────────────────────────
  fastify.patch('/me/password', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Change Password',
      description: 'Ganti password user yang sedang login dengan verifikasi password lama.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['oldPassword', 'newPassword'],
        properties: {
          oldPassword: { type: 'string', description: 'Password saat ini' },
          newPassword: { type: 'string', description: 'Password baru yang ingin digunakan' },
        },
      },
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
    handler: changePassword,
  });

  // ── POST /me/link-google ──────────────────────────────────────────────────────
  fastify.post('/me/link-google', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Link Google Account',
      description: 'Hubungkan akun Google (Gmail) ke NIM yang sedang login agar bisa login via Google nantinya.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string', description: 'ID Token dari Firebase Client SDK' }
        }
      }
    },
    handler: linkGoogleAccount,
  });

  // ── FOLLOW SYSTEM (Tag: Follow) ───────────────────────────────────────────────

  // Follow User
  fastify.post('/:id/follow', {
    ...auth,
    schema: {
      tags: ['Follow'],
      summary: 'Follow a User',
      description: 'Mulai mengikuti user lain. Akan otomatis menambah followers_count target dan mengirim notifikasi.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID User yang ingin diikuti' } }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, message: { type: 'string' } }
        }
      }
    },
    handler: followUser,
  });

  // Unfollow User
  fastify.post('/:id/unfollow', {
    ...auth,
    schema: {
      tags: ['Follow'],
      summary: 'Unfollow a User',
      description: 'Berhenti mengikuti user lain.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID User yang ingin berhenti diikuti' } }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, message: { type: 'string' } }
        }
      }
    },
    handler: unfollowUser,
  });

  // Get Followers
  fastify.get('/:id/followers', {
    schema: {
      tags: ['Follow'],
      summary: 'Get User Followers',
      description: 'Mengambil daftar siapa saja yang mengikuti user ini.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID User' } }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
          skip: { type: 'integer', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                followers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      nim: { type: 'string' },
                      nama: { type: 'string' },
                      avatar_url: { type: 'string' },
                      follow_date: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    handler: getFollowers,
  });

  // Get Following
  fastify.get('/:id/following', {
    schema: {
      tags: ['Follow'],
      summary: 'Get User Following',
      description: 'Mengambil daftar siapa saja yang diikuti oleh user ini.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID User' } }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
          skip: { type: 'integer', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                following: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      nim: { type: 'string' },
                      nama: { type: 'string' },
                      avatar_url: { type: 'string' },
                      follow_date: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    handler: getFollowing,
  });

  // ── FCM TOKEN MANAGEMENT ──────────────────────────────────────────────────────
  fastify.post('/fcm-token', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Register FCM Token',
      description: 'Mendaftarkan token perangkat untuk Push Notification.',
      body: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: updateFcmToken,
  });

  fastify.delete('/fcm-token', {
    ...auth,
    schema: {
      tags: ['Profile'],
      summary: 'Remove FCM Token',
      description: 'Menghapus token perangkat (saat logout).',
      body: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: removeFcmToken,
  });
}

export default userRoutes;
