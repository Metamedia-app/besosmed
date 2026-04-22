import Report from '../../models/Report.js';

/**
 * Mendapatkan daftar semua laporan (untuk dashboard admin)
 */
export async function getReportsAdmin(request, reply) {
  const { limit = 20, skip = 0, status = 'pending' } = request.query;

  try {
    const filter = status === 'all' ? {} : { status };
    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate('reporter_id', 'nim nama avatar_url')
        .populate({
          path: 'post_id',
          select: 'caption media author_id is_deleted createdAt',
          populate: { path: 'author_id', select: 'nim nama avatar_url' }
        })
        .lean(),
      Report.countDocuments({ status })
    ]);

    return reply.send({
      success: true,
      data: { reports, total },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil data laporan.' });
  }
}

/**
 * Update Status Laporan (Misal: Ditandai sudah ditinjau)
 */
export async function updateReportStatus(request, reply) {
  const { id } = request.params;
  const { status } = request.body; // 'ignored' atau 'resolved'
  const adminId = request.user.id;

  if (!['ignored', 'resolved', 'pending'].includes(status)) {
    return reply.status(400).send({ success: false, message: 'Status tidak valid.' });
  }

  try {
    const report = await Report.findByIdAndUpdate(
      id,
      { 
        status, 
        reviewed_by: adminId, 
        reviewed_at: new Date() 
      },
      { new: true }
    );

    if (!report) {
      return reply.status(404).send({ success: false, message: 'Laporan tidak ditemukan.' });
    }

    return reply.send({
      success: true,
      message: 'Status laporan berhasil diperbarui.',
      data: { report }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal update status laporan.' });
  }
}
