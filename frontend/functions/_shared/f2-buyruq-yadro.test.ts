// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { previewQur, qolTahrirBelgi, rejaQur, rejaXeshi, tokenTekshir, tokenYarat, uuidHosila, uchlik, type Kontekst, type QatorMalumot, type Reja } from './f2-buyruq-yadro';

const SIR = 'k'.repeat(32);
const q = (id: number, o: Partial<QatorMalumot> = {}): QatorMalumot => ({ id, ota_id: null, tur: 'mat', kod: `K${id}`, nom: `Qator ${id}`, birlik: 'm3', versiya: 4, versiya_holat: 'faol', qoshimcha: false, zamena: false, replaces_line_id: null, ...o });
const kont = (qs: QatorMalumot[], o: Partial<Kontekst> = {}): Kontekst => ({ aid: 7, kid: 1, bugun: '2026-11-18', qatorlar: new Map(qs.map((x) => [x.id, x])), ...o });
const paket = (qqs: number, ust: number, siz: number) => ({ qqs_bilan: qqs, ustamali: ust, ustamasiz: siz, qqs: qqs - ust, narxsiz_soni: 0, qator_soni: 3 });

describe('tasdiq tokeni', () => {
  const yuk = { a: 7, k: 1, o: 5, op: 'op-1', rh: 'xesh', v: 'fakt_yoz' as const, args: { obyekt_id: 5 } };
  it('aylanma: imzo to\'g\'ri, muddat o\'tsa «muddati», soxtalashtirilsa null', async () => {
    const t = await tokenYarat(SIR, yuk, 60_000, 1000);
    expect(await tokenTekshir(SIR, t, 2000)).toMatchObject({ a: 7, k: 1, o: 5, op: 'op-1', rh: 'xesh', v: 'fakt_yoz' });
    expect(await tokenTekshir(SIR, t, 100_000)).toBe('muddati');
    expect(await tokenTekshir('boshqa'.repeat(8), t, 2000)).toBeNull();
    const [tana, imzo] = t.split('.');
    expect(await tokenTekshir(SIR, tana.slice(0, -2) + 'AA.' + imzo, 2000)).toBeNull();
    expect(await tokenTekshir(SIR, 'axlat', 2000)).toBeNull();
  });
  it('ombor tokeni (boshqa HMAC kaliti) bu yerda yaroqsiz', async () => {
    // ombor-buyruq tokeni 'ombor-buyruq:v1:' kalit bilan imzolanadi — bizniki 'f2-buyruq:v1:'
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode('ombor-buyruq:v1:' + SIR), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const tana = btoa(JSON.stringify({ ...yuk, e: Date.now() + 1e6 })).replace(/=+$/, '');
    const imzo = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(tana)))) ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await tokenTekshir(SIR, `${tana}.${imzo}`)).toBeNull();
  });
  it('uuidHosila deterministik va kalitga bog\'liq (qayta bosish takror yozmaydi)', async () => {
    const a = await uuidHosila('op', 'fakt'), b = await uuidHosila('op', 'fakt'), c = await uuidHosila('op', 'bekor:1');
    expect(a).toBe(b); expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('rejaQur — nomli RPC va yuk shakli', () => {
  it('fakt_yoz: bitta t2_fakt_yoz_v2, sana sukut bugun, faol bo\'lmagan qator rad', () => {
    const r = rejaQur('fakt_yoz', { obyekt_id: 5, sana: null, qatorlar: [{ qator_id: 1, hajm: 2 }], izoh: null, raqam: null }, kont([q(1)])) as Reja;
    expect(r.chaqiruvlar).toHaveLength(1);
    expect(r.chaqiruvlar[0]).toMatchObject({ rpc: 't2_fakt_yoz_v2', amal: 'fakt_yoz_v2', aktorBor: true, yuk: { p_obyekt_id: 5, p_sana: '2026-11-18' } });
    expect(r.olchov).toBe('fakt'); expect(r.qator_idlar).toEqual([1]);
    expect(JSON.stringify(r)).not.toMatch(/"p_actor_id"/); // aktor yukda emas: endpoint sessiyadan qo'yadi
    expect(rejaQur('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 1, hajm: 2 }] }, kont([q(1, { versiya_holat: 'almashtirilgan' })]))).toMatchObject({ xato: 'QATOR_FAOL_EMAS' });
    expect(rejaQur('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 2, hajm: 2 }] }, kont([q(1)]))).toMatchObject({ xato: 'QATOR_TOPILMADI' });
  });
  it('narx_tuzat: faqat rs/mat/ob, versiya bilan t2_qator_tahrir; asl qator ogohlantirishi', () => {
    const r = rejaQur('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1, narx: 10 }], sabab: 'tuzatish' }, kont([q(1)])) as Reja;
    expect(r.chaqiruvlar[0]).toMatchObject({ rpc: 't2_qator_tahrir', aktorBor: false, opKalit: null, yuk: { p_qator_id: 1, p_maydon: 'narx', p_qiymat: '10', p_kutilgan_versiya: 4 } });
    expect(r.ogohlantirish.join(' ')).toMatch(/ASL smeta/);
    expect(rejaQur('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1, narx: 10 }], sabab: 'tuzatish' }, kont([q(1, { tur: 'bl' })]))).toMatchObject({ xato: 'FAQAT_RESURS' });
    const nol = rejaQur('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1, narx: 0 }], sabab: 'tuzatish' }, kont([q(1, { qoshimcha: true })])) as Reja;
    expect(nol.chaqiruvlar[0].yuk.p_qiymat).toBe('0'); // narx 0 = 0 (NULL emas)
  });
  it('f2_qoralama_tahrir: tasdiqlangan F2 muzlagan; qoralamada hajm o\'zgarishi, olib tashlash, storno tegilmaydi', () => {
    const akt = { id: 3, obyekt_id: 5, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 9, raqam: '12' };
    const aq = (id: number, extra = {}) => ({ qator_id: id, hajm: 2, certified_quantity: 2, certified_unit_price: 100, certified_amount: 200, provenance_status: null, certified_source_hash: null, raw_snapshot: {}, izoh: null, ...extra });
    const a = { akt_id: 3, ozgartir: [{ qator_id: 1, hajm: 5 }], olib_tashla: [2], kutilgan_versiya: null };
    const r = rejaQur('f2_qoralama_tahrir', a, kont([], { akt, aktQatorlar: [aq(1), aq(2), aq(3)] })) as Reja;
    const yuk = r.chaqiruvlar[0].yuk.p_qatorlar as Array<Record<string, unknown>>;
    expect(r.chaqiruvlar[0]).toMatchObject({ rpc: 't2_f2_qoralama_yangila_v1', yuk: { p_akt_id: 3, p_kutilgan_versiya: 9, p_kompaniya_id: 1 } });
    expect(yuk.map((x) => x.qator_id)).toEqual([1, 3]);
    expect(yuk[0]).toMatchObject({ certified_quantity: 5, certified_unit_price: 100, certified_amount: 500 });
    expect(rejaQur('f2_qoralama_tahrir', a, kont([], { akt: { ...akt, holat: 'tasdiqlangan' }, aktQatorlar: [aq(1)] }))).toMatchObject({ xato: 'AKT_QORALAMA_EMAS' });
    expect(rejaQur('f2_qoralama_tahrir', a, kont([], { akt: { ...akt, lifecycle_status: 'submitted' }, aktQatorlar: [aq(1)] }))).toMatchObject({ xato: 'AKT_QORALAMA_EMAS' });
    const storno = aq(2, { raw_snapshot: { source: 'storno' } });
    expect(rejaQur('f2_qoralama_tahrir', { ...a, olib_tashla: [2] }, kont([], { akt, aktQatorlar: [aq(1), storno] }))).toMatchObject({ xato: 'TAHRIR_RAD' });
  });
  it('zamena_qosh: rejim va majburiy maydonlar; ota versiyasi CAS uchun olinadi', () => {
    const ish = { nom: 'Yangi ish', birlik: 'm2', hajm: 3 };
    const qs = [q(9, { tur: 'bl', ota_id: 8 }), q(8, { tur: 'rz', versiya: 11 })];
    const r = rejaQur('zamena_qosh', { obyekt_id: 5, almashtirilayotgan_qator_id: 9, rejim: null, ish, resurslar: [], fakt_hajm: null, sana: null, sabab: 'sabab bor' }, kont(qs)) as Reja;
    expect(r.chaqiruvlar[0]).toMatchObject({ rpc: 't2_ish_abc_saqla_v1', yuk: { p_command: 'replacement', p_ota_qator_id: 8, p_kutilgan_versiya: 11, p_almashtirilayotgan_qator_id: 9 } });
    expect(rejaQur('zamena_qosh', { obyekt_id: 5, almashtirilayotgan_qator_id: 9, rejim: 'ish', ish: null, resurslar: [], sabab: 'sabab bor' }, kont(qs))).toMatchObject({ xato: 'REJIM_RAD' });
    const rs = rejaQur('zamena_qosh', { obyekt_id: 5, almashtirilayotgan_qator_id: 1, rejim: null, ish: null, resurslar: [{ nom: 'a', birlik: 'kg', norma: 1 }], sabab: 'sabab bor' }, kont([q(1)])) as Reja;
    expect(rs.chaqiruvlar[0].yuk.p_command).toBe('resurs_zamena');
  });
  it('bajarilmadi: belgila — bitta RPC; bekor — har id uchun alohida kalit', () => {
    const b = rejaQur('bajarilmadi', { obyekt_id: 5, amal: 'belgila', qatorlar: [{ qator_id: 1 }], sabab_kod: 'texnik_sabab' }, kont([q(1)])) as Reja;
    expect(b.chaqiruvlar[0]).toMatchObject({ rpc: 't2_bajarilmadi_belgila_v1', opKalit: 'belgila' });
    const k = rejaQur('bajarilmadi', { obyekt_id: 5, amal: 'bekor', bekor_idlar: [4, 5] }, kont([])) as Reja;
    expect(k.chaqiruvlar.map((c) => c.opKalit)).toEqual(['bekor:4', 'bekor:5']);
  });
  it('reja xeshi o\'zgarishga sezgir', async () => {
    const a = rejaQur('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 1, hajm: 2 }] }, kont([q(1)])) as Reja;
    const b = rejaQur('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 1, hajm: 3 }] }, kont([q(1)])) as Reja;
    expect(await rejaXeshi(a)).toBe(await rejaXeshi(a)); expect(await rejaXeshi(a)).not.toBe(await rejaXeshi(b));
  });
});

describe('previewQur — oldin→keyin va jami', () => {
  const reja = rejaQur('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 1, hajm: 5 }] }, kont([q(1)])) as Reja;
  const meta = (id: number) => ({ kod: `K${id}`, nom: `Qator ${id}`, birlik: 'm3' });
  it('qator farqi, jami uchligi (QQS bilan, ustamali, ustamasiz) va farq; summa qayta hisoblanmaydi', () => {
    const p = previewQur(reja, {
      oldin: { paket: paket(1120, 1000, 800), qatorlar: [{ qator_id: 1, fakt_hajm: 2, fakt_summa: 100 }] },
      keyin: { paket: paket(1344, 1200, 960), qatorlar: [{ qator_id: 1, fakt_hajm: 7, fakt_summa: 350 }] },
      natijalar: [{ rpc: 't2_fakt_yoz_v2', natija: { ok: true } }],
    }, meta);
    expect(p.qatorlar).toEqual([{ qator_id: 1, kod: 'K1', nom: 'Qator 1', birlik: 'm3', ozgarish: [{ maydon: 'fakt_hajm', oldin: 2, keyin: 7 }, { maydon: 'fakt_summa', oldin: 100, keyin: 350 }] }]);
    expect(p.jami.oldin).toMatchObject({ qqs_bilan: 1120, ustamali: 1000, ustamasiz: 800 });
    expect(p.jami.keyin).toMatchObject({ qqs_bilan: 1344, ustamali: 1200, ustamasiz: 960 });
    expect(p.jami.farq).toMatchObject({ qqs_bilan: 224, ustamali: 200, ustamasiz: 160 });
    expect(p.natijalar).toEqual([{ rpc: 't2_fakt_yoz_v2', ok: true }]);
  });
  it('paket yo\'q bo\'lsa jami null (0 emas); server {ok:false} natijasi ok=false', () => {
    const p = previewQur(reja, { oldin: { qatorlar: [] }, keyin: { qatorlar: [] }, natijalar: [{ rpc: 't2_fakt_yoz_v2', natija: { ok: false, code: 'FAKT_RAD', xabar: 'Rad' } }] }, meta);
    expect(p.jami).toEqual({ oldin: null, keyin: null, farq: null });
    expect(p.natijalar[0]).toEqual({ rpc: 't2_fakt_yoz_v2', ok: false, xabar: 'Rad' });
    expect(uchlik(null)).toBeNull();
  });
  it('F2 qoralama: olib tashlangan va o\'zgargan hujjat qatorlari', () => {
    const r = rejaQur('f2_qoralama_tahrir', { akt_id: 3, ozgartir: [{ qator_id: 1, hajm: 5 }], olib_tashla: [2], kutilgan_versiya: null }, kont([], {
      akt: { id: 3, obyekt_id: 5, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 1, raqam: null },
      aktQatorlar: [{ qator_id: 1, hajm: 2, certified_quantity: 2, certified_unit_price: 10, certified_amount: 20, provenance_status: null, certified_source_hash: null, raw_snapshot: {}, izoh: null },
        { qator_id: 2, hajm: 1, certified_quantity: 1, certified_unit_price: 10, certified_amount: 10, provenance_status: null, certified_source_hash: null, raw_snapshot: {}, izoh: null }] })) as Reja;
    const p = previewQur(r, {
      oldin: { akt_qatorlar: [{ qator_id: 1, certified_quantity: 2, certified_amount: 20 }, { qator_id: 2, certified_quantity: 1, certified_amount: 10 }] },
      keyin: { akt_qatorlar: [{ qator_id: 1, certified_quantity: 5, certified_amount: 50 }] }, natijalar: [{ rpc: 't2_f2_qoralama_yangila_v1', natija: { ok: true } }] }, meta);
    expect(p.qatorlar.find((x) => x.qator_id === 2)).toMatchObject({ olib_tashlandi: true });
    expect(p.qatorlar.find((x) => x.qator_id === 1)!.ozgarish).toEqual([{ maydon: 'certified_quantity', oldin: 2, keyin: 5 }, { maydon: 'certified_amount', oldin: 20, keyin: 50 }]);
  });
  it('chaqiruvlar soni mos kelmasa — ok=false (tasdiq tokeni berilmaydi)', () => {
    expect(previewQur(reja, { natijalar: [] }, meta).natijalar.some((n) => !n.ok)).toBe(true);
  });
});

describe('qolTahrirBelgi (qo‘lda tahrir himoyasi)', () => {
  it('hajm/narx o‘zgargan — belgi; o‘zgarmagan — null; mavjud belgi saqlanadi', () => {
    expect(qolTahrirBelgi(undefined, true, false)).toEqual({ hajm: true });
    expect(qolTahrirBelgi({ norma: 0.5 }, false, true)).toEqual({ norma: 0.5, narx: true });
    expect(qolTahrirBelgi({ hajm: true }, false, false)).toEqual({ hajm: true });
    expect(qolTahrirBelgi(undefined, false, false)).toBeNull();
  });
});