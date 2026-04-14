import Story from '../../models/Story.js';
import Follow from '../../models/Follow.js';
import { uploadFile } from '../../services/r2Service.js';
import * as wsService from '../../services/wsService.js';

/**
 * POST /stories
 * Membuat story baru (Teks, Foto, atau Video)
 */
export async function createStory(request, reply) {
  const userId = request.user.id;
  const parts = request.parts();

  let content = '';
  let media = null;
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

  for await (const part of parts) {
    if (part.type === 'field' && part.fieldname === 'content') {
      content = part.value?.trim() || '';
    } else if (part.type === 'file') {
      // 1. Validasi Ukuran File (50MB)
      const chunks = [];
      let totalSize = 0;

      for await (const chunk of part.file) {
        totalSize += chunk.length;
        if (totalSize > MAX_FILE_SIZE) {
          // Drain stream agar tidak hang
          part.file.resume();
          return reply.status(400).send({ 
            success: false, 
            message: 'Ukuran file terlalu besar. Maksimal 50 MB.' 
          });
        }
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);

      // 2. Tentukan Folder R2 (image vs video)
      const isVideo = part.mimetype.startsWith('video/');
      const folderKey = isVideo ? 'story_video' : 'story_image';
      
      // 3. Upload ke Cloudflare R2
      const uploaded = await uploadFile(buffer, part.mimetype, folderKey);
      media = {
        url: uploaded.url,
        key: uploaded.key,
        type: uploaded.type, // 'image' atau 'video'
      };
    }
  }

  // Validasi: Harus ada konten atau media
  if (!content && !media) {
    return reply.status(400).send({ success: false, message: 'Story tidak boleh kosong.' });
  }

  // 4. Simpan ke Database
  const story = await Story.create({
    author_id: userId,
    content,
    media,
  });

  await story.populate('author_id', 'nim nama avatar_url');

  return reply.status(201).send({
    success: true,
    message: 'Story berhasil diunggah dan akan aktif selama 24 jam.',
    data: { story },
  });
}

/**
 * GET /stories
 * Mengambil daftar story dari teman (Following) dan diri sendiri
 */
export async function getStories(request, reply) {
  const userId = request.user.id;

  // 1. Ambil daftar yang diikuti
  const followed = await Follow.find({ follower_id: userId }).select('following_id').lean();
  const followingIds = followed.map(f => f.following_id);
  
  // Tambahkan diri sendiri agar story sendiri muncul
  const ids = [...followingIds, userId];

  // 2. Ambil story yang masih aktif (belum expired)
  // Story yang sudah lewat 1 menit akan otomatis hilang dari database oleh MongoDB
  const stories = await Story.find({ author_id: { $in: ids } })
    .sort({ createdAt: -1 })
    .populate('author_id', 'nim nama avatar_url')
    .lean();

  // 3. Kelompokkan story berdasarkan user (opsional untuk mempermudah FE)
  const grouped = stories.reduce((acc, story) => {
    const authorId = story.author_id._id.toString();
    if (!acc[authorId]) {
      acc[authorId] = {
        user: story.author_id,
        items: [],
      };
    }
    acc[authorId].items.push(story);
    return acc;
  }, {});

  return reply.send({
    success: true,
    data: {
      stories: Object.values(grouped),
    },
  });
}

/**
 * POST /stories/:id/view
 * Mencatat penonton baru ke story
 */
export async function viewStory(request, reply) {
  const userId = request.user.id;
  const { id: storyId } = request.params;

  // 1. Cari story dan cek apakah user sudah pernah melihat
  const story = await Story.findById(storyId);
  if (!story) {
    return reply.status(404).send({ success: false, message: 'Story tidak ditemukan.' });
  }

  // JANGAN catat jika penonton adalah pemilik story itu sendiri
  if (story.author_id.toString() === userId) {
    return reply.send({ success: true, message: 'Owner view tidak dicatat.' });
  }

  const alreadyViewed = story.views.some(v => v.user_id.toString() === userId);

  if (!alreadyViewed) {
    // 2. Tambahkan penonton secara atomit (mencegah balapan data)
    const updatedStory = await Story.findByIdAndUpdate(
      storyId,
      {
        $addToSet: { views: { user_id: userId } },
        $inc: { views_count: 1 }
      },
      { new: true }
    );

    // 3. Emit update real-time ke pemilik story
    wsService.emitStoryViewUpdate(story.author_id, storyId, updatedStory.views_count);
  }

  return reply.send({ success: true });
}

/**
 * GET /stories/:id/viewers
 * Mengambil daftar penonton (Hanya untuk pemilik story)
 */
export async function getStoryViewers(request, reply) {
  const userId = request.user.id;
  const { id: storyId } = request.params;

  const story = await Story.findById(storyId)
    .populate('views.user_id', 'nim nama avatar_url program_studi')
    .lean();

  if (!story) {
    return reply.status(404).send({ success: false, message: 'Story tidak ditemukan.' });
  }

  // Cek apakah yang minta adalah pemilik story
  if (story.author_id.toString() !== userId) {
    return reply.status(403).send({ 
      success: false, 
      message: 'Anda tidak memiliki akses untuk melihat penonton story ini.' 
    });
  }

  const viewers = story.views.map(v => ({
    ...v.user_id,
    viewed_at: v.viewed_at
  }));

  return reply.send({
    success: true,
    data: {
      total_views: story.views_count,
      viewers: viewers
    }
  });
}
