import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { bosKiritma, f2Jami, f2KatKesim, f2Qatorlar, f2Qur, type F2Holat, type F2Kiritma } from '../f2-tayyor';
import { f2BolimIerarxiya, f2Uchastkalar } from '../f2-bolim-daraxti';
import { f2AmalTekshir, f2Bolim, f2Kontekst, f2OlinadiganBolimlar, f2Oqi, f2Qidir, f2Tekshir, type F2Malumot, type NarxRuxsat } from './f2-vositalar';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', nom: 'Uchastka A' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е06-001', nom: 'Бетон фундамент', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, nom: 'Бетон B25', hajm: 10.2, kat: 'МАТ', narx: 900_000, norma: 1.02 } as Partial<T2Qator> & { id: number; tur: string }),
  q({ id: 4, tur: 'rs', ota_id: 2, nom: 'Опалубка щитовая', hajm: 2, kat: 'МАТ', norma: 0.2 } as Partial<T2Qator> & { id: number; tur: string }),
  q({ id: 5, tur: 'rz', nom: 'Uchastka B' }),
  q({ id: 6, tur: 'bl', ota_id: 5, kod: 'Е08-002', nom: 'Кладка кирпича', hajm: 100 }),
  q({ id: 7, tur: 'rs', ota_id: 6, nom: 'Кирпич', hajm: 40, kat: 'МАТ', narx: 1500, norma: 0.4 } as Partial<T2Qator> & { id: number; tur: string }),
];
const holat: F2Holat[] = [
  { qator_id: 2, f2_mumkin_hajm: 6, smeta_hajm: 10, f2_hajm: 2 }, { qator_id: 3, f2_mumkin_hajm: 6.12 }, { qator_id: 4, f2_mumkin_hajm: 1.2 },
  { qator_id: 6, f2_mumkin_hajm: 30, smeta_hajm: 100 }, { qator_id: 7, f2_mumkin_hajm: 12 },
];
const qur = (k: F2Kiritma): F2Malumot => {
  const bolimlar = f2Qur(rows, holat);
  const ier = f2BolimIerarxiya(rows, bolimlar);
  const qatorBolim = new Map<number, number | null>(); for (const b of bolimlar) for (const i of b.ishlar) qatorBolim.set(i.id, b.id);
  const qatorlar = f2Qatorlar(bolimlar, k);
  return { obyektNomi: 'Maktab', oy: '2026-10-01', manba: 'fakt', ndsFoiz: 12, bolimlar, ier, qatorBolim, qatorlar, jami: f2Jami(qatorlar), katKesim: f2KatKesim(qatorlar),
    uchastkalar: f2Uchastkalar(qatorlar, ier, qatorBolim), k, ustamali: (kk) => ({ ustamali: Object.values(kk.summalar).reduce((s, v) => s + (v ?? 0), 0) * 1.25, taxminiy: false }) };
};

