import mongoose from 'mongoose';
import Comment from '../../models/Comment.js';
import Post from '../../models/Post.js';
import Report from '../../models/Report.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { countTotalUnreadItems, sendPushNotification, triggerPushNotification } from '../../services/notificationService.js';
import { emitNewComment, emitNotification, sendToUser } from '../../services/wsService.js';
import { containsToxicWords } from '../../utils/badWords.js';

export async function addComment(request, reply) {
  const userId = request.user.id;
  const { id: postId } = request.params;
  const { body, parent_id } = request.body;

  // Validasi format ID jika parent_id diisi
  if (parent_id && !mongoose.Types.ObjectId.isValid(parent_id)) {
    return reply.status(400).send({ 
      success: false, 
      message: 'Format parent_id tidak valid.' 
    });
  }

  if (!body?.trim()) {
    return reply.status(400).send({ success: false, message: 'Komentar tidak boleh kosong.' });
  }

  const post = await Post.findOne({ _id: postId, is_deleted: false });
  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  // Jika ini adalah balasan (reply)
  let parentComment = null;
  if (parent_id) {
    parentComment = await Comment.findOne({ _id: parent_id, post_id: postId, is_deleted: false });
    if (!parentComment) {
      return reply.status(404).send({ success: false, message: 'Komentar yang ingin dibalas tidak ditemukan.' });
    }
  }

  // Logic Materialized Path & Atomic Recursive Count
  let topLevelId = null;
  let parentIds = [];

  if (parentComment) {
    // Jika parent punya top_level_id, gunakan itu. Jika tidak, parent-lah root-nya.
    topLevelId = parentComment.top_level_id || parentComment._id;
    // Path = path parent + ID parent
    parentIds = [...(parentComment.parent_ids || []), parentComment._id];
  }

  const comment = await Comment.create({
    post_id: postId,
    author_id: userId,
    body: body.trim(),
    parent_id: parent_id || null,
    top_level_id: topLevelId,
    parent_ids: parentIds,
  });

  // 0. --- ALARM TOXIC UNTUK ADMIN (WEB DASHBOARD) ---
  if (containsToxicWords(body)) {
    console.warn(`🚨 TOXIC_DETECTED: User ${request.user.nama} mengirim kata kasar: "${body}"`);
    
    // Auto-Save ke Tabel Laporan agar Admin bisa cek nanti di /admin/reports
    await Report.create({
      reporter_id: userId, // User yang berbuat toxic dilaporkan oleh sistem
      post_id: postId,
      reason_type: 'Sistem: Terdeteksi Kata Kasar',
      reason_text: `Komentar otomatis ditandai: "${body}"`
    }).catch(err => console.error('Gagal simpan auto-report:', err));

    // Cari semua admin
    const admins = await User.find({ role: 'admin' }).select('_id');
    const adminUnreadCount = await Report.countDocuments({ status: 'pending' });
    
    admins.forEach(admin => {
      sendToUser(admin._id, {
        type: 'admin_notification',
        data: {
          title: '🤬 Komentar Toxic!',
          message: `${request.user.nama} mengirim komentar kasar.`,
          comment: comment,
          unread_count: adminUnreadCount
        }
      });
    });

    // --- NOTIFIKASI UNTUK USER (PELANGGAR) ---
    const adminSender = admins.length > 0 ? admins[0]._id : userId; // Pakai admin pertama sebagai pengirim sistem
    const userNotif = await Notification.create({
      recipient_id: userId,
      sender_id: adminSender,
      type: 'toxic',
      post_id: postId,
      is_read: false
    });

    // Emit Real-time via Socket.io agar user langsung dapet alert
    const unreadCount = await countTotalUnreadItems(userId);
    emitNotification(userId, {
      id: userNotif._id,
      type: 'toxic',
      sender_id: adminSender,
      post_id: postId,
      message: 'Komentar Anda melanggar pedoman komunitas.',
      unread_count: unreadCount,
      created_at: userNotif.createdAt,
      updatedAt: userNotif.updatedAt,
    });

    // Kirim Push Notification via FCM
    triggerPushNotification(userId, {
      title: 'BeSosmed',
      body: 'Komentar Anda melanggar pedoman komunitas.',
      data: {
        type: 'toxic',
        post_id: postId.toString()
      }
    });

    // --- AUTO-DELETE (GAK MUNCUL DI PUBLIK) ---
    comment.is_deleted = true;
    await comment.save();

    return reply.status(403).send({
      success: false,
      message: 'Komentar Anda terdeteksi mengandung kata kasar dan telah diblokir otomatis.',
      data: { is_toxic: true }
    });
  }

  // 1. Update total komentar di postingan (Atomic)
  await Post.updateOne({ _id: postId }, { $inc: { comments_count: 1 } });

  // 2. Update SEMUA leluhur (Recursive Count) secara atomik
  if (parentIds.length > 0) {
    await Comment.updateMany(
      { _id: { $in: parentIds } },
      { $inc: { replies_count: 1 } }
    );
  }

  // Ambil info author untuk response
  const author = await User.findById(userId).select('nim nama avatar_url').lean();

  const commentFormatted = {
    _id: comment._id,
    post_id: comment.post_id,
    parent_id: comment.parent_id,
    top_level_id: comment.top_level_id,
    parent_ids: comment.parent_ids,
    body: comment.body,
    author,
    created_at: comment.createdAt,
  };

  // NOTIFIKASI PINTAR (Grouping Logic)
  if (parent_id) {
    // 1. Jika BALASAN: Notifikasi ke pemilik komentar yang dibalas
    if (parentComment.author_id.toString() !== userId) {
      const existingNotif = await Notification.findOneAndUpdate(
        {
          recipient_id: parentComment.author_id,
          post_id: postId,
          type: 'comment',
          is_read: false
        },
        {
          $set: { sender_id: userId },
          $inc: { others_count: 1 },
          $push: { 
            grouped_items: {
              $each: [{
                user_id: userId,
                nama: request.user.nama,
                avatar_url: request.user.avatar_url,
                reference_id: comment._id,
                at: new Date()
              }],
              $slice: -5
            }
          }
        },
        { new: true }
      );

      let notif;
      if (!existingNotif) {
        notif = await Notification.create({
          recipient_id: parentComment.author_id,
          sender_id: userId,
          type: 'comment',
          post_id: postId,
          grouped_items: [{
            user_id: userId,
            nama: request.user.nama,
            avatar_url: request.user.avatar_url,
            reference_id: comment._id,
            at: new Date()
          }]
        });
      } else {
        notif = existingNotif;
      }

      // Format pesan real-time
      const count = notif.others_count || 0;
      const message = count > 0 
        ? `${request.user.nama} dan ${count} lainnya membalas komentarmu.`
        : `${request.user.nama} membalas komentarmu.`;

      // Hitung total unread untuk recipient (Realtime Badge)
      const unreadCount = await countTotalUnreadItems(parentComment.author_id);

      emitNotification(parentComment.author_id, {
        id: notif._id,
        type: 'comment',
        sender_id: userId,
        post_id: postId,
        message,
        grouped_items: notif.grouped_items,
        unread_count: unreadCount, // Kirim angka badge terbaru
        created_at: notif.createdAt,
        updatedAt: notif.updatedAt,
      });

      // --- KIRIM PUSH NOTIFICATION (FCM) ---
      triggerPushNotification(parentComment.author_id, {
        title: 'Notifikasi',
        body: message,
        data: {
          type: 'comment',
          post_id: postId.toString()
        }
      });
    }
  } else {
    // 2. Jika KOMENTAR UTAMA: Notifikasi ke pemilik postingan
    if (post.author_id.toString() !== userId) {
      const existingNotif = await Notification.findOneAndUpdate(
        {
          recipient_id: post.author_id,
          post_id: postId,
          type: 'comment',
          is_read: false
        },
        {
          $set: { sender_id: userId },
          $inc: { others_count: 1 },
          $push: { 
            grouped_items: {
              $each: [{
                user_id: userId,
                nama: request.user.nama,
                avatar_url: request.user.avatar_url,
                reference_id: comment._id,
                at: new Date()
              }],
              $slice: -5
            }
          }
        },
        { new: true }
      );

      let notif;
      if (!existingNotif) {
        notif = await Notification.create({
          recipient_id: post.author_id,
          sender_id: userId,
          type: 'comment',
          post_id: postId,
          grouped_items: [{
            user_id: userId,
            nama: request.user.nama,
            avatar_url: request.user.avatar_url,
            reference_id: comment._id,
            at: new Date()
          }]
        });
      } else {
        notif = existingNotif;
      }

      // Format pesan real-time
      const count = notif.others_count || 0;
      const message = count > 0 
        ? `${request.user.nama} dan ${count} lainnya mengomentari postinganmu.`
        : `${request.user.nama} mengomentari postinganmu.`;

      // Hitung total unread untuk recipient (Realtime Badge)
      const unreadCount = await countTotalUnreadItems(post.author_id);

      emitNotification(post.author_id, {
        id: notif._id,
        type: 'comment',
        sender_id: userId,
        post_id: postId,
        message,
        grouped_items: notif.grouped_items,
        unread_count: unreadCount, // Kirim angka badge terbaru
        created_at: notif.createdAt,
        updatedAt: notif.updatedAt,
      });

      // --- KIRIM PUSH NOTIFICATION (FCM) ---
      triggerPushNotification(post.author_id, {
        title: 'Notifikasi',
        body: message,
        data: {
          type: 'comment',
          post_id: postId.toString()
        }
      });
    }
  }

  // Broadcast komentar baru ke semua user
  emitNewComment(postId, commentFormatted);

  return reply.status(201).send({
    success: true,
    message: parent_id ? 'Balasan berhasil ditambahkan.' : 'Komentar berhasil ditambahkan.',
    data: { comment: commentFormatted, comments_count: post.comments_count },
  });
}

