import fp from 'fastify-plugin';
import fastifyWebsocket from '@fastify/websocket';

async function websocketPlugin(fastify) {
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB max payload
    },
  });
}

export default fp(websocketPlugin, { name: 'websocket' });
