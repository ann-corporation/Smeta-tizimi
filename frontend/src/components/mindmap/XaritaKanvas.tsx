/**
 * Kompaniya xaritasi kanvasi (SVG): ikki tomonlama mindmap — markazda kompaniya, loyihalar, chetda obyekt kartalari.
 * Kodlash: romb rangi — holat, romb o‘lchami va chiziq qalinligi — smeta summasi, karta o‘lchagichi — F2 va fakt / smeta.
 * Fokus + kontekst: tanlangan tugun yo‘li yorug‘, qolgani xiralashadi; kamera silliq markazlanadi (reduced-motion — darhol).
 * Klaviatura: Tab — tugunlar, strelkalar — daraxt bo‘ylab, Enter — ochish, Esc — tanlovni bekor qilish, + / − / 0 — zum.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, FileText, HardHat, Maximize2, Minus, Plus, ShieldAlert, Truck, Warehouse, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { t } from '../../i18n/til';
import {
  hajmOlcham, klaviaturaQadam, markazlaKamera, sigdirKamera, zumla, chegaraHisobla,
  type Joy, type Joylashuv, type Kamera, type XDaraxt, type XHolat, type XTugun,
} from '../../lib/mindmap-korinish';
import { HOLAT_RANG, foizMatn, holatNomi, pulQ } from './holat';

type Props = {
  daraxt: XDaraxt;
  joylashuv: Joylashuv;
  tanlangan: string | null;
  onTanla: (id: string | null) => void;
  /** Ko‘rinadigan (yorug‘) tugunlar; `null` — hammasi. */
  yoritilgan: Set<string> | null;
  yigilgan: ReadonlySet<string>;
  onYigToggle: (id: string) => void;
  onHammasiniYig: (yig: boolean) => void;
  guruhNomi: string;
  children?: React.ReactNode;
};

/* Matnni kenglikka sig‘diradi (canvas measureText, bo‘lmasa taxminiy). */
let olchovCtx: CanvasRenderingContext2D | null | undefined;
function kes(matn: string, maxPx: number, shrift: string, px: number): string {
  if (olchovCtx === undefined) {
    try { olchovCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { olchovCtx = null; }
  }
  const ol = (s: string) => {
    if (olchovCtx) { olchovCtx.font = shrift; return olchovCtx.measureText(s).width; }
    return s.length * px * 0.56;
  };
  if (ol(matn) <= maxPx) return matn;
  let lo = 0, hi = matn.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ol(matn.slice(0, m) + '…') <= maxPx) lo = m; else hi = m - 1; }
  return matn.slice(0, Math.max(1, lo)) + '…';
}

const SHRIFT_NOM = (px: number) => `600 ${px}px Geologica, "IBM Plex Sans", system-ui, sans-serif`;

function ariaMatn(x: XTugun, guruhNomi: string): string {
  const tur = x.tur === 'kompaniya' ? t('Kompaniya') : x.tur === 'loyiha' ? t('Loyiha') : x.tur === 'guruh' ? t('Guruh') : t('Obyekt');
  const parts = [x.tur === 'guruh' ? guruhNomi : x.nom, tur, t('holat: {h}', { h: holatNomi(x.holat) })];
  if (x.f2Foiz != null) parts.push(t('F2 (tasdiqlangan) {p}', { p: foizMatn(x.f2Foiz) }));
  if ((x.kritikSoni ?? 0) > 0) parts.push(t('{n} kritik signal', { n: x.kritikSoni ?? 0 }));
  else if ((x.signalSoni ?? 0) > 0) parts.push(t('{n} ochiq signal', { n: x.signalSoni ?? 0 }));
  if (x.smeta != null) parts.push(t('smeta {s}', { s: pulQ(x.smeta) }));
  if (x.tur !== 'obyekt') parts.push(t('{n} ta obyekt', { n: x.obyektSoni }));
  return parts.join(', ');
}

