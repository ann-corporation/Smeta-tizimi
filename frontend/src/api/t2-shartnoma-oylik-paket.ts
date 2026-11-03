/**
 * Shartnoma oylik paketi (egasi 2026-11-03) - mijoz tomoni.
 * O'qish: /api/sb `shartnoma_oylik_paket_royxat_v1` (arxiv) va `shartnoma_oylik_paket_tekshir_v1` (fakt/F2 saqlashdan oldingi ogohlantirish).
 * Yozish: /api/sb-yoz `shartnoma_oylik_paket_saqla_v1` (idempotent operation_id). ZIP baytlari - MAVJUD kanonik saqlash (`hujjatYukla`,
 * turi `shartnoma_oylik_paket`, R2_CANONICAL); yuklab olish - `/api/hujjat-ol`.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { sbOqi, yozAmali, yangiOperationId, type AktNatija } from './supabase';
import { hujjatYukla, hujjatYuklabOlishUrl } from './t2-hujjat-canonical';
import { m29HujjatOl } from './t2-m29';
import { oyKaliti } from '../lib/f2-oylik-paket/oylik';
import { PAKET_HUJJAT_TURI, sha256Hex, type M29Holat, type OyIz, type PaketManifest } from '../lib/f2-oylik-paket/shartnoma';

export type OylikPaketYozuv = {
  id: number; shartnoma_id: number; shartnoma_raqam: string; shartnoma_nom: string | null;
  oy: string; versiya: number; holat: 'topshirildi'; vaqt: string;
  hujjat_id: number | null; zip_sha256: string | null; zip_olcham: number | null;
  kim_actor_id: number | null; kim: string | null;
  manifest: PaketManifest & { iz?: OyIz[] };
  hozirgi_iz: OyIz[];
};

async function oqi<T>(soro: Record<string, unknown>): Promise<{ ok: true; natija: T } | { ok: false; error: string }> {
  try {
    const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(soro) });
    const j = await r.json() as { ok: boolean; natija?: T; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'O‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Arxiv: shartnoma (+oy) bo'yicha barcha topshirilgan versiyalar, yangisi birinchi. */
export async function oylikPaketlarRoyxati(p: { kompaniyaId: number; shartnomaId?: number | null; oy?: string | null }):
  Promise<{ ok: true; paketlar: OylikPaketYozuv[] } | { ok: false; error: string }> {
  const r = await oqi<{ paketlar: OylikPaketYozuv[] }>({
    soro: 'shartnoma_oylik_paket_royxat_v1', kompaniya_id: p.kompaniyaId,
    ...(p.shartnomaId ? { shartnoma_id: p.shartnomaId } : {}), ...(p.oy ? { oy: p.oy } : {}),
  });
  return r.ok ? { ok: true, paketlar: r.natija.paketlar ?? [] } : r;
}

export type TopshirilganPaket = { shartnoma_id: number; shartnoma_raqam: string; versiya: number; vaqt: string };

/** Obyekt + oy uchun topshirilgan paket(lar) (har shartnomaning eng so'nggi versiyasi). Xato - bo'sh ro'yxat (saqlashni hech qachon to'smaydi). */
export async function topshirilganPaketlar(obyektId: number, oy: string): Promise<TopshirilganPaket[]> {
  const k = oyKaliti(oy);
  if (!k || !Number.isSafeInteger(obyektId) || obyektId <= 0) return [];
  const r = await oqi<{ paketlar: TopshirilganPaket[] }>({ soro: 'shartnoma_oylik_paket_tekshir_v1', obyekt_id: obyektId, oy: k });
  return r.ok ? r.natija.paketlar ?? [] : [];
}

/** ZIP ni mavjud kanonik saqlashga yuklaydi (R2 + t2_document_registry). */
export async function paketZipniSaqla(p: { kompaniyaId: number; loyihaId?: number | null; zip: Uint8Array; fayl: string; oy: string; operationId: string }):
  Promise<{ ok: true; hujjatId: number; sha256: string } | { ok: false; xato: string }> {
  const file = new File([p.zip as unknown as BlobPart], p.fayl, { type: 'application/zip' });
  const r = await hujjatYukla({ file, kompaniyaId: p.kompaniyaId, loyihaId: p.loyihaId ?? null, documentType: PAKET_HUJJAT_TURI, revision: p.oy, operationId: p.operationId });
  return r.ok ? { ok: true, hujjatId: r.data.document_id, sha256: r.data.sha256 } : { ok: false, xato: r.xato || r.code };
}

export type TopshirishNatija = AktNatija & { code?: string; id?: number; versiya?: number; vaqt?: string; obyekt_soni?: number };

/** «Topshirildi»: paket yozuvi (yangi versiya). `operationId` qayta urinishda O'ZGARMASIN. */
export function oylikPaketniTopshir(p: {
  kompaniyaId: number; shartnomaId: number; oy: string; manifest: PaketManifest; hujjatId: number | null;
  zipSha256: string | null; zipOlcham: number | null; operationId: string;
}): Promise<TopshirishNatija> {
  return yozAmali({
    amal: 'shartnoma_oylik_paket_saqla_v1', kompaniya_id: p.kompaniyaId, shartnoma_id: p.shartnomaId, oy: p.oy,
    manifest: p.manifest, hujjat_id: p.hujjatId, zip_sha256: p.zipSha256, zip_olcham: p.zipOlcham, operation_id: p.operationId,
  }) as Promise<TopshirishNatija>;
}

/** Saqlangan ZIP baytlari (aynan topshirilgan fayl). Xesh manifestdagi bilan solishtiriladi - mos kelmasa xato. */
export async function saqlanganZipniOl(y: Pick<OylikPaketYozuv, 'hujjat_id' | 'zip_sha256'>): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; xato: string }> {
  if (y.hujjat_id == null) return { ok: false, xato: 'ZIP saqlanmagan.' };
  try {
    const r = await fetch(hujjatYuklabOlishUrl(y.hujjat_id));
    if (!r.ok) return { ok: false, xato: 'ZIP ni olib bo‘lmadi.' };
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (y.zip_sha256 && (await sha256Hex(bytes)) !== y.zip_sha256) return { ok: false, xato: 'Saqlangan ZIP butunligi tekshiruvi o‘tmadi.' };
    return { ok: true, bytes };
  } catch { return { ok: false, xato: 'Tarmoq xatosi.' }; }
}

export const yangiTopshirishId = yangiOperationId;

/* ───────────── tayyorgarlik uchun obyekt ma'lumotlari ───────────── */

/** Obyektning shu oydagi fakt aktlari soni (bekor qilinmaganlar). O'qib bo'lmasa null (✗ emas - «noma'lum»). */
export async function oyFaktSoni(obyektId: number, oy: string): Promise<number | null> {
  const r = await sbOqi<{ id: number; oy: string | null; sana: string | null }>({
    jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.fakt&holat=neq.bekor`, ustunlar: 'id,oy,sana', limit: 5000,
  });
  if (!r.ok || r.toliq === false) return null;
  return (r.qatorlar ?? []).filter((a) => oyKaliti(a.oy ?? a.sana) === oy).length;
}

/** Shu oyga M-29 bajarilganmi. */
export async function oyM29Holati(obyektId: number, oy: string): Promise<M29Holat> {
  try { return (await m29HujjatOl(obyektId, `${oy}-01`)) ? 'bajarildi' : 'yoq'; } catch { return 'nom'; }
}
