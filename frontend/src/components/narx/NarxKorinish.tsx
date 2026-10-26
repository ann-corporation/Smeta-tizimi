import type { CSSProperties } from 'react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { NARX_MANBA_TUR_NOMI, type NarxManbaTur } from '../../api/t2-narx-dalil';
import { MANBA_CHIP, OGISH_CHEGARA, type Bolak, type KaskadQadam, type NarxOgish } from '../../lib/narx-korinish';

/**
 * Narx bo'limi ko'rinish bo'laklari (Firuza): nakrutka zinapoyasi, narx og'ishi chizig'i, manba chipi,
 * qamrov chizig'i. Hisoblar — lib/narx-korinish (sof); bu yerda faqat belgilash, ranglar faqat tokenlar.
 */

const QADAM_RANG: Record<KaskadQadam['tur'], string> = { asos: 'var(--border-strong)', qosh: 'var(--accent)', jami: 'var(--info)' };
const foizMatn = (f: number | null, kasr = 1) => (f == null ? '—' : `${f > 0 ? '+' : ''}${f.toFixed(kasr)}%`);

/** Nakrutka kaskadi: to'g'ridan-to'g'ri xarajatdan ВСЕГО gacha zinapoya — har qo'shimcha qayerdan qayergacha ko'taradi. */
export function KaskadZinapoya({ qadamlar }: { qadamlar: readonly KaskadQadam[] }) {
  return (
    <div className="fz-table-wrap" data-testid="kaskad-zinapoya">
      <table className="fz-table">
        <thead><tr>
          <th>{t('Statya')}</th>
          <th style={{ width: '42%' }}>{t('Zinapoya: to‘g‘ri xarajat → ВСЕГО')}</th>
          <th className="fz-c-num">{t('Ulush')}</th>
          <th className="fz-c-num">{t('Summa (so‘m)')}</th>
        </tr></thead>
        <tbody>
          {qadamlar.map((q) => {
            const chiziq: CSSProperties = { left: `${q.boshi * 100}%`, width: `${Math.max(0.3, (q.oxiri - q.boshi) * 100)}%`, background: QADAM_RANG[q.tur] };
            return (
              <tr key={q.key} className={q.tur === 'jami' ? 'fz-row-total' : q.tur === 'asos' ? 'fz-row-bl' : ''}>
                <td>
                  <span className={q.tur === 'qosh' ? 'pl-3 text-text-dim' : ''}>{q.tur === 'qosh' ? '+ ' : ''}{q.label}</span>
                  {q.farq != null && <span className="fz-chip fz-chip--warn ml-2" title={t('Server jamisi oldingi qatorlar yig‘indisidan farq qiladi')}>{t('farq')}: <FmtN val={q.farq} /></span>}
                </td>
                <td>
                  <span className="relative block h-3 rounded-[2px] bg-surface-3" aria-hidden="true">
                    {q.qiymat != null && <i className="absolute top-0 h-full rounded-[2px]" style={chiziq} />}
                  </span>
                </td>
                <td className="fz-c-num text-text-mute">{q.tur === 'qosh' ? foizMatn(q.foiz, 2) : ''}</td>
                <td className="fz-c-num">{q.qiymat == null ? '—' : <FmtN val={q.qiymat} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ZinapoyaLegenda() {
  const kv = (bg: string) => <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: bg }} aria-hidden="true" />;
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-dim">
    <span className="inline-flex items-center gap-1.5">{kv(QADAM_RANG.asos)}{t('to‘g‘ridan-to‘g‘ri xarajat')}</span>
    <span className="inline-flex items-center gap-1.5">{kv(QADAM_RANG.qosh)}{t('ustama qo‘shimchasi (% — to‘g‘ri xarajatga nisbatan)')}</span>
    <span className="inline-flex items-center gap-1.5">{kv(QADAM_RANG.jami)}{t('oraliq jami (ИТОГО)')}</span>
  </div>;
}

/** Manba narxi smeta narxiga nisbatan: markaz = smeta narxi; o'ngga — qimmat, chapga — arzon. ±{OGISH_CHEGARA}% — chet. */
export function OgishMeter({ og }: { og: NarxOgish }) {
  if (og.foiz == null) return <span className="text-text-mute" title={t('Smeta narxi noma’lum — taqqoslab bo‘lmaydi')}>—</span>;
  const katta = og.daraja === 'katta';
  const rang = katta ? 'var(--warn)' : 'var(--accent)';
  return (
    <span className="inline-flex min-w-[132px] items-center gap-2" title={t('Manba narxi smeta narxidan {f} (chiziq chegarasi ±{c}%)', { f: foizMatn(og.foiz, 2), c: String(OGISH_CHEGARA) })} data-testid="ogish-meter">
      <span className="relative block h-2 flex-1 rounded-[2px] bg-surface-3">
        <i className="absolute top-0 h-full" style={{ left: `${og.boshi * 100}%`, width: `${Math.max(0.5, (og.oxiri - og.boshi) * 100)}%`, background: rang }} />
        <i className="absolute -top-0.5 h-3 w-px bg-text-dim" style={{ left: '50%' }} />
      </span>
      <span className={`w-[58px] text-right font-mono text-[11.5px] tabular-nums ${katta ? 'font-semibold text-warn' : 'text-text-dim'}`}>{foizMatn(og.foiz)}</span>
    </span>
  );
}

export function ManbaChip({ tur }: { tur: NarxManbaTur }) {
  const c = MANBA_CHIP[tur] ?? MANBA_CHIP.boshqa;
  return <span className={`fz-chip ${c.cls}`} title={NARX_MANBA_TUR_NOMI[tur]} data-testid="manba-chip">{t(c.qisqa)}</span>;
}

/** Qamrov chizig'i (bo'laklar) + legenda: har bo'lak — so'z, son va ulush. */
export function QamrovChizigi({ bolaklar, nomlar, ranglar, aria }: {
  bolaklar: readonly Bolak[]; nomlar: Record<string, string>; ranglar: Record<string, string>; aria: string;
}) {
  const bor = bolaklar.filter((b) => b.soni > 0);
  return <div className="flex flex-col gap-2">
    <div className="fz-split" role="img" aria-label={`${aria}: ${bolaklar.map((b) => `${nomlar[b.kalit]} ${b.soni}`).join(', ')}`}>
      {bor.map((b) => <i key={b.kalit} style={{ flexGrow: b.soni, background: ranglar[b.kalit] }} />)}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
      {bolaklar.map((b) => <span key={b.kalit} className="inline-flex items-center gap-1.5 text-text-dim">
        <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: ranglar[b.kalit] }} aria-hidden="true" />
        {nomlar[b.kalit]} <b className="tabular-nums text-text">{b.soni.toLocaleString('ru-RU')}</b>
        <small className="tabular-nums text-text-mute">{Math.round(b.ulush * 100)}%</small>
      </span>)}
    </div>
  </div>;
}
