import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Database, GitBranch, List, Search, Workflow, X } from 'lucide-react';
import { SAYT_OQIMLARI, SAYT_XARITASI } from '../../lib/sayt-xaritasi';
import { buildSaytTree, SAYT_SCOPE_ORDER } from '../../lib/sayt-xaritasi/tree';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { Legenda, Tasma } from '../../components/boshqaruv-grafik/Grafiklar';
import { t } from '../../i18n/til';

/* Firuza (2026-10-25): faqat token ranglari; doiralar — bitta rang kodi (daraxt, filtr, legenda bir xil). */
const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: 'Global', COMPANY: 'Kompaniya', PROJECT: 'Loyiha', OBJECT: 'Obyekt', USER: 'Foydalanuvchi', LEGACY: 'Eski yo‘l',
};
const SCOPE_RANG: Record<string, string> = {
  GLOBAL: 'var(--kat-ob)', COMPANY: 'var(--info)', PROJECT: 'var(--accent)', OBJECT: 'var(--ok)', USER: 'var(--warn)', LEGACY: 'var(--border-strong)',
};
const scopeNomi = (s: string | undefined) => t(SCOPE_LABEL[s ?? ''] ?? s ?? '—');
const tugunUslubi = (rang: string) => ({ background: `color-mix(in srgb, ${rang} 12%, var(--surface))`, borderColor: `color-mix(in srgb, ${rang} 45%, transparent)` });

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'blue' | 'muted' }) {
  const cls = tone === 'blue' ? 'fz-chip--accent' : '';
  return <span className={`fz-chip ${cls} ${tone === 'default' ? 'text-text' : ''}`} style={{ height: 'auto', minHeight: 18, padding: '2px 6px', maxWidth: '100%' }}>{children}</span>;
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
  const doiraSanoq = useMemo(() => SAYT_SCOPE_ORDER.map((s) => ({ nom: scopeNomi(s), qiymat: SAYT_XARITASI.sahifalar.filter((x) => x.scope === s).length, rang: SCOPE_RANG[s] })), []);
  const malumot = t('{n} sahifa katalogda · {o} o‘qish manbasi · {y} yozish amali', { n: SAYT_XARITASI.sahifalar.length, o: SAYT_XARITASI.readTables.length, y: SAYT_XARITASI.writeActions.length });

  return (
    <Sahifa sarlavha={t('Sayt xaritasi')} tavsif={t('Qaysi sahifa nimani o‘qiydi, nimani yozadi va natijasini qayerga beradi — bitta ko‘rinishda.')}
      amallar={<span className="inline-flex items-center gap-1.5 text-[12px] text-text-mute"><Workflow size={14} aria-hidden="true" />{t('Koddan yig‘ilgan xarita')}</span>}>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="fz-panel" aria-label={t('Sahifalar doiralar bo‘yicha')}>
          <div className="fz-panel__h"><span>{t('Sahifalar doiralar bo‘yicha')}</span><span>{malumot}</span></div>
          <Tasma label={t('Sahifalar doiralar bo‘yicha')} qismlar={doiraSanoq} />
          <Legenda qatorlar={doiraSanoq.map((d) => ({ nom: d.nom, rang: d.rang, qiymat: d.qiymat }))} />
        </section>

        <section className="fz-card p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" aria-hidden="true" />
              <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Sahifa, yo‘l yoki manba bo‘yicha qidiring…')} aria-label={t('Sahifa, yo‘l yoki manba bo‘yicha qidiring…')} className="input h-9 w-full pl-9 pr-3" />
            </div>
            {['ALL', ...SAYT_SCOPE_ORDER].map((x) => <button key={x} type="button" aria-pressed={scope === x} onClick={() => setScope(x)} className={`fz-btn fz-btn--sm ${scope === x ? 'fz-btn--primary' : 'fz-btn--ghost'}`}>
              {x !== 'ALL' && <i aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: SCOPE_RANG[x] }} />}{x === 'ALL' ? t('Barchasi') : scopeNomi(x)}</button>)}
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5" aria-label={t('Xarita ko‘rinishi')}>
              <button type="button" aria-pressed={korinish === 'tree'} onClick={() => setKorinish('tree')} className={`fz-btn fz-btn--sm ${korinish === 'tree' ? 'fz-btn--primary' : 'fz-btn--ghost'}`}><GitBranch aria-hidden="true" />{t('Daraxt')}</button>
              <button type="button" aria-pressed={korinish === 'list'} onClick={() => setKorinish('list')} className={`fz-btn fz-btn--sm ${korinish === 'list' ? 'fz-btn--primary' : 'fz-btn--ghost'}`}><List aria-hidden="true" />{t('Ro‘yxat')}</button>
            </div>
          </div>
          {korinish === 'tree' ? <SaytTree layout={daraxt} onSelect={setTanlangan} /> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sahifalar.map((s) => <button key={s.yol} type="button" onClick={() => setTanlangan(s.yol)} className="rounded-md border p-3 text-left transition hover:brightness-125" style={{ ...tugunUslubi(SCOPE_RANG[s.scope] ?? 'var(--border-strong)'), boxShadow: `inset 3px 0 0 ${SCOPE_RANG[s.scope] ?? 'var(--border-strong)'}` }}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-medium">{s.nom}</div><div className="mt-1 truncate font-mono text-[11.5px] text-[var(--accent-text)]">{s.yol}</div></div><Chip tone="blue">{scopeNomi(s.scope)}</Chip></div>
              <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-text-mute">{s.izoh}</p>
              <div className="mt-3 flex flex-wrap gap-1"><Chip tone="muted">{t('O‘qish')}: {s.oqiydi.length}</Chip><Chip tone="muted">{t('Yozish')}: {s.yozadi.length}</Chip><Chip tone="muted">{t('Natija')}: {s.chiqaradi.length}</Chip></div>
            </button>)}
          </div>}
          {!sahifalar.length && <div className="py-12 text-center text-[13px] text-text-mute">{t('Mos sahifa topilmadi.')}</div>}
        </section>

        <section className="fz-card p-4">
          <div className="mb-4 flex items-center gap-2"><GitBranch size={17} className="text-[var(--accent-text)]" aria-hidden="true" /><h2 className="fz-card__title">{t('Asosiy ish oqimlari')}</h2></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {SAYT_OQIMLARI.map((oqim) => <div key={oqim.nom} className="fz-panel"><div className="text-[13px] font-medium">{oqim.nom}</div><div className="flex flex-wrap items-center gap-2">{oqim.qadamlar.map((qadam, i) => <span key={qadam} className="flex items-center gap-2"><button type="button" onClick={() => setTanlangan(qadam)} className="fz-btn fz-btn--sm">{SAYT_XARITASI.sahifalar.find((x) => x.yol === qadam)?.nom ?? qadam}</button>{i < oqim.qadamlar.length - 1 && <ArrowRight size={13} className="text-text-mute" aria-hidden="true" />}</span>)}</div></div>)}
          </div>
        </section>

        <section className="fz-card p-4"><div className="mb-3 flex items-center gap-2"><Database size={17} className="text-[var(--accent-text)]" aria-hidden="true" /><h2 className="fz-card__title">{t('Koddan yig‘ilgan texnik qamrov')}</h2></div><div className="grid gap-3 md:grid-cols-2"><div><div className="mb-2 text-[12px] text-text-mute">{t('O‘qish oq ro‘yxati')}</div><div className="flex max-h-36 flex-wrap gap-1 overflow-auto">{SAYT_XARITASI.readTables.map((x) => <Chip key={x} tone="muted">{x}</Chip>)}</div></div><div><div className="mb-2 text-[12px] text-text-mute">{t('Yozish amallari')}</div><div className="flex max-h-36 flex-wrap gap-1 overflow-auto">{SAYT_XARITASI.writeActions.map((x) => <Chip key={x.amal} tone="muted">{x.amal} → {x.rpc}</Chip>)}</div></div></div></section>
      </div>

      {detail && <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 p-4 md:p-8" onClick={() => setTanlangan(null)}>
        <aside role="dialog" aria-label={detail.nom} className="h-full w-full max-w-xl overflow-auto rounded-lg border border-border bg-surface p-5 shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4"><div><span className="fz-chip" style={{ color: SCOPE_RANG[detail.scope] }}>{scopeNomi(detail.scope)}</span><h2 className="mt-2 text-xl font-semibold">{detail.nom}</h2><div className="mt-1 font-mono text-[12px] text-text-mute">{detail.yol}</div></div>
            <button type="button" onClick={() => setTanlangan(null)} aria-label={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon"><X aria-hidden="true" /></button></div>
          <p className="mt-5 text-[13px] leading-6 text-text-dim">{detail.izoh}</p>
          <Detail title={t('O‘qiydi')} values={detail.oqiydi} /><Detail title={t('Yozadi')} values={detail.yozadi} /><Detail title={t('Chiqaradi')} values={detail.chiqaradi} /><Detail title={t('Keyingi iste’molchilar')} values={detail.beradi} />
        </aside>
      </div>}
    </Sahifa>
  );
}

function SaytTree({ layout, onSelect }: { layout: ReturnType<typeof buildSaytTree>; onSelect: (route: string) => void }) {
  const sahifaSoni = layout.nodes.filter((node) => node.kind === 'page').length;
  return <div className="rounded-md border border-border p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-mute">
      <span>{t('TIZIM_02 → doira (Global / Kompaniya / Loyiha / Obyekt) → sahifalar')}</span>
      <span>{t('{n} ta sahifa · chiziqlar navigatsiya yo‘nalishini ko‘rsatadi', { n: sahifaSoni })}</span>
    </div>
    <div className="overflow-auto rounded-md border border-border bg-bg" data-testid="sayt-2d-tree">
      <div className="relative" style={{ width: layout.width, height: layout.height, minWidth: layout.width }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
          {layout.edges.map((edge) => <path key={edge.id} d={edge.path} fill="none" style={{ stroke: 'var(--border-strong)' }} strokeWidth="1.5" />)}
        </svg>
        {layout.nodes.map((node) => {
          const isPage = node.kind === 'page';
          const rang = node.kind === 'root' ? 'var(--accent)' : SCOPE_RANG[node.scope ?? ''] ?? 'var(--border-strong)';
          const uslub = { left: node.x, top: node.y, width: node.width, height: node.height, ...tugunUslubi(rang), boxShadow: `inset 3px 0 0 ${rang}` };
          const oqish = node.page?.oqiydi.length ?? 0, yozish = node.page?.yozadi.length ?? 0;
          const content = <>
            <div className="truncate text-[13px] font-semibold text-text">{node.kind === 'scope' ? scopeNomi(node.scope) : node.label}</div>
            {isPage && <><div className="mt-1 truncate font-mono text-[11px] text-[var(--accent-text)]">{node.route}</div><div className="mt-1 flex gap-1.5 text-[11px] text-text-mute"><span>{t('O‘qish')} {oqish}</span><span>·</span><span>{t('Yozish')} {yozish}</span></div></>}
            {node.kind === 'scope' && <div className="mt-1 text-[11px] text-text-mute">{t('{n} ta sahifa', { n: layout.edges.filter((edge) => edge.from === node.id).length })}</div>}
            {node.kind === 'root' && <div className="mt-1 text-[11px] text-text-mute">{t('global navigatsiya daraxti')}</div>}
          </>;
          return isPage
            ? <button key={node.id} type="button" onClick={() => onSelect(node.route!)} className="absolute rounded-md border p-3 text-left transition hover:-translate-y-0.5 hover:brightness-125" style={uslub} aria-label={`${node.label} ${node.route}`}>{content}</button>
            : <div key={node.id} className="absolute rounded-md border p-3" style={uslub}>{content}</div>;
        })}
      </div>
    </div>
  </div>;
}

function Detail({ title, values }: { title: string; values: readonly string[] }) {
  return <section className="mt-5"><h3 className="fz-panel__h mb-2">{title}</h3><div className="flex flex-wrap gap-1">{values.length ? values.map((x) => <Chip key={x}>{x}</Chip>) : <span className="text-[12px] text-text-mute">{t('Yo‘q')}</span>}</div></section>;
}

export default SaytXaritasi;
