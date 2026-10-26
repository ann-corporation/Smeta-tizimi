/**
 * HujjatNazoratPage.tsx — canonical /admin/hujjat-nazorat.
 * The visible SMETA/F2/NAKOPITELNIY document-control workbench: it feeds the
 * generic Codex <ConstructionDocumentWorkbench> from the REAL canonical read
 * model (t2_workbench_v1 via /api/hujjat-nazorat). No Drive/Sheets/GAS. No demo
 * data. Forma-3 legal totals stay intentionally unavailable (FORMA3_RULE_UNRESOLVED).
 * EGALIK: Claude (integration lane).
 */
import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConstructionDocumentWorkbench } from '../../components/construction-document-control';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { t } from '../../i18n/til';
import { sbT2LoyihalarOl, type Loyiha } from '../../api/t2-loyiha';
import { useHujjatNazoratModel, progressValuationPage } from '../../api/t2-document-control';

export default function HujjatNazoratPage() {
  const { joriy } = useKompaniya();
  const [loyihalar, setLoyihalar] = useState<Loyiha[]>([]);
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [davr, setDavr] = useState('');
  const [qidiruv, setQidiruv] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [pageOffset, setPageOffset] = useState(0);

  useEffect(() => {
    if (!joriy?.id) { setLoyihalar([]); setLoyihaId(null); setObyektId(null); return; }
    sbT2LoyihalarOl(joriy.id).then((r) => {
      const rows = (r.ok ? (r.qatorlar as Loyiha[]) : []) || [];
      setLoyihalar(rows);
      setLoyihaId((p) => p ?? rows[0]?.id ?? null);
    });
  }, [joriy?.id]);

  const loyiha = useMemo(() => loyihalar.find((l) => l.id === loyihaId) ?? null, [loyihalar, loyihaId]);
  useEffect(() => { setObyektId((p) => (loyiha?.obyektlar.some((o) => o.obyekt_id === p) ? p : loyiha?.obyektlar[0]?.obyekt_id ?? null)); setDavr(''); setQidiruv(''); setSectionId(''); setPageOffset(0); }, [loyiha]);

  const q = useHujjatNazoratModel(obyektId, davr || null);
  const model = q.data;
  const pageSize = 300;
  const page = useMemo(() => (model ? progressValuationPage(model, { limit: pageSize, offset: pageOffset, search: qidiruv, sectionId: sectionId || undefined }) : null), [model, pageOffset, qidiruv, sectionId]);
  const sectionOptions = useMemo(() => {
    if (!model) return [];
    const labels = new Map<string, string>();
    for (const line of model.valuation.lines) if (!labels.has(line.sectionId)) labels.set(line.sectionId, line.description || t('Bo‘lim {n}', { n: labels.size + 1 }));
    return [...labels.entries()];
  }, [model]);
  const notApplied = (q.error as any)?.code === 'HTTP_501';
  const noPerm = (q.error as any)?.code === 'HTTP_403';

  if (!joriy?.id) return <KompaniyaKerak nima="Hujjat nazorati (F2/Nakopitelniy)" />;

  const sel = 'mt-1 block w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] text-text';
  const yorliq = 'min-w-[200px] text-[12px] font-medium text-text-dim';
  const sahifaMatn = page ? (page.totalCount === 0 ? t('Qator topilmadi') : t('{a}–{b} / {n} qator', { a: page.query.offset + 1, b: page.query.offset + page.rows.length, n: page.totalCount })) : '';
  return (
    <Sahifa sarlavha="Nakopitelniy va tasdiqlangan F2" tavsif="Smeta, o‘zgarishlar, F2 davrlari va yopilish dalillarini bitta kanonik ish oynasida tekshiring."
      amallar={<span className="fz-stamp fz-stamp--ok" title={t('Ma’lumot manbai: kanonik read-model (t2_workbench_v1)')}>{t('jonli maʼlumot')}</span>}>
      <div className="flex flex-col gap-3 text-text">
        <section className="fz-card flex flex-wrap items-end gap-3 p-3" aria-label={t('Tanlov')}>
          <label className={yorliq}>{t('Loyiha')}
            <select className={sel} value={loyihaId ?? ''} onChange={(e) => { setLoyihaId(Number(e.target.value) || null); setPageOffset(0); }}>
              {loyihalar.length === 0 && <option value="">{t('— loyiha yo‘q —')}</option>}
              {loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </label>
          <label className={yorliq}>{t('Obyekt')}
            <select className={sel} value={obyektId ?? ''} onChange={(e) => { setObyektId(Number(e.target.value) || null); setPageOffset(0); }}>
              {(loyiha?.obyektlar ?? []).length === 0 && <option value="">{t('— obyekt yo‘q —')}</option>}
              {(loyiha?.obyektlar ?? []).map((o) => <option key={o.obyekt_id} value={o.obyekt_id}>{o.obyekt_nom}</option>)}
            </select>
          </label>
          <label className={yorliq}>{t('Davr')}<select className={sel} value={davr} onChange={(e) => { setDavr(e.target.value); setPageOffset(0); }}><option value="">{t('Joriy tasdiqlangan davr')}</option>{(model?.valuation.periods ?? []).map((period) => <option key={period.periodId} value={period.periodId}>{period.label}</option>)}</select></label>
          <label className={yorliq}>{t('Bo‘lim')}<select className={sel} value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPageOffset(0); }}><option value="">{t('Barcha bo‘limlar')}</option>{sectionOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] text-text-dim"><Search size={14} /><input aria-label="Nakopitelniy qatoridan qidirish" value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); setPageOffset(0); }} placeholder={t('Ish / resurs qidirish…')} className="min-w-0 flex-1 border-0 bg-transparent text-text outline-none" style={{ boxShadow: 'none' }} /></label>
        </section>

        {notApplied && <p className="fz-note fz-note--info max-w-3xl"><Info aria-hidden="true" />{t('Hujjat nazorati bu obyekt uchun hozircha mavjud emas.')}</p>}
        {noPerm && <p className="fz-note fz-note--warn max-w-3xl"><Info aria-hidden="true" />{t('Bu obyekt uchun ruxsat yo‘q.')}</p>}
        {q.isLoading && <Skelet qatorlar={6} />}
        {q.isError && !notApplied && !noPerm && (
          <div role="alert" className="fz-note fz-note--danger" style={{ alignItems: 'center' }}><span className="flex-1">{t('Ma’lumotlarni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.')}</span><button type="button" onClick={() => void q.refetch()} className="fz-btn fz-btn--danger fz-btn--sm">{t('Qayta urinish')}</button></div>
        )}

        {model && page && <>
          <ConstructionDocumentWorkbench model={model} page={page} />
          <div className="fz-card flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-text-dim" aria-label="Nakopitelniy sahifalash"><span className="tabular-nums">{sahifaMatn}</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPageOffset((old) => Math.max(0, old - pageSize))} disabled={pageOffset === 0} className="fz-btn fz-btn--sm"><ChevronLeft size={14} />{t('Oldingi')}</button><button type="button" onClick={() => setPageOffset((old) => old + pageSize)} disabled={pageOffset + page.rows.length >= page.totalCount} className="fz-btn fz-btn--sm">{t('Keyingi')}<ChevronRight size={14} /></button></div></div>
        </>}
      </div>
    </Sahifa>
  );
}
