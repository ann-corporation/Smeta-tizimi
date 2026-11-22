import { describe, expect, it } from 'vitest';
import { ifodaOlchami, ifodaQiymati } from './ifoda';
import { kengaytir } from './kengaytir';
import { scopeTekshir } from './scope';
import { XUSUSIY_UY, shablonXatolari, tanlovQiymati } from './shablon';
import { ifodaHisobla } from '../smeta-ai/ifoda';

const S = XUSUSIY_UY;
const MATN = "2 qavatli g'isht uy, lenta poydevor 0,5 m kenglik, 1,2 m chuqurlik, perimetr 36 m, maydon 80 kv.m, tom profnastil";
// Soxta model javobi (haqiqiy model chaqirilmaydi).
const MODEL = {
  elementlar: [{ id: 'poydevor', manba: 'user' }, { id: 'devor', manba: 'user' }, { id: 'tom', manba: 'user' }, { id: 'yer_ishlari', manba: 'assumed' }, { id: 'uchar_kosa', manba: 'user' }],
  olchamlar: [
    { param: 'qavatlar', qiymat: '2', birlik: 'qavat', manba: 'user' },
    { param: 'devor_turi', qiymat: "g'isht", birlik: null, manba: 'user' },
    { param: 'poydevor_turi', qiymat: 'lentali', birlik: null, manba: 'user' },
    { param: 'poydevor_kengligi', qiymat: '50', birlik: 'sm', manba: 'user' },
    { param: 'poydevor_chuqurligi', qiymat: '1,2', birlik: 'm', manba: 'user' },
    { param: 'perimetr', qiymat: '36', birlik: 'm', manba: 'user' },
    { param: 'maydon', qiymat: '80', birlik: 'kv.m', manba: 'user' },
    { param: 'tom_turi', qiymat: 'profnastil', birlik: null, manba: 'user' },
    { param: 'devor_balandligi', qiymat: '2,8', birlik: 'm', manba: 'user' },  // matnda yo'q -> taxmin
    { param: 'noma_lum', qiymat: '1', birlik: null, manba: 'user' },
  ],
  taxminlar: ['Qavat balandligi odatiy deb olindi'],
  savollar: [{ matn: 'Devor qalinligi qancha?', variantlar: ['0,25', '0,38'] }],
};

describe('shablon paketi', () => {
  it('xatosiz: birlik/o\'lcham, parametrlar, shartlar, rus iboralari, norma kodi yo\'q', () => {
    expect(shablonXatolari(S)).toEqual([]);
    expect(S.holat).toBe('EGASI_TEKSHIRISHI_KERAK');
  });
  it('xato shablon ushlanadi: m + m2, noma\'lum parametr, norma kodi', () => {
    const yomon = { ...S, qoidalar: [
      { ...S.qoidalar[0], id: 'x1', ifoda: 'perimetr+maydon' },
      { ...S.qoidalar[0], id: 'x2', ifoda: 'perimetr*yoq_param' },
      { ...S.qoidalar[0], id: 'x3', qidiruv: ['Кладка Е08-01-001-1'] },
      { ...S.qoidalar[0], id: 'x4', ifoda: 'perimetr*poydevor_kengligi' }, // m2 != m3
    ] };
    const x = shablonXatolari(yomon).join('\n');
    expect(x).toContain('x1'); expect(x).toContain('x2'); expect(x).toContain('x3'); expect(x).toContain('x4');
  });
  it('tanlov sinonimlari', () => {
    expect(tanlovQiymati(S.parametrlar.devor_turi, "G‘ISHT")).toBe('gisht');
    expect(tanlovQiymati(S.parametrlar.devor_turi, 'кирпич')).toBe('gisht');
    expect(tanlovQiymati(S.parametrlar.poydevor_turi, 'beton')).toBeNull();
  });
});

describe('ifoda', () => {
  it('o\'lcham: m*m*m=3, m+m2 xato', () => {
    const d = (n: string) => ({ a: 1, b: 1, c: 1, s: 2 } as Record<string, number>)[n];
    expect(ifodaOlchami('a*b*c', d)).toBe(3);
    expect(() => ifodaOlchami('a+s', d)).toThrow('IFODA_OLCHAM_MOS_EMAS');
    expect(ifodaOlchami('s/a', d)).toBe(1);
  });
  it('qiymat aniq: yaxlit2 orqali', () => {
    const v: Record<string, number> = { perimetr: 36, kenglik: 0.5, chuq: 1.2 };
    const r = ifodaQiymati('perimetr*kenglik*chuq', n => v[n]);
    expect(r.hajm).toBe(21.6);
    expect(ifodaHisobla(r.sonli).qiymat).toBe('21.6');
    expect(() => ifodaQiymati('a-b', n => ({ a: 1, b: 2 }[n] as number))).toThrow('IFODA_MANFIY');
  });
});

