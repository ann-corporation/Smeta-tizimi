import { Activity, AlertOctagon, Boxes, ClipboardList, Database, Gauge, HardDrive, LayoutDashboard, Network, ScrollText, ServerCog, ShieldAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { AuditTable, CapabilityTable, Empty, IncidentTable, IntegrationCard, JobTable, SystemHealthCard, SystemStatusBadge, type SystemControlCallbacks, type SystemControlData } from '../../components/system-control';
import { GrafikPanel, Legenda, Tasma } from '../../components/boshqaruv-grafik/Grafiklar';
import { t } from '../../i18n/til';

type Tab = 'umumiy' | 'modullar' | 'integratsiyalar' | 'jobs' | 'xatolar' | 'audit';
const tabs: Array<{ id: Tab; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'umumiy', label: 'UMUMIY', Icon: LayoutDashboard }, { id: 'modullar', label: 'MODULLAR', Icon: Boxes },
  { id: 'integratsiyalar', label: 'INTEGRATSIYALAR', Icon: Network }, { id: 'jobs', label: 'ISHLAR / JOBS', Icon: ClipboardList },
  { id: 'xatolar', label: 'XATOLAR', Icon: AlertOctagon }, { id: 'audit', label: 'AUDIT', Icon: ScrollText },
];

export type SystemControlCenterProps = SystemControlCallbacks & { data: SystemControlData; demo?: boolean; className?: string };

export function SystemControlCenter({ data, demo = false, className = '', ...actions }: SystemControlCenterProps) {
  const [tab, setTab] = useState<Tab>('umumiy');
  const summary = useMemo(() => ({ active: data.capabilities.filter((item) => item.enabled === 'on').length, warnings: data.health.filter((item) => item.status === 'warning').length + data.incidents.filter((item) => item.severity === 'warning').length, failedJobs: data.jobs.filter((item) => item.status === 'failed').length, openIncidents: data.incidents.filter((item) => item.status === 'open').length }), [data]);
  return <section className={`min-h-full bg-bg text-text ${className}`}>
    <header className="fz-pagehead border-b border-border">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <ServerCog size={20} className="text-[var(--accent-text)]" aria-hidden="true" />
          <h1 className="fz-pagehead__title">{t('Tizim boshqaruv markazi')}</h1>
          {demo && <span className="fz-stamp fz-stamp--warn">DEMO DATA</span>}
        </div>
        <p className="fz-pagehead__desc">{t('TIZIM_02 modullari, integratsiyalari, ish jarayonlari va tizim holatini markaziy nazorat qilish')}</p>
      </div>
      <div className="fz-pagehead__actions text-[12px] text-text-dim"><Activity size={15} className="text-ok" aria-hidden="true" />{t('Nazorat paneli')} · {data.version.environment || t('Muhit aniqlanmagan')}</div>
      <nav className="-mb-4 flex w-full gap-1 overflow-x-auto" aria-label={t('System Control Center tablari')}>
        {tabs.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-[12px] font-semibold tracking-wide transition-colors ${tab === id ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}><Icon size={15} aria-hidden="true" />{t(label)}</button>)}
      </nav>
    </header>
    <main className="mx-auto max-w-[1600px] p-5 sm:p-6">
      {tab === 'umumiy' && <Overview data={data} summary={summary} demo={demo} />}
      {tab === 'modullar' && <Section title={t('Biznes capability boshqaruvi')} subtitle={t('Har bir qator business command yoki operatsion capability; ichki JS funksiyalar emas.')}><CapabilityTable capabilities={data.capabilities} onToggle={actions.onToggle} onScopeChange={actions.onScopeChange} onKill={actions.onKill} /></Section>}
      {tab === 'integratsiyalar' && <Section title={t('Integratsiyalar')} subtitle={t('Ulanish holati backenddan keladi. Sozlanmagan integratsiya hech qachon connected deb ko‘rsatilmaydi.')}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.integrations.length ? data.integrations.map((item) => <IntegrationCard key={item.id} integration={item} onAction={(action) => actions.onIntegrationAction?.(item, action)} />) : <Empty label={t('Integratsiya qaydlari mavjud emas.')} />}</div></Section>}
      {tab === 'jobs' && <Section title={t('Ishlar / Jobs')} subtitle={t('Asinxron operatsiyalar, jarayon va qayta urinish nazorati.')}><JobTable jobs={data.jobs} onRetry={(job) => actions.onRetry?.({ type: 'job', id: job.id })} onPause={actions.onPause} onResume={actions.onResume} onCancel={actions.onCancel} /></Section>}
      {tab === 'xatolar' && <Section title={t('Xatolar va incidentlar')} subtitle={t('Kritik incidentlar birinchi navbatda ko‘rinadi; filterlar faqat UI qatlami.')}><IncidentTable incidents={data.incidents} onAction={actions.onIncidentAction} /></Section>}
      {tab === 'audit' && <Section title={t('Audit jurnali')} subtitle={t('Amal manbasi va operation ID bilan o‘qiladigan tarix.')}><AuditTable events={data.auditEvents} /></Section>}
    </main>
  </section>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) { return <section><div className="mb-5"><h2 className="fz-card__title">{title}</h2><p className="fz-card__sub">{subtitle}</p></div>{children}</section>; }
