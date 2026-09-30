import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Database, GitBranch, Search, Workflow, X } from 'lucide-react';
import { SAYT_OQIMLARI, SAYT_XARITASI } from '../../lib/sayt-xaritasi';

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
  const sahifalar = useMemo(() => SAYT_XARITASI.sahifalar.filter((x) => {
    const matn = `${x.nom} ${x.yol} ${x.oqiydi.join(' ')} ${x.yozadi.join(' ')}`.toLowerCase();
    return (!qidiruv.trim() || matn.includes(qidiruv.trim().toLowerCase())) && (scope === 'ALL' || x.scope === scope);
  }), [qidiruv, scope]);
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
            {['ALL', 'GLOBAL', 'COMPANY', 'PROJECT', 'OBJECT'].map((x) => <button key={x} onClick={() => setScope(x)} className={`rounded-lg border px-3 py-2 text-xs ${scope === x ? 'border-blue-400/50 bg-blue-400/15 text-blue-100' : 'border-white/10 text-text-mute hover:text-text'}`}>{x === 'ALL' ? 'Barchasi' : SCOPE_LABEL[x]}</button>)}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sahifalar.map((s) => <button key={s.yol} onClick={() => setTanlangan(s.yol)} className="group rounded-lg border border-white/10 bg-bg/50 p-3 text-left transition hover:border-blue-400/40 hover:bg-blue-400/[.04]">
              <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{s.nom}</div><div className="mt-1 text-xs text-blue-300">{s.yol}</div></div><Chip tone="blue">{SCOPE_LABEL[s.scope]}</Chip></div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-mute">{s.izoh}</p>
              <div className="mt-3 flex flex-wrap gap-1"><Chip tone="muted">O‘qish: {s.oqiydi.length}</Chip><Chip tone="muted">Yozish: {s.yozadi.length}</Chip><Chip tone="muted">Natija: {s.chiqaradi.length}</Chip></div>
            </button>)}
          </div>
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

function Detail({ title, values }: { title: string; values: readonly string[] }) {
  return <section className="mt-5"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-mute">{title}</h3><div className="flex flex-wrap gap-1">{values.length ? values.map((x) => <Chip key={x}>{x}</Chip>) : <span className="text-xs text-text-mute">Yo‘q</span>}</div></section>;
}

export default SaytXaritasi;
