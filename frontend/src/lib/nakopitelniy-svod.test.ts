import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  f3SotuvdanHisobla, joriyShartnomaSummasi, qqsAjrat, shartnomaSvodi, svodJami, sverkaHisobla, sverkaMatniniOqi, tiyin,
  type SvodF3, type SvodShartnoma,
} from './nakopitelniy-svod';
import { shartnomaSvodXlsx, sverkaXlsx } from './nakopitelniy-vedomost-export';
import { forma3SotuvdanXlsx } from './forma3-export';

const f3 = (id: number, sana: string, summa: number, raqam: string, holat: SvodF3['holat'] = 'qoralama', davr?: [string, string]): SvodF3 => ({
  id, manba: 'sotuv', raqam, sotuv_sana: sana, sotuv_summa: summa, nds_foiz: 12,
  davr_boshi: davr?.[0] ?? sana, davr_oxiri: davr?.[1] ?? sana, holat, bajarilgan_f2_summa: null, izoh: null, versiya: 1,
});

/** Sun'iy misol (real loyiha raqamlari EMAS). */
function misol(): SvodShartnoma {
  return {
    id: 1, loyiha_id: 1, raqam: 'T-1', nom: 'Sinov obyekti', asosiy: true, holat: 'faol', jami_nds_bilan: 1_000_000,
    obyektlar: [{ id: 10, nom: 'Obyekt A' }],
    ds: [
      { id: 2, raqam: '2', sana: '2026-03-01', jami_nds_bilan: 1_500_000, izoh: null, versiya: 1 },
      { id: 1, raqam: '1', sana: '2026-02-01', jami_nds_bilan: 1_200_000, izoh: null, versiya: 1 },
    ],
    f2: [
      { akt_id: 501, obyekt_id: 10, oy: '2026-01-01', raqam: 'F2-1', hujjat_jami: 400_000.10 },
      { akt_id: 502, obyekt_id: 10, oy: '2026-01-01', raqam: 'F2-2', hujjat_jami: 200_000.20 },
      { akt_id: 503, obyekt_id: 10, oy: '2026-02-01', raqam: 'F2-3', hujjat_jami: null },
    ],
    f3: [
      f3(11, '2025-12-20', 300_000.01, '1', 'imzolangan'),
      f3(12, '2026-02-10', 1_120_000, '1'),
      f3(13, '2026-02-10', 0.99, '2', 'tayyor', ['2026-02-01', '2026-02-09']),
      { id: 14, manba: 'f2', raqam: 'F2-asosida', sotuv_sana: null, sotuv_summa: null, nds_foiz: null, davr_boshi: '2026-01-01', davr_oxiri: '2026-01-31', holat: 'qoralama', bajarilgan_f2_summa: 5, izoh: null, versiya: 1 },
    ],
    tolovlar: [
      { id: 21, sana: '2025-12-01', summa: 500_000, tur: 'avans', izoh: null },
      { id: 22, sana: '2026-02-10', summa: 700_000.5, tur: 'tolov', izoh: null },
      { id: 23, sana: '2026-02-15', summa: 100_000, tur: 'qaytarim', izoh: null },
    ],
  };
}

