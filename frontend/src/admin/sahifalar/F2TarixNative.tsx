import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw, ShieldAlert } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { PtoStatusChip } from '../../umumiy/ui/PTOUi';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import {
  sbT2AktReestrOl, sbT2ObyektlarOlKomp,
  yangiOperationId, sbOqi, type T2AktReestr, type T2Obyekt,
} from '../../api/supabase';
import { sbT2F2TafsilotOl, type F2Tafsilot } from '../../api/t2-narx';
import { t2AktLifecycleTransition, type PtoLifecycleStatus } from '../../api/t2-akt-lifecycle';
import { f2LifecyclePlan, f2LifecycleError, f2LifecycleLabels } from '../../lib/f2-lifecycle-workflow';

type F2Detail = F2Tafsilot;

const holatMatni: Record<string, string> = {
  qoralama: 'Qoralama',
  tasdiqlangan: 'Tasdiqlangan',
  bekor: 'Bekor qilingan',
};

const reestrMatni: Record<string, string> = {
  mos: 'Mos',
  farq: 'Farq bor',
  jami_nomalum: 'Hujjat jami noma’lum',
};

function xavfsizXato() {
  return 'F2 reestri yoki tafsiloti o‘qilmadi. Birozdan so‘ng qayta urinib ko‘ring.';
}

/**
 * F2 ning kundalik ko‘rib chiqish va tasdiqlash oynasi.
 *
 * Qoralama alohida ko‘rinadi, lekin LRV/Nakopitelniyga faqat tasdiqlangan
 * hujjat ta’sir qiladi. Qator summasi `gorunish_*` orqali read-modeldan
 * olinadi; bu komponentda qty*price hisoblanmaydi.
 */