describe('scopeTekshir (soxta model chiqishi)', () => {
  const { scope, rad } = scopeTekshir(MODEL, S, MATN);
  it('noma\'lum element/parametr rad, sm -> m, lentali -> lenta', () => {
    expect(scope.elementlar.map(e => e.id)).toEqual(['poydevor', 'devor', 'tom', 'yer_ishlari']);
    expect(rad.join('|')).toContain('noma_lum'); expect(rad.join('|')).toContain('uchar_kosa');
    expect(scope.olchamlar.poydevor_kengligi).toEqual({ value: 0.5, unit: 'm', source: 'user' });
    expect(scope.olchamlar.poydevor_turi.value).toBe('lenta');
    expect(scope.olchamlar.devor_turi.value).toBe('gisht');
  });
  it('matnda bo\'lmagan "user" son -> assumed', () => {
    expect(scope.olchamlar.devor_balandligi.source).toBe('assumed');
    expect(scope.olchamlar.perimetr.source).toBe('user');
  });
  it('chegaradan tashqari va noto\'g\'ri birlik rad etiladi', () => {
    const r = scopeTekshir({ olchamlar: [{ param: 'perimetr', qiymat: '5', birlik: 'm', manba: 'user' }, { param: 'maydon', qiymat: '80', birlik: 'm', manba: 'user' }] }, S, 'perimetr 5, maydon 80');
    expect(r.scope.olchamlar).toEqual({});
    expect(r.rad).toHaveLength(2);
  });
});

describe('kengaytir', () => {
  const { scope } = scopeTekshir(MODEL, S, MATN);
  const k = kengaytir(scope, S);
  const ish = (id: string) => k.ishlar.find(i => i.id === id);
  it('lenta transheya hajmi kod bilan hisoblanadi: 36*0,5*1,2 = 21,6', () => {
    const i = ish('yer-transheya')!;
    expect(i.holat).toBe('TAYYOR');
    expect(i.hajmIfoda).toBe('36*0,5*1,2');
    expect(i.hajmIzoh).toContain('21,6');
    expect(i.birlik).toBe('м3');
    expect(i.qidiruv[0]).toMatch(/[А-Яа-я]/);
  });
  it('podbetonka qalinligi aytilmagan -> HAJM_KERAK + savol, jim sukut yo\'q', () => {
    expect(ish('pdv-podbetonka-lenta')!.holat).toBe('HAJM_KERAK');
    expect(ish('pdv-podbetonka-lenta')!.hajmIfoda).toBeNull();
    expect(k.savollar.some(s => s.param === 'podbetonka_qalinligi')).toBe(true);
  });
  it('shart mos emas (plita/gazoblok/shifer) qo\'llanmaydi; profnastil bor', () => {
    expect(ish('pdv-plita-beton')).toBeUndefined();
    expect(ish('dv-gazoblok')).toBeUndefined();
    expect(ish('tom-shifer')).toBeUndefined();
    expect(ish('tom-profnastil')).toBeDefined();
  });
  it('element Scope\'da yo\'q -> ishlar yo\'q (pol, suvoq)', () => {
    expect(k.ishlar.some(i => i.id.startsWith('pl-') || i.id.startsWith('sv-'))).toBe(false);
  });
  it('taxmin qiymat bilan hisoblangan ish taxmin belgisini oladi, devor qalinligi so\'raladi', () => {
    // devor_qalinligi yo'q -> g'isht devor HAJM_KERAK
    expect(ish('dv-gisht')!.holat).toBe('HAJM_KERAK');
    expect(k.savollar.map(s => s.param)).toEqual(expect.arrayContaining(['devor_qalinligi', 'deraza_maydoni', 'tashqi_eshik_maydoni']));
    // param'ga bog'lanmagan model savoli ham saqlanadi
    expect(k.savollar.some(s => s.matn === 'Devor qalinligi qancha?')).toBe(true);
    const t = kengaytir({ ...scope, olchamlar: { ...scope.olchamlar, devor_qalinligi: { value: 0.38, unit: 'm', source: 'assumed' }, deraza_maydoni: { value: 10, unit: 'm2', source: 'user' }, tashqi_eshik_maydoni: { value: 4, unit: 'm2', source: 'user' } } }, S);
    const d = t.ishlar.find(i => i.id === 'dv-gisht')!;
    expect(d.holat).toBe('TAYYOR');
    expect(d.taxmin).toContain('devor_qalinligi=0,38');
    // (36*2.8*2 - 10 - 4) * 0.38 = (201.6-14)*0.38 = 71.288 -> 71.29
    expect(d.hajmIzoh).toContain('71,29');
  });
  it('shart noma\'lum (poydevor_turi yo\'q) -> ikkala variant ham qo\'yilmaydi, savol', () => {
    const { poydevor_turi: _p, ...qolgan } = scope.olchamlar;
    const t = kengaytir({ ...scope, olchamlar: qolgan }, S);
    expect(t.ishlar.some(i => i.id.startsWith('pdv-') || i.id.startsWith('yer-'))).toBe(false);
    expect(t.savollar.some(s => s.param === 'poydevor_turi')).toBe(true);
  });
  it('joy-egasi (muhandislik) formulasiz ANIQLASH_KERAK', () => {
    const t = kengaytir({ elementlar: [{ id: 'muhandislik', source: 'user' }], olchamlar: {}, taxminlar: [], savollar: [] }, S);
    expect(t.ishlar).toHaveLength(3);
    expect(t.ishlar.every(i => i.holat === 'ANIQLASH_KERAK' && i.hajmIfoda === null)).toBe(true);
  });
  it('IshNiyati id lari takrorsiz va har biri rus qidiruvga ega', () => {
    expect(new Set(k.ishlar.map(i => i.id)).size).toBe(k.ishlar.length);
    expect(k.ishlar.every(i => i.qidiruv.length >= 1)).toBe(true);
  });
});
