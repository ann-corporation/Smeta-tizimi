import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpZA, Filter, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { BOSH, filtrFaol, noyobQiymatlar, type FiltrHolat, type MatnAmal, type Saralash, type SonAmal, type Ustun, type UstunFiltr } from './ustunFiltr';

const KOP = 400;
const sonFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

type Props<R> = {
  rows: readonly R[]; ustunlar: readonly Ustun<R>[]; kalit: string; holat: FiltrHolat; saralash: Saralash;
  barg?: (r: R) => boolean; saralashMumkin: boolean;
  onFiltr: (f: UstunFiltr | undefined) => void; onSaralash: (s: Saralash) => void;
};

/** Sarlavhadagi ▾ tugma — Excel'dagi avtofiltr oynasi: saralash, qiymatlar ro'yxati (belgilash), qidiruv, son/matn sharti. */
export function UstunFiltrTugma<R>({ ...p }: Props<R>) {
  const u = p.ustunlar.find((x) => x.kalit === p.kalit);
  const [ochiq, setOchiq] = useState(false);
  const tugRef = useRef<HTMLButtonElement>(null);
  const faol = filtrFaol(p.holat[p.kalit]) || p.saralash?.kalit === p.kalit;
  if (!u) return null;
  return (
    <>
      <button ref={tugRef} type="button" onClick={(e) => { e.stopPropagation(); setOchiq((o) => !o); }}
        aria-label={t('Ustun filtri')} title={t('Filtr va saralash')} aria-expanded={ochiq}
        className={`ml-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded align-middle ${faol ? 'bg-accent/20 text-accent' : 'text-text-mute hover:bg-surface-3 hover:text-text'}`}>
        <Filter size={11} strokeWidth={faol ? 2.6 : 2} />
      </button>
      {ochiq && <FiltrOyna {...p} u={u} anchor={tugRef.current} yop={() => setOchiq(false)} />}
    </>
  );
}

