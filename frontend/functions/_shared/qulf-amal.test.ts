import { describe, expect, it } from 'vitest';
import { base64url, unbase64url } from './desktop-device';
import { qulfAmal, type Kontekst } from './qulf-amal';
import { kredensialIdDan, qurilmaXabar, tasdiqTekshir } from './qulf';
import { xotiraStore } from './qulf-xotira';

const gen = (alg: object) => crypto.subtle.generateKey(alg as never, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const KALIT = 'test-kalit-0123456789abcdef-test';
const T0 = 1_800_000_000_000;

function muhit(o: Partial<Kontekst> = {}) {
  let hozir = T0;
  const store = xotiraStore(() => hozir);
  const base = (): Kontekst => ({ store, uid: 11, jti: 'jti-web', iat: T0 - 3600_000, kanal: 'web', kalit: KALIT, hozir, rpId: 'qur.uz', origins: ['https://qur.uz'], tasdiq: null, siyosatRuxsat: () => false, kompaniyalar: [3], ...o });
  return { store, k: (x: Partial<Kontekst> = {}) => ({ ...base(), hozir, ...x }), vaqt: (ms: number) => { hozir += ms; } };
}
const pinQoy = async (m: ReturnType<typeof muhit>, pin = '4827') => { const r = await qulfAmal(m.k({ iat: T0 - 60_000 }), 'pin_saqla', { yangi: pin }); expect(r.status).toBe(200); };

describe('PIN o\'rnatish', () => {
  it('format va oson PIN rad; yaxshi PIN saqlanadi, xesh javobda yo\'q', async () => {
    const m = muhit();
    expect((await qulfAmal(m.k(), 'pin_saqla', { yangi: '12' })).body.code).toBe('PIN_FORMAT');
    expect((await qulfAmal(m.k(), 'pin_saqla', { yangi: '1234' })).body.code).toBe('PIN_ZAIF');
    const r = await qulfAmal(m.k(), 'pin_saqla', { yangi: '4827' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('pbkdf2');
    expect(m.store.qator.get(11)!.pin_hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(JSON.stringify(m.store.qator.get(11))).not.toContain('4827');
  });
  it('PIN o\'zgartirish: eski PIN kerak; eskisiz faqat yangi kirishdan keyin', async () => {
    const m = muhit(); await pinQoy(m);
    expect((await qulfAmal(m.k({ iat: T0 - 3600_000 }), 'pin_saqla', { yangi: '9150' })).body.code).toBe('ESKI_PIN_KERAK');
    expect((await qulfAmal(m.k({ iat: T0 - 3600_000 }), 'pin_saqla', { yangi: '9150', eski: '0000' })).body.code).toBe('PIN_NOTOGRI');
    expect((await qulfAmal(m.k({ iat: T0 - 3600_000 }), 'pin_saqla', { yangi: '9150', eski: '4827' })).status).toBe(200);
    expect((await qulfAmal(m.k({ iat: T0 - 60_000 }), 'pin_saqla', { yangi: '7361' })).status).toBe(200); // yangi sessiya
  });
});

describe('PIN blok qoidasi', () => {
  it('5 xato -> 15 daqiqa blok (to\'g\'ri PIN ham o\'tmaydi) -> keyin ochiladi', async () => {
    const m = muhit(); await pinQoy(m);
    for (let i = 0; i < 4; i++) expect((await qulfAmal(m.k(), 'pin_tekshir', { pin: '0001' })).status).toBe(401);
    expect((await qulfAmal(m.k(), 'pin_tekshir', { pin: '0001' })).status).toBe(429);
    const blok = await qulfAmal(m.k(), 'pin_tekshir', { pin: '4827' });
    expect(blok.status).toBe(429); expect(blok.body.code).toBe('BLOKLANGAN');
    m.vaqt(15 * 60_000 + 1000);
    const ok = await qulfAmal(m.k(), 'pin_tekshir', { pin: '4827' });
    expect(ok.status).toBe(200); expect(ok.body.tasdiq_token).toBeTruthy();
  });
  it('muvaffaqiyat hisoblagichni nolga qaytaradi', async () => {
    const m = muhit(); await pinQoy(m);
    for (let i = 0; i < 4; i++) await qulfAmal(m.k(), 'pin_tekshir', { pin: '0001' });
    expect((await qulfAmal(m.k(), 'pin_tekshir', { pin: '4827' })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await qulfAmal(m.k(), 'pin_tekshir', { pin: '0001' })).status).toBe(401);
  });
  it('jami 10 xato -> QAYTA_KIRISH_KERAK; yangi sessiya bilan ochiladi', async () => {
    const m = muhit(); await pinQoy(m);
    let oxirgi;
    for (let i = 0; i < 10; i++) { oxirgi = await qulfAmal(m.k(), 'pin_tekshir', { pin: '0001' }); if (i === 4) m.vaqt(16 * 60_000); }
    expect(oxirgi!.status).toBe(423); expect(oxirgi!.body.code).toBe('QAYTA_KIRISH_KERAK');
    expect((await qulfAmal(m.k(), 'pin_tekshir', { pin: '4827' })).body.code).toBe('QAYTA_KIRISH_KERAK'); // eski sessiya
    m.vaqt(1000);
    const yangi = await qulfAmal(m.k({ iat: T0 + 16 * 60_000 + 500 }), 'pin_tekshir', { pin: '4827' });
    expect(yangi.status).toBe(200);
  });
  it('PIN javobida/xatoda PIN va xesh qaytmaydi', async () => {
    const m = muhit(); await pinQoy(m);
    const r = await qulfAmal(m.k(), 'pin_tekshir', { pin: '0001' });
    expect(JSON.stringify(r)).not.toMatch(/0001|4827|pbkdf2/);
  });
});

describe('tasdiq berish va sozlama himoyasi', () => {
  it('PIN tasdiq tokeni sessiyaga bog\'langan, mobil kanalda \'m\'', async () => {
    const m = muhit(); await pinQoy(m);
    const w = await qulfAmal(m.k(), 'pin_tekshir', { pin: '4827' });
    expect(await tasdiqTekshir(w.tasdiq, KALIT, { u: 11, j: 'jti-web' }, T0)).toMatchObject({ m: 'pin' });
    expect(await tasdiqTekshir(w.tasdiq, KALIT, { u: 11, j: 'boshqa' }, T0)).toBeNull();
    const mob = await qulfAmal(m.k({ kanal: 'mobil' }), 'pin_tekshir', { pin: '4827' });
    expect(await tasdiqTekshir(mob.tasdiq, KALIT, { u: 11, j: 'm' }, T0)).toMatchObject({ m: 'pin' });
  });
  it('qurilmani o\'chirish / PIN\'siz tasdiq bo\'lmasa STEP_UP_KERAK', async () => {
    const m = muhit(); await pinQoy(m);
    m.store.kl.push({ id: 5, foydalanuvchi_id: 11, tur: 'android', kredensial_id: 'abcdefgh', ochiq_kalit: 'x'.repeat(50), alg: -7, hisob: 0, transports: [], qurilma_nomi: null, yaratildi: '', oxirgi_ishlatildi: null });
    const r = await qulfAmal(m.k(), 'kalit_ochir', { id: 5 });
    expect(r.status).toBe(403); expect(r.body.code).toBe('STEP_UP_KERAK');
    const t = (await qulfAmal(m.k(), 'pin_tekshir', { pin: '4827' })).tasdiq!;
    expect((await qulfAmal(m.k({ tasdiq: t }), 'kalit_ochir', { id: 5 })).status).toBe(200);
  });
  it('vaqt 1..60', async () => {
    const m = muhit();
    expect((await qulfAmal(m.k(), 'vaqt_saqla', { daq: 0 })).status).toBe(400);
    expect((await qulfAmal(m.k(), 'vaqt_saqla', { daq: 61 })).status).toBe(400);
    expect((await qulfAmal(m.k(), 'vaqt_saqla', { daq: 15 })).body.bosh_vaqt_daq).toBe(15);
  });
  it('siyosat faqat vakolatli rahbar; noto\'g\'ri rejim rad', async () => {
    const m = muhit();
    expect((await qulfAmal(m.k(), 'siyosat_saqla', { kompaniya_id: 3, rejim: 'off' })).status).toBe(403);
    expect((await qulfAmal(m.k({ siyosatRuxsat: () => true }), 'siyosat_saqla', { kompaniya_id: 3, rejim: 'hech' })).status).toBe(400);
    expect((await qulfAmal(m.k({ siyosatRuxsat: () => true }), 'siyosat_saqla', { kompaniya_id: 3, rejim: 'biometric_or_pin' })).status).toBe(200);
    expect(m.store.siyosat.get(3)).toBe('biometric_or_pin');
  });
});

describe('Android qurilma kaliti protokoli', () => {
  const rawDan = (raw: Uint8Array): Uint8Array => {
    const enc = (v: Uint8Array) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; let x = v.slice(i); if (x[0] & 0x80) { const y = new Uint8Array(x.length + 1); y.set(x, 1); x = y; } return [0x02, x.length, ...x]; };
    const body = [...enc(raw.slice(0, 32)), ...enc(raw.slice(32))];
    return new Uint8Array([0x30, body.length, ...body]);
  };
  async function royxat(m: ReturnType<typeof muhit>) {
    const kp = await gen({ name: 'ECDSA', namedCurve: 'P-256' });
    const spki = new Uint8Array((await crypto.subtle.exportKey('spki', kp.publicKey)) as ArrayBuffer); const kid = await kredensialIdDan(spki);
    const b = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_reg_boshla', {});
    const imzo = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, qurilmaXabar('reg', b.body.challenge as string, kid)));
    const t = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_reg_tugat', { chaqiriq: b.body.chaqiriq, ochiq_kalit: base64url(spki), imzo: base64url(rawDan(imzo)), nom: 'Pixel' });
    return { kp, kid, t };
  }
  it('ro\'yxat -> kirish -> tasdiq; takroriy chaqiriq rad (replay)', async () => {
    const m = muhit();
    const { kp, kid, t } = await royxat(m);
    expect(t.status).toBe(200);
    const b = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_boshla', {});
    expect(b.body.kredensiallar).toEqual([kid]);
    const imzo = base64url(rawDan(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, qurilmaXabar('kirish', b.body.challenge as string, kid)))));
    const yuk = { chaqiriq: b.body.chaqiriq, kredensial_id: kid, imzo };
    const r = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_tugat', yuk);
    expect(r.status).toBe(200); expect(await tasdiqTekshir(r.tasdiq, KALIT, { u: 11, j: 'm' }, T0)).toMatchObject({ m: 'qurilma' });
    expect((await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_tugat', yuk)).body.code).toBe('CHAQIRIQ_ISHLATILGAN');
  });
  it('boshqa kalit imzosi, boshqa foydalanuvchi chaqirig\'i, eskirgan chaqiriq rad', async () => {
    const m = muhit(); const { kid } = await royxat(m);
    const b = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_boshla', {});
    const kp2 = await gen({ name: 'ECDSA', namedCurve: 'P-256' });
    const soxta = base64url(rawDan(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp2.privateKey, qurilmaXabar('kirish', b.body.challenge as string, kid)))));
    expect((await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_tugat', { chaqiriq: b.body.chaqiriq, kredensial_id: kid, imzo: soxta })).body.code).toBe('IMZO');
    const b2 = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_boshla', {});
    expect((await qulfAmal(m.k({ uid: 99, kanal: 'mobil' }), 'qurilma_kirish_tugat', { chaqiriq: b2.body.chaqiriq, kredensial_id: kid, imzo: soxta })).body.code).toBe('CHAQIRIQ_YAROQSIZ');
    m.vaqt(3 * 60_000);
    expect((await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_kirish_tugat', { chaqiriq: b2.body.chaqiriq, kredensial_id: kid, imzo: soxta })).body.code).toBe('CHAQIRIQ_YAROQSIZ');
  });
  it('ro\'yxatda egalik isboti (noto\'g\'ri imzo) rad; kredensial id server hisoblaydi', async () => {
    const m = muhit();
    const kp = await gen({ name: 'ECDSA', namedCurve: 'P-256' });
    const spki = new Uint8Array((await crypto.subtle.exportKey('spki', kp.publicKey)) as ArrayBuffer);
    const b = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_reg_boshla', {});
    const imzo = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, qurilmaXabar('reg', 'BOSHQA-NONCE', await kredensialIdDan(spki))));
    const r = await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_reg_tugat', { chaqiriq: b.body.chaqiriq, ochiq_kalit: base64url(spki), imzo: base64url(rawDan(imzo)) });
    expect(r.status).toBe(401);
    expect(unbase64url(base64url(spki)).length).toBe(spki.length);
  });
  it('PIN o\'rnatilgan bo\'lsa yangi qurilma qo\'shish tasdiq talab qiladi', async () => {
    const m = muhit(); await pinQoy(m);
    expect((await qulfAmal(m.k({ kanal: 'mobil' }), 'qurilma_reg_boshla', {})).body.code).toBe('STEP_UP_KERAK');
  });
});

describe('holat', () => {
  it('PIN holati, usullar, qurilmalar', async () => {
    const m = muhit(); await pinQoy(m);
    const h = await qulfAmal(m.k(), 'holat', {});
    expect(h.body).toMatchObject({ pin_bor: true, bosh_vaqt_daq: 10, rejim: 'pin', talab: true, usullar: ['pin'], pin_holat: 'ok', tasdiq_bor: false });
    expect(JSON.stringify(h.body)).not.toContain('pbkdf2');
  });
  it('noma\'lum amal rad', async () => { expect((await qulfAmal(muhit().k(), 'x', {})).body.code).toBe('AMAL_YOQ'); });
});