function SummaryCard({ label, value, rang, Icon }: { label: string; value: number; rang: string; Icon: typeof Activity }) {
  return <div className="fz-panel rounded-none border-0 border-r border-border last:border-r-0">
    <div className="fz-panel__h"><span>{label}</span><Icon size={15} style={{ color: rang }} aria-hidden="true" /></div>
    <p className="text-2xl font-semibold tabular-nums" style={value > 0 && rang !== 'var(--accent)' ? { color: rang } : undefined}>{value}</p>
  </div>;
}

/** Holatlar soni — tasma uchun (sog'lom / ogohlantirish / xato). */
function sanoq<T>(items: readonly T[], f: (x: T) => string) { const m = new Map<string, number>(); for (const x of items) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return m; }

function Overview({ data, summary, demo }: { data: SystemControlData; summary: { active: number; warnings: number; failedJobs: number; openIncidents: number }; demo: boolean }) {
  const overall = data.health.some((item) => item.status === 'failed') ? 'failed' : data.health.some((item) => item.status === 'warning') ? 'warning' : 'healthy';
  const holat = sanoq(data.health, (h) => h.status);
  const health = [
    { nom: t('Sog‘lom'), qiymat: holat.get('healthy') ?? 0, rang: 'var(--ok)' },
    { nom: t('Ogohlantirish'), qiymat: holat.get('warning') ?? 0, rang: 'var(--warn)' },
    { nom: t('Xato'), qiymat: holat.get('failed') ?? 0, rang: 'var(--danger)' },
    { nom: t('O‘chirilgan / sozlanmagan'), qiymat: (holat.get('disabled') ?? 0) + (holat.get('not_configured') ?? 0) + (holat.get('configured') ?? 0), rang: 'var(--border-strong)' },
  ];
  const cap = sanoq(data.capabilities, (c) => String(c.enabled));
  const modullar = [
    { nom: t('Yoqilgan'), qiymat: cap.get('on') ?? 0, rang: 'var(--accent)' },
    { nom: t('Pauza / faqat o‘qish'), qiymat: (cap.get('paused') ?? 0) + (cap.get('read_only') ?? 0), rang: 'var(--warn)' },
    { nom: t('O‘chirilgan'), qiymat: cap.get('off') ?? 0, rang: 'var(--border-strong)' },
  ];
  const job = sanoq(data.jobs, (j) => String(j.status));
  const ishlar = [
    { nom: t('Bajarilmoqda'), qiymat: job.get('running') ?? 0, rang: 'var(--info)' },
    { nom: t('Navbatda / to‘xtatilgan'), qiymat: (job.get('queued') ?? 0) + (job.get('paused') ?? 0) + (job.get('cancelled') ?? 0), rang: 'var(--border-strong)' },
    { nom: t('Tugagan'), qiymat: job.get('success') ?? 0, rang: 'var(--ok)' },
    { nom: t('Xato'), qiymat: job.get('failed') ?? 0, rang: 'var(--danger)' },
  ];
  const tone = overall === 'healthy' ? 'var(--ok)' : overall === 'warning' ? 'var(--warn)' : 'var(--danger)';
  return <div className="space-y-6">
    <section className="fz-card">
      <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <p className="fz-panel__h">{t('Tizim holati')}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="rounded-md p-3" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}><Gauge size={28} aria-hidden="true" /></div>
            <div><h2 className="fz-card__title">{t('Markaziy operatsion ko‘rinish')}</h2>
              {demo && <p className="fz-card__sub">{t('Holat real transport contracti ulanmaguncha demo data bilan belgilangan.')}</p>}</div>
          </div>
        </div>
        <div className="flex items-center justify-start lg:justify-end"><SystemStatusBadge status={overall} className="px-3 py-1.5 text-[13px]" /></div>
      </div>
      <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
        <SummaryCard label={t('Active modules')} value={summary.active} rang="var(--accent)" Icon={Boxes} />
        <SummaryCard label={t('Warnings')} value={summary.warnings} rang="var(--warn)" Icon={ShieldAlert} />
        <SummaryCard label={t('Failed jobs')} value={summary.failedJobs} rang="var(--danger)" Icon={AlertOctagon} />
        <SummaryCard label={t('Open incidents')} value={summary.openIncidents} rang="var(--danger)" Icon={AlertOctagon} />
      </div>
    </section>
    <section className="grid gap-3 md:grid-cols-3">
      <GrafikPanel sarlavha={t('Tizim salomatligi')} ong={data.health.length}><Tasma label={t('Tizim salomatligi')} qismlar={health} /><Legenda qatorlar={health.map((h) => ({ ...h, qiymat: h.qiymat }))} /></GrafikPanel>
      <GrafikPanel sarlavha={t('Modullar')} ong={data.capabilities.length}><Tasma label={t('Modullar')} qismlar={modullar} /><Legenda qatorlar={modullar.map((h) => ({ ...h, qiymat: h.qiymat }))} /></GrafikPanel>
      <GrafikPanel sarlavha={t('Fon ishlari')} ong={data.jobs.length}><Tasma label={t('Fon ishlari')} qismlar={ishlar} /><Legenda qatorlar={ishlar.map((h) => ({ ...h, qiymat: h.qiymat }))} /></GrafikPanel>
    </section>
    <section>
      <div className="mb-4 flex items-center gap-2"><HardDrive size={18} className="text-[var(--accent-text)]" aria-hidden="true" /><h2 className="fz-card__title">{t('System health')}</h2></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.health.map((item) => <SystemHealthCard health={item} key={item.id} />)}</div>
    </section>
    <section className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
      <div className="fz-card">
        <div className="fz-card__head"><div><h2 className="fz-card__title">{t('Versiya va muhit')}</h2><p className="fz-card__sub">{t('Release ma’lumotlari frontend contractidan olinadi.')}</p></div></div>
        <dl className="divide-y divide-border text-[13px]">
          <VersionRow icon={<Database size={15} />} label="Frontend commit" value={data.version.frontendCommit} />
          <VersionRow icon={<ServerCog size={15} />} label="Backend / schema" value={data.version.backendSchemaVersion} />
          <VersionRow icon={<HardDrive size={15} />} label="GAS deployment" value={data.version.gasDeploymentVersion} />
          <VersionRow icon={<Network size={15} />} label="Environment" value={data.version.environment} />
        </dl>
      </div>
      <div className="fz-card p-5">
        <h2 className="fz-card__title">{t('Diqqat markazida')}</h2>
        <div className="mt-4 space-y-3">
          {data.incidents.filter((item) => item.severity === 'critical' || item.status === 'open').slice(0, 3).map((item) => <div key={item.id} className="fz-note fz-note--danger flex-col">
            <div className="flex w-full justify-between gap-2"><span className="font-mono text-[12px] text-danger">{item.code}</span><SystemStatusBadge status={item.severity} /></div>
            <p className="text-[13px]">{item.message}</p>
          </div>)}
          {!data.incidents.length && <p className="text-[13px] text-text-dim">{t('Ochiq incidentlar yo‘q.')}</p>}
        </div>
      </div>
    </section>
  </div>;
}
function VersionRow({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) { return <div className="flex items-center justify-between gap-4 px-5 py-3"><dt className="flex items-center gap-2 text-text-dim">{icon}{label}</dt><dd className="font-mono text-[12px] text-text">{value || '—'}</dd></div>; }
