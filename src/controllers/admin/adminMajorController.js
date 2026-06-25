import Major from '../../models/Major.js';

/**
 * Buat Jurusan/Prodi Baru
 */
export async function createMajor(request, reply) {
  const { name, faculty, code_prodi, singkatan } = request.body;

  try {
    const existing = await Major.findOne({ 
      $or: [{ name }, { code_prodi: code_prodi || 'DISABLED_NON_EXISTENT' }] 
    });
    
    if (existing) {
      return reply.status(400).send({
        success: false,
        message: `Jurusan atau Kode Prodi sudah terdaftar.`,
      });
    }

    const major = await Major.create({ name, faculty, code_prodi, singkatan });

    return reply.status(201).send({
      success: true,
      message: 'Jurusan berhasil ditambahkan.',
      data: major,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Gagal menambahkan jurusan.',
    });
  }
}

/**
 * Ambil Daftar Jurusan
 */
export async function getMajors(request, reply) {
  try {
    const majors = await Major.find().sort({ name: 1 }).lean();
    return reply.send({
      success: true,
      data: majors,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Gagal mengambil daftar jurusan.',
    });
  }
}
