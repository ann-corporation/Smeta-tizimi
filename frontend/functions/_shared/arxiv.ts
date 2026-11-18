/**
 * arxiv.ts - sovuq tarixni R2 ga arxivlash yadrosi (bog'liqliklar inject qilinadi; test va endpoint ikkalasi shuni ishlatadi).
 *
 * TARTIB (har qadam oldingisi muvaffaqiyatli bo'lsa; aks holda bazaga TEGILMAYDI):
 *   1) t2_arxiv_batch_v1 - sovuq qatorlar partiyasi (faqat o'qish)   2) ndjson -> gzip -> sha256
 *   3) r2Yoz   4) r2Bosh (HEAD: hajm) + r2Oqi (qayta o'qish, gunzip, sha256, qator soni)
 *   5) t2_arxiv_yoz_v1 (manifest)   6) t2_arxiv_ochir_v1 (manifest qator soniga mos bo'lsa, <= 2000 qator, lock 3 s / stmt 30 s)
 * Idempotent: kalit mazmun xeshiga bog'liq - qayta yurganda bir xil obyekt qayta yoziladi, manifest upsert, o'chirilganlar qayta chiqmaydi.
 */
import { gunzipSync, gzipSync } from 'fflate';
import { arxivKalit, sha256Hex } from './r2-saqlash';
import type { ArxivSiyosat } from './arxiv-siyosat';

export const PARTIYA_QATOR = 1000;
export const PARTIYA_MAX = 2000;

export type Qator = { k: string; t: string; r: Record<string, unknown> };
export type ArxivDeps = {
  rpc(nom: string, args: Record<string, unknown>): Promise<any>;
  r2: { put(kalit: string, bayt: Uint8Array): Promise<void>; get(kalit: string): Promise<Uint8Array | null>; boshHajm(kalit: string): Promise<number | null> };
  kut(ms: number): Promise<void>;
};
export type PartiyaNatija =
  | { holat: 'bosh'; qator: 0; bayt: 0 }
  | { holat: 'arxivlandi'; qator: number; bayt: number; kalit: string; ochirildi: number; keyingi: string | null; tola: boolean }
  | { holat: 'xato'; xato: string; qator: number; bayt: 0 };

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ndjsonGzip = (qatorlar: Qator[]): Uint8Array => gzipSync(enc.encode(qatorlar.map((q) => JSON.stringify(q)).join('\n')), { level: 6 });
export function ndjsonOch(bayt: Uint8Array): Qator[] {
  const matn = dec.decode(gunzipSync(bayt));
  return matn === '' ? [] : matn.split('\n').map((s) => JSON.parse(s) as Qator);
}

