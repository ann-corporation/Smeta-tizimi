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
import { F2Oqimi, MoliyaUstunlari, SignalTasma, SmetaF2Ustunlari } from '../../components/rahbar-panel/RahbarGrafiklar';
import { MindmapSlot } from '../../components/rahbar-panel/MindmapSlot';
import { KategoriyaDonut, UstamaSharshara, UstamaXulosaKarta } from '../../components/rahbar-panel/RahbarUstama';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import { PortfelSummaJuft } from '../../umumiy/ui/PortfelSummaJuft';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useRahbarPanel, type RahbarPanel } from '../../api/t2-rahbar-panel';
import { DavrTanlov, DiqqatRoyxati, ObyektlarMatritsa, PulOqimi, RahbarKartalar, TasdiqNavbati } from '../../components/rahbar-panel/RahbarMarkaz';
import { davrOraligi, type DavrTur } from '../../lib/rahbar-panel/markaz';
import { ObyektPaneli, TahlilYorliqlari } from '../../components/rahbar-panel/RahbarTahlil';
import { rahbarXlsx } from '../../lib/rahbar-panel/eksport';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { toast } from '../../umumiy/ui/Toast';
import { paketUchligi, type SummaPaket } from '../../lib/summa-paket';
import { ustamasizUchlik } from '../../lib/ustamali-summa';
import type { TafsilQism } from '../../lib/summa-tafsilot';

type Dashboard = NonNullable<ReturnType<typeof useBossDashboard>['data']>;

const vaqt = (iso: string | null | undefined, sana = false) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '—';
  const d = new Date(iso);
  return sana ? d.toLocaleDateString() : d.toLocaleString();
};

