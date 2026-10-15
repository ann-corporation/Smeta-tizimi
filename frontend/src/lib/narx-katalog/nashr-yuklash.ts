/**
 * Superadmin: built index → /api/narx-katalog-nashr (files in ≤ 8 MB batches, then activation). Generic price lists
 * (a manufacturer's own Excel layout) become an edition via the shared column reader; VAT is confirmed by the admin.
 */
import type { NarxManbaQatorKirish } from '../../api/t2-narx-dalil';
import type { Nashr } from './manba-xls';
import type { QurilganReviziya } from './nashr-birlashtir';

async function post(body: unknown): Promise<{ ok: boolean; code?: string; [k: string]: unknown }> {
  try {
    const r = await fetch('/api/narx-katalog-nashr', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ ok: false, code: 'HTTP_' + r.status }));
  } catch { return { ok: false, code: 'NETWORK' }; }
}

export async function reviziyaniNashrQil(rev: QurilganReviziya, jarayon?: (yuklandi: number, jami: number) => void): Promise<{ ok: boolean; code?: string; previous?: string | null }> {
  const LIMIT = 8 * 1024 * 1024;
  let batch: QurilganReviziya['files'] = [], size = 0, done = 0;
  const flush = async () => {
    if (!batch.length) return true;
    const r = await post({ amal: 'fayllar', revision: rev.revision, files: batch.map(f => ({ path: f.path, sha256: f.sha256, text: f.text })) });
    if (!r.ok) throw new Error(r.code ?? 'UPLOAD_FAILED');
    done += batch.length; jarayon?.(done, rev.files.length); batch = []; size = 0;
    return true;
  };
  try {
    for (const f of rev.files) {
      if (size + f.bytes > LIMIT) await flush();
      batch.push(f); size += f.bytes;
    }
    await flush();
  } catch (e) { return { ok: false, code: e instanceof Error ? e.message : 'UPLOAD_FAILED' }; }
  const a = await post({ amal: 'faollashtir', revision: rev.revision, manifest: rev.manifest });
  return a.ok ? { ok: true, previous: (a.previous as string | null) ?? null } : { ok: false, code: a.code };
}

/** A manufacturer's / supplier's price list (any layout read by the column reader or the AI) → an edition. */
export function praysNashri(p: { nom: string; yetkazuvchi: string; sana: string | null; nds: 'nds_bilan' | 'nds_siz'; hudud: string | null; qatorlar: NarxManbaQatorKirish[] }): Nashr {
  const qatorlar = p.qatorlar.filter(q => q.narx != null && q.narx > 0 && q.nom?.trim() && q.birlik?.trim()).map(q => ({
    nom: q.nom.trim(), birlik: (q.birlik ?? '').trim(), narx: p.nds === 'nds_bilan' ? Math.round(((q.narx as number) / 1.12) * 100) / 100 : (q.narx as number),
    hudud: p.hudud, zavod: p.yetkazuvchi || null, guruh: q.guruh ?? null, sana: p.sana, izoh: p.nds === 'nds_bilan' ? `цена прайс-листа ${q.narx} с НДС, НДС 12% исключён` : null }));
  const y = p.sana ? Number(p.sana.slice(0, 4)) : null, m = p.sana ? Number(p.sana.slice(5, 7)) : null;
  return { tur: 'prays', nom: p.nom, yetkazuvchi: p.yetkazuvchi || null, yil: y, kvartal: m ? Math.ceil(m / 3) : null, oy: m, sana: p.sana, qatorlar,
    hisob: { varaqlar: 1, olinmaganVaraqlar: [], qatorlar: qatorlar.length, narxsiz: p.qatorlar.length - qatorlar.length, hisoblanganQqs: p.nds === 'nds_bilan' ? qatorlar.length : 0 } };
}