export function XaritaKanvas({ daraxt, joylashuv, tanlangan, onTanla, yoritilgan, yigilgan, onYigToggle, onHammasiniYig, guruhNomi, children }: Props) {
  const kamQisqarish = useReducedMotion();
  const quti = useRef<HTMLDivElement>(null);
  const [olcham, setOlcham] = useState({ w: 0, h: 0 });
  const [kam, setKam] = useState<Kamera>({ x: 0, y: 0, k: 0.8 });
  const kamRef = useRef(kam);
  kamRef.current = kam;
  const animRef = useRef<number | null>(null);
  const sigdirildi = useRef(false);
  const [fokusId, setFokusId] = useState<string | null>(null);

  useEffect(() => {
    const el = quti.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setOlcham({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setOlcham({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const uchir = useCallback((maqsad: Kamera) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (kamQisqarish) { setKam(maqsad); return; }
    const bosh = kamRef.current, t0 = performance.now(), dav = 420;
    const qadam = (n: number) => {
      const p = Math.min(1, (n - t0) / dav);
      const e = 1 - Math.pow(1 - p, 3);
      setKam({ x: bosh.x + (maqsad.x - bosh.x) * e, y: bosh.y + (maqsad.y - bosh.y) * e, k: bosh.k + (maqsad.k - bosh.k) * e });
      if (p < 1) animRef.current = requestAnimationFrame(qadam);
    };
    animRef.current = requestAnimationFrame(qadam);
  }, [kamQisqarish]);
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const sigdir = useCallback((silliq = true) => {
    if (!olcham.w || !olcham.h) return;
    const c = joylashuv.chegara;
    // Yuqorida asboblar paneli (~48px), pastda belgilar izohi (~56px) — xarita ular orasiga sig‘adi.
    const tepa = 52, past = olcham.w < 640 ? 60 : 64;
    const k0 = sigdirKamera(c, olcham.w, Math.max(120, olcham.h - tepa - past), olcham.w < 640 ? 12 : 36);
    const k = { ...k0, y: k0.y + tepa };
    if (silliq) uchir(k); else setKam(k);
  }, [joylashuv.chegara, olcham.w, olcham.h, uchir]);

  // Birinchi chizishda butun xarita ko‘rinsin.
  useEffect(() => {
    if (sigdirildi.current || !olcham.w || !joylashuv.joylar.size) return;
    sigdirildi.current = true;
    sigdir(false);
  }, [olcham.w, joylashuv.joylar.size, sigdir]);

  // Tanlangan tugunga silliq uchish (kontekst saqlanadi: tanlangan + bolalari ko‘rinadi).
  useEffect(() => {
    if (!tanlangan || !olcham.w) return;
    const j = joylashuv.joylar.get(tanlangan);
    if (!j) return;
    const x = daraxt.tugunlar.get(tanlangan);
    if (x && x.tur !== 'obyekt' && x.bolalar.length && !yigilgan.has(x.id)) {
      const ichki = [j, ...(x.bolalar.map((b) => joylashuv.joylar.get(b)).filter(Boolean) as Joy[])];
      const c = chegaraHisobla(ichki);
      const k = sigdirKamera(c, olcham.w, olcham.h, 56, 1);
      uchir(k.k < 0.55 ? markazlaKamera(j, olcham.w, olcham.h, kamRef.current.k, 0.7) : k);
      return;
    }
    uchir(markazlaKamera(j, olcham.w, olcham.h, kamRef.current.k, 0.85));
    // faqat tanlov o‘zgarganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanlangan, olcham.w > 0]);

  // G‘ildirak — kursor ostida zum (passiv emas, sahifa aylanmasin).
  useEffect(() => {
    const el = quti.current;
    if (!el) return;
    const g = (e: WheelEvent) => {
      e.preventDefault();
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const r = el.getBoundingClientRect();
      const omil = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      setKam((k) => zumla(k, omil, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', g, { passive: false });
    return () => el.removeEventListener('wheel', g);
  }, []);

  // Pan + pinch.
  const pointerlar = useRef(new Map<number, { x: number; y: number }>());
  const surish = useRef<{ x: number; y: number; kam: Kamera; masofa?: number; kochdi: boolean } | null>(null);
  const bosildi = (e: RPointerEvent) => {
    if ((e.target as Element).closest('[data-boshqaruv]')) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    pointerlar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pointerlar.current.values()];
    surish.current = p.length === 2
      ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, kam: kamRef.current, masofa: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), kochdi: true }
      : { x: e.clientX, y: e.clientY, kam: kamRef.current, kochdi: false };
  };
  const harakat = (e: RPointerEvent) => {
    if (!pointerlar.current.has(e.pointerId) || !surish.current) return;
    pointerlar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = surish.current;
    const p = [...pointerlar.current.values()];
    if (p.length === 2 && s.masofa) {
      const r = quti.current!.getBoundingClientRect();
      const m = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
      const z = zumla(s.kam, m / s.masofa, s.x - r.left, s.y - r.top);
      setKam({ ...z, x: z.x + (cx - s.x), y: z.y + (cy - s.y) });
      return;
    }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.kochdi && Math.hypot(dx, dy) > 4) {
      s.kochdi = true;
      try { quti.current?.setPointerCapture(e.pointerId); } catch { /* ushlanmasa ham ishlaydi */ }
    }
    if (s.kochdi) setKam({ ...s.kam, x: s.kam.x + dx, y: s.kam.y + dy });
  };
  const oxirgiKochdi = useRef(false);
  const qoyildi = (e: RPointerEvent) => {
    pointerlar.current.delete(e.pointerId);
    const s = surish.current;
    oxirgiKochdi.current = !!s?.kochdi;
    if (pointerlar.current.size === 0) {
      surish.current = null;
      if (s && !s.kochdi && !(e.target as Element).closest('[data-tugun]')) onTanla(null);
    } else {
      const [q] = [...pointerlar.current.values()];
      surish.current = { x: q.x, y: q.y, kam: kamRef.current, kochdi: true };
    }
  };

  const zumTugma = (omil: number) => uchir(zumla(kamRef.current, omil, olcham.w / 2, olcham.h / 2));

  const tugunniFokusla = (id: string) => {
    setFokusId(id);
    const el = quti.current?.querySelector<SVGGElement>(`[data-tugun="${CSS.escape(id)}"]`);
    el?.focus({ preventScroll: true });
    const j = joylashuv.joylar.get(id);
    if (!j) return;
    const k = kamRef.current;
    const sx = j.x * k.k + k.x, sy = j.y * k.k + k.y;
    const chet = 60;
    if (sx < chet || sy < chet || sx > olcham.w - chet || sy > olcham.h - chet) uchir(markazlaKamera(j, olcham.w, olcham.h, k.k, k.k));
  };

  const klaviatura = (e: RKeyboardEvent) => {
    const tg = e.target as HTMLElement;
    if (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA') return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zumTugma(1.25); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zumTugma(0.8); return; }
    if (e.key === '0') { e.preventDefault(); sigdir(); return; }
    if (e.key === 'Escape') { onTanla(null); return; }
    const joriy = tg.getAttribute?.('data-tugun') ?? fokusId ?? tanlangan ?? daraxt.ildiz;
    if (e.key === 'Enter' || e.key === ' ') {
      if (tg.getAttribute?.('data-tugun')) { e.preventDefault(); onTanla(joriy); }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) {
      e.preventDefault();
      const keyingi = klaviaturaQadam(daraxt, joylashuv, joriy, e.key, yigilgan) ?? (tg.getAttribute?.('data-tugun') ? null : daraxt.ildiz);
      if (keyingi) tugunniFokusla(keyingi);
    }
  };

  const ixcham = kam.k < 0.5;
  const tanlanganYoli = yoritilgan;
  const xira = (id: string) => !!tanlanganYoli && !tanlanganYoli.has(id);
  const maxLoyihaSmeta = useMemo(() => Math.max(0, ...[...daraxt.tugunlar.values()].filter((x) => x.daraja === 1).map((x) => x.smeta ?? 0)), [daraxt]);
  const otish = kamQisqarish ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 30 };

  const tugunlar = daraxt.tartib.map((id) => daraxt.tugunlar.get(id)!).filter((x) => joylashuv.joylar.has(x.id));

  return (
    <div ref={quti} className="relative h-full w-full overflow-hidden touch-none select-none outline-none"
      style={{
        cursor: 'grab',
        backgroundColor: 'var(--bg)',
        backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1.2px)',
        backgroundSize: `${24 * kam.k}px ${24 * kam.k}px`,
        backgroundPosition: `${kam.x}px ${kam.y}px`,
      }}
      onPointerDown={bosildi} onPointerMove={harakat} onPointerUp={qoyildi} onPointerCancel={qoyildi}
      onKeyDown={klaviatura}
      role="application" aria-roledescription={t('kompaniya xaritasi')}
      aria-label={t('Kompaniya xaritasi. Strelkalar — tugunlar bo‘ylab yurish, Enter — tafsilot, plyus/minus — zum, 0 — sig‘dirish.')}>
      <svg width="100%" height="100%" className="absolute inset-0 block" aria-hidden={false}>
        <g transform={`translate(${kam.x},${kam.y}) scale(${kam.k})`}>
          {/* Chiziqlar: ota chetidan bola chetiga mindmap egri chizig‘i; qalinlik — smeta ulushi. */}
          <g fill="none">
            {tugunlar.filter((x) => x.ota && joylashuv.joylar.has(x.ota)).map((x) => {
              const a = joylashuv.joylar.get(x.ota!)!, b = joylashuv.joylar.get(x.id)!;
              const s = Math.sign(b.x - a.x) || 1;
              const x1 = a.x + (s * a.w) / 2, x2 = b.x - (s * b.w) / 2;
              const mx = (x1 + x2) / 2;
              const d = `M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`;
              const max = x.daraja === 1 ? maxLoyihaSmeta : daraxt.maxSmeta;
              const qalin = 1.25 + 4.5 * (x.smeta != null && max > 0 ? Math.sqrt(x.smeta / max) : 0);
              const yorug = !!tanlangan && !xira(x.id) && !xira(x.ota!);
              return (
                <motion.path key={'c' + x.id} initial={false} animate={{ d, opacity: xira(x.id) ? 0.18 : 1 }} transition={otish}
                  strokeWidth={qalin} strokeLinecap="round"
                  style={{ stroke: yorug ? 'var(--accent)' : 'var(--border-strong)', strokeOpacity: yorug ? 0.85 : 0.55 }} />
              );
            })}
          </g>
          {tugunlar.map((x) => {
            const j = joylashuv.joylar.get(x.id)!;
            return (
              <motion.g key={x.id} data-tugun={x.id} tabIndex={0} role="button"
                aria-label={ariaMatn(x, guruhNomi)} aria-pressed={tanlangan === x.id}
                initial={kamQisqarish ? false : { opacity: 0, x: j.x - j.w / 2, y: j.y - j.h / 2 }}
                animate={{ opacity: xira(x.id) ? 0.28 : 1, x: j.x - j.w / 2, y: j.y - j.h / 2 }}
                transition={otish}
                onFocus={() => setFokusId(x.id)}
                onClick={(e) => { e.stopPropagation(); if (!oxirgiKochdi.current) onTanla(x.id); }}
                style={{ cursor: 'pointer', outline: 'none' }} className="mm-tugun">
                {x.tur === 'kompaniya' && (ixcham
                  ? <IxchamKarta nom={x.nom || t('Kompaniya')} holat={x.holat} w={j.w} h={j.h} tanlangan={tanlangan === x.id} fokus={fokusId === x.id} fon="var(--surface-2)" />
                  : <IldizKarta x={x} w={j.w} h={j.h} tanlangan={tanlangan === x.id} fokus={fokusId === x.id} />)}
                {(x.tur === 'loyiha' || x.tur === 'guruh') && ixcham && (
                  <IxchamKarta nom={x.tur === 'guruh' ? guruhNomi : x.nom} holat={x.holat} w={j.w} h={j.h} tanlangan={tanlangan === x.id} fokus={fokusId === x.id} fon="var(--surface-2)" />
                )}
                {(x.tur === 'loyiha' || x.tur === 'guruh') && !ixcham && (
                  <LoyihaKarta x={x} w={j.w} h={j.h} nom={x.tur === 'guruh' ? guruhNomi : x.nom} tanlangan={tanlangan === x.id} fokus={fokusId === x.id}
                    yigilgan={yigilgan.has(x.id)} tomon={joylashuv.tomon.get(x.id) ?? 1} onYig={() => onYigToggle(x.id)} maxSmeta={maxLoyihaSmeta} />
                )}
                {x.tur === 'obyekt' && <ObyektKarta x={x} w={j.w} h={j.h} tanlangan={tanlangan === x.id} fokus={fokusId === x.id} ixcham={ixcham} maxSmeta={daraxt.maxSmeta} />}
              </motion.g>
            );
          })}
        </g>
      </svg>

      {children}

      {/* Zum boshqaruvi */}
      <div data-boshqaruv className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-pop)]">
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => zumTugma(1.25)} aria-label={t('Yaqinlashtirish')} title={t('Yaqinlashtirish')}><Plus /></button>
        <span className="text-center font-mono text-[10.5px] text-text-mute tabular-nums" aria-live="polite">{Math.round(kam.k * 100) + '%'}</span>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => zumTugma(0.8)} aria-label={t('Uzoqlashtirish')} title={t('Uzoqlashtirish')}><Minus /></button>
        <span className="my-0.5 h-px bg-[var(--border)]" />
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => sigdir()} aria-label={t('Ekranga sig‘dirish')} title={t('Ekranga sig‘dirish')}><Maximize2 /></button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => onHammasiniYig(true)} aria-label={t('Hamma loyihani yig‘ish')} title={t('Hamma loyihani yig‘ish')}><ChevronsDownUp /></button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => onHammasiniYig(false)} aria-label={t('Hamma loyihani yoyish')} title={t('Hamma loyihani yoyish')}><ChevronsUpDown /></button>
      </div>
    </div>
  );
}

