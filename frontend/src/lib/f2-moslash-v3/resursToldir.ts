/**
 * F2 akt qatorlariga ish (BL) kirsa, uning resurslari (RS/MAT/OB, ota_id = BL) ham kirishi SHART.
 *
 * Xato (2026-11-18, prod audit): qo'shimcha/zamena ish (BL) F2 ga tushgan, lekin uning resurs-bolalari tushmagan edi:
 * yangi bola qatorlar serverda yaratilgan, ammo F2 resurs qatorlariga qaytib bog'lanmagan, shuning uchun ish narxsiz
 * chiqib, resurs puli F2 jamiga kirmagan. Server tomoni `_t2_f2_resurs_tushgan_v1` bilan yuborishni to'sadi;
 * bu modul esa yozishdan OLDIN (klientda) shu teshikni yopadi:
 *  1. yangi (qo'shimcha/zamena) BL ning akt qatorida yo'q bolalari avtomatik qo'shiladi:
 *     hajm = bolaning normasi x BL hajmi (norma yo'q bo'lsa - bolaning o'z hajmi), narx = smeta narxi,
 *     rawSnapshot.manba = 'avto_resurs';
 *  2. vaqtinchalik (manfiy) id aktga tushib qolgan bo'lsa yoki hajmini aniqlab bo'lmaydigan bola bo'lsa -
 *     yozish bloklanadi va ro'yxat ko'rsatiladi (jim tashlab yuborilmaydi);
 *  3. boshqa (asl smeta) BL lar uchun faqat ogohlantirish (operator qarori - bolani ongli qoldirgan bo'lishi mumkin).
 */
import type { F2ExactPayloadQatori } from '../../test02/f2-exact-payload';

/** Smeta qatorining kerakli maydonlari (T2Qator ning qismi). */
export interface ToldirSmetaQator {
  id: number; ota_id: number | null; tur: string | null;
  kod?: string | null; nom?: string | null; birlik?: string | null;
  hajm: number | null; narx: number | null; norma?: number | null;
  qoshimcha?: boolean | null; zamena?: boolean | null;
  /** Zamena qatori -> u almashtirgan asl qator id. */
  replaces_line_id?: number | null;
}

export type AvtoResursQator = F2ExactPayloadQatori & { manba: 'avto_resurs'; otaQatorId: number };

export interface ResursToldirNatija {
  /** Akt qatorlariga qo'shiladigan resurslar (avto_resurs). */
  qoshiladi: AvtoResursQator[];
  /** Yozishni to'xtatadigan sabablar (bo'sh bo'lsa - yozish mumkin). */
  bloklovchi: string[];
  /** To'xtatmaydigan eslatmalar (asl smeta ishlari bolalari tushmagan). */
  ogohlantirish: string[];
}

const yaxlit2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const qisqa = (q: ToldirSmetaQator) => `«${`${q.kod ? q.kod + ' ' : ''}${q.nom ?? ''}`.trim().slice(0, 60)}» (#${q.id})`;

/** Ish yangi (F2 importda qo'shimcha/zamena sifatida yaratilgan) mi - bolalari avtomatik to'ldiriladi. */
const yangiIsh = (q: ToldirSmetaQator) => q.qoshimcha === true || q.zamena === true;

export function resursToldir(rows: readonly F2ExactPayloadQatori[], smeta: Iterable<ToldirSmetaQator>): ResursToldirNatija {
  const byId = new Map<number, ToldirSmetaQator>();
  const bolalar = new Map<number, ToldirSmetaQator[]>();
  const almashtirilgan = new Set<number>();
  for (const q of smeta) {
    byId.set(q.id, q);
    if (q.ota_id != null) { const a = bolalar.get(q.ota_id); if (a) a.push(q); else bolalar.set(q.ota_id, [q]); }
    if (q.replaces_line_id != null) almashtirilgan.add(q.replaces_line_id);
  }
  const aktda = new Set(rows.map((r) => r.qatorId));
  const qoshiladi: AvtoResursQator[] = [];
  const bloklovchi: string[] = [];
  const ogohlantirish: string[] = [];

  const manfiy = rows.filter((r) => r.qatorId < 0);
  if (manfiy.length) {
    const nomlar = manfiy.slice(0, 5).map((r) => { const q = byId.get(r.qatorId); return q ? qisqa(q) : `#${r.qatorId}`; });
    bloklovchi.push(`${manfiy.length} ta akt qatori hali serverga yozilmagan (vaqtinchalik id): ${nomlar.join('; ')}${manfiy.length > 5 ? ' ...' : ''}`);
  }

  const kamAsl: ToldirSmetaQator[] = [];
  for (const r of rows) {
    const ish = byId.get(r.qatorId);
    if (!ish || ish.tur !== 'bl' || !r.certifiedQuantity) continue;
    const yetishmaydi = (bolalar.get(ish.id) ?? []).filter((c) => c.tur !== 'bl' && c.tur !== 'rz' && !aktda.has(c.id) && !almashtirilgan.has(c.id) && c.hajm !== 0);
    if (!yetishmaydi.length) continue;
    if (!yangiIsh(ish)) { kamAsl.push(ish); continue; }
    const aniqlanmadi: string[] = [];
    for (const c of yetishmaydi) {
      const norma = c.norma != null && c.norma > 0 ? c.norma : null;
      let hajm: number | null = null;
      if (norma != null) hajm = norma * r.certifiedQuantity;
      else if (c.hajm != null && ish.hajm != null && ish.hajm !== 0) hajm = (c.hajm / ish.hajm) * r.certifiedQuantity;
      else if (c.hajm != null) hajm = c.hajm;
      if (hajm == null || !Number.isFinite(hajm) || hajm === 0) { aniqlanmadi.push(qisqa(c)); continue; }
      hajm = Math.round(hajm * 1e6) / 1e6;
      const narx = c.narx != null && c.narx > 0 ? c.narx : undefined;
      qoshiladi.push({ qatorId: c.id, otaQatorId: ish.id, manba: 'avto_resurs', certifiedQuantity: hajm,
        certifiedUnitPrice: narx, certifiedAmount: narx != null ? yaxlit2(hajm * narx) : undefined, priceIntentionallyAbsent: narx == null });
      aktda.add(c.id);
    }
    if (aniqlanmadi.length) bloklovchi.push(`${qisqa(ish)} ishining ${aniqlanmadi.length} ta resursi uchun hajm aniqlanmadi (norma ham, hajm ham yo'q): ${aniqlanmadi.slice(0, 5).join('; ')}${aniqlanmadi.length > 5 ? ' ...' : ''}`);
  }
  if (kamAsl.length) ogohlantirish.push(`${kamAsl.length} ta smeta ishining resurslari F2 ga tushmagan: ${kamAsl.slice(0, 5).map(qisqa).join('; ')}${kamAsl.length > 5 ? ' ...' : ''}`);
  return { qoshiladi, bloklovchi, ogohlantirish };
}
