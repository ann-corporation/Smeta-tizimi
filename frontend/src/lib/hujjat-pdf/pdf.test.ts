import { describe, expect, it } from 'vitest';
import { f2Hujjat } from '../f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur } from '../f2-tayyor';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS, NAMUNA_NAKRUTKA } from '../f2-hujjat.fixture';
import { hujjatKorinishi } from '../hujjat-yozuvchi/korinish';
import { korinishdanPdf, varaqBolinishi } from './pdf';

const yasa = () => {
  const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
  const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
  return f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10-01', raqam: '1', ndsFoiz: 12, nakrutka: NAMUNA_NAKRUTKA });
};

describe('hujjat-pdf: Excel dan PDF (yagona dvigatel)', () => {
  it('F-2 xlsx → korinish → PDF: yaroqli A4 PDF, kirill matn shriftga joylangan, sahifa raqami bor', async () => {
    const h = yasa();
    const v = hujjatKorinishi(h.bytes);
    expect(v.length).toBeGreaterThan(0);
    const pdf = await korinishdanPdf(v, { faylNomi: h.faylNomi });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
    // Shrift (kirill) ichiga joylangan — Identity-H TrueType.
    const matn = new TextDecoder('latin1').decode(pdf);
    expect(matn).toMatch(/\/Type\s*\/Page\b/);
    expect(matn).toMatch(/LiberationSans/);
  });

  it('QURAI kolontituli: har sahifada logo va tekshirish QR i (rasm obyektlari) bor', async () => {
    const h = yasa();
    const pdf = await korinishdanPdf(hujjatKorinishi(h.bytes), { faylNomi: h.faylNomi, kod: 'ABCDE-12345' });
    const rasmlar = new TextDecoder('latin1').decode(pdf).match(/\/Subtype\s*\/Image/g) ?? [];
    expect(rasmlar.length).toBeGreaterThanOrEqual(2); // logo + QR (sahifalar bo'yicha qayta ishlatiladi)
  });

  it('sarlavha, ustun sarlavhasi va tana to\'g\'ri bo\'linadi; tana qatorlari Excel bilan bir xil sonda', () => {
    const v = hujjatKorinishi(yasa().bytes)[0];
    const { titul, bosh, tana } = varaqBolinishi(v);
    expect(v.raqamQatori).not.toBeNull();
    expect(bosh.length).toBeGreaterThan(0);
    expect(bosh[bosh.length - 1].r).toBe(v.raqamQatori);
    expect(tana.length).toBe(v.qatorlar.filter((q) => q.r > v.raqamQatori! && q.turi !== 'bosh').length);
    expect(titul.every((q) => q.r < bosh[0].r)).toBe(true);
  });

  it('korinish kataklarida kursiv va qalin shrift belgilari bor (RS kursiv, BL qalin)', () => {
    const k = hujjatKorinishi(yasa().bytes)[0].qatorlar.flatMap((q) => q.kataklar);
    expect(k.some((x) => x.qalin)).toBe(true);
    expect(k.some((x) => x.kursiv)).toBe(true);
  });
});
