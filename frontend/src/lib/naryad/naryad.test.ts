import { describe, expect, it } from 'vitest';
import { faktTaklif, naryadJami, qatorMehnat, qatorSurati, satrTahlil, tolovHajmi, ustaNarxTaklif, type NaryadQator } from './index';
import { naryadHujjat } from './hujjat';
import { naryadMatni } from './jarvis';
import type { Naryad, NaryadQisqa } from './index';
import type { SmetaQator } from '../ish-kartasi';

const q = (o: Partial<NaryadQator> = {}): NaryadQator => ({
  id: 1, qator_id: 10, tartib: 1, kod: 'К1', nom: 'Кладка стен кирпичных', birlik: 'м3', hajm: 10, norma_chel_soat: 50, smeta_mehnat_birlik: 800, usta_narx: 600,
  bajarilgan_hajm: null, qabul_hajm: null, fakt_boshida: 2, fakt_delta: null, fakt_yozilgan: null, ...o,
});

describe('satr va jami (pul)', () => {
  it('to‘lov hajmi: qabul → bajarilgan → reja', () => {
    expect(tolovHajmi(q())).toBe(10);
    expect(tolovHajmi(q({ bajarilgan_hajm: 8 }))).toBe(8);
    expect(tolovHajmi(q({ bajarilgan_hajm: 8, qabul_hajm: 7 }))).toBe(7);
  });
  it('foyda = smeta mehnati − usta summasi', () => {
    const s = satrTahlil(q({ qabul_hajm: 10 }));
    expect(s.summa).toBe(6000); expect(s.smetaMehnat).toBe(8000); expect(s.foyda).toBe(2000);
    expect(s.chelSoat).toBe(50);
  });
  it('NULL ≠ 0: narx kelishilmagan — summa va foyda null, jami to‘liq emas', () => {
    const s = satrTahlil(q({ usta_narx: null }));
    expect(s.summa).toBeNull(); expect(s.foyda).toBeNull(); expect(s.narxsiz).toBe(true);
    const j = naryadJami([q(), q({ id: 2, usta_narx: null })], 'reja');
    expect(j.ustaSumma).toBe(6000); expect(j.narxsizSoni).toBe(1);
    expect(j.foyda).toBe(2000);                    // narxsiz satr foydaga kirmaydi
    expect(naryadJami([q({ usta_narx: null })]).ustaSumma).toBeNull();
  });
  it('usta qimmat — zarar manfiy', () => {
    const j = naryadJami([q({ usta_narx: 1000 })], 'reja');
    expect(j.foyda).toBe(-2000); expect(j.foiz).toBeCloseTo(-25);
  });
});

describe('smeta resursidan mehnat va chel-soat', () => {
  const qator: SmetaQator = { id: 5, obyekt_id: 1, tur: 'bl', kod: 'Е1', nom: 'Работа', birlik: 'м3', hajm: 2, summa: 1500, bolalar: [
    { kat: 'ЧЕЛ', nom: 'Рабочие', birlik: 'чел-ч', hajm: 20, summa: 1000 },
    { kat: 'МАТ', nom: 'Кирпич', birlik: 'тыс.шт', hajm: 1, summa: 500 },
  ] };
  it('1 birlikka mehnat puli va чел-ч; hajmga surat', () => {
    const m = qatorMehnat(qator);
    expect(m.mehnatBirlik).toBe(500); expect(m.chelSoatBirlik).toBe(10);
    expect(qatorSurati(qator, 4)).toEqual({ norma_chel_soat: 40, smeta_mehnat_birlik: 500 });
  });
  it('mehnat resursi yo‘q — null (0 emas)', () => {
    expect(qatorMehnat({ ...qator, bolalar: [{ kat: 'МАТ', nom: 'Кирпич', birlik: 'шт', hajm: 1, summa: 500 }] }).mehnatBirlik).toBeNull();
    expect(qatorMehnat({ ...qator, hajm: 0 }).mehnatBirlik).toBeNull();
  });
});

describe('usta narxi taklifi (ish kartasidan)', () => {
  it('karta naryad narxi / koef = 1 smeta birligiga', () => {
    const k = { holat: 'faol' as const, naryad_narx: 250000, bog: [{ qator_id: 10, obyekt_id: 1, rol: 'asosiy' as const, koef: 0.5, koef_usul: 'qolda' as const, bosqich: null, material_guruh: null }] };
    expect(ustaNarxTaklif(10, [k])).toBe(500000);
    expect(ustaNarxTaklif(11, [k])).toBeNull();
    expect(ustaNarxTaklif(10, [{ ...k, holat: 'arxiv' as never }])).toBeNull();
  });
});

