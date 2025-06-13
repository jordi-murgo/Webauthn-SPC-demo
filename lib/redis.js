import Redis from 'ioredis';
import { createClient } from 'redis';

// Configuración de Redis
let redisClient;
let redisPublisher;
let redisSubscriber;

// Inicializar cliente de Redis
export const initRedis = async () => {
  if (redisClient && redisPublisher && redisSubscriber) {
    return { redisClient, redisPublisher, redisSubscriber };
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const isProduction = process.env.NODE_ENV === 'production';

  // Configuración común
  const redisOptions = {
    tls: isProduction ? { rejectUnauthorized: false } : undefined,
    retryStrategy: (times) => {
      // Reintentar con un retraso exponencial
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: null, // Deshabilitar el límite de reintentos
    enableReadyCheck: false, // Deshabilitar verificación de estado
  };

  try {
    // Cliente principal para operaciones normales
    redisClient = createClient({
      url: redisUrl,
      ...redisOptions,
    });

    // Cliente para publicar mensajes
    redisPublisher = createClient({
      url: redisUrl,
      ...redisOptions,
    });

    // Cliente para suscribirse a canales
    redisSubscriber = createClient({
      url: redisUrl,
      ...redisOptions,
    });

    // Manejar eventos de error
    const handleError = (error) => {
      console.error('Redis error:', error);
    };

    redisClient.on('error', handleError);
    redisPublisher.on('error', handleError);
    redisSubscriber.on('error', handleError);

    // Conectar clientes
    await Promise.all([
      redisClient.connect(),
      redisPublisher.connect(),
      redisSubscriber.connect(),
    ]);

    console.log('Redis connected successfully');
    return { redisClient, redisPublisher, redisSubscriber };
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Obtener cliente de Redis
export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
};

// Obtener publicador de Redis
export const getRedisPublisher = () => {
  if (!redisPublisher) {
    throw new Error('Redis publisher not initialized. Call initRedis() first.');
  }
  return redisPublisher;
};

// Obtener suscriptor de Redis
export const getRedisSubscriber = () => {
  if (!redisSubscriber) {
    throw new Error('Redis subscriber not initialized. Call initRedis() first.');
  }
  return redisSubscriber;
};

// Cerrar conexiones de Redis
export const closeRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    if (redisPublisher) {
      await redisPublisher.quit();
      redisPublisher = null;
    }
    if (redisSubscriber) {
      await redisSubscriber.quit();
      redisSubscriber = null;
    }
  } catch (error) {
    console.error('Error closing Redis connections:', error);
    throw error;
  }
};

export default {
  initRedis,
  getRedisClient,
  getRedisPublisher,
  getRedisSubscriber,
  closeRedis,
};
