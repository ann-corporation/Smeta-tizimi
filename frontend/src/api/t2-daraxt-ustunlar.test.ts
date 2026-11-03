/**
 * P7 — katta obyekt (27 000 qator) birinchi ochilishi: daraxt yo'li faqat
 * kerakli ustunlarni so'raydi. Bu test (1) ustunlar prod sxemasida borligini
 * (information_schema, 2026-09-25 o'qilgan ro'yxat) va (2) javob hajmi
 * kamayishini sintetik 27 000 qatorda o'lchaydi.
 */
import { describe, expect, it } from 'vitest';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI } from './t2-daraxt-ustunlar';

const PROD_DARAXT = 'id,obyekt_id,obyekt,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,kat,summa,narx_usul,qoshimcha,zamena,d1,d2,d3,manba_id,xom_qator,yangilandi,kompaniya_id,versiya,raqam,norma'.split(',');
const PROD_HOLAT = 'id,qator_id,obyekt_id,tur,raqam,kod,nom,birlik,kat,smeta_hajm,smeta_narx,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa,qoldiq_hajm,qoldiq_summa,f2_mumkin_hajm,f2_mumkin_summa,f2_narx,fakt_narx,f2_narx_farq_foiz,ota_id,norma,direct_fakt_hajm,direct_fakt_summa,fakt_manbasi,f2_summa_nomalum,almashtirilgan_hajm,almashtirilgan_summa,versiya_holat,asl_smeta_hajm,asl_smeta_summa,f2_summa_yoq'.split(',');

function qator(i: number, ustunlar: readonly string[]): Record<string, unknown> {
  const q: Record<string, unknown> = {
    id: 1_000_000 + i, qator_id: 1_000_000 + i, obyekt_id: 91, obyekt: 'Suniy Ko‘l 2 — STR', ota_id: 1_000_000 + i - 3, daraja: 2, tartib: i,
    tur: 'rs', kod: '1-100-20', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ СРЕДНИЙ РАЗРЯД 3,8', birlik: 'чел.-ч', hajm: 12.345, narx: 24517.7, kat: 'ЧЕЛ',
    summa: 302671.5, narx_usul: 'SMETA', qoshimcha: false, zamena: false, d1: 'РАЗДЕЛ 1', d2: 'КМ-1', d3: null, manba_id: 7, xom_qator: i + 12,
    yangilandi: '2026-09-24T19:26:43.123456+00:00', kompaniya_id: 3, versiya: 1, raqam: '1.1', norma: 0.095,
    smeta_hajm: 12.345, smeta_narx: 24517.7, smeta_summa: 302671.5, fakt_hajm: 4.2, fakt_summa: 102974.34, f2_hajm: 2, f2_summa: 49035.4,
    qoldiq_hajm: 10.345, qoldiq_summa: 253636.1, f2_mumkin_hajm: 2.2, f2_mumkin_summa: 53938.94, f2_narx: 24517.7, fakt_narx: 24517.7,
    f2_narx_farq_foiz: 0, direct_fakt_hajm: 4.2, direct_fakt_summa: 102974.34, fakt_manbasi: 'direct',
  };
  return Object.fromEntries(ustunlar.map((u) => [u, q[u] ?? null]));
}

const hajm = (ustunlar: readonly string[], n = 27_000) => JSON.stringify(Array.from({ length: n }, (_, i) => qator(i, ustunlar))).length;

describe('P7 — daraxt yo‘li ustunlari', () => {
  it('so‘raladigan har bir ustun prod view ida mavjud (PostgREST 400 bermaydi)', () => {
    for (const u of T2_DARAXT_USTUNLARI.split(',')) expect(PROD_DARAXT).toContain(u);
    for (const u of T2_HOLAT_DARAXT_USTUNLARI.split(',')) expect(PROD_HOLAT).toContain(u);
  });

  it('27 000 qatorda javob hajmi o‘lchovi: oldin (*) va keyin', () => {
    const d0 = hajm(PROD_DARAXT), d1 = hajm(T2_DARAXT_USTUNLARI.split(','));
    const h0 = hajm(PROD_HOLAT), h1 = hajm(T2_HOLAT_DARAXT_USTUNLARI.split(','));
    const mb = (b: number) => (b / 1024 / 1024).toFixed(2);
    // Hisobot uchun: o'lchangan raqamlar test chiqishida.
    console.info(`[P7] t2_daraxt: ${mb(d0)} MB → ${mb(d1)} MB (−${Math.round((1 - d1 / d0) * 100)}%); t2_qator_holat: ${mb(h0)} MB → ${mb(h1)} MB (−${Math.round((1 - h1 / h0) * 100)}%)`);
    expect(d1).toBeLessThan(d0 * 0.85);
    expect(h1).toBeLessThan(h0 * 0.75);
  });
});
