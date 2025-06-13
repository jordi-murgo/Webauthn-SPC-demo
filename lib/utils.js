import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Importar el almacenamiento basado en Supabase
import { storage } from './supabase-storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Exportar el almacenamiento para mantener la compatibilidad con el código existente
export { storage };

// Session management
export const sessionManager = {
  async createSession(req, res, userId) {
    req.session.userId = userId;
    req.session.createdAt = Date.now();
    await new Promise((resolve, reject) => {
      req.session.save(err => (err ? reject(err) : resolve()));
    });
  },

  async destroySession(req) {
    return new Promise((resolve, reject) => {
      req.session.destroy(err => (err ? reject(err) : resolve()));
    });
  },

  requireAuth(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  }
};

// Extract origin and RP ID from request
export function getRequestInfo(req) {
  const host = req.get('host') || '';
  const protocol = req.get('x-forwarded-proto') || 'http';
  const origin = `${protocol}://${host}`;
  
  // For local development with custom domains
  const rpId = process.env.VERCEL_ENV === 'production' 
    ? host.split(':')[0] // Remove port if present
    : 'localhost';

  return { origin, rpId };
}

// Error handler
export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

// Validate required fields
export function validateRequiredFields(fields, data) {
  const missing = fields.filter(field => data[field] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  return true;
}
