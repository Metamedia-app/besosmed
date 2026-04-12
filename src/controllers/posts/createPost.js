import { uploadFile } from '../../services/r2Service.js';
import { emitNewPost } from '../../services/wsService.js';
import Post from '../../models/Post.js';

export async function createPost(request, reply) {
  const authorId = request.user.id;

  // ── Cek apakah request multipart (ada file) atau JSON biasa ──────────────
  const contentType = request.headers['content-type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');

  let caption = '';
  const mediaList = [];

  if (isMultipart) {
    // Parse multipart: ambil field + file
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'caption') {
        caption = part.value?.trim() || '';
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
  }

  if (!caption && mediaList.length === 0) {
    return reply.status(400).send({ success: false, message: 'Postingan tidak boleh kosong.' });
  }

  const post = await Post.create({
    author_id: authorId,
    caption,
    media: mediaList,
    type: 'original',
  });

  // Populate author untuk response & broadcast
  await post.populate('author_id', 'nim nama avatar_url program_studi');

  const postObj = post.toObject();
  const formatted = {
    ...postObj,
    author: postObj.author_id,
    author_id: undefined,
  };

  // Broadcast ke semua user yang online
  emitNewPost(formatted);

  return reply.status(201).send({
    success: true,
    message: 'Postingan berhasil dibuat.',
    data: { post: formatted },
  });
}
