import cors from 'cors';
import crypto from 'crypto';
import { createHash } from 'crypto';
import express from 'express';
import fs from 'fs/promises';
import morgan from 'morgan';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { sessionMiddleware, clearSession } from '../lib/session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Configuración del servidor
const rpName = 'SPC Demo';
const rpID = 'demo.savagesoftware.dev';
const origin = `https://${rpID}`;

// Rutas de archivos
const USERS_FILE = path.join(__dirname, '../data/users.json');
const CHALLENGES_FILE = path.join(__dirname, '../data/challenges.json');
const CERT_FILE = path.join(__dirname, '../certs/cert.pem');
const KEY_FILE = path.join(__dirname, '../certs/key.pem');

// Base de datos persistente
let users = new Map();
let challenges = new Map();

// Configuración de la aplicación
app.set('trust proxy', 1); // Confiar en el proxy inverso

// Middleware de sesión
app.use(sessionMiddleware);

// Helper function to verify WebAuthn registration response
async function verifyWebAuthnRegistration(options) {
  const {
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID
  } = options;

  try {
    // Parse client data
    const clientDataJSON = Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8');
    const clientData = JSON.parse(clientDataJSON);
    
    // Verify client data
    if (clientData.type !== 'webauthn.create') {
      throw new Error('Invalid client data type. Expected webauthn.create');
    }
    
    if (clientData.challenge !== expectedChallenge) {
      throw new Error('Challenge mismatch');
    }
    
    if (clientData.origin !== expectedOrigin) {
      throw new Error('Origin mismatch');
    }
    
    // Parse attestation object
    const attestationObject = Buffer.from(response.response.attestationObject, 'base64url');
    
    // For simplicity, we'll do basic verification
    // In production, you'd want more thorough attestation verification
    console.log('✅ WebAuthn registration verified successfully');
    
    return {
      verified: true,
      registrationInfo: {
        credentialPublicKey: attestationObject, // Simplified - in production extract properly
        credentialID: response.id,
        counter: 0
      }
    };
    
  } catch (error) {
    console.error('💥 WebAuthn registration verification failed:', error.message);
    return {
      verified: false,
      error: error.message
    };
  }
}

