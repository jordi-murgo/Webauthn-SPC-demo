import express from 'express';
import { storage, sessionManager, errorHandler, validateRequiredFields } from '../../lib/utils.js';
import { createAuthenticationOptions, verifyAuthentication } from '../../lib/webauthn.js';

const router = express.Router();

// Start authentication
router.post('/begin', async (req, res, next) => {
  try {
    const { username } = req.body;
    validateRequiredFields(['username'], req.body);
    
    // Find user by username
    const user = await storage.get(`user:${username}`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's credentials for allowCredentials
    const allowCredentials = user.credentials.map(cred => ({
      id: Buffer.from(cred.id, 'base64'),
      type: 'public-key',
      transports: cred.transports || ['internal']
    }));
    
    // Store user ID in session for the completion step
    req.session.auth = { userId: user.id };
    await new Promise(resolve => req.session.save(resolve));
    
    // Generate authentication options
    const options = await createAuthenticationOptions(user.id, req, {
      allowCredentials,
      userVerification: 'required',
      operation: 'authentication'
    });
    
    res.json(options);
  } catch (error) {
    next(error);
  }
});

// Complete authentication
router.post('/complete', async (req, res, next) => {
  try {
    const { credential } = req.body;
    validateRequiredFields(['credential'], req.body);
    
    const { userId } = req.session.auth || {};
    if (!userId) {
      return res.status(400).json({ error: 'Authentication session expired' });
    }
    
    // Get user
    const user = await storage.get(`user:${req.body.username}`);
    if (!user || user.id !== userId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Find the credential
    const credentialId = Buffer.from(credential.id, 'base64').toString('base64');
    const userCredential = user.credentials.find(c => c.id === credentialId);
    
    if (!userCredential) {
      return res.status(400).json({ error: 'Credential not found' });
    }
    
    // Verify the authentication
    const verification = await verifyAuthentication(
      credential,
      req,
      userCredential.counter
    );
    
    if (!verification.verified) {
      return res.status(400).json({ error: 'Authentication verification failed' });
    }
    
    // Update credential counter
    userCredential.counter = verification.authenticationInfo.newCounter;
    userCredential.lastUsedAt = new Date().toISOString();
    
    // Save the updated user
    await storage.set(`user:${user.username}`, user);
    
    // Clear auth session
    delete req.session.auth;
    await new Promise(resolve => req.session.save(resolve));
    
    // Create user session
    await sessionManager.createSession(req, res, user.id);
    
    res.json({ 
      verified: true, 
      user: { id: user.id, username: user.username } 
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', sessionManager.requireAuth, async (req, res, next) => {
  try {
    await sessionManager.destroySession(req);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Check session
router.get('/session', (req, res) => {
  res.json({
    isAuthenticated: !!req.session.userId,
    userId: req.session.userId
  });
});

// Error handling middleware
router.use(errorHandler);

export default router;
