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

/* ══════════════════════════════════════════════════════════════════
 * IJRO TAYYORLASH — faqat o'qish (razdel tartibi, akt↔qator bog'lari, fakt sanalari)
 * ══════════════════════════════════════════════════════════════════ */
export type QatorMetaYozuv = { id: number; ota_id: number | null; tartib: number | null; tur: string | null; nom: string | null };

/** Smeta daraxti (faqat joriy faol versiya): razdel tartibi uchun yengil ustunlar. */
export async function sbQatorMetaOl(obyektId: number): Promise<QatorMetaYozuv[]> {
  const r = await sbOqi<QatorMetaYozuv>({ jadval: 't2_qator', filtr: 'obyekt_id=eq.' + obyektId, ustunlar: 'id,ota_id,tartib,tur,nom', tartib: 'id.asc', limit: 200000 });
  return r.ok ? r.qatorlar || [] : [];
}

/** Akt → bog'langan smeta qatorlari (M:N). Gateway yopiq/xato bo'lsa bo'sh xarita (tartib faqat sanaga tushadi). */
export async function sbAosrBogOl(kompaniyaId: number, aosrIds: readonly number[]): Promise<Map<number, number[]>> {
  const xarita = new Map<number, number[]>();
  for (let i = 0; i < aosrIds.length; i += 100) {
    const r = await sbOqi<{ aosr_id: number; qator_id: number }>({
      jadval: 't2_aosr_bog', filtr: `kompaniya_id=eq.${kompaniyaId}&aosr_id=in.(${aosrIds.slice(i, i + 100).join(',')})`, ustunlar: 'aosr_id,qator_id', limit: 100000,
    }).catch(() => null);
    if (!r || !r.ok) return xarita;
    for (const b of r.qatorlar || []) { const a = xarita.get(Number(b.aosr_id)); if (a) a.push(Number(b.qator_id)); else xarita.set(Number(b.aosr_id), [Number(b.qator_id)]); }
  }
  return xarita;
}

/** Akt → qator → bog'langan hajm (`t2_aosr_bog.hajm`; NULL = ko'rsatilmagan). Ijro hajm hisobi ilovasi uchun; xato — bo'sh xarita. */
export async function sbAosrBogHajmOl(kompaniyaId: number, aosrIds: readonly number[]): Promise<Map<number, Map<number, number | null>>> {
  const xarita = new Map<number, Map<number, number | null>>();
  for (let i = 0; i < aosrIds.length; i += 100) {
    const r = await sbOqi<{ aosr_id: number; qator_id: number; hajm: number | null }>({
      jadval: 't2_aosr_bog', filtr: `kompaniya_id=eq.${kompaniyaId}&aosr_id=in.(${aosrIds.slice(i, i + 100).join(',')})`, ustunlar: 'aosr_id,qator_id,hajm', limit: 100000,
    }).catch(() => null);
    if (!r || !r.ok) return xarita;
    for (const b of r.qatorlar || []) {
      const m = xarita.get(Number(b.aosr_id)) ?? new Map<number, number | null>();
      m.set(Number(b.qator_id), b.hajm == null ? null : Number(b.hajm));
      xarita.set(Number(b.aosr_id), m);
    }
  }
  return xarita;
}

/** Berilgan qatorlar bo'yicha bekor qilinmagan fakt hujjatlarining sanalari (qoralama boshlanish/tugash sanasi uchun). */
export async function sbFaktSanalarOl(obyektId: number, qatorIds: readonly number[]): Promise<{ links: { akt_id: number; qator_id: number }[]; aktlar: { id: number; sana: string | null }[] }> {
  const a = await sbOqi<{ id: number; sana: string | null }>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.fakt&holat=neq.bekor`, ustunlar: 'id,sana', limit: 20000 });
  if (!a.ok || !qatorIds.length) return { links: [], aktlar: [] };
  const links: { akt_id: number; qator_id: number }[] = [];
  for (let i = 0; i < qatorIds.length; i += 100) {
    const r = await sbOqi<{ akt_id: number; qator_id: number }>({
      jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${obyektId}&qator_id=in.(${qatorIds.slice(i, i + 100).join(',')})`, ustunlar: 'akt_id,qator_id', limit: 100000,
    });
    if (!r.ok) break;
    links.push(...(r.qatorlar || []));
  }
  return { links, aktlar: a.qatorlar || [] };
}
