/**
 * disk-arxiv.ts - Tizim yasagan hujjatni (F-2, F-3, nakopitelniy, slichitelniy, M-29 ...) avtomatik Diskka (R2 kanonik reyestr) saqlash.
 *  - Yagona yo'l: /api/hujjat-yarat shu yerga chaqiradi -> sayt, Android, Windows, Telegram bir xil natija (mijozda alohida arxivlash shart emas).
 *  - Bir hujjat = bitta KALIT (lib/disk-hujjat): bir xil mazmun qayta yasalsa - mavjud yozuv (dedup); mazmun o'zgarsa - o'sha hujjatning YANGI
 *    VERSIYASI (eskisi versiyalar tarixida), yangi mustaqil fayl emas. Manba (tur + id), shartnoma va aniq nom metama'lumotda.
 *  - Hajm kompaniya diski hisobiga kiradi (t2_hm kvota); saqlash hujjat berishni HECH QACHON to'xtatmaydi (xato jim yutiladi).
 *  - R2 ga yozish faqat r2Yoz orqali; reyestr - mavjud kanonik RPC lar (reserve -> R2 -> finalize) + t2_disk_tizim_meta_v1.
 */
import { supabaseBaseUrl } from './supabase-url';
import { r2Yoz, sha256Hex } from './r2-saqlash';
import { DISK_HUJJAT_TURI, type DiskManba } from '../../src/lib/disk-hujjat';

export type DiskEnv = { SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket };
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function rpc(env: DiskEnv, nom: string, args: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  const text = await r.text(); let body: any = null; try { body = JSON.parse(text); } catch { /* xom */ }
  return { ok: r.ok && body && body.ok === true, body };
}

/** Deterministik UUID (v4 shaklida): kompaniya + obyekt + tur + kalit + mazmun xeshi. Bir xil kirish = bir xil operatsiya (idempotent). */
export async function diskOperationId(kompaniyaId: number, obyektId: number | null, tur: string, kalit: string, xesh: string): Promise<string> {
  const h = await sha256Hex(new TextEncoder().encode(`disk|${kompaniyaId}|${obyektId ?? '-'}|${tur}|${kalit}|${xesh}`));
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type DiskArxivNatija = { ok: true; documentId: number; versiya: number | null; takror: boolean } | { ok: false; code: string };

export async function diskArxivla(env: DiskEnv, p: {
  actorId: number; kompaniyaId: number; obyektId: number; turi: string; faylNomi: string; bytes: Uint8Array; davr: string | null; xesh: string; manba: DiskManba;
}): Promise<DiskArxivNatija> {
  try {
    if (!env.R2_CANONICAL || !env.SUPABASE_URL || !env.SUPABASE_KEY) return { ok: false, code: 'CONFIG' };
    const documentType = DISK_HUJJAT_TURI[p.turi];
    if (!documentType || !p.bytes.byteLength) return { ok: false, code: 'TUR_NOMALUM' };
    const sha = await sha256Hex(p.bytes);
    const op = await diskOperationId(p.kompaniyaId, p.obyektId, documentType, p.manba.kalit, p.xesh);
    const nom = p.faylNomi.replace(/[\\/\u0000-\u001f]+/g, '_').replace(/\s+/g, '_').slice(0, 180) || 'hujjat.xlsx';
    const res = await rpc(env, 't2_document_canonical_reserve_v1', {
      p_kompaniya_id: p.kompaniyaId, p_actor_id: p.actorId, p_loyiha_id: null, p_obyekt_id: p.obyektId, p_document_type: documentType,
      p_original_filename: nom, p_mime_type: XLSX, p_expected_size: p.bytes.byteLength, p_client_sha256: sha, p_operation_id: op, p_revision: p.davr,
    });
    if (!res.ok) return { ok: false, code: String(res.body?.code || 'RESERVE_XATO') };
    const documentId = Number(res.body.document_id);
    if (res.body.canonical_storage_status !== 'stored') {
      try { await r2Yoz(env.R2_CANONICAL, String(res.body.r2_key), p.bytes, { httpMetadata: { contentType: XLSX }, customMetadata: { sha256: sha, document_id: String(documentId), operation_id: op, kompaniya_id: String(p.kompaniyaId) } }); }
      catch { return { ok: false, code: 'R2_XATO' }; }
      const fin = await rpc(env, 't2_document_canonical_finalize_v1', {
        p_kompaniya_id: p.kompaniyaId, p_actor_id: p.actorId, p_document_id: documentId, p_operation_id: op, p_r2_key: String(res.body.r2_key),
        p_sha256: sha, p_size_bytes: p.bytes.byteLength, p_sha256_verified: true, p_hash_source: 'server',
      });
      if (!fin.ok) return { ok: false, code: String(fin.body?.code || 'FINALIZE_XATO') };
    }
    const meta = await rpc(env, 't2_disk_tizim_meta_v1', {
      p_actor_id: p.actorId, p_kompaniya_id: p.kompaniyaId, p_document_id: documentId, p_manba_turi: p.manba.turi, p_manba_id: p.manba.id,
      p_hujjat_kalit: p.manba.kalit, p_shartnoma_id: p.manba.shartnomaId ?? null, p_nom: p.manba.nom,
    });
    return { ok: true, documentId, versiya: meta.ok ? Number(meta.body.versiya) : null, takror: res.body.retry === true };
  } catch { return { ok: false, code: 'DISK_ARXIV_XATO' }; }
}
