/**
 * RAHBAR PANELI — ustama bilan bog‘liq vizual bloklar (egasi 2026-10-26):
 * KPI count-up, ustama sharsharasi (waterfall), kategoriya donuti ("Boshqa material" segmenti bilan).
 * Xulosa: QQS bilan asosiy (egasi 2026-10-27). Yangi formula yo‘q: ustamali/ustamasiz/QQS `usePortfelUstamali` dan (= ustamaliHisobla), kategoriya — t2_obyekt_jami.
 * Ranglar — Firuza tokenlari; harakat — prefers-reduced-motion hurmat qilinadi. NULL ≠ 0: noma’lum «—».
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { sbT2ObyektlarOl, type T2Obyekt } from '../../api/supabase';
import { t } from '../../i18n/til';
import { usePortfelUstamali, type PortfelObyekt } from '../../umumiy/ui/usePortfelUstamali';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import { portfelUchligi } from '../../lib/ustamali-summa';
import { compactMoney } from '../boss-decision/decision-v2';
import { GrafikKarta } from './RahbarGrafiklar';

const pul = (v: unknown) => compactMoney(v) ?? '—';
const toliq = new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 2 });

/** Raqam 0 → qiymat (count-up). Reduced-motion bo‘lsa darhol oxirgi qiymat. Noma’lum (null) — «—». */
export function SanaYurish({ qiymat, format = (n: number) => toliq.format(n) }: { qiymat: number | null | undefined; format?: (n: number) => string }) {
  const kam = useReducedMotion();
  const [x, setX] = useState<number | null>(qiymat ?? null);
  useEffect(() => {
    if (qiymat == null || !Number.isFinite(qiymat)) { setX(null); return; }
    if (kam) { setX(qiymat); return; }
    const c = animate(0, qiymat, { duration: 0.9, ease: 'easeOut', onUpdate: (v) => setX(v) });
    return () => c.stop();
  }, [qiymat, kam]);
  return <span className="tabular-nums">{x == null ? '—' : format(x)}</span>;
}

/**
 * Barcha obyektlar uchun xulosa kartasi (egasi 2026-10-27: QQS bilan — ASOSIY): portfel qiymati QQS bilan (katta),
 * ostida ustamali (QQS siz) va to‘g‘ri xarajat (ustamasiz) — yagona `QiymatUchlik` ko‘rinishi.
 */
export function UstamaXulosaKarta({ obyektlar, ustamasiz, kompaniyaId }: { obyektlar: readonly PortfelObyekt[]; ustamasiz: number | null; kompaniyaId?: number | null }) {
  const p = usePortfelUstamali(obyektlar, { kompaniyaId });
  const q = portfelUchligi(p, ustamasiz);
  return (
    <div className="karta @container min-w-0 p-4 xl:p-5" data-testid="ustama-xulosa">
      <p className="text-[11px] uppercase tracking-[0.04em] text-text-dim">{t('Smeta qiymati (QQS bilan)')}</p>
      <QiymatUchlik q={q} yuklanmoqda={p.holat === 'yuklanmoqda'} className="mt-1 [&_[data-testid=summa-qqs]]:text-[clamp(15px,7.4cqi,26px)] [&_[data-testid=summa-qqs]]:font-semibold [&_[data-testid=summa-qqs]]:leading-8">
        {q.taxminiy && <span className="text-[11px] text-warn">{t('{n} / {jami} obyekt ustamasi noma’lum', { n: p.nomalumSoni, jami: p.jamiSoni })}</span>}
      </QiymatUchlik>
    </div>
  );
}

/* ---------- Ustama sharsharasi ---------- */

