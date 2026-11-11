import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { qarzSvodOl } from '../../api/t2-qarzdorlik';
import { debitorJami, debitorOgoh, debitorQatorlar, type DebitorOgoh, type DebitorQator } from '../../lib/qarzdorlik/debitor';

const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';
const OGOH_MATN: Record<DebitorOgoh, () => string> = {
  f3_yoq: () => t('F2 tasdiqlangan, lekin hisob-faktura (F3) chiqarilmagan'),
  avans: () => t('Ortiqcha to‘lov / avans: biz buyurtmachidan qarzmiz'),
  tolov_yoq: () => t('F3 chiqarilgan, to‘lov hali yo‘q'),
};

function Son({ v }: { v: number | null }) {
  return v == null ? <span className="text-text-mute" title={t('Noma‘lum')}>—</span> : <span className="tabular-nums"><FmtN val={v} /></span>;
}

/** Buyurtmachi bizga qarzi (debitor) — mavjud Qarzdorlik sahifasi ichida; yangi menyu yo‘q. Hisob bazada (qarz_svod_v1). */
export function DebitorPanel({ kid }: { kid: number }) {
  const [q, setQ] = useState<DebitorQator[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  useEffect(() => {
    let bekor = false;
    void qarzSvodOl(kid).then((r) => { if (bekor) return; if (r.ok) { setQ(debitorQatorlar(r.qatorlar)); setXato(null); } else setXato(r.error); });
    return () => { bekor = true; };
  }, [kid]);
  const jami = useMemo(() => debitorJami(q ?? []), [q]);
  if (xato) return <p role="status" className="text-[12px] text-text-mute">{t('Buyurtmachi qarzi: {xato}', { xato })}</p>;
  if (!q || q.length === 0) return null;
  return (
    <details open className="fz-panel text-[12.5px]" aria-label={t('Buyurtmachi qarzi')}>
      <summary className="cursor-pointer text-[13px] font-semibold">{t('Buyurtmachi bizga qarzi (F3 − to‘lov)')}</summary>
      <p className="mt-1 text-[11px] text-text-mute">{t('Summalar QQS bilan (F3, to‘lov). F2 — tasdiqlangan, ustamasiz, QQS siz; qarzdan ayirilmaydi.')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div><span className={yorliq}>{t('Shartnoma summasi')}</span><Son v={jami.shartnoma} /></div>
        <div><span className={yorliq}>{t('F2 (ustamasiz)')}</span><Son v={jami.f2} /></div>
        <div><span className={yorliq}>{t('F3 (hisob-faktura)')}</span><Son v={jami.f3} /></div>
        <div><span className={yorliq}>{t('To‘langan')}</span><Son v={jami.tolangan} /></div>
        <div><span className={yorliq}>{t('Qarz')}</span><b><Son v={jami.qarz} /></b></div>
      </div>
      {jami.qarzNomalum > 0 && <p className="mt-1 text-[11px] text-text-mute">{t('{n} ta shartnomada qarz noma‘lum — jamiga kirmagan.', { n: jami.qarzNomalum })}</p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[820px] text-[12px]" aria-label={t('Buyurtmachi qarzi ro‘yxati')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute">
            <th className="px-2 py-1">{t('Buyurtmachi')}</th><th className="px-2 py-1">{t('Shartnoma')}</th>
            <th className="px-2 py-1 text-right">{t('F2 (ustamasiz)')}</th><th className="px-2 py-1 text-right">{t('F3 (hisob-faktura)')}</th>
            <th className="px-2 py-1 text-right">{t('To‘langan')}</th><th className="px-2 py-1 text-right">{t('Qarz')}</th><th className="px-2 py-1" />
          </tr></thead>
          <tbody>
            {q.map((x) => (
              <tr key={x.shartnoma_id} className="border-t border-border/60">
                <td className="px-2 py-1 font-medium">{x.kontragent ?? '—'}</td><td className="px-2 py-1">{x.raqam ?? '—'}</td>
                <td className="px-2 py-1 text-right"><Son v={x.f2_nakrutkasiz} /></td><td className="px-2 py-1 text-right"><Son v={x.f3_sotuv} /></td>
                <td className="px-2 py-1 text-right"><Son v={x.tolangan} /></td><td className="px-2 py-1 text-right"><b><Son v={x.qarz} /></b></td>
                <td className="px-2 py-1"><span className="flex flex-wrap gap-1">{debitorOgoh(x).map((o) => (
                  <span key={o} className="inline-flex items-center gap-0.5 rounded bg-warn/15 px-1 text-[10.5px] text-warn"><AlertTriangle size={11} />{OGOH_MATN[o]()}</span>))}</span></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </details>
  );
}