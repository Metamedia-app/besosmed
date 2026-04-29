import Subject from '../../models/Subject.js';
import Conversation from '../../models/Conversation.js';
import User from '../../models/User.js';

/**
 * Mendapatkan daftar semua Mata Kuliah (Untuk Dropdown)
 */
export async function getAllSubjects(request, reply) {
  try {
    const subjects = await Subject.find().sort({ name: 1 });
    return reply.send({ success: true, data: subjects });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar mata kuliah.' });
  }
}

/**
 * Membuat Mata Kuliah baru secara manual
 */
export async function createSubject(request, reply) {
  const { code, name, academic_year, lecturer_name } = request.body;

  try {
    // Cek apakah kode sudah ada
    const existing = await Subject.findOne({ code });
    if (existing) {
      return reply.status(400).send({ success: false, message: 'Kode mata kuliah sudah terdaftar.' });
    }

    const subject = await Subject.create({
      code,
      name,
      academic_year,
      lecturer_name
    });

    return reply.status(201).send({ success: true, message: 'Mata kuliah berhasil dibuat.', data: subject });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal membuat mata kuliah.' });
  }
}

/**
 * Menambahkan Mahasiswa ke Grup yang sudah ada
 */
export async function addMembersToGroup(request, reply) {
  const { conversationId } = request.params;
  const { students } = request.body; // Array of NIMs

  try {
    const conv = await Conversation.findById(conversationId);
    if (!conv || conv.type !== 'group') {
      return reply.status(404).send({ success: false, message: 'Grup chat tidak ditemukan.' });
    }

    // Cari ID mahasiswa berdasarkan NIM
    const users = await User.find({ nim: { $in: students } }).select('_id nim');
    const studentIds = users.map(u => u._id);

    if (studentIds.length === 0) {
      return reply.status(404).send({ success: false, message: 'Mahasiswa dengan NIM tersebut tidak ditemukan.' });
    }

    // Tambahkan ke grup (hindari duplikat)
    await Conversation.findByIdAndUpdate(conversationId, {
      $addToSet: { participants: { $each: studentIds } }
    });

    return reply.send({ 
      success: true, 
      message: `Berhasil menambahkan ${studentIds.length} mahasiswa ke grup.`,
      data: { added_count: studentIds.length }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menambahkan member.' });
  }
}

/**
 * Mendapatkan daftar semua Grup Chat (Untuk Monitoring Admin)
 */
export async function getAllGroups(request, reply) {
  try {
    const groups = await Conversation.find({ type: 'group' })
      .populate('subject_id', 'code name academic_year')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = groups.map(g => ({
      _id: g._id,
      name: g.name,
      subject_info: g.subject_id,
      member_count: g.participants.length,
      expires_at: g.expiresAt,
      created_at: g.createdAt
    }));

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar grup.' });
  }
}
