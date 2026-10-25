import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { bolimSummalari, jurnalQur, type JurnalHolat } from '../fakt-jurnal';
import { faktAmalTafsiloti, faktAmalTekshir, faktBolim, faktHajmOqi, faktHolat, faktKontekst, faktOqi, faktQidir, type FaktMalumot } from './fakt-vositalar';
import { sahifaJavobiniTekshir } from './protokol';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Fundament' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е06-001-1', nom: 'Бетон монолитный фундамент', hajm: 40 }),
  q({ id: 3, tur: 'rs', ota_id: 2, nom: 'Затраты труда', hajm: 80, kat: 'ЧЕЛ' }),
  q({ id: 4, tur: 'mat', ota_id: 2, nom: 'Бетон B25', hajm: 41, kat: 'МАТ' }),
  q({ id: 5, tur: 'rz', kod: '2', nom: 'Devorlar' }),
  q({ id: 6, tur: 'bl', ota_id: 5, kod: 'Е08-002', nom: 'Кладка стен из кирпича', hajm: 100 }),
  q({ id: 7, tur: 'bl', ota_id: 5, kod: 'Е15-001', nom: 'Штукатурка', hajm: 50, qoshimcha: true }),
];
const states: JurnalHolat[] = [
  { qator_id: 2, smeta_hajm: 40, fakt_hajm: 45, f2_hajm: 10, qoldiq_hajm: -15 },
  { qator_id: 4, smeta_hajm: 41, fakt_hajm: 20, smeta_summa: 41_000_000, fakt_summa: 20_000_000, f2_summa: 5_000_000, qoldiq_summa: 36_000_000, smeta_narx: 1_000_000 },
  { qator_id: 6, smeta_hajm: 100, fakt_hajm: 0, f2_hajm: 20 },
];
const { bolimlar, bolimIshlari } = jurnalQur(rows, states);
const m: FaktMalumot = { obyektNomi: 'Maktab', bolimlar, bolimIshlari, holatMap: new Map(states.map((s) => [s.qator_id, s])), summalar: bolimSummalari(rows, states),
  bajHajm: new Map([[6, 30]]), ustamali: (s) => ({ ustamali: s.ustamasiz == null ? null : s.ustamasiz * 1.2, taxminiy: false }), materialTakliflari: (id) => (id === 2 ? 1 : 0) };

describe('fakt AI vositalari — faqat real ma’lumotdan', () => {
  it('kontekst: bo‘limlar [#id] bilan va summa ustamasiz + ustamali, NDS siz', () => {
    const k = faktKontekst(m);
    expect(k).toContain('[#1] 1 Fundament'); expect(k).toContain('[#5] 2 Devorlar');
    expect(k).toContain('ustamasiz 20'); expect(k).toContain('ustamali 24'); expect(k).toContain('NDS siz');
  });
  it('qidir: lotin so‘z kirill nomni topadi; topilmasa — so‘zlar bo‘yicha', () => {
    expect(faktQidir(m, 'beton')).toContain('[#2] ISH Е06-001-1');
    expect(faktQidir(m, 'beton')).toContain('[#4] MAT');
    const yaqin = faktQidir(m, 'кладка неизвестная');
    expect(yaqin).toContain('[#6]'); expect(yaqin).toContain('yaqin');
    expect(faktQidir(m, 'zzzzqqq')).toContain('topilmadi');
  });
  it('holat: 0% bo‘lim, smetadan/qoldiqdan oshgan, F2 > fakt, bajarilmaydi', () => {
    const h = faktHolat(m, null);
    expect(h).toMatch(/Fakt 0% bo‘limlar \(1\): \[#5\]/);
    expect(h).toMatch(/Smetadan oshgan \(1\):\n- \[#2\]/);
    expect(h).toMatch(/Qoldiqdan oshgan[^\n]*\(1\):\n- \[#2\]/);
    expect(h).toMatch(/F2 hajmi faktdan ko‘p[^\n]*\(1\):\n- \[#6\]/);
    expect(h).toMatch(/Bajarilmaydi deb belgilangan \(1\)/);
    expect(faktHolat(m, '999')).toContain('topilmadi');
  });
  it('bolim: ishlar resurslari bilan, avto resurs norma bilan', () => {
    const b = faktBolim(m, '1');
    expect(b).toContain('[#2] ISH'); expect(b).toContain('└ [#4] MAT'); expect(b).toContain('[#3] RES(avto)');
    expect(b).toContain('material taklifi: 1 ta');
  });
  it('amal tekshiruvi: to‘qilgan id, avto resurs, noto‘g‘ri hajm, katalogda yo‘q normativ rad etiladi', () => {
    const n = new Set(['w1']);
    expect(faktAmalTekshir(m, { tur: 'fakt_hajm', qator: 999, qiymat: '+1', izoh: '' }, n)).toMatch(/topilmadi/);
    expect(faktAmalTekshir(m, { tur: 'fakt_hajm', qator: 3, qiymat: '+1', izoh: '' }, n)).toMatch(/Avtomatik/);
    expect(faktAmalTekshir(m, { tur: 'fakt_hajm', qator: 2, qiymat: '5', izoh: '' }, n)).toMatch(/ko‘rinishida/);
    expect(faktAmalTekshir(m, { tur: 'fakt_hajm', qator: 4, qiymat: '+5', izoh: '' }, n)).toBeNull();
    expect(faktAmalTekshir(m, { tur: 'zamena', qator: 6, qiymat: 'N:boshqa', izoh: '' }, n)).toMatch(/katalog/);
    expect(faktAmalTekshir(m, { tur: 'zamena', qator: 6, qiymat: 'N:w1', izoh: '' }, n)).toBeNull();
    expect(faktAmalTekshir(m, { tur: 'zamena', qator: 7, qiymat: null, izoh: '' }, n)).toMatch(/zamena qilinmaydi/);
    expect(faktAmalTekshir(m, { tur: 'material_ol', qator: 6, qiymat: null, izoh: '' }, n)).toMatch(/taklifi yo‘q/);
    expect(faktAmalTekshir(m, { tur: 'bajarilmaydi', qator: 6, qiymat: '-3', izoh: '' }, n)).toMatch(/musbat/);
  });
  it('hajm o‘qish va yorliq (yangi fakt / smeta)', () => {
    expect(faktHajmOqi('+ 2,5')).toEqual({ rejim: '+', qiymat: '2.5' });
    expect(faktHajmOqi('=40')).toEqual({ rejim: '=', qiymat: '40' });
    expect(faktHajmOqi('40')).toBeNull();
    expect(faktAmalTafsiloti(m, { tur: 'fakt_hajm', qator: 4, qiymat: '+5', izoh: '' })).toContain('+5 → 25 / 41 м3');
  });
  it('normativ vositasi: id lar zamena uchun eslab qolinadi', async () => {
    const set = new Set<string>();
    const r = await faktOqi(m, { vosita: 'normativ', arg: 'g‘isht devor' }, set, { normativ: async () => [{ id: 'w9', kod: 'Е08-001', nom: 'Кладка', birlik: 'м3' }] });
    expect(r).toContain('[N:w9] Е08-001'); expect(set.has('w9')).toBe(true);
  });
  it('protokol: f2 amali fakt sahifasida tashlanadi', () => {
    const j = sahifaJavobiniTekshir({ javob: 'x', amallar: [{ tur: 'f2_hajm', qator: 2, qiymat: '1', izoh: '' }, { tur: 'korsat', qator: 2, qiymat: null, izoh: '' }] }, 'fakt');
    expect(j.amallar.map((a) => a.tur)).toEqual(['korsat']);
  });
});
