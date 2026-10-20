/**
 * Kalit oralig'i bo'yicha parallel sahifalash (egasi 2026-10-20: «tezlik»).
 *
 * OFFSET sahifalari moliyaviy view'larda (t2_qator_holat, t2_daraxt) har sahifada o'tkazib yuborilgan barcha
 * qatorlarni ham hisoblaydi: 25 000 qatorlik obyektda 20-sahifa 20 000 qatorni hisoblab, 1000 tasini beradi.
 * Kalit (id / qator_id) o'sish tartibida bo'lsa, qolgan qismni kalit ORALIQLARIGA bo'lamiz: har so'rov faqat o'z
 * qatorlarini indeks bo'yicha o'qiydi. Natija — o'sish tartibidagi uzluksiz PREFIKS: biror oraliq to'liq
 * olinmasa, undan keyingilar tashlanadi va `toliq:false` qaytadi (chaqiruvchi `kalit=gt.oxirgi` bilan davom etadi).
 */
export type Oraliq = {
  /** Shu kalitdan KATTA qatorlar so'raladi (keyingi so'rovda oxirgi olingan kalit). */
  kursor: number;
  /** Shu kalitgacha (shu jumladan). */
  yuqori: number;
  qatorlar: unknown[];
  tugadi: boolean;
};

export type OraliqReja = { oraliqlar: Oraliq[]; /** Byudjet yetmay qolgan dum bor — natija prefiks bo'ladi. */ dumQoldi: boolean };

/**
 * (oxirgi, maks] ni zichlik bo'yicha ~`sahifa`·0.9 qatorlik oraliqlarga bo'ladi.
 * Byudjet yetmasa — boshidan `byudjet − 2` oraliq (2 tasi to'lib qolgan oraliqlarni davom ettirish uchun zaxira).
 */
export function oraliqlarniRejala(oxirgi: number, maks: number, qolgan: number, sahifa: number, byudjet: number): OraliqReja {
  const span = maks - oxirgi;
  if (!(span > 0) || !(qolgan > 0) || !(sahifa > 0) || !(byudjet > 0)) return { oraliqlar: [], dumQoldi: false };
  const zichlik = Math.min(1, qolgan / span);
  const kenglik = Math.max(1, Math.floor((sahifa * 0.9) / zichlik));
  const kerakli = Math.ceil(span / kenglik);
  const n = kerakli <= byudjet ? kerakli : Math.max(1, byudjet - 2);
  const oraliqlar: Oraliq[] = [];
  for (let i = 0; i < n; i++) {
    const quyi = oxirgi + i * kenglik;
    oraliqlar.push({ kursor: quyi, yuqori: Math.min(quyi + kenglik, maks), qatorlar: [], tugadi: false });
  }
  return { oraliqlar, dumQoldi: n < kerakli };
}

/** Bitta oraliq javobini qo'shadi. Kalit tartibi buzilgan yoki oraliqdan tashqari qator — xato (null). */
export function oraliqgaQosh(o: Oraliq, bolak: unknown[], kalit: string, sahifa: number): true | null {
  let oldingi = o.kursor;
  for (const r of bolak) {
    const k = Number((r as Record<string, unknown>)?.[kalit]);
    if (!Number.isSafeInteger(k) || k <= oldingi || k > o.yuqori) return null;
    oldingi = k;
  }
  o.qatorlar.push(...bolak);
  o.kursor = oldingi;
  o.tugadi = bolak.length < sahifa || oldingi >= o.yuqori;
  return true;
}

/** Oraliqlarni tartib bilan birlashtiradi; birinchi tugamagan oraliqda to'xtaydi (uzluksiz prefiks). */
export function prefiksYigi(reja: OraliqReja): { qatorlar: unknown[]; toliq: boolean } {
  const qatorlar: unknown[] = [];
  for (const o of reja.oraliqlar) {
    qatorlar.push(...o.qatorlar);
    if (!o.tugadi) return { qatorlar, toliq: false };
  }
  return { qatorlar, toliq: !reja.dumQoldi };
}
