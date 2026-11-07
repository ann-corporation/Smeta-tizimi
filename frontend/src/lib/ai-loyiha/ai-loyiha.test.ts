/**
 * AI loyiha o'qish — sxema, validator, prompt va kesishma qoidalari. SINTETIK fixture'lar
 * (real loyiha fayllari repoga kirmaydi). To'siq keysi ataylab boshqa raqamlar bilan modellashtirilgan.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_LOYIHA_JSON_SCHEMA, birlikKanon, ishKartasiTakliflari, kesishmaTekshir, matnQatlamiBuzuqmi,
  profilKesim, profilKgM, sahifaJavobiniTekshir, sahifaPrompt, sonYokiNull,
  type LoyihaElement, type SahifaNatija,
} from './index';
import { TEKSHIRUV_MATNLARI } from './xabar';
import ru from '../../i18n/lugat/qism/ai-loyiha.json';

let n = 0;
const el = (p: Partial<LoyihaElement> & Pick<LoyihaElement, 'tur' | 'nom'>): LoyihaElement => ({
  id: `t-${++n}`, marka: null, kesim: null, olcham_m: null, uzunlik_m: null, soni: null, miqdor: null, birlik: null,
  birlik_massa_kg: null, doira: 'jami', tayanchga_tegishli: false, ota_marka: null, manba: { varaq: 'Л-1', sahifa: 1, pozitsiya: '1', jadvaldan: true }, ishonch: 0.9, izoh: null, ...p,
});
const sahifa = (elementlar: LoyihaElement[], par: Partial<SahifaNatija['parametrlar']> = {}, raqam = 1): SahifaNatija => ({
  hujjat: null, sahifa: raqam, varaq: { shifr: 'Л-1', nomi: null, turi: 'KJ', masshtab: null },
  parametrlar: { uzunlik_m: null, qadam_m: null, oraliq_soni: null, yopiq_kontur: null, belgi_past_m: null, belgi_yuqori_m: null, ...par },
  elementlar, ogohlantirishlar: [],
});
const kod = (k: ReturnType<typeof kesishmaTekshir>, c: string) => k.tekshiruvlar.filter((t) => t.kod === c);

describe('sxema', () => {
  it('strict JSON schema: har obyektda additionalProperties=false va hamma maydon required', () => {
    const yur = (s: any): void => {
      if (s?.type === 'object' || (Array.isArray(s?.type) && s.type.includes('object'))) {
        expect(s.additionalProperties).toBe(false);
        expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
        Object.values(s.properties).forEach(yur);
      }
      if (s?.items) yur(s.items);
    };
    yur(AI_LOYIHA_JSON_SCHEMA);
  });
});

describe('validator', () => {
  const xom = (elementlar: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({
    varaq: { shifr: 'КЖ-1', nomi: 'План', turi: 'KJ', masshtab: '1:100' },
    parametrlar: { uzunlik_m: '1 200', qadam_m: '4,0', yopiq_kontur: null, belgi_past_m: '-0,150', belgi_yuqori_m: 1.8 },
    elementlar, ogohlantirishlar: ['размеры уточнить по месту'], ...extra,
  });
  it('vergulli sonlar, mm emas m, birlik taxalluslari, null ≠ 0', () => {
    const v = sahifaJavobiniTekshir('```json\n' + xom([
      { marka: 'Ф1', tur: 'fundament_stakan', nom: 'Стакан', kesim: null, olcham_m: [0.5, 0.5, 0.4], uzunlik_m: null, soni: '1', miqdor: '0,1', birlik: 'м3', birlik_massa_kg: null, doira: 'bir_oraliq', varaq: 'КЖ-1', pozitsiya: '1', jadvaldan: true, ishonch: 0.8, izoh: null },
      { marka: null, tur: 'toldirma', nom: 'Труба', kesim: '□25×25×2', olcham_m: null, uzunlik_m: null, soni: null, miqdor: 40, birlik: 'п.м', birlik_massa_kg: null, doira: 'bir_oraliq', varaq: null, pozitsiya: null, jadvaldan: true, ishonch: 3, izoh: null },
    ]) + '\n```', 2);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.natija.parametrlar).toEqual({ uzunlik_m: 1200, qadam_m: 4, oraliq_soni: null, yopiq_kontur: null, belgi_past_m: -0.15, belgi_yuqori_m: 1.8 });
    const [a, b] = v.natija.elementlar;
    expect(a).toMatchObject({ id: 's2-e1', soni: 1, miqdor: 0.1, birlik: 'm3', manba: { sahifa: 2, varaq: 'КЖ-1', jadvaldan: true } });
    expect(b).toMatchObject({ birlik: 'm', soni: null, ishonch: 1, manba: { varaq: 'КЖ-1' } }); // varaq shtampdan
    expect(v.natija.ogohlantirishlar).toEqual(['размеры уточнить по месту']);
  });
  it('hujjat belgisi id ni noyob qiladi (ikki PDF ning 1-sahifasi to‘qnashmaydi)', () => {
    const v = sahifaJavobiniTekshir({ elementlar: [{ nom: 'X', tur: 'ustun' }] }, 1, 'ABCDEF12');
    expect(v.ok && v.natija.elementlar[0].id).toBe('abcdef12:s1-e1');
    expect(v.ok && v.natija.hujjat).toBe('abcdef12');
  });
  it('fail-closed: JSON emas, elementlarsiz, juda ko‘p element', () => {
    expect(sahifaJavobiniTekshir('salom', 1)).toMatchObject({ ok: false, kod: 'JSON_EMAS' });
    expect(sahifaJavobiniTekshir({ varaq: {} }, 1)).toMatchObject({ ok: false, kod: 'TUZILMA_BUZUQ' });
    expect(sahifaJavobiniTekshir({ elementlar: Array.from({ length: 201 }, () => ({ nom: 'x' })) }, 1)).toMatchObject({ ok: false, kod: 'JUDA_KOP_ELEMENT' });
  });
  it('yaroqsiz qiymatlar: manfiy son, noma’lum birlik, nomsiz element, noto‘g‘ri enum', () => {
    const v = sahifaJavobiniTekshir(xom([
      { nom: 'Балка', tur: 'kosmik', soni: -2, miqdor: 'ko‘p', birlik: 'ведро', olcham_m: [0.3, -1], doira: 'har_biri', ishonch: null },
      { nom: '  ', tur: 'ustun' },
    ]), 1);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.natija.elementlar).toHaveLength(1);
    expect(v.natija.elementlar[0]).toMatchObject({ tur: 'boshqa', soni: null, miqdor: null, birlik: null, olcham_m: null, doira: 'jami', ishonch: 0 });
    expect(v.ogohlantirishlar).toEqual(expect.arrayContaining(['BIRLIK_NOMALUM:0:ведро', 'OLCHAM_YAROQSIZ:0', 'ELEMENT_NOMSIZ:1']));
  });
  it('yordamchilar', () => {
    expect(sonYokiNull('2 400,5')).toBe(2400.5);
    expect(sonYokiNull('')).toBeNull();
    expect(sonYokiNull(Number.NaN)).toBeNull();
    expect(['шт', 'пог.м', 'кг', 'т', 'м²', 'm3'].map(birlikKanon)).toEqual(['dona', 'm', 'kg', 't', 'm2', 'm3']);
    expect(birlikKanon('litr')).toBeNull();
  });
});

describe('prompt', () => {
  it('buzilgan kirill matn qatlami yuborilmaydi, toza matn yuboriladi', () => {
    expect(matnQatlamiBuzuqmi('Ð¡Ñ‚Ð¾Ð¹ÐºÐ° Ð¼ÐµÑ‚Ð°Ð»Ð»Ð¸Ñ‡ÐµÑÐºÐ°Ñ')).toBe(true);
    expect(matnQatlamiBuzuqmi('Z6\\9 #K=@ Lqp xzv Qwerty asdf ghjk lzxc vbnm qwer tyui')).toBe(true);
    expect(matnQatlamiBuzuqmi('Спецификация элементов ограждения на одну секцию, стойка металлическая')).toBe(false);
    const p = sahifaPrompt({ sahifa: 1, jamiSahifa: 2, matnQatlami: 'Ð¡Ñ‚Ð¾Ð¹ÐºÐ°' });
    expect(p).toContain('No usable text layer');
    expect(sahifaPrompt({ sahifa: 1, jamiSahifa: 2, varaqTuri: 'AS', matnQatlami: 'Спецификация элементов ограждения на одну секцию' })).toContain('Text layer extracted');
  });
  it('prompt umumiy tayanchni modelga tuzattirmaydi — aynan ko‘chirishni so‘raydi', () => {
    expect(sahifaPrompt({ sahifa: 1, jamiSahifa: 1 })).toMatch(/copy it AS WRITTEN/);
  });
});

describe('kesishma: uzunlik / qadam', () => {
  it('karrali uzunlik: oraliqlar; kontur noma’lum → n va n+1', () => {
    const k = kesishmaTekshir([sahifa([], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(k).toMatchObject({ oraliqlar: 300, tayanchlar: [300, 301], holat: 'toza' });
    expect(kesishmaTekshir([sahifa([], { uzunlik_m: 1200, qadam_m: 4, yopiq_kontur: false })]).tayanchlar).toEqual([301]);
    expect(kesishmaTekshir([sahifa([], { uzunlik_m: 1200, qadam_m: 4, yopiq_kontur: true })]).tayanchlar).toEqual([300]);
  });
  it('karrali emas → ogohlantirish va yuqoriga yaxlitlanadi; varaqlar ziddiyati → xato', () => {
    const k = kesishmaTekshir([sahifa([], { uzunlik_m: 1201, qadam_m: 4 })]);
    expect(k.oraliqlar).toBe(301);
    expect(kod(k, 'UZUNLIK_QADAMGA_KARRALI_EMAS')).toHaveLength(1);
    const z = kesishmaTekshir([sahifa([], { uzunlik_m: 1200, qadam_m: 4 }), sahifa([], { uzunlik_m: 1250, qadam_m: 4 }, 2)]);
    expect(kod(z, 'PARAMETR_ZIDDIYAT')[0]).toMatchObject({ daraja: 'xato' });
    expect(z.oraliqlar).toBeNull();
  });
  it('jami tayanch soni geometriyaga mos emas → xato', () => {
    const k = kesishmaTekshir([sahifa([el({ tur: 'ustun', nom: 'Стойка', soni: 320, birlik: 'dona' })], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(kod(k, 'TAYANCH_SONI')[0]).toMatchObject({ daraja: 'xato', qiymat: { topilgan: 320, kutilgan: '300 / 301' } });
    expect(k.holat).toBe('xato');
  });
});

describe('kesishma: umumiy tayanch (ikki marta sanash) — haqiqiy keys sintetik ko‘rinishda', () => {
  // Spetsifikatsiya «на одну секцию»: 2 stakan + 2 stoyka — har oraliq uchidagi tayanch qo'shni oraliq bilan umumiy.
  const stakan = el({ tur: 'fundament_stakan', nom: 'Стакан Ф1', olcham_m: [0.5, 0.5, 0.4], soni: 2, miqdor: 0.2, birlik: 'm3', doira: 'bir_oraliq' });
  const stoyka = el({ tur: 'ustun', nom: 'Стойка', kesim: '□60×60×3', uzunlik_m: 1.8, soni: 2, birlik: 'dona', doira: 'bir_oraliq' });
  const lenta = el({ tur: 'fundament_lenta', nom: 'Лента 0,25×0,4', kesim: '0,25×0,4', uzunlik_m: 3.5, miqdor: 0.35, birlik: 'm3', doira: 'bir_oraliq' });
  const k = kesishmaTekshir([sahifa([stakan, stoyka, lenta], { uzunlik_m: 1200, qadam_m: 4 })]);

  it('oraliqqa 2 stakan × 300 = 600 emas → 2 / 2 × 300 = 300; hajm ham tuzatiladi', () => {
    const t = kod(k, 'IKKI_MARTA_SANALGAN').find((x) => x.elementlar[0] === stakan.id);
    expect(t).toMatchObject({ daraja: 'xato', qiymat: { oraliqda: 2, oraliqlar: 300, sodda: 600, tuzatilgan: 300 } });
    const h = k.hisob.find((x) => x.element_id === stakan.id)!;
    expect(h).toMatchObject({ jami_soni: 300, jami_miqdor: 30, formula: '2 / 2 × 300 = 300' });
    expect(h.ishonch).toBeLessThanOrEqual(0.3);
  });
  it('ochiq chiziq → oxirgi tayanch +1', () => {
    const o = kesishmaTekshir([sahifa([stakan], { uzunlik_m: 1200, qadam_m: 4, yopiq_kontur: false })]);
    expect(o.hisob[0]).toMatchObject({ jami_soni: 301, formula: '2 / 2 × 301 = 301' });
  });
  it('ustunlar = stakanlar (tuzatilgandan keyin) → TAYANCH_MOSLIGI ok', () => {
    expect(kod(k, 'TAYANCH_MOSLIGI')[0]).toMatchObject({ daraja: 'ok', qiymat: { ustun: 300, stakan: 300 } });
  });
  it('lenta qadamga teng (stakan eni ayirilmagan) → ogohlantirish; to‘g‘ri lenta → ok', () => {
    expect(kod(k, 'LENTA_ORALIQ')[0]).toMatchObject({ daraja: 'ok', qiymat: { topilgan: 3.5, kutilgan: 3.5 } });
    const xato = kesishmaTekshir([sahifa([stakan, { ...lenta, uzunlik_m: 4 }], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(kod(xato, 'LENTA_STAKAN_AYIRILMAGAN')[0]).toMatchObject({ daraja: 'ogohlantirish', qiymat: { kutilgan: 3.5, stakan_eni: 0.5 } });
  });
  it('yig‘ma birlik tarkibi: ЗД ning 4 shpilkasi (oraliqda 2 ЗД) → tayanchga 2 ta; setka sterjeni setka soniga ko‘paytiriladi', () => {
    const zd = el({ tur: 'boshqa', marka: 'ЗД-3', nom: 'Закладная деталь ЗД-3', soni: 2, birlik: 'dona', doira: 'bir_oraliq', tayanchga_tegishli: true });
    const shp = el({ tur: 'boshqa', nom: 'Шпилька М12', soni: 2, birlik: 'dona', doira: 'bir_dona', ota_marka: 'ЗД-3' });
    const setka = el({ tur: 'armatura', marka: 'С-4', nom: 'Сетка С-4', soni: 2, birlik: 'dona', doira: 'bir_oraliq' });
    const st = el({ tur: 'armatura', nom: 'Ø10 L=500', soni: 3, miqdor: 1.0, birlik: 'kg', doira: 'bir_dona', ota_marka: 'С-4' });
    const r = kesishmaTekshir([sahifa([zd, shp, setka, st], { uzunlik_m: 1200, qadam_m: 4, yopiq_kontur: false })]);
    const h = (id: string) => r.hisob.find((x) => x.element_id === id)!;
    expect(h(zd.id)).toMatchObject({ jami_soni: 301, formula: '2 / 2 × 301 = 301' });
    expect(h(shp.id)).toMatchObject({ jami_soni: 602 }); // 2 ЗД × 2 shp = 4 oraliqda → 4 / 2 × 301
    expect(h(st.id)).toMatchObject({ jami_miqdor: 600 }); // 1 kg × 2 setka × 300 oraliq
    const yoq = kesishmaTekshir([sahifa([{ ...st, ota_marka: 'С-9' }], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(kod(yoq, 'OTA_TOPILMADI')).toHaveLength(1);
  });
  it('sarlavha qatori «ОГ-5 — 300 шт» ostidagi tarkib bitta seksiya uchun: 2 stoyka → 300 (+1), 600 emas', () => {
    const og = el({ tur: 'boshqa', marka: 'ОГ-5', nom: 'Ограждение ОГ-5', soni: 300, birlik: 'dona', doira: 'jami' });
    const st = el({ tur: 'ustun', nom: 'Стойка', kesim: '□60×60×3', uzunlik_m: 1.8, soni: 2, birlik_massa_kg: 9.38, doira: 'jami', ota_marka: 'ОГ-5', tayanchga_tegishli: true });
    const tr = el({ tur: 'toldirma', nom: 'Труба □20×20×2', miqdor: 50, birlik: 'm', doira: 'jami', ota_marka: 'ОГ-5' });
    const r = kesishmaTekshir([sahifa([og, st, tr], { qadam_m: 4, oraliq_soni: 300, yopiq_kontur: false })]);
    const h = (id: string) => r.hisob.find((x) => x.element_id === id)!;
    expect(h(st.id)).toMatchObject({ jami_soni: 301 });
    expect(kod(r, 'IKKI_MARTA_SANALGAN')[0]).toMatchObject({ qiymat: { sodda: 600, tuzatilgan: 301 } });
    expect(h(tr.id)).toMatchObject({ jami_miqdor: 15000 });
  });
  it('1 ta list 2 tayanchga bo‘linmaydi → kasr son emas, oraliq detali + ogohlantirish', () => {
    const st = el({ tur: 'ustun', nom: 'Стойка', soni: 2, birlik: 'dona', doira: 'bir_oraliq' });
    const list = el({ tur: 'plita', nom: 'Лист 250×250×8', soni: 1, birlik: 'dona', doira: 'bir_oraliq', tayanchga_tegishli: true });
    const r = kesishmaTekshir([sahifa([st, list], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(r.hisob.find((x) => x.element_id === list.id)).toMatchObject({ jami_soni: 300, formula: '1 × 300' });
    expect(kod(r, 'TAYANCH_KASR')).toHaveLength(1);
  });
  it('ota sonisiz (o‘qilmagan) — tarkib hisoblanmaydi, 0 emas', () => {
    const kp = el({ tur: 'armatura', marka: 'КП-2', nom: 'Каркас КП-2', soni: null, doira: 'bir_oraliq', tayanchga_tegishli: true });
    const b = el({ tur: 'armatura', nom: 'Ø10', soni: 4, miqdor: 2, birlik: 'kg', doira: 'bir_dona', ota_marka: 'КП-2' });
    const r = kesishmaTekshir([sahifa([kp, b], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(r.hisob.find((x) => x.element_id === b.id)).toMatchObject({ jami_miqdor: null, jami_soni: null });
    expect(kod(r, 'OTA_TOPILMADI')).toHaveLength(1);
    expect(kod(r, 'IKKI_MARTA_SANALGAN').filter((t) => t.qiymat.sodda === 0)).toHaveLength(0);
  });
  it('tayanchga tegishli detal (закладная, 2 шт на секцию) ham ikki marta sanalgan deb topiladi', () => {
    const zd = el({ tur: 'boshqa', nom: 'Закладная ЗД', soni: 2, birlik: 'dona', doira: 'bir_oraliq', tayanchga_tegishli: true });
    const panjara = el({ tur: 'toldirma', nom: 'Труба □20×20×2', soni: 2, miqdor: 40, birlik: 'm', doira: 'bir_oraliq' });
    const r = kesishmaTekshir([sahifa([zd, panjara], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(kod(r, 'IKKI_MARTA_SANALGAN').map((x) => x.elementlar[0])).toEqual([zd.id]);
    expect(r.hisob[1]).toMatchObject({ jami_miqdor: 12000 });
  });
  it('seksiyalar soni bir varaqda, uzunlik/qadam boshqasida: mos → ok; faqat soni bo‘lsa ham oraliq hisoblanadi', () => {
    const mos = kesishmaTekshir([sahifa([], { uzunlik_m: 1200, qadam_m: 4 }), sahifa([], { qadam_m: 4, oraliq_soni: 300 }, 2)]);
    expect(kod(mos, 'ORALIQ_SONI_MOS')[0]).toMatchObject({ daraja: 'ok' });
    expect(kod(kesishmaTekshir([sahifa([], { uzunlik_m: 1200, qadam_m: 4, oraliq_soni: 310 })]), 'ORALIQ_SONI_MOS')[0]).toMatchObject({ daraja: 'xato' });
    expect(kesishmaTekshir([sahifa([], { oraliq_soni: 300 })]).oraliqlar).toBe(300);
  });
  it('oraliqda 1 tayanch — to‘g‘ri, xato yo‘q', () => {
    const bir = kesishmaTekshir([sahifa([{ ...stakan, soni: 1, miqdor: 0.1 }], { uzunlik_m: 1200, qadam_m: 4 })]);
    expect(kod(bir, 'IKKI_MARTA_SANALGAN')).toHaveLength(0);
    expect(bir.hisob[0]).toMatchObject({ jami_soni: 300, jami_miqdor: 30 });
  });
  it('oraliq spetsifikatsiyasi bor, uzunlik/qadam yo‘q → hisob qilinmaydi (null, 0 emas)', () => {
    const y = kesishmaTekshir([sahifa([stakan])]);
    expect(y.hisob[0]).toMatchObject({ jami_soni: null, jami_miqdor: null });
    expect(kod(y, 'ORALIQ_SONI_NOMALUM')).toHaveLength(1);
  });
  it('ish kartasi takliflari: manba=ai_loyiha, dalil varaq/pozitsiya bilan, muammoli qator tasdiq talab qiladi', () => {
    const tk = ishKartasiTakliflari([sahifa([stakan, lenta], { uzunlik_m: 1200, qadam_m: 4 })], kesishmaTekshir([sahifa([stakan, lenta], { uzunlik_m: 1200, qadam_m: 4 })]));
    expect(tk[0]).toMatchObject({ manba: 'ai_loyiha', hajm: 30, birlik: 'm3', tasdiq_kerak: true, dalil: { varaq: 'Л-1', pozitsiya: '1' } });
    expect(tk[1]).toMatchObject({ hajm: 105, tasdiq_kerak: false });
  });
});

describe('kesishma: birlik, profil massasi, hajm', () => {
  it('profil: □60×60×3 L=1,8 m — GOST ~9,4 kg ok; 1 m massasi bilan adashilsa xato', () => {
    expect(profilKesim('Труба □60×60×3')).toEqual({ a: 60, b: 60, t: 3 });
    expect(profilKesim('40х30х3')).toEqual({ a: 40, b: 30, t: 3 });
    expect(profilKesim('0,3×0,5')).toBeNull();
    expect(profilKgM({ a: 60, b: 60, t: 3 })).toBeCloseTo(5.37, 2);
    const ok = kesishmaTekshir([sahifa([el({ tur: 'ustun', nom: 'Стойка', kesim: '□60×60×3', uzunlik_m: 1.8, birlik_massa_kg: 9.38 })])]);
    expect(kod(ok, 'PROFIL_MASSA')[0]).toMatchObject({ daraja: 'ok' });
    const xato = kesishmaTekshir([sahifa([el({ tur: 'ustun', nom: 'Стойка', kesim: '□60×60×3', uzunlik_m: 1.8, birlik_massa_kg: 5.21 })])]);
    expect(kod(xato, 'PROFIL_MASSA')[0]).toMatchObject({ daraja: 'xato' });
  });
  it('hajm o‘lchamlarga mos emas → ogohlantirish', () => {
    const k = kesishmaTekshir([sahifa([el({ tur: 'fundament_stakan', nom: 'Ф1', olcham_m: [0.5, 0.5, 0.4], soni: 10, miqdor: 2.5, birlik: 'm3' })])]);
    expect(kod(k, 'HAJM_OLCHAM')[0]).toMatchObject({ daraja: 'ogohlantirish', qiymat: { kutilgan: 1 } });
  });
  it('birliksiz miqdor → xato; turga mos bo‘lmagan birlik → ogohlantirish', () => {
    const k = kesishmaTekshir([sahifa([el({ tur: 'beton', nom: 'Бетон', miqdor: 5 }), el({ tur: 'profil', nom: 'Уголок', miqdor: 5, birlik: 'm3' })])]);
    expect(kod(k, 'BIRLIK_YOQ')).toHaveLength(1);
    expect(kod(k, 'BIRLIK_TURGA_MOS_EMAS')).toHaveLength(1);
  });
  it('past ishonch va manbasiz raqam — himoya ogohlantirishi', () => {
    const k = kesishmaTekshir([sahifa([el({ tur: 'boshqa', nom: 'X', ishonch: 0.4, manba: { varaq: null, sahifa: 3, pozitsiya: null, jadvaldan: false } })])]);
    expect(kod(k, 'ISHONCH_PAST')).toHaveLength(1);
    expect(kod(k, 'MANBA_YOQ')[0]).toMatchObject({ qiymat: { sahifa: 3 } });
    expect(k.holat).toBe('korib_chiqish');
  });
});

describe('xabar', () => {
  it('har tekshiruv kodi matnining ru/en tarjimasi bor', () => {
    const lug = ru as Record<string, { ru: string; en: string }>;
    for (const m of Object.values(TEKSHIRUV_MATNLARI)) expect(lug[m], m).toBeTruthy();
  });
});
