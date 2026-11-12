import { describe, expect, it } from 'vitest';
import type { Naryad, NaryadQator } from '../naryad';
import { bajarildiYuk, bajardimMumkin, ochiqNaryadQatorlari, ustaJarvisMatni, ustaNaryadSatrlari } from './naryad-ish';

const qator = (ustiga: Partial<NaryadQator> = {}): NaryadQator => ({
  id: 11, qator_id: 301, tartib: 1, kod: '1.1', nom: 'Устройство стяжки', birlik: '100 м2', hajm: 500, norma_chel_soat: null, smeta_mehnat_birlik: null, usta_narx: null,
  kat: 'ЧЕЛ', usta_birlik: '100 м2', koef: 100, usta_narx_birlik: 250000, smeta_kat_birlik: null, bajarilgan_hajm: null, qabul_hajm: null, fakt_boshida: null, fakt_delta: null, fakt_yozilgan: null, ...ustiga,
});
const naryad = (holat: Naryad['holat'], qatorlar: NaryadQator[] = [qator()], ustiga: Partial<Naryad> = {}): Naryad => ({
  id: 5, obyekt_id: 9, raqam: 'N-1', davr_dan: null, davr_gacha: null, usta_nom: 'Usta', brigada: null, holat, izoh: null, versiya: 3,
  fakt_operation_id: 'x', fakt_holat: null, fakt_akt_id: null, xarajat_id: null, xarajat_summa: null, yaratildi: '', qatorlar, ...ustiga,
});

describe('usta naryad satrlari (o‘z birligida)', () => {
  it('hajm va narx USTA birligida: 500 (smeta) / koef 100 = 5 birlik; narx 1 usta birligiga; qoldi = hammasi', () => {
    const [s] = ustaNaryadSatrlari([naryad('berildi')]);
    expect(s).toMatchObject({ hajm: 5, qolgan: 5, narxBirlik: 250000, holat: 'berildi', qatorId: 301, koef: 100 });
    expect(s.birlik).not.toMatch(/м2|m2/); // lug'at: «100 kvadrat» kabi odam tili
  });
  it('kelishilmagan narx — null (0 emas)', () => {
    const [s] = ustaNaryadSatrlari([naryad('berildi', [qator({ usta_narx_birlik: null })])]);
    expect(s.narxBirlik).toBeNull();
  });
  it('holatlar oddiy so‘zlarda: bajarildi → yuborildi; qabul kam bo‘lsa kamQabul; hisoblandi — server summasi', () => {
    const y = ustaNaryadSatrlari([naryad('bajarildi', [qator({ bajarilgan_hajm: 400 })])])[0];
    expect(y).toMatchObject({ holat: 'yuborildi', bajarilgan: 4, qolgan: 1 });
    const q = ustaNaryadSatrlari([naryad('qabul', [qator({ bajarilgan_hajm: 400, qabul_hajm: 300 })], { izoh: 'bir qismi qiyshiq' })])[0];
    expect(q).toMatchObject({ holat: 'qabul', qabul: 3, kamQabul: true, izoh: 'bir qismi qiyshiq' });
    const h = ustaNaryadSatrlari([naryad('hisoblandi', [qator({ bajarilgan_hajm: 500, qabul_hajm: 500 })], { xarajat_summa: 1250000 })])[0];
    expect(h).toMatchObject({ holat: 'hisoblandi', kamQabul: false, summa: 1250000 });
  });
  it('bekor qilingan naryad ko‘rsatilmaydi', () => { expect(ustaNaryadSatrlari([naryad('bekor')])).toEqual([]); });
});

describe('ikki marta kiritmaslik qoidasi', () => {
  it('ochiq (berildi/yuborildi) naryad qatorlari to‘plamda; qabul/hisoblandi — yo‘q (fakt delta allaqachon yozilgan)', () => {
    const satrlar = ustaNaryadSatrlari([naryad('berildi', [qator({ id: 1, qator_id: 301 })]), naryad('bajarildi', [qator({ id: 2, qator_id: 302 })], { id: 6 }), naryad('qabul', [qator({ id: 3, qator_id: 303 })], { id: 7 })]);
    expect([...ochiqNaryadQatorlari(satrlar)].sort()).toEqual([301, 302]);
    expect(satrlar.filter(bajardimMumkin)).toHaveLength(2);
  });
});

describe('bajarildi yuki', () => {
  it('usta birligidagi hajm smeta birligiga o‘tadi (× koef); boshqa satrning avvalgi qiymati saqlanadi', () => {
    const satrlar = ustaNaryadSatrlari([naryad('berildi', [qator({ id: 1 }), qator({ id: 2, qator_id: 302, bajarilgan_hajm: 200 }), qator({ id: 3, qator_id: 303 })])]);
    expect(bajarildiYuk(satrlar, 1, 4.5)).toEqual([{ id: 1, bajarilgan_hajm: 450 }, { id: 2, bajarilgan_hajm: 200 }]);
  });
});

describe('Jarvis matni', () => {
  it('ishlar, holat, kelishilgan narx va oy daromadi (HR manbasidan kelgan son) — to‘qilmaydi', () => {
    const m = ustaJarvisMatni(ustaNaryadSatrlari([naryad('berildi')]), 1500000);
    expect(m).toContain('Naryadlarim: 1');
    expect(m).toContain('qoldi 5');
    expect(m).toMatch(/250\s?000/);
    expect(m).toMatch(/1\s?500\s?000/);
    expect(ustaJarvisMatni([], null)).toContain('—');
  });
});