describe('nakopitelniy — shartnoma svodi', () => {
  it('tiyin aniqligi', () => {
    expect(tiyin(0.1 + 0.2)).toBe(30);
    expect(tiyin(1.005)).toBe(101);
    expect(tiyin(-2.345)).toBe(-235);
    expect(tiyin(null)).toBe(0);
  });

  it('joriy shartnoma summasi — oxirgi DS (sanaga qadar), yo‘q bo‘lsa shartnoma, noma’lum — null', () => {
    const sh = misol();
    expect(joriyShartnomaSummasi(sh).summa).toBe(1_500_000);
    expect(joriyShartnomaSummasi(sh, '2026-02-15').summa).toBe(1_200_000);
    expect(joriyShartnomaSummasi(sh, '2026-01-15')).toMatchObject({ summa: 1_000_000, manba: 'shartnoma' });
    expect(joriyShartnomaSummasi({ ds: [], jami_nds_bilan: null })).toMatchObject({ summa: null, manba: 'nomalum' });
  });

  it('svod: F3 faqat sotuvdan (F2 asosidagi F3 pulga kirmaydi), to‘lov (qaytarim ayriladi), qoldiq; F2 — alohida daraja', () => {
    const s = shartnomaSvodi(misol());
    expect(s.f3).toBe(142_000_100);
    expect(s.tolov).toBe(110_000_050);
    expect(s.qoldiq).toBe(32_000_050);
    expect(s.f2).toBe(60_000_030);
    expect(s.f2SummasizSoni).toBe(1);
    expect(s.f3Soni).toBe(3);
    expect(s.f3F2danSoni).toBe(1);
    expect(s.f3Imzolangan).toBe(1);
    expect(s.f3Oshish).toBe(142_000_100 - 150_000_000);
    expect(s.f3Foiz).toBe(94.67);
    expect(s.f2Oylar).toEqual([
      { oy: '2026-01', soni: 2, summa: 60_000_030, nakopitel: 60_000_030 },
      { oy: '2026-02', soni: 1, summa: 0, nakopitel: 60_000_030 },
    ]);
    const kodlar = s.ogohlantirishlar.map((g) => g.kod);
    expect(kodlar).toEqual(expect.arrayContaining(['F2_SUMMASIZ', 'F3_IMZOLANMAGAN']));
    expect(kodlar).not.toContain('F3_SHARTNOMADAN_OSHDI');
    expect(kodlar).not.toContain('AVANS_ISHLANMAGAN');
  });

  it('shartnoma summasi noma’lum — oshish hisoblanmaydi (NULL ≠ 0)', () => {
    const s = shartnomaSvodi({ ...misol(), ds: [], jami_nds_bilan: null });
    expect(s.f3Oshish).toBeNull();
    expect(s.f3Foiz).toBeNull();
    expect(s.ogohlantirishlar.map((g) => g.kod)).toContain('SHARTNOMA_SUMMASI_YOQ');
  });

  it('jami — shartnomalar yig‘indisi', () => {
    const a = shartnomaSvodi(misol());
    const j = svodJami([a, a]);
    expect(j.f3).toBe(2 * a.f3);
    expect(j.qoldiq).toBe(2 * a.qoldiq);
  });
});

describe('akt-sverka', () => {
  it('boshlang‘ich + debet − kredit = yakuniy; bir kunda avval sotuv, keyin to‘lov', () => {
    const s = sverkaHisobla(misol());
    expect(s.boshlangich).toBe(0);
    expect(s.qatorlar.map((q) => q.tur)).toEqual(['avans', 'sotuv', 'sotuv', 'sotuv', 'tolov', 'qaytarim']);
    expect(s.yakuniy).toBe(32_000_050);
    expect(s.tenglik).toBe(true);
    expect(s.qatorlar[s.qatorlar.length - 1].kredit).toBe(-10_000_000);
  });

  it('davr bo‘yicha: boshlang‘ich qoldiq — davrdan oldingi hamma harakat', () => {
    const s = sverkaHisobla(misol(), { dan: '2026-01-01', gacha: '2026-02-10' });
    expect(s.boshlangich).toBe(30_000_001 - 50_000_000);
    expect(s.qatorlar).toHaveLength(3);
    expect(s.yakuniy).toBe(s.boshlangich + 112_000_099 - 70_000_050);
    expect(s.tenglik).toBe(true);
  });

  it('akt-sverka matnini o‘qish (nusxa-joylash)', () => {
    const r = sverkaMatniniOqi([
      'Дата\tДокумент\tДебет\tКредит',
      'Сальдо начальное\t\t\t',
      '13.06.2025\tПродажа (1 от 13.06.2025)\t7 938 868,00\t',
      '15.06.2025\tОплата (15 от 15.06.2025)\t\t4 597 800,50',
      '16.06.2025\tВозврат (3 от 16.06.2025)\t\t1 000',
      '17.06.2025\tКорректировка\t1\t',
      'Обороты за период\t7 938 868,00\t4 597 800,50',
    ].join('\n'));
    expect(r.qatorlar).toEqual([
      { sana: '2025-06-13', tur: 'sotuv', raqam: '1', summa: 7_938_868 },
      { sana: '2025-06-15', tur: 'tolov', raqam: '15', summa: 4_597_800.5 },
      { sana: '2025-06-16', tur: 'qaytarim', raqam: '3', summa: 1000 },
    ]);
    expect(r.xatolar).toHaveLength(1);
  });
});