export async function getComments(request, reply) {
  const { id: postId } = request.params;
  const { parent_id, limit = 20, skip = 0 } = request.query;

  const parsedLimit = Math.min(parseInt(limit) || 20, 50);
  const parsedSkip = parseInt(skip) || 0;

  // Filter: Secara default hanya ambil komentar utama (parent_id: null)
  // Kecuali jika ada parent_id di query (untuk ambil balasan spesifik)
  const filter = {
    post_id: postId,
    is_deleted: false,
    parent_id: parent_id || null,
  };

  const [comments, total] = await Promise.all([
    Comment.find(filter)
      .sort({ createdAt: parent_id ? 1 : -1 }) // Balasan urut waktu (tua ke baru), Komentar utama (baru ke tua)
      .skip(parsedSkip)
      .limit(parsedLimit)
      .populate('author_id', 'nim nama avatar_url')
      .lean(),
    Comment.countDocuments(filter),
  ]);

  const formatted = comments.map((c) => ({
    ...c,
    author: c.author_id,
    author_id: undefined,
  }));

  return reply.send({
    success: true,
    data: { comments: formatted, total, has_more: parsedSkip + parsedLimit < total },
  });
}

/**
 * MENGAMBIL SELURUH POHON BALASAN (FLAT TREE)
 * Endpoint: GET /posts/:id/comments/:commentId/tree
 */
