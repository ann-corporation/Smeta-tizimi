import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { HrKpiQator, HrKun, HrTatil } from '../../api/t2-hr';
import { hrXato } from '../../api/t2-hr';
import { bayramlarYil, ishKunlariK, kpiJamlari, oyOffset, reyting, tabelJamlari, tatildanTaklif } from './hisob';
import { ishHaqiVedomosti } from './eksport';

/** Sintetik kalendar: 2026-03 (1-mart yakshanba); 20 va 21 — bayram. */
function mart(): HrKun[] {
  const r: HrKun[] = [];
  for (let d = 1; d <= 31; d++) {
    const hafta = ((new Date(2026, 2, d).getDay() + 6) % 7) + 1; // 1 = dushanba
    const bayram = d === 20 || d === 21;
    r.push({ sana: `2026-03-${String(d).padStart(2, '0')}`, hafta, tur5: bayram ? 'bayram' : hafta <= 5 ? 'ish' : 'dam', tur6: bayram ? 'bayram' : hafta <= 6 ? 'ish' : 'dam', nom: null });
  }
  return r;
}

const qator = (o: Partial<HrKpiQator>): HrKpiQator => ({
  kadr_id: 1, ism: 'TEST', lavozim: null, rol: 'prorab', grafik: 5, sxema_id: null, sxema: null, f2_foiz: null, f2_baza: null, f2_rejim: null,
  norma_kun: 21, norma_soat: 168, kun_ishlagan: 10, kun_kelmadi: 0, kun_otpusk: 0, kun_kasal: 0, kun_otgul: 0, tabel_holat: 'tasdiqlangan', baza_turi: 'oylik', baza_summa: 2100000, baza: 1000000,
  kpi_f2: 300000, f2_summa: 15000000, f2_soni: 2, f2_nomalum_soni: 0, aktlar: [], bonus: 100000, jarima: 50000, tuzatmalar: [], tuzatma_kutilmoqda: 0,
  hisoblangan: 1350000, ndfl_foiz: 12, inps_foiz: 0.1, ndfl: 162000, inps: 1350, sof: 1186650, toliq: true, ogohlantirish: [], ...o,
});

describe('HR tabel yordamchilari', () => {
  it('tabelJamlari belgilarni sanaydi, noma’lum belgilarni e’tiborsiz qoldiradi', () => {
    expect(tabelJamlari({ 1: 'K', 2: 'K', 3: 'N', 4: 'O', 5: 'B', 6: 'D', 7: 'X' })).toEqual({ K: 2, N: 1, O: 1, B: 1, D: 1 });
    expect(tabelJamlari(null)).toEqual({ K: 0, N: 0, O: 0, B: 0, D: 0 });
  });
  it('ishKunlariK: 5 kunlik 21, 6 kunlik 24 ish kuni (bayramlar chiqarilgan)', () => {
    expect(Object.keys(ishKunlariK(mart(), 5))).toHaveLength(21);
    expect(Object.keys(ishKunlariK(mart(), 6))).toHaveLength(24);
  });
  it('tatildanTaklif: faqat tasdiqlangan, faqat ish kunlari, mavjud belgi ustiga yozmaydi', () => {
    const tatil = (o: Partial<HrTatil>): HrTatil => ({ id: 1, kadr_id: 7, tur: 'otpusk', dan: '2026-03-09', gacha: '2026-03-15', holat: 'tasdiqlangan', izoh: null, ...o });
    // 9..13 ish kunlari (du-ju); 14-15 shanba/yakshanba
    expect(tatildanTaklif([tatil({})], 7, mart(), 5)).toEqual({ 9: 'O', 10: 'O', 11: 'O', 12: 'O', 13: 'O' });
    expect(tatildanTaklif([tatil({})], 7, mart(), 6)).toMatchObject({ 14: 'O' });
    expect(tatildanTaklif([tatil({ holat: 'reja' })], 7, mart(), 5)).toEqual({});
    expect(tatildanTaklif([tatil({ tur: 'kasal' })], 7, mart(), 5, { 10: 'K' })).toEqual({ 9: 'B', 11: 'B', 12: 'B', 13: 'B' });
    expect(tatildanTaklif([tatil({})], 8, mart(), 5)).toEqual({});
  });
});

