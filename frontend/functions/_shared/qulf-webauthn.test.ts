import { describe, expect, it } from 'vitest';
import { base64url } from './desktop-device';
import { sha256 } from './qulf';
import { cborOqi, kirishTekshir, regTekshir, rpVaOrigin } from './qulf-webauthn';

const gen = (alg: object) => crypto.subtle.generateKey(alg as never, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const RP = 'qurai.example';
const ORIGIN = 'https://qurai.example';
const K = { challenge: 'CHALLENGE_ABC', origins: [ORIGIN], rpId: RP };
const te = new TextEncoder();

// ---- test uchun minimal CBOR kodlovchi ----
const head = (major: number, n: number): number[] => n < 24 ? [(major << 5) | n] : n < 256 ? [(major << 5) | 24, n] : [(major << 5) | 25, n >> 8, n & 255];
const cInt = (n: number) => n >= 0 ? head(0, n) : head(1, -1 - n);
const cBytes = (b: Uint8Array) => [...head(2, b.length), ...b];
const cText = (s: string) => { const b = te.encode(s); return [...head(3, b.length), ...b]; };
const cMap = (pairs: [number[], number[]][]) => [...head(5, pairs.length), ...pairs.flat(2)];

const flags = { UP: 1, UV: 4, AT: 0x40 };
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
async function authData(o: { rpId?: string; flags: number; counter: number; att?: { id: Uint8Array; cose: number[] } }) {
  const head = [...(await sha256(o.rpId ?? RP)), o.flags, ...u32(o.counter)];
  if (!o.att) return new Uint8Array(head);
  return new Uint8Array([...head, ...new Uint8Array(16), o.att.id.length >> 8, o.att.id.length & 255, ...o.att.id, ...o.att.cose]);
}
const clientData = (type: string, challenge: string, origin = ORIGIN, extra: object = {}) => te.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }));

