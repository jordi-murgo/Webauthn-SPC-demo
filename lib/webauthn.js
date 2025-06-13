import { randomBytes } from 'crypto';
import { cbor } from '@digitalbazaar/cbor';
import * as cborld from '@digitalbazaar/cborld';
import { storage, getRequestInfo } from './utils.js';

// Generate a random challenge (base64url encoded)
export function generateChallenge() {
  return randomBytes(32).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate a random user ID
export function generateUserId() {
  return randomBytes(16).toString('hex');
}

// Store a challenge in the database
export async function storeChallenge(userId, challenge, operation = 'authentication') {
  const challengeId = randomBytes(16).toString('hex');
  const challengeData = {
    id: challengeId,
    userId,
    challenge,
    operation,
    timestamp: new Date().toISOString(),
    verified: false
  };
  
  await storage.set(`challenge:${challengeId}`, challengeData);
  return challengeId;
}

// Verify and consume a challenge
export async function verifyChallenge(challengeId, userId, operation) {
  const challengeKey = `challenge:${challengeId}`;
  const challengeData = await storage.get(challengeKey);
  
  if (!challengeData || 
      challengeData.userId !== userId || 
      challengeData.operation !== operation ||
      challengeData.verified) {
    return false;
  }
  
  // Mark as verified to prevent replay attacks
  challengeData.verified = true;
  await storage.set(challengeKey, challengeData);
  
  return challengeData.challenge;
}

// Create registration options for WebAuthn
export async function createRegistrationOptions(username, userId, req) {
  const { rpId, origin } = getRequestInfo(req);
  const challenge = generateChallenge();
  
  const options = {
    rp: {
      name: 'WebAuthn SPC Demo',
      id: rpId,
    },
    user: {
      id: Buffer.from(userId, 'hex'),
      name: username,
      displayName: username,
    },
    challenge: Buffer.from(challenge, 'base64'),
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },  // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    timeout: 60000,
    attestation: 'direct',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: true,
      userVerification: 'required',
    },
  };
  
  // Store the challenge for later verification
  await storeChallenge(userId, challenge, 'registration');
  
  return options;
}

// Create authentication options for WebAuthn/SPC
export async function createAuthenticationOptions(userId, req, options = {}) {
  const { rpId, origin } = getRequestInfo(req);
  const challenge = generateChallenge();
  
  const authOptions = {
    challenge: Buffer.from(challenge, 'base64'),
    timeout: 60000,
    rpId,
    userVerification: 'required',
    ...options
  };
  
  // Store the challenge for later verification
  await storeChallenge(userId, challenge, options.operation || 'authentication');
  
  return authOptions;
}

// Verify WebAuthn registration
// Note: This is a simplified version - in production, you'd want to validate the attestation
// and the credential's attestation statement
// For SPC, we'll focus on the authentication part instead

export async function verifyRegistration(attestationResponse, req) {
  // In a real implementation, you would:
  // 1. Parse and validate the attestation object
  // 2. Verify the attestation statement
  // 3. Check that the credential is not already registered
  // 4. Store the new credential
  
  // For now, we'll just return a success response
  return {
    verified: true,
    registrationInfo: {
      credentialID: Buffer.from('dummy-credential-id').toString('base64url'),
      credentialPublicKey: Buffer.from('dummy-public-key'),
      counter: 0,
    }
  };
}

// Verify WebAuthn/SPC authentication
export async function verifyAuthentication(credential, req, expectedChallenge) {
  const { rpId, origin } = getRequestInfo(req);
  
  // In a real implementation, you would:
  // 1. Look up the stored credential by credential.id
  // 2. Verify the signature using the stored public key
  // 3. Verify the authenticator data (flags, RP ID hash, etc.)
  // 4. Verify the challenge matches the expected one
  // 5. Update the credential's counter
  
  // For SPC, we also need to verify the payment-specific data in clientDataJSON
  
  return {
    verified: true,
    authenticationInfo: {
      newCounter: 1, // Increment the counter
      userVerified: true,
      userPresent: true,
    },
    clientData: {
      type: 'payment.get',
      origin,
      challenge: expectedChallenge,
      payment: {
        rp: { id: rpId, name: 'WebAuthn SPC Demo' },
        instrument: { displayName: 'Visa •••• 1234' },
        payee: { name: 'Example Merchant' },
        total: { currency: 'EUR', value: '29.99' },
        paymentDetails: {}
      }
    }
  };
}