/* ───────────── Tugun kartalari (SVG) ───────────── */

function Ramka({ w, h, tanlangan, fokus, fon = 'var(--surface)', chegara = 'var(--border)' }: { w: number; h: number; tanlangan: boolean; fokus: boolean; fon?: string; chegara?: string }) {
  return (
    <>
      {(tanlangan || fokus) && <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={12} fill="none" strokeWidth={2}
        style={{ stroke: fokus && !tanlangan ? 'var(--focus)' : 'var(--accent)', strokeDasharray: fokus && !tanlangan ? '4 3' : undefined }} />}
      <rect width={w} height={h} rx={8} style={{ fill: fon, stroke: tanlangan ? 'var(--accent)' : chegara }} strokeWidth={tanlangan ? 1.5 : 1} />
    </>
  );
}

function RombSvg({ cx, cy, r, holat }: { cx: number; cy: number; r: number; holat: XHolat }) {
  return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1.5} transform={`rotate(45 ${cx} ${cy})`} style={{ fill: HOLAT_RANG[holat] }} />;
}

/** Bajarilish chizig‘i (SVG): F2 — firuza, fakt (F2 siz qismi) — lojuvard. */
function MeterSvg({ x, y, w, h, faktFoiz, f2Foiz, smetaBor }: { x: number; y: number; w: number; h: number; faktFoiz: number | null; f2Foiz: number | null; smetaBor: boolean }) {
  if (!smetaBor || (faktFoiz == null && f2Foiz == null)) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={2} fill="none" strokeDasharray="3 3" style={{ stroke: 'var(--border-strong)' }} />
      </g>
    );
  }
  const f2 = Math.max(0, Math.min(100, f2Foiz ?? 0)), fakt = Math.max(f2, Math.min(100, faktFoiz ?? 0));
  const oshgan = (faktFoiz ?? 0) > 100 || (f2Foiz ?? 0) > 100;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} style={{ fill: 'var(--surface-3)', stroke: oshgan ? 'var(--warn)' : 'none' }} />
      <rect x={x} y={y} width={(w * f2) / 100} height={h} rx={2} style={{ fill: oshgan ? 'var(--warn)' : 'var(--accent)' }} />
      <rect x={x + (w * f2) / 100} y={y} width={(w * (fakt - f2)) / 100} height={h} style={{ fill: 'var(--info)' }} />
    </g>
  );
}

