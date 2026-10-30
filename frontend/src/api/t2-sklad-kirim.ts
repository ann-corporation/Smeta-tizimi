/**
 * C11 markaziy ombor kirimi (PR-B) — gateway mijozlari.
 * O'qish: `/api/sb` soro `sklad_kirim_royxat_v1` (actor sessiyadan, a'zolik + document.read RPC ichida).
 * Yozish: `/api/sb-yoz` amal `sklad_kirim_import_v1` / `sklad_kirim_storno_v1` (document.write RPC ichida).
 * Narx bu yo'lda yo'q — kirim qatorida narx NULL (0 emas).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, yangiOperationId } from './supabase';
import type { KirimBolak } from '../lib/ombor-prixod/yozish';

export type KirimQator = {
  id: number; sklad_id: number; sana: string; nomi: string; birligi: string; obyomi: number;
  postavshik: string | null; turi: string | null; manba_turi: string | null; sf_tasdiq: string | null;
  yaratildi: string; manba_fayl_id: number | null; manba_sha256: string | null; manba_varaq: string | null;
  manba_qator: number | null; storno: boolean; storno_id: number | null;
};
export type KirimMaterialJami = { nomi: string; birligi: string; kirim: number; storno: number; sof_kirim: number };
export type KirimFiltr = { dan?: string; gacha?: string; qidir?: string; tur?: string; yetkazuvchi?: string };
export type KirimRoyxat = {
  ok: true; jami: number; limit: number; offset: number; rasxod_kiritilgan: boolean;
  qatorlar: KirimQator[]; jami_materiallar: KirimMaterialJami[];
};
export type KirimXato = { ok: false; code?: string; error?: string };

const tozaFiltr = (f: KirimFiltr): KirimFiltr =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)) as KirimFiltr;

export async function sbSkladKirimRoyxat(p: {
  kompaniyaId: number; skladId: number; filtr?: KirimFiltr; limit?: number; offset?: number;
}): Promise<KirimRoyxat | KirimXato> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'sklad_kirim_royxat_v1', kompaniya_id: p.kompaniyaId, sklad_id: p.skladId,
        filtr: tozaFiltr(p.filtr ?? {}), limit: p.limit ?? 50, offset: p.offset ?? 0 }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; natija?: KirimRoyxat | KirimXato; error?: string; code?: string } | null;
    if (!j?.ok || !j.natija) return { ok: false, code: j?.code ?? 'HTTP_' + r.status, error: j?.error };
    return j.natija;
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
}

/**
 * Shu fayldan (sha256, «Приход») omborga allaqachon yozilgan manba qatorlari — takrorni oldindan ko'rsatish uchun.
 * Ro'yxat RPC sha256 bo'yicha filtr bermaydi, shuning uchun 1000 talik sahifalab o'qiladi.
 */
export async function sbSkladKirimYozilganQatorlar(p: { kompaniyaId: number; skladId: number; sha256: string; varaq: string }): Promise<Set<number>> {
  const natija = new Set<number>();
  for (let offset = 0; ; offset += 1000) {
    const r = await sbSkladKirimRoyxat({ kompaniyaId: p.kompaniyaId, skladId: p.skladId, limit: 1000, offset });
    if (!r.ok) throw new Error(r.code || 'KIRIM_ROYXAT_FAILED');
    for (const q of r.qatorlar) if (q.manba_sha256 === p.sha256 && q.manba_varaq === p.varaq && q.manba_qator != null) natija.add(q.manba_qator);
    if (r.qatorlar.length < 1000 || offset + 1000 >= r.jami) return natija;
  }
}

export async function sbSkladKirimImport(p: {
  kompaniyaId: number; skladId: number; documentId: number; varaq: string; bolak: KirimBolak;
}): Promise<{ ok: boolean; code?: string; error?: string; qator_soni?: number }> {
  const j = await yozAmali({
    amal: 'sklad_kirim_import_v1', kompaniya_id: p.kompaniyaId, sklad_id: p.skladId, document_id: p.documentId,
    varaq: p.varaq, qatorlar: p.bolak.qatorlar, operation_id: p.bolak.operationId,
  }) as { ok: boolean; code?: string; error?: string; qator_soni?: number };
  return j;
}

export async function sbSkladKirimStorno(p: { kompaniyaId: number; harakatId: number; sabab: string; operationId?: string }) {
  return yozAmali({
    amal: 'sklad_kirim_storno_v1', kompaniya_id: p.kompaniyaId, harakat_id: p.harakatId,
    sabab: p.sabab, operation_id: p.operationId ?? yangiOperationId(),
  }) as Promise<{ ok: boolean; code?: string; error?: string; storno_id?: number }>;
}
