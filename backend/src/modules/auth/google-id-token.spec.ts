import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GoogleIdTokenVerifier, GoogleTokenError } from './google-id-token.js';

const CLIENT_ID = 'trimly-test.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const NOW = 1_800_000_000_000;

function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1', typ: 'JWT' }) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const s = sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url');
  return `${h}.${p}.${s}`;
}

const good = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'Founder@Example.com',
  email_verified: true,
  name: 'Founder',
  exp: NOW / 1000 + 3600,
};

const verifier = () => new GoogleIdTokenVerifier(async () => ({ keys: [jwk], maxAgeSeconds: 3600 }));

describe('GoogleIdTokenVerifier', () => {
  it('accepts a valid token and normalises the email', async () => {
    const id = await verifier().verify(token(good), CLIENT_ID, NOW);
    expect(id).toEqual({ sub: '1234567890', email: 'founder@example.com', name: 'Founder', picture: null });
  });

  it.each([
    ['another app', { ...good, aud: 'someone-else.apps.googleusercontent.com' }],
    ['a non-Google issuer', { ...good, iss: 'https://evil.example' }],
    ['an expired token', { ...good, exp: NOW / 1000 - 3600 }],
    ['an unverified email', { ...good, email_verified: false }],
    ['no account id', { ...good, sub: '' }],
  ])('rejects %s', async (_label, claims) => {
    await expect(verifier().verify(token(claims), CLIENT_ID, NOW)).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('rejects a tampered token (signature no longer matches)', async () => {
    const [h, , s] = token(good).split('.');
    const forged = Buffer.from(JSON.stringify({ ...good, sub: 'attacker' })).toString('base64url');
    await expect(verifier().verify(`${h}.${forged}.${s}`, CLIENT_ID, NOW)).rejects.toThrow('Bad signature');
  });

  it('rejects tokens signed with an unknown key or a non-RS256 alg', async () => {
    await expect(verifier().verify(token(good, { alg: 'RS256', kid: 'other' }), CLIENT_ID, NOW)).rejects.toThrow('Unknown signing key');
    await expect(verifier().verify(token(good, { alg: 'none', kid: 'k1' }), CLIENT_ID, NOW)).rejects.toThrow('algorithm');
  });
});
