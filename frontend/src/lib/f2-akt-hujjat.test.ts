import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { f2AktKirish } from './f2-akt-hujjat';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk } from './f2-tayyor';
import type { F2Tafsilot } from '../api/t2-narx';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS } from './f2-hujjat.fixture';

/** F2 tayyorlashdagi akt 246 → serverga ketadigan yuk → F2 tarixidagi tafsilot qatorlari (saqlangan holat). */
function saqlanganAkt(): { lines: F2Tafsilot[]; asl: number | null } {
  const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
  const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
  const asl = f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1' }).jami;
  const row = new Map(AKT246_ROWS.map((r) => [r.id, r]));
  const lines = f2Yuk(q, '1').map((p, i) => {
    const r = row.get(p.qatorId)!;
    return {
      akt_id: 246, obyekt_id: 79, kompaniya_id: 17, tur: 'f2', oy: '2026-10-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-10-02',
      akt_qator_id: 1000 + i, qator_id: p.qatorId, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur,
      hajm: p.certifiedQuantity ?? 0, narx: p.certifiedUnitPrice ?? null, summa: p.certifiedAmount ?? null, izoh: null,
      certified_quantity: p.certifiedQuantity ?? null, certified_unit_price: p.certifiedUnitPrice ?? null, certified_amount: p.certifiedAmount ?? null,
    } as F2Tafsilot;
  });
  return { lines, asl };
}

describe('F2 tarixi → yangi Ф-2 shabloni', () => {
  it('tasdiqlangan akt 246 aynan o‘sha jami bilan chiqadi: 150 026 606,32', () => {
    const { lines, asl } = saqlanganAkt();
    expect(asl).toBe(150026606.32);
    const k = f2AktKirish(AKT246_ROWS, lines);
    expect(k.topilmagan).toBe(0);
    const h = f2Hujjat(k.bolimlar, k.qatorlar, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1' });
    expect(h.jami).toBe(150026606.32);
    expect(h.faylNomi).toContain('Ф-2');
  });

  it('muzlatilgan resurs hajmi (norma × ishdan farqli) formulaga bog‘lanmaydi — qiymat yoziladi', () => {
    const { lines } = saqlanganAkt();
    const ishchi = lines.find((l) => l.qator_id === 678864)!; // ЗАТРАТЫ ТРУДА, norma 45.2 × 67.4
    ishchi.certified_quantity = 3000; ishchi.certified_amount = Math.round(3000 * 29421 * 100) / 100;
    const k = f2AktKirish(AKT246_ROWS, lines);
    expect(k.qatorlar.find((q) => q.id === 678864)?.ogoh).toBe('RESURS_CHEGARA');
    expect(k.qatorlar.find((q) => q.id === 678865)?.ogoh).toBeUndefined();
    const h = f2Hujjat(k.bolimlar, k.qatorlar, { obyektNom: 'X', davr: '2026-10', raqam: '1' });
    const xml = strFromU8(unzipSync(h.bytes)['xl/worksheets/sheet1.xml']);
    expect(xml).toMatch(/<c r="F\d+"[^>]*><v>3000<\/v><\/c>/);
  });

  it('sertifikatlangan summa (hajm × narx dan farqli) saqlanadi', () => {
    const { lines } = saqlanganAkt();
    const l = lines.find((x) => x.qator_id === 601801)!; // mat, 9.2 × 175000
    l.certified_amount = 1600000;
    const k = f2AktKirish(AKT246_ROWS, lines);
    const h = f2Hujjat(k.bolimlar, k.qatorlar, { obyektNom: 'X', davr: '2026-10', raqam: '1' });
    expect(h.jami).toBe(Math.round((150026606.32 - 9.2 * 175000 + 1600000) * 100) / 100);
  });

  it('smetadan o‘chirilgan qator sanaladi (hujjatga kirmaydi, ogohlantirish uchun)', () => {
    const { lines } = saqlanganAkt();
    const k = f2AktKirish(AKT246_ROWS, [...lines, { ...lines[0], qator_id: 999999, akt_qator_id: 1 }]);
    expect(k.topilmagan).toBe(1);
  });

  // Egasi (2026-10-02): tasdiqlangan F2 — faqat qiymatlar, formulasiz; ongli narxsiz (машинисты) ИТОГО ni bo'shatmaydi.
  it('formulasiz: bitta ham <f> yo‘q, jami o‘zgarmaydi; narxsiz resurs «—», ИТОГО bor', () => {
    const { lines } = saqlanganAkt();
    const l = lines.find((x) => x.qator_id === 678865)!;
    const ayirma = Number(l.certified_amount);
    l.certified_unit_price = null; l.certified_amount = null; l.narx = null; l.summa = null;
    const k = f2AktKirish(AKT246_ROWS, lines);
    const h = f2Hujjat(k.bolimlar, k.qatorlar, { obyektNom: 'X', davr: '2026-10', raqam: '1', formulasiz: true });
    const kut = Math.round((150026606.32 - ayirma) * 100) / 100;
    expect(h.jami).toBe(kut);
    const z = unzipSync(h.bytes);
    for (const f of Object.keys(z).filter((x) => x.startsWith('xl/worksheets/'))) expect(strFromU8(z[f])).not.toContain('<f>');
    const xml = strFromU8(z['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('<t xml:space="preserve">—</t>');
    expect(xml).toContain(`<v>${kut}</v>`);
  });
});
