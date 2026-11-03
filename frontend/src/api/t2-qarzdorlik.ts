/**
 * Qarzdorlik (kreditor: postavshik / subpudrat) - egasi 2026-11-02.
 * O'qish: /api/sb `qarzdorlik_royxat_v1` (stable, a'zolik + financial.read). Yozish: /api/sb-yoz `qarzdorlik_saqla_v1` (CAS) va
 * `qarzdorlik_import_v1` (idempotent operation_id; a'zolik + financial.write).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';
import type { AsosQator } from '../lib/qarzdorlik/hisob';
import { importYuk, type ImportShartnoma } from '../lib/qarzdorlik/parse';

export type QarzObyekt = { id: number; nom: string };
export type QarzShartnoma = {
  shartnoma_id: number; versiya: number; raqam: string; sana: string | null; nom: string | null; predmet: string | null; turi: string | null;
  holat: string; izoh: string | null;
  kontragent_id: number | null; kontragent: string | null; kontragent_inn: string | null;
  shartnoma_summa: number | null;
  obyektlar: QarzObyekt[];
  boshlangich: number | null; yetkazilgan: number | null; bajarilgan: number | null; qabul: number | null;
  tolov_asos: number | null; tolov_t2: number | null; tolangan: number | null; qarz: number | null;
  spravka_qarz: number | null; spravka_tolangan: number | null; spravka_prognoz: number | null; spravka_sana: string | null;
  farq: number | null; noma_lumot_qator: number; qator_soni: number;
  qatorlar: Array<AsosQator & { id: number; versiya: number }>;
};
export type QarzRoyxat = { ok: true; generated_at: string; obyektlar: QarzObyekt[]; shartnomalar: QarzShartnoma[] };

export async function qarzdorlikRoyxatOl(kompaniyaId: number): Promise<{ ok: true; natija: QarzRoyxat } | { ok: false; error: string }> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'qarzdorlik_royxat_v1', kompaniya_id: kompaniyaId }),
    });
    const j = await r.json() as { ok: boolean; natija?: QarzRoyxat; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'Qarzdorlikni o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export type QarzSpravkaYuk = { qarz?: number | null; tolangan?: number | null; prognoz?: number | null; sana?: string | null };
type YozNatija = AktNatija & { code?: string; versiya?: number; yangi?: number; tahrir?: number; bekor?: number };

export function qarzdorlikSaqla(p: {
  kompaniyaId: number; shartnomaId: number; kutilganVersiya: number; qatorlar: ReadonlyArray<AsosQator>;
  ochirilgan: ReadonlyArray<number>; spravka?: QarzSpravkaYuk | null; operationId: string;
}): Promise<YozNatija> {
  return yozAmali({
    amal: 'qarzdorlik_saqla_v1', kompaniya_id: p.kompaniyaId, shartnoma_id: p.shartnomaId, kutilgan_versiya: p.kutilganVersiya,
    qatorlar: p.qatorlar.map((q) => ({
      id: q.id ?? null, tur: q.tur, hujjat_raqam: q.hujjat_raqam, sana: q.sana, nomi: q.nomi, birlik: q.birlik,
      hajm: q.hajm, narx: q.narx, summa: q.summa, izoh: q.izoh, sklad_harakat_id: q.sklad_harakat_id ?? null, tolov_id: q.tolov_id ?? null,
    })),
    ochirilgan: p.ochirilgan, spravka: p.spravka ?? null, operation_id: p.operationId,
  });
}

export function qarzdorlikImport(p: {
  kompaniyaId: number; shartnomalar: ReadonlyArray<ImportShartnoma>; obyektId?: number | null; operationId: string;
}): Promise<AktNatija & { code?: string; shartnoma_yangi?: number; shartnoma_yangilandi?: number; qator_qoshildi?: number; qator_takror?: number; kontragent_yangi?: number }> {
  return yozAmali({
    amal: 'qarzdorlik_import_v1', kompaniya_id: p.kompaniyaId, shartnomalar: importYuk(p.shartnomalar), obyekt_id: p.obyektId ?? null, operation_id: p.operationId,
  });
}

export function qarzdorlikXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  if (/STALE_VERSION/.test(m)) return 'Shartnoma shu orada o‘zgargan - yangilab qayta urinib ko‘ring.';
  if (/ASOSIY_SHARTNOMA_BAND/.test(m)) return 'Bu raqam asosiy (buyurtmachi) shartnomaga tegishli - import yozmaydi.';
  if (/ASOSIY_SHARTNOMA/.test(m)) return 'Asosiy shartnoma qarzdorlik moduliga tegishli emas.';
  if (/IMPORT_INVALID|IMPORT_TURI_INVALID/.test(m)) return 'Importda kontragent va shartnoma raqami majburiy.';
  if (/ASOS_TUR_INVALID/.test(m)) return 'Asos qatori turi noto‘g‘ri.';
  if (/SHARTNOMALAR_1_300|IMPORT_QATORLAR_5000/.test(m)) return 'Import hajmi: ≤300 shartnoma, jami ≤5000 qator.';
  if (/PERMISSION_DENIED|insufficient_privilege/i.test(m)) return 'Bu amal uchun moliya (yozish) ruxsati kerak.';
  return r?.error || r?.xabar || r?.code || 'Saqlab bo‘lmadi.';
}