// Helper function to verify SPC authentication response
async function verifySPCAuthentication(options) {
  const {
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    credentialPublicKey,
    counter = 0
  } = options;

  try {
    // Parse client data
    const clientDataJSON = Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8');
    const clientData = JSON.parse(clientDataJSON);
    
    // Verify client data
    if (clientData.type !== 'payment.get') {
      throw new Error('Invalid client data type. Expected payment.get');
    }
    
    if (clientData.challenge !== expectedChallenge) {
      throw new Error('Challenge mismatch');
    }
    
    if (clientData.origin !== expectedOrigin) {
      throw new Error('Origin mismatch');
    }
    
    // Basic authenticator data verification
    const authenticatorData = Buffer.from(response.response.authenticatorData, 'base64url');
    
    // Extract RP ID hash (first 32 bytes)
    const rpIdHash = authenticatorData.slice(0, 32);
    const expectedRpIdHash = createHash('sha256').update(expectedRPID).digest();
    
    if (!rpIdHash.equals(expectedRpIdHash)) {
      throw new Error('RP ID hash mismatch');
    }
    
    // Check flags (byte 32)
    const flags = authenticatorData[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    
    if (!userPresent) {
      throw new Error('User not present');
    }
    
    if (!userVerified) {
      throw new Error('User not verified');
    }
    
    console.log('✅ SPC authentication verified successfully');
    
    // Extraer datos de la operación de pago si están disponibles
    const paymentData = clientData.payment || {};
    
    return {
      verified: true,
      authenticationInfo: {
        newCounter: counter + 1,
        userVerified: true,
        userPresent: true
      },
      clientData: {
        origin: clientData.origin,
        type: clientData.type,
        payment: {
          rp: paymentData.rp,
          instrument: paymentData.instrument,
          payee: paymentData.payee,
          total: paymentData.total,
          paymentDetails: paymentData.paymentDetails
        },
        challenge: clientData.challenge
      }
    };
    
  } catch (error) {
    console.error('💥 SPC verification failed:', error.message);
    return {
      verified: false,
      error: error.message
    };
  }
}

// Helper para convertir a Base64URL
const toBase64Url = (buffer) => {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const parseUserAgent = (uaString) => {
    if (!uaString) return 'Dispositivo desconocido';
    try {
        let browser = 'Navegador';
        let os = 'SO';

        if (uaString.includes('Firefox/')) browser = 'Firefox';
        else if (uaString.includes('Edg/')) browser = 'Edge';
        else if (uaString.includes('Chrome/')) browser = 'Chrome';
        else if (uaString.includes('Safari/')) browser = 'Safari';

        if (uaString.includes('Windows NT')) os = 'Windows';
        else if (uaString.includes('Macintosh')) os = 'macOS';
        else if (uaString.includes('Android')) os = 'Android';
        else if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';
        else if (uaString.includes('Linux')) os = 'Linux';
        
        return `${browser} en ${os}`;
    } catch {
        return 'Dispositivo desconocido';
    }
};

const morganFormat = (tokens, req, res) => {
  const status = tokens.status(req, res);
  const color = status >= 500 ? 31 : status >= 400 ? 33 : status >= 300 ? 36 : 32;
  const friendlyName = parseUserAgent(req.headers['user-agent']);
  return `\x1b[90m${tokens.method(req, res)} ${tokens.url(req, res)} \x1b[${color}m${status}\x1b[0m \x1b[90m${tokens['response-time'](req, res)} ms\x1b[0m`;
};

app.use(morgan(morganFormat));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configuración de sesión que funciona tanto para HTTP como HTTPS
app.use(session({
  secret: 'super-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: true, // Permitir tanto HTTP como HTTPS
    httpOnly: true,
    sameSite: 'strict'
  }
}));

// Funciones de persistencia
async function loadData() {
  try {
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const usersObj = JSON.parse(usersData);
    
    // Convertir arrays de vuelta a Uint8Arrays para credentialPublicKey
    for (const user of Object.values(usersObj)) {
      if (user.passkeys) {
        user.passkeys = user.passkeys.map(passkey => ({
          ...passkey,
          credentialPublicKey: Array.isArray(passkey.credentialPublicKey) ? 
            new Uint8Array(passkey.credentialPublicKey) : 
            passkey.credentialPublicKey
        }));
      }
    }
    
    users = new Map(Object.entries(usersObj));
    console.log(`Cargados ${users.size} usuarios desde disco`);
  } catch (error) {
    console.log('No se encontraron datos de usuarios previos, iniciando base vacía');
  }
  
  try {
    const challengesData = await fs.readFile(CHALLENGES_FILE, 'utf8');
    const challengesObj = JSON.parse(challengesData);
    challenges = new Map(Object.entries(challengesObj));
  } catch (error) {
    console.log('No se encontraron challenges previos');
  }
}

async function saveUsers() {
  const usersObj = Object.fromEntries(users);
  
  // Convertir Uint8Arrays a arrays normales para serialización JSON
  for (const user of Object.values(usersObj)) {
    if (user.passkeys) {
      user.passkeys = user.passkeys.map(passkey => ({
        ...passkey,
        credentialPublicKey: passkey.credentialPublicKey instanceof Uint8Array ? 
          Array.from(passkey.credentialPublicKey) : 
          passkey.credentialPublicKey
      }));
    }
  }
  
  await fs.writeFile(USERS_FILE, JSON.stringify(usersObj, null, 2));
}

async function saveChallenges() {
  const challengesObj = Object.fromEntries(challenges);
  await fs.writeFile(CHALLENGES_FILE, JSON.stringify(challengesObj, null, 2));
}

// Función para detectar el origen correcto
function getOrigin(req) {
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  const host = req.get('host') || rpID;
  
  if (isSecure) {
    // Para túnel público HTTPS o desarrollo local HTTPS
    if (host.includes('localhost')) {
      return `https://${rpID}:${HTTPS_PORT}`;
    }
    return `https://${rpID}`;
  }
  // Para desarrollo local HTTP
  return `http://${rpID}:${PORT}`;
}

// Cargar datos al iniciar
await loadData();

// Middleware de logging personalizado
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Log de la request
  console.log(`\n🔴 [${requestId}] ${req.method} ${req.url}`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`🌐 Origin: ${req.get('origin') || 'N/A'}`);
  console.log(`🔗 Host: ${req.get('host') || 'N/A'}`);
  console.log(`🔒 Protocol: ${req.secure ? 'HTTPS' : 'HTTP'}`);
  console.log(`🔄 X-Forwarded-Proto: ${req.get('x-forwarded-proto') || 'N/A'}`);
  
  // Log del body si existe y no es muy grande
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyToLog = { ...req.body };
    // Ocultar contraseñas en los logs
    if (bodyToLog.password) bodyToLog.password = '***';
    // Truncar datos muy largos de WebAuthn
    if (bodyToLog.response) {
      const response = { ...bodyToLog.response };
      Object.keys(response).forEach(key => {
        if (typeof response[key] === 'string' && response[key].length > 100) {
          response[key] = response[key].substring(0, 100) + '... [truncated]';
        }
      });
      bodyToLog.response = response;
    }
    console.log(`📦 Body:`, JSON.stringify(bodyToLog, null, 2));
  }
  
  // Interceptar la respuesta
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    // Log de la response
    console.log(`\n🟢 [${requestId}] Response ${res.statusCode}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    
    // Log del body de respuesta (truncado si es muy largo)
    try {
      const responseData = typeof data === 'string' ? JSON.parse(data) : data;
      const dataToLog = { ...responseData };
      
      // Truncar campos muy largos
      Object.keys(dataToLog).forEach(key => {
        if (typeof dataToLog[key] === 'string' && dataToLog[key].length > 200) {
          dataToLog[key] = dataToLog[key].substring(0, 200) + '... [truncated]';
        }
      });
      
      console.log(`📤 Response Body:`, JSON.stringify(dataToLog, null, 2));
    } catch (e) {
      console.log(`📤 Response Body: ${data}`);
    }
    
    console.log(`${'='.repeat(80)}\n`);
    
    return originalSend.call(this, data);
  };
  
  next();
});

// Middleware
app.use(cors({
  origin: [
    `http://${rpID}:${PORT}`, // Para desarrollo local HTTP
    `https://${rpID}:${HTTPS_PORT}`, // Para desarrollo local HTTPS
    `https://${rpID}`, // Para túnel público HTTPS
    `http://localhost:${PORT}`, // Fallback localhost
    `https://localhost:${HTTPS_PORT}` // Fallback localhost HTTPS
  ],
  credentials: true
}));

// Rutas de API
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    const user = users.get(req.session.username);
    res.json({ 
      authenticated: true, 
      username: user.username,
      hasPasskeys: user.passkeys.length > 0
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (users.has(username)) {
    return res.status(400).json({ error: 'Usuario ya existe' });
  }
  
  const user = {
    id: `user-${Date.now()}`,
    username,
    password, // En producción, hashear la contraseña
    passkeys: []
  };
  
  users.set(username, user);
  await saveUsers();
  req.session.userId = user.id;
  req.session.username = username;
  
  res.json({ success: true, userId: user.id });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  
  req.session.userId = user.id;
  req.session.username = username;
  
  res.json({ success: true, userId: user.id });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/passkeys', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    const user = users.get(req.session.username);
    res.json({ passkeys: user.passkeys });
});

app.post('/api/passkey/register/begin', async (req, res) => {
  console.log(`\n🔑 [PASSKEY REGISTER BEGIN]`);
  
  if (!req.session.userId) {
    console.log(`❌ Error: Usuario no autenticado`);
    return res.status(401).json({ error: 'No autenticado' });
  }
  
  const user = users.get(req.session.username);
  console.log(`👤 Usuario: ${user.username} (ID: ${user.id})`);
  console.log(`🔐 Passkeys existentes: ${user.passkeys.length}`);
  
  // Detectar el origen (HTTP o HTTPS) basado en la solicitud
  const origin = getOrigin(req);
  console.log(`🌐 Origin detectado: ${origin}`);
  console.log(`🆔 rpID: ${rpID}`);
  
  // Generate challenge
  const challenge = crypto.randomBytes(32);
  challenges.set(user.id, toBase64Url(challenge));
  await saveChallenges();
  
  // Create passkey registration options
  const options = {
    challenge: toBase64Url(challenge),
    rp: {
      name: rpName,
      id: rpID
    },
    user: {
      id: toBase64Url(Buffer.from(user.id, 'utf8')),
      name: user.username,
      displayName: user.username
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 } // RS256
    ],
    timeout: 60000,
    attestation: 'direct',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: true,
      userVerification: 'required'
    },
    excludeCredentials: user.passkeys.map(passkey => ({
      id: passkey.credentialID,
      type: 'public-key',
      transports: passkey.transports
    })),
    extensions: {
      payment: {
        isPayment: true
      }
    }
  };
  
  console.log(`✅ Opciones de registro generadas exitosamente`);
  console.log(`🎲 Challenge guardado para usuario: ${user.id}`);
  
  res.json(options);
});

