import { describe, expect, it } from 'vitest';
import { base64url } from './desktop-device';
import {
  chaqiriqTekshir, chaqiriqYarat, derDanRaw, ecImzoTekshir, ecSpkiImport, kredensialIdDan, pinHolat, pinTekshir, pinXesh, qabulUsullar, qurilmaXabar,
  tasdiqCookie, tasdiqOl, tasdiqTekshir, tasdiqYarat, yangiKirishmi, zaifPin, PIN_ITER, TASDIQ_MS, type QulfQator,
} from './qulf';

const gen = (alg: object) => crypto.subtle.generateKey(alg as never, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const KALIT = 'test-kalit-0123456789abcdef-test';

describe('PIN xeshi', () => {
  it('to\'g\'ri PIN o\'tadi, noto\'g\'ri o\'tmaydi, format: pbkdf2-sha256$100000$tuz$xesh', async () => {
    const h = await pinXesh('4827', 7, KALIT);
    expect(h.startsWith(`pbkdf2-sha256$${PIN_ITER}$`)).toBe(true);
    expect(h).not.toContain('4827');
    expect(await pinTekshir('4827', 7, KALIT, h)).toBe(true);
    expect(await pinTekshir('4828', 7, KALIT, h)).toBe(false);
  });
  it('xesh foydalanuvchi va pepperga bog\'langan; tuz tasodifiy', async () => {
    const tuz = new Uint8Array(16).fill(3);
    const h = await pinXesh('4827', 7, KALIT, tuz);
    expect(await pinTekshir('4827', 8, KALIT, h)).toBe(false);
    expect(await pinTekshir('4827', 7, KALIT + 'x', h)).toBe(false);
    expect(await pinXesh('4827', 7, KALIT)).not.toBe(await pinXesh('4827', 7, KALIT));
  });
  it('buzuq/bo\'sh xesh va format xatosi rad', async () => {
    expect(await pinTekshir('4827', 7, KALIT, null)).toBe(false);
    expect(await pinTekshir('4827', 7, KALIT, 'x$y')).toBe(false);
    expect(await pinTekshir('abcd', 7, KALIT, await pinXesh('4827', 7, KALIT))).toBe(false);
    expect(await pinTekshir('4827', 7, KALIT, `pbkdf2-sha256$999999999$AAAA$AAAA`)).toBe(false);
  });
  it('oson PIN rad etiladi', () => {
    for (const p of ['0000', '1111', '1234', '4321', '123456', '121212', '12', '12345678', 'abcd']) expect(zaifPin(p), p).toBe(true);
    for (const p of ['4827', '9150', '736194', '1357']) expect(zaifPin(p), p).toBe(false);
  });
});

describe('blok holati', () => {
  const q = (o: Partial<QulfQator> = {}): QulfQator => ({ foydalanuvchi_id: 1, pin_hash: 'h', xato_soni: 0, jami_xato: 0, bloklangan_gacha: null, qayta_kirish_vaqti: null, bosh_vaqt_daq: 10, ...o });
  const t0 = Date.parse('2026-11-15T10:00:00Z');
  it('PIN yo\'q', () => { expect(pinHolat(null, 0, t0)).toEqual({ ok: false, code: 'PIN_YOQ' }); expect(pinHolat(q({ pin_hash: null }), 0, t0).ok).toBe(false); });
  it('15 daqiqa blok va undan keyin ochiladi', () => {
    const b = new Date(t0 + 15 * 60_000).toISOString();
    const h = pinHolat(q({ bloklangan_gacha: b }), t0 - 1000, t0);
    expect(h).toMatchObject({ ok: false, code: 'BLOKLANGAN', qolgan_soniya: 900 });
    expect(pinHolat(q({ bloklangan_gacha: b }), t0 - 1000, t0 + 15 * 60_000 + 1).ok).toBe(true);
  });
  it('10 xatodan keyin faqat yangi kirish sessiyasi PIN\'ni ochadi', () => {
    const qk = new Date(t0).toISOString();
    expect(pinHolat(q({ qayta_kirish_vaqti: qk }), t0 - 5000, t0 + 1000)).toEqual({ ok: false, code: 'QAYTA_KIRISH_KERAK' });
    expect(pinHolat(q({ qayta_kirish_vaqti: qk }), t0 + 500, t0 + 1000).ok).toBe(true);
  });
  it('yangi kirish = 10 daqiqa ichida', () => {
    expect(yangiKirishmi(t0, t0 + 9 * 60_000)).toBe(true);
    expect(yangiKirishmi(t0, t0 + 11 * 60_000)).toBe(false);
  });
});

describe('tasdiq tokeni', () => {
  const t0 = 1_800_000_000_000;
  it('yaroqli token: foydalanuvchi + sessiya bog\'lanishi + 5 daqiqa', async () => {
    const t = await tasdiqYarat({ u: 5, j: 'jti-1', m: 'pin' }, KALIT, t0);
    expect((await tasdiqTekshir(t, KALIT, { u: 5, j: 'jti-1' }, t0 + 1000))?.m).toBe('pin');
    expect(await tasdiqTekshir(t, KALIT, { u: 6, j: 'jti-1' }, t0 + 1000)).toBeNull();
    expect(await tasdiqTekshir(t, KALIT, { u: 5, j: 'jti-2' }, t0 + 1000)).toBeNull();
    expect(await tasdiqTekshir(t, KALIT, { u: 5, j: 'jti-1' }, t0 + TASDIQ_MS + 1)).toBeNull();
    expect(await tasdiqTekshir(t, KALIT + 'x', { u: 5, j: 'jti-1' }, t0)).toBeNull();
  });
  it('o\'zgartirilgan token rad', async () => {
    const t = await tasdiqYarat({ u: 5, j: 'j', m: 'pin' }, KALIT, t0);
    const [b, s] = t.split('.');
    const soxta = base64url(new TextEncoder().encode(JSON.stringify({ u: 5, j: 'j', m: 'passkey', e: t0 + 99_999_999 })));
    expect(await tasdiqTekshir(`${soxta}.${s}`, KALIT, { u: 5, j: 'j' }, t0)).toBeNull();
    expect(await tasdiqTekshir(`${b}.AAAA`, KALIT, { u: 5, j: 'j' }, t0)).toBeNull();
    expect(await tasdiqTekshir('garbage', KALIT, { u: 5, j: 'j' }, t0)).toBeNull();
    expect(await tasdiqTekshir(null, KALIT, { u: 5, j: 'j' }, t0)).toBeNull();
  });
  it('cookie/sarlavhadan o\'qish', () => {
    expect(tasdiqCookie('abc')).toContain('HttpOnly');
    expect(tasdiqOl(new Request('https://x', { headers: { Cookie: 'sess=1; qulf_tasdiq=TOK; a=b' } }))).toBe('TOK');
    expect(tasdiqOl(new Request('https://x', { headers: { 'X-Tasdiq': 'HDR', Cookie: 'qulf_tasdiq=TOK' } }))).toBe('HDR');
    expect(tasdiqOl(new Request('https://x/api/sb-yoz?_tasdiq=QRY'))).toBe('QRY');
    expect(tasdiqOl(new Request('https://x'))).toBeNull();
  });
});

describe('challenge', () => {
  const t0 = 1_800_000_000_000;
  it('maqsad va foydalanuvchiga bog\'langan, 2 daqiqa', async () => {
    const c = await chaqiriqYarat(9, 'kirish', KALIT, t0);
    expect((await chaqiriqTekshir(c.token, KALIT, 9, 'kirish', t0 + 1000))?.n).toBe(c.n);
    expect(await chaqiriqTekshir(c.token, KALIT, 9, 'reg', t0)).toBeNull();
    expect(await chaqiriqTekshir(c.token, KALIT, 10, 'kirish', t0)).toBeNull();
    expect(await chaqiriqTekshir(c.token, KALIT, 9, 'kirish', t0 + 121_000)).toBeNull();
    expect(await chaqiriqTekshir(123, KALIT, 9, 'kirish', t0)).toBeNull();
  });
});

describe('siyosat', () => {
  it('qabul qilinadigan usullar', () => {
    expect(qabulUsullar('off', { pin: true, kalit: true })).toEqual([]);
    expect(qabulUsullar('pin', { pin: true, kalit: true })).toEqual(['pin']);
    expect(qabulUsullar('pin', { pin: false, kalit: true })).toEqual([]);
    expect(qabulUsullar('biometric_or_pin', { pin: true, kalit: true })).toEqual(['pin', 'passkey', 'qurilma']);
    expect(qabulUsullar('biometric_or_pin', { pin: false, kalit: true })).toEqual([]); // PINsiz qulf yo'q
  });
});

describe('qurilma kaliti (ES256, DER)', () => {
  /** WebCrypto raw r||s -> DER (Android Keystore SHA256withECDSA shaklida). */
  const rawDan = (raw: Uint8Array): Uint8Array => {
    const enc = (v: Uint8Array) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; let x = v.slice(i); if (x[0] & 0x80) { const y = new Uint8Array(x.length + 1); y.set(x, 1); x = y; } return [0x02, x.length, ...x]; };
    const body = [...enc(raw.slice(0, 32)), ...enc(raw.slice(32))];
    return new Uint8Array([0x30, body.length, ...body]);
  };
  it('imzo tekshiruvi: to\'g\'ri, o\'zgargan xabar, boshqa kalit, buzuq DER', async () => {
    const kp = await gen({ name: 'ECDSA', namedCurve: 'P-256' });
    const spki = new Uint8Array((await crypto.subtle.exportKey('spki', kp.publicKey)) as ArrayBuffer);
    const kid = await kredensialIdDan(spki);
    const msg = qurilmaXabar('kirish', 'NONCE', kid);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, msg));
    const der = rawDan(raw);
    const key = (await ecSpkiImport(spki))!;
    expect(await ecImzoTekshir(key, msg, der)).toBe(true);
    expect(await ecImzoTekshir(key, qurilmaXabar('kirish', 'NONCE2', kid), der)).toBe(false);
    expect(await ecImzoTekshir(key, qurilmaXabar('reg', 'NONCE', kid), der)).toBe(false);
    const kp2 = await gen({ name: 'ECDSA', namedCurve: 'P-256' });
    expect(await ecImzoTekshir((await ecSpkiImport(new Uint8Array((await crypto.subtle.exportKey('spki', kp2.publicKey)) as ArrayBuffer)))!, msg, der)).toBe(false);
    expect(await ecImzoTekshir(key, msg, der.slice(0, 30))).toBe(false);
    expect(derDanRaw(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(derDanRaw(der)).toEqual(raw);
  });
  it('SPKI emas -> import null', async () => { expect(await ecSpkiImport(new Uint8Array(30))).toBeNull(); });
});
