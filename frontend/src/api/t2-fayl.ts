/**
 * Fayl menejeri API (egasi 2026-10-02). O'qish — /api/sb `fayl_explorer_v1` (a'zolik serverda, actor sessiyadan);
 * yuklab olish — /api/hujjat-ol (R2, a'zolik RPC ichida); yuklash — /api/hujjat-yukla (ikki bosqichli).
 * Ma'lumot eksporti — /api/sb jadvallari (server har o'qishga kompaniya filtrini majburan qo'shadi).
 */
import { sbOqi, yozAmali, type AktNatija } from './supabase';
import type { Fayl, FaylPapka } from '../lib/fayl-daraxt';

export type FaylExplorer = { ok: true; rol: string; kompaniya_id: number; kompaniya: string | null; fayllar: Fayl[]; papkalar?: FaylPapka[] };

/* ── Fayl menejeri amallari (egasi 2026-10-20: «Drive kabi — ko'chirish, o'chirish, nomini o'zgartirish») ──
 * /api/sb-yoz `fayl_amal_v1`. Kanonik hujjat o'zgarmaydi — faqat ko'rinadigan nom, o'z papkasi, savat. */
export type FaylAmali = 'nomla' | 'kochir' | 'savat' | 'tikla' | 'papka_yarat' | 'papka_nomla' | 'papka_kochir' | 'papka_ochir';
export type FaylAmalNatija = { ok: boolean; papka_id?: number; code?: string; xato?: string };

const AMAL_XATOLARI: Readonly<Record<string, string>> = {
  NOM_BAND: 'Shu joyda bunday nomli papka bor.',
  NOM_NOTOGRI: 'Nom 1–120 belgidan iborat bo‘lsin.',
  NOM_UZUN: 'Nom 200 belgidan oshmasin.',
  AYLANMA: 'Papkani o‘zining ichiga ko‘chirib bo‘lmaydi.',
  PAPKA_BOSH_EMAS: 'Papka bo‘sh emas — avval ichidagi papka va fayllarni ko‘chiring.',
  RUXSAT_YOQ: 'Lavozimingiz fayllarni faqat ko‘rishga ruxsat beradi.',
  HUJJAT_TOPILMADI: 'Fayl topilmadi.',
  PAPKA_TOPILMADI: 'Papka topilmadi.',
};

/** Xato kodi → foydalanuvchi matni (o'zbekcha manba; chaqiruvchi `t()` bilan tarjima qiladi). */
export const faylAmalXatosi = (code?: string, zaxira = 'Amal bajarilmadi.') => (code && AMAL_XATOLARI[code]) || zaxira;

export async function faylAmal(kompaniyaId: number, amal: FaylAmali,
  p: { documentId?: number | null; papkaId?: number | null; nom?: string | null; otaPapkaId?: number | null } = {}): Promise<FaylAmalNatija> {
  const r = await yozAmali({ amal: 'fayl_amal_v1', kompaniya_id: kompaniyaId, fayl_amal: amal,
    document_id: p.documentId ?? null, papka_id: p.papkaId ?? null, nom: p.nom ?? null, ota_papka_id: p.otaPapkaId ?? null }) as AktNatija & { code?: string; papka_id?: number };
  if (r.ok) return { ok: true, papka_id: r.papka_id };
  return { ok: false, code: r.code, xato: r.code && AMAL_XATOLARI[r.code] ? AMAL_XATOLARI[r.code] : (r.error || 'Amal bajarilmadi.') };
}

export async function faylExplorerOl(kompaniyaId: number): Promise<FaylExplorer> {
  const r = await fetch('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soro: 'fayl_explorer_v1', kompaniya_id: kompaniyaId }),
  });
  const j = await r.json().catch(() => null) as { ok?: boolean; natija?: FaylExplorer; error?: string } | null;
  if (!r.ok || !j?.ok || !j.natija?.ok) throw new Error(j?.error || 'Fayllar ro‘yxatini olib bo‘lmadi');
  return j.natija;
}

/** Fayl baytlari (R2). */
export async function faylBaytlari(id: number): Promise<Uint8Array> {
  const r = await fetch('/api/hujjat-ol?id=' + Number(id));
  if (!r.ok) throw new Error('Fayl ochilmadi (#' + id + ')');
  return new Uint8Array(await r.arrayBuffer());
}

/** ZIP ga kiradigan ma'lumot jadvallari: nom (zip ichida) → /api/sb jadvali + ustunlar. */
export const EKSPORT_JADVALLARI: ReadonlyArray<{ nom: string; jadval: string; ustunlar?: string }> = [
  { nom: 'loyihalar', jadval: 't2_loyiha_royxat' },
  { nom: 'obyektlar', jadval: 't2_obyekt' },
  { nom: 'shartnomalar', jadval: 't2_shartnoma' },
  { nom: 'kontragentlar', jadval: 't2_kontragent_royxat' },
  { nom: 'smeta_qatorlari', jadval: 't2_qator', ustunlar: 'id,obyekt_id,ota_id,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,norma,raqam' },
  { nom: 'aktlar_fakt_f2', jadval: 't2_akt' },
  { nom: 'akt_qatorlari', jadval: 't2_akt_qator' },
  { nom: 'tolovlar', jadval: 't2_tolov' },
  { nom: 'xarajatlar', jadval: 't2_xarajat' },
  { nom: 'aosr', jadval: 't2_aosr_reestr_v2' },
  { nom: 'laboratoriya', jadval: 't2_lab_protokol_reestr' },
];

/** Jadvalning shu kompaniyadagi barcha qatorlari — id bo'yicha sahifalab (har so'rov ≤ 20 000). */
export async function jadvalHammasi(jadval: string, kompaniyaId: number, ustunlar?: string): Promise<Record<string, unknown>[]> {
  const natija: Record<string, unknown>[] = [];
  let oxirgi = 0;
  for (let i = 0; i < 100; i++) {
    const r = await sbOqi<Record<string, unknown>>({
      jadval, ustunlar, tartib: 'id.asc', limit: 20000,
      filtr: `kompaniya_id=eq.${kompaniyaId}&id=gt.${oxirgi}`,
    });
    if (!r.ok) throw new Error(`${jadval}: ${r.error || 'o‘qilmadi'}`);
    const q = (r.qatorlar ?? []) as Record<string, unknown>[];
    natija.push(...q);
    if (q.length < 20000) break;
    oxirgi = Number(q[q.length - 1].id);
    if (!Number.isFinite(oxirgi)) break;
  }
  return natija;
}
