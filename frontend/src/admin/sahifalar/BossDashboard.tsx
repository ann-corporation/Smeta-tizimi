/**
 * RAHBAR PANELI — kompaniya portfeli bir qarashda (Firuza ko'rinishi, 2026-10-25).
 * Tartib: 1) xulosa raqamlari (birinchi ko'rinadi), 2) boshqaruv markazi (ExecutiveCockpit),
 * 3) tekshirish kerak bo'lgan signallar va qayd etilgan moliya, 4) obyektlar jadvali (yig'ma bo'lim).
 * Hisob o'zgarmagan: barcha qiymatlar `useBossDashboard` va `boss-decision/model` dan; noma'lum — «—», nol emas.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, FileDown, RefreshCw } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { KpiKarta, Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { useBossDashboard } from '../../api/t2-boss';
import type { BossSignal } from '../../api/t2-boss';
import { t } from '../../i18n/til';
import { amount, filteredObjects, objectUrl, projectUrl, signalUrl, sortedSignals, trustedExecutive, type BossExecutive, type ExecutiveObject } from '../../components/boss-decision/model';
import Reports from '../../components/boss-decision/Reports';
import ExecutiveCockpit from '../../components/boss-decision/ExecutiveCockpit';

type Dashboard = NonNullable<ReturnType<typeof useBossDashboard>['data']>;

const nf = new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 2 });
const money = (value: unknown) => { const n = amount(value); return n == null ? '—' : nf.format(n) + ' UZS'; };
const vaqt = (iso: string | null | undefined, sana = false) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '—';
  const d = new Date(iso);
  return sana ? d.toLocaleDateString() : d.toLocaleString();
};

export default function BossDashboard() {
  const { joriy } = useKompaniya();
  const q = useBossDashboard(joriy?.id);
  if (!joriy?.id) return <KompaniyaKerak nima={t('Rahbar paneli')} />;
  const data = q.data?.kompaniya.kompaniya_id === joriy.id ? q.data : undefined;
  const yangila = () => void q.refetch();
  return (
    <Sahifa sarlavha={t('Rahbar paneli')} tavsif={t('Holat, e’tibor talab qiladigan ishlar va ularning asoslari.')}
      amallar={<>
        <span className="text-[12px] text-text-mute">{joriy.nom}</span>
        <button type="button" onClick={yangila} className="fz-btn fz-btn--ghost" disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />{t('Yangilash')}
        </button>
      </>}>
      <div className="os-workbench mx-auto flex w-full max-w-[1680px] flex-col gap-5 text-text">
        {q.isLoading && <Skelet qatorlar={6} />}
        {q.isError && <div role="alert" className="fz-note fz-note--danger">
          <AlertTriangle aria-hidden="true" />
          <span>{t('Rahbar paneli yuklanmadi. Qayta urinib ko‘ring.')}</span>
          <button type="button" className="fz-btn fz-btn--sm ml-auto" onClick={yangila}>{t('Qayta urinish')}</button>
        </div>}
        {data && !q.isError && <Portfolio key={joriy.id} data={data} />}
      </div>
    </Sahifa>
  );
}

/** 1) Xulosa — to'rtta asosiy raqam. Smeta va F2 nisbatidan foiz chiqarilmaydi (hisob asoslari har xil). */
function Xulosa({ data, e }: { data: Dashboard; e: BossExecutive | null }) {
  const yoq = t('Ma’lumot yetarli emas');
  const smetaIzoh = e ? `${t('Narxsiz qatorlar')}: ${e.totals.unpriced_rows} · ${t('Smetasi yetishmagan obyektlar')}: ${e.totals.estimate_missing}` : yoq;
  const f2Izoh = e ? `${t('Aktlar')}: ${e.totals.approved_count} · ${t('Summasi noma’lum')}: ${e.totals.approved_missing}` : yoq;
  const jarayon = e ? `${e.totals.review_count} / ${e.totals.draft_count}` : '—';
  const signalIzoh = `${t('Jami ochiq')}: ${data.signal.ochiq_soni}`;
  return (
    <section aria-label={t('Portfel xulosasi')} className="flex flex-col gap-2">
      {!e && <div role="status" className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" />
        <span>{t('Tasdiqlangan F2 va obyektlar bo‘yicha yangi hisob modeli hali ulanmagan. Eski umumiy akt summasi bajarilgan ish sifatida ko‘rsatilmaydi.')}</span></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiKarta nom={t('Smeta: ma’lum to‘g‘ridan-to‘g‘ri xarajat')} qiymat={money(e?.totals.estimate_known)} ost={smetaIzoh} />
        <KpiKarta nom={t('Tasdiqlangan F2 hujjatlari summasi')} qiymat={money(e?.totals.approved_known)} ost={f2Izoh} />
        <KpiKarta nom={t('F2: tekshiruv / qoralama')} qiymat={jarayon} ost={t('Tasdiqlangan aktlardan alohida')} />
        <KpiKarta nom={t('Muhim ochiq signallar')} qiymat={<span className={data.signal.kritik_soni > 0 ? 'text-danger' : ''}>{data.signal.kritik_soni}</span>} ost={signalIzoh} />
      </div>
      <p className="text-[12px] text-text-mute">{t('Summalar hisob asosi bilan ko‘rsatilgan. Smeta va F2 nisbatidan jismoniy bajarilish foizi chiqarilmaydi. Narxsiz qatorlar bo‘lsa, summa qisman.')}</p>
    </section>
  );
}

const DARAJA: Record<string, { cls: string; nom: string }> = {
  critical: { cls: 'fz-stamp--danger', nom: 'Muhim' }, high: { cls: 'fz-stamp--danger', nom: 'Muhim' }, error: { cls: 'fz-stamp--danger', nom: 'Muhim' },
  medium: { cls: 'fz-stamp--warn', nom: 'O‘rta' }, warning: { cls: 'fz-stamp--warn', nom: 'O‘rta' },
};
const DARAJA_BOSHQA = { cls: 'fz-stamp--info', nom: 'Ma’lumot' };

/** 3a) Tekshirish kerak — ochiq signallar, muhimligi so'z bilan. */
function Signallar({ data, objects }: { data: Dashboard; objects: ExecutiveObject[] }) {
  const signals = sortedSignals(data.signal.royxat);
  const labels: Record<string, string> = { document_missing: t('Majburiy hujjat qayd etilmagan'), missing_price: t('Narx asosi yetishmaydi'), data_quality: t('Smeta ma’lumotini tekshirish kerak') };
  const records = signals.reduce((n, s) => n + (s.quantity ?? 1), 0);
  const sarlavha = (s: BossSignal) => labels[s.signal_type ?? ''] ?? s.title ?? t('Ochiq signal');
  const izoh = (s: BossSignal) => `${objects.find(o => String(o.object_id) === String(s.entity_id))?.name ?? t('Kompaniya yozuvi')} · ${s.quantity ?? 1} ${t('qayd')} · ${vaqt(s.detected_at, true)}`;
  return (
    <section className="fz-card">
      <div className="fz-card__head">
        <h2 className="fz-card__title inline-flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" />{t('Tekshirish kerak')}</h2>
        <span className={`fz-chip ${data.signal.kritik_soni > 0 ? 'fz-chip--danger' : ''}`}>{data.signal.ochiq_soni}</span>
      </div>
      {signals.length > 0 && <ul className="divide-y divide-border">
        {signals.map(s => {
          const d = DARAJA[s.severity ?? ''] ?? DARAJA_BOSHQA;
          return <li key={s.id} className="flex items-start gap-3 px-5 py-3">
            <span className={`fz-stamp ${d.cls} mt-0.5`}>{t(d.nom)}</span>
            <div className="min-w-0">
              <Link className="text-[13px] hover:underline" to={signalUrl(s, objects)}>{sarlavha(s)}</Link>
              <p className="mt-1 text-[12px] text-text-dim">{izoh(s)}</p>
            </div>
          </li>;
        })}
      </ul>}
      <div className="fz-card__body flex flex-col gap-2 pt-3">
        {signals.length === 0 && <p className="text-[13px] text-text-dim">{t('Ochiq signal qayd etilmagan. Bu barcha tekshiruvlar o‘tganini anglatmaydi.')}</p>}
        {data.signal.ochiq_soni > records && <p className="text-[12px] text-text-dim">{t('Ko‘rsatilgan / jami')}: {records} / {data.signal.ochiq_soni}</p>}
      </div>
    </section>
  );
}

/** 3b) Qayd etilgan moliya — buxgalteriya yozuvlari (foyda yoki bank qoldig'i emas). */
function Moliya({ data, e }: { data: Dashboard; e: BossExecutive | null }) {
  const qatorlar: [string, number | null][] = [
    [t('Qayd etilgan to‘lovlar'), data.moliya.jami_tolangan],
    [t('Qayd etilgan xarajatlar'), data.moliya.jami_xarajat],
    [t('Hisob bo‘yicha debitorlik'), data.moliya.jami_debitor],
  ];
  return (
    <section className="fz-card">
      <div className="fz-card__head"><div>
        <h2 className="fz-card__title">{t('Kompaniya bo‘yicha qayd etilgan moliya')}</h2>
        <p className="fz-card__sub">{t('Buxgalteriya yozuvlari. Bu loyiha foydasi yoki bank qoldig‘i emas.')}</p>
      </div></div>
      <div className="fz-card__body flex flex-col gap-3">
        <dl className="flex flex-col gap-2 text-[13px]">
          {qatorlar.map(([label, value]) => <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0" key={label}>
            <dt className="text-text-dim">{label}</dt><dd className="tabular-nums font-semibold">{money(data.moliya.ulangan ? value : null)}</dd>
          </div>)}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link className="fz-btn fz-btn--sm" to="/admin/moliya">{t('Buxgalteriya asoslarini ochish')}</Link>
          {e && <span className="text-[12px] text-text-dim">{t('To‘lov / xarajat yozuvlari')}: {e.payment_count} / {e.expense_count}</span>}
        </div>
      </div>
    </section>
  );
}

/** E'tibor talab qiladigan belgilar — chip so'zlari bilan. */
function ObyektBelgilari({ o }: { o: ExecutiveObject }) {
  const belgilar: { cls: string; matn: string }[] = [];
  if (o.unpriced_rows > 0) belgilar.push({ cls: 'fz-chip--warn', matn: `${t('Narxsiz qatorlar')}: ${o.unpriced_rows}` });
  if (o.estimate_missing > 0) belgilar.push({ cls: 'fz-chip--warn', matn: t('Smeta yetishmaydi') });
  if (o.approved_missing > 0) belgilar.push({ cls: 'fz-chip--danger', matn: `${t('F2 summasi noma’lum')}: ${o.approved_missing}` });
  if (o.review_count > 0) belgilar.push({ cls: 'fz-chip--accent', matn: `${t('Tekshiruvdagi F2')}: ${o.review_count}` });
  if (o.draft_count > 0) belgilar.push({ cls: '', matn: `${t('F2 qoralamalari')}: ${o.draft_count}` });
  if (o.pending_changes > 0) belgilar.push({ cls: '', matn: `${t('Smeta o‘zgarishi qoralamalari')}: ${o.pending_changes}` });
  if (!belgilar.length) return <span className="text-text-mute">—</span>;
  return <span className="flex flex-wrap gap-1">{belgilar.map(b => <span key={b.matn} className={`fz-chip ${b.cls}`}>{b.matn}</span>)}</span>;
}

/** 4) Loyihalar va obyektlar jadvali. */
function Obyektlar({ e, onAsos }: { e: BossExecutive; onAsos: (objectId: number) => void }) {
  const [project, setProject] = useState('all');
  const [search, setSearch] = useState('');
  const [issues, setIssues] = useState(false);
  const objects = filteredObjects(e.objects, project, search, issues);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="fz-card__title">{t('Loyihalar va obyektlar')}</h2>
        <div className="flex flex-wrap gap-2">
          <select aria-label={t('Loyiha')} value={project} onChange={ev => setProject(ev.target.value)} className="input h-8 px-2">
            <option value="all">{t('Barcha loyihalar')}</option>
            {e.projects.map(p => <option value={String(p.project_id ?? 'none')} key={p.project_id ?? 'none'}>{p.name}</option>)}
          </select>
          <input className="input h-8 px-2" value={search} onChange={ev => setSearch(ev.target.value)} aria-label={t('Obyektni qidirish')} placeholder={t('Obyektni qidirish')} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {e.projects.map(p => <Link className="fz-panel hover:bg-surface-2" to={projectUrl(p.project_id)} key={p.project_id ?? 'none'}>
          <span className="font-medium">{p.name}</span>
          <span className="text-[13px] text-text-dim">{p.object_count} {t('obyekt')} · {money(p.estimate_known)}</span>
        </Link>)}
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={issues} onChange={ev => setIssues(ev.target.checked)} />{t('Faqat e’tibor talab qiladigan obyektlar')}</label>
      <div className="fz-table-wrap">
        <table className="fz-table min-w-[760px]">
          <thead><tr>
            <th>{t('Obyekt')}</th><th className="fz-c-num">{t('Smeta, nakrutkasiz')}</th><th className="fz-c-num">{t('Tasdiqlangan F2')}</th><th>{t('E’tibor talab qiladi')}</th>
          </tr></thead>
          <tbody>
            {objects.map(o => <tr key={o.object_id}>
              <td className="max-w-64">
                <Link className="inline-flex items-center gap-2 font-medium hover:underline" to={objectUrl(o.object_id, o.project_id)}>{o.name}<ArrowUpRight size={14} aria-hidden="true" /></Link>
                <p className="mt-1 text-[12px] text-text-dim">{o.project_name ?? t('Loyihaga biriktirilmagan')}</p>
              </td>
              <td className="fz-c-num">
                <a href="#boss-reports" className="underline decoration-dotted underline-offset-4 hover:text-accent" aria-label={`${t('Summaning asosini ko‘rish')}: ${o.name}`} onClick={() => onAsos(o.object_id)}>{money(o.estimate_known)}</a>
              </td>
              <td className="fz-c-num">
                <Link className="underline decoration-dotted underline-offset-4 hover:text-accent" to={objectUrl(o.object_id, o.project_id, 'f2-tarix')}>{money(o.approved_known)}</Link>
              </td>
              <td><ObyektBelgilari o={o} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {objects.length === 0 && <p role="status" className="text-text-dim">{t('Tanlangan filtrga mos obyekt yo‘q.')}</p>}
      <p className="text-[12px] text-text-dim">{t('Ko‘rsatilgan / jami')}: {objects.length} / {e.totals.object_count}. {t('Qidiruv umumiy summalarni o‘zgartirmaydi.')}</p>
      {e.objects.length < e.totals.object_count && <p className="fz-note fz-note--warn">{t('Ro‘yxat chegaralangan. Kerakli obyektni tanlab, qidiruvni toraytiring.')}</p>}
    </section>
  );
}

function Portfolio({ data }: { data: Dashboard }) {
  const e = trustedExecutive(data);
  const [reports, setReports] = useState(false);
  const [reportObject, setReportObject] = useState<number | undefined>();
  const [reportProject, setReportProject] = useState<number | null | undefined>();
  const reportKey = `${reportObject ?? 'company'}-${reportProject === undefined ? 'company' : reportProject === null ? 'unassigned' : reportProject}`;
  const hisobotniOch = (id?: number, pid?: number | null) => {
    setReportObject(id); setReportProject(pid); setReports(true);
    requestAnimationFrame(() => document.getElementById('boss-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const toggleReports = () => { setReportObject(undefined); setReportProject(undefined); setReports(!reports); };
  return <>
    <Xulosa data={data} e={e} />

    <div className="fz-card flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <p className="text-[13px]">
        <strong>{data.kompaniya.loyiha_soni}</strong> {t('loyiha')} · <strong>{data.kompaniya.obyekt_soni}</strong> {t('obyekt')}
        <span className="ml-3 text-text-dim">{t('Ma’lumot vaqti')}: {vaqt(data.generated_at)}</span>
      </p>
      <button type="button" className="fz-btn fz-btn--primary" aria-expanded={reports} onClick={toggleReports}><FileDown aria-hidden="true" />{t('Hujjatlar va hisobot')}</button>
    </div>
    {reports && <Reports key={reportKey} data={data} initialObjectId={reportObject} initialProjectId={reportProject} />}

    <ExecutiveCockpit data={data} onReports={hisobotniOch} />

    <div className="grid gap-4 lg:grid-cols-2">
      <Signallar data={data} objects={e?.objects ?? []} />
      <Moliya data={data} e={e} />
    </div>

    <details className="fz-card">
      <summary className="fz-card__head cursor-pointer font-semibold">{t('Portfelning batafsil raqamlari va obyektlar jadvali')}</summary>
      <div className="fz-card__body flex flex-col gap-4">
        {e && <Obyektlar e={e} onAsos={id => { setReportObject(id); setReportProject(undefined); setReports(true); }} />}
        <div className="fz-note fz-note--info text-[13px]"><div>
          <p className="font-medium">{t('Hisob asoslari va yetishmayotgan ma’lumotlar')}</p>
          <p className="mt-1 text-text-dim">{t('Portfel faqat faol obyektlarni qamraydi. Tasdiqlanmagan F2 va fakt yozuvlari tasdiqlangan F2 summasiga kirmaydi. Noma’lum qiymat nol bilan almashtirilmaydi.')}</p>
          {e && <p className="mt-1 text-text-dim">{t('Summasi noma’lum faol shartnomalar')}: {e.contracts_missing}</p>}
        </div></div>
      </div>
    </details>
  </>;
}
