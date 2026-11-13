import { describe, expect, it } from 'vitest';
import { aktJami, gcQolgan, hajmAyir, ikkiMartaXavfi, ishQoldigi, marjaJami, marjaQatori, subBugunHisobi, tolovHolati } from './hisob';
import type { SubAktQisqa, SubIsh } from '../../api/t2-sub';

const ish = (o: Partial<SubIsh> = {}): SubIsh => ({
  id: 1, aloqa_id: 1, gc_kompaniya_id: 2, gc_nom: 'GC', obyekt_id: 3, obyekt_nom: 'Ob', tartib: 1, kod: 'K', nom: 'Ish', birlik: 'm2',
  hajm: 100, narx: 800, qqs_foiz: 12, qabul_hajm: 0, kutilayotgan_hajm: 0, qoralama_hajm: 0, ...o,
});
const akt = (o: Partial<SubAktQisqa> = {}): SubAktQisqa => ({
  id: 1, aloqa_id: 1, obyekt_id: 3, obyekt_nom: 'Ob', oy: '2026-11-01', raqam: null, holat: 'qoralama', taqdim_id: null, taqdim_holat: null, qaror_izoh: null,
  taqdim_vaqti: null, qaror_vaqti: null, sub_nom: 'S', gc_nom: 'G', fakt_akt_id: null, xarajat_id: null, qator_soni: 1, jami_qqs_siz: null, ...o,
});

describe('hajm', () => {
  it('ikkilik kasr xatosiz ayiradi', () => { expect(hajmAyir(0.3, 0.1)).toBe(0.2); });
  it('qoldiq: topshirilgan - qabul - kutilayotgan, manfiy bo‘lmaydi', () => {
    expect(ishQoldigi(ish({ qabul_hajm: 40, kutilayotgan_hajm: 10 }))).toBe(50);
    expect(ishQoldigi(ish({ qabul_hajm: 100, kutilayotgan_hajm: 5 }))).toBe(0);
  });
  it('bir ish = bitta fakt: bosh pudratchi qoldig‘i o‘z fakti va qabul qilingan sub hajmini ayiradi', () => {
    expect(gcQolgan({ hajm: 100, gc_fakt_hajm: 95, qabul_hajm: 0 })).toBe(5);
    expect(gcQolgan({ hajm: 100, gc_fakt_hajm: 0, qabul_hajm: 40 })).toBe(60);
    expect(ikkiMartaXavfi({ gc_fakt_hajm: 0.5 })).toBe(true);
    expect(ikkiMartaXavfi({ gc_fakt_hajm: 0 })).toBe(false);
  });
});

describe('pul (hisob-yadro orqali, noma‘lum = null)', () => {
  it('akt jami: QQS siz va QQS bilan; narxsiz qator bo‘lsa null', () => {
    expect(aktJami([{ hajm: 40, narx: 800 }], 12)).toEqual({ qqsSiz: 32000, qqsBilan: 35840 });
    expect(aktJami([{ hajm: 40, narx: 800 }, { hajm: 1, narx: null }], 12)).toEqual({ qqsSiz: null, qqsBilan: null });
    expect(aktJami([], 12)).toEqual({ qqsSiz: null, qqsBilan: null });
  });
  it('marja: smeta pul - subpudrat narxi; NULL bo‘lsa farq NULL (0 emas)', () => {
    const a = marjaQatori({ id: 1, hajm: 10, smeta_narx: 1000, narx: 800 });
    expect(a).toEqual({ id: 1, smetaSumma: 10000, subSumma: 8000, farq: 2000 });
    const b = marjaQatori({ id: 2, hajm: 10, smeta_narx: 1000, narx: null });
    expect(b).toEqual({ id: 2, smetaSumma: 10000, subSumma: null, farq: null });
    expect(marjaJami([a])).toEqual({ smeta: 10000, sub: 8000, farq: 2000 });
    expect(marjaJami([a, b])).toEqual({ smeta: 20000, sub: null, farq: null });
  });
});

describe('to‘lov holati', () => {
  const asos = { ruxsat: true, shartnoma_qabul_qqs_siz: 1000, qqs_foiz: 12 };
  it('grant yo‘q yoki ma‘lumot yo‘q - holat null', () => {
    expect(tolovHolati({ ...asos, ruxsat: false, tolangan: 5 }).holat).toBeNull();
    expect(tolovHolati({ ...asos, tolangan: null }).holat).toBeNull();
    expect(tolovHolati({ ruxsat: true, shartnoma_qabul_qqs_siz: null, qqs_foiz: 12, tolangan: 0 }).holat).toBeNull();
  });
  it('to‘lanmagan / qisman / to‘langan (QQS bilan 1120)', () => {
    expect(tolovHolati({ ...asos, tolangan: 0 })).toEqual({ holat: 'tolanmagan', qarz: 1120, qabulQqsBilan: 1120 });
    expect(tolovHolati({ ...asos, tolangan: 500 })).toMatchObject({ holat: 'qisman', qarz: 620 });
    expect(tolovHolati({ ...asos, tolangan: 1120 })).toMatchObject({ holat: 'tolangan', qarz: 0 });
  });
});

describe('bugun hisobi', () => {
  it('sanaydi', () => {
    const h = subBugunHisobi([ish(), ish({ id: 2, narx: null, qabul_hajm: 100 })], [akt(), akt({ id: 2, holat: 'tuzatish' }), akt({ id: 3, holat: 'yuborilgan' }), akt({ id: 4, holat: 'qabul' })]);
    expect(h).toMatchObject({ ishlar: 2, qolganIshlar: 1, narxsiz: 1 });
    expect([h.qoralama.length, h.tuzatish.length, h.kutilmoqda.length, h.qabul.length]).toEqual([1, 1, 1, 1]);
  });
});