/** To‘g‘ridan-to‘g‘ri → ustama va qo‘shimchalar → ИТОГО-4 → QQS → ВСЕГО (portfel yig‘indisi). */
export function UstamaSharshara({ obyektlar, kompaniyaId }: { obyektlar: readonly PortfelObyekt[]; kompaniyaId?: number | null }) {
  const kam = useReducedMotion();
  const p = usePortfelUstamali(obyektlar, { kompaniyaId });
  const qatorlar = useMemo(() => {
    if (p.ustamali == null || p.ustamasiz == null || p.ndsBilan == null) return null;
    // Faqat ustamali hisoblangan obyektlar bir xil bazada solishtiriladi.
    const asos = p.hisoblanganUstamasiz, us = p.ustamali, nds = p.ndsBilan;
    const q = [
      { nom: t('To‘g‘ridan-to‘g‘ri'), baza: 0, qiymat: asos, rang: 'var(--border-strong)', jami: asos },
      { nom: t('Ustama va qo‘shimchalar'), baza: asos, qiymat: Math.max(0, us - asos), rang: 'var(--accent)', jami: us - asos },
      { nom: t('ИТОГО-4'), baza: 0, qiymat: us, rang: 'var(--info)', jami: us },
      { nom: t('QQS'), baza: us, qiymat: Math.max(0, nds - us), rang: 'var(--warn)', jami: nds - us },
      { nom: t('ВСЕГО'), baza: 0, qiymat: nds, rang: 'var(--ok)', jami: nds },
    ];
    return q;
  }, [p.ustamali, p.ustamasiz, p.ndsBilan, p.hisoblanganUstamasiz]);
  let tana: ReactElement;
  if (p.holat === 'yuklanmoqda') tana = <p className="text-[13px] text-text-mute">{t('Hisoblanmoqda…')}</p>;
  else if (!qatorlar) tana = <p className="text-[13px] text-text-mute">{t('Ustamali hisob mavjud emas — sharshara chizilmaydi.')}</p>;
  else tana = <>
    <div className="h-56 w-full" role="img" aria-label={t('Ustama sharsharasi')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={qatorlar} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="nom" tick={{ fontSize: 11, fill: 'var(--text-dim)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} />
          <YAxis tickFormatter={(v: number) => pul(v)} tick={{ fontSize: 10.5, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} width={56} />
          <Tooltip cursor={{ fill: 'var(--surface-3)', opacity: 0.4 }} formatter={(_v, _n, it) => [toliq.format((it.payload as { jami: number }).jami) + ' UZS', '']}
            separator="" contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
          <Bar dataKey="baza" stackId="s" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="qiymat" stackId="s" radius={[3, 3, 0, 0]} isAnimationActive={!kam} animationDuration={700}>
            {qatorlar.map((q) => <Cell key={q.nom} style={{ fill: q.rang }} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <p className="text-[12px] text-text-mute">{p.nomalumSoni > 0 ? t('{n} / {jami} obyekt ustamasi noma’lum', { n: p.nomalumSoni, jami: p.jamiSoni }) : t('ИТОГО-4 — QQS siz ustamali jami; QQS alohida ko‘rsatilgan.')}</p>
  </>;
  return <GrafikKarta sarlavha={t('Ustama sharsharasi')} izoh={t('To‘g‘ridan-to‘g‘ri xarajatdan ustamali jamigacha (hisoblangan obyektlar yig‘indisi)')}>{tana}</GrafikKarta>;
}

/* ---------- Kategoriya donuti ---------- */

type KatQism = { kalit: string; nom: string; qiymat: number; rang: string };
/** chel/mash/mat/ob ga kirmagan kategoriyalar (БЕЗ СКЛАД, КАB, М/К) = jami − (chel+mash+mat+ob), musbat bo‘lsa alohida segment. */
function katQismlari(r: Pick<T2Obyekt, 'jami' | 'chel' | 'mash' | 'mat' | 'ob'>[]): { qismlar: KatQism[]; jami: number } {
  const s = (k: 'chel' | 'mash' | 'mat' | 'ob') => r.reduce((a, o) => a + (o[k] ?? 0), 0);
  const jami = r.reduce((a, o) => a + (o.jami ?? 0), 0);
  const chel = s('chel'), mash = s('mash'), mat = s('mat'), ob = s('ob');
  const boshqa = jami - (chel + mash + mat + ob);
  const qismlar: KatQism[] = [
    { kalit: 'chel', nom: t('Ishchi kuchi'), qiymat: chel, rang: 'var(--kat-chel)' },
    { kalit: 'mash', nom: t('Mashina va mexanizmlar'), qiymat: mash, rang: 'var(--kat-mash)' },
    { kalit: 'mat', nom: t('Materiallar'), qiymat: mat, rang: 'var(--kat-mat)' },
    { kalit: 'ob', nom: t('Uskunalar'), qiymat: ob, rang: 'var(--kat-ob)' },
  ];
  if (boshqa > 0) qismlar.push({ kalit: 'boshqa', nom: t('Boshqa material (БЕЗ СКЛАД, КАБ, М/К)'), qiymat: boshqa, rang: 'var(--text-mute)' });
  return { qismlar: qismlar.filter((q) => q.qiymat > 0), jami };
}

export function KategoriyaDonut({ kompaniyaId, obyektIdlar }: { kompaniyaId: number; obyektIdlar: readonly number[] }) {
  const kam = useReducedMotion();
  const q = useQuery({ queryKey: ['rahbar-kategoriya', kompaniyaId], staleTime: 60_000, retry: 1,
    queryFn: async () => { const r = await sbT2ObyektlarOl(kompaniyaId); if (!r.ok) throw new Error(r.error ?? 'XATO'); return r.qatorlar; } });
  const { qismlar, jami } = useMemo(() => {
    const idlar = new Set(obyektIdlar);
    return katQismlari((q.data ?? []).filter((o) => idlar.has(o.id)));
  }, [q.data, obyektIdlar]);
  let tana: ReactElement;
  if (q.isPending) tana = <p className="text-[13px] text-text-mute">{t('Yuklanmoqda…')}</p>;
  else if (q.isError) tana = <p role="alert" className="text-[13px] text-warn">{t('Kategoriya kesimi yuklanmadi.')} <button type="button" className="underline" onClick={() => void q.refetch()}>{t('Qayta urinish')}</button></p>;
  else if (!qismlar.length) tana = <p className="text-[13px] text-text-mute">—</p>;
  else tana = <div className="flex flex-wrap items-center gap-4">
    <div className="relative h-44 w-44 shrink-0" role="img" aria-label={t('Xarajat kategoriyalari')}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={qismlar} dataKey="qiymat" nameKey="nom" innerRadius="62%" outerRadius="94%" paddingAngle={1.5} stroke="var(--surface)" isAnimationActive={!kam} animationDuration={800}>
            {qismlar.map((x) => <Cell key={x.kalit} style={{ fill: x.rang }} />)}
          </Pie>
          <Tooltip formatter={(v) => toliq.format(Number(v)) + ' UZS'} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <b className="text-[15px] tabular-nums">{pul(jami)}</b><span className="text-[10.5px] text-text-mute">{t('ustamasiz')}</span>
      </span>
    </div>
    <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12.5px]">
      {qismlar.map((x) => <li key={x.kalit} className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-text-dim"><i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.rang }} /><span className="truncate">{x.nom}</span></span>
        <b className="tabular-nums">{pul(x.qiymat)} <span className="font-normal text-text-mute">{jami > 0 ? `${Math.round((x.qiymat / jami) * 100)}%` : ''}</span></b>
      </li>)}
    </ul>
  </div>;
  return <GrafikKarta sarlavha={t('Xarajat kategoriyalari')} izoh={t('To‘g‘ridan-to‘g‘ri xarajat (ustamasiz) kategoriya bo‘yicha; qismlar yig‘indisi jamiga teng.')}>{tana}</GrafikKarta>;
}
