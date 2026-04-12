async function healthRoutes(fastify) {
  fastify.get(
    '/health',
    {
      schema: {
        hide: true, // tidak tampil di Swagger docs
      },
    },
    async () => {
      return {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    },
  );
}

export default healthRoutes;
