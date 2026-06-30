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

/**
 * Update Data Prodi/Jurusan
 */
export async function updateMajor(request, reply) {
  const { id } = request.params;
  const { name, faculty, code_prodi, singkatan } = request.body;

  try {
    const major = await Major.findById(id);
    if (!major) {
      return reply.status(404).send({ success: false, message: 'Prodi tidak ditemukan.' });
    }

    if (name && name !== major.name) {
      const duplicateName = await Major.findOne({ name });
      if (duplicateName) {
        return reply.status(400).send({ success: false, message: 'Nama Prodi sudah terdaftar.' });
      }
      major.name = name;
    }

    if (code_prodi !== undefined && code_prodi !== major.code_prodi) {
      if (code_prodi !== '') {
        const duplicateCode = await Major.findOne({ code_prodi });
        if (duplicateCode) {
          return reply.status(400).send({ success: false, message: 'Kode Prodi sudah terdaftar.' });
        }
      }
      major.code_prodi = code_prodi || undefined;
    }

    if (faculty !== undefined) major.faculty = faculty;
    if (singkatan !== undefined) major.singkatan = singkatan;

    await major.save();

    return reply.send({
      success: true,
      message: 'Prodi berhasil diperbarui.',
      data: major
    });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal memperbarui prodi.' });
  }
}

/**
 * Hapus Prodi/Jurusan
 */
export async function deleteMajor(request, reply) {
  const { id } = request.params;

  try {
    const major = await Major.findById(id);
    if (!major) {
      return reply.status(404).send({ success: false, message: 'Prodi tidak ditemukan.' });
    }

    await Major.deleteOne({ _id: id });

    return reply.send({
      success: true,
      message: 'Prodi berhasil dihapus.'
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal menghapus prodi.' });
  }
}

