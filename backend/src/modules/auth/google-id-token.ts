import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

/**
 * Verifies a "Sign in with Google" ID token (a JWT signed by Google, RS256)
 * using only Node's crypto — no google-auth-library dependency (see the
 * lockfile gotcha in CLAUDE.md).
 *
 * Checks, per Google's "Verify the Google ID token" guide:
 *  - signature, against Google's published keys (JWKS, cached)
 *  - `aud` is our OAuth client id (token was issued for Trimly, not another app)
 *  - `iss` is Google, `exp` not passed
 *  - the email is verified
 */

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SECONDS = 60;

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export class GoogleTokenError extends Error {}

type Jwk = JsonWebKey & { kid?: string; alg?: string };
export type JwksFetcher = () => Promise<{ keys: Jwk[]; maxAgeSeconds: number }>;

export const fetchGoogleJwks: JwksFetcher = async () => {
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new GoogleTokenError(`Could not fetch Google keys (${res.status})`);
  const maxAge = Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  const body = (await res.json()) as { keys: Jwk[] };
  return { keys: body.keys, maxAgeSeconds: maxAge };
};

export class GoogleIdTokenVerifier {
  private cache: { keys: Jwk[]; expires: number } | null = null;

  constructor(private readonly fetcher: JwksFetcher = fetchGoogleJwks) {}

  private async keyFor(kid: string, now: number): Promise<Jwk> {
    const find = () => this.cache?.keys.find((k) => k.kid === kid);
    if (!this.cache || this.cache.expires < now || !find()) {
      // Refresh on expiry, or when Google rotated in a key we haven't seen.
      const { keys, maxAgeSeconds } = await this.fetcher();
      this.cache = { keys, expires: now + maxAgeSeconds * 1000 };
    }
    const key = find();
    if (!key) throw new GoogleTokenError('Unknown signing key');
    return key;
  }

  async verify(idToken: string, clientId: string, now = Date.now()): Promise<GoogleIdentity> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new GoogleTokenError('Malformed token');
    const [h, p, s] = parts;
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(h, 'base64url').toString());
      claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    } catch {
      throw new GoogleTokenError('Malformed token');
    }
    if (header.alg !== 'RS256' || !header.kid) throw new GoogleTokenError('Unexpected token algorithm');

    const jwk = await this.keyFor(header.kid, now);
    const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
    if (!ok) throw new GoogleTokenError('Bad signature');

    const aud = claims.aud;
    if (aud !== clientId) throw new GoogleTokenError('Token was issued for a different app');
    if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) throw new GoogleTokenError('Not issued by Google');
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now - CLOCK_SKEW_SECONDS * 1000) {
      throw new GoogleTokenError('Token expired');
    }
    if (typeof claims.sub !== 'string' || !claims.sub) throw new GoogleTokenError('Missing account id');
    if (typeof claims.email !== 'string' || claims.email_verified !== true) {
      throw new GoogleTokenError('Google email is not verified');
    }
    return {
      sub: claims.sub,
      email: claims.email.toLowerCase(),
      name: typeof claims.name === 'string' ? claims.name : null,
      picture: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }
}
