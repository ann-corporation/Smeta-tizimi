/**
 * disk-yoz.ts - tizim hujjatini kompaniya DISKIGA yozishning yagona server yo'li (Disk A2).
 *  - Kalit FAQAT lib/disk-hujjat.ts (f2:<akt_id>, f3:<forma3_id>, <tur>:<obyekt>:<oy>) yoki SQL `_t2_disk_kalit_v1` dan (kalit berilmasa
 *    registry qatoridan SQL o'zi aniqlaydi). Bu yerda kalit o'ylab topilmaydi.
 *  - Yozuvchi: t2_disk_tizim_yoz_v1 (A1). Bir xil sha256 -> versiya qo'shilmaydi; manba tahrirlanib qayta yasalsa -> yangi versiya.
 *  - Hajm faqat t2_hm_versiya dan (SQL); tarif/kvota qoidasi DB da.
 *  - Yozuv xatosi hujjat yasashni YIQITMAYDI, lekin jim yutilmaydi: jurnalga (console.error, tuzilgan qator) yoziladi va natijada qaytadi
 *    (chaqiruvchi javobga `X-Disk-Holat` / `disk` qo'shadi). Qayta urinish navbati - holatdan: saqlangan, lekin Diskka ulanmagan hujjatlarni
 *    kunlik cron (`t2_disk_yetim_ishla_v1`) ulaydi.
 */
import { supabaseBaseUrl } from './supabase-url';
import { r2Yoz, sha256Hex } from './r2-saqlash';
import { DISK_HUJJAT_TURI, type DiskManba } from '../../src/lib/disk-hujjat';

export type DiskEnv = { SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket };
export type DiskYozNatija = { ok: true; faylId: number | null; versiya: number | null; takror: boolean; yangi: boolean } | { ok: false; code: string };
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function rpc(env: DiskEnv, nom: string, args: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  const text = await r.text(); let body: any = null; try { body = JSON.parse(text); } catch { /* xom */ }
  return { ok: r.ok && !!body && body.ok === true, body };
}

/** Jim yutilmasin: tuzilgan jurnal qatori (Cloudflare loglari / tail). Maxfiy qiymat yo'q: faqat id va kod. */
export function diskXatoJurnal(joy: string, p: { kompaniyaId: number; registryId?: number | null; kalit?: string | null; code: string }): void {
  try { console.error(JSON.stringify({ disk: 'yoz_xato', joy, kompaniya_id: p.kompaniyaId, registry_id: p.registryId ?? null, kalit: p.kalit ?? null, code: p.code })); } catch { /* jurnal ham yiqitmasin */ }
}

/**
 * Saqlangan (stored) registry hujjatini Diskka yozadi (yangi fayl yoki mavjud faylning yangi versiyasi). Hech qachon istisno tashlamaydi.
 * `manba` berilmasa - kalit, manba va nom registry qatoridan SQL da aniqlanadi.
 */
export async function diskYoz(env: DiskEnv, p: { actorId: number; kompaniyaId: number; registryId: number; manba?: Pick<DiskManba, 'turi' | 'id' | 'kalit' | 'nom' | 'shartnomaId'> | null; joy?: string }): Promise<DiskYozNatija> {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) { diskXatoJurnal(p.joy ?? 'yoz', { ...p, code: 'CONFIG' }); return { ok: false, code: 'CONFIG' }; }
    const m = p.manba ?? null;
    const r = await rpc(env, 't2_disk_tizim_yoz_v1', {
      p_actor: p.actorId, p_kompaniya: p.kompaniyaId, p_registry_id: p.registryId, p_manba_turi: m?.turi || null, p_manba_id: m?.id ?? null,
      p_hujjat_kalit: m?.kalit || null, p_shartnoma_id: m?.shartnomaId ?? null, p_nom: m?.nom || null,
    });
    if (!r.ok) {
      const code = String(r.body?.code || r.body?.message || 'DISK_YOZ_XATO').slice(0, 80);
      diskXatoJurnal(p.joy ?? 'yoz', { kompaniyaId: p.kompaniyaId, registryId: p.registryId, kalit: m?.kalit, code });
      return { ok: false, code };
    }
    return { ok: true, faylId: r.body.fayl_id != null ? Number(r.body.fayl_id) : null, versiya: r.body.raqam != null ? Number(r.body.raqam) : null, takror: r.body.takror === true, yangi: r.body.yangi === true };
  } catch (e) {
    diskXatoJurnal(p.joy ?? 'yoz', { kompaniyaId: p.kompaniyaId, registryId: p.registryId, kalit: p.manba?.kalit, code: e instanceof Error ? e.name : 'ISTISNO' });
    return { ok: false, code: 'DISK_YOZ_ISTISNO' };
  }
}

