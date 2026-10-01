import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Target } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { SmetaTree } from '../../umumiy/daraxt/SmetaTree';
import { useT2Daraxt } from '../../umumiy/daraxt/useT2Daraxt';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { sbFaktBelgilaV2, sbFaktYoz } from '../../api/t2-fakt';
import type { TreeNode } from '../../api/types';
import { faktQoldaKiritiladimi } from '../../lib/fakt-input-policy';
import { toast } from '../../umumiy/ui/Toast';
import { FaktJurnal } from './FaktJurnal';

function walk(nodes: TreeNode[], fn: (n: TreeNode) => void) { for (const n of nodes) { fn(n); if (n.children) walk(n.children, fn); } }

export function FaktNative() {
  const { joriy } = useKompaniya(); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [marker, setMarker] = useState(''); const [saving, setSaving] = useState(false);
  /** Egasi 2026-10-01: tezkor jadval (ko'p qatorni bir yo'la saqlash) asosiy ko'rinish; daraxt — ixtiyoriy. */
  const [korinish, setKorinish] = useState<'tezkor' | 'daraxt'>('tezkor');
  const obyektId = Number(params.get('obyekt')); const valid = Number.isSafeInteger(obyektId) && obyektId > 0; const selected = obyektlar.find(o => o.id === obyektId);
  const { rows, states, tree, price, loading, yangilanmoqda, error, yuklash, holatniYangila } = useT2Daraxt(valid ? obyektId : null);
  const markers = useMemo(() => Array.from(new Set(rows.filter(r => faktQoldaKiritiladimi(r.tur || '') && r.kat?.trim()).map(r => r.kat!.trim()))).sort(), [rows]);
  const smetaJami = states.reduce((s, r) => s + (r.smeta_hajm || 0), 0); const faktJami = states.reduce((s, r) => s + (r.fakt_hajm || 0), 0);
  useEffect(() => { if (joriy?.id) void sbT2ObyektlarOlKomp(joriy.id).then(r => setObyektlar((r.ok ? r.qatorlar : []) as T2Obyekt[])); }, [joriy?.id]);
  const faktSaqlash = useCallback(async (node: TreeNode, mode: 'qoshish' | 'jami', value: number) => {
    if (!valid || node.id == null) return { ok: false, message: 'Kanonik qator ID topilmadi.' };
    if (!faktQoldaKiritiladimi(node.type)) return { ok: false, message: 'Bu qatorga Fakt qo‘lda kiritilmaydi.' };
    const sana = new Date().toISOString().slice(0, 10); const operationId = yangiOperationId();
    if (mode === 'qoshish') { const r = await sbFaktYoz({ obyektId, sana, operationId, qatorlar: [{ qator_id: node.id, hajm: value }], izoh: 'Fakt daraxtidan kanonik qo‘shish' }); if (!r.ok) return { ok: false, message: r.error || r.xabar || 'Fakt qo‘shilmadi.' }; }
    else { const r = await sbFaktBelgilaV2({ obyektId, qatorId: node.id, expectedFaktHajm: Number(node.fakt || 0), yangiFaktHajm: value, sana, operationId, izoh: 'Fakt daraxtidan kanonik jami tahriri' }); if (!r.ok) return { ok: false, conflict: r.code === 'FAKT_CONFLICT', message: r.code === 'FAKT_CONFLICT' ? 'Qator serverda o‘zgargan. Yangilang.' : (r.error || r.xabar || 'Fakt saqlanmadi.') }; }
    // Faqat shu qator, ota-bobolari va bolalari qayta o'qiladi; daraxt ekranda qoladi.
    await holatniYangila(node.id); return { ok: true };
  }, [obyektId, valid, holatniYangila]);
  const yuz = async () => {
    if (!marker || saving) return; const targets: TreeNode[] = []; walk(tree, n => { if (faktQoldaKiritiladimi(n.type) && String(n.kat || '').trim() === marker && n.smetaHajm != null && n.fakt !== n.smetaHajm) targets.push(n); });
    if (!targets.length) { toast('Bu markirovkada bajarilmagan hajm topilmadi.', 'warn'); return; } setSaving(true); let ok = 0; let fail = 0;
    try { for (const n of targets) { const r = await sbFaktBelgilaV2({ obyektId, qatorId: n.id!, expectedFaktHajm: Number(n.fakt || 0), yangiFaktHajm: n.smetaHajm!, sana: new Date().toISOString().slice(0, 10), operationId: yangiOperationId(), izoh: `Markirovka ${marker} bo‘yicha 100% Fakt` }); if (r.ok) ok++; else fail++; } toast(`${ok} ta qator 100% ga belgilandi${fail ? `, ${fail} ta qator saqlanmadi` : ''}.`, fail ? 'warn' : 'ok'); await holatniYangila(); } catch { toast('100% belgilash vaqtida javob olinmadi.', 'danger'); } finally { setSaving(false); }
  };
  const birinchiYuklash = loading && tree.length === 0;
  return <Sahifa sarlavha="Bajarilgan ishlar (Fakt)" tavsif="Smeta hajmi va Faktni RZ → BL → RS/MAT/OB daraxtida boshqaring">
    <div className="flex h-full min-h-0 flex-col gap-3"><section className="karta flex flex-wrap items-end gap-3 p-3"><label className="min-w-[260px] flex-1 text-[12px] font-medium text-text">Obyekt<select aria-label="Obyekt" value={valid ? obyektId : ''} onChange={e => { const o = obyektlar.find(x => x.id === Number(e.target.value)); setParams({ obyekt: e.target.value, obyekt_nomi: o?.nom || '' }); }} className="input mt-1.5 block h-9 w-full px-2 text-[13px]"><option value="">-- obyektni tanlang --</option>{obyektlar.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>{valid && <button onClick={() => navigate(`/admin/holat/${obyektId}?obyekt_nomi=${encodeURIComponent(selected?.nom || '')}`)} className="rounded-lg border border-border px-3 py-2 text-[12px]">LRVga qaytish</button>}{valid && <button onClick={() => navigate(`/admin/f2-tayyorlash?obyekt=${obyektId}`)} className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-[12px] font-semibold text-text hover:bg-accent/10">F2 tayyorlash →</button>}{valid && <button onClick={() => void yuklash()} disabled={loading || yangilanmoqda || saving} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px]"><RefreshCw size={14} className={yangilanmoqda ? 'animate-spin' : undefined}/> Yangilash</button>}{yangilanmoqda && <span role="status" className="text-[11px] text-text-mute">Yangilanmoqda…</span>}{valid && <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-1" aria-label="Fakt ko‘rinishi">{([['tezkor', 'Fakt jurnali'], ['daraxt', 'Daraxt']] as const).map(([k, l]) => <button key={k} aria-pressed={korinish === k} onClick={() => setKorinish(k)} className={`rounded-md px-2.5 py-1 text-[12px] ${korinish === k ? 'bg-accent/15 text-text' : 'text-text-dim hover:text-text'}`}>{l}</button>)}</div>}</section>
      {valid && korinish === 'daraxt' && !birinchiYuklash && !error && tree.length > 0 && <section className="karta flex flex-wrap items-end gap-3 p-3" aria-label="Fakt markirovka boshqaruvi"><span className="text-[12px] text-text-dim"><b className="text-text">Smeta:</b> {smetaJami.toLocaleString('ru-RU')} · <b className="text-text">Fakt:</b> {faktJami.toLocaleString('ru-RU')}</span><label className="min-w-[220px] text-[12px] font-medium text-text">Markirovka bo‘yicha 100%<select aria-label="Fakt markirovkasi" value={marker} onChange={e => setMarker(e.target.value)} className="input mt-1 block h-9 w-full px-2"><option value="">Markirovkani tanlang</option>{markers.map(m => <option key={m} value={m}>{m}</option>)}</select></label><button onClick={() => void yuz()} disabled={!marker || saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"><Target size={14}/> {saving ? 'Belgilanmoqda…' : '100% qilish'}</button><span className="text-[11px] text-text-mute">Faqat BL/MAT/OB; RS avtomatik hisoblanadi.</span></section>}
      {!valid && <section className="karta p-4 text-text-dim">Avval kanonik obyektni tanlang.</section>}{error && valid && <section role="alert" className="karta flex items-center gap-2 border-danger/40 bg-danger/5 p-4 text-danger"><AlertTriangle size={16}/>{error}</section>}{birinchiYuklash && <div className="skel min-h-[280px] flex-1 rounded-xl"/>}{valid && joriy?.id && !birinchiYuklash && !error && (korinish === 'tezkor' || tree.length === 0) && <FaktJurnal kompaniyaId={joriy.id} obyektId={obyektId} rows={rows} states={states} holatniYangila={() => holatniYangila()} tuzilmaniYangila={() => yuklash()} />}{korinish === 'daraxt' && tree.length > 0 && <div className="min-h-0 flex-1"><SmetaTree data={tree} priceControlLines={price} onFaktSave={faktSaqlash} onQatorTahrirlandi={yuklash}/></div>}
    </div></Sahifa>;
}
export default FaktNative;
