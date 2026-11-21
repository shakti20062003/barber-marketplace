import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

/**
 * Minimal Web Push sender using only Node's crypto — deliberately no npm
 * dependency (adding packages on Windows has broken the Linux lockfile
 * before; see CLAUDE.md "Lockfile gotcha").
 *
 *  - VAPID (RFC 8292): an ES256-signed JWT identifies this server to the
 *    browser's push service (FCM for Chrome/Android, Apple, Mozilla).
 *  - Payload encryption (RFC 8291, "aes128gcm" content coding, RFC 8188):
 *    the message is encrypted to the subscribing browser's key, so the push
 *    service can't read it.
 */

const b64url = (buf: Buffer) => buf.toString('base64url');
const fromB64url = (s: string) => Buffer.from(s, 'base64url');

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** HKDF (RFC 5869) with a single output block — enough for ≤32-byte outputs. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url — what browsers need. */
  publicKey: string;
  /** 32-byte private scalar, base64url. */
  privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

function privateKeyObject(keys: VapidKeys): KeyObject {
  const pub = fromB64url(keys.publicKey); // 0x04 || X(32) || Y(32)
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/** `Authorization` header value for a push endpoint. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: privateKeyObject(keys),
    dsaEncoding: 'ieee-p1363', // raw r||s, as JWS ES256 requires
  });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * RFC 8291 encryption. `p256dh` / `auth` come from the browser's
 * PushSubscription. Returns the request body (header block + ciphertext).
 */
export function encryptPayload(
  payload: Buffer,
  p256dh: string,
  auth: string,
  /** Test hooks: fixed salt / server key make the output deterministic. */
  opts: { salt?: Buffer; serverPrivateKey?: Buffer } = {},
): Buffer {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);

  const server = createECDH('prime256v1');
  if (opts.serverPrivateKey) server.setPrivateKey(opts.serverPrivateKey);
  else server.generateKeys();
  const asPublic = server.getPublicKey();
  const ecdhSecret = server.computeSecret(uaPublic);

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = opts.salt ?? randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // Single record: plaintext || 0x02 (last-record delimiter, no padding).
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, ciphertext]);
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one push. Resolves with the push service's HTTP status. */
export async function sendWebPush(
  target: PushTarget,
  payload: object,
  keys: VapidKeys,
  subject: string,
): Promise<number> {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(target.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 60 * 60),
      Urgency: 'high',
    },
    body: new Uint8Array(body),
  });
  return res.status;
}