describe('fakt farqi — ikki marta yozilmaydi', () => {
  it('farq = boshida + qabul − hozirgi fakt', () => {
    const r = faktTaklif([q({ qabul_hajm: 10 })], new Map([[10, { fakt_hajm: 5, smeta_hajm: 100 }]]));
    expect(r).toHaveLength(1); expect(r[0].delta).toBe(7);                 // 2 + 10 − 5
  });
  it('fakt boshqa yo‘l bilan allaqachon kiritilgan — farq nol, taklif yo‘q', () => {
    expect(faktTaklif([q({ qabul_hajm: 10 })], new Map([[10, { fakt_hajm: 12, smeta_hajm: 100 }]]))).toEqual([]);
  });
  it('yozilgan satr qayta taklif qilinmaydi; hozirgi fakt noma’lum — boshidagidan', () => {
    expect(faktTaklif([q({ qabul_hajm: 10, fakt_yozilgan: 10 })], new Map())).toEqual([]);
    expect(faktTaklif([q({ qabul_hajm: 10 })], new Map())[0].delta).toBe(10);
  });
  it('smeta hajmidan oshsa ogohlantiradi (to‘smaydi)', () => {
    const r = faktTaklif([q({ qabul_hajm: 10 })], new Map([[10, { fakt_hajm: 5, smeta_hajm: 8 }]]));
    expect(r[0].ogohlantirish).toBe('SMETA_HAJMIDAN_OSHADI');
  });
});

const naryad = (o: Partial<Naryad> = {}): Naryad => ({
  id: 1, obyekt_id: 1, raqam: 'N-2026-0001', davr_dan: '2026-11-01', davr_gacha: '2026-11-30', usta_nom: 'Sinov usta', brigada: '1-brigada', holat: 'qabul', izoh: null,
  versiya: 3, fakt_operation_id: 'x', fakt_holat: null, fakt_akt_id: null, xarajat_id: null, xarajat_summa: null, yaratildi: '2026-11-01',
  qatorlar: [q({ qabul_hajm: 10 }), q({ id: 2, tartib: 2, usta_narx: null, nom: 'Установка окон' })], ...o,
});

describe('naryad hujjati (RasmiyVaraq)', () => {
  it('xlsx bayt va fayl nomi; formulalar jonli; narxsiz izohi', () => {
    const { bytes, faylNomi } = naryadHujjat(naryad(), { obyektNom: 'Sinov obyekt', qisqaTil: 'uz' });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(faylNomi.endsWith('.xlsx')).toBe(true);
    expect(faylNomi).toContain('N-2026-0001');
    // zip (xlsx) imzosi
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
  });
});

describe('Jarvis: naryad vositasi', () => {
  const l: NaryadQisqa[] = [
    { id: 1, obyekt_id: 1, raqam: 'N-2026-0001', usta_nom: 'Usta A', brigada: null, holat: 'qabul', versiya: 2, davr_dan: null, davr_gacha: null, qator_soni: 3, reja_summa: 9000, narxsiz_soni: 0, fakt_holat: null, xarajat_summa: null, yaratildi: '2026-11-01' },
    { id: 2, obyekt_id: 1, raqam: 'N-2026-0002', usta_nom: 'Usta B', brigada: 'B1', holat: 'berildi', versiya: 1, davr_dan: null, davr_gacha: null, qator_soni: 1, reja_summa: null, narxsiz_soni: 1, fakt_holat: null, xarajat_summa: null, yaratildi: '2026-11-02' },
  ];
  it('ro‘yxat, holat filtri, qidiruv, noma’lum', () => {
    expect(naryadMatni(l, null)).toContain('N-2026-0001');
    expect(naryadMatni(l, 'berildi')).not.toContain('N-2026-0001');
    expect(naryadMatni(l, 'usta b')).toContain('kelishilmagan');
    expect(naryadMatni(l, 'qabul')).toContain('fakt yozilmagan');
    expect(naryadMatni(l, 'zzz')).toContain('topilmadi');
    expect(naryadMatni(undefined, null)).toContain('o‘qilmadi');
    expect(naryadMatni([], null)).toContain('naryad yo‘q');
  });
});