function HolatSvg({ x, y, w, h, sanoq }: { x: number; y: number; w: number; h: number; sanoq: XTugun['holatSanoq'] }) {
  const jami = sanoq.xavf + sanoq.etibor + sanoq.yaxshi + sanoq.nomalum;
  if (!jami) return <rect x={x} y={y} width={w} height={h} rx={2} style={{ fill: 'var(--surface-3)' }} />;
  let cx = x;
  const tartib: XHolat[] = ['xavf', 'etibor', 'yaxshi', 'nomalum'];
  return (
    <g>
      {tartib.map((k) => {
        if (!sanoq[k]) return null;
        const ww = Math.max(2, (w - 2 * (tartib.filter((q) => sanoq[q]).length - 1)) * (sanoq[k] / jami));
        const el = <rect key={k} x={cx} y={y} width={ww} height={h} rx={1.5} style={{ fill: HOLAT_RANG[k] }} />;
        cx += ww + 2;
        return el;
      })}
    </g>
  );
}

/** Kichik zumda (umumiy ko‘rinish) — faqat yirik nom va holat chizig‘i. */
function IxchamKarta({ nom, holat, w, h, tanlangan, fokus, fon }: { nom: string; holat: XHolat; w: number; h: number; tanlangan: boolean; fokus: boolean; fon?: string }) {
  const [n1, n2] = ikkiQator(nom, w - 30, 24);
  return (
    <g>
      <title>{nom}</title>
      <Ramka w={w} h={h} tanlangan={tanlangan} fokus={fokus} fon={fon} />
      <rect x={0} y={0} width={7} height={h} rx={3} style={{ fill: HOLAT_RANG[holat] }} />
      <text x={20} y={n2 ? h / 2 - 4 : h / 2 + 9} style={{ fill: 'var(--text)', font: SHRIFT_NOM(24) }}>{n1}</text>
      {n2 && <text x={20} y={h / 2 + 24} style={{ fill: 'var(--text)', font: SHRIFT_NOM(24) }}>{n2}</text>}
    </g>
  );
}

