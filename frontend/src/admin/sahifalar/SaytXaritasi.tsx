import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Database, GitBranch, List, Search, Workflow, X } from 'lucide-react';
import { SAYT_OQIMLARI, SAYT_XARITASI } from '../../lib/sayt-xaritasi';
import { buildSaytTree, SAYT_SCOPE_ORDER } from '../../lib/sayt-xaritasi/tree';

const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: 'Global', COMPANY: 'Kompaniya', PROJECT: 'Loyiha', OBJECT: 'Obyekt', USER: 'Foydalanuvchi', LEGACY: 'Eski yo‘l',
};

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'blue' | 'muted' }) {
  const cls = tone === 'blue' ? 'border-blue-400/30 bg-blue-400/10 text-blue-200' : tone === 'muted' ? 'border-white/10 bg-white/[.03] text-text-mute' : 'border-white/10 bg-white/[.05] text-text';
  return <span className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[11px] ${cls}`}>{children}</span>;
}

export function SaytXaritasi() {
  const [qidiruv, setQidiruv] = useState('');
  const [scope, setScope] = useState('ALL');
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [korinish, setKorinish] = useState<'tree' | 'list'>('tree');
  const sahifalar = useMemo(() => SAYT_XARITASI.sahifalar.filter((x) => {
    const matn = `${x.nom} ${x.yol} ${x.oqiydi.join(' ')} ${x.yozadi.join(' ')}`.toLowerCase();
    return (!qidiruv.trim() || matn.includes(qidiruv.trim().toLowerCase())) && (scope === 'ALL' || x.scope === scope);
  }), [qidiruv, scope]);
  const daraxt = useMemo(() => buildSaytTree(sahifalar), [sahifalar]);
  const detail = tanlangan ? SAYT_XARITASI.sahifalar.find((x) => x.yol === tanlangan) : null;

  return (
    <div className="min-h-full bg-bg text-text">
      <div className="mx-auto max-w-[1500px] space-y-5 p-5 md:p-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-blue-300"><Workflow size={15} /> TIZIM_02 · Koddan yig‘ilgan xarita</div>
            <h1 className="text-2xl font-semibold tracking-tight">Sayt xaritasi</h1>
            <p className="mt-1 max-w-3xl text-sm text-text-mute">Qaysi sahifa nimani o‘qiydi, nimani yozadi va natijasini qayerga beradi — bitta ko‘rinishda.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-right text-xs text-text-mute">
            <div><span className="text-text">{SAYT_XARITASI.sahifalar.length}</span> sahifa katalogda</div>
            <div><span className="text-text">{SAYT_XARITASI.readTables.length}</span> o‘qish manbasi · <span className="text-text">{SAYT_XARITASI.writeActions.length}</span> yozish amali</div>
          </div>
        </header>

        <section className="rounded-xl border border-white/10 bg-panel/70 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" />
              <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder="Sahifa, yo‘l yoki manba bo‘yicha qidiring…" className="w-full rounded-lg border border-white/10 bg-bg px-9 py-2 text-sm outline-none placeholder:text-text-mute focus:border-blue-400/50" />
            </div>
            {['ALL', ...SAYT_SCOPE_ORDER].map((x) => <button key={x} onClick={() => setScope(x)} className={`rounded-lg border px-3 py-2 text-xs ${scope === x ? 'border-blue-400/50 bg-blue-400/15 text-blue-100' : 'border-white/10 text-text-mute hover:text-text'}`}>{x === 'ALL' ? 'Barchasi' : SCOPE_LABEL[x]}</button>)}
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-bg p-1" aria-label="Xarita ko‘rinishi">
              <button aria-pressed={korinish === 'tree'} onClick={() => setKorinish('tree')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${korinish === 'tree' ? 'bg-blue-400/15 text-blue-100' : 'text-text-mute hover:text-text'}`}><GitBranch size={14} /> Daraxt</button>
              <button aria-pressed={korinish === 'list'} onClick={() => setKorinish('list')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${korinish === 'list' ? 'bg-blue-400/15 text-blue-100' : 'text-text-mute hover:text-text'}`}><List size={14} /> Ro‘yxat</button>
            </div>
          </div>
          {korinish === 'tree' ? <SaytTree layout={daraxt} onSelect={setTanlangan} /> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sahifalar.map((s) => <button key={s.yol} onClick={() => setTanlangan(s.yol)} className="group rounded-lg border border-white/10 bg-bg/50 p-3 text-left transition hover:border-blue-400/40 hover:bg-blue-400/[.04]">
              <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{s.nom}</div><div className="mt-1 text-xs text-blue-300">{s.yol}</div></div><Chip tone="blue">{SCOPE_LABEL[s.scope]}</Chip></div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-mute">{s.izoh}</p>
              <div className="mt-3 flex flex-wrap gap-1"><Chip tone="muted">O‘qish: {s.oqiydi.length}</Chip><Chip tone="muted">Yozish: {s.yozadi.length}</Chip><Chip tone="muted">Natija: {s.chiqaradi.length}</Chip></div>
            </button>)}
          </div>}
          {!sahifalar.length && <div className="py-12 text-center text-sm text-text-mute">Mos sahifa topilmadi.</div>}
        </section>

        <section className="rounded-xl border border-white/10 bg-panel/70 p-4">
          <div className="mb-4 flex items-center gap-2"><GitBranch size={17} className="text-blue-300" /><h2 className="font-medium">Asosiy ish oqimlari</h2></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {SAYT_OQIMLARI.map((oqim) => <div key={oqim.nom} className="rounded-lg border border-white/10 bg-bg/40 p-3"><div className="mb-3 text-sm font-medium">{oqim.nom}</div><div className="flex flex-wrap items-center gap-2">{oqim.qadamlar.map((qadam, i) => <span key={qadam} className="flex items-center gap-2"><button onClick={() => setTanlangan(qadam)} className="rounded-md border border-blue-400/20 bg-blue-400/[.08] px-2 py-1 text-xs text-blue-100 hover:border-blue-400/50">{SAYT_XARITASI.sahifalar.find((x) => x.yol === qadam)?.nom ?? qadam}</button>{i < oqim.qadamlar.length - 1 && <ArrowRight size={13} className="text-text-mute" />}</span>)}</div></div>)}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-panel/70 p-4"><div className="mb-3 flex items-center gap-2"><Database size={17} className="text-blue-300" /><h2 className="font-medium">Koddan yig‘ilgan texnik qamrov</h2></div><div className="grid gap-3 md:grid-cols-2"><div><div className="mb-2 text-xs text-text-mute">O‘qish oq ro‘yxati</div><div className="flex max-h-36 flex-wrap gap-1 overflow-auto">{SAYT_XARITASI.readTables.map((x) => <Chip key={x} tone="muted">{x}</Chip>)}</div></div><div><div className="mb-2 text-xs text-text-mute">Yozish amallari</div><div className="flex max-h-36 flex-wrap gap-1 overflow-auto">{SAYT_XARITASI.writeActions.map((x) => <Chip key={x.amal} tone="muted">{x.amal} → {x.rpc}</Chip>)}</div></div></div></section>
      </div>

      {detail && <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 p-4 md:p-8" onClick={() => setTanlangan(null)}><aside className="h-full w-full max-w-xl overflow-auto rounded-2xl border border-white/10 bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><div className="text-xs text-blue-300">{SCOPE_LABEL[detail.scope]}</div><h2 className="mt-1 text-xl font-semibold">{detail.nom}</h2><div className="mt-1 text-sm text-text-mute">{detail.yol}</div></div><button onClick={() => setTanlangan(null)} aria-label="Yopish" className="rounded-lg p-2 text-text-mute hover:bg-white/10 hover:text-text"><X size={18} /></button></div><p className="mt-5 text-sm leading-6 text-text-mute">{detail.izoh}</p><Detail title="O‘qiydi" values={detail.oqiydi} /><Detail title="Yozadi" values={detail.yozadi} /><Detail title="Chiqaradi" values={detail.chiqaradi} /><Detail title="Keyingi iste’molchilar" values={detail.beradi} /></aside></div>}
    </div>
  );
}

function SaytTree({ layout, onSelect }: { layout: ReturnType<typeof buildSaytTree>; onSelect: (route: string) => void }) {
  const scopeTone: Record<string, string> = {
    GLOBAL: 'border-violet-400/35 bg-violet-400/[.12] text-violet-100',
    COMPANY: 'border-blue-400/35 bg-blue-400/[.12] text-blue-100',
    PROJECT: 'border-cyan-400/35 bg-cyan-400/[.12] text-cyan-100',
    OBJECT: 'border-emerald-400/35 bg-emerald-400/[.12] text-emerald-100',
    USER: 'border-amber-400/35 bg-amber-400/[.12] text-amber-100',
    LEGACY: 'border-white/15 bg-white/[.06] text-text-mute',
  };
  return <div className="rounded-xl border border-white/10 bg-bg/45 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-mute">
      <span><b className="text-text">TIZIM_02</b> → doira (Global / Kompaniya / Loyiha / Obyekt) → sahifalar</span>
      <span>{layout.nodes.filter((node) => node.kind === 'page').length} ta sahifa · chiziqlar navigatsiya yo‘nalishini ko‘rsatadi</span>
    </div>
    <div className="overflow-auto rounded-lg border border-white/10 bg-[#0a0d14]" data-testid="sayt-2d-tree">
      <div className="relative" style={{ width: layout.width, height: layout.height, minWidth: layout.width }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
          <defs>
            <linearGradient id="sayt-tree-edge" x1="0" x2="1">
              <stop offset="0%" stopColor="#64748b" stopOpacity=".75" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity=".55" />
            </linearGradient>
          </defs>
          {layout.edges.map((edge) => <path key={edge.id} d={edge.path} fill="none" stroke="url(#sayt-tree-edge)" strokeWidth="1.5" />)}
        </svg>
        {layout.nodes.map((node) => {
          const isPage = node.kind === 'page';
          const tone = node.kind === 'root' ? 'border-blue-300/60 bg-blue-500/15 text-blue-50' : node.kind === 'scope' ? scopeTone[node.scope ?? ''] : scopeTone[node.scope ?? ''] ?? 'border-white/15 bg-white/[.06] text-text';
          const content = <><div className="truncate text-sm font-semibold">{node.kind === 'scope' ? SCOPE_LABEL[node.scope ?? ''] ?? node.label : node.label}</div>{isPage && <><div className="mt-1 truncate text-[11px] text-sky-300">{node.route}</div><div className="mt-2 flex gap-1.5 text-[10px] text-text-mute"><span>O‘qish {node.page?.oqiydi.length ?? 0}</span><span>·</span><span>Yozish {node.page?.yozadi.length ?? 0}</span></div></>}{node.kind === 'scope' && <div className="mt-1 text-[11px] text-text-mute">{layout.edges.filter((edge) => edge.from === node.id).length} ta sahifa</div>}{node.kind === 'root' && <div className="mt-1 text-[11px] text-text-mute">global navigatsiya daraxti</div>}</>;
          return isPage ? <button key={node.id} onClick={() => onSelect(node.route!)} className={`absolute rounded-xl border p-3 text-left shadow-lg transition hover:-translate-y-0.5 hover:border-sky-300/70 hover:bg-sky-400/[.14] ${tone}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }} aria-label={`${node.label} ${node.route}`}>{content}</button> : <div key={node.id} className={`absolute rounded-xl border p-3 shadow-lg ${tone}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>{content}</div>;
        })}
      </div>
    </div>
  </div>;
}

function Detail({ title, values }: { title: string; values: readonly string[] }) {
  return <section className="mt-5"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-mute">{title}</h3><div className="flex flex-wrap gap-1">{values.length ? values.map((x) => <Chip key={x}>{x}</Chip>) : <span className="text-xs text-text-mute">Yo‘q</span>}</div></section>;
}

export default SaytXaritasi;
