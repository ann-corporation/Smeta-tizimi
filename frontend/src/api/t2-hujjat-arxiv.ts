/**
 * Chiqarilgan rasmiy hujjatni R2 arxivga o'zgarmas versiya qilib saqlash (egasi 2026-10-02: "tasdiqlangan hujjatlar
 * fayl sifatida saqlansin — hash + versiya, tizimlashgan papkalarda").
 *
 * operation_id hujjat mazmunidan (sha256) hosil qilinadi: aynan bir xil hujjat qayta chiqarilsa — yangi versiya
 * YARATILMAYDI (server idempotent qaytaradi); mazmun o'zgarsa — o'sha papkada keyingi versiya (r2, r3…).
 * Saqlash hujjatni berishni to'xtatmaydi: xato bo'lsa faqat ogohlantiriladi.
 */
import { hujjatYukla } from './t2-hujjat-canonical';

export type ArxivTuri = 'f2_hujjat' | 'f3' | 'nakopitelniy' | 'slichitelniy' | 'm29' | 'aosr';

const hex = async (s: Uint8Array | string) => {
  const b = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  const d = await crypto.subtle.digest('SHA-256', b as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** Deterministik UUID (v4 shaklida): kompaniya + obyekt + tur + mazmun xeshi. */
export async function arxivOperationId(kompaniyaId: number, obyektId: number | null, turi: string, sha256: string): Promise<string> {
  const h = await hex(`arxiv|${kompaniyaId}|${obyektId ?? '-'}|${turi}|${sha256}`);
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function hujjatArxivla(p: {
  kompaniyaId: number; loyihaId?: number | null; obyektId?: number | null; turi: ArxivTuri;
  faylNomi: string; bytes: Uint8Array; davr?: string | null;
}): Promise<{ ok: true; versiya: number; takror: boolean } | { ok: false; xato: string }> {
  try {
    const sha = await hex(p.bytes);
    const file = new File([p.bytes.slice()], p.faylNomi, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const r = await hujjatYukla({
      file, kompaniyaId: p.kompaniyaId, loyihaId: p.loyihaId ?? null, obyektId: p.obyektId ?? null,
      documentType: p.turi, revision: p.davr ?? null,
      operationId: await arxivOperationId(p.kompaniyaId, p.obyektId ?? null, p.turi, sha),
    });
    if (!r.ok) return { ok: false, xato: r.xato || r.code };
    // Versiya kalitning oxirida: docs/{k}/{l}/{o}/d{id}/r{seq}.
    const seq = Number(/\/r(\d+)$/.exec(r.data.r2_key ?? '')?.[1] ?? r.data.revision_seq ?? 1);
    return { ok: true, versiya: seq, takror: Boolean((r.data as { retry?: boolean }).retry) };
  } catch (e) {
    return { ok: false, xato: e instanceof Error ? e.message : String(e) };
  }
}
