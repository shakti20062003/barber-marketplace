import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPayload, generateVapidKeys, vapidAuthorization } from './web-push.js';

const b = (s: string) => Buffer.from(s, 'base64url');

describe('encryptPayload (RFC 8291)', () => {
  it('matches the RFC 8291 Appendix A worked example byte-for-byte', () => {
    const body = encryptPayload(
      Buffer.from('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      { salt: b('DGv6ra1nlYgDCS1FRnbzlw'), serverPrivateKey: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw') },
    );
    expect(body.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('round-trips: the browser side can decrypt what we send', () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = Buffer.from('0123456789abcdef');
    const msg = { title: 'New booking', body: 'Rahul · Haircut · 5:30 PM' };
    const body = encryptPayload(Buffer.from(JSON.stringify(msg)), ua.getPublicKey().toString('base64url'), auth.toString('base64url'));

    // Decrypt as a browser would (RFC 8291 §3.4 / RFC 8188).
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const ciphertext = body.subarray(21 + idlen);
    const hk = (s: Buffer, ikm: Buffer, info: Buffer, n: number) =>
      createHmac('sha256', createHmac('sha256', s).update(ikm).digest()).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, n);
    const ikm = hk(auth, ua.computeSecret(asPublic), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32);
    const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ciphertext.subarray(-16));
    const plain = Buffer.concat([d.update(ciphertext.subarray(0, -16)), d.final()]);
    expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
    expect(JSON.parse(plain.subarray(0, -1).toString())).toEqual(msg);
  });
});

describe('vapidAuthorization (RFC 8292)', () => {
  it('produces an ES256 JWT that verifies with the advertised public key', () => {
    const keys = generateVapidKeys();
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://example.test', 1_700_000_000_000);
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, sig] = jwt.split('.');
    const claims = JSON.parse(b(c).toString());
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://example.test' });
    expect(claims.exp).toBe(1_700_000_000 + 12 * 3600);
    const pub = b(keys.publicKey);
    const key = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
      format: 'jwk',
    });
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, b(sig))).toBe(true);
  });
});
