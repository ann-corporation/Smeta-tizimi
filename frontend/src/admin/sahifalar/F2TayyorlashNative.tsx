import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Eye, Save, Zap } from 'lucide-react';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbT2AktYaratV2, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { sbQatorHolatOl, type QatorHolat } from '../../api/t2-fakt';
import { f2NativePayloadQur, type F2NativeInput } from '../../lib/f2-native-preparation';
import { f2QoralamaHujjat } from '../../lib/f2-native-export';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { NDS_SUKUT_FOIZ } from '../../lib/nakopitelniy-vedomost-export';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import { sbAosrCoverageOl, type AosrCoverage } from '../../api/t2-aosr';

type Draft = Omit<F2NativeInput, 'qatorId'>;
const boshDraft: Draft = { quantity: '', unitPrice: '', amount: '', sourceReference: '', priceIntentionallyAbsent: false };
const oyBoshlanishi = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

/** T1 GASsiz F2 qoralama: only canonical Fakt qoldig'i + exact F2 document values. */
export function F2TayyorlashNative() {
  const { joriy } = useKompaniya();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(joriy?.id);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const workspace = usePTOWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [qatorlar, setQatorlar] = useState<QatorHolat[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [oy, setOy] = useState(oyBoshlanishi());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** АОСР qamrovi (egasi: yashirin ishda АОСР yo'q bo'lsa — ogohlantirish, F2 taqiqlanmaydi). */
  const [aosrsiz, setAosrsiz] = useState<AosrCoverage[]>([]);
  const operationId = useRef(yangiOperationId());
  const obyektId = Number(params.get('obyekt'));
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;

  useEffect(() => {
    if (!joriy?.id) return;
    void sbT2ObyektlarOlKomp(joriy.id).then((result) => setObyektlar((result.ok ? result.qatorlar : []) as T2Obyekt[]));
  }, [joriy?.id]);

  useEffect(() => {
    if (workspace.scope.objectId == null || !obyektlar.some((object) => object.id === workspace.scope.objectId)) return;
    if (workspace.scope.objectId !== obyektId) {
      setParams((old) => {
        const next = new URLSearchParams(old);
        next.set('obyekt', String(workspace.scope.objectId));
        next.delete('obyekt_nomi');
        return next;
      });
    }
  }, [obyektId, obyektlar, setParams, workspace.scope.objectId]);

  const yuklash = useCallback(async () => {
    if (!validId) { setQatorlar([]); return; }
    setLoading(true); setError('');
    try {
      void sbAosrCoverageOl(obyektId).then((c) => setAosrsiz(c.ok ? (c.qatorlar || []).filter((x) => x.yashirin && !x.akt_bor) : [])).catch(() => setAosrsiz([]));
      const result = await sbQatorHolatOl(obyektId);
      if (!result.ok) { setQatorlar([]); setError('F2 uchun kanonik Fakt qoldig‘i o‘qilmadi.'); return; }
      setQatorlar((result.qatorlar || []).filter((row) => row.tur !== 'rz' && row.f2_mumkin_hajm > 0));
      setDrafts({});
      operationId.current = yangiOperationId();
    } catch { setQatorlar([]); setError('F2 uchun ma’lumotlar o‘qilmadi. Qayta urinib ko‘ring.'); }
    finally { setLoading(false); }
  }, [obyektId, validId]);
  useEffect(() => { void yuklash(); }, [yuklash]);

  const tanlangan = useMemo(() => qatorlar.flatMap((row) => {
    const draft = drafts[row.qator_id];
    return draft?.quantity.trim() ? [{ qatorId: row.qator_id, ...draft }] : [];
  }), [drafts, qatorlar]);
  const tekshiruv = useMemo(() => f2NativePayloadQur(tanlangan, qatorlar.map((row) => ({ qatorId: row.qator_id, f2Mumkin: row.f2_mumkin_hajm }))), [tanlangan, qatorlar]);
  const issueMap = useMemo(() => new Map(tekshiruv.issues.map((issue) => [issue.qatorId, issue])), [tekshiruv.issues]);
  const summary = useMemo(() => {
    const qatorById = new Map(qatorlar.map((row) => [row.qator_id, row]));
    const certified = tekshiruv.qatorlar;
    const selectedAmount = certified.reduce((sum, row) => sum + (row.certifiedAmount ?? 0), 0);
    const belowReference = certified.filter((row) => {
      const reference = qatorById.get(row.qatorId)?.smeta_narx;
      return reference != null && row.certifiedUnitPrice != null && row.certifiedUnitPrice < reference;
    }).length;
    const missingBasis = certified.filter((row) => row.priceIntentionallyAbsent).length;
    return {
      selectedRows: tanlangan.length,
      selectedAmount,
      belowReference,
      missingBasis,
      warnings: tekshiruv.issues.length,
      frozenIfApproved: certified.length,
    };
  }, [qatorlar, tanlangan.length, tekshiruv.qatorlar, tekshiruv.issues.length]);
  const aosrsizId = useMemo(() => new Set(aosrsiz.map((x) => x.qator_id)), [aosrsiz]);
  const tanlanganAosrsiz = useMemo(() => tanlangan.filter((x) => aosrsizId.has(x.qatorId)).length, [tanlangan, aosrsizId]);
  const ozgartir = (id: number, next: Partial<Draft>) => setDrafts((old) => ({ ...old, [id]: { ...(old[id] || boshDraft), ...next } }));
  const barchaMumkinniOlish = () => setDrafts((old) => qatorlar.reduce<Record<number, Draft>>((next, row) => ({
    ...next,
    [row.qator_id]: { ...(old[row.qator_id] || boshDraft), quantity: String(row.f2_mumkin_hajm) },
  }), { ...old }));
  const issueText = (code: string) => ({
    QTY_INVALID: 'Hajm 0 dan katta bo‘lishi kerak',
    QTY_EXCEEDS_FAKT: 'Fakt qoldig‘idan oshib ketdi',
    SOURCE_REQUIRED: 'F2 manba raqami/sahifasi kerak',
    PRICE_REQUIRED: 'Sertifikatlangan narx kerak',
    AMOUNT_REQUIRED: 'Hujjat summasi kerak',
    ARITHMETIC_MISMATCH: 'Q×narx va hujjat summasi farq qiladi',
  } as Record<string, string>)[code] || 'Tekshiruv talab qilinadi';

  const saqlash = async () => {
    if (!validId || !tekshiruv.ok || saving) return;
    setSaving(true);
    try {
      const result = await sbT2AktYaratV2({ obyektId, oy, operationId: operationId.current, qatorlar: tekshiruv.qatorlar });
      if (!result.ok) { toast(result.error || result.xabar || 'F2 qoralama yaratilmadi.', 'danger'); return; }
      toast('Kanonik F2 qoralama yaratildi. Tasdiqlash alohida boshqaruv amali.', 'ok');
      await yuklash();
    } catch { toast('Javob olinmadi. Shu amal IDsi bilan qayta urinishingiz mumkin.', 'danger'); }
    finally { setSaving(false); }
  };

  const korinish = useHujjatKorinish();
  const excelYuklash = async (korish = false) => {
    if (!validId || !tekshiruv.ok) return;
    const object = obyektlar.find((item) => item.id === obyektId);
    if (!object) { toast('Kanonik obyekt topilmadi.', 'danger'); return; }
    try {
      const stavka = ndsFoiz.trim() === '' ? null : Number(ndsFoiz.replace(',', '.'));
      // Ikki narx (egasi): к оплате = прямые × Kf — obyekt nakrutka foizlari.
      const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      const h = f2QoralamaHujjat(qatorlar, tekshiruv.qatorlar, {
        obyektNom: object.nom, davr: oy, imzo: tomonlar, ndsFoiz: stavka != null && Number.isFinite(stavka) ? stavka : null,
        nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval,
      });
      if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
    } catch { toast('Forma-2 Excel qoralamasini yaratib bo‘lmadi.', 'danger'); }
  };

  return <Sahifa sarlavha="F2 tayyorlash" tavsif="Fakt qoldig‘idan qoralama; narx va summa faqat F2 manbasidan">
    {korinish.oyna}
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="karta flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[260px] flex-1 text-[12px] font-medium text-text">Obyekt
          <select value={validId ? obyektId : ''} onChange={(event) => { const object = obyektlar.find((item) => item.id === Number(event.target.value)); workspace.setObjectId(object?.id ?? null); setParams({ obyekt: event.target.value, obyekt_nomi: object?.nom || '' }); }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text">
            <option value="">-- kanonik obyektni tanlang --</option>{obyektlar.map((object) => <option key={object.id} value={object.id}>{object.nom}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-text">F2 davri<input type="month" value={oy.slice(0, 7)} onChange={(event) => setOy(`${event.target.value}-01`)} className="mt-1.5 block rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
      </section>
      {!validId && <section className="karta p-4 text-text-dim">Avval obyektni kanonik ro‘yxatdan tanlang.</section>}
      {error && validId && <section role="alert" className="karta flex flex-wrap items-center gap-3 border-danger/40 bg-danger/5 p-4 text-[13px] text-danger"><AlertTriangle size={16} /><span className="flex-1">{error}</span><button type="button" onClick={() => void yuklash()} className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold hover:bg-danger/10">Qayta urinib ko‘rish</button></section>}
      {loading && <div className="skel min-h-[260px] flex-1 rounded-xl" />}
      {validId && !loading && !error && <>
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6" aria-label="F2 tayyorlash xulosasi">
          {[
            ['Tanlangan qatorlar', summary.selectedRows, 'text-text'],
            ['Tanlangan summa', <FmtN key="summa" val={summary.selectedAmount} />, 'text-accent'],
            ['Past narxga tushgan', summary.belowReference, summary.belowReference ? 'text-warn' : 'text-text'],
            ['Narx asosi yo‘q', summary.missingBasis, summary.missingBasis ? 'text-warn' : 'text-text'],
            ['Ogohlantirishlar', summary.warnings, summary.warnings ? 'text-warn' : 'text-text'],
            ['Tasdiqlansa muzlaydi', summary.frozenIfApproved, 'text-text-dim'],
          ].map(([label, value, tone]) => <div key={String(label)} className="karta px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-mute">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p></div>)}
        </section>
        {aosrsiz.length > 0 && <section role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-xs text-text">
          <AlertTriangle size={15} className="shrink-0 text-warn" />
          <span className="flex-1"><b>АОСР yo‘q yashirin ishlar: {aosrsiz.length} ta</b>{tanlanganAosrsiz > 0 && <> — shundan <b>{tanlanganAosrsiz} tasi shu F2 ga tanlangan</b></>}. F2 bloklanmaydi (egasi qarori) — lekin topshirishda АОСР talab qilinadi.</span>
          <button type="button" onClick={() => navigate('/admin/aosr')} className="rounded-lg border border-warn/40 px-3 py-1.5 font-semibold hover:bg-warn/10">АОСР yaratish</button>
        </section>}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
          <div className="flex items-start gap-2 text-xs text-text-dim"><Zap size={15} className="mt-0.5 shrink-0 text-accent" /><span><b className="text-text">Avval hajmni to‘ldiring.</b> Narx, summa va manba F2 hujjatidan kiritiladi; smeta narxi bilan to‘ldirilmaydi.</span></div>
          <button type="button" onClick={barchaMumkinniOlish} disabled={saving || qatorlar.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-surface-2 disabled:opacity-50"><CheckCircle2 size={14} className="text-accent" />Barcha mumkin hajmni olish</button>
        </section>
        <section className="karta min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] text-left text-[12px]"><thead className="sticky top-0 bg-surface-2 text-text-dim"><tr><th className="p-3">Ish / resurs</th><th>F2 mumkin</th><th>Joriy hajm</th><th>Narx</th><th>Hujjat summasi</th><th>Manba</th><th className="p-3">Holat</th></tr></thead>
          <tbody>{qatorlar.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-text-dim">F2 olish mumkin bo‘lgan kanonik Fakt qoldig‘i yo‘q.</td></tr> : qatorlar.map((row) => { const draft = drafts[row.qator_id] || boshDraft; const issue = issueMap.get(row.qator_id); const label = row.kod || row.nom || 'Ish / resurs'; return <tr key={row.qator_id} className="border-t border-border/60 align-top"><td className="p-3"><div className="font-medium">{row.kod || '—'}</div><div>{row.nom}</div><div className="text-text-dim">{row.birlik}</div>{aosrsizId.has(row.qator_id) && <div className="mt-1 inline-block rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">yashirin ish · АОСР yo‘q</div>}</td><td><FmtN val={row.f2_mumkin_hajm} /></td><td><input aria-label={`F2 hajmi: ${label}`} type="number" min="0" value={draft.quantity} onChange={(event) => ozgartir(row.qator_id, { quantity: event.target.value })} className="w-28 rounded border border-border bg-bg px-2 py-1 text-right" /></td><td><input aria-label={`F2 narxi: ${label}`} type="number" disabled={draft.priceIntentionallyAbsent} value={draft.unitPrice} onChange={(event) => ozgartir(row.qator_id, { unitPrice: event.target.value })} className="w-28 rounded border border-border bg-bg px-2 py-1 text-right disabled:opacity-50" /></td><td><input aria-label={`F2 summasi: ${label}`} type="number" disabled={draft.priceIntentionallyAbsent} value={draft.amount} onChange={(event) => ozgartir(row.qator_id, { amount: event.target.value })} className="w-32 rounded border border-border bg-bg px-2 py-1 text-right disabled:opacity-50" /></td><td><input aria-label={`F2 manbasi: ${label}`} value={draft.sourceReference} onChange={(event) => ozgartir(row.qator_id, { sourceReference: event.target.value })} placeholder="F2 №, sahifa" className="w-40 rounded border border-border bg-bg px-2 py-1" /><label className="mt-1 block text-[10px] text-text-dim"><input type="checkbox" checked={draft.priceIntentionallyAbsent} onChange={(event) => ozgartir(row.qator_id, { priceIntentionallyAbsent: event.target.checked })} /> narx hujjatda ataylab yo‘q</label></td><td className="p-3">{issue ? <span className={issue.blocking ? 'text-danger' : 'text-warn'}>{issueText(issue.code)}</span> : draft.quantity ? <span className="text-ok">Tayyor</span> : <span className="text-text-dim">Tanlanmagan</span>}</td></tr>; })}</tbody>
        </table>
      </section></>}
      {validId && qatorlar.length > 0 && <section className="flex flex-wrap items-start gap-3"><div className="min-w-[280px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div><label className="text-[12px] text-text-dim">QQS (НДС) stavkasi, % — hujjat oxirida bir marta<input aria-label="QQS stavkasi" value={ndsFoiz} onChange={(event) => setNdsFoiz(event.target.value)} placeholder="bo‘sh — QQS qo‘shilmaydi" inputMode="decimal" className="ml-2 w-44 rounded border border-border bg-bg px-2 py-1" /></label></section>}
      {validId && <section className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-1 text-[12px] text-text-dim"><AlertTriangle size={14} /> Smeta narxi fallback emas. Arifmetik farq faqat ogohlantirish; hujjat summasi aynan saqlanadi.</p><div className="flex items-center gap-2"><button onClick={() => navigate(`/admin/f2-tarix?obyekt=${obyektId}&obyekt_nomi=${encodeURIComponent(obyektlar.find((item) => item.id === obyektId)?.nom || '')}`)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-text">F2 tarixini ko‘rish</button><button onClick={() => void excelYuklash(false)} disabled={!tekshiruv.ok || saving} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text disabled:opacity-50"><Download size={16} />Forma-2 Excel qoralama</button><button onClick={() => void excelYuklash(true)} disabled={!tekshiruv.ok || saving} title="Проект акта Ф-2 — saytda hujjatdagiday ko‘rish" aria-label="Forma-2 qoralama ko‘rish" className="inline-flex items-center rounded-lg border border-border px-2 py-2 text-sm text-text disabled:opacity-50"><Eye size={16} /></button><button onClick={() => void saqlash()} disabled={!tekshiruv.ok || saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} />{saving ? 'Yaratilmoqda…' : `F2 qoralama yaratish (${tekshiruv.qatorlar.length})`}</button></div></section>}
    </div>
  </Sahifa>;
}

export default F2TayyorlashNative;
