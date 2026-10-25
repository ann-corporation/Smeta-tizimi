/**
 * QAMROV % URINISHI (attempt) — o'zgarmas snapshot va bo'lak receipt'lari (Codex QA 2026-10-25, JQA-04 / JQA-08).
 *
 * Muammo: `fakt_yoz_v2` javobi yo'qolsa (timeout/tarmoq) server hujjatni YOZGAN bo'lishi mumkin. Mavjud operation_id
 * bilan qayta yuborilsa server eski aktni qaytaradi (takror), yangi body SOLISHTIRILMAYDI. Shuning uchun:
 *  1) birinchi so'rovdan OLDIN urinish snapshoti muzlatiladi: bo'laklar (qatorlar + hajmlar), har bo'lakka UUID, sana,
 *     izoh, qamrov, foiz — va u modal yopilsa ham yashaydigan joyda saqlanadi (modul reestri + localStorage,
 *     kompaniya/obyekt bo'yicha);
 *  2) har bo'lak uchun receipt: confirmed (akt_id bor) / failed (server aniq rad etdi) / unknown (javob noma'lum);
 *  3) hal bo'lmagan urinish bor ekan YANGI urinish boshlanmaydi: avval xuddi shu snapshot xuddi shu UUID'lar bilan
 *     qayta yuboriladi (server idempotent — ikkinchi hujjat yaratilmaydi), natija aniqlangach tozalanadi;
 *  4) foiz/qamrov o'zgarsa — bu yangi urinish, yangi UUID'lar, lekin faqat eskisi hal bo'lgach.
 * Hech qanday pul/hajm to'qilmaydi; snapshot faqat mijoz buyrug'ining nusxasi.
 */
export type BolakHolat = 'kutmoqda' | 'confirmed' | 'failed' | 'unknown';
export type UrinishBolak = {
  operationId: string;
  qatorlar: readonly { qator_id: number; hajm: number }[];
  izoh: string;
  holat: BolakHolat;
  aktId: number | null;
  xato: string | null;
  /** Har qatorning urinish yaratilgandagi fakti (qatorlar bilan parallel) — keyin «yozilgani jadvalda ko'rinyaptimi» tekshiruvi uchun. */
  asos: readonly number[];
};
export type QamrovUrinish = {
  kalit: string; kompaniyaId: number; obyektId: number; sana: string; sarlavha: string; foiz: number;
  yaratildi: string; bolaklar: readonly UrinishBolak[];
};
export type UrinishHolat = 'kutmoqda' | 'toliq' | 'nomalum' | 'xato';

export const urinishKaliti = (kompaniyaId: number, obyektId: number) => `${kompaniyaId}:${obyektId}`;

/** Snapshot: bo'laklar va UUID'lar shu yerda muzlatiladi (keyin o'zgarmaydi). */
export function urinishYarat(p: { kompaniyaId: number; obyektId: number; sana: string; sarlavha: string; foiz: number },
  bolaklar: readonly (readonly { qator_id: number; hajm: number }[])[], yangiId: () => string, hozir: () => string = () => new Date().toISOString(),
  faktOl: (id: number) => number = () => 0): QamrovUrinish {
  const n = bolaklar.length;
  return Object.freeze({
    kalit: urinishKaliti(p.kompaniyaId, p.obyektId), kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, sana: p.sana, sarlavha: p.sarlavha, foiz: p.foiz,
    yaratildi: hozir(),
    bolaklar: bolaklar.map((q, i) => Object.freeze({
      operationId: yangiId(), qatorlar: q.map((x) => ({ qator_id: x.qator_id, hajm: x.hajm })),
      izoh: `Qamrov ${p.foiz}%: ${p.sarlavha}`.slice(0, 480) + (n > 1 ? ` (${i + 1}/${n})` : ''),
      holat: 'kutmoqda' as BolakHolat, aktId: null, xato: null, asos: q.map((x) => faktOl(x.qator_id)),
    })),
  });
}

export function urinishHolati(u: QamrovUrinish): UrinishHolat {
  if (u.bolaklar.every((b) => b.holat === 'confirmed')) return 'toliq';
  if (u.bolaklar.some((b) => b.holat === 'unknown')) return 'nomalum';
  if (u.bolaklar.some((b) => b.holat === 'failed')) return 'xato';
  return 'kutmoqda';
}
/** Hal bo'lmagan = hamma bo'lagi confirmed emas. */
export const urinishOchiqmi = (u: QamrovUrinish | null | undefined): u is QamrovUrinish => !!u && urinishHolati(u) !== 'toliq';
export const urinishAktlari = (u: QamrovUrinish) => u.bolaklar.flatMap((b) => (b.aktId != null ? [b.aktId] : []));

/** yozAmali transport matnlari (api/supabase.ts): server amalni bajargan bo'lishi mumkin — natija NOMA'LUM. */
const TRANSPORT = /serverda bajarilgan bo‘lishi mumkin|Internet aloqasi uzildi|Server vaqtincha javob bermadi|^HTTP 5\d\d/;
export type YozJavob = { ok: boolean; akt_id?: number; code?: string; error?: string; xabar?: string; takror?: boolean } | null | undefined;
/** Javob tasnifi: istisno (throw) → unknown; ok → confirmed; ok:false + server `code` → failed; ok:false + transport matni → unknown; boshqa rad → failed. */
export function javobTasnifi(r: YozJavob | { tashlandi: true }): BolakHolat {
  if (!r || 'tashlandi' in r) return 'unknown';
  if (r.ok) return 'confirmed';
  if (r.code) return 'failed';
  return TRANSPORT.test(r.error ?? '') ? 'unknown' : 'failed';
}

