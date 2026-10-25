import type { CSSProperties, ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { t } from '../../i18n/til';
import {
  HOLAT_MUHR, HOLAT_TARTIB, foizMatn, type FaktMeter, type Holat, type JurnalXulosa, type ObyektUlushi,
} from '../../lib/fakt-korinish';

/**
 * Fakt jurnali ko'rinish bo'laklari (Firuza): qator chizig'i (smeta = 100%), holat muhri, bo'lim chizig'i va
 * yuqoridagi xulosa. Hisoblar — lib/fakt-korinish (sof); bu yerda faqat belgilash.
 */
const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const w = (u: number): CSSProperties => ({ width: `${u * 100}%` });

/** Holat ranglari (faqat token): xulosa chizig'i va legenda uchun. */
const HOLAT_FON: Record<Holat, string> = {
  tugadi: 'var(--ok)', qisman: 'var(--info)', yangi: 'var(--surface-3)', oshdi: 'var(--warn)', smetasiz: 'var(--border-strong)',
};

export function HolatMuhr({ holat, className = '' }: { holat: Holat; className?: string }) {
  const m = HOLAT_MUHR[holat];
  return <span className={`fz-stamp ${m.cls} ${className}`} data-testid="holat-muhr">{t(m.matn)}</span>;
}

/** Qator: chiziq (F2 da olingan | F2 ga hali olinmagan fakt | bugungi kiritma) + foiz; ostida fakt va F2 hajmi. */
export function QatorMeter({ m, fakt, f2, f2Qoldiq, smeta, kichik }: {
  m: FaktMeter; fakt: number; f2: number | null; f2Qoldiq: number | null; smeta: number | null; kichik?: boolean;
}) {
  const over = m.oshdi || m.yangiOshdi;
  const izoh = t('Smeta: {s} · F2 da (tasdiqlangan): {f2} · fakt: {f} · F2 qoldiq: {q}', { s: fmt(smeta), f2: fmt(f2), f: fmt(fakt), q: fmt(f2Qoldiq) });
  const faktMatn = t('Fakt');
  const f2Matn = t('F2');
  return <span className="flex min-w-0 flex-col gap-0.5" title={izoh}>
    <span className={`fz-meter ${over ? 'fz-meter--over' : ''}`} style={{ minWidth: 0 }}>
      <span className="fz-meter__t" style={kichik ? { height: 6 } : undefined}>
        {m.foiz != null && <>
          <i className="fz-meter__oldin" style={w(m.f2Ulush)} />
          <i className="fz-meter__shu" style={w(m.faktUlush)} />
          {m.yangiUlush > 0 && <i className="fz-meter__shu" style={{ ...w(m.yangiUlush), opacity: 0.45 }} data-testid="meter-yangi" />}
        </>}
      </span>
      <span className="fz-meter__f">{foizMatn(m.foiz)}</span>
    </span>
    {!kichik && <span className="flex gap-2 text-[11px] leading-4 tabular-nums text-text-mute">
      <span>{faktMatn} <b className="font-semibold text-text">{fmt(fakt)}</b></span>
      <span>{f2Matn} <b className="font-medium text-text-dim">{fmt(f2)}</b></span>
    </span>}
  </span>;
}

/** Bo'lim chizig'i (chap ro'yxat va bo'lim sarlavhasi): to'liq bajarilgan bo'lim — yashil va belgi. */
export function BolimMeter({ ulush }: { ulush: number | null }) {
  const tugadi = ulush != null && ulush >= 1 - 1e-9;
  return <span className="fz-meter" style={{ minWidth: 0 }}>
    <span className="fz-meter__t" style={{ height: 6 }}>
      {ulush != null && <i className="fz-meter__shu" style={{ ...w(Math.min(1, Math.max(0, ulush))), ...(tugadi ? { background: 'var(--ok)' } : null) }} />}
    </span>
    <span className="fz-meter__f" style={tugadi ? { color: 'var(--ok)' } : undefined}>{ulush == null ? '—' : foizMatn(ulush * 100)}</span>
  </span>;
}

/** Jadval sarlavhasi ostidagi chiziq legendasi — ranglarning ma'nosi so'z bilan. */
export function MeterLegenda() {
  const kv = (bg: string, op?: number) => <i className="inline-block h-2 w-2.5 rounded-[2px]" style={{ background: bg, opacity: op }} aria-hidden="true" />;
  return <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-mute" data-testid="meter-legenda">
    <span className="font-semibold text-text-dim">{t('Chiziq = smeta 100%')}</span>
    <span className="inline-flex items-center gap-1">{kv('var(--border-strong)')}{t('F2 da (tasdiqlangan)')}</span>
    <span className="inline-flex items-center gap-1">{kv('var(--accent)')}{t('fakt, F2 ga hali olinmagan')}</span>
    <span className="inline-flex items-center gap-1">{kv('var(--accent)', 0.45)}{t('bugungi kiritma')}</span>
    <span className="inline-flex items-center gap-1">{kv('var(--warn)')}{t('smetadan oshdi')}</span>
  </span>;
}

function Katak({ sarlavha, children, izoh }: { sarlavha: string; children: ReactNode; izoh?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1.5 px-4 py-3">
    <div className="fz-panel__h"><span>{sarlavha}</span></div>
    {children}
    {izoh && <div className="text-[11.5px] leading-4 text-text-mute">{izoh}</div>}
  </div>;
}

/** Yuqori xulosa: obyekt bajarilishi (qanday tortilgani yozilgan), tugagan bo'limlar, ishlar holat bo'yicha. */
export function FaktXulosaPanel({ x, obyekt }: { x: JurnalXulosa; obyekt: ObyektUlushi }) {
  const usulMatn = obyekt.usul === 'summa' ? t('bo‘limlar smeta summasi bo‘yicha tortilgan')
    : obyekt.usul === 'ish' ? t('bo‘limlardagi ishlar soni bo‘yicha tortilgan (smeta summasi to‘liq emas)') : t('smeta hajmi yo‘q — hisoblab bo‘lmaydi');
  const holatlar = HOLAT_TARTIB.filter((h) => x.ishlar[h] > 0);
  const bolimMatn = t('{a} / {b} tugagan', { a: String(x.bolimTugagan), b: String(x.bolimJami) });
  return <section className="fz-card grid grid-cols-1 divide-y divide-border md:grid-cols-[minmax(220px,1fr)_minmax(180px,.7fr)_minmax(300px,1.6fr)] md:divide-x md:divide-y-0" aria-label={t('Fakt xulosasi')} data-testid="fakt-xulosa">
    <Katak sarlavha={t('Obyekt bajarilishi')} izoh={usulMatn}>
      <div className="flex items-center gap-3">
        <b className="font-[family-name:var(--font-display)] text-[22px] leading-7 tabular-nums text-text" data-testid="obyekt-foiz">{obyekt.ulush == null ? '—' : foizMatn(obyekt.ulush * 100)}</b>
        <div className="min-w-0 flex-1"><BolimMeter ulush={obyekt.ulush} /></div>
      </div>
    </Katak>
    <Katak sarlavha={t('Bo‘limlar')} izoh={t('yuqori darajadagi bo‘limlar')}>
      <div className="flex items-center gap-2 text-[15px] font-semibold tabular-nums text-text" data-testid="bolim-tugagan">
        {x.bolimJami > 0 && x.bolimTugagan === x.bolimJami && <CheckCircle2 size={16} className="text-ok" aria-hidden="true" />}{bolimMatn}
      </div>
    </Katak>
    <Katak sarlavha={t('Ishlar holati')} izoh={t('Jami {n} ish (ish va alohida resurslar)', { n: String(x.ishJami) })}>
      {x.ishJami > 0 && <div className="fz-split" role="img" aria-label={holatlar.map((h) => `${t(HOLAT_MUHR[h].matn)}: ${x.ishlar[h]}`).join(', ')}>
        {holatlar.map((h) => <i key={h} style={{ flexGrow: x.ishlar[h], background: HOLAT_FON[h] }} />)}
      </div>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {HOLAT_TARTIB.map((h) => (h === 'smetasiz' && !x.ishlar[h]) ? null : <span key={h} className="inline-flex items-center gap-1.5 text-text-dim" data-testid={`xulosa-${h}`}>
          <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: HOLAT_FON[h], boxShadow: h === 'yangi' ? 'inset 0 0 0 1px var(--border-strong)' : undefined }} aria-hidden="true" />
          {t(HOLAT_MUHR[h].matn)} <b className="tabular-nums text-text">{x.ishlar[h]}</b>
        </span>)}
      </div>
    </Katak>
  </section>;
}
