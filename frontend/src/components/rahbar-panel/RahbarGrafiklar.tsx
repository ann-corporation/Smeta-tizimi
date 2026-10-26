/**
 * RAHBAR PANELI — vizual bloklar (egasi 2026-10-25: «diagramma, grafik, infografika — qarashning o'zi holatni tushuntirsin»).
 * Faqat boss-dashboard allaqachon yuklagan ma'lumot. Ranglar — faqat Firuza tokenlari (ikki mavzuda ham ishlaydi).
 * Qoidalar: noma'lum — «—» (0 emas); smeta↔F2 dan foiz chiqarilmaydi — summalar bitta shkalada yonma-yon.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { BossDashboard } from '../../api/t2-boss';
import { t } from '../../i18n/til';
import { amount, objectUrl, type BossExecutive, type ExecutiveObject, type PortfolioTotals } from '../boss-decision/model';
import { compactMoney } from '../boss-decision/decision-v2';
import { HOLAT_NOMI, HOLAT_RANG, obyektHolati, shkala, signallarDaraja, squarify, type ObyektHolat, type SignalDaraja } from '../../lib/rahbar-panel/grafik';

const pul = (v: unknown) => compactMoney(v) ?? '—';
const foizda = (v: number, max: number) => `${max > 0 ? Math.max(0, Math.min(1, v / max)) * 100 : 0}%`;
const yumshoq = (rang: string, f = 22) => `color-mix(in srgb, ${rang} ${f}%, var(--surface-2))`;

/** Grafik kartasi: sarlavha, izoh, tana, legenda. */
export function GrafikKarta({ sarlavha, izoh, ong, children, className = '' }: { sarlavha: string; izoh?: string; ong?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`fz-card flex flex-col ${className}`} aria-label={sarlavha}>
      <div className="fz-card__head">
        <div className="min-w-0"><h2 className="fz-card__title">{sarlavha}</h2>{izoh && <p className="fz-card__sub">{izoh}</p>}</div>
        {ong}
      </div>
      <div className="fz-card__body flex flex-1 flex-col gap-3">{children}</div>
    </section>
  );
}