describe('F3 — sotuv summasidan', () => {
  it('QQS ajratish: QQSsiz + QQS = jami tiyinigacha', () => {
    for (const x of [100, 112, 1, 99_999_999, 793_886_800]) {
      const [siz, qqs, j] = qqsAjrat(x, 12);
      expect(siz + qqs).toBe(j);
      expect(siz).toBe(Math.round(x / 1.12));
    }
  });

  it('davr, yil boshidan va qurilish boshidan (shu F3 kiradi)', () => {
    const h = f3SotuvdanHisobla(misol(), 12)!;
    expect(h.davrBoshi).toBe('2025-12-20');
    expect(h.davrOxiri).toBe('2026-02-10');
    expect(h.davr).toEqual([100_000_000, 12_000_000, 112_000_000]);
    expect(h.yilBoshidan[2]).toBe(112_000_000);
    expect(h.boshidan[2]).toBe(142_000_001);
    expect(h.shartnoma).toBe(120_000_000);
    const h2 = f3SotuvdanHisobla(misol(), 13)!;
    expect([h2.davrBoshi, h2.davrOxiri]).toEqual(['2026-02-01', '2026-02-09']);
    expect(h2.boshidan[2]).toBe(142_000_100);
    expect(f3SotuvdanHisobla(misol(), 14)).toBeNull();
    expect(f3SotuvdanHisobla(misol(), 11)!.davrBoshi).toBe('2025-12-20');
  });
});

describe('Excel eksport (mavjud nakopitelniy va F3 eksportlari ichida)', () => {
  const oqi = (bytes: Uint8Array) => XLSX.read(bytes, { type: 'array' });
  const qiymatlar = (wb: XLSX.WorkBook, n = 0) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[n]], { header: 1, raw: true });

  it('svod: ikki varaq, ИТОГО keshlangan qiymati tiyinigacha', () => {
    const x = shartnomaSvodXlsx([misol()], { sana: '2026-10-23', tashkilot: 'Sinov MChJ' });
    expect(x.faylNomi).toMatch(/НАКОПИТЕЛЬНАЯ_ПО_ДОГОВОРАМ/);
    const wb = oqi(x.bytes);
    expect(wb.SheetNames).toEqual(['Свод по договорам', 'Ф-2 по месяцам']);
    const itogo = qiymatlar(wb).find((r) => r.includes('ИТОГО'))!;
    expect(itogo).toEqual(expect.arrayContaining([1_420_001, 1_100_000.5, 320_000.5, 600_000.3]));
  });

  it('akt-sverka: сальдо конечное = hisob', () => {
    const r = qiymatlar(oqi(sverkaXlsx(misol(), { sana: '2026-10-23' }).bytes)).find((q) => q.includes('Сальдо конечное'))!;
    expect(r).toContain(320_000.5);
  });

  it('F3 sotuvdan: за отчётный период = sotuv summasi', () => {
    const x = forma3SotuvdanXlsx(misol(), 12)!;
    const r = qiymatlar(oqi(x.bytes)).find((q) => q.includes('ВСЕГО с НДС'))!;
    expect(r).toEqual(expect.arrayContaining([1_200_000, 1_420_000.01, 1_120_000]));
    expect(forma3SotuvdanXlsx(misol(), 14)).toBeNull();
  });
});
