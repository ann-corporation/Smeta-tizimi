/**
 * t2-aosr.ts — АОСР (Акт освидетельствования скрытых работ / yashirin
 * ishlar akti), 2026-08-27
 * ═══════════════════════════════════════════════════════════════════
 *
 * Ko'chirildi: `Smeta tizimi/45_Hujjatlar.js` (akt qismi).
 *
 * ⚠️ ARXITEKTURA FARQI Tizim_01 dan: u yerda BITTA umumiy Google Sheets
 * fayl (barcha obyekt/kompaniya uchun bitta REYESTR) bo'lib, akt
 * obyektga OBJECT_NAME matn moslashtirish orqali bog'lanardi va bitta
 * akt bir nechta ishga `SMETA_REF` ustunida ';' bilan ajratilgan
 * "work-key" ro'yxati orqali ulanardi.
 *
 * Bu yerda: har akt REAL `obyekt_id` ga bog'langan (matn moslashtirish
 * emas), ko'p-ko'pga bog'lanish alohida jadvalda (`t2_aosr_bog`) —
 * xuddi `t2_shartnoma_bog` kabi.
 */
import { sbOqi } from './supabase';

/* ── O'qish ───────────────────────────────────────────────────────── */
export type AosrReestr = {
  id: number; kompaniya_id: number; obyekt_id: number; obyekt: string;
  raqam: string | null; ish_nomi: string | null;
  boshlanish_sana: string | null; tugash_sana: string | null;
  bajarilgan: string | null; pdf_url: string | null; izoh: string | null;
  holat: 'yangi' | 'tasdiqlangan' | 'qogoz' | 'bekor';
  versiya: number; yaratildi: string; yangilandi: string;
  boglangan_ish_soni: number;
};

export function sbAosrReestrOl(obyektId?: number) {
  return sbOqi<AosrReestr>({
    jadval: 't2_aosr_reestr',
    filtr: obyektId ? 'obyekt_id=eq.' + obyektId : undefined,
    tartib: 'yaratildi.desc', limit: 2000,
  });
}

/** Bajarilgan (FAKT>0) ish/material/uskuna qatorlari — har biri uchun
 *  aktga bog'langanmi va "yashirin ish" (akt talab qiladigan) belgisi. */
export type AosrCoverage = {
  qator_id: number; obyekt_id: number; nom: string | null; kod: string | null;
  birlik: string | null; kat: string | null; fakt_hajm: number;
  yashirin: boolean; akt_bor: boolean;
  /** Bog'langan aktlarning eng yaxshi holati; view kengaytirilgach keladi (hozircha yo'q bo'lishi mumkin). */
  akt_holat?: 'yangi' | 'tasdiqlangan' | 'qogoz' | null;
};

/** Qator -> bog'langan aktlarning eng yaxshi holati (view t2_aosr_qator_holat). */
export type AosrQatorHolat = { qator_id: number; obyekt_id: number; akt_holat: 'yangi' | 'tasdiqlangan' | null; akt_soni: number };

export async function sbAosrCoverageOl(obyektId: number) {
  const [cov, holat] = await Promise.all([
    sbOqi<AosrCoverage>({ jadval: 't2_aosr_coverage', filtr: 'obyekt_id=eq.' + obyektId, limit: 20000 }),
    // View migratsiya qo'llanmaguncha xato qaytaradi - bu holda holat noma'lum ('АОСР bor') qoladi.
    sbOqi<AosrQatorHolat>({ jadval: 't2_aosr_qator_holat', filtr: 'obyekt_id=eq.' + obyektId, limit: 20000 }).catch(() => null),
  ]);
  if (!cov.ok || !holat || !holat.ok) return cov;
  const xarita = new Map((holat.qatorlar || []).map((h) => [h.qator_id, h.akt_holat] as const));
  return { ...cov, qatorlar: (cov.qatorlar || []).map((c) => (xarita.has(c.qator_id) ? { ...c, akt_holat: xarita.get(c.qator_id) } : c)) };
}

/* ══════════════════════════════════════════════════════════════════
 * YOZISH — nomli amallar orqali (`/api/sb-yoz`)
 * ══════════════════════════════════════════════════════════════════ */

export type AosrNatija = {
  ok: boolean; error?: string; sabab?: string;
  id?: number; versiya?: number; takror?: boolean; yangi_boglanish?: number;
  bordagi_versiya?: number; siz_yuborgan?: number;
  ms?: number;
};

async function yoz(yuk: Record<string, unknown>): Promise<AosrNatija> {
  const t0 = performance.now();
  try {
    const r = await fetch('/api/sb-yoz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    const j = (await r.json()) as AosrNatija;
    return { ...j, ms: Math.round(performance.now() - t0) };
  } catch (e: any) {
    return { ok: false, error: 'Tarmoq: ' + (e?.message || String(e)),
             ms: Math.round(performance.now() - t0) };
  }
}

/** Akt yaratadi (`id` bo'lmasa) yoki tahrirlaydi (`id` bo'lsa —
 *  versiyalangan). Yaratishda `operationId` MAJBURIY. */
export function sbAosrYoz(p: {
  obyektId: number; raqam?: string; ishNomi?: string;
  boshlanishSana?: string; tugashSana?: string; bajarilgan?: string;
  pdfUrl?: string; izoh?: string; holat?: 'yangi' | 'tasdiqlangan' | 'qogoz';
  id?: number; kutilganVersiya?: number; operationId?: string;
}): Promise<AosrNatija> {
  return yoz({
    amal: 'aosr_yoz', obyekt_id: p.obyektId, raqam: p.raqam, ish_nomi: p.ishNomi,
    boshlanish_sana: p.boshlanishSana, tugash_sana: p.tugashSana,
    bajarilgan: p.bajarilgan, pdf_url: p.pdfUrl, izoh: p.izoh, holat: p.holat,
    id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
  });
}

/** Aktni bekor qiladi (o'chirmaydi — tarix saqlanadi). */
export function sbAosrBekor(id: number, kutilganVersiya?: number): Promise<AosrNatija> {
  return yoz({ amal: 'aosr_bekor', id, kutilgan_versiya: kutilganVersiya });
}

/** Bir nechta aktni bir nechta smeta qatoriga ulaydi (M:N, ommaviy). */
export function sbAosrBogSaqla(aosrIds: number[], qatorIds: number[]): Promise<AosrNatija> {
  return yoz({ amal: 'aosr_bog_saqla', aosr_ids: aosrIds, qator_ids: qatorIds });
}

export function sbAosrBogOchir(aosrId: number, qatorId: number): Promise<AosrNatija> {
  return yoz({ amal: 'aosr_bog_ochir', aosr_id: aosrId, qator_id: qatorId });
}