describe('HR jamlar va reyting (NULL != 0)', () => {
  it('noma’lum hisoblangan/sof jamiga kirmaydi va alohida sanaladi', () => {
    const j = kpiJamlari([qator({}), qator({ kadr_id: 2, hisoblangan: null, sof: null, kpi_f2: null, toliq: false })]);
    expect(j.hisoblangan).toBe(1350000);
    expect(j.kpi).toBe(300000);
    expect(j.nomalum_hisoblangan).toBe(1);
    expect(j.nomalum_sof).toBe(1);
    expect(j.toliq_emas).toBe(1);
  });
  it('pul yig‘indisi yaxlit2 qoidasi bilan (0,1 + 0,2 = 0,3)', () => {
    expect(kpiJamlari([qator({ bonus: 0.1 }), qator({ kadr_id: 2, bonus: 0.2 })]).bonus).toBe(0.3);
  });
  it('reyting: kamayish, noma’lum oxirida (0 emas), tenglikda ism bo‘yicha', () => {
    const r = reyting([qator({ kadr_id: 1, ism: 'B', kpi_f2: null }), qator({ kadr_id: 2, ism: 'C', kpi_f2: 5 }), qator({ kadr_id: 3, ism: 'A', kpi_f2: 5 }), qator({ kadr_id: 4, ism: 'D', kpi_f2: 0 })], 'kpi');
    expect(r.map((x) => x.kadr_id)).toEqual([3, 2, 4, 1]);
  });
});

describe('HR kalendar ma’lumoti', () => {
  it('bayramlarYil: sanasi qat’iy bayramlar tahrirlanadigan ma’lumotdan', () => {
    const b = bayramlarYil(2027);
    expect(b.map((x) => x.sana)).toContain('2027-03-21');
    expect(b.every((x) => /^2027-\d{2}-\d{2}$/.test(x.sana) && x.nom.length > 0)).toBe(true);
  });
  it('oyOffset yil chegarasidan o‘tadi', () => {
    expect(oyOffset('2026-12', 1)).toBe('2027-01');
    expect(oyOffset('2026-01', -1)).toBe('2025-12');
  });
});

describe('hrXato', () => {
  it('kodlarni tushunarli matnga aylantiradi', () => {
    expect(hrXato({ code: 'SUMMA_YOKI_FOIZ' })).toMatch(/aynan bittasini/);
    expect(hrXato({ error: 'PERMISSION_DENIED: payroll.write' })).toMatch(/ruxsat/);
    expect(hrXato({ code: 'ISH_HAQI_TASDIQLANGAN' })).toMatch(/tasdiqlangan/);
  });
});

describe('Ish haqi vedomosti (Excel)', () => {
  it('to‘liq qatorda formula, noma’lum qatorda formulasiz bo‘sh katak; yig‘indi formulasi bor', async () => {
    const x = await ishHaqiVedomosti(
      [qator({ f2_foiz: 2 }), qator({ kadr_id: 2, ism: 'NOMA', baza: null, kpi_f2: null, bonus: 0, jarima: 0, hisoblangan: null, ndfl: null, inps: null, sof: null, toliq: false, ogohlantirish: ['tabel_yoq'] })],
      { kompaniya: 'TEST', oy: '2026-03', tasdiqlangan: false },
    );
    const fayllar = unzipSync(x.bytes);
    const varaq = strFromU8(fayllar['xl/worksheets/sheet1.xml']);
    const formulalar = [...varaq.matchAll(/<f>([^<]*)<\/f>/g)].map((m) => m[1]);
    expect(formulalar.some((f) => /^G\d+\+H\d+\+I\d+-J\d+$/.test(f))).toBe(true);
    expect(formulalar.some((f) => /^K\d+-L\d+-M\d+$/.test(f))).toBe(true);
    expect(formulalar.filter((f) => /^G\d+\+/.test(f))).toHaveLength(1); // noma'lum xodim uchun formula yo'q
    expect(formulalar.some((f) => /^SUM\(K\d+:K\d+\)$/.test(f) || /^SUM\(K\d+,K\d+\)$/.test(f))).toBe(true);
    expect(x.faylNomi).toBe('ВЕДОМОСТЬ_ЗП_2026-03_ЧЕРНОВИК.xlsx');
  });
});