export function F2TarixNative() {
  const { joriy } = useKompaniya();
  const workspace = usePTOWorkspace();
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [reestr, setReestr] = useState<T2AktReestr[]>([]);
  const [tafsilot, setTafsilot] = useState<F2Detail[]>([]);
  const [selectedAktId, setSelectedAktId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [error, setError] = useState('');

  const obyektId = Number(params.get('obyekt'));
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;
  const f2Reestr = useMemo(() => reestr.filter((a) => a.tur === 'f2'), [reestr]);
  const selectedAkt = f2Reestr.find((a) => a.id === selectedAktId) ?? f2Reestr[0] ?? null;
  const selectedLines = useMemo(
    () => selectedAkt ? tafsilot.filter((line) => line.akt_id === selectedAkt.id) : [],
    [selectedAkt, tafsilot],
  );
  const selectedArithmeticIssues = useMemo(() => selectedLines.filter((line) => {
    const quantity = line.gorunish_hajm ?? line.certified_quantity ?? line.hajm;
    const unitPrice = line.gorunish_narx ?? line.certified_unit_price ?? line.narx;
    const amount = line.gorunish_summa ?? line.certified_amount ?? line.summa;
    return quantity != null && unitPrice != null && amount != null && Number.isFinite(Number(quantity)) && Number.isFinite(Number(unitPrice)) && Number.isFinite(Number(amount)) && Math.abs(Number(quantity) * Number(unitPrice) - Number(amount)) > 0.005;
  }), [selectedLines]);

  useEffect(() => {
    if (!joriy?.id) { setObyektlar([]); return; }
    void sbT2ObyektlarOlKomp(joriy.id).then((r) => {
      setObyektlar((r.ok ? r.qatorlar : []) as T2Obyekt[]);
    });
  }, [joriy?.id]);

  const yuklash = useCallback(async () => {
    if (!validId) { setReestr([]); setTafsilot([]); setSelectedAktId(null); return; }
    setLoading(true); setError('');
    try {
      const [r, d] = await Promise.all([
        sbT2AktReestrOl(obyektId),
        sbT2F2TafsilotOl({ obyektId, tur: 'f2' }),
      ]);
      if (!r.ok) throw new Error(xavfsizXato());
      setReestr((r.qatorlar || []) as T2AktReestr[]);
      if (!d.ok) throw new Error(xavfsizXato());
      setTafsilot((d.qatorlar || []) as F2Detail[]);
      setSelectedAktId((old) => {
        const available = ((r.qatorlar || []) as T2AktReestr[]).filter((a) => a.tur === 'f2');
        return old && available.some((a) => a.id === old) ? old : (available[0]?.id ?? null);
      });
    } catch (e) {
      setReestr([]); setTafsilot([]); setSelectedAktId(null);
      setError(e instanceof Error && e.message === xavfsizXato() ? e.message : xavfsizXato());
    } finally { setLoading(false); }
  }, [obyektId, validId]);

  useEffect(() => { void yuklash(); }, [yuklash]);

  async function holatniOzgartir(akt: T2AktReestr, statuses: readonly ('submitted' | 'checked' | 'approved' | 'rejected' | 'cancelled')[], reason?: string) {
    if (akt.holat !== 'qoralama' || savingId != null) return;
    const sabab = reason?.trim() || null;
    if (statuses.includes('rejected') || statuses.includes('cancelled')) {
      if (!sabab) { toast('Rad etish/bekor qilish sababi majburiy.', 'danger'); return; }
    }
    setSavingId(akt.id); setError('');
    try {
      const kompaniyaId = workspace.companyId ?? joriy?.id;
      if (!kompaniyaId) { toast('Faol kompaniya tanlanmagan.', 'danger'); return; }
      const live = await sbOqi<{ id: number; versiya: number; lifecycle_status: PtoLifecycleStatus }>({
        jadval: 't2_akt', filtr: `id=eq.${akt.id}&kompaniya_id=eq.${kompaniyaId}&obyekt_id=eq.${obyektId}`,
        ustunlar: 'id,versiya,lifecycle_status', limit: 1,
      });
      const current = live.ok ? live.qatorlar?.[0] : null;
      if (!current) { toast('Hujjatning joriy holatini tekshirib bo‘lmadi. Sahifani yangilang.', 'danger'); return; }
      const target = statuses.at(-1);
      if (target !== 'approved' && target !== 'rejected' && target !== 'cancelled') return;
      const plan = f2LifecyclePlan(current.lifecycle_status, target);
      if (plan === null) { toast('Bu hujjatning joriy holatida ushbu amal bajarilmaydi.', 'danger'); return; }
      let expectedVersion = current.versiya;
      for (const toStatus of plan) {
        const result = await t2AktLifecycleTransition({
          kompaniyaId,
          aktId: akt.id,
          toStatus,
          expectedVersion,
          operationId: yangiOperationId(),
          reason: sabab,
        });
        if (!result.ok) {
          toast(f2LifecycleError(result.code), 'danger', undefined, 9000);
          return;
        }
        expectedVersion = result.version ?? expectedVersion + 1;
      }
      toast(statuses.at(-1) === 'approved' ? 'F2 tasdiqlandi; LRV va Nakopitelniy yangilanadi.' : 'F2 lifecycle holati saqlandi.', 'ok');
      setActionReason('');
    } catch {
      toast('F2 tasdiqlash javobi olinmadi. Shu hujjatni qayta yubormang; avval yangilang.', 'danger', undefined, 9000);
    } finally { await yuklash(); setSavingId(null); }
  }

  async function tasdiqlash(akt: T2AktReestr) {
    await holatniOzgartir(akt, ['submitted', 'checked', 'approved']);
  }

  return (
    <Sahifa
      sarlavha="F2 tarixi va tasdiqlash"
      tavsif="Qoralama ko‘rib chiqiladi; faqat tasdiqlangan aniq manba LRV va Nakopitelniyga kiradi"
      amallar={<button onClick={() => void yuklash()} disabled={!validId || loading} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yangilash</button>}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <section className="karta flex flex-wrap items-end gap-3 p-3">
          <label className="min-w-[280px] flex-1 text-[12px] font-medium text-text">Kanonik obyekt
            <select aria-label="Kanonik obyekt" value={validId ? String(obyektId) : ''} onChange={(e) => { const nextId = Number(e.target.value); const object = obyektlar.find((item) => item.id === nextId); workspace.setObjectId(Number.isSafeInteger(nextId) && nextId > 0 ? nextId : null); setParams({ obyekt: e.target.value, obyekt_nomi: object?.nom || '' }); }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text">
              <option value="">-- obyektni tanlang --</option>
              {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </label>
          <div className="text-[12px] text-text-dim">{f2Reestr.length} ta F2 hujjati · {f2Reestr.filter((a) => a.holat === 'tasdiqlangan').length} tasi tasdiqlangan</div>
        </section>

        {!validId && <section className="karta p-4 text-[13px] text-text-dim">Avval kanonik obyektni tanlang.</section>}
        {error && <section role="alert" className="karta flex items-center gap-2 border-danger/40 bg-danger/5 p-4 text-[13px] text-danger"><ShieldAlert size={16} /> {error}</section>}
        {loading && <div className="skel min-h-[280px] flex-1 rounded-xl" />}

        {validId && !loading && !error && (
          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.4fr)]">
            <section className="karta min-h-0 overflow-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-surface-2 text-text-dim"><tr><th className="p-3">Davr / hujjat</th><th>Holat</th><th className="text-right">Jami</th><th className="p-3" /></tr></thead>
                <tbody>
                  {f2Reestr.map((akt) => {
                    const active = (selectedAkt?.id ?? null) === akt.id;
                    return <tr key={akt.id} className={`border-t border-border/60 align-top ${active ? 'bg-accent/10' : ''}`}>
                      <td className="p-3"><button className="text-left" onClick={() => setSelectedAktId(akt.id)}><div className="font-medium text-text">{akt.oy?.slice(0, 7) || 'Davr noma’lum'}</div><div className="text-text-dim">{akt.raqam || 'F2 hujjati'}</div></button></td>
                      <td><PtoStatusChip label={(akt.lifecycle_status ? f2LifecycleLabels[akt.lifecycle_status] : holatMatni[akt.holat]) || 'Noma’lum holat'} tone={akt.holat === 'tasdiqlangan' ? 'success' : akt.holat === 'qoralama' ? 'warning' : 'unknown'} /><div className="mt-1 text-[10px] text-text-mute">{reestrMatni[akt.reestr_holat] || 'Tekshirilmagan'}</div></td>
                      <td className="text-right tabular-nums"><FmtN val={akt.hujjat_jami} /><div className="text-[10px] text-text-mute">{akt.qator_soni ?? '—'} qator</div></td>
                      <td className="p-3 text-right">{akt.holat === 'qoralama' && <button onClick={() => void tasdiqlash(akt)} disabled={savingId != null} className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] text-white disabled:opacity-50"><CheckCircle2 size={13} />{savingId === akt.id ? '…' : 'Tasdiqlash'}</button>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {f2Reestr.length === 0 && <div className="p-5 text-[13px] text-text-dim">Bu obyektda F2 hujjati hali yo‘q.</div>}
            </section>

            <section className="karta min-h-0 overflow-auto p-4">
              {selectedAkt ? <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-text"><FileText size={16} className="text-accent" />{selectedAkt.raqam || 'F2 hujjati'}</h2><p className="mt-1 text-[11px] text-text-dim">{selectedAkt.oy?.slice(0, 7)} · {(selectedAkt.lifecycle_status ? f2LifecycleLabels[selectedAkt.lifecycle_status] : holatMatni[selectedAkt.holat]) || 'Noma’lum holat'} · manba qatorlari: {selectedLines.length}</p>{selectedAkt.holat === 'tasdiqlangan' && <span className="mt-2 inline-flex items-center rounded-full border border-ok/25 bg-ok/5 px-2.5 py-1 text-[11px] text-ok">Tasdiqlangan davr · tarix muzlatilgan</span>}{selectedArithmeticIssues.length > 0 && <span className="ml-2 mt-2 inline-flex items-center rounded-full border border-warn/25 bg-warn/5 px-2.5 py-1 text-[11px] text-warn">{selectedArithmeticIssues.length} ta arifmetik farq</span>}</div><div className="text-right text-[12px] text-text-dim">Hujjat jami <b className="text-text"><FmtN val={selectedAkt.hujjat_jami} /></b><br />O‘qilgan jami <b className="text-text"><FmtN val={selectedAkt.yozilgan_jami} /></b></div></div>
                <table className="w-full text-left text-[12px]"><thead className="text-text-dim"><tr><th className="py-2">Ish / resurs</th><th className="text-right">Hajm</th><th className="text-right">Narx</th><th className="text-right">Summa</th><th>Manba</th></tr></thead><tbody>{selectedLines.map((line) => { const quantity = line.gorunish_hajm ?? line.certified_quantity ?? line.hajm; const unitPrice = line.gorunish_narx ?? line.certified_unit_price ?? line.narx; const amount = line.gorunish_summa ?? line.certified_amount ?? line.summa; const mismatch = quantity != null && unitPrice != null && amount != null && Number.isFinite(Number(quantity)) && Number.isFinite(Number(unitPrice)) && Number.isFinite(Number(amount)) && Math.abs(Number(quantity) * Number(unitPrice) - Number(amount)) > 0.005; return <tr key={line.akt_qator_id} className="border-t border-border/60"><td className="py-2"><div className="font-medium">{line.kod || '—'}</div><div>{line.nom || 'Nomsiz qator'}</div><div className="text-[10px] text-text-dim">{line.birlik || '—'}</div></td><td className="text-right tabular-nums"><FmtN val={quantity} /></td><td className="text-right tabular-nums"><FmtN val={unitPrice} /></td><td className="text-right tabular-nums"><FmtN val={amount} />{mismatch && <div className="text-[10px] text-warn">Q×narx farqi</div>}</td><td className="text-text-dim">{line.provenance_status ? 'Qayd etilgan' : 'Manba qaydi mavjud'}</td></tr>; })}</tbody></table>
                {selectedLines.length === 0 && <div className="p-5 text-[13px] text-text-dim">Bu hujjatda qator tafsiloti yo‘q. Tasdiqlashdan oldin manba va moslashtirishni tekshiring.</div>}
                {selectedAkt.holat === 'qoralama' && <>
                  <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-100"><ShieldAlert size={15} className="mt-0.5 shrink-0" />Qoralama hali LRVning tasdiqlangan F2 tarixiga kirmaydi. Tasdiqlash amaldagi ma’lumot va hajm chegaralarini qayta tekshiradi.</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border/60 p-3">
                    <label className="min-w-[260px] flex-1 text-[11px] text-text-dim">Rad etish yoki bekor qilish sababi
                      <input aria-label="F2 lifecycle sababi" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Sababni yozing" className="mt-1 block w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text" />
                    </label>
                    <button type="button" onClick={() => void holatniOzgartir(selectedAkt, ['submitted', 'checked', 'rejected'], actionReason)} disabled={savingId != null} className="rounded-md border border-danger/40 px-2.5 py-1.5 text-[11px] text-danger disabled:opacity-50">Rad etish</button>
                    <button type="button" onClick={() => void holatniOzgartir(selectedAkt, ['cancelled'], actionReason)} disabled={savingId != null} className="rounded-md border border-warn/40 px-2.5 py-1.5 text-[11px] text-warn disabled:opacity-50">Bekor qilish</button>
                  </div>
                </>}
              </> : <div className="p-5 text-[13px] text-text-dim">Tafsilotlarni ko‘rish uchun F2 hujjatini tanlang.</div>}
            </section>
          </div>
        )}
      </div>
    </Sahifa>
  );
}

export default F2TarixNative;