async function ec() {
  const kp = await gen({ name: 'ECDSA', namedCurve: 'P-256' });
  const jwk = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as JsonWebKey;
  const x = Uint8Array.from(atob(jwk.x!.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const y = Uint8Array.from(atob(jwk.y!.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const cose = cMap([[cInt(1), cInt(2)], [cInt(3), cInt(-7)], [cInt(-1), cInt(1)], [cInt(-2), cBytes(x)], [cInt(-3), cBytes(y)]]);
  return { kp, cose };
}
const rawToDer = (raw: Uint8Array): Uint8Array => {
  const enc = (v: Uint8Array) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; let x = v.slice(i); if (x[0] & 0x80) { const y = new Uint8Array(x.length + 1); y.set(x, 1); x = y; } return [0x02, x.length, ...x]; };
  const body = [...enc(raw.slice(0, 32)), ...enc(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
};
async function regVektor(o: { challenge?: string; origin?: string; rpId?: string; fl?: number; type?: string } = {}) {
  const { kp, cose } = await ec();
  const id = new Uint8Array(32).map((_, i) => i + 1);
  const ad = await authData({ rpId: o.rpId, flags: o.fl ?? (flags.UP | flags.UV | flags.AT), counter: 0, att: { id, cose } });
  const ao = new Uint8Array(cMap([[cText('fmt'), cText('none')], [cText('attStmt'), cMap([])], [cText('authData'), cBytes(ad)]]));
  return { kp, id, inp: { clientDataJSON: base64url(clientData(o.type ?? 'webauthn.create', o.challenge ?? K.challenge, o.origin)), attestationObject: base64url(ao) } };
}
async function kirishVektor(kp: CryptoKeyPair, o: { challenge?: string; origin?: string; rpId?: string; fl?: number; counter?: number; type?: string; buzuq?: boolean } = {}) {
  const cd = clientData(o.type ?? 'webauthn.get', o.challenge ?? K.challenge, o.origin);
  const ad = await authData({ rpId: o.rpId, flags: o.fl ?? (flags.UP | flags.UV), counter: o.counter ?? 5 });
  const data = new Uint8Array([...ad, ...(await sha256(cd))]);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, data));
  if (o.buzuq) raw[10] ^= 0xff;
  return { clientDataJSON: base64url(cd), authenticatorData: base64url(ad), signature: base64url(rawToDer(raw)) };
}

describe('CBOR', () => {
  it('map/int/bytes/text, salbiy son', () => {
    const b = new Uint8Array(cMap([[cInt(1), cInt(2)], [cInt(-1), cText('x')], [cText('b'), cBytes(new Uint8Array([1, 2]))]]));
    const m = cborOqi(b).v as Map<unknown, unknown>;
    expect(m.get(1)).toBe(2); expect(m.get(-1)).toBe('x'); expect(m.get('b')).toEqual(new Uint8Array([1, 2]));
  });
  it('kesilgan/cheksiz uzunlik rad', () => {
    expect(() => cborOqi(new Uint8Array([0x58, 0x20, 1]))).toThrow();
    expect(() => cborOqi(new Uint8Array([0x5f, 0xff]))).toThrow();
    expect(() => cborOqi(new Uint8Array([]))).toThrow();
  });
});

describe('WebAuthn ro\'yxatdan o\'tish (ES256)', () => {
  it('to\'g\'ri attestation none -> SPKI', async () => {
    const v = await regVektor();
    const r = await regTekshir(v.inp, K);
    expect(r).toMatchObject({ ok: true, alg: -7, hisob: 0, kredensial_id: base64url(v.id) });
    if (r.ok) expect(r.ochiq_kalit.length).toBeGreaterThan(60);
  });
  it('noto\'g\'ri challenge / origin / rpId / type / UV yo\'q / AT yo\'q rad', async () => {
    expect(await regTekshir((await regVektor({ challenge: 'BOSHQA' })).inp, K)).toMatchObject({ ok: false, code: 'CHALLENGE' });
    expect(await regTekshir((await regVektor({ origin: 'https://evil.example' })).inp, K)).toMatchObject({ ok: false, code: 'ORIGIN' });
    expect(await regTekshir((await regVektor({ rpId: 'evil.example' })).inp, K)).toMatchObject({ ok: false, code: 'RP_ID' });
    expect(await regTekshir((await regVektor({ type: 'webauthn.get' })).inp, K)).toMatchObject({ ok: false, code: 'CLIENT_DATA' });
    expect(await regTekshir((await regVektor({ fl: flags.UP | flags.AT })).inp, K)).toMatchObject({ ok: false, code: 'UV' });
    expect(await regTekshir((await regVektor({ fl: flags.UP | flags.UV })).inp, K)).toMatchObject({ ok: false, code: 'AT_YOQ' });
  });
  it('buzuq attestationObject rad', async () => {
    expect(await regTekshir({ clientDataJSON: base64url(clientData('webauthn.create', K.challenge)), attestationObject: base64url(new Uint8Array([1, 2, 3])) }, K)).toMatchObject({ ok: false });
  });
});

describe('WebAuthn kirish (assertion)', () => {
  it('to\'g\'ri imzo va hisob oshishi', async () => {
    const v = await regVektor(); const reg = await regTekshir(v.inp, K);
    if (!reg.ok) throw new Error('reg');
    const r = await kirishTekshir(await kirishVektor(v.kp, { counter: 5 }), { ochiq_kalit: reg.ochiq_kalit, alg: reg.alg, hisob: 0 }, K);
    expect(r).toEqual({ ok: true, hisob: 5 });
  });
  it('rad etiladigan holatlar', async () => {
    const v = await regVektor(); const reg = await regTekshir(v.inp, K);
    if (!reg.ok) throw new Error('reg');
    const kalit = { ochiq_kalit: reg.ochiq_kalit, alg: reg.alg, hisob: 5 };
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, buzuq: true }), kalit, K)).toMatchObject({ code: 'IMZO' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, challenge: 'X' }), kalit, K)).toMatchObject({ code: 'CHALLENGE' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, origin: 'https://evil.example' }), kalit, K)).toMatchObject({ code: 'ORIGIN' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, rpId: 'evil.example' }), kalit, K)).toMatchObject({ code: 'RP_ID' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, fl: flags.UP }), kalit, K)).toMatchObject({ code: 'UV' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, fl: flags.UV }), kalit, K)).toMatchObject({ code: 'UP' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 6, type: 'webauthn.create' }), kalit, K)).toMatchObject({ code: 'CLIENT_DATA' });
    // klon: hisob orqaga ketdi yoki o'zgarmadi
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 5 }), kalit, K)).toMatchObject({ code: 'KLON' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 2 }), kalit, K)).toMatchObject({ code: 'KLON' });
  });
  it('boshqa kalit imzosi rad; hisoblagichsiz qurilma (0/0) ruxsat', async () => {
    const v = await regVektor(); const reg = await regTekshir(v.inp, K);
    if (!reg.ok) throw new Error('reg');
    const boshqa = await ec();
    expect(await kirishTekshir(await kirishVektor(boshqa.kp, { counter: 1 }), { ochiq_kalit: reg.ochiq_kalit, alg: -7, hisob: 0 }, K)).toMatchObject({ code: 'IMZO' });
    expect(await kirishTekshir(await kirishVektor(v.kp, { counter: 0 }), { ochiq_kalit: reg.ochiq_kalit, alg: -7, hisob: 0 }, K)).toEqual({ ok: true, hisob: 0 });
  });
});

