import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// Import config
import { initializeDatabase } from '../lib/supabase.js';
import { sessionMiddleware, clearSession } from '../lib/session.js';

// Import routes
import registerRouter from './auth/register.js';
import loginRouter from './auth/login.js';
import spcRouter from './payment/spc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();

// Ensure data directory exists
const DATA_DIR = join(process.cwd(), '.data');
if (!existsSync(DATA_DIR)) {
  await mkdir(DATA_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://webauthn-spc-demo.vercel.app' 
    : 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));

const initializeApp = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Application services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application services:', error);
    process.exit(1);
  }
};

// Use session middleware
app.use(sessionMiddleware);

// API Routes
app.use('/api/auth/register', registerRouter);
app.use('/api/auth', loginRouter);
app.use('/api/payment/spc', spcRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the public directory
app.use(express.static(join(__dirname, '../public')));

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const startServer = async () => {
  try {
    await initializeApp();
    
    // Only start the server if not in a serverless environment
    if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
      const PORT = process.env.PORT || 3000;
      const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
      
      // Graceful shutdown
      const shutdown = async () => {
        console.log('Shutting down server...');
        server.close(() => {
          console.log('Server shut down successfully');
          process.exit(0);
        });
      };
      
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
