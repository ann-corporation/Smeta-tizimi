/**
 * Shartnoma va qo'shimcha kelishuv (DS) asl fayllari (egasi, 2026-11-05: «shakllarini tizimdan yuklab olish ... r2 da saqlanishi kerak»).
 * Fayl baytlari — MAVJUD kanonik yo'l: `hujjatYukla` (/api/hujjat-yukla → R2_CANONICAL + t2_document_registry, turi 'shartnoma'),
 * yuklab olish — `hujjatYuklabOlishUrl` (/api/hujjat-ol, R2, avtorizatsiya bilan). Bu modul faqat bog'ni boshqaradi:
 * O'qish: /api/sb `shartnoma_hujjat_royxat_v1`. Yozish: /api/sb-yoz `shartnoma_hujjat_bogla_v1` / `shartnoma_hujjat_ajrat_v1`.
 * DS ning o'zi (raqam, sana, summa) — MAVJUD t2_shartnoma_ds (Nakopitelniy sahifasidagi `sverka_yozuv_v1`).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yangiOperationId, yozAmali, type AktNatija } from './supabase';
import { hujjatYukla } from './t2-hujjat-canonical';

export type ShartnomaHujjatTur = 'asosiy' | 'ds' | 'ilova' | 'boshqa';

export type ShartnomaDs = { id: number; raqam: string; sana: string; jami_nds_bilan: number; izoh: string | null; versiya: number };
export type ShartnomaFayl = {
  id: number; ds_id: number | null; tur: ShartnomaHujjatTur; izoh: string | null; yaratildi: string;
  document_id: number; original_filename: string | null; mime_type: string | null; size_bytes: number | null; sha256: string | null;
  saqlangan: boolean; yuklangan: string;
};
export type BoglanmaganFayl = { document_id: number; original_filename: string | null; size_bytes: number | null; yuklangan: string };
export type ShartnomaHujjatlar = {
  shartnoma: { id: number; raqam: string; sana: string | null; nom: string | null; predmet: string | null; jami_nds_bilan: number | null; holat: string; versiya: number };
  ds: ShartnomaDs[]; hujjatlar: ShartnomaFayl[]; boglanmagan: BoglanmaganFayl[];
};

export async function shartnomaHujjatlarOl(kompaniyaId: number, shartnomaId: number): Promise<{ ok: true; natija: ShartnomaHujjatlar } | { ok: false; error: string }> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'shartnoma_hujjat_royxat_v1', kompaniya_id: kompaniyaId, shartnoma_id: shartnomaId }),
    });
    const j = await r.json() as { ok: boolean; natija?: (ShartnomaHujjatlar & { ok?: boolean; code?: string }); error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'Hujjatlarni o‘qib bo‘lmadi.' };
    if (j.natija.ok === false) return { ok: false, error: j.natija.code || 'Hujjatlarni o‘qib bo‘lmadi.' };
    return { ok: true, natija: { shartnoma: j.natija.shartnoma, ds: j.natija.ds ?? [], hujjatlar: j.natija.hujjatlar ?? [], boglanmagan: j.natija.boglanmagan ?? [] } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export function shartnomaHujjatBogla(p: {
  kompaniyaId: number; shartnomaId: number; dsId?: number | null; documentId: number; tur?: ShartnomaHujjatTur | null; izoh?: string | null; operationId: string;
}): Promise<AktNatija & { id?: number; code?: string }> {
  return yozAmali({
    amal: 'shartnoma_hujjat_bogla_v1', kompaniya_id: p.kompaniyaId, shartnoma_id: p.shartnomaId, ds_id: p.dsId ?? null,
    document_id: p.documentId, tur: p.tur ?? null, izoh: p.izoh ?? null, operation_id: p.operationId,
  });
}

export function shartnomaHujjatAjrat(p: { kompaniyaId: number; id: number; operationId: string }): Promise<AktNatija & { code?: string }> {
  return yozAmali({ amal: 'shartnoma_hujjat_ajrat_v1', kompaniya_id: p.kompaniyaId, id: p.id, operation_id: p.operationId });
}

/** Asl faylni kanonik R2 ga yuklab, shartnomaga (dsId berilsa — o'sha DS ga) bog'laydi. Bitta amal — ikki bosqich. */
export async function shartnomaFaylYukla(p: {
  file: File; kompaniyaId: number; shartnomaId: number; dsId?: number | null; tur?: ShartnomaHujjatTur | null; izoh?: string | null;
}): Promise<{ ok: true; documentId: number } | { ok: false; xato: string }> {
  const up = await hujjatYukla({ file: p.file, kompaniyaId: p.kompaniyaId, documentType: 'shartnoma' });
  if (!up.ok) return { ok: false, xato: up.xato || up.code };
  const b = await shartnomaHujjatBogla({
    kompaniyaId: p.kompaniyaId, shartnomaId: p.shartnomaId, dsId: p.dsId ?? null, documentId: up.data.document_id,
    tur: p.tur ?? (p.dsId ? 'ds' : 'asosiy'), izoh: p.izoh ?? null, operationId: yangiOperationId(),
  });
  if (!b.ok) return { ok: false, xato: shartnomaHujjatXato(b) };
  return { ok: true, documentId: up.data.document_id };
}

export function shartnomaHujjatXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''}`;
  if (/HUJJAT_SAQLANMAGAN/.test(m)) return 'Fayl hali R2 ga to‘liq saqlanmagan — birozdan so‘ng qayta urinib ko‘ring.';
  if (/HUJJAT_NOT_FOUND/.test(m)) return 'Fayl topilmadi.';
  if (/DS_NOT_FOUND/.test(m)) return 'Qo‘shimcha kelishuv topilmadi yoki bekor qilingan.';
  if (/SHARTNOMA_NOT_FOUND/.test(m)) return 'Shartnoma topilmadi.';
  if (/PERMISSION_DENIED|42501/.test(m)) return 'Bu amal uchun hujjat yozish huquqi kerak.';
  return r?.error || r?.xabar || r?.code || 'Saqlab bo‘lmadi.';
}
