import { uploadFile } from '../../services/r2Service.js';
import { emitNewPost, emitNotification } from '../../services/wsService.js';
import Post from '../../models/Post.js';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';
import { countTotalUnreadItems, triggerPushNotification } from '../../services/notificationService.js';

/**
 * Mengekstrak NIM dari caption yang berisi pola mention.
 * Mendukung dua format:
 *  1. Format Library (Produksi FE): @[Edy Syafrianto](225520211002)
 *  2. Format Sederhana (Testing):   @225520211002   (angka saja)
 */
function extractMentionedNims(caption) {
  if (!caption) return [];
  const nims = [];

  // Format 1: @[Nama](NIM) — output dari react-native-controlled-mentions
  const libraryRegex = /@\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = libraryRegex.exec(caption)) !== null) {
    nims.push(match[1].trim());
  }

  // Format 2: @NIM (angka murni, minimal 5 digit) — untuk testing via curl/Swagger
  // Hanya aktif jika tidak ada pola format library ditemukan
  if (nims.length === 0) {
    const simpleRegex = /@(\d{5,})/g;
    while ((match = simpleRegex.exec(caption)) !== null) {
      nims.push(match[1].trim());
    }
  }

  return [...new Set(nims)]; // hapus duplikat
}

export async function createPost(request, reply) {
  const authorId = request.user.id;

  // ── Cek apakah request multipart (ada file) atau JSON biasa ──────────────
  const contentType = request.headers['content-type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');

  let caption = '';
  let visibility = 'public'; // default
  const mediaList = [];

  if (isMultipart) {
    // Parse multipart: ambil field + file
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'caption') {
        caption = part.value?.trim() || '';
      } else if (part.type === 'field' && part.fieldname === 'visibility') {
        visibility = part.value?.trim() || 'public';
      } else if (part.type === 'file') {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
        if (!allowed.includes(part.mimetype)) {
          // Drain stream agar tidak hang
          part.file.resume();
          return reply.status(400).send({ success: false, message: `Tipe file tidak didukung: ${part.mimetype}` });
        }

        const chunks = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        const folder = part.mimetype.startsWith('video/') ? 'video' : 'image';
        const uploaded = await uploadFile(buffer, part.mimetype, folder);
        mediaList.push(uploaded);
      }
    }
  } else {
    // JSON request (hanya teks)
    caption = request.body?.caption?.trim() || '';
    visibility = request.body?.visibility?.trim() || 'public';
  }

  if (!caption && mediaList.length === 0) {
    return reply.status(400).send({ success: false, message: 'Postingan tidak boleh kosong.' });
  }

  // ── Ekstrak Mention dari caption (Non-Destructive) ───────────────────────
  const mentionedNims = extractMentionedNims(caption);
  let taggedUserIds = [];

  if (mentionedNims.length > 0) {
    try {
      const taggedUsers = await User.find({ nim: { $in: mentionedNims } }).select('_id nim nama').lean();
      taggedUserIds = taggedUsers
        .filter(u => u._id.toString() !== authorId) // jangan tag diri sendiri
        .map(u => u._id);
    } catch (err) {
      // Jika gagal ambil user, abaikan saja — postingan tetap tersimpan
      request.log.warn('[Mention] Gagal mengambil data user yang di-tag:', err.message);
    }
  }

  const post = await Post.create({
    author_id: authorId,
    caption,
    media: mediaList,
    type: 'original',
    visibility,
    tags_id: taggedUserIds,
  });

  // Populate author untuk response & broadcast
  await post.populate('author_id', 'nim nama avatar_url program_studi');

  const postObj = post.toObject();
  const formatted = {
    ...postObj,
    author: postObj.author_id,
    author_id: undefined,
  };

  // --- CEK VISIBILITY UNTUK BROADCAST ---
  let targetUserIds = null; // default null = broadcast ke semua
  if (visibility === 'followers') {
    import('../../models/Follow.js').then(async ({ default: Follow }) => {
      const followers = await Follow.find({ following_id: authorId }).select('follower_id');
      const followerIds = followers.map((f) => f.follower_id.toString());
      targetUserIds = [authorId, ...followerIds]; // author + followers
      emitNewPost(formatted, targetUserIds);
    }).catch(err => {
      console.error(err);
      emitNewPost(formatted, [authorId]); // fallback ke private
    });
  } else if (visibility === 'private') {
    targetUserIds = [authorId];
    emitNewPost(formatted, targetUserIds);
  } else {
    // public
    emitNewPost(formatted, null);
  }

  // --- CACHE BUSTING: Hancurkan cache feed agar fresh data langsung muncul ---
  if (request.server.redis) {
    try {
      const keys = await request.server.redis.keys('feed:*');
      if (keys.length > 0) await request.server.redis.del(...keys);
    } catch (err) {}
  }

  // ── Kirim Notifikasi ke Pengguna yang Di-Tag ─────────────────────────────
  if (taggedUserIds.length > 0) {
    const authorName = request.user.nama || 'Seseorang';
    const message = `${authorName} menandai Anda dalam sebuah postingan`;

    for (const uid of taggedUserIds) {
      // 1. Simpan ke database notifikasi in-app
      const notif = await Notification.create({
        recipient_id: uid,
        sender_id: authorId,
        type: 'mention',
        post_id: post._id,
        grouped_items: [{
          user_id: authorId,
          nama: authorName,
          avatar_url: request.user.avatar_url,
          reference_id: post._id,
          at: new Date()
        }]
      });

      // 2. Hitung jumlah badge notifikasi (bisa realtime)
      const unreadCount = await countTotalUnreadItems(uid);

      // 3. Pancarkan ke Socket.io (biar bel di HP/Web getar)
      emitNotification(uid, {
        id: notif._id,
        type: 'mention',
        sender_id: authorId,
        post_id: post._id.toString(),
        message: message,
        grouped_items: notif.grouped_items,
        unread_count: unreadCount,
        created_at: notif.createdAt,
        updatedAt: notif.updatedAt,
      });

      // 4. Kirim FCM Push ke luar layar (status bar HP)
      triggerPushNotification(uid, {
        title: 'MetaU',
        body: message,
        data: {
          type: 'mention',
          post_id: post._id.toString(),
        },
      });
    }
  }

  return reply.status(201).send({
    success: true,
    message: 'Postingan berhasil dibuat.',
    data: { post: formatted },
  });
}