/** Bo'lak receipt'ini yozilgan yangi urinish (sof; snapshot bodysi o'zgarmaydi). */
export function urinishReceipt(u: QamrovUrinish, i: number, r: YozJavob | { tashlandi: true }): QamrovUrinish {
  const holat = javobTasnifi(r);
  const j = r && !('tashlandi' in r) ? r : null;
  return Object.freeze({ ...u, bolaklar: u.bolaklar.map((b, k) => (k === i ? Object.freeze({ ...b, holat, aktId: holat === 'confirmed' ? j?.akt_id ?? b.aktId : b.aktId,
    xato: holat === 'confirmed' ? null : j?.error ?? j?.xabar ?? j?.code ?? 'javob yo‘q' }) : b)) });
}

// ── Reestr: modal yopilsa/qayta ochilsa ham yashaydi; sahifa yangilansa — localStorage'dan. ──
const reestr = new Map<string, QamrovUrinish>();
const LS = 't2.fakt.qamrov.urinish:';
const ls = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function urinishOl(kompaniyaId: number, obyektId: number): QamrovUrinish | null {
  const k = urinishKaliti(kompaniyaId, obyektId);
  const bor = reestr.get(k); if (bor) return bor;
  try {
    const s = ls()?.getItem(LS + k); if (!s) return null;
    const u = JSON.parse(s) as QamrovUrinish;
    if (u?.kalit !== k || !Array.isArray(u.bolaklar)) return null;
    reestr.set(k, u); return u;
  } catch { return null; }
}
export function urinishSaqla(u: QamrovUrinish): void {
  reestr.set(u.kalit, u);
  try { ls()?.setItem(LS + u.kalit, JSON.stringify(u)); } catch { /* localStorage yo'q — reestr yetarli */ }
}
export function urinishOchir(kompaniyaId: number, obyektId: number): void {
  const k = urinishKaliti(kompaniyaId, obyektId);
  reestr.delete(k);
  try { ls()?.removeItem(LS + k); } catch { /* yo'q */ }
}

// ── JQA-09: TASDIQLANGAN yozuvlar yozuvi (urinish tugagach yoki tashlangach ham saqlanadi). ──
/**
 * Urinish to'liq tasdiqlangach yoki (aniq rad etilgan qismi) tashlangach — tasdiqlangan bo'laklar aktlari va har qator
 * uchun KUTILGAN jami fakt (asos + hajm) yozib qo'yiladi. Keyingi yangi urinish faqat jadval (holat) shu faktni
 * ko'rsatgandan keyin boshlanadi — aks holda eski qoldiqdan hisoblangan reja tasdiqlangan hajmni ikkinchi marta yozardi.
 * Yozuv aktlar bekor qilinsa yoki jadval yangilangani tasdiqlansa o'chiriladi. Fakt hech qachon avtomatik kamaytirilmaydi.
 */
export type YozilganTekshir = { qator_id: number; kutilgan: number; ishora: 1 | -1 };
export type QamrovYozilgan = { kalit: string; sarlavha: string; foiz: number; aktlar: readonly number[]; tekshir: readonly YozilganTekshir[] };

/** Urinishning tasdiqlangan bo'laklaridan yozuv (tasdiqlangani bo'lmasa null). */
export function yozilganYasa(u: QamrovUrinish): QamrovYozilgan | null {
  const tasdiq = u.bolaklar.filter((b) => b.holat === 'confirmed');
  if (!tasdiq.length) return null;
  return {
    kalit: u.kalit, sarlavha: u.sarlavha, foiz: u.foiz,
    aktlar: tasdiq.flatMap((b) => (b.aktId != null ? [b.aktId] : [])),
    tekshir: tasdiq.flatMap((b) => b.qatorlar.map((q, i) => ({ qator_id: q.qator_id, kutilgan: Math.round(((b.asos?.[i] ?? 0) + q.hajm) * 1e6) / 1e6, ishora: (q.hajm < 0 ? -1 : 1) as 1 | -1 }))),
  };
}
/** Jadval (holat fakt_hajm) yozilgan hajmlarni ko'rsatyaptimi? Qator holati yo'q — hali yo'q deb hisoblanadi. */
export function yozilganKorinadimi(y: QamrovYozilgan, faktOl: (id: number) => number | null | undefined): boolean {
  return y.tekshir.every((x) => {
    const f = faktOl(x.qator_id);
    if (f == null || !Number.isFinite(Number(f))) return false;
    return x.ishora > 0 ? Number(f) >= x.kutilgan - 1e-6 : Number(f) <= x.kutilgan + 1e-6;
  });
}

const yozReestr = new Map<string, QamrovYozilgan>();
const LSY = 't2.fakt.qamrov.yozilgan:';
export function yozilganOl(kompaniyaId: number, obyektId: number): QamrovYozilgan | null {
  const k = urinishKaliti(kompaniyaId, obyektId);
  const bor = yozReestr.get(k); if (bor) return bor;
  try {
    const s = ls()?.getItem(LSY + k); if (!s) return null;
    const y = JSON.parse(s) as QamrovYozilgan;
    if (y?.kalit !== k || !Array.isArray(y.tekshir)) return null;
    yozReestr.set(k, y); return y;
  } catch { return null; }
}
export function yozilganSaqla(y: QamrovYozilgan): void {
  yozReestr.set(y.kalit, y);
  try { ls()?.setItem(LSY + y.kalit, JSON.stringify(y)); } catch { /* reestr yetarli */ }
}
export function yozilganOchir(kompaniyaId: number, obyektId: number): void {
  const k = urinishKaliti(kompaniyaId, obyektId);
  yozReestr.delete(k);
  try { ls()?.removeItem(LSY + k); } catch { /* yo'q */ }
}