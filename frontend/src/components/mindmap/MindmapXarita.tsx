/**
 * «Kompaniya xaritasi» — /admin/mindmap ning sukut ko‘rinishi (egasi 2026-10-25: rahbar panelida mindmapga urg‘u,
 * maksimal vizual izoh — qaragan odam ishlar holatini tushunsin).
 *
 * Kompaniya → Loyihalar → Obyektlar; har obyekt kartasida smeta, F2 / fakt foizi, real ogohlantirishlar va
 * biriktirilgan resurslar. Yuqorida asosiy ko‘rsatkichlar, o‘ngda tanlangan tugun paneli (havolalar bilan).
 * Ma’lumot — `t2_mindmap_grafi` (ota komponent o‘qiydi va 30 soniyada yangilaydi); bu komponent hech narsa yozmaydi.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Box, Clock, Info, LayoutDashboard, List, Network, PencilLine, RefreshCcw, Search, X, Map as MapIkon } from 'lucide-react';
import type { MindmapGraf } from '../../api/t2-mindmap';
import { pulQisqa } from '../../lib/format';
import { t, useTil, sanaFormatla } from '../../i18n/til';
import {
  daraxtQur, fokusYoli, mindmapJoyla, qidiruvMoslari, HOLAT_TARTIB,
  type XDaraxt, type XHolat,
} from '../../lib/mindmap-korinish';
import { XaritaKanvas } from './XaritaKanvas';
import { XaritaPanel, type HodisaHolati } from './XaritaPanel';
import { XaritaRoyxat } from './XaritaRoyxat';
import { Bajarilish, HolatChiziq, Romb } from './belgilar';
import { HOLAT_RANG, foizMatn, holatIzohi, holatNomi } from './holat';

export type MindmapKorinishTuri = 'xarita' | 'royxat' | '2d' | '3d' | 'tahrir';

const KORINISHLAR: { k: MindmapKorinishTuri; ikon: typeof List; nom: () => string }[] = [
  { k: 'xarita', ikon: MapIkon, nom: () => t('Xarita') },
  { k: 'royxat', ikon: List, nom: () => t('Ro‘yxat') },
  { k: '2d', ikon: Network, nom: () => t('2D graf') },
  { k: '3d', ikon: Box, nom: () => t('3D graf') },
  { k: 'tahrir', ikon: PencilLine, nom: () => t('Tahrir') },
];

/** Ko‘rinish almashtirgich (yangi va eski ko‘rinishlarda bir xil). */
export function KorinishTanlagich({ joriy, onTanla, className = '' }: { joriy: MindmapKorinishTuri; onTanla: (k: MindmapKorinishTuri) => void; className?: string }) {
  return (
    <div role="tablist" aria-label={t('Ko‘rinish')} className={'inline-flex max-w-full overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface-2 p-0.5 ' + className}>
      {KORINISHLAR.map(({ k, ikon: I, nom }) => (
        <button key={k} type="button" role="tab" aria-selected={joriy === k} onClick={() => onTanla(k)}
          className={'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[12px] font-medium transition-colors ' +
            (joriy === k ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-text-dim hover:bg-[var(--surface-3)] hover:text-text')}>
          <I aria-hidden className="h-3.5 w-3.5" />{nom()}
        </button>
      ))}
    </div>
  );
}

function useEkran(sorov: string): boolean {
  const ol = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(sorov).matches;
  const [mos, setMos] = useState(ol);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(sorov);
    const f = () => setMos(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, [sorov]);
  return mos;
}

type Props = {
  graf: MindmapGraf;
  yuklanmoqda: boolean;
  xato: string;
  oxirgiYangilanish: Date | null;
  onYangila: () => void;
  tanlangan: string | null;
  onTanla: (id: string | null) => void;
  korinish: 'xarita' | 'royxat';
  onKorinish: (k: MindmapKorinishTuri) => void;
  hodisalar?: HodisaHolati;
  onTahrirdaOch?: (id: string) => void;
};

export function MindmapXarita({ graf, yuklanmoqda, xato, oxirgiYangilanish, onYangila, tanlangan, onTanla, korinish, onKorinish, hodisalar, onTahrirdaOch }: Props) {
  useTil();
  const katta = useEkran('(min-width: 1024px)');
  const kamQisqarish = useReducedMotion();
  const daraxt = useMemo(() => daraxtQur(graf), [graf]);
  const [yigilgan, setYigilgan] = useState<Set<string>>(new Set());
  const joylashuv = useMemo(() => mindmapJoyla(daraxt, yigilgan), [daraxt, yigilgan]);
  const [qidiruv, setQidiruv] = useState('');
  const [holatFiltri, setHolatFiltri] = useState<XHolat | null>(null);
  const [panelOchiq, setPanelOchiq] = useState(false);
  const [izohOchiq, setIzohOchiq] = useState(katta);
  const qidiruvRef = useRef<HTMLInputElement>(null);
  const guruhNomi = t('Loyihasiz obyektlar');
  const root = daraxt.tugunlar.get(daraxt.ildiz)!;

  // Tanlangan tugun yig‘ilgan loyiha ichida bo‘lsa — loyihani yoyamiz.
  useEffect(() => {
    const ota = tanlangan ? daraxt.tugunlar.get(tanlangan)?.ota : null;
    if (ota && yigilgan.has(ota)) setYigilgan((s) => { const n = new Set(s); n.delete(ota); return n; });
  }, [tanlangan, daraxt, yigilgan]);
  useEffect(() => { if (tanlangan) setPanelOchiq(true); }, [tanlangan]);

  // «/» — qidiruv.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (e.key === '/' && tg?.tagName !== 'INPUT' && tg?.tagName !== 'TEXTAREA' && !tg?.isContentEditable) { e.preventDefault(); qidiruvRef.current?.focus(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const qidir = useMemo(() => qidiruvMoslari(daraxt, qidiruv, guruhNomi), [daraxt, qidiruv, guruhNomi]);
  /** Filtr + qidiruvga mos obyektlar (ajdodlari bilan). `null` — filtr yo‘q. */
  const filtrSet = useMemo(() => {
    if (!qidir && !holatFiltri) return null;
    const s = new Set<string>();
    for (const x of daraxt.tugunlar.values()) {
      if (x.tur !== 'obyekt') continue;
      const qMos = !qidir || qidir.korinadi.has(x.id);
      const hMos = !holatFiltri || x.holat === holatFiltri;
      if (qMos && hMos) { let c: string | null = x.id; while (c) { s.add(c); c = daraxt.tugunlar.get(c)?.ota ?? null; } }
    }
    if (qidir) for (const id of qidir.mos) if (daraxt.tugunlar.get(id)?.tur !== 'obyekt' && !holatFiltri) { let c: string | null = id; while (c) { s.add(c); c = daraxt.tugunlar.get(c)?.ota ?? null; } }
    return s;
  }, [daraxt, qidir, holatFiltri]);
  const yoritilgan = useMemo(() => (tanlangan && daraxt.tugunlar.has(tanlangan) && tanlangan !== daraxt.ildiz ? fokusYoli(daraxt, tanlangan) : filtrSet), [tanlangan, daraxt, filtrSet]);
  const mosObyektlar = filtrSet ? [...filtrSet].filter((id) => daraxt.tugunlar.get(id)?.tur === 'obyekt').length : root.obyektSoni;

  const holatniTanla = (h: XHolat) => { setHolatFiltri((f) => (f === h ? null : h)); onTanla(null); };
  const qidiruvEnter = () => {
    if (!qidir?.mos.size) return;
    const birinchi = daraxt.tartib.find((id) => qidir.mos.has(id));
    if (birinchi) onTanla(birinchi);
  };
  const yigToggle = (id: string) => setYigilgan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hammasiniYig = (yig: boolean) => setYigilgan(yig ? new Set(root.bolalar.filter((id) => daraxt.tugunlar.get(id)!.bolalar.length)) : new Set());

  const bosh = graf.tugunlar.length === 0;
  const tarkibYoq = !bosh && root.bolalar.length === 0;

  const panel = (
    <XaritaPanel daraxt={daraxt} graf={graf} tanlangan={tanlangan} onTanla={onTanla} guruhNomi={guruhNomi}
      hodisalar={hodisalar} onTahrirdaOch={onTahrirdaOch} onHolatFiltr={holatniTanla} holatFiltri={holatFiltri}
      onYop={katta ? (tanlangan ? () => onTanla(null) : undefined) : () => { setPanelOchiq(false); onTanla(null); }} />
  );

  const asboblar = (
    <div data-boshqaruv className="flex flex-wrap items-center gap-2">
      <label className="relative flex min-w-0 basis-full items-center sm:max-w-[300px] sm:flex-none sm:basis-[300px]">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-mute" />
        <input ref={qidiruvRef} value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); onTanla(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') qidiruvEnter(); if (e.key === 'Escape') setQidiruv(''); }}
          placeholder={t('Obyekt yoki loyihani qidiring…')} aria-label={t('Xaritada qidirish')}
          className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface pl-8 pr-14 text-[12.5px]" />
        {qidiruv
          ? <button type="button" onClick={() => setQidiruv('')} className="absolute right-1.5 fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Qidiruvni tozalash')}><X /></button>
          : <kbd className="fz-kbd absolute right-2">/</kbd>}
      </label>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('Holat bo‘yicha filtr')}>
        {HOLAT_TARTIB.filter((h) => root.holatSanoq[h] > 0).map((h) => (
          <button key={h} type="button" onClick={() => holatniTanla(h)} aria-pressed={holatFiltri === h} title={holatIzohi(h)}
            className={'inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 text-[12px] transition-colors ' +
              (holatFiltri === h ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-text' : 'border-border bg-surface text-text-dim hover:text-text')}>
            <Romb holat={h} olcham={7} />{holatNomi(h)}<b className="font-mono tabular-nums">{root.holatSanoq[h]}</b>
          </button>
        ))}
      </div>
      {(qidiruv || holatFiltri) && (
        <span className="text-[11.5px] text-text-mute" aria-live="polite">{t('{n} / {m} obyekt', { n: mosObyektlar, m: root.obyektSoni })}</span>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-bg text-text lg:overflow-hidden" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* SARLAVHA + KO‘RSATKICHLAR */}
      <header className="shrink-0 border-b border-border bg-surface px-4 pb-3 pt-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[19px] font-semibold leading-7 text-text lg:text-[21px]">
              <span aria-hidden className="inline-block h-3 w-3 rotate-45 rounded-[2px] bg-[var(--accent)]" />
              {t('Kompaniya xaritasi')}
            </h1>
            <p className="mt-0.5 hidden text-[12.5px] text-text-dim sm:block">{t('Loyihalar → obyektlar → smeta, fakt va F2 holati. Tugunni bosing — tafsilot va havolalar.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {oxirgiYangilanish && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-text-mute" title={t('Har 30 soniyada yangilanadi')}>
                <Clock aria-hidden className="h-3.5 w-3.5" />{sanaFormatla(oxirgiYangilanish, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button type="button" className="fz-btn fz-btn--sm fz-btn--icon" onClick={onYangila} aria-label={t('Yangilash')} title={t('Yangilash')}>
              <RefreshCcw className={yuklanmoqda && !kamQisqarish ? 'animate-spin' : ''} />
            </button>
            {!katta && (
              <button type="button" className="fz-btn fz-btn--sm" onClick={() => { onTanla(null); setPanelOchiq(true); }}>
                <LayoutDashboard aria-hidden />{t('Umumiy holat')}
              </button>
            )}
            <KorinishTanlagich joriy={korinish} onTanla={onKorinish} />
          </div>
        </div>
        {!bosh && <Korsatkichlar daraxt={daraxt} graf={graf} onHolat={holatniTanla} />}
      </header>

      {xato && (
        <div className="fz-note fz-note--danger m-3" role="alert">
          <AlertTriangle aria-hidden />
          <span className="flex-1">{t('Xarita o‘qilmadi: {x}', { x: xato })}</span>
          <button type="button" className="fz-btn fz-btn--sm" onClick={onYangila}>{t('Qayta urinish')}</button>
        </div>
      )}

      <div className={'relative flex flex-1 lg:min-h-0 ' + (korinish === 'xarita' ? 'min-h-[72vh]' : '')}>
        <main className="relative min-w-0 flex-1">
          {bosh && (
            <div className="grid h-full place-items-center p-6 text-center text-[13px] text-text-mute">
              {yuklanmoqda ? t('Xarita yuklanmoqda…') : t('Xarita ma’lumoti yo‘q.')}
            </div>
          )}
          {tarkibYoq && (
            <div className="grid h-full place-items-center p-6">
              <div className="fz-note fz-note--info max-w-md">
                <Info aria-hidden />
                <span>{t('Hali loyiha va obyekt yo‘q. Obyektlar «Obyektlar» sahifasida, loyiha va resurslar «Tahrir» ko‘rinishida qo‘shiladi.')}</span>
              </div>
            </div>
          )}
          {!bosh && !tarkibYoq && korinish === 'xarita' && (
            <XaritaKanvas daraxt={daraxt} joylashuv={joylashuv} tanlangan={tanlangan} onTanla={onTanla} yoritilgan={yoritilgan}
              yigilgan={yigilgan} onYigToggle={yigToggle} onHammasiniYig={hammasiniYig} guruhNomi={guruhNomi}>
              <div data-boshqaruv className="absolute left-3 right-16 top-3 z-10">{asboblar}</div>
              <Izoh ochiq={izohOchiq} setOchiq={setIzohOchiq} />
            </XaritaKanvas>
          )}
          {!bosh && !tarkibYoq && korinish === 'royxat' && (
            <div className="lg:h-full lg:overflow-y-auto">
              <div className="sticky top-0 z-[2] border-b border-border bg-bg px-3 py-2 sm:px-4">{asboblar}</div>
              <XaritaRoyxat daraxt={daraxt} korinadi={(id) => !filtrSet || filtrSet.has(id)} tanlangan={tanlangan} onTanla={onTanla} guruhNomi={guruhNomi} />
            </div>
          )}
        </main>

        {katta && !bosh && (
          <aside aria-label={t('Tafsilot paneli')} className="flex w-[372px] shrink-0 flex-col border-l border-border bg-surface">
            {panel}
          </aside>
        )}
        <AnimatePresence>
          {!katta && panelOchiq && !bosh && (
            <>
              <motion.div key="fon" className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: kamQisqarish ? 0 : 0.15 }}
                onClick={() => { setPanelOchiq(false); onTanla(null); }} />
              <motion.aside key="panel" role="dialog" aria-modal="true" aria-label={t('Tafsilot paneli')}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-surface shadow-[var(--shadow-pop)]"
                initial={{ x: kamQisqarish ? 0 : '100%' }} animate={{ x: 0 }} exit={{ x: kamQisqarish ? 0 : '100%' }}
                transition={kamQisqarish ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}>
                {panel}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Korsatkichlar({ daraxt, graf, onHolat }: { daraxt: XDaraxt; graf: MindmapGraf; onHolat: (h: XHolat) => void }) {
  const r = daraxt.tugunlar.get(daraxt.ildiz)!;
  const j = graf.jamlanma;
  const loyihaSoni = r.bolalar.filter((id) => daraxt.tugunlar.get(id)!.tur === 'loyiha').length;
  const smetasiz = j?.smetasiz_obyekt ?? null;
  const taxm = r.smetaToliq ? '' : '≈ ';
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
      <Kpi nom={t('Obyektlar')} qiymat={String(r.obyektSoni)} izoh={t('{n} ta loyihada', { n: loyihaSoni })} />
      <Kpi nom={t('Smeta (ustamasiz)')} qiymat={r.smeta == null ? '—' : taxm + pulQisqa(r.smeta)}
        izoh={smetasiz ? t('{n} obyektda smeta yo‘q', { n: smetasiz }) : t('barcha obyektlarda bor')} ogoh={!!smetasiz} />
      <Kpi nom={t('Bajarilgan (fakt)')} rang="var(--info)" qiymat={pulQisqa(r.fakt)} izoh={t('smetadan')} title={t('Foiz faqat smetasi bor obyektlar bo‘yicha')}>
        <Bajarilish faktFoiz={r.faktFoiz} f2Foiz={0} smetaBor={r.smeta != null} matn={foizMatn(r.faktFoiz)} />
      </Kpi>
      <Kpi nom={t('F2 bilan topshirilgan')} rang="var(--accent)" qiymat={pulQisqa(r.f2)} izoh={t('smetadan')} title={t('Foiz faqat smetasi bor obyektlar bo‘yicha')}>
        <Bajarilish faktFoiz={r.f2Foiz} f2Foiz={r.f2Foiz} smetaBor={r.smeta != null} />
      </Kpi>
      <div className="fz-kpi">
        <span className="fz-kpi__label">{t('Obyektlar holati')}</span>
        <HolatChiziq sanoq={r.holatSanoq} balandlik={10} className="mt-1.5" />
        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px]">
          {(['xavf', 'etibor', 'yaxshi'] as XHolat[]).map((h) => (
            <button key={h} type="button" onClick={() => onHolat(h)} className="inline-flex items-center gap-1 text-text-dim hover:text-text" title={holatIzohi(h)}>
              <i aria-hidden className="inline-block h-1.5 w-1.5 rotate-45" style={{ background: HOLAT_RANG[h] }} />
              {holatNomi(h) + ' ' + r.holatSanoq[h]}
            </button>
          ))}
        </span>
      </div>
      <Kpi nom={t('Ochiq zayavkalar')} qiymat={r.zayavka == null ? '—' : String(r.zayavka)}
        izoh={j?.narxsiz_obyekt ? t('{n} obyektda narxsiz qator', { n: j.narxsiz_obyekt }) : t('narxsiz qator yo‘q')} ogoh={!!j?.narxsiz_obyekt} />
    </div>
  );
}

function Kpi({ nom, qiymat, izoh, rang, ogoh, title, children }: { nom: string; qiymat: string; izoh?: string; rang?: string; ogoh?: boolean; title?: string; children?: React.ReactNode }) {
  return (
    <div className="fz-kpi" title={title}>
      <span className="fz-kpi__label">{rang && <i style={{ background: rang }} />}{nom}</span>
      <span className="fz-kpi__value text-[18px] leading-6 lg:text-[20px] lg:leading-[26px]">{qiymat}</span>
      {children}
      {izoh && <span className={'fz-kpi__sub ' + (ogoh ? 'text-warn' : '')}>{izoh}</span>}
    </div>
  );
}

function Izoh({ ochiq, setOchiq }: { ochiq: boolean; setOchiq: (v: boolean) => void }) {
  if (!ochiq) {
    return (
      <div data-boshqaruv className="absolute bottom-3 left-3 z-10">
        <button type="button" className="fz-btn fz-btn--sm shadow-[var(--shadow-pop)]" onClick={() => setOchiq(true)}><Info aria-hidden />{t('Belgilar izohi')}</button>
      </div>
    );
  }
  return (
    <div data-boshqaruv role="note" aria-label={t('Belgilar izohi')}
      className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--radius-md)] border border-border bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-2 text-[11.5px] text-text-dim shadow-[var(--shadow-pop)]">
      {HOLAT_TARTIB.map((h) => <span key={h} className="inline-flex items-center gap-1.5"><Romb holat={h} olcham={7} />{holatNomi(h)}</span>)}
      <span className="hidden h-3 w-px bg-[var(--border)] sm:inline-block" />
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-flex items-end gap-1"><i className="inline-block h-1.5 w-1.5 rotate-45 bg-[var(--text-mute)]" /><i className="inline-block h-2.5 w-2.5 rotate-45 bg-[var(--text-mute)]" /></span>
        {t('Romb o‘lchami va chiziq qalinligi — smeta summasi')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="flex h-2 w-8 overflow-hidden rounded-sm bg-[var(--surface-3)]"><i className="w-1/2 bg-[var(--accent)]" /><i className="w-1/4 bg-[var(--info)]" /></span>
        {t('F2 topshirilgan + bajarilgan (fakt) / smeta')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-8 rounded-sm border border-dashed border-[var(--border-strong)]" />
        {t('Smeta yuklanmagan — foiz yo‘q')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="fz-chip fz-chip--danger h-4 px-1"><AlertTriangle className="h-3 w-3" /></span>
        {t('Ogohlantirishlar soni (qizil — muammo, sariq — e’tibor)')}
      </span>
      <span className="ml-auto hidden text-text-mute xl:inline">{t('Strelkalar — yurish · Enter — ochish · 0 — sig‘dirish · / — qidiruv')}</span>
      <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm -my-1" onClick={() => setOchiq(false)} aria-label={t('Izohni yopish')}><X /></button>
    </div>
  );
}
