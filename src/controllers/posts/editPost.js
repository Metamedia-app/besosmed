import Post from '../../models/Post.js';
import { uploadFile, deleteFile } from '../../services/r2Service.js';

export async function editPost(request, reply) {
  const userId = request.user.id;
  const { id } = request.params;

  const post = await Post.findOne({ _id: id, is_deleted: false });
  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  // Hanya pemilik yang boleh edit
  if (post.author_id.toString() !== userId) {
    return reply.status(403).send({
      success: false,
      message: 'Kamu tidak punya akses untuk mengedit postingan ini.',
    });
  }

  const contentType = request.headers['content-type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');

  let newCaption = null;
  let mediaToRemove = []; // key-key R2 yang mau dihapus
  const newMediaList = [];

  if (isMultipart) {
    // Parse multipart: caption (field), remove_media (field, JSON array), file (file)
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'caption') {
          newCaption = part.value?.trim() || null;
        } else if (part.fieldname === 'remove_media') {
          console.log('--- Debug Edit Post ---');
          console.log('Raw remove_media value:', part.value);
          
          try {
            // Coba parse sebagai JSON (untuk format ["key1", "key2"])
            const parsed = JSON.parse(part.value);
            mediaToRemove = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // Jika gagal (bukan JSON), anggap sebagai string tunggal (mungkin tanpa tanda kurung)
            const rawValue = part.value?.trim();
            if (rawValue) {
              // Bersihkan kemungkinan tanda kutip atau kurung yang terbawa manual
              const cleanValue = rawValue.replace(/[\[\]"']/g, '');
              mediaToRemove = [cleanValue];
            }
          }
          console.log('Processed mediaToRemove:', mediaToRemove);
        }
      } else if (part.type === 'file') {
        const allowed = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'video/mp4', 'video/quicktime', 'video/webm',
        ];
        if (!allowed.includes(part.mimetype)) {
          part.file.resume();
          return reply.status(400).send({
            success: false,
            message: `Tipe file tidak didukung: ${part.mimetype}`,
          });
        }

        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        const folder = part.mimetype.startsWith('video/') ? 'video' : 'image';
        const uploaded = await uploadFile(buffer, part.mimetype, folder);
        newMediaList.push(uploaded);
      }
    }
  } else {
    // JSON request: hanya update caption
    newCaption = request.body?.caption?.trim() || null;
  }

  // Validasi: setidaknya caption atau file yang berubah
  if (!newCaption && newMediaList.length === 0 && mediaToRemove.length === 0) {
    return reply.status(400).send({
      success: false,
      message: 'Tidak ada yang diubah. Isi caption atau tambah/hapus media.',
    });
  }

  // Update caption jika ada
  if (newCaption) post.caption = newCaption;

  // Hapus media lama dari array post dan dari R2
  if (mediaToRemove.length > 0) {
    const initialCount = post.media.length;
    post.media = post.media.filter((m) => !mediaToRemove.includes(m.key));
    
    // Beri tahu Mongoose bahwa array media berubah
    post.markModified('media');
    
    if (post.media.length < initialCount) {
      // Hanya hapus dari R2 jika beneran ada yang dihapus dari array DB
      Promise.all(mediaToRemove.map((key) => deleteFile(key))).catch(() => {});
    }
  }

  // Tambah media baru ke array post
  if (newMediaList.length > 0) {
    post.media.push(...newMediaList);
    post.markModified('media');
  }

  post.is_edited = true;
  await post.save();

  await post.populate('author_id', 'nim nama avatar_url program_studi');
  const postObj = post.toObject();

  return reply.send({
    success: true,
    message: 'Postingan berhasil diperbarui.',
    data: {
      post: {
        ...postObj,
        author: postObj.author_id,
        author_id: undefined,
      },
    },
  });
}