/** Deterministik UUID (v4 shaklida): kompaniya + obyekt + tur + kalit + mazmun xeshi. Bir xil kirish = bir xil operatsiya (idempotent). */
export async function diskOperationId(kompaniyaId: number, obyektId: number | null, tur: string, kalit: string, xesh: string): Promise<string> {
  const h = await sha256Hex(new TextEncoder().encode(`disk|${kompaniyaId}|${obyektId ?? '-'}|${tur}|${kalit}|${xesh}`));
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type DiskArxivNatija = { ok: true; documentId: number; disk: DiskYozNatija } | { ok: false; code: string };

/**
 * Server yasagan hujjat (F-2, F-3, nakopitelniy, M-29, slichitelniy, ostatka): kanonik reserve -> R2 -> finalize -> Diskka yozish.
 * Tokenni chaqiruvchi (hujjat-yarat) allaqachon yechgan. Hech qachon istisno tashlamaydi.
 */
export async function diskArxivla(env: DiskEnv, p: {
  actorId: number; kompaniyaId: number; obyektId: number; turi: string; faylNomi: string; bytes: Uint8Array; davr: string | null; xesh: string; manba: DiskManba;
}): Promise<DiskArxivNatija> {
  try {
    if (!env.R2_CANONICAL || !env.SUPABASE_URL || !env.SUPABASE_KEY) { diskXatoJurnal('arxivla', { kompaniyaId: p.kompaniyaId, kalit: p.manba.kalit, code: 'CONFIG' }); return { ok: false, code: 'CONFIG' }; }
    const documentType = DISK_HUJJAT_TURI[p.turi] ?? (Object.values(DISK_HUJJAT_TURI).includes(p.turi) ? p.turi : null);
    if (!documentType || !p.bytes.byteLength) { diskXatoJurnal('arxivla', { kompaniyaId: p.kompaniyaId, kalit: p.manba.kalit, code: 'TUR_NOMALUM' }); return { ok: false, code: 'TUR_NOMALUM' }; }
    const sha = await sha256Hex(p.bytes);
    // eslint-disable-next-line no-control-regex
    const nom = p.faylNomi.replace(/[\\/\u0000-\u001f]+/g, '_').replace(/\s+/g, '_').slice(0, 180) || 'hujjat.xlsx';
    const saqla = async (op: string): Promise<{ ok: true; documentId: number } | { ok: false; code: string; registryId?: number }> => {
      const res = await rpc(env, 't2_document_canonical_reserve_v1', {
        p_kompaniya_id: p.kompaniyaId, p_actor_id: p.actorId, p_loyiha_id: null, p_obyekt_id: p.obyektId, p_document_type: documentType,
        p_original_filename: nom, p_mime_type: XLSX, p_expected_size: p.bytes.byteLength, p_client_sha256: sha, p_operation_id: op, p_revision: p.davr,
      });
      if (!res.ok) return { ok: false, code: String(res.body?.code || 'RESERVE_XATO') };
      const documentId = Number(res.body.document_id);
      if (res.body.canonical_storage_status !== 'stored') {
        try { await r2Yoz(env.R2_CANONICAL as R2Bucket, String(res.body.r2_key), p.bytes, { httpMetadata: { contentType: XLSX }, customMetadata: { sha256: sha, document_id: String(documentId), operation_id: op, kompaniya_id: String(p.kompaniyaId) } }); }
        catch { return { ok: false, code: 'R2_XATO', registryId: documentId }; }
        const fin = await rpc(env, 't2_document_canonical_finalize_v1', {
          p_kompaniya_id: p.kompaniyaId, p_actor_id: p.actorId, p_document_id: documentId, p_operation_id: op, p_r2_key: String(res.body.r2_key),
          p_sha256: sha, p_size_bytes: p.bytes.byteLength, p_sha256_verified: true, p_hash_source: 'server',
        });
        if (!fin.ok) return { ok: false, code: String(fin.body?.code || 'FINALIZE_XATO'), registryId: documentId };
      }
      return { ok: true, documentId };
    };
    let s = await saqla(await diskOperationId(p.kompaniyaId, p.obyektId, documentType, p.manba.kalit, p.xesh));
    /* Oldingi urinish shu operatsiyani band qilib, yozishni tugatmay o'lgan bo'lsa (Worker vaqti/CPU) va baytlar endi biroz boshqa (QR/vaqt) —
       baza «CANONICAL_HASH_MISMATCH» bilan HAR urinishda rad etardi (prod 2026-11-21: F-2 abadiy qotgan). Bir marta baytlar xeshi bilan yangi operatsiya. */
    if (!s.ok && s.code === 'CANONICAL_HASH_MISMATCH') s = await saqla(await diskOperationId(p.kompaniyaId, p.obyektId, documentType, p.manba.kalit, `${p.xesh}|${sha}`));
    if (!s.ok) { diskXatoJurnal('arxivla', { kompaniyaId: p.kompaniyaId, ...(s.registryId ? { registryId: s.registryId } : {}), kalit: p.manba.kalit, code: s.code }); return { ok: false, code: s.code }; }
    const documentId = s.documentId;
    return { ok: true, documentId, disk: await diskYoz(env, { actorId: p.actorId, kompaniyaId: p.kompaniyaId, registryId: documentId, manba: p.manba, joy: 'arxivla' }) };
  } catch (e) {
    diskXatoJurnal('arxivla', { kompaniyaId: p.kompaniyaId, kalit: p.manba.kalit, code: e instanceof Error ? e.name : 'ISTISNO' });
    return { ok: false, code: 'DISK_ARXIV_XATO' };
  }
}

/** Javob sarlavhasi uchun qisqa holat: 'ok' | 'xato:<kod>' | 'o\'tkazildi'. */
export const diskHolatiMatni = (n: DiskArxivNatija | null): string => (!n ? 'otkazildi' : !n.ok ? `xato:${n.code}` : n.disk.ok ? 'ok' : `xato:${n.disk.code}`);
