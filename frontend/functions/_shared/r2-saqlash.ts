/**
 * r2-saqlash.ts - YAGONA R2 saqlash xizmati (platforma qatlami).
 *
 * Qoida (egasi qarori): asl yuklangan hujjat va sovuq arxiv FAQAT R2 da; Postgres'da fayl baytlari YO'Q;
 * Google Drive kerak emas. R2 ga YOZISH faqat shu moduldagi `r2Yoz` orqali amalga oshadi - guard test
 * (functions/_shared/r2-qoriqchi.test.ts) boshqa joydagi `R2.put(...)` ni CI da rad etadi.
 *
 * Kalit sxemasi (bitta, o'zgarmas):
 *   hujjat   : docs/{kompaniya}/{loyiha|0}/{obyekt|0}/d{document_id}/r{seq}   (t2_document_reserve RPC hosil qiladi; reyestr: t2_document_registry)
 *   arxiv    : arxiv/{jadval}/{yyyy}/{mm}/{partiya}.ndjson.gz                   (sovuq tarix; manifest: t2_arxiv_bolak)
 *   snapshot : snapshot-cold/v1/{xx}/{sha256}.json.gz                           (snapshot.bolak_mazmun sovuq mazmuni)
 * Dublikat: bir xil sha256 + kompaniya = bitta obyekt (t2_document_canonical_share_v1); chegara: CANONICAL_MAX_UPLOAD_BYTES.
 */

export const R2_STANDART_MAX_BAYT = 512 * 1024 * 1024;

/** Bajarib bo'lmaydigan/xavfli turlar - yuklashga yo'l qo'yilmaydi (qolgan hamma hujjat/rasm/arxiv ruxsat). */
const TAQIQ_KENGAYTMA = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|dll|sh|apk|app|hta|lnk)$/i;
const TAQIQ_MIME = /^(application\/(x-msdownload|x-dosexec|x-sh|x-msdos-program|java-archive|vnd\.microsoft\.portable-executable)|text\/(x-shellscript|javascript))$/i;

export type YuklashTekshiruv = { ok: true } | { ok: false; code: 'FILE_TOO_LARGE' | 'MIME_REJECTED' | 'EMPTY_FILE' };

/** MIME + kengaytma + hajm tekshiruvi (har yuklash yo'li shuni chaqiradi). */
export function yuklashTekshir(p: { nom: string; mime?: string | null; bayt: number; maxBayt?: number }): YuklashTekshiruv {
  if (!(p.bayt > 0)) return { ok: false, code: 'EMPTY_FILE' };
  if (p.bayt > (p.maxBayt ?? R2_STANDART_MAX_BAYT)) return { ok: false, code: 'FILE_TOO_LARGE' };
  if (TAQIQ_KENGAYTMA.test(String(p.nom || '')) || TAQIQ_MIME.test(String(p.mime || ''))) return { ok: false, code: 'MIME_REJECTED' };
  return { ok: true };
}

/** Strukturaviy tur: Workers R2Bucket ga mos (global R2 tiplariga bog'liq emas - src testlari ham import qila oladi). */
export type R2Bucket = { put(k: string, v: any, o?: any): Promise<any>; get(k: string): Promise<any>; head(k: string): Promise<any>; delete(k: string): Promise<any> };
export type R2Qiymat = ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null;

/** YAGONA yozish nuqtasi. Barcha chaqiruvlar (hujjat, rasm, arxiv, katalog) shu orqali o'tadi. */
export function r2Yoz(bucket: R2Bucket, kalit: string, qiymat: R2Qiymat, opts?: unknown): Promise<any> {
  if (!kalit || kalit.startsWith('/') || kalit.includes('..')) throw new Error('R2_KALIT_NOTOGRI');
  return bucket.put(kalit, qiymat, opts);
}

export const r2Oqi = (bucket: R2Bucket, kalit: string): Promise<any> => bucket.get(kalit);
export const r2Bosh = (bucket: R2Bucket, kalit: string): Promise<any> => bucket.head(kalit);
export const r2Ochir = (bucket: R2Bucket, kalit: string): Promise<void> => bucket.delete(kalit);

export async function sha256Hex(bayt: Uint8Array | ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bayt as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** arxiv/{jadval}/{yyyy}/{mm}/{partiya}.ndjson.gz - jadval nomi va partiya qat'iy shakllanadi. */
export function arxivKalit(jadval: string, sana: Date, partiya: string): string {
  if (!/^[a-z][a-z0-9_]{1,60}$/.test(jadval)) throw new Error('ARXIV_JADVAL_NOTOGRI');
  if (!/^[A-Za-z0-9._-]{3,120}$/.test(partiya)) throw new Error('ARXIV_PARTIYA_NOTOGRI');
  const y = String(sana.getUTCFullYear());
  const m = String(sana.getUTCMonth() + 1).padStart(2, '0');
  return `arxiv/${jadval}/${y}/${m}/${partiya}.ndjson.gz`;
}

/**
 * Katta fayl: R2 multipart (Hujjat maydoni, <= 200 MB). Yozish nuqtasi shu modulda qoladi (guard: r2Yoz/shu yordamchilar).
 * R2 qoidasi: oxirgisidan boshqa hamma qism BIR XIL hajmda va >= 5 MiB bo'lishi shart.
 */
export type R2Qism = { partNumber: number; etag: string };
export type R2BolakBucket = R2Bucket & {
  createMultipartUpload(k: string, o?: any): Promise<{ uploadId: string }>;
  resumeMultipartUpload(k: string, uploadId: string): { uploadPart(n: number, v: any): Promise<R2Qism>; complete(p: R2Qism[]): Promise<{ size: number; body?: any }>; abort(): Promise<void> };
};
export async function r2BolakBoshla(bucket: R2Bucket, kalit: string, mime: string): Promise<string> {
  if (!kalit || kalit.startsWith('/') || kalit.includes('..')) throw new Error('R2_KALIT_NOTOGRI');
  const u = await (bucket as R2BolakBucket).createMultipartUpload(kalit, { httpMetadata: { contentType: mime } });
  return String(u.uploadId);
}
export const r2BolakQism = (bucket: R2Bucket, kalit: string, uploadId: string, n: number, bayt: Uint8Array): Promise<R2Qism> =>
  (bucket as R2BolakBucket).resumeMultipartUpload(kalit, uploadId).uploadPart(n, bayt);
export const r2BolakTugat = (bucket: R2Bucket, kalit: string, uploadId: string, qismlar: R2Qism[]) =>
  (bucket as R2BolakBucket).resumeMultipartUpload(kalit, uploadId).complete(qismlar);
export const r2BolakBekor = (bucket: R2Bucket, kalit: string, uploadId: string): Promise<void> =>
  (bucket as R2BolakBucket).resumeMultipartUpload(kalit, uploadId).abort();