/** Nomni ikki qatorga bo‘ladi (so‘z chegarasida), ikkinchisi kerak bo‘lsa qisqartiriladi. */
function ikkiQator(matn: string, maxPx: number, px: number): [string, string | null] {
  const sh = SHRIFT_NOM(px);
  if (kes(matn, maxPx, sh, px) === matn) return [matn, null];
  const sozlar = matn.split(/\s+/);
  let bir = '';
  for (let i = 0; i < sozlar.length; i++) {
    const sinov = bir ? bir + ' ' + sozlar[i] : sozlar[i];
    if (kes(sinov, maxPx, sh, px) !== sinov) {
      if (!bir) return [kes(matn, maxPx, sh, px), null];
      return [bir, kes(sozlar.slice(i).join(' '), maxPx, sh, px)];
    }
    bir = sinov;
  }
  return [bir, null];
}

function IldizKarta({ x, w, h, tanlangan, fokus }: { x: XTugun; w: number; h: number; tanlangan: boolean; fokus: boolean }) {
  const [n1, n2] = ikkiQator(x.nom || t('Kompaniya'), w - 74, 16);
  const y0 = n2 ? 25 : 32;
  return (
    <g>
      <title>{x.nom}</title>
      <Ramka w={w} h={h} tanlangan={tanlangan} fokus={fokus} fon="var(--surface-2)" chegara="var(--accent)" />
      {/* Girih motivi: ichma-ich romb */}
      <g transform={`translate(32 ${h / 2 - 6})`}>
        <rect x={-14} y={-14} width={28} height={28} rx={3} transform="rotate(45)" style={{ fill: 'var(--accent-soft)', stroke: 'var(--accent)' }} />
        <rect x={-6.5} y={-6.5} width={13} height={13} rx={1.5} transform="rotate(45)" style={{ fill: 'var(--accent)' }} />
      </g>
      <text x={60} y={y0} style={{ fill: 'var(--text)', font: SHRIFT_NOM(16) }}>{n1}</text>
      {n2 && <text x={60} y={y0 + 19} style={{ fill: 'var(--text)', font: SHRIFT_NOM(16) }}>{n2}</text>}
      <text x={60} y={n2 ? 66 : 54} style={{ fill: 'var(--text-dim)', font: '500 12.5px var(--font-sans)' }}>
        {t('{n} ta obyekt', { n: x.obyektSoni })}
      </text>
      <text x={60} y={n2 ? 82 : 72} style={{ fill: 'var(--text-mute)', font: '500 12px var(--font-mono)' }}>
        {'F2 ' + foizMatn(x.f2Foiz)}
      </text>
      <HolatSvg x={14} y={h - 16} w={w - 28} h={6} sanoq={x.holatSanoq} />
    </g>
  );
}

