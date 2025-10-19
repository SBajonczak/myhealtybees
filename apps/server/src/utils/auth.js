const crypto = require('crypto');

const SUPPORTED_PROVIDERS = ['google', 'facebook', 'microsoft'];
const AUTH_SECRET = process.env.AUTH_SECRET || 'development-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (str.length % 4);
  if (padding !== 4) {
    str = str + '='.repeat(padding);
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

function sign(data) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(data).digest();
}

function createToken(payload) {
  const now = Date.now();
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL_MS };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const encodedBody = base64UrlEncode(Buffer.from(JSON.stringify(body)));
  const signature = base64UrlEncode(sign(`${encodedHeader}.${encodedBody}`));
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedBody, signature] = parts;
  const expectedSignature = base64UrlEncode(sign(`${encodedHeader}.${encodedBody}`));
  if (signature.length !== expectedSignature.length) {
    return null;
  }
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encodedBody));
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function ensureProvider(provider) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error('UNSUPPORTED_PROVIDER');
  }
}

module.exports = {
  createToken,
  verifyToken,
  ensureProvider,
  SUPPORTED_PROVIDERS
};