describe('WebAuthn RS256 (Windows Hello TPM)', () => {
  it('ro\'yxat + kirish', async () => {
    const kp = await gen({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' });
    const jwk = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as JsonWebKey;
    const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const cose = cMap([[cInt(1), cInt(3)], [cInt(3), cInt(-257)], [cInt(-1), cBytes(b64(jwk.n!))], [cInt(-2), cBytes(b64(jwk.e!))]]);
    const id = new Uint8Array(20).fill(9);
    const ad = await authData({ flags: flags.UP | flags.UV | flags.AT, counter: 0, att: { id, cose } });
    const ao = new Uint8Array(cMap([[cText('fmt'), cText('none')], [cText('attStmt'), cMap([])], [cText('authData'), cBytes(ad)]]));
    const reg = await regTekshir({ clientDataJSON: base64url(clientData('webauthn.create', K.challenge)), attestationObject: base64url(ao) }, K);
    expect(reg).toMatchObject({ ok: true, alg: -257 });
    if (!reg.ok) return;
    const cd = clientData('webauthn.get', K.challenge); const ad2 = await authData({ flags: flags.UP | flags.UV, counter: 0 });
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new Uint8Array([...ad2, ...(await sha256(cd))])));
    const inp = { clientDataJSON: base64url(cd), authenticatorData: base64url(ad2), signature: base64url(sig) };
    expect(await kirishTekshir(inp, { ochiq_kalit: reg.ochiq_kalit, alg: -257, hisob: 0 }, K)).toEqual({ ok: true, hisob: 0 });
    sig[5] ^= 1;
    expect(await kirishTekshir({ ...inp, signature: base64url(sig) }, { ochiq_kalit: reg.ochiq_kalit, alg: -257, hisob: 0 }, K)).toMatchObject({ code: 'IMZO' });
  }, 30_000);
});

describe('rpId va origin', () => {
  it('standart: so\'rov host\'i; env bilan kengaytirish', () => {
    expect(rpVaOrigin('https://qur.uz/api/qulf', {})).toEqual({ rpId: 'qur.uz', origins: ['https://qur.uz'] });
    expect(rpVaOrigin('https://x.pages.dev/api/qulf', { QULF_RP_ID: 'qur.uz', QULF_ORIGINS: 'https://qur.uz, https://www.qur.uz' }))
      .toEqual({ rpId: 'qur.uz', origins: ['https://x.pages.dev', 'https://qur.uz', 'https://www.qur.uz'] });
  });
});