function LoyihaKarta({ x, w, h, nom, tanlangan, fokus, yigilgan, tomon, onYig, maxSmeta }: {
  x: XTugun; w: number; h: number; nom: string; tanlangan: boolean; fokus: boolean; yigilgan: boolean; tomon: -1 | 1; onYig: () => void; maxSmeta: number;
}) {
  const r = hajmOlcham(x.smeta, maxSmeta, 6, 11);
  const [n1, n2] = ikkiQator(nom, w - 46, 14.5);
  const guruh = x.tur === 'guruh';
  const tx = tomon === 1 ? w + 3 : -23;
  const y0 = n2 ? 22 : 28;
  const ySub = n2 ? 56 : 48;
  const yMet = n2 ? 64 : 58;
  return (
    <g>
      <title>{nom}</title>
      <Ramka w={w} h={h} tanlangan={tanlangan} fokus={fokus} fon="var(--surface-2)" chegara={guruh ? 'var(--border)' : 'var(--border-strong)'} />
      {guruh && <rect width={w} height={h} rx={8} fill="none" strokeDasharray="5 4" style={{ stroke: 'var(--border-strong)' }} />}
      <RombSvg cx={19} cy={y0 - 5} r={r * 0.72} holat={x.holat} />
      <text x={36} y={y0} style={{ fill: 'var(--text)', font: SHRIFT_NOM(14.5) }}>{n1}</text>
      {n2 && <text x={36} y={y0 + 17} style={{ fill: 'var(--text)', font: SHRIFT_NOM(14.5) }}>{n2}</text>}
      <text x={36} y={ySub} style={{ fill: 'var(--text-dim)', font: '500 12px var(--font-sans)' }}>
        {t('{n} ta obyekt', { n: x.obyektSoni }) + ' · ' + (x.smeta == null ? t('smeta yo‘q') : (x.smetaToliq ? '' : '≈ ') + pulQ(x.smeta))}
      </text>
      <MeterSvg x={36} y={yMet} w={w - 92} h={7} faktFoiz={x.faktFoiz} f2Foiz={x.f2Foiz} smetaBor={x.smeta != null} />
      <text x={w - 10} y={yMet + 7} textAnchor="end" style={{ fill: 'var(--text-dim)', font: '600 12px var(--font-mono)' }}>{foizMatn(x.f2Foiz)}</text>
      {x.bolalar.length > 0 && (
        <g data-boshqaruv onClick={(e) => { e.stopPropagation(); onYig(); }} onPointerDown={(e) => e.stopPropagation()}
          transform={`translate(${tx} ${h / 2 - 10})`} style={{ cursor: 'pointer' }}>
          <title>{yigilgan ? t('Obyektlarni ko‘rsatish ({n})', { n: x.bolalar.length }) : t('Obyektlarni yig‘ish')}</title>
          <circle cx={10} cy={10} r={10} style={{ fill: 'var(--surface)', stroke: yigilgan ? 'var(--accent)' : 'var(--border-strong)' }} />
          {yigilgan
            ? <text x={10} y={14} textAnchor="middle" style={{ fill: 'var(--accent-text)', font: '700 11px var(--font-mono)' }}>{String(x.bolalar.length)}</text>
            : <path d="M5.5 10 H14.5" strokeWidth={1.8} style={{ stroke: 'var(--text-dim)' }} />}
        </g>
      )}
    </g>
  );
}

