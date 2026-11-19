/**
 * hujjat-tayyor.ts - F-2 ning Diskdagi TAYYOR (yangilangan) versiyasini berish: tezkor yo'l (egasi 2026-11-19).
 * Diskdagi versiya yangi bo'lsa (navbatda kutmoqda/ishlanmoqda yo'q) - bayt Diskdan olinadi, qayta yasalmaydi; eskirgan/yo'q bo'lsa `null`
 * qaytadi va chaqiruvchi (hujjat-yarat, MCP f2_excel) mavjud `f2Yasa` yo'liga tushadi.
 * TOKEN bu yerda yechilmaydi: chaqiruvchi `serverSarfla` ni (obyekt+oy+raqam kaliti, qayta yuklash bepul) o'zi chaqiradi - yuklab olish vaqtida.
 */
import { sbT2AktReestrOl } from '../../src/api/supabase';
import { f2HujjatKaliti } from '../../src/api/f2-hujjat-kontekst';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';
import { f2Manba } from '../../src/lib/disk-hujjat';
import { f2DiskkaArxivlansinmi, type Tayyor } from './hujjat-f2';

export type TayyorOlDeps = {
  /** Supabase RPC (service). */
  rpc: (nom: string, args: Record<string, unknown>) => Promise<{ httpOk: boolean; body: Record<string, any> | null }>;
  /** R2 dan bayt (kalit bo'yicha), yo'q bo'lsa null. */
  r2Bayt: (kalit: string) => Promise<Uint8Array | null>;
};

export type DiskTayyorNatija = Tayyor & { diskVersiya: number | null; yangilandi: string | null };

export async function f2DiskdanTayyor(d: TayyorOlDeps, p: { actorId: number; kompaniyaId: number; obyektId: number; aktId: number }): Promise<DiskTayyorNatija | null> {
  const h = await d.rpc('t2_hujjat_tayyor_ol_v1', { p_actor: p.actorId, p_kompaniya: p.kompaniyaId, p_akt_id: p.aktId });
  if (!h.httpOk || h.body?.ok !== true || h.body.eskirgan === true || h.body.fayl_id == null) return null;
  const reestr = await sbT2AktReestrOl(p.obyektId, 'f2');
  const akt = reestr.ok ? (reestr.qatorlar ?? []).find((a) => a.id === p.aktId) : null;
  if (!akt || akt.kompaniya_id !== p.kompaniyaId || !f2DiskkaArxivlansinmi(akt)) return null;
  const y = await d.rpc('t2_hm_yuklab_v1', { p_actor: p.actorId, p_fayl_id: Number(h.body.fayl_id), p_raqam: null });
  if (!y.httpOk || y.body?.ok !== true) return null;
  const bytes = await d.r2Bayt(String(y.body.kalit));
  if (!bytes || !bytes.byteLength) return null;
  const xesh = f2HujjatKaliti(p.obyektId, akt.oy || '', akt.raqam) ?? `akt:${akt.id}:${await mazmunXeshi(bytes)}`;
  return {
    bytes, faylNomi: String(y.body.nom || `F-2_${akt.id}.xlsx`), turi: 'f2_hujjat', obyektId: p.obyektId, davr: akt.oy || null, xesh, arxivla: false,
    manba: f2Manba({ aktId: akt.id, raqam: akt.raqam ?? null, obyekt: akt.obyekt || null, oy: akt.oy || null }),
    diskVersiya: h.body.versiya != null ? Number(h.body.versiya) : null, yangilandi: h.body.yangilandi ?? null,
  };
}
