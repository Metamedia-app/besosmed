/**
 * Controller API untuk Sistem & Konfigurasi App
 */
export const getConfig = async (request, reply) => {
  try {
    return reply.code(200).send({
      success: true,
      data: {
        latest_version: "1.0.0",
        min_required_version: "1.0.0",
        update_url: "https://play.google.com/store/apps/details?id=com.besosmed", // Ganti dengan link PlayStore Mas nanti
        maintenance_mode: false
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Internal Server Error' });
  }
};
