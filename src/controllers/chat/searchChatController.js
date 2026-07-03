import Conversation from '../../models/Conversation.js';

/**
 * API Pencarian Global untuk Obrolan (Inbox, Group Matkul, Community)
 * Rute: GET /api/v1/chat/search?q=keyword
 */
export async function searchConversations(request, reply) {
  const userId = request.user.id;
  const { q } = request.query;

  // Jika keyword kosong, langsung kembalikan array kosong
  if (!q || q.trim() === '') {
    return reply.send({
      status: 'success',
      data: []
    });
  }

  const keyword = q.toLowerCase().trim();

  try {
    // 1. Ambil semua percakapan di mana user terlibat
    // (Batas dokumen puluhan-ratusan, in-memory cukup cepat dan di-optimasi dengan lean)
    const allConversations = await Conversation.find({ participants: userId })
      .populate('participants', 'nama nim avatar_url')
      .populate('subject_id', 'kode_mk nama_mk')
      .lean();

    const results = [];

    // 2. Loop & filter datanya sesuai tipe
    for (const conv of allConversations) {
      if (conv.type === 'inbox') {
        const otherUser = conv.participants.find(p => p._id.toString() !== userId);
        if (otherUser) {
          const matchedName = otherUser.nama && otherUser.nama.toLowerCase().includes(keyword);
          const matchedNim = otherUser.nim && otherUser.nim.toLowerCase().includes(keyword);
          
          if (matchedName || matchedNim) {
            results.push({
              type: 'inbox',
              conversation_id: conv._id.toString(),
              name: otherUser.nama || 'Pengguna',
              subtitle: otherUser.nim || 'Mahasiswa',
              avatar_url: otherUser.avatar_url || ''
            });
          }
        }
      } else if (conv.type === 'group') {
        const convName = (conv.name || '').toLowerCase();
        const className = (conv.class_name || '').toLowerCase();
        const subjectCode = (conv.subject_id?.kode_mk || '').toLowerCase();
        const subjectName = (conv.subject_id?.nama_mk || '').toLowerCase();
        
        if (
          convName.includes(keyword) || 
          className.includes(keyword) || 
          subjectCode.includes(keyword) || 
          subjectName.includes(keyword)
        ) {
          results.push({
            type: 'group',
            conversation_id: conv._id.toString(),
            name: conv.name || 'Grup Mata Kuliah',
            subtitle: `Kelas ${conv.class_name || '-'} • ${conv.subject_id?.kode_mk || '-'}`,
            avatar_url: conv.avatar_url || ''
          });
        }
      } else if (conv.type === 'community') {
        const convName = (conv.name || '').toLowerCase();
        if (convName.includes(keyword)) {
          results.push({
            type: 'community',
            conversation_id: conv._id.toString(),
            name: conv.name || 'Komunitas',
            subtitle: 'Komunitas',
            avatar_url: conv.avatar_url || ''
          });
        }
      }
    }

    return reply.send({
      status: 'success',
      data: results
    });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      status: 'error',
      message: 'Terjadi kesalahan saat mencari percakapan',
      error: error.message
    });
  }
}
