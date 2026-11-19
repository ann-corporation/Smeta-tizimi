import { Fragment, useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import type { AslHujjat, AslKatak, AslQator } from '../../lib/f2-texnadzor-asl';
import type { Chip, Natija } from '../../lib/f2-texnadzor-solishtir';

const BOSQICH = 300;
/** Katak indekslari (0-asosli): 5 = hajm (6-ustun), 6 = narx (7-ustun). */
const HAJM = 5;
const NARX = 6;

function katakStil(k: AslKatak, ozgargan: boolean): React.CSSProperties {
  return {
    background: k.fon ? `#${k.fon}` : undefined, color: k.rang ? `#${k.rang}` : undefined,
    fontWeight: k.qalin ? 700 : undefined, fontStyle: k.kursiv ? 'italic' : undefined,
    textDecoration: k.chizilgan ? 'line-through' : undefined,
    outline: ozgargan ? '2px solid #e11d48' : undefined, outlineOffset: -2,
  };
}

/** Texnadzor faylini aynan shu ko'rinishda: rang, shrift, izoh va note saqlanadi; chap tomonda bizning holat. */
export function F2TexnadzorAsl({ asl, natijalar, chipNomi, faqatBelgili }: {
  asl: AslHujjat; natijalar: ReadonlyMap<number, Natija>; chipNomi: (c: Chip) => string; faqatBelgili: boolean;
}) {
  const [soni, setSoni] = useState(BOSQICH);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const royxat = useMemo(() => asl.qatorlar.filter((q) => !faqatBelgili || q.belgili), [asl, faqatBelgili]);
  const qoldi = royxat.length - soni;
  const ustunlar = useMemo(() => Array.from({ length: asl.kalitUstun + 1 }, (_, i) => i).filter((i) => i !== asl.kalitUstun - 1), [asl.kalitUstun]);
  const qator = (q: AslQator, sarlavha: boolean) => {
    const n = natijalar.get(q.qator);
    const notalar = q.katak.map((k, i) => ({ i, nota: k.nota })).filter((x) => x.nota);
    return (
      <Fragment key={q.qator}>
        <tr style={sarlavha ? { fontWeight: 700, position: 'sticky', top: 0, background: 'var(--bg, #fff)' } : undefined}
          onClick={!sarlavha && (notalar.length || q.katak[asl.kalitUstun]?.v) ? () => setOchiq(ochiq === q.qator ? null : q.qator) : undefined}>
          <td className="p-1 whitespace-nowrap">{n?.chip ? <span className="fz-chip">{chipNomi(n.chip)}</span> : null}</td>
          <td className="p-1 tabular-nums text-text-mute">{q.qator}</td>
          {ustunlar.map((i) => {
            const k = q.katak[i];
            const oz = !!n && ((i === HAJM && n.holat === 'HAJM_FARQ') || (i === NARX && n.holat === 'NARX_FARQ'));
            return (
              <td key={i} className="p-1" style={katakStil(k, oz)} title={k.nota || undefined}>
                {k.v}{k.nota && <span aria-label={t('Izoh bor')} style={{ color: '#e11d48' }}> {'◥'}</span>}
              </td>
            );
          })}
        </tr>
        {ochiq === q.qator && (
          <tr><td /><td colSpan={ustunlar.length + 1} className="p-1 text-[11px] text-text-mute">
            {notalar.map((x) => <div key={x.i}>{t('Katak izohi')} ({asl.sarlavha.at(-1)?.katak[x.i]?.v || x.i + 1}): {x.nota}</div>)}
            {q.katak[asl.kalitUstun]?.v && <div>{t('Texnadzor izohi')}: {q.katak[asl.kalitUstun].v}</div>}
          </td></tr>
        )}
      </Fragment>
    );
  };
  return (
    <div className="mt-2 overflow-auto" style={{ maxHeight: 460 }} data-testid="texnadzor-asl">
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {asl.sarlavha.map((q) => qator(q, true))}
          {royxat.slice(0, soni).map((q) => qator(q, false))}
          {royxat.length === 0 && <tr><td colSpan={ustunlar.length + 2} className="p-2 text-text-mute">{t('Mos qator yo‘q')}</td></tr>}
        </tbody>
      </table>
      {qoldi > 0 && (
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm mt-1" onClick={() => setSoni(soni + BOSQICH)}>
          {t('Yana {n} qator', { n: Math.min(BOSQICH, qoldi) })}
        </button>
      )}
    </div>
  );
}
