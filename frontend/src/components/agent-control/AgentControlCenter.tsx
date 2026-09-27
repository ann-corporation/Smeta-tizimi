import { Activity, Check, CircleAlert, Pause, Play, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AgentApproval, AgentControlReadModel, AgentProfile, AgentRun } from '../../lib/agent-control-plane';

export type AgentControlCenterCallbacks = {
  onRefresh?: () => void;
  onApprove?: (approval: AgentApproval, run: AgentRun) => void;
  onReject?: (approval: AgentApproval, run: AgentRun) => void;
  onTransition?: (run: AgentRun, nextState: AgentRun['holat']) => void;
};

export type AgentControlCenterProps = AgentControlCenterCallbacks & {
  data?: AgentControlReadModel | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
};

const stateLabels: Record<AgentRun['holat'], string> = {
  queued: 'Navbatda',
  running: 'Ishlayapti',
  waiting_review: 'Tekshiruvda',
  approval_required: 'Tasdiq kerak',
  applying: 'Qo‘llanmoqda',
  exporting: 'Eksport qilinmoqda',
  completed: 'Tayyor',
  failed: 'Xato',
  cancelled: 'Bekor qilingan',
};

const modeLabels: Record<AgentProfile['permission_mode'], string> = {
  read_only: 'Faqat o‘qish',
  analyze: 'Tahlil',
  draft: 'Qoralama',
  command_prepare: 'Buyruq tayyorlash',
  human_approval_required: 'Inson tasdig‘i shart',
};

