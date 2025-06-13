import session from 'express-session';
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

// Configuración de la sesión
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret';

// Configuración de la tienda de sesión
let sessionStore;

// En producción, usa Vercel KV o Redis según la configuración
if (isProduction) {
  let redisClient;
  
  // Si estamos en Vercel, usa Vercel KV
  if (process.env.VERCEL) {
    const { kv } = await import('@vercel/kv');
    redisClient = {
      get: (key) => kv.get(key),
      set: (key, value, options) => kv.set(key, value, { ex: options?.ttl }),
      del: (key) => kv.del(key),
      on: () => {},
      connect: async () => {},
      isReady: true,
      isOpen: true,
      disconnect: async () => {},
    };
  } 
  // Si no, usa Redis normal
  else if (process.env.REDIS_URL) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        tls: process.env.REDIS_TLS === 'true',
        rejectUnauthorized: false,
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
      },
    });
    
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  
  if (redisClient) {
    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'session:',
      ttl: 30 * 24 * 60 * 60, // 30 días en segundos
    });
  }
}

// Si no hay un store configurado, usa el store en memoria (solo para desarrollo)
if (!sessionStore) {
  console.warn('⚠️  Usando almacenamiento de sesión en memoria. Esto no es recomendado para producción.');
  sessionStore = new session.MemoryStore();
}

// Configuración de la sesión
export const sessionConfig = {
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // Solo enviar cookies sobre HTTPS en producción
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
  },
  name: 'webauthn.spc.sid', // Nombre único para la cookie de sesión
};

// Middleware de sesión
export const sessionMiddleware = session(sessionConfig);

// Función para limpiar la sesión
export const clearSession = (req, res) => {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

export default sessionMiddleware;