describe('F2 AI vositalari — sahifa hisobidan, to‘qimasdan', () => {
  it('kontekst: uchastkalar [U..] bilan mumkin pozitsiya va summa', () => {
    const k = f2Kontekst(qur(bosKiritma()));
    expect(k).toMatch(/\[U1\] Uchastka A: F2 ga olinadigan/); expect(k).toMatch(/\[U5\] Uchastka B/);
    expect(k).toContain('Hajm manbai: fakt qoldig‘i');
  });
  it('qidir: lotin so‘z, mumkin hajm va taklif narx manbasi', () => {
    const r = f2Qidir(qur(bosKiritma()), 'beton');
    expect(r).toContain('[#2] ISH Е06-001'); expect(r).toContain('F2 ga mumkin 6');
    expect(r).toMatch(/\[#3\] RES\(avto\).*taklif narx 900[\s ]000 \(smeta\)/);
    const o = f2Qidir(qur(bosKiritma()), 'opalubka');
    expect(o).toContain('[#4] RES(avto)'); expect(o).toContain('taklif narx YO‘Q');
  });
  it('tekshir: narx yo‘q xatosi, uchastka aralashuvi, summa ustamasiz+ustamali va NDS oxirida', () => {
    const k = bosKiritma(); k.hajm[2] = '6'; k.hajm[6] = '30';
    const r = f2Tekshir(qur(k));
    expect(r).toContain('UCHASTKA ARALASHUVI'); expect(r).toMatch(/Xatolar[^\n]*\(1\):\n- \[#4\]/);
    expect(r).toMatch(/ustamasiz [\d\s ]+,?\d* so‘m; ustamali/); expect(r).toContain('NDS 12% faqat oxirida');
  });
  it('bolim: uchastka avlodlari', () => {
    expect(f2Bolim(qur(bosKiritma()), 'U5')).toContain('[#6] ISH');
    expect(f2Bolim(qur(bosKiritma()), 'U5')).not.toContain('[#2]');
    expect(f2Bolim(qur(bosKiritma()), 'U999')).toContain('topilmadi');
  });
  it('narx: faqat narx vositasi ko‘rsatgan qiymat bajariladi; to‘qilgan narx rad', async () => {
    const m = qur(bosKiritma()); const nr: NarxRuxsat = new Map();
    expect(f2AmalTekshir(m, { tur: 'narx', qator: 4, qiymat: '12345', izoh: '' }, nr)).toMatch(/bazadagi/);
    const r = await f2Oqi(m, { vosita: 'narx', arg: '4' }, nr, { narxManbalari: async () => [{ narx: 85000, manba: 'shu obyekt smetasi' }, { narx: 90000, manba: 'narx katalogi' }] });
    expect(r).toContain('85'); expect(r).toContain('o‘rtacha');
    expect(f2AmalTekshir(m, { tur: 'narx', qator: 4, qiymat: '85000', izoh: '' }, nr)).toBeNull();
    expect(f2AmalTekshir(m, { tur: 'narx', qator: 4, qiymat: '86000', izoh: '' }, nr)).toMatch(/bazadagi/);
    expect(f2AmalTekshir(m, { tur: 'narx', qator: 4, qiymat: 'narxsiz', izoh: '' }, nr)).toBeNull();
    expect(f2AmalTekshir(m, { tur: 'narx', qator: 2, qiymat: '1', izoh: '' }, nr)).toMatch(/Ish qatorida/);
    const yoq = await f2Oqi(m, { vosita: 'narx', arg: '4' }, new Map(), {});
    expect(yoq).toContain('topilmadi');
  });
  it('hajm va faktdan olish tekshiruvi; uchastka bo‘limlari', () => {
    const m = qur(bosKiritma()); const nr: NarxRuxsat = new Map();
    expect(f2AmalTekshir(m, { tur: 'f2_hajm', qator: 3, qiymat: '1', izoh: '' }, nr)).toMatch(/Avtomatik/);
    expect(f2AmalTekshir(m, { tur: 'f2_hajm', qator: 2, qiymat: '0', izoh: '' }, nr)).toMatch(/musbat/);
    expect(f2AmalTekshir(m, { tur: 'f2_hajm', qator: 2, qiymat: '6', izoh: '' }, nr)).toBeNull();
    expect(f2AmalTekshir(m, { tur: 'f2_hajm', qator: 777, qiymat: '6', izoh: '' }, nr)).toMatch(/topilmadi/);
    expect(f2AmalTekshir(m, { tur: 'faktdan_ol', qator: null, qiymat: 'U5', izoh: '' }, nr)).toBeNull();
    expect(f2AmalTekshir(m, { tur: 'faktdan_ol', qator: null, qiymat: 'U77', izoh: '' }, nr)).toMatch(/topilmadi/);
    expect(f2OlinadiganBolimlar(m, 5).map((b) => b.id)).toEqual([5]);
    expect(f2OlinadiganBolimlar(m, null)).toHaveLength(2);
  });
});
