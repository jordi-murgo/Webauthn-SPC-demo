import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});

// Tablas en Supabase
const TABLES = {
  USERS: 'users',
  CREDENTIALS: 'credentials',
  SESSIONS: 'sessions',
  CHALLENGES: 'challenges',
  PAYMENTS: 'payments',
};

export const initializeDatabase = async () => {
  // Verificar si las tablas existen, si no, crearlas
  const { data: tables } = await supabase
    .from('pg_tables')
    .select('tablename')
    .eq('schemaname', 'public');

  const existingTables = new Set(tables?.map(t => t.tablename) || []);
  
  // Crear tablas que no existan
  const tablesToCreate = [
    `CREATE TABLE IF NOT EXISTS ${TABLES.USERS} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    
    `CREATE TABLE IF NOT EXISTS ${TABLES.CREDENTIALS} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES ${TABLES.USERS}(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL,
      public_key BYTEA NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT[],
      friendly_name TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_used_at TIMESTAMP WITH TIME ZONE,
      UNIQUE(credential_id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS ${TABLES.SESSIONS} (
      sid TEXT PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP WITH TIME ZONE NOT NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS ${TABLES.CHALLENGES} (
      id TEXT PRIMARY KEY,
      user_id UUID REFERENCES ${TABLES.USERS}(id) ON DELETE CASCADE,
      challenge TEXT NOT NULL,
      operation TEXT NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS ${TABLES.PAYMENTS} (
      id TEXT PRIMARY KEY,
      user_id UUID REFERENCES ${TABLES.USERS}(id) ON DELETE CASCADE,
      credential_id TEXT REFERENCES ${TABLES.CREDENTIALS}(credential_id) ON DELETE SET NULL,
      amount NUMERIC(10, 2) NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_details JSONB,
      verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    
    // Índices para mejorar el rendimiento
    `CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON ${TABLES.CREDENTIALS}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expire ON ${TABLES.SESSIONS}(expire)`,
    `CREATE INDEX IF NOT EXISTS idx_challenges_user_id ON ${TABLES.CHALLENGES}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_challenges_expires ON ${TABLES.CHALLENGES}(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_user_id ON ${TABLES.PAYMENTS}(user_id)`
  ];
  
  for (const query of tablesToCreate) {
    await supabase.rpc('exec', { query });
  }
  
  console.log('Database initialized successfully');
};

export default {
  supabase,
  TABLES,
  initializeDatabase,
};
