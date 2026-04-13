import mongoose from 'mongoose';
import Comment from '../../models/Comment.js';
import Post from '../../models/Post.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { emitNewComment, emitNotification } from '../../services/wsService.js';

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

  const comment = await Comment.create({
    post_id: postId,
    author_id: userId,
    body: body.trim(),
    parent_id: parent_id || null,
  });

  // Selalu tambahkan total komentar di postingan
  post.comments_count += 1;
  await post.save();

  // Jika ini adalah balasan, tambahkan juga replies_count di komentar induk
  if (parent_id) {
    parentComment.replies_count += 1;
    await parentComment.save();
  }

  // Ambil info author untuk response
  const author = await User.findById(userId).select('nim nama avatar_url').lean();

  const commentFormatted = {
    _id: comment._id,
    post_id: comment.post_id,
    parent_id: comment.parent_id,
    body: comment.body,
    author,
    created_at: comment.createdAt,
  };

  // NOTIFIKASI
  if (parent_id) {
    // Jika balasan: Kirim notifikasi ke pemilik komentar ASLI (jika bukan diri sendiri)
    if (parentComment.author_id.toString() !== userId) {
      const notif = await Notification.create({
        recipient_id: parentComment.author_id,
        sender_id: userId,
        type: 'comment',
        post_id: postId,
      });
      emitNotification(parentComment.author_id, {
        id: notif._id,
        type: 'comment',
        sender_id: userId,
        post_id: postId,
        message: `${request.user.nama} membalas komentarmu.`,
        created_at: notif.createdAt,
      });
    }
  } else {
    // Jika komentar utama: Kirim notifikasi ke pemilik POSTINGAN (jika bukan diri sendiri)
    if (post.author_id.toString() !== userId) {
      const notif = await Notification.create({
        recipient_id: post.author_id,
        sender_id: userId,
        type: 'comment',
        post_id: postId,
      });
      emitNotification(post.author_id, {
        id: notif._id,
        type: 'comment',
        sender_id: userId,
        post_id: postId,
        message: `${request.user.nama} mengomentari postinganmu.`,
        created_at: notif.createdAt,
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
