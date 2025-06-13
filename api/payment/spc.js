import express from 'express';
import { storage, sessionManager, errorHandler, validateRequiredFields } from '../../../lib/utils.js';
import { createAuthenticationOptions, verifyAuthentication } from '../../../lib/webauthn.js';

const router = express.Router();

// Middleware to require authentication
router.use(sessionManager.requireAuth);

// Start SPC payment
router.post('/begin', async (req, res, next) => {
  try {
    const { amount, currency = 'EUR' } = req.body;
    validateRequiredFields(['amount'], req.body);
    
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get user
    const user = await storage.get(`user:${req.body.username}`);
    if (!user || user.id !== userId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prepare payment details
    const paymentDetails = {
      total: {
        currency,
        value: amount.toString(),
      },
      displayItems: [
        {
          label: 'Total',
          amount: { currency, value: amount.toString() },
        },
      ],
    };
    
    // Store payment details in session
    req.session.payment = { amount, currency, paymentDetails };
    await new Promise(resolve => req.session.save(resolve));
    
    // Get user's credentials for allowCredentials
    const allowCredentials = user.credentials.map(cred => ({
      id: Buffer.from(cred.id, 'base64'),
      type: 'public-key',
      transports: cred.transports || ['internal']
    }));
    
    // Generate authentication options for SPC
    const options = await createAuthenticationOptions(userId, req, {
      allowCredentials,
      userVerification: 'required',
      operation: 'payment',
      extensions: {
        payment: {
          isPayment: true,
          rpData: {
            accountId: user.id,
            payeeName: 'Example Merchant',
            payeeOrigin: req.get('origin') || 'https://webauthn-spc-demo.vercel.app',
            total: paymentDetails.total,
            instrument: {
              icon: 'https://webauthn-spc-demo.vercel.app/images/payment-icon.png',
              displayName: 'Payment Method',
            },
          },
        },
      },
    });
    
    res.json({
      ...options,
      payment: {
        rp: {
          id: options.rpId,
          name: 'WebAuthn SPC Demo',
        },
        instrument: {
          displayName: 'Payment Method',
        },
        payee: {
          name: 'Example Merchant',
        },
        total: paymentDetails.total,
        paymentDetails,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Complete SPC payment
router.post('/complete', async (req, res, next) => {
  try {
    const { credential } = req.body;
    validateRequiredFields(['credential'], req.body);
    
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
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
    
    // Get payment details from session
    const payment = req.session.payment;
    if (!payment) {
      return res.status(400).json({ error: 'Payment session expired' });
    }
    
    // Verify the authentication
    const verification = await verifyAuthentication(
      credential,
      req,
      userCredential.counter
    );
    
    if (!verification.verified) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }
    
    // Update credential counter
    userCredential.counter = verification.authenticationInfo.newCounter;
    userCredential.lastUsedAt = new Date().toISOString();
    
    // Save the updated user
    await storage.set(`user:${user.username}`, user);
    
    // Clear payment session
    delete req.session.payment;
    await new Promise(resolve => req.session.save(resolve));
    
    // Prepare response
    const timestamp = new Date().toISOString();
    const paymentId = `pay_${Date.now()}`;
    
    const response = {
      verified: true,
      paymentId,
      timestamp,
      credential: {
        credentialId: userCredential.id,
        friendlyName: userCredential.friendlyName || 'Passkey',
        createdAt: userCredential.createdAt,
        lastUsedAt: userCredential.lastUsedAt,
        transports: userCredential.transports || ['internal'],
        counter: userCredential.counter,
      },
      operation: {
        paymentId,
        timestamp,
        status: 'completed',
        verified: true,
        userVerified: verification.authenticationInfo.userVerified,
        userPresent: verification.authenticationInfo.userPresent,
        rpId: verification.clientData?.rp?.id,
        origin: verification.clientData?.origin,
        paymentDetails: verification.clientData?.payment?.paymentDetails || {},
        total: verification.clientData?.payment?.total || payment.total,
        payee: verification.clientData?.payment?.payee || { name: 'Example Merchant' },
        instrument: verification.clientData?.payment?.instrument || {},
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
router.use(errorHandler);

export default router;