export default function BossDashboard() {
  const { joriy } = useKompaniya();
  const q = useBossDashboard(joriy?.id);
  /* Tezlik: Portfolio faqat boss paneli kelgach ochiladi — rahbar paneli so'rovi shu paytgacha kutardi (ketma-ket).
     Shu kalit (davr = hammasi) bilan parallel boshlanadi; Portfolio va ProjectNavigator keshdan oladi. */
  useRahbarPanel(joriy?.id, davrOraligi('hammasi'));
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

type PanelHolat = { panel: RahbarPanel | undefined; yuklanmoqda: boolean };

/**
 * Tasdiqlangan F2 summasi — HAR DOIM uchlik (QQS bilan · ustamali QQS siz · ustamasiz): server paketi (`t2_rahbar_panel_v1`,
 * yagona `_t2_summa_paket_*` yadro). Paket yo'q — «hisoblanmadi» (faqat ma'lum ustamasiz ko'rsatiladi, yorlig'i bilan), 0 emas.
 */
function F2Qiymat({ paket, ustamasiz, holat, qismlar, nomalumSoni, kichik = false }: {
  paket: SummaPaket | null; ustamasiz: number | null; holat: PanelHolat; qismlar?: TafsilQism[]; nomalumSoni?: number; kichik?: boolean;
}) {
  if (paket) return <SummaJuft paket={paket} yorliq={t('F2, QQS bilan')} kichik={kichik} qismlar={qismlar} nomalumSoni={nomalumSoni} />;
  if (holat.yuklanmoqda) return <span className="text-text-mute">{t('Hisoblanmoqda…')}</span>;
  return <QiymatUchlik q={ustamasizUchlik(ustamasiz, 'HISOBLANMADI')} yorliq={t('F2, QQS bilan')} kichik={kichik} nomalumSoni={nomalumSoni} />;
}

/** F2 tarkibi: obyektlar, har biri o'z F2 uchligi bilan (server paketidan). */
function f2Qismlari(panel: RahbarPanel | undefined): TafsilQism[] | undefined {
  return panel?.obyektlar.map((o) => ({ kalit: String(o.obyekt_id), nom: o.nom, q: paketUchligi(o.f2) }));
}

/** 1) Xulosa — asosiy raqamlar. Smeta va F2 nisbatidan foiz chiqarilmaydi (hisob asoslari har xil). */
function Xulosa({ data, e, ph }: { data: Dashboard; e: BossExecutive | null; ph: PanelHolat }) {
  const obyektlar = (e?.objects ?? []).map(o => ({ obyektId: o.object_id }));
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
        {/* To'g'ridan-to'g'ri xarajat (ustamasiz) alohida plitka EMAS: u shu uchlikning 3-qatori (aralash turlar chalkashmasin). */}
        {e && <UstamaXulosaKarta obyektlar={obyektlar.map((o, i) => ({ ...o, nom: e.objects[i]?.name }))} ustamasiz={amount(e.totals.estimate_known)} kompaniyaId={data.kompaniya.kompaniya_id} izoh={smetaIzoh} />}
        <KpiKarta nom={t('Tasdiqlangan F2 hujjatlari summasi')}
          qiymat={e ? <F2Qiymat paket={ph.panel?.kartalar.bajarildi.jami ?? null} ustamasiz={amount(e.totals.approved_known)} holat={ph} qismlar={f2Qismlari(ph.panel)} nomalumSoni={e.totals.approved_missing} /> : '—'} ost={f2Izoh} />
        <KpiKarta nom={t('F2: tekshiruv / qoralama')} qiymat={jarayon} ost={t('Tasdiqlangan aktlardan alohida')} />
        <KpiKarta nom={t('Muhim ochiq signallar')} qiymat={<span className={data.signal.kritik_soni > 0 ? 'text-danger' : ''}>{data.signal.kritik_soni}</span>} ost={signalIzoh} />
      </div>
      <p className="text-[12px] text-text-mute">{t('Smeta jami — faol obyektlar bo‘limlari yig‘indisi (nakrutkasiz); smeta o‘zgarishining qoralamalari (qoralama) bunga kirmaydi.')} {t('Summalar hisob asosi bilan ko‘rsatilgan. Smeta va F2 nisbatidan jismoniy bajarilish foizi chiqarilmaydi. Narxsiz qatorlar bo‘lsa, summa qisman.')}</p>
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
  const sarlavha = (s: BossSignal) => labels[s.signal_type ?? ''] ?? s.title ?? t('Ochiq signal');
  const izoh = (s: BossSignal) => `${objects.find(o => String(o.object_id) === String(s.entity_id))?.name ?? t('Kompaniya yozuvi')} · ${s.quantity ?? 1} ${t('qayd')} · ${vaqt(s.detected_at, true)}`;
  return (
    <section className="fz-card">
      <div className="fz-card__head">
        <h2 className="fz-card__title inline-flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" />{t('Tekshirish kerak')}</h2>
        <span className={`fz-chip ${data.signal.kritik_soni > 0 ? 'fz-chip--danger' : ''}`}>{data.signal.ochiq_soni}</span>
      </div>
      <div className="px-5 pt-3"><SignalTasma signal={data.signal} /></div>
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
      </div>
    </section>
  );
}

/** 3b) Qayd etilgan moliya — buxgalteriya yozuvlari (foyda yoki bank qoldig'i emas). */
function Moliya({ data, e }: { data: Dashboard; e: BossExecutive | null }) {
  return (
    <section className="fz-card">
      <div className="fz-card__head"><div>
        <h2 className="fz-card__title">{t('Kompaniya bo‘yicha qayd etilgan moliya')}</h2>
        <p className="fz-card__sub">{t('Buxgalteriya yozuvlari. Bu loyiha foydasi yoki bank qoldig‘i emas.')}</p>
      </div></div>
      <div className="fz-card__body flex flex-col gap-3">
        <MoliyaUstunlari moliya={data.moliya} />
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
function Obyektlar({ e, onAsos, ph }: { e: BossExecutive; onAsos: (objectId: number) => void; ph: PanelHolat }) {
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
        {/* Karta Link EMAS: ichidagi ▸ tafsilot (bosiladigan) havola ichida bo'lmasin. */}
        {e.projects.map(p => <div className="fz-panel hover:bg-surface-2" key={p.project_id ?? 'none'}>
          <Link className="font-medium hover:underline" to={projectUrl(p.project_id)}>{p.name}</Link>
          <span className="text-[13px] text-text-dim">{p.object_count} {t('obyekt')}</span>
          <PortfelSummaJuft obyektlar={e.objects.filter(o => o.project_id === p.project_id).map(o => ({ obyektId: o.object_id, nom: o.name }))} ustamasiz={amount(p.estimate_known)} />
        </div>)}
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={issues} onChange={ev => setIssues(ev.target.checked)} />{t('Faqat e’tibor talab qiladigan obyektlar')}</label>
      <div className="fz-table-wrap">
        <table className="fz-table min-w-[760px]">
          <thead><tr>
            <th>{t('Obyekt')}</th><th className="fz-c-num">{t('Smeta qiymati (QQS bilan)')}</th><th className="fz-c-num">{t('Tasdiqlangan F2')}</th><th>{t('E’tibor talab qiladi')}</th>
          </tr></thead>
          <tbody>
            {objects.map(o => <tr key={o.object_id}>
              <td className="max-w-64">
                <Link className="inline-flex items-center gap-2 font-medium hover:underline" to={objectUrl(o.object_id, o.project_id)}>{o.name}<ArrowUpRight size={14} aria-hidden="true" /></Link>
                <p className="mt-1 text-[12px] text-text-dim">{o.project_name ?? t('Loyihaga biriktirilmagan')}</p>
              </td>
              <td className="fz-c-num">
                <PortfelSummaJuft kichik obyektlar={[{ obyektId: o.object_id, nom: o.name }]} ustamasiz={amount(o.estimate_known)} className="items-end text-right" />
                <a href="#boss-reports" className="text-[10.5px] underline decoration-dotted underline-offset-4 hover:text-accent" aria-label={`${t('Summaning asosini ko‘rish')}: ${o.name}`} onClick={() => onAsos(o.object_id)}>{t('asosi')}</a>
              </td>
              <td className="fz-c-num">
                <F2Qiymat kichik paket={ph.panel?.obyektlar.find(x => x.obyekt_id === o.object_id)?.f2 ?? null} ustamasiz={amount(o.approved_known)} holat={ph} nomalumSoni={o.approved_missing} />
                <Link className="text-[10.5px] underline decoration-dotted underline-offset-4 hover:text-accent" to={objectUrl(o.object_id, o.project_id, 'f2-tarix')}>{t('F2 tarixi')}</Link>
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
  const [davr, setDavr] = useState<DavrTur>('hammasi');
  const davrQ = davrOraligi(davr);
  const rp = useRahbarPanel(data.kompaniya.kompaniya_id, davrQ);
  const [tanlangan, setTanlangan] = useState<{ id: number; nom: string } | null>(null);
  const eksport = async () => {
    if (!rp.data) return;
    const nom = data.kompaniya.nom ?? String(data.kompaniya.kompaniya_id);
    const { bytes, faylNomi } = await rahbarXlsx(rp.data, { qamrovNomi: nom });
    const r = await hujjatTokenBilan({ kompaniyaId: data.kompaniya.kompaniya_id, bytes, hujjat: 'RAHBAR_PANEL', sabab: `Панель руководителя · ${nom}` },
      () => downloadBlob(bytes, faylNomi));
    if (!r.ok) toast(t(r.xabar), 'danger'); else if (r.xabar) toast(t(r.xabar), 'ok');
  };
  const ph: PanelHolat = { panel: rp.data, yuklanmoqda: rp.isPending && rp.fetchStatus !== 'idle' };
  const [reports, setReports] = useState(false);
  const [reportObject, setReportObject] = useState<number | undefined>();
  const [reportProject, setReportProject] = useState<number | null | undefined>();
  const reportKey = `${reportObject ?? 'company'}-${reportProject === undefined ? 'company' : reportProject === null ? 'unassigned' : reportProject}`;
  const hisobotniOch = (id?: number, pid?: number | null) => {
    setReportObject(id); setReportProject(pid); setReports(true);
    requestAnimationFrame(() => document.getElementById('boss-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const toggleReports = () => { setReportObject(undefined); setReportProject(undefined); setReports(!reports); };
  // Markaz bo'limlari faqat to'liq javob bilan (eski/qisman javob — faqat avvalgi bo'limlar).
  const markaz = rp.data && rp.data.kartalar?.tolandi && Array.isArray(rp.data.pul_oqimi?.oylar) && Array.isArray(rp.data.diqqat) ? rp.data : null;
  const obyektNomi = (id: number | null) => rp.data?.obyektlar.find((o) => o.obyekt_id === id)?.nom ?? (id != null ? `#${id}` : t('Kompaniya'));
  return <>
    {/* Boshqaruv markazi (issue #195 §1–§5): server paketi — bitta manba. */}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="fz-card__title">{t('Boshqaruv markazi')}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <DavrTanlov qiymat={davr} onChange={setDavr} />
        <button type="button" className="fz-btn fz-btn--sm" disabled={!markaz} onClick={() => void eksport()}><FileDown size={14} aria-hidden="true" />{t('Excel')}</button>
      </div>
    </div>
    {rp.isError && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{t('Boshqaruv markazi yuklanmadi.')}</span>
      <button type="button" className="fz-btn fz-btn--sm ml-auto" onClick={() => void rp.refetch()}>{t('Qayta urinish')}</button></div>}
    {ph.yuklanmoqda && !rp.data && <Skelet qatorlar={3} />}
    {markaz && <>
      <RahbarKartalar p={markaz} />
      <PulOqimi p={markaz} />
      <div className="grid gap-4 xl:grid-cols-2">
        <DiqqatRoyxati diqqat={markaz.diqqat} />
        <TasdiqNavbati royxat={markaz.tasdiq_kutmoqda} obyektNomi={obyektNomi} />
      </div>
      <ObyektlarMatritsa p={markaz} onTanla={(o) => { setTanlangan({ id: o.obyekt_id, nom: o.nom });
        requestAnimationFrame(() => document.getElementById('obyekt-paneli')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} />
      {tanlangan && <div id="obyekt-paneli"><ObyektPaneli key={tanlangan.id} kompaniyaId={data.kompaniya.kompaniya_id} obyektId={tanlangan.id} nom={tanlangan.nom} davr={davrQ} onYop={() => setTanlangan(null)} /></div>}
      <TahlilYorliqlari p={markaz} />
    </>}

    <details className="fz-card" open>
      <summary className="fz-card__head cursor-pointer font-semibold">{t('Avvalgi xulosa (portfel modeli)')}</summary>
      <div className="fz-card__body"><Xulosa data={data} e={e} ph={ph} /></div>
    </details>

    <MindmapSlot kompaniyaId={data.kompaniya.kompaniya_id} />
    {e && <div className="grid gap-4 xl:grid-cols-2">
      <UstamaSharshara obyektlar={e.objects.map(o => ({ obyektId: o.object_id }))} kompaniyaId={data.kompaniya.kompaniya_id} />
      <KategoriyaDonut kompaniyaId={data.kompaniya.kompaniya_id} obyektIdlar={e.objects.map(o => o.object_id)} />
    </div>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {e && <SmetaF2Ustunlari e={e} />}
      <div className="flex min-w-0 flex-col gap-4">
        {e && <F2Oqimi totals={e.totals} />}
        <Moliya data={data} e={e} />
      </div>
    </div>
    <Signallar data={data} objects={e?.objects ?? []} />

    <div className="fz-card flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <p className="text-[13px]">
        <strong>{data.kompaniya.loyiha_soni}</strong> {t('loyiha')} · <strong>{data.kompaniya.obyekt_soni}</strong> {t('obyekt')}
        <span className="ml-3 text-text-dim">{t('Ma’lumot vaqti')}: {vaqt(data.generated_at)}</span>
      </p>
      <button type="button" className="fz-btn fz-btn--primary" aria-expanded={reports} onClick={toggleReports}><FileDown aria-hidden="true" />{t('Hujjatlar va hisobot')}</button>
    </div>
    {reports && <Reports key={reportKey} data={data} initialObjectId={reportObject} initialProjectId={reportProject} />}

    <ExecutiveCockpit data={data} onReports={hisobotniOch} />


    <details className="fz-card">
      <summary className="fz-card__head cursor-pointer font-semibold">{t('Portfelning batafsil raqamlari va obyektlar jadvali')}</summary>
      <div className="fz-card__body flex flex-col gap-4">
        {e && <Obyektlar e={e} ph={ph} onAsos={id => { setReportObject(id); setReportProject(undefined); setReports(true); }} />}
        <div className="fz-note fz-note--info text-[13px]"><div>
          <p className="font-medium">{t('Hisob asoslari va yetishmayotgan ma’lumotlar')}</p>
          <p className="mt-1 text-text-dim">{t('Portfel faqat faol obyektlarni qamraydi. Tasdiqlanmagan F2 va fakt yozuvlari tasdiqlangan F2 summasiga kirmaydi. Noma’lum qiymat nol bilan almashtirilmaydi.')}</p>
          {e && <p className="mt-1 text-text-dim">{t('Summasi noma’lum faol shartnomalar')}: {e.contracts_missing}</p>}
        </div></div>
      </div>
    </details>
  </>;
}