function Belgi({ rang, chiziq = false }: { rang: string; chiziq?: boolean }) {
  return <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={chiziq ? { border: `1px dashed ${rang}` } : { background: rang }} />;
}
function Legenda({ qatorlar }: { qatorlar: { rang: string; nom: string; qiymat?: ReactNode; chiziq?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-dim">
      {qatorlar.map((q) => <li key={q.nom} className="inline-flex items-center gap-1.5"><Belgi rang={q.rang} chiziq={q.chiziq} /><span>{q.nom}</span>{q.qiymat != null && <b className="tabular-nums text-text">{q.qiymat}</b>}</li>)}
    </ul>
  );
}

/* ---------- 1. Portfel xaritasi (treemap) ---------- */

const HOLATLAR: ObyektHolat[] = ['xavf', 'diqqat', 'tekshiruv', 'toza'];
const PLITKA_MAX = 24;

/** Konteyner kengligi (px) — plitkalar haqiqiy o'lchamda joylanadi (tor ekranda baland maydon). */
function useKenglik(boshlangich = 1000) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(boshlangich);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([x]) => { const k = Math.round(x.contentRect.width); if (k > 0) setW(k); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Obyektlar plitkalari: maydon — smeta (ma'lum to'g'ridan-to'g'ri xarajat), rang — holat. Bosilsa obyekt ochiladi. */
export function PortfelXaritasi({ e }: { e: BossExecutive }) {
  const [ref, W] = useKenglik();
  const H = Math.round(W < 480 ? Math.max(260, W * 0.95) : Math.max(260, W * 0.5));
  const { plitkalar, nomalum, sanoq } = useMemo(() => {
    const malum = e.objects.filter((o) => (amount(o.estimate_known) ?? 0) > 0).sort((a, b) => (b.estimate_known ?? 0) - (a.estimate_known ?? 0));
    const kor = malum.slice(0, PLITKA_MAX);
    const qoldiq = malum.slice(PLITKA_MAX);
    const items = kor.map((o) => ({ id: String(o.object_id), qiymat: o.estimate_known as number }));
    const qoldiqSumma = qoldiq.reduce((s, o) => s + (o.estimate_known ?? 0), 0);
    if (qoldiq.length) items.push({ id: 'boshqa', qiymat: qoldiqSumma });
    const joy = new Map(squarify(items, W, H).map((p) => [p.id, p]));
    const sanoq: Record<ObyektHolat, number> = { xavf: 0, diqqat: 0, tekshiruv: 0, toza: 0 };
    for (const o of e.objects) sanoq[obyektHolati(o)]++;
    return {
      plitkalar: [...kor.map((o) => ({ o, p: joy.get(String(o.object_id)) })), ...(qoldiq.length ? [{ o: null, p: joy.get('boshqa'), soni: qoldiq.length, summa: qoldiqSumma }] : [])],
      nomalum: e.objects.filter((o) => !((amount(o.estimate_known) ?? 0) > 0)),
      sanoq,
    };
  }, [e, W, H]);
  return (
    <GrafikKarta sarlavha={t('Portfel xaritasi')} izoh={t('Plitka maydoni — smeta (ma’lum to‘g‘ridan-to‘g‘ri xarajat); rangi — obyekt holati. Bosing — obyekt ochiladi.')}>
      <div ref={ref} className="w-full">{plitkalar.length > 0 ? <div className="relative w-full overflow-hidden rounded-md" style={{ height: H }}>
        {plitkalar.map((x) => {
          if (!x.p) return null;
          const uslub = { left: `${(x.p.x / W) * 100}%`, top: x.p.y, width: `${(x.p.w / W) * 100}%`, height: x.p.h };
          const katta = x.p.w > 76 && x.p.h > 46;
          if (!x.o) {
            const nom = t('yana {n} obyekt', { n: 'soni' in x ? x.soni ?? 0 : 0 });
            return <div key="boshqa" className="absolute p-0.5" style={uslub} title={`${nom} · ${pul('summa' in x ? x.summa : null)}`}>
              <div className="flex h-full w-full flex-col justify-end overflow-hidden rounded-sm p-1.5 text-[11px] text-text-dim" style={{ background: 'var(--surface-3)' }}>{katta && <span>{nom}</span>}</div>
            </div>;
          }
          const o = x.o, h = obyektHolati(o), rang = HOLAT_RANG[h];
          return <div key={o.object_id} className="absolute p-0.5" style={uslub}>
            <Link to={objectUrl(o.object_id, o.project_id)} title={`${o.name} · ${t('Smeta')}: ${pul(o.estimate_known)} · ${t('Tasdiqlangan F2')}: ${pul(o.approved_known)} · ${t(HOLAT_NOMI[h])}`}
              className="flex h-full w-full flex-col justify-between overflow-hidden rounded-sm p-1.5 text-text transition-[filter] hover:brightness-125 focus-visible:outline-2"
              style={{ background: yumshoq(rang, 26), boxShadow: `inset 3px 0 0 ${rang}` }}>
              {katta ? <>
                <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{o.name}</span>
                <span className="text-[11px] tabular-nums text-text-dim">{pul(o.estimate_known)}</span>
              </> : <span className="sr-only">{o.name}</span>}
            </Link>
          </div>;
        })}
      </div> : <p className="text-[13px] text-text-mute">{t('Smetasi ma’lum obyekt yo‘q — xarita chizilmaydi.')}</p>}</div>
      <Legenda qatorlar={HOLATLAR.map((h) => ({ rang: HOLAT_RANG[h], nom: t(HOLAT_NOMI[h]), qiymat: sanoq[h] }))} />
      {nomalum.length > 0 && <p className="text-[12px] text-text-mute">{t('Smetasi noma’lum obyektlar (xaritada yo‘q)')}: {nomalum.slice(0, 6).map((o) => o.name).join(', ')}{nomalum.length > 6 ? ` … +${nomalum.length - 6}` : ''}</p>}
    </GrafikKarta>
  );
}

/* ---------- 2. Smeta va tasdiqlangan F2 — summalar yonma-yon ---------- */

function Shkala({ belgilar, max }: { belgilar: number[]; max: number }) {
  return <div className="relative h-4 text-[10.5px] tabular-nums text-text-mute" aria-hidden="true">
    {belgilar.map((b, i) => <span key={i} className={`absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full ${i > 0 && i < belgilar.length - 1 ? 'hidden sm:inline' : ''}`} style={{ left: foizda(b, max) }}>{b === 0 ? '0' : pul(b)}</span>)}
  </div>;
}
function Ustun({ qiymat, max, rang, nom, chiziq = false }: { qiymat: number | null; max: number; rang: string; nom: string; chiziq?: boolean }) {
  const kam = useReducedMotion();
  return <div className="flex items-center gap-2" title={`${nom}: ${pul(qiymat)}`}>
    <div className="relative h-2.5 flex-1 rounded-sm" style={{ background: 'var(--surface-3)' }}>
      {qiymat != null && <motion.div className="absolute inset-y-0 left-0 rounded-sm" initial={kam ? false : { width: 0 }} animate={{ width: foizda(qiymat, max) }} transition={{ duration: kam ? 0 : 0.7, ease: 'easeOut' }}
        style={chiziq ? { border: `1px solid ${rang}`, background: yumshoq(rang, 30) } : { background: rang }} />}
    </div>
    <span className="w-20 shrink-0 text-right text-[11.5px] tabular-nums text-text-dim">{pul(qiymat)}</span>
  </div>;
}

export function SmetaF2Ustunlari({ e }: { e: BossExecutive }) {
  const [hammasi, setHammasi] = useState(false);
  const tartib = useMemo(() => [...e.objects].sort((a, b) => (b.estimate_known ?? -1) - (a.estimate_known ?? -1) || a.name.localeCompare(b.name)), [e.objects]);
  const kor = hammasi ? tartib : tartib.slice(0, 10);
  const sh = shkala(kor.flatMap((o) => [o.estimate_known, o.approved_known]));
  const smetaRang = 'var(--border-strong)', f2Rang = 'var(--accent)';
  return (
    <GrafikKarta sarlavha={t('Smeta va tasdiqlangan F2 — obyektlar bo‘yicha')} izoh={t('Ikkala ustun bitta shkalada (UZS). Hisob asoslari har xil — foiz chiqarilmaydi, jismoniy bajarilish emas.')}
      ong={<Legenda qatorlar={[{ rang: smetaRang, nom: t('Smeta'), chiziq: true }, { rang: f2Rang, nom: t('Tasdiqlangan F2') }]} />}>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-y-2">
        <span className="hidden sm:block" />
        <div className="pr-[5.5rem]"><Shkala belgilar={sh.belgilar} max={sh.max} /></div>
        {kor.map((o: ExecutiveObject) => <div key={o.object_id} className="contents">
          <Link to={objectUrl(o.object_id, o.project_id)} className="truncate pt-1 text-[12.5px] hover:underline sm:self-center sm:pt-0" title={o.name}>{o.name}</Link>
          <div className="flex flex-col gap-1">
            <Ustun qiymat={amount(o.estimate_known)} max={sh.max} rang={smetaRang} nom={t('Smeta')} chiziq />
            <Ustun qiymat={amount(o.approved_known)} max={sh.max} rang={f2Rang} nom={t('Tasdiqlangan F2')} />
          </div>
        </div>)}
      </div>
      {tartib.length > 10 && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm self-start" aria-expanded={hammasi} onClick={() => setHammasi(!hammasi)}>
        {hammasi ? t('Yig‘ish') : t('Barcha obyektlar ({n})', { n: tartib.length })}</button>}
    </GrafikKarta>
  );
}

/* ---------- 3. F2 hujjatlar oqimi ---------- */

function Tasma({ qismlar, yorliq }: { qismlar: { nom: string; qiymat: number; rang: string; chiziq?: boolean }[]; yorliq: string }) {
  const jami = qismlar.reduce((s, q) => s + q.qiymat, 0);
  if (!jami) return <div className="h-3 rounded-sm" style={{ background: 'var(--surface-3)' }} role="img" aria-label={`${yorliq}: 0`} />;
  return <div className="flex h-3 gap-0.5 overflow-hidden rounded-sm" role="img" aria-label={`${yorliq}: ${qismlar.map((q) => `${q.nom} ${q.qiymat}`).join(', ')}`}>
    {qismlar.filter((q) => q.qiymat > 0).map((q) => <i key={q.nom} title={`${q.nom}: ${q.qiymat}`} className="block h-full"
      style={{ flexGrow: q.qiymat, background: q.chiziq ? `repeating-linear-gradient(90deg, ${q.rang} 0 6px, transparent 6px 9px)` : q.rang }} />)}
  </div>;
}

export function F2Oqimi({ totals }: { totals: PortfolioTotals }) {
  const qismlar = [
    { nom: t('Tasdiqlangan'), qiymat: totals.approved_count, rang: 'var(--ok)' },
    { nom: t('Tekshiruvda'), qiymat: totals.review_count, rang: 'var(--info)' },
    { nom: t('Qoralama'), qiymat: totals.draft_count, rang: 'var(--border-strong)', chiziq: true },
  ];
  return (
    <GrafikKarta sarlavha={t('F2 hujjatlar oqimi')} izoh={t('Aktlar soni holat bo‘yicha (faol obyektlar)')}>
      <Tasma qismlar={qismlar} yorliq={t('F2 hujjatlar oqimi')} />
      <Legenda qatorlar={qismlar.map((q) => ({ rang: q.rang, nom: q.nom, qiymat: q.qiymat, chiziq: q.chiziq }))} />
      {totals.approved_missing > 0 && <span className="fz-chip fz-chip--danger self-start">{t('Summasi noma’lum')}: {totals.approved_missing}</span>}
    </GrafikKarta>
  );
}

/* ---------- 4. Signallar darajasi ---------- */

const DARAJA_RANG: Record<SignalDaraja, string> = { muhim: 'var(--danger)', orta: 'var(--warn)', past: 'var(--info)' };
const DARAJA_NOMI: Record<SignalDaraja, string> = { muhim: 'Muhim', orta: 'O‘rta', past: 'Ma’lumot' };

export function SignalTasma({ signal }: { signal: BossDashboard['signal'] }) {
  const d = signallarDaraja(signal.royxat);
  const qismlar = (['muhim', 'orta', 'past'] as SignalDaraja[]).map((k) => ({ nom: t(DARAJA_NOMI[k]), qiymat: d[k], rang: DARAJA_RANG[k] }));
  const korsatilgan = d.muhim + d.orta + d.past;
  return <div className="flex flex-col gap-2">
    <Tasma qismlar={qismlar} yorliq={t('Ochiq signallar darajasi')} />
    <Legenda qatorlar={qismlar.map((q) => ({ rang: q.rang, nom: q.nom, qiymat: q.qiymat }))} />
    {korsatilgan < signal.ochiq_soni && <p className="text-[12px] text-text-mute">{t('Ko‘rsatilgan / jami')}: {korsatilgan} / {signal.ochiq_soni}</p>}
  </div>;
}

/* ---------- 5. Qayd etilgan moliya — kirim va chiqim bitta shkalada ---------- */

export function MoliyaUstunlari({ moliya }: { moliya: BossDashboard['moliya'] }) {
  const qatorlar = [
    { nom: t('Qayd etilgan to‘lovlar'), qiymat: moliya.ulangan ? amount(moliya.jami_tolangan) : null, rang: 'var(--ok)' },
    { nom: t('Qayd etilgan xarajatlar'), qiymat: moliya.ulangan ? amount(moliya.jami_xarajat) : null, rang: 'var(--danger)' },
    { nom: t('Hisob bo‘yicha debitorlik'), qiymat: moliya.ulangan ? amount(moliya.jami_debitor) : null, rang: 'var(--warn)' },
  ];
  const sh = shkala(qatorlar.map((q) => q.qiymat));
  return <div className="flex flex-col gap-2.5">
    {qatorlar.map((q) => <div key={q.nom} className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-[12.5px]"><span className="inline-flex items-center gap-1.5 text-text-dim"><Belgi rang={q.rang} />{q.nom}</span><b className="tabular-nums">{pul(q.qiymat)}</b></div>
      <div className="relative h-2.5 rounded-sm" style={{ background: 'var(--surface-3)' }} title={`${q.nom}: ${pul(q.qiymat)}`}>
        {q.qiymat != null && <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: foizda(q.qiymat, sh.max), background: q.rang }} />}
      </div>
    </div>)}
    <Shkala belgilar={sh.belgilar} max={sh.max} />
    {!moliya.ulangan && <p className="text-[12px] text-text-mute">{t('Moliya registri ulanmagan — qiymatlar noma’lum.')}</p>}
  </div>;
}
