import { vaqtliOqish } from './vaqtli-fetch';
import { sbOqi } from './supabase';

/* ⚡ 2026-08-28 (Claude) — HODISA LENTASI.
 *
 * Audit hujjati topgan bo'shliq: «t2_audit_log bor, lekin 0 qator —
 * t2_audit_yoz ni hech kim chaqirmaydi. Trigger kerak.»
 *
 * Endi `t2_audit_trigger` MUHIM hodisalarni avtomat yozadi (akt,
 * zayavka, shartnoma, to'lov: yaratildi / o'chirildi / holat o'zgarishi).
 * Trigger ataylab: agar har yozuvchi funksiya `t2_audit_yoz` ni QO'LDA
 * chaqirishi kerak bo'lsa, kimdir albatta unutadi — va aynan unutilgan
 * joy eng muhimi bo'lib chiqadi.
 *
 * ⚠️ Bu `t2_ozgarish` jurnali BILAN BIR XIL EMAS:
 *     t2_ozgarish  — HAR QATOR tahriri (73 758 yozuv) — texnik audit
 *     t2_audit_log — MUHIM hodisalar — rahbar o'qiydigan lenta
 * Ikkalasini aralashtirish rahbar ekranini shovqinga to'ldirardi.
 */

export type HodisaModul = 'akt' | 'zayavka' | 'shartnoma' | 'tolov';

export type Hodisa = {
  id: number;
  kompaniya_id: number;
  obyekt_id: number | null;
  obyekt_nom: string | null;
  modul: HodisaModul | string;
  /** `yaratildi` · `ochirildi` · `holat: qoralama → tasdiqlangan` */
  amal_turi: string;
  tafsilot: string | null;
  /** Sessiya emaili. Eski yozuvlarda `null` bo'lishi mumkin. */
  kim: string | null;
  yaratilgan_vaqt: string;
  /** Tayyor bitta satr — UI shuni ko'rsatsa yetadi. */
  satr: string;
};

/** Kompaniya bo'yicha oxirgi hodisalar (eng yangisi birinchi). */
export function sbHodisaLentaOl(kompaniyaId: number, limit = 50) {
  return sbOqi<Hodisa>({
    jadval: 't2_hodisa_lenta',
    filtr: 'kompaniya_id=eq.' + kompaniyaId,
    limit,
  });
}

/** Bitta obyekt tarixi — mindmapda tugun tanlanganda ko'rsatish uchun. */
export async function sbObyektHodisalariOl(kompaniyaId: number, obyektId: number, limit = 20) {
  try {
    const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'hodisa_obyekt_lenta', kompaniya_id: kompaniyaId, obyekt_id: obyektId, limit }) });
    const j = await r.json();
    if (!j.ok) return { ok: false, qatorlar: [], error: j.error || 'Hodisa o\'qilmadi' };
    const qatorlar = Array.isArray(j.natija) ? j.natija as Hodisa[] : [];
    return { ok: true, qatorlar, soni: qatorlar.length };
  } catch (e: any) {
    return { ok: false, qatorlar: [], error: 'Tarmoq: ' + (e?.message || String(e)) };
  }
}

/**
 * «2 soat oldin» ko'rinishidagi nisbiy vaqt.
 *
 * Ataylab shu yerda: har sahifa o'z formatini yasasa, bir joyda
 * «2 soat», boshqasida «02:15» chiqib, bir xil hodisa boshqacha
 * ko'rinardi.
 */
export function qachon(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'hozirgina';
  if (s < 3600) return Math.floor(s / 60) + ' daqiqa oldin';
  if (s < 86400) return Math.floor(s / 3600) + ' soat oldin';
  if (s < 604800) return Math.floor(s / 86400) + ' kun oldin';
  return new Date(iso).toLocaleDateString('uz-UZ');
}

/** Modul → ko'rinish rangi (semantik, bezak emas). */
export const MODUL_RANG: Record<string, string> = {
  akt:       '#f43f5e',   // Ф2/akt — pul talab qiladigan hujjat
  zayavka:   '#0ea5e9',   // ta'minot so'rovi
  shartnoma: '#d946ef',   // tijorat
  tolov:     '#10b981',   // pul harakati
};