app.post('/api/passkey/register/complete', async (req, res) => {
  console.log(`\n🔑 [PASSKEY REGISTER COMPLETE]`);
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const user = users.get(req.session.username);
  const { id, rawId, response, type } = req.body;
  
  console.log(`👤 Usuario: ${user.username} (ID: ${user.id})`);
  
  try {
    const expectedChallenge = challenges.get(user.id);
    console.log(`🎲 Challenge esperado: ${expectedChallenge ? 'Encontrado' : 'NO ENCONTRADO'}`);
    
    if (!expectedChallenge) {
        return res.status(400).json({ error: 'No se encontró un desafío para este registro.' });
    }
    
    const verification = await verifyWebAuthnRegistration({
        response: req.body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: verification.error || 'La verificación del registro ha fallado.' });
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;
    const friendlyName = parseUserAgent(req.headers['user-agent']);
    
    /**
     * @typedef {Object} Passkey
     * @property {string} credentialID - ID de la credencial
     * @property {Uint8Array} credentialPublicKey - Clave pública de la credencial
     * @property {number} counter - Contador de seguridad que se incrementa con cada uso
     * @property {string[]} transports - Métodos de transporte soportados (ej: ['internal', 'ble', 'nfc'])
     * @property {string} createdAt - Fecha de creación de la credencial
     * @property {string} friendlyName - Nombre descriptivo de la credencial
     * @property {string} [lastUsedAt] - Última vez que se usó esta credencial
     */
    const newPasskey = {
      credentialID,
      credentialPublicKey,
      counter,
      transports: req.body.response.transports || ['internal'],
      createdAt: new Date().toISOString(),
      friendlyName: friendlyName,
    };
    
    user.passkeys.push(newPasskey);
    users.set(user.username, user);
    await saveUsers();
    
    challenges.delete(user.id);
    await saveChallenges();
    
    console.log(`✅ Passkey registrada exitosamente para ${user.username}`);
    res.json({ verified: true });

  } catch (error) {
    console.error('💥 Error en verificación de registro:', error);
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/passkey/authenticate/begin', async (req, res) => {
  console.log(`\n🔐 [PASSKEY AUTHENTICATE BEGIN]`);
  const { username } = req.body;
  
  const challenge = crypto.randomBytes(32);
  const challengeBase64Url = toBase64Url(challenge);
  
  // Guardar el desafío en la sesión para la verificación posterior
  req.session.challenge = challengeBase64Url;
  await new Promise(resolve => req.session.save(resolve));

  const options = {
    challenge: challengeBase64Url,
    userVerification: 'preferred',
    rpId: rpID,
  };
  
  // Si se proporciona un nombre de usuario, podemos sugerir credenciales al navegador.
  // Si no, se omitirá `allowCredentials` para permitir el descubrimiento de passkeys.
  if (username) {
    const user = users.get(username);
    if (user && user.passkeys.length > 0) {
      options.allowCredentials = user.passkeys.map(passkey => ({
        id: passkey.credentialID,
        type: 'public-key',
        transports: passkey.transports,
      }));
    }
  }
  
  console.log(`✅ Opciones de autenticación generadas`);
  res.json(options);
});

app.post('/api/passkey/authenticate/complete', async (req, res) => {
  console.log(`\n🔐 [PASSKEY AUTHENTICATE COMPLETE]`);
  const { response } = req.body;

  try {
    let user, passkey;
    // Buscar usuario y passkey por el ID de la credencial recibida
    for (const u of users.values()) {
        const foundPasskey = u.passkeys.find(p => p.credentialID === response.id);
        if (foundPasskey) {
            user = u;
            passkey = foundPasskey;
            break;
        }
    }

    if (!user || !passkey) {
        return res.status(404).json({ error: 'La credencial no está registrada.' });
    }

    // Verificar el desafío usando el que guardamos en la sesión
    const expectedChallenge = req.session.challenge;
    if (!expectedChallenge) {
        return res.status(400).json({ error: 'No se encontró desafío en la sesión.' });
    }
    
    const clientDataJSON = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));

    if (clientDataJSON.challenge !== expectedChallenge) {
        return res.status(400).json({ error: 'El desafío no coincide.' });
    }
    
    // Verificación de firma (simplificada para la demo)
    console.log(`✅ Verificación exitosa para ${user.username}`);
    
    // Iniciar sesión
    req.session.userId = user.id;
    req.session.username = user.username;
    delete req.session.challenge;
    await new Promise(resolve => req.session.save(resolve));

    res.json({ verified: true, username: user.username });

  } catch (error) {
      console.error('💥 Error en la verificación de autenticación:', error);
      res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/payment/spc/begin', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  
  const { amount, currency } = req.body;
  const user = users.get(req.session.username);
  
  const challenge = crypto.randomBytes(32);
  const challengeBase64Url = toBase64Url(challenge);
  
  // Guardar el desafío en la sesión para mayor seguridad
  req.session.paymentChallenge = challengeBase64Url;
  await new Promise(resolve => req.session.save(resolve));
  
  const spcData = {
    challenge: challengeBase64Url,
    credentialIds: user.passkeys.map(p => p.credentialID),
    total: {
        currency: currency || 'EUR',
        value: amount.toString()
    }
  };
  
  res.json(spcData);
});

