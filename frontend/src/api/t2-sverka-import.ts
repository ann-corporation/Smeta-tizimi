/**
 * 1C akt-sverka importi — server bilan aloqa (migratsiya 20261112400000).
 * O'qish: /api/sb `sverka_moslash_v1` (stable, a'zolik + f2.read). Yozish: /api/sb-yoz — `sverka_import_v1` (partiya ≤ 200),
 * `f2_reestr_yoz_v1`, `tolov_taqsimot_saqla_v1`, `forma3_f2_bog_v1` (hammasi financial.write, idempotent operation_id).
 */
import { yozAmali, type AktNatija } from './supabase';
import type { MoslashShartnoma } from '../lib/sverka-1c/turlar';
import { barqarorUuid } from '../lib/sverka-1c/reja';

export async function sverkaMoslashOl(kompaniyaId: number): Promise<{ ok: true; shartnomalar: MoslashShartnoma[] } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'sverka_moslash_v1', kompaniya_id: kompaniyaId }) });
    const j = await r.json() as { ok: boolean; natija?: { ok: boolean; shartnomalar?: MoslashShartnoma[] }; error?: string };
    if (!j.ok || !j.natija || !Array.isArray(j.natija.shartnomalar)) return { ok: false, error: j.error || 'Moslash ma’lumotini o‘qib bo‘lmadi.' };
    return { ok: true, shartnomalar: j.natija.shartnomalar };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export type SverkaImportQator = {
  tur: 'tolov' | 'qaytarim' | 'sotuv'; shartnoma_id: number; sana: string; summa: number; raqam: string | null; izoh: string | null;
  operation_id: string; obyekt_id?: number | null; f3_holat?: 'qoralama' | 'tayyor' | 'imzolangan';
  taqsimot?: { obyekt_id: number | null; summa: number; manba: 'fifo' | 'qolda' }[];
  f2_akt_ids?: number[]; f2_reestr_ids?: number[];
};
export type QatorNatija = { i: number; tur: string; holat: 'yangi' | 'takror' | 'xato' | 'yangilandi'; id?: number; code?: string; f2_bog?: AktNatija & { code?: string }; taqsimot?: AktNatija & { code?: string } };
export type PartiyaNatija = { ok: boolean; yangi: number; takror: number; xato: number; natija: QatorNatija[]; error?: string };

export const PARTIYA = 150;

/** Qatorlarni ≤150 lik partiyalarda ketma-ket yozadi. Partiya operation_id — qatorlar op'laridan barqaror (qayta bosish takror yozmaydi). */
export async function sverkaImportYoz(kompaniyaId: number, qatorlar: readonly SverkaImportQator[], jarayon?: (yozildi: number, jami: number) => void): Promise<PartiyaNatija> {
  const jami: PartiyaNatija = { ok: true, yangi: 0, takror: 0, xato: 0, natija: [] };
  for (let i = 0; i < qatorlar.length; i += PARTIYA) {
    const qism = qatorlar.slice(i, i + PARTIYA);
    const r = await yozAmali({ amal: 'sverka_import_v1', kompaniya_id: kompaniyaId, qatorlar: qism, operation_id: barqarorUuid('sverka-partiya|' + qism.map((q) => q.operation_id).join(',')) }) as AktNatija & Partial<PartiyaNatija> & { code?: string };
    if (!r.ok) return { ...jami, ok: false, error: r.error || r.xabar || r.code || 'Yozib bo‘lmadi.' };
    jami.yangi += r.yangi ?? 0; jami.takror += r.takror ?? 0; jami.xato += r.xato ?? 0;
    jami.natija.push(...(r.natija ?? []).map((n) => ({ ...n, i: n.i + i })));
    jarayon?.(Math.min(i + PARTIYA, qatorlar.length), qatorlar.length);
  }
  return jami;
}

export type ReestrYozQator = {
  shartnoma_id: number; akt_id: number | null; raqam: string; lot: string | null; obyekt_ish: string | null; davr: string | null;
  qqssiz: number | null; qqs: number | null; qqs_bilan: number | null; holat_matn: string | null;
};

export async function f2ReestrYoz(kompaniyaId: number, qatorlar: readonly ReestrYozQator[]): Promise<PartiyaNatija & { yangilandi?: number }> {
  const jami: PartiyaNatija & { yangilandi: number } = { ok: true, yangi: 0, takror: 0, xato: 0, yangilandi: 0, natija: [] };
  for (let i = 0; i < qatorlar.length; i += PARTIYA) {
    const qism = qatorlar.slice(i, i + PARTIYA);
    const r = await yozAmali({ amal: 'f2_reestr_yoz_v1', kompaniya_id: kompaniyaId, qatorlar: qism, operation_id: barqarorUuid('f2-reestr|' + JSON.stringify(qism)) }) as AktNatija & Partial<PartiyaNatija> & { yangilandi?: number; code?: string };
    if (!r.ok) return { ...jami, ok: false, error: r.error || r.code || 'Yozib bo‘lmadi.' };
    jami.yangi += r.yangi ?? 0; jami.yangilandi += r.yangilandi ?? 0; jami.xato += r.xato ?? 0;
    jami.natija.push(...(r.natija ?? []).map((n) => ({ ...n, i: n.i + i })));
  }
  return jami;
}

export function tolovTaqsimotSaqla(p: { kompaniyaId: number; tolovId: number; qatorlar: { obyekt_id: number | null; summa: number; manba: 'fifo' | 'qolda' }[]; operationId: string }) {
  return yozAmali({ amal: 'tolov_taqsimot_saqla_v1', kompaniya_id: p.kompaniyaId, tolov_id: p.tolovId, qatorlar: p.qatorlar, operation_id: p.operationId }) as Promise<AktNatija & { code?: string }>;
}

export function forma3F2Bog(p: { kompaniyaId: number; forma3Id: number; aktIds: number[]; reestrIds: number[]; operationId: string }) {
  return yozAmali({ amal: 'forma3_f2_bog_v1', kompaniya_id: p.kompaniyaId, forma3_id: p.forma3Id, akt_ids: p.aktIds, reestr_ids: p.reestrIds, operation_id: p.operationId }) as Promise<AktNatija & { code?: string }>;
}

/** Server kodlari → o'zbekcha (t() kaliti). */
export function sverkaImportXato(code: string | null | undefined): string {
  const c = String(code ?? '');
  if (/SHARTNOMA_NOT_FOUND/.test(c)) return 'Shartnoma topilmadi';
  if (/OBYEKT_SHARTNOMADA_YOQ|TAQSIMOT_OBYEKT/.test(c)) return 'Obyekt shu shartnomaga bog‘lanmagan';
  if (/TAQSIMOT_JAMI/.test(c)) return 'Taqsimot jami to‘lov summasiga teng emas';
  if (/F2_BOSHQA_SOTUVDA/.test(c)) return 'Bu F2 boshqa Продажага bog‘langan';
  if (/AKT_INVALID|REESTR_INVALID/.test(c)) return 'F2 shu shartnomaga tegishli emas';
  if (/PERMISSION_DENIED/.test(c)) return 'Bu amal uchun moliya yozish ruxsati kerak.';
  if (/QATOR_MAYDON|TUR_INVALID|SUMMA_YOQ|RAQAM_YOQ/.test(c)) return 'Qator ma’lumoti to‘liq emas';
  return c || 'Saqlab bo‘lmadi.';
}