export async function getCommentTree(request, reply) {
  const { id: postId, commentId } = request.params;

  // Pastikan Root Komentarnya ada
  const rootComment = await Comment.findOne({ 
    _id: commentId, 
    post_id: postId, 
    is_deleted: false 
  }).populate('author_id', 'nim nama avatar_url').lean();

  if (!rootComment) {
    return reply.status(404).send({ success: false, message: 'Komentar utama tidak ditemukan.' });
  }

  // Ambil semua balasan yang punya top_level_id sama
  const replies = await Comment.find({
    post_id: postId,
    top_level_id: commentId,
    is_deleted: false
  })
    .sort({ createdAt: 1 }) // Urutan percakapan (Tua ke Baru)
    .populate('author_id', 'nim nama avatar_url')
    .lean();

  const formattedReplies = replies.map((r) => ({
    ...r,
    author: r.author_id,
    author_id: undefined,
  }));

  const formattedRoot = {
    ...rootComment,
    author: rootComment.author_id,
    author_id: undefined
  };

  return reply.send({
    success: true,
    data: {
      root: formattedRoot,
      replies: formattedReplies,
      total_replies: rootComment.replies_count
    }
  });
}

/**
 * MENGHAPUS KOMENTAR (Hanya oleh pemilik komentar)
 */
export async function deleteComment(request, reply) {
  const userId = request.user.id;
  const { id: postId, commentId } = request.params;

  try {
    // 1. Cari komentar
    const comment = await Comment.findOne({ _id: commentId, post_id: postId, is_deleted: false });
    
    if (!comment) {
      return reply.status(404).send({ success: false, message: 'Komentar tidak ditemukan.' });
    }

    // 2. Verifikasi Pemilik (Sesuai permintaan Mas Edy: Cuma yang komen yang bisa hapus)
    if (comment.author_id.toString() !== userId) {
      return reply.status(403).send({ success: false, message: 'Akses ditolak. Anda bukan pemilik komentar ini.' });
    }

    // 3. Soft Delete
    comment.is_deleted = true;
    await comment.save();

    // 4. --- UPDATE STATISTIK (DIBALIKKAN DARI LOGIC ADD) ---
    
    // Kurangi total komentar di postingan
    await Post.updateOne({ _id: postId }, { $inc: { comments_count: -1 } });

    // Kurangi replies_count di SEMUA leluhur (Recursive)
    if (comment.parent_ids && comment.parent_ids.length > 0) {
      await Comment.updateMany(
        { _id: { $in: comment.parent_ids } },
        { $inc: { replies_count: -1 } }
      );
    }

    // 5. Broadcast ke Socket.io (Opsional tapi bagus buat UX)
    // Mas bisa buat fungsi emitDeleteComment di wsService nanti kalau mau real-time
    
    return reply.send({ 
      success: true, 
      message: 'Komentar berhasil dihapus.',
      data: { comment_id: commentId, post_id: postId }
    });

  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menghapus komentar.' });
  }
}
