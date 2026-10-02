import { describe, expect, it, beforeAll } from 'vitest';
import { googleTokenTekshir } from './kirish-google';

// Google ID token tekshiruvi — xavfsizlik chegarasi: faqat Google imzolagan, bizning Client ID uchun, muddati o'tmagan,
// emaili tasdiqlangan token o'tadi.
const CID = 'test-client.apps.googleusercontent.com';
const b64u = (b: Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let juft: CryptoKeyPair; let begona: CryptoKeyPair; let jwk: JsonWebKey & { kid?: string };
const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

async function token(payload: Record<string, unknown>, o: { kalit?: CryptoKey; kid?: string; alg?: string } = {}) {
  const h = b64u(JSON.stringify({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const s = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', o.kalit ?? juft.privateKey, new TextEncoder().encode(h + '.' + p)));
  return `${h}.${p}.${b64u(s)}`;
}
const yaxshi = () => ({ iss: 'https://accounts.google.com', aud: CID, sub: '1234567890', email: 'Aziz@Gmail.com', email_verified: true, name: 'Aziz', exp: Math.floor(Date.now() / 1000) + 600 });

describe('googleTokenTekshir', () => {
  beforeAll(async () => {
    juft = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']) as CryptoKeyPair;
    begona = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']) as CryptoKeyPair;
    jwk = { ...(await crypto.subtle.exportKey('jwk', juft.publicKey) as JsonWebKey), kid: 'k1' };
  });

  it('haqiqiy token — email kichik harfda, ism va sub bilan', async () => {
    const r = await googleTokenTekshir(await token(yaxshi()), CID, [jwk]);
    expect(r).toEqual({ ok: true, p: { email: 'aziz@gmail.com', ism: 'Aziz', sub: '1234567890' } });
  });

  it.each([
    ['begona kalit bilan imzolangan', async () => token(yaxshi(), { kalit: begona.privateKey }), 'IMZO'],
    ['boshqa ilova uchun (aud)', async () => token({ ...yaxshi(), aud: 'boshqa' }), 'AUD'],
    ['soxta emitent (iss)', async () => token({ ...yaxshi(), iss: 'https://evil.example' }), 'ISS'],
    ['muddati o‘tgan', async () => token({ ...yaxshi(), exp: Math.floor(Date.now() / 1000) - 10 }), 'EXP'],
    ['email tasdiqlanmagan', async () => token({ ...yaxshi(), email_verified: false }), 'EMAIL_TASDIQLANMAGAN'],
    ['noma‘lum kalit (kid)', async () => token(yaxshi(), { kid: 'yoq' }), 'KID'],
    ['alg=none hujumi', async () => token(yaxshi(), { alg: 'none' }), 'ALG'],
  ])('rad etiladi: %s', async (_n, yasa, sabab) => {
    expect(await googleTokenTekshir(await yasa(), CID, [jwk])).toEqual({ ok: false, sabab });
  });

  it('payload o‘zgartirilsa imzo buziladi', async () => {
    const [h, , s] = (await token(yaxshi())).split('.');
    const soxta = b64u(JSON.stringify({ ...yaxshi(), email: 'boss@gmail.com' }));
    expect(await googleTokenTekshir(`${h}.${soxta}.${s}`, CID, [jwk])).toEqual({ ok: false, sabab: 'IMZO' });
  });
});