app.post('/api/payment/spc/complete', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  
  const user = users.get(req.session.username);
  const { response } = req.body;
  
  try {
    const passkey = user.passkeys.find(p => p.credentialID === response.id);
    if (!passkey) {
      return res.status(404).json({ error: 'La credencial de pago no está registrada para este usuario.' });
    }

    const expectedChallenge = req.session.paymentChallenge;
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No se encontró desafío de pago en la sesión.' });
    }

    let credentialPublicKey = passkey.credentialPublicKey;
    if (credentialPublicKey && typeof credentialPublicKey === 'string') {
      // Convert base64 string to Uint8Array
      credentialPublicKey = new Uint8Array(Buffer.from(credentialPublicKey, 'base64'));
    } else if (credentialPublicKey && typeof credentialPublicKey === 'object' && !Buffer.isBuffer(credentialPublicKey) && !(credentialPublicKey instanceof Uint8Array)) {
      credentialPublicKey = new Uint8Array(Object.values(credentialPublicKey));
    }

    console.log('🔍 Debugging SPC verification:');
    console.log('- Passkey object:', JSON.stringify(passkey, null, 2));
    console.log('- Passkey counter:', passkey.counter);
    console.log('- Expected challenge:', expectedChallenge);
    console.log('- Credential public key type:', typeof credentialPublicKey);
    console.log('- Credential public key length:', credentialPublicKey?.length);
    console.log('- Is Uint8Array:', credentialPublicKey instanceof Uint8Array);

    const verification = await verifySPCAuthentication({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credentialPublicKey,
      counter: passkey.counter || 0
    });

    if (!verification.verified) {
      return res.status(400).json({ error: verification.error || 'La verificación del pago ha fallado.' });
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    users.set(user.username, user);
    await saveUsers();

    delete req.session.paymentChallenge;
    await new Promise(resolve => req.session.save(resolve));

    const paymentId = `payment-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    // Obtener información detallada de la credencial
    const credentialInfo = {
      credentialId: passkey.credentialID,
      friendlyName: passkey.friendlyName || 'Dispositivo sin nombre',
      createdAt: passkey.createdAt || timestamp,
      lastUsedAt: timestamp,
      transports: passkey.transports || ['internal'],
      counter: verification.authenticationInfo.newCounter
    };

    // Información de la operación de pago
    const operationInfo = {
      paymentId,
      timestamp,
      status: 'completed',
      verified: true,
      userVerified: verification.authenticationInfo.userVerified,
      userPresent: verification.authenticationInfo.userPresent,
      rpId: rpID,
      origin: origin,
      // Incluir detalles del pago del clientData si están disponibles
      paymentDetails: verification.clientData?.payment?.paymentDetails || {},
      total: verification.clientData?.payment?.total || {},
      payee: verification.clientData?.payment?.payee || {},
      instrument: verification.clientData?.payment?.instrument || {}
    };

    // Actualizar el contador de la credencial
    passkey.lastUsedAt = timestamp;
    users.set(user.username, user);
    await saveUsers();

    // Enviar respuesta con información detallada
    res.json({
      verified: true,
      paymentId,
      credential: credentialInfo,
      operation: operationInfo,
      timestamp
    });

  } catch (error) {
    console.error('💥 Error en la verificación del pago:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
});

app.post('/api/passkey/delete', async (req, res) => {
  console.log(`\n🗑️ [PASSKEY DELETE]`);
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const { credentialID } = req.body;
  if (!credentialID) {
    return res.status(400).json({ error: 'credentialID es requerido' });
  }

  const user = users.get(req.session.username);
  const passkeyIndex = user.passkeys.findIndex(p => p.credentialID === credentialID);

  if (passkeyIndex === -1) {
    return res.status(404).json({ error: 'Passkey no encontrada' });
  }

  user.passkeys.splice(passkeyIndex, 1);
  users.set(req.session.username, user);
  await saveUsers();

  console.log(`✅ Passkey ${credentialID} eliminada para el usuario ${user.username}`);
  res.json({ success: true });
});

// Solo arrancar el servidor si se ejecuta directamente (desarrollo local)
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor Express escuchando en http://localhost:${PORT}`);
  });
}

export default app;
