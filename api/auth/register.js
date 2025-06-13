import express from 'express';
import { storage, sessionManager, errorHandler, validateRequiredFields } from '../../lib/utils.js';
import { createRegistrationOptions } from '../../lib/webauthn.js';

const router = express.Router();

// Start registration
router.post('/begin', async (req, res, next) => {
  try {
    const { username } = req.body;
    validateRequiredFields(['username'], req.body);
    
    // Check if user already exists
    const existingUser = await storage.get(`user:${username}`);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Create a new user
    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      username,
      createdAt: new Date().toISOString(),
      credentials: []
    };
    
    await storage.set(`user:${username}`, user);
    
    // Generate registration options
    const options = await createRegistrationOptions(username, userId, req);
    
    // Store user ID in session for the completion step
    req.session.registration = { userId };
    await new Promise(resolve => req.session.save(resolve));
    
    res.json(options);
  } catch (error) {
    next(error);
  }
});

// Complete registration
router.post('/complete', async (req, res, next) => {
  try {
    const { credential } = req.body;
    validateRequiredFields(['credential'], req.body);
    
    const { userId } = req.session.registration || {};
    if (!userId) {
      return res.status(400).json({ error: 'Registration session expired' });
    }
    
    // Verify the registration
    const verification = await verifyRegistration(credential, req);
    
    if (!verification.verified) {
      return res.status(400).json({ error: 'Registration verification failed' });
    }
    
    // Get user and add the new credential
    const user = await storage.get(`user:${req.body.username}`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    
    const newCredential = {
      id: credentialID,
      publicKey: credentialPublicKey,
      counter: counter || 0,
      transports: credential.transports || ['internal'],
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    
    user.credentials.push(newCredential);
    await storage.set(`user:${user.username}`, user);
    
    // Clear registration session
    delete req.session.registration;
    await new Promise(resolve => req.session.save(resolve));
    
    // Log in the user
    await sessionManager.createSession(req, res, user.id);
    
    res.json({ verified: true, userId: user.id });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
router.use(errorHandler);

export default router;