function ObyektKarta({ x, w, h, tanlangan, fokus, ixcham, maxSmeta }: { x: XTugun; w: number; h: number; tanlangan: boolean; fokus: boolean; ixcham: boolean; maxSmeta: number }) {
  const r = hajmOlcham(x.smeta, maxSmeta, 4.5, 10);
  const ogoh = x.belgilar.filter((b) => b.daraja === 'ogoh').length;
  const info = x.belgilar.length - ogoh;
  if (ixcham) {
    return (
      <g>
        <title>{x.nom}</title>
        <Ramka w={w} h={h} tanlangan={tanlangan} fokus={fokus} />
        <rect x={0} y={0} width={7} height={h} rx={3} style={{ fill: HOLAT_RANG[x.holat] }} />
        <text x={20} y={h / 2 + 9} style={{ fill: 'var(--text)', font: SHRIFT_NOM(24) }}>{kes(x.nom, w - 32, SHRIFT_NOM(24), 24)}</text>
      </g>
    );
  }
  const chiplar: { ikon: typeof FileText; n: number; nom: string }[] = [
    { ikon: FileText, n: x.resurs.shartnoma, nom: t('shartnoma') },
    { ikon: Warehouse, n: x.resurs.sklad, nom: t('sklad') },
    { ikon: Truck, n: x.resurs.texnika, nom: t('texnika') },
    { ikon: HardHat, n: x.resurs.kadr, nom: t('xodim') },
  ].filter((c) => c.n > 0);
  const signalSoni = x.signalSoni ?? 0, kritik = x.kritikSoni ?? 0;
  const belgiChiplari: { kalit: string; n: number; ikon: typeof AlertTriangle; rang: string; fon: string; sarlavha: string }[] = [
    { kalit: 'ogoh', n: ogoh, ikon: AlertTriangle, rang: 'var(--danger)', fon: 'var(--danger-soft)', sarlavha: x.belgilar.filter((b) => b.daraja === 'ogoh').map((b) => b.matn).join('\n') },
    { kalit: 'info', n: info, ikon: AlertTriangle, rang: 'var(--warn)', fon: 'var(--warn-soft)', sarlavha: x.belgilar.filter((b) => b.daraja !== 'ogoh').map((b) => b.matn).join('\n') },
    { kalit: 'signal', n: signalSoni, ikon: ShieldAlert, rang: kritik > 0 ? 'var(--danger)' : 'var(--warn)', fon: kritik > 0 ? 'var(--danger-soft)' : 'var(--warn-soft)',
      sarlavha: t('{n} ochiq signal, {k} kritik', { n: signalSoni, k: kritik }) + (x.topSignallar.length ? '\n' + x.topSignallar.map((q) => '• ' + (q.title ?? '')).join('\n') : '') },
  ].filter((c) => c.n > 0);
  const summa = x.smeta == null ? t('smeta yo‘q') : pulQ(x.smeta);
  const summaKeng = summa.length * 7.4 + 10;
  return (
    <g>
      <title>{x.nom}</title>
      <Ramka w={w} h={h} tanlangan={tanlangan} fokus={fokus} />
      <rect x={0} y={10} width={3} height={h - 20} rx={1.5} style={{ fill: HOLAT_RANG[x.holat] }} />
      <RombSvg cx={19} cy={21} r={r * 0.72} holat={x.holat} />
      <text x={35} y={26} style={{ fill: 'var(--text)', font: SHRIFT_NOM(14.5) }}>{kes(x.nom, w - 44 - summaKeng, SHRIFT_NOM(14.5), 14.5)}</text>
      <text x={w - 10} y={26} textAnchor="end" style={{ fill: x.smeta == null ? 'var(--warn)' : 'var(--text-dim)', font: '500 12px var(--font-mono)' }}>{summa}</text>
      <MeterSvg x={35} y={37} w={w - 104} h={8} faktFoiz={x.faktFoiz} f2Foiz={x.f2Foiz} smetaBor={x.smeta != null} />
      <text x={w - 10} y={45} textAnchor="end" style={{ fill: x.oshgan ? 'var(--warn)' : 'var(--text-dim)', font: '600 12px var(--font-mono)' }}>
        {x.smeta == null ? '—' : 'F2 ' + foizMatn(x.f2Foiz)}
      </text>
      <g transform={`translate(35 ${h - 28})`}>
        {belgiChiplari.map((c, i) => (
          <g key={c.kalit} transform={`translate(${i * 48} 0)`} data-belgi={c.kalit}>
            <title>{c.sarlavha}</title>
            <rect width={42} height={19} rx={3} style={{ fill: c.fon }} />
            <c.ikon x={5} y={3.5} width={12} height={12} style={{ color: c.rang }} />
            <text x={21} y={14} style={{ fill: c.rang, font: '700 12px var(--font-mono)' }}>{String(c.n)}</text>
          </g>
        ))}
        {chiplar.map((c, i) => {
          const I = c.ikon;
          const bx = belgiChiplari.length * 48 + 4 + i * 38;
          return (
            <g key={c.nom} transform={`translate(${bx} 0)`}>
              <title>{c.n + ' ' + c.nom}</title>
              <I x={0} y={3.5} width={13} height={13} style={{ color: 'var(--text-mute)' }} />
              <text x={16} y={14} style={{ fill: 'var(--text-dim)', font: '600 12px var(--font-mono)' }}>{String(c.n)}</text>
            </g>
          );
        })}
      </g>
    </g>
  );
}
