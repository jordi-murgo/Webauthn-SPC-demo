import { supabase, TABLES } from './supabase.js';

// Mapa para almacenar en memoria en desarrollo local
const memoryCache = new Map();

/**
 * Almacenamiento que usa Supabase en producción y memoria en desarrollo
 */
export const storage = {
  /**
   * Obtiene un valor por su clave
   * @param {string} key - Clave del valor a obtener (formato 'tabla:id' o 'user:username')
   * @returns {Promise<object|null>} - El valor almacenado o null si no existe
   */
  async get(key) {
    // En desarrollo, usar caché en memoria
    if (process.env.NODE_ENV !== 'production') {
      return memoryCache.get(key) || null;
    }

    const [type, id] = key.split(':');
    if (!type || !id) {
      throw new Error(`Formato de clave inválido: ${key}. Se espera 'tipo:id'`);
    }

    // Mapear tipos de clave a tablas de Supabase
    const tableMap = {
      user: TABLES.USERS,
      credential: TABLES.CREDENTIALS,
      session: TABLES.SESSIONS,
      challenge: TABLES.CHALLENGES,
      payment: TABLES.PAYMENTS,
    };

    const table = tableMap[type];
    if (!table) {
      throw new Error(`Tipo de almacenamiento no soportado: ${type}`);
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error al obtener datos de Supabase:', error);
      throw error;
    }

    return data || null;
  },

  /**
   * Almacena un valor con una clave específica
   * @param {string} key - Clave para almacenar el valor (formato 'tabla:id')
   * @param {object} value - Valor a almacenar
   * @returns {Promise<void>}
   */
  async set(key, value) {
    const [type, id] = key.split(':');
    if (!type || !id) {
      throw new Error(`Formato de clave inválido: ${key}. Se espera 'tipo:id'`);
    }

    // En desarrollo, usar caché en memoria
    if (process.env.NODE_ENV !== 'production') {
      memoryCache.set(key, value);
      return;
    }

    const tableMap = {
      user: TABLES.USERS,
      credential: TABLES.CREDENTIALS,
      session: TABLES.SESSIONS,
      challenge: TABLES.CHALLENGES,
      payment: TABLES.PAYMENTS,
    };

    const table = tableMap[type];
    if (!table) {
      throw new Error(`Tipo de almacenamiento no soportado: ${type}`);
    }

    // Determinar si es una inserción o actualización
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('id', id)
      .single();

    const operation = existing ? 'update' : 'insert';
    const { error } = operation === 'update'
      ? await supabase
          .from(table)
          .update({ ...value, updated_at: new Date().toISOString() })
          .eq('id', id)
      : await supabase
          .from(table)
          .insert({ ...value, id, created_at: new Date().toISOString() });

    if (error) {
      console.error(`Error al ${operation} en ${table}:`, error);
      throw error;
    }
  },

  /**
   * Elimina un valor por su clave
   * @param {string} key - Clave del valor a eliminar
   * @returns {Promise<void>}
   */
  async delete(key) {
    // En desarrollo, eliminar de la caché en memoria
    if (process.env.NODE_ENV !== 'production') {
      memoryCache.delete(key);
      return;
    }

    const [type, id] = key.split(':');
    if (!type || !id) {
      throw new Error(`Formato de clave inválido: ${key}. Se espera 'tipo:id'`);
    }

    const tableMap = {
      user: TABLES.USERS,
      credential: TABLES.CREDENTIALS,
      session: TABLES.SESSIONS,
      challenge: TABLES.CHALLENGES,
      payment: TABLES.PAYMENTS,
    };

    const table = tableMap[type];
    if (!table) {
      throw new Error(`Tipo de almacenamiento no soportado: ${type}`);
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error && error.code !== 'PGRS116') { // Ignorar si no existe
      console.error('Error al eliminar de Supabase:', error);
      throw error;
    }
  },

  /**
   * Verifica si una clave existe
   * @param {string} key - Clave a verificar
   * @returns {Promise<boolean>} - true si la clave existe, false en caso contrario
   */
  async has(key) {
    // En desarrollo, verificar en la caché en memoria
    if (process.env.NODE_ENV !== 'production') {
      return memoryCache.has(key);
    }

    const [type, id] = key.split(':');
    if (!type || !id) {
      throw new Error(`Formato de clave inválido: ${key}. Se espera 'tipo:id'`);
    }

    const tableMap = {
      user: TABLES.USERS,
      credential: TABLES.CREDENTIALS,
      session: TABLES.SESSIONS,
      challenge: TABLES.CHALLENGES,
      payment: TABLES.PAYMENTS,
    };

    const table = tableMap[type];
    if (!table) {
      throw new Error(`Tipo de almacenamiento no soportado: ${type}`);
    }

    const { data, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('id', id);

    if (error) {
      console.error('Error al verificar existencia en Supabase:', error);
      throw error;
    }

    return (data?.length || 0) > 0;
  },
};

export default storage;
