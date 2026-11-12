import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '../../i18n/til';
import { kunRaqami, type GrafikNatija, type GrafikQator, type Holat } from '../../lib/grafik/reja';
import { HOLAT_NOMI, KO_RINISH, QATOR_BALANDLIGI, korinadiganlar, virtualOyna } from '../../lib/grafik/gantt';

/**
 * Oddiy Gantt (og'ir kutubxonasiz): SVG chizig'i + CSS qatorlar. Virtualizatsiya: faqat ko'rinadigan qatorlar chiziladi
 * (qator balandligi qat'iy), shuning uchun 1 700 qatorda ham tez. Rang faqat dizayn o'zgaruvchilaridan; harakat yo'q.
 */
const CHAP = 280;
const HOLAT_RANG: Record<Holat, string> = {
  bajarildi: 'var(--ok)', kechikmoqda: 'var(--danger)', vaqtida: 'var(--info)', oldinda: 'var(--ok)', boshlanmagan: 'var(--text-mute)', malumot_yoq: 'var(--warn)',
};
type Zoom = 1 | 3 | 8;

export function GrafikGantt({ natija, bugun, tanlangan, onTanla }: { natija: GrafikNatija; bugun: string; tanlangan?: number | null; onTanla?: (q: GrafikQator) => void }) {
  const [zoom, setZoom] = useState<Zoom>(3);
  const [yopiq, setYopiq] = useState<Set<number>>(() => new Set(natija.qatorlar.filter((q) => q.bolalar > 0 && q.daraja >= 1).map((q) => q.id)));
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const qatorlar = useMemo(() => korinadiganlar(natija.qatorlar, yopiq), [natija.qatorlar, yopiq]);
  const oraliq = useMemo(() => {
    const sanalar = natija.qatorlar.flatMap((q) => [q.bosh, q.tugash, q.faktBosh, q.faktTugash]).filter((x): x is string => !!x);
    sanalar.push(bugun);
    const nlar = sanalar.map(kunRaqami);
    return { a: Math.min(...nlar) - 3, b: Math.max(...nlar) + 7 };
  }, [natija.qatorlar, bugun]);
  const kenglik = Math.max(300, (oraliq.b - oraliq.a + 1) * zoom);
  const x = (iso: string) => (kunRaqami(iso) - oraliq.a) * zoom;
  const [i0, i1] = virtualOyna(scrollTop, qatorlar.length);
  const korinadi = qatorlar.slice(i0, i1);
  const bugunX = x(bugun);

  // Oy chiziqlari (yuqori shkala)
  const oylar = useMemo(() => {
    const out: Array<{ x: number; nom: string }> = [];
    const d0 = new Date(oraliq.a * 86_400_000); d0.setUTCDate(1);
    for (let d = d0; d.getTime() / 86_400_000 <= oraliq.b; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      out.push({ x: (d.getTime() / 86_400_000 - oraliq.a) * zoom, nom: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` });
    }
    return out;
  }, [oraliq, zoom]);

  if (!natija.qatorlar.length) return <p className="text-sm text-text-mute">{t('Bu obyektda razdel yo‘q.')}</p>;
  if (!natija.boshSana) return <p className="text-sm text-warn" data-testid="gantt-bosh-yoq">{t('Boshlanish sanasi yo‘q: shartnoma sanasi topilmadi. Yuqorida boshlanish sanasini kiriting — sana o‘ylab topilmaydi.')}</p>;

  return (
    <div data-testid="gantt">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-mute">
        <span>{t('Masshtab')}:</span>
        {([[1, 'Zich'], [3, 'O‘rta'], [8, 'Kengroq']] as const).map(([z, nom]) => (
          <button key={z} type="button" className={`fz-btn ${zoom === z ? 'is-active' : ''}`} aria-pressed={zoom === z} onClick={() => setZoom(z)}>{t(nom)}</button>
        ))}
        <span className="ml-auto inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-4 rounded-sm" style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />{t('reja')}</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-4 rounded-sm" style={{ background: 'var(--accent)' }} />{t('fakt')}</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-px" style={{ background: 'var(--danger)' }} />{t('bugun')}</span>
        </span>
      </div>
      <div ref={ref} className="relative overflow-auto rounded-md border border-border bg-surface" style={{ height: KO_RINISH }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="table" aria-label={t('Ish grafigi')} aria-rowcount={qatorlar.length}>
        <div style={{ width: CHAP + kenglik, height: qatorlar.length * QATOR_BALANDLIGI + 24, position: 'relative' }}>
          <div className="sticky top-0 z-20 flex bg-surface-2" style={{ height: 24 }}>
            <div className="sticky left-0 z-30 shrink-0 border-b border-r border-border bg-surface-2 px-2 text-xs leading-6 text-text-dim" style={{ width: CHAP }}>{t('Razdel')}</div>
            <svg width={kenglik} height={24} aria-hidden="true" className="border-b border-border">
              {oylar.map((o) => (<g key={o.nom}><line x1={o.x} x2={o.x} y1={0} y2={24} stroke="var(--border)" /><text x={o.x + 3} y={16} fontSize={10} fill="var(--text-mute)">{o.nom}</text></g>))}
            </svg>
          </div>
          {korinadi.map((q, k) => {
            const top = 24 + (i0 + k) * QATOR_BALANDLIGI;
            const ochiq = !yopiq.has(q.id);
            const faktFoiz = q.faktFoiz == null ? null : Math.min(1, Math.max(0, q.faktFoiz));
            return (
              <div key={q.id} role="row" aria-rowindex={i0 + k + 1} className={`absolute left-0 flex items-center ${tanlangan === q.id ? 'bg-accent/10' : ''}`} style={{ top, height: QATOR_BALANDLIGI, width: CHAP + kenglik }}>
                <div role="cell" className="sticky left-0 z-10 flex shrink-0 items-center gap-1 overflow-hidden border-r border-border bg-surface px-1 text-xs" style={{ width: CHAP, height: QATOR_BALANDLIGI, paddingLeft: 4 + q.daraja * 12 }}>
                  {q.bolalar > 0
                    ? <button type="button" aria-label={ochiq ? t('Yopish') : t('Ochish')} aria-expanded={ochiq} className="shrink-0 text-text-mute"
                        onClick={() => setYopiq((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}>
                        {ochiq ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button>
                    : <span className="inline-block w-[14px] shrink-0" />}
                  <i aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: HOLAT_RANG[q.holat] }} />
                  <button type="button" className="min-w-0 flex-1 truncate text-left" title={`${q.nom} — ${t(HOLAT_NOMI[q.holat])}`} onClick={() => onTanla?.(q)}>{q.nom}</button>
                  {q.holat === 'kechikmoqda' && <b className="shrink-0 text-[10px] text-danger">{t('kechikmoqda')}</b>}
                </div>
                <svg role="cell" width={kenglik} height={QATOR_BALANDLIGI} className="shrink-0" aria-label={`${q.nom}: ${q.bosh ?? '—'} — ${q.tugash ?? '—'}`}>
                  <line x1={bugunX} x2={bugunX} y1={0} y2={QATOR_BALANDLIGI} stroke="var(--danger)" strokeOpacity={0.5} />
                  {q.bosh && q.tugash && (() => {
                    const x0 = x(q.bosh); const w = Math.max(3, x(q.tugash) - x0 + zoom);
                    return (
                      <g>
                        <rect x={x0} y={q.bolalar > 0 ? 9 : 6} width={w} height={q.bolalar > 0 ? 6 : 12} rx={2} fill="var(--surface-3)" stroke="var(--border-strong)" />
                        {faktFoiz != null && <rect x={x0} y={q.bolalar > 0 ? 9 : 6} width={w * faktFoiz} height={q.bolalar > 0 ? 6 : 12} rx={2} fill="var(--accent)" />}
                      </g>
                    );
                  })()}
                  {q.faktBosh && q.faktTugash && <line x1={x(q.faktBosh)} x2={x(q.faktTugash) + zoom} y1={QATOR_BALANDLIGI - 3} y2={QATOR_BALANDLIGI - 3} stroke="var(--info)" strokeWidth={2} />}
                </svg>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-text-mute">{t('Qatorlar')}: {qatorlar.length.toLocaleString('ru-RU')} / {natija.qatorlar.length.toLocaleString('ru-RU')} · {t('ko‘rinadigan oyna chiziladi')}</p>
    </div>
  );
}
