import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { f2Qur, type F2Holat } from '../f2-tayyor';
import { matnniNiyatlarga, nomzodniTanla, rejaTuz } from './ai-reja';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// Sintetik smeta: «ФУНДАМЕНТЫ» va «СТЕНЫ» razdellari; «БЕТОНИРОВАНИЕ ПЛИТЫ» ikkala razdelda ham bor, «ЗАСЫПКА ПАЗУХ» — faqat bittasida.
const rows = [
  q({ id: 1, tur: 'rz', nom: 'ФУНДАМЕНТЫ' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е6-1', nom: 'БЕТОНИРОВАНИЕ ПЛИТЫ ПЕРЕКРЫТИЯ', birlik: 'м3', hajm: 100 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел.-ч', norma: 2, narx: 25000 }),
  q({ id: 4, tur: 'bl', ota_id: 1, nom: 'ЗАСЫПКА ПАЗУХ ФУНДАМЕНТОВ', birlik: 'м3', hajm: 40 }),
  q({ id: 5, tur: 'rs', ota_id: 4, kat: 'МАШ', nom: 'ЭКСКАВАТОР', birlik: 'маш.-ч', norma: 1, narx: 100000 }),
  q({ id: 6, tur: 'rz', nom: 'СТЕНЫ' }),
  q({ id: 7, tur: 'bl', ota_id: 6, kod: 'Е6-2', nom: 'БЕТОНИРОВАНИЕ ПЛИТЫ ПЕРЕКРЫТИЯ', birlik: 'м3', hajm: 80 }),
  q({ id: 8, tur: 'rs', ota_id: 7, kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел.-ч', norma: 2, narx: 25000 }),
  q({ id: 9, tur: 'bl', ota_id: 6, nom: 'КЛАДКА КИРПИЧНЫХ СТЕН', birlik: 'м3', hajm: 30 }),
  q({ id: 10, tur: 'rs', ota_id: 9, kat: 'ЧЕЛ', nom: 'КАМЕНЩИКИ', birlik: 'чел.-ч', norma: 5, narx: 30000 }),
];
const holat: F2Holat[] = [
  { qator_id: 2, f2_mumkin_hajm: 0, f2_hajm: 20, smeta_hajm: 100 }, { qator_id: 3, f2_mumkin_hajm: 0, f2_hajm: 40, smeta_hajm: 200 },
  { qator_id: 4, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 40 }, { qator_id: 5, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 40 },
  { qator_id: 7, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 80 }, { qator_id: 8, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 160 },
  { qator_id: 9, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 30 }, { qator_id: 10, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 150 },
];
// Faktsiz rejim (smeta qoldig'i) — fakt jurnali yo'q obyekt.
const bolimlar = f2Qur(rows, holat, undefined, 'smeta');

describe('B8 — matn → niyat', () => {
  it('oddiy qatorlar: tavsif, son/ifoda, birlik, razdel', () => {
    const n = matnniNiyatlarga('Бетонирование плиты перекрытия 12*0,6*0,1 м3 (Стены)\nзасыпка пазух — 15 м3\nкладка кирпичных стен');
    expect(n).toEqual([
      { tavsif: 'Бетонирование плиты перекрытия', birlik: 'м3', hajm: '12*0,6*0,1', razdel: 'Стены' },
      { tavsif: 'засыпка пазух', birlik: 'м3', hajm: '15', razdel: null },
      { tavsif: 'кладка кирпичных стен', birlik: null, hajm: null, razdel: null },
    ]);
  });
});

describe('B8 — reja (AI siz)', () => {
  it('yagona nomzod — ✓, hajm va pul f2-tayyor hisobi bilan; kiritma faqat ✓ uchun', () => {
    const r = rejaTuz([{ tavsif: 'засыпка пазух', birlik: 'м3', hajm: 15 }], bolimlar);
    expect(r.qatorlar[0]).toMatchObject({ holat: 'aniq', ishId: 4, hajm: 15, mumkin: 40, olingan: 0 });
    expect(r.qatorlar[0].dalil).toContain('yagona nomzod');
    expect(r.kiritma.hajm).toEqual({ 4: '15' });
    expect(r.qatorlar[0].pul).toBe(1500000); // 15 × norma 1 × narx 100 000 (ЭКСКАВАТОР)
    expect(r.jami).toMatchObject({ aniq: 1, taklif: 0, topilmadi: 0, pul: 1500000 });
  });

  it('mos ish bir necha razdelda, razdel ko‘rsatilmagan — ✓ EMAS, ◐ (razdel tanlovi)', () => {
    const r = rejaTuz([{ tavsif: 'бетонирование плиты перекрытия', hajm: 10 }], bolimlar);
    expect(r.qatorlar[0].holat).toBe('taklif');
    expect(r.qatorlar[0].ishId).toBeNull();
    expect(r.qatorlar[0].nomzodlar.map((n) => n.razdelNom).sort()).toEqual(['СТЕНЫ', 'ФУНДАМЕНТЫ']);
    expect(r.qatorlar[0].dalil).toContain('razdelni tanlang');
    expect(r.kiritma.hajm).toEqual({});
  });

  it('operator razdelni ko‘rsatgan — ✓ (razdel qoidasi)', () => {
    const r = rejaTuz([{ tavsif: 'бетонирование плиты перекрытия', hajm: '10*2', razdel: 'Стены' }], bolimlar);
    expect(r.qatorlar[0]).toMatchObject({ holat: 'aniq', ishId: 7, hajm: 20 });
    expect(r.qatorlar[0].dalil).toContain('razdel ko‘rsatilgan');
    expect(r.kiritma.hajm).toEqual({ 7: '20' });
  });

  it('◐ da operator nomzodni tanlaydi → ✓ (boshqa niyatlar o‘zgarmaydi)', () => {
    const niyat = [{ tavsif: 'бетонирование плиты перекрытия', hajm: 10 }, { tavsif: 'кладка кирпичных стен', hajm: 3 }];
    const r0 = rejaTuz(niyat, bolimlar);
    expect(r0.qatorlar.map((x) => x.holat)).toEqual(['taklif', 'aniq']);
    const r1 = nomzodniTanla(niyat, bolimlar, 0, r0.qatorlar[0].nomzodlar.find((n) => n.razdelNom === 'ФУНДАМЕНТЫ')!);
    expect(r1.qatorlar.map((x) => [x.holat, x.ishId])).toEqual([['aniq', 2], ['aniq', 9]]);
    expect(r1.qatorlar[0].dalil).toContain('operator tanlagan');
  });

  it('topilmadi — ✕ (qo‘shimcha ish); razdelda mos ish yo‘q — ◐; hajm yo‘q — ✓ lekin F2 ga olinmaydi', () => {
    const r = rejaTuz([
      { tavsif: 'монтаж вентиляции', hajm: 1 },
      { tavsif: 'засыпка пазух', razdel: 'Кровля', hajm: 3 },
      { tavsif: 'кладка кирпичных стен' },
    ], bolimlar);
    expect(r.qatorlar.map((x) => x.holat)).toEqual(['topilmadi', 'taklif', 'aniq']);
    expect(r.qatorlar[2].ogoh).toContain('hajm kiritilmagan — F2 ga olinmaydi');
    expect(r.kiritma.hajm).toEqual({});
  });

  it('qoldiqdan oshsa — blok yo‘q, faqat ogohlantirish; noto‘g‘ri ifoda — ogohlantirish', () => {
    const r = rejaTuz([{ tavsif: 'засыпка пазух', hajm: 45 }, { tavsif: 'кладка кирпичных стен', hajm: '3 ++ 2' }], bolimlar);
    expect(r.qatorlar[0].holat).toBe('aniq');
    expect(r.qatorlar[0].ogoh[0]).toContain('qoldiqdan oshadi');
    expect(r.kiritma.hajm[4]).toBe('45');
    expect(r.qatorlar[1].hajm).toBeNull();
    expect(r.qatorlar[1].ogoh[0]).toContain('hajm ifodasi noto‘g‘ri');
  });

  it('birlik mos kelmasa (кг ≠ м3) — taxmin qilinmaydi: ✕, kiritmaga hech narsa tushmaydi', () => {
    const r = rejaTuz([{ tavsif: 'засыпка пазух', birlik: 'кг', hajm: 2 }], bolimlar);
    expect(r.qatorlar[0].holat).toBe('topilmadi');
    expect(r.kiritma.hajm).toEqual({});
  });
});