export function AgentControlCenter({ data, loading = false, error = null, className = '', onRefresh, onApprove, onReject, onTransition }: AgentControlCenterProps) {
  const approvals = data?.approvals ?? [];
  const runs = data?.runs ?? [];
  const profiles = data?.agents ?? [];
  const activeRuns = runs.filter((run) => !['completed', 'failed', 'cancelled'].includes(run.holat)).length;

  return <section className={`min-h-full bg-bg text-text ${className}`} aria-label="Agent boshqaruv markazi">
    <header className="border-b border-border bg-surface/75 px-5 py-6 sm:px-7">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><div className="rounded-lg bg-accent/15 p-2 text-accent"><ShieldCheck size={21} /></div><h1 className="text-2xl font-bold tracking-tight">Agentlar boshqaruvi</h1></div>
          <p className="mt-2 max-w-3xl text-sm text-text-dim">Agentlar faqat ruxsat etilgan buyruq va scope ichida ishlaydi. Muhim amallar inson tasdig‘isiz bajarilmaydi.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Yangilash</button>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] space-y-7 p-5 sm:p-7">
      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm"><CircleAlert className="mt-0.5 shrink-0 text-danger" size={18} /><div><p className="font-semibold">Agentlar ma’lumotini yuklab bo‘lmadi</p><p className="mt-1 text-text-dim">Texnik tafsilotlar foydalanuvchiga chiqarilmadi.</p></div></div>}
      {!data && !loading && !error && <EmptyState />}
      {loading && !data && <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-dim">Agent nazorati yuklanmoqda…</div>}
      {data && <>
        <div className="grid gap-4 sm:grid-cols-3"><Summary label="Faol agentlar" value={profiles.filter((agent) => agent.holat === 'active').length} /><Summary label="Faol jarayonlar" value={activeRuns} /><Summary label="Tasdiq kutmoqda" value={approvals.filter((item) => item.holat === 'pending').length} /></div>
        <section><SectionTitle icon={<Activity size={18} />} title="Agent profillari" subtitle="Har bir agentning vazifasi va ruxsat darajasi alohida ko‘rinadi." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{profiles.map((agent) => <AgentProfileCard key={agent.kod} agent={agent} />)}</div></section>
        <section><SectionTitle icon={<Play size={18} />} title="Jarayonlar" subtitle="Navbat, ijro, tekshiruv va yakun holatlari shu yerda kuzatiladi." /><RunTable runs={runs} approvals={approvals} onApprove={onApprove} onReject={onReject} onTransition={onTransition} /></section>
      </>}
    </main>
  </section>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="karta p-4"><p className="text-xs text-text-dim">{label}</p><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p></div>; }

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) { return <div className="mb-4 flex items-start gap-2"><div className="mt-0.5 text-accent">{icon}</div><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-text-dim">{subtitle}</p></div></div>; }

function AgentProfileCard({ agent }: { agent: AgentProfile }) { return <article className="rounded-xl border border-border bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{agent.nom}</h3><p className="mt-1 text-xs text-text-dim">{agent.rol}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${agent.holat === 'active' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{agent.holat === 'active' ? 'FAOL' : agent.holat.toUpperCase()}</span></div><p className="mt-4 text-sm text-text-dim">{modeLabels[agent.permission_mode]}</p><div className="mt-4 flex flex-wrap gap-2">{agent.allowed_commands.slice(0, 4).map((command) => <span key={command} className="rounded-md border border-border px-2 py-1 text-[11px] text-text-dim">{command}</span>)}</div></article>; }

function RunTable({ runs, approvals, onApprove, onReject, onTransition }: { runs: AgentRun[]; approvals: AgentApproval[]; onApprove?: AgentControlCenterCallbacks['onApprove']; onReject?: AgentControlCenterCallbacks['onReject']; onTransition?: AgentControlCenterCallbacks['onTransition'] }) {
  if (!runs.length) return <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-dim">Hozircha agent jarayonlari yo‘q.</div>;
  const approvalByRun = new Map(approvals.map((approval) => [approval.run_id, approval]));
  return <div className="overflow-x-auto rounded-xl border border-border bg-surface"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border text-xs text-text-dim"><tr><th className="px-4 py-3">Agent / buyruq</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Holat</th><th className="px-4 py-3">Amal</th></tr></thead><tbody className="divide-y divide-border">{runs.map((run) => { const approval = approvalByRun.get(run.run_id); return <tr key={run.run_id}><td className="px-4 py-3"><p className="font-medium">{run.agent_kod}</p><p className="mt-1 text-xs text-text-dim">{run.command_kod}</p></td><td className="px-4 py-3 text-xs text-text-dim">{run.obyekt_id ? 'Obyekt' : run.loyiha_id ? 'Loyiha' : run.kompaniya_id ? 'Kompaniya' : 'Global'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${run.holat === 'failed' ? 'bg-danger/10 text-danger' : run.holat === 'completed' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{stateLabels[run.holat]}</span></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{approval?.holat === 'pending' && <><button type="button" onClick={() => onApprove?.(approval, run)} className="inline-flex items-center gap-1 rounded-md border border-ok/40 px-2 py-1 text-xs text-ok hover:bg-ok/10"><Check size={13} />Tasdiqlash</button><button type="button" onClick={() => onReject?.(approval, run)} className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"><X size={13} />Rad etish</button></>}{run.holat === 'queued' && <button type="button" onClick={() => onTransition?.(run, 'running')} className="inline-flex items-center gap-1 rounded-md border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10"><Play size={13} />Boshlash</button>}{['running', 'applying', 'exporting'].includes(run.holat) && <button type="button" onClick={() => onTransition?.(run, 'waiting_review')} className="inline-flex items-center gap-1 rounded-md border border-warn/40 px-2 py-1 text-xs text-warn hover:bg-warn/10"><Pause size={13} />Tekshiruvga</button>}</div></td></tr>; })}</tbody></table></div>;
}

function EmptyState() { return <div className="rounded-xl border border-border bg-surface p-8 text-center"><ShieldCheck className="mx-auto text-accent" size={28} /><h2 className="mt-3 font-semibold">Agent boshqaruvi tayyor</h2><p className="mx-auto mt-2 max-w-lg text-sm text-text-dim">Haqiqiy profillar va jarayonlar typed backend contractidan keladi. Demo ma’lumot avtomatik ko‘rsatilmaydi.</p></div>; }