/** Bitta partiyani arxivlaydi. `after` - joriy chaqiruv ichidagi kursor (o'chirish muvaffaqiyatsiz bo'lsa keyingisiga o'tish uchun). */
export async function partiyaArxivla(d: ArxivDeps, s: ArxivSiyosat, opt: { limit?: number; after?: string | null; hozir?: Date } = {}): Promise<PartiyaNatija> {
  const limit = Math.min(Math.max(opt.limit ?? PARTIYA_QATOR, 1), PARTIYA_MAX);
  let qatorlar: Qator[] = [];
  try {
    const b = await d.rpc('t2_arxiv_batch_v1', { p_jadval: s.jadval, p_limit: limit, p_after: opt.after ?? null });
    if (!Array.isArray(b)) return { holat: 'xato', xato: 'BATCH_JAVOB_NOTOGRI', qator: 0, bayt: 0 };
    qatorlar = b as Qator[];
  } catch (e) { return { holat: 'xato', xato: 'BATCH_' + msg(e), qator: 0, bayt: 0 }; }
  if (qatorlar.length === 0) return { holat: 'bosh', qator: 0, bayt: 0 };

  try {
    const gz = ndjsonGzip(qatorlar);
    const sha = await sha256Hex(gz);
    const sana = new Date(qatorlar.reduce((m, q) => (q.t < m ? q.t : m), qatorlar[0].t));
    const bosh = qatorlar[0].k; const oxir = qatorlar[qatorlar.length - 1].k;
    const partiya = `${slug(bosh)}-${slug(oxir)}-${sha.slice(0, 8)}`;
    const kalit = arxivKalit(s.jadval, Number.isNaN(sana.getTime()) ? (opt.hozir ?? new Date()) : sana, partiya);

    await d.r2.put(kalit, gz);
    const hajm = await d.r2.boshHajm(kalit);
    if (hajm !== gz.length) return { holat: 'xato', xato: 'R2_HEAD_HAJM_MOS_EMAS', qator: qatorlar.length, bayt: 0 };
    const qayta = await d.r2.get(kalit);
    if (!qayta) return { holat: 'xato', xato: 'R2_QAYTA_OQILMADI', qator: qatorlar.length, bayt: 0 };
    if ((await sha256Hex(qayta)) !== sha) return { holat: 'xato', xato: 'R2_SHA256_MOS_EMAS', qator: qatorlar.length, bayt: 0 };
    let tekshir: Qator[];
    try { tekshir = ndjsonOch(qayta); } catch { return { holat: 'xato', xato: 'R2_GUNZIP_XATO', qator: qatorlar.length, bayt: 0 }; }
    if (tekshir.length !== qatorlar.length) return { holat: 'xato', xato: 'R2_QATOR_SONI_MOS_EMAS', qator: qatorlar.length, bayt: 0 };

    const idlar = tekshir.map((q) => q.k);
    const man = await d.rpc('t2_arxiv_yoz_v1', { p_jadval: s.jadval, p_oraliq: `${bosh}..${oxir}`, p_r2_key: kalit, p_soni: idlar.length, p_sha256: sha, p_bayt: gz.length });
    if (!man || man.ok !== true) return { holat: 'xato', xato: 'MANIFEST_' + String(man?.code ?? 'XATO'), qator: qatorlar.length, bayt: 0 };

    const och = await d.rpc('t2_arxiv_ochir_v1', { p_jadval: s.jadval, p_r2_key: kalit, p_idlar: idlar });
    if (!och || och.ok !== true) return { holat: 'xato', xato: 'OCHIRISH_' + String(och?.code ?? 'XATO'), qator: qatorlar.length, bayt: 0 };
    return { holat: 'arxivlandi', qator: idlar.length, bayt: gz.length, kalit, ochirildi: Number(och.ochirildi ?? 0), keyingi: oxir, tola: qatorlar.length >= limit };
  } catch (e) { return { holat: 'xato', xato: msg(e), qator: qatorlar.length, bayt: 0 }; }
}

export type IshNatija = { jadval: string; partiya: number; qator: number; bayt: number; xato: string | null; qoldi: boolean };

/** Bitta jadvalni byudjet ichida arxivlaydi: partiyalar orasida pauza (IO), xatoda to'xtaydi (baza tegilmaydi). */
export async function jadvalArxivla(d: ArxivDeps, s: ArxivSiyosat, b: { maxPartiya: number; pauzaMs: number; limit?: number }): Promise<IshNatija> {
  const n: IshNatija = { jadval: s.jadval, partiya: 0, qator: 0, bayt: 0, xato: null, qoldi: false };
  for (let i = 0; i < b.maxPartiya; i++) {
    const r = await partiyaArxivla(d, s, { limit: b.limit });
    if (r.holat === 'bosh') return n;
    if (r.holat === 'xato') { n.xato = r.xato; return n; }
    n.partiya++; n.qator += r.qator; n.bayt += r.bayt;
    if (!r.tola) return n;
    n.qoldi = true;
    if (i < b.maxPartiya - 1) await d.kut(b.pauzaMs);
  }
  return n;
}

/** Tiklash: R2 dan partiyani o'qiydi, sha256 ni manifestga solishtiradi va t2_arxiv_tikla_v1 orqali qaytaradi. */
export async function partiyaTikla(d: ArxivDeps, jadval: string, r2Kalit: string, sha256: string): Promise<{ ok: boolean; kiritildi?: number; xato?: string }> {
  const bayt = await d.r2.get(r2Kalit);
  if (!bayt) return { ok: false, xato: 'R2_OBYEKT_YOQ' };
  if ((await sha256Hex(bayt)) !== sha256) return { ok: false, xato: 'R2_SHA256_MOS_EMAS' };
  const q = ndjsonOch(bayt);
  const j = await d.rpc('t2_arxiv_tikla_v1', { p_jadval: jadval, p_r2_key: r2Kalit, p_qatorlar: q.map((x) => x.r) });
  return j?.ok === true ? { ok: true, kiritildi: Number(j.kiritildi ?? 0) } : { ok: false, xato: String(j?.code ?? 'TIKLA_XATO') };
}

const slug = (k: string) => k.replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'x';
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/[^A-Za-z0-9_ .:-]/g, '').slice(0, 80);