function FiltrOyna<R>({ rows, ustunlar, u, holat, saralash, barg, saralashMumkin, onFiltr, onSaralash, anchor, yop }: Props<R> & { u: Ustun<R>; anchor: HTMLElement | null; yop: () => void }) {
  const joriy = holat[u.kalit];
  const qiymatlar = useMemo(() => noyobQiymatlar(rows, ustunlar, u, holat, barg), [rows, ustunlar, u, holat, barg]);
  const [qidir, setQidir] = useState('');
  const [belgi, setBelgi] = useState<Set<string>>(() => new Set(joriy?.tanlangan ?? qiymatlar.map((x) => x.kalit)));
  const [sonAmal, setSonAmal] = useState<SonAmal | ''>(joriy?.son?.amal ?? '');
  const [a, setA] = useState(joriy?.son ? String(joriy.son.a) : '');
  const [b, setB] = useState(joriy?.son?.b != null ? String(joriy.son.b) : '');
  const [matnAmal, setMatnAmal] = useState<MatnAmal>(joriy?.matn?.amal ?? 'ichida');
  const [matnQ, setMatnQ] = useState(joriy?.matn?.q ?? '');
  const oyna = useRef<HTMLDivElement>(null);
  const [joy, setJoy] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect(); const el = oyna.current;
    if (!r || !el) return;
    const w = el.offsetWidth; const h = el.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const past = r.bottom + 4; const top = past + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : past;
    setJoy({ left, top });
  }, [anchor]);
  useEffect(() => {
    const k = (e: MouseEvent) => { if (oyna.current && !oyna.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) yop(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') yop(); };
    document.addEventListener('mousedown', k); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', k); document.removeEventListener('keydown', esc); };
  }, [anchor, yop]);

  const q = qidir.trim().toLowerCase();
  const korin = q ? qiymatlar.filter((x) => (x.kalit === BOSH ? t('(bo‘sh)') : nomi(x.v, u.tur)).toLowerCase().includes(q)) : qiymatlar;
  const kopmi = korin.length - KOP > 0;
  const hammasi = korin.length > 0 && korin.every((x) => belgi.has(x.kalit));
  const nomi = (v: unknown, tur: string) => (tur === 'son' && typeof v === 'number' ? sonFmt.format(v) : String(v));

  const qollash = () => {
    const f: UstunFiltr = {};
    // Qidiruv bilan qo'llansa — Excel'dagidek faqat ko'rinayotgan va belgilanganlar qoladi.
    const tanl = q ? korin.filter((x) => belgi.has(x.kalit)).map((x) => x.kalit) : [...belgi];
    if (q || tanl.length !== qiymatlar.length) f.tanlangan = tanl;
    if (sonAmal && a.trim() !== '' && Number.isFinite(Number(a.replace(',', '.')))) {
      f.son = { amal: sonAmal, a: Number(a.replace(',', '.')), b: sonAmal === 'oraliq' && b.trim() !== '' ? Number(b.replace(',', '.')) : undefined };
    }
    if (u.tur === 'matn' && matnQ.trim()) f.matn = { amal: matnAmal, q: matnQ };
    onFiltr(filtrFaol(f) ? f : undefined); yop();
  };

  return createPortal(
    <div ref={oyna} role="dialog" aria-label={`${t('Filtr')}: ${u.nom}`} onClick={(e) => e.stopPropagation()}
      className="fixed z-[200] flex w-[290px] flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2.5 text-[12px] font-normal normal-case tracking-normal text-text shadow-2xl"
      style={{ left: joy.left, top: joy.top }}>
      <div className="flex items-center justify-between"><b className="truncate">{u.nom}</b><button type="button" onClick={yop} aria-label={t('Yopish')} className="text-text-mute hover:text-text"><X size={14} /></button></div>
      {saralashMumkin && <div className="flex gap-1">
        <button type="button" className={`fz-btn fz-btn--sm flex-1 ${saralash?.kalit === u.kalit && saralash.yonalish === 'osish' ? 'border-accent text-accent' : ''}`} onClick={() => { onSaralash({ kalit: u.kalit, yonalish: 'osish' }); yop(); }}><ArrowDownAZ size={13} />{u.tur === 'son' ? t('Kichikdan kattaga') : t('A → Я')}</button>
        <button type="button" className={`fz-btn fz-btn--sm flex-1 ${saralash?.kalit === u.kalit && saralash.yonalish === 'kamayish' ? 'border-accent text-accent' : ''}`} onClick={() => { onSaralash({ kalit: u.kalit, yonalish: 'kamayish' }); yop(); }}><ArrowUpZA size={13} />{u.tur === 'son' ? t('Kattadan kichikka') : t('Я → A')}</button>
      </div>}
      {u.tur === 'son'
        ? <div className="flex flex-wrap items-center gap-1">
            <select aria-label={t('Son sharti')} value={sonAmal} onChange={(e) => setSonAmal(e.target.value as SonAmal | '')} className="input h-7 flex-1 px-1 text-[12px]">
              <option value="">{t('Son sharti — yo‘q')}</option>
              <option value=">">{'>'} {t('katta')}</option><option value=">=">{'≥'} {t('katta yoki teng')}</option>
              <option value="<">{'<'} {t('kichik')}</option><option value="<=">{'≤'} {t('kichik yoki teng')}</option>
              <option value="=">{'='} {t('teng')}</option><option value="!=">{'≠'} {t('teng emas')}</option>
              <option value="oraliq">{t('oraliqda')}</option>
            </select>
            {sonAmal && <input aria-label={t('Son qiymati')} inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} className="input h-7 w-[84px] px-1.5 text-[12px]" />}
            {sonAmal === 'oraliq' && <input aria-label={t('gacha')} inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} className="input h-7 w-[84px] px-1.5 text-[12px]" />}
          </div>
        : <div className="flex items-center gap-1">
            <select aria-label={t('Matn sharti')} value={matnAmal} onChange={(e) => setMatnAmal(e.target.value as MatnAmal)} className="input h-7 px-1 text-[12px]">
              <option value="ichida">{t('ichida bor')}</option><option value="ichida_emas">{t('ichida yo‘q')}</option>
              <option value="boshlanadi">{t('bilan boshlanadi')}</option><option value="teng">{t('teng')}</option>
            </select>
            <input aria-label={t('Matn')} value={matnQ} onChange={(e) => setMatnQ(e.target.value)} placeholder={t('matn…')} className="input h-7 min-w-0 flex-1 px-1.5 text-[12px]" />
          </div>}
      <input aria-label={t('Qiymatlardan qidirish')} autoFocus value={qidir} onChange={(e) => setQidir(e.target.value)} placeholder={t('Qiymatlardan qidirish…')} className="input h-7 px-1.5 text-[12px]" />
      <div className="max-h-[min(260px,40dvh)] overflow-auto rounded border border-border bg-surface-2 py-1">
        <label className="flex cursor-pointer items-center gap-2 px-2 py-0.5 font-medium">
          <input type="checkbox" checked={hammasi} onChange={() => setBelgi((s) => { const n = new Set(s); for (const x of korin) { if (hammasi) n.delete(x.kalit); else n.add(x.kalit); } return n; })} />
          {q ? t('Topilganlarni belgilash') : t('Hammasini belgilash')} <span className="ml-auto text-text-mute">{korin.length}</span>
        </label>
        {korin.slice(0, KOP).map((x) => (
          <label key={x.kalit} className="flex cursor-pointer items-center gap-2 px-2 py-0.5 hover:bg-surface-3">
            <input type="checkbox" checked={belgi.has(x.kalit)} onChange={() => setBelgi((s) => { const n = new Set(s); if (n.has(x.kalit)) n.delete(x.kalit); else n.add(x.kalit); return n; })} />
            <span className={`min-w-0 flex-1 truncate ${x.kalit === BOSH ? 'italic text-text-mute' : ''}`} title={x.kalit === BOSH ? undefined : String(x.v)}>{x.kalit === BOSH ? t('(bo‘sh)') : nomi(x.v, u.tur)}</span>
            <span className="text-[11px] text-text-mute">{x.soni}</span>
          </label>
        ))}
        {kopmi && <p className="px-2 py-1 text-[11px] text-text-mute">{t('Yana {n} ta — qidiruv bilan toraytiring', { n: korin.length - KOP })}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className="fz-btn fz-btn--sm" disabled={!filtrFaol(joriy) && saralash?.kalit !== u.kalit} onClick={() => { onFiltr(undefined); if (saralash?.kalit === u.kalit) onSaralash(null); yop(); }}>{t('Tozalash')}</button>
        <button type="button" className="fz-btn fz-btn--sm fz-btn--primary ml-auto" disabled={belgi.size === 0 && !sonAmal && !matnQ.trim()} onClick={qollash}>{t('Qo‘llash')}</button>
      </div>
    </div>,
    document.body,
  );
}

/** Jadval tepasida: «N ta filtr faol · Tozalash» va natija soni. */
export function FiltrHolatQatori({ soni, natija, jami, tozala }: { soni: number; natija: number; jami: number; tozala: () => void }) {
  if (!soni) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-[12px]">
      <Filter size={12} className="text-accent" />
      <span>{t('{n} ta filtr/saralash faol', { n: soni })} · {t('{a} / {b} qator', { a: natija, b: jami })}</span>
      <button type="button" className="ml-auto text-accent underline" onClick={tozala}>{t('Filtrlarni tozalash')}</button>
    </div>
  );
}
