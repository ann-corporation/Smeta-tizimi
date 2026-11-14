import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import type { CashflowNatija, GrafikMalumot, OyQatori } from '../../lib/grafik/reja';

/**
 * P7 Cashflow prognoz: oylik reja (grafik x smeta paketi) | haqiqiy hisoblangan (F2 reestri) | to'langan | kutilayotgan hisob.
 * Pul: QQS bilan - asosiy; reja katagida ostida ustamali (QQS siz) va ustamasiz (paket nisbati bilan taqsimlangan).
 * NULL != 0: noma'lum - "—". Direktor va buyurtmachi (tomon ko'rinishi) uchun bir xil komponent.
 */
const pul = (v: number | null) => (v == null ? <span className="text-text-mute">{'—'}</span> : <FmtN val={v} kasr={0} />);

function Uchlik({ v, nisbat }: { v: number | null; nisbat: CashflowNatija['nisbat'] }) {
  if (v == null) return <span className="text-text-mute">{'—'}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <b><FmtN val={v} kasr={0} /></b>
      {nisbat && v !== 0 && (
        <>
          <span className="text-[10px] text-text-mute">{t('ustamali')}: <FmtN val={v * nisbat.ustamali} kasr={0} /></span>
          <span className="text-[10px] text-text-mute">{t('ustamasiz')}: <FmtN val={v * nisbat.ustamasiz} kasr={0} /></span>
        </>
      )}
    </span>
  );
}

const DAVR_NOMI: Record<OyQatori['davr'], string> = { otgan: 'o‘tgan', joriy: 'joriy oy', kelgusi: 'kelgusi' };

export function GrafikPulOqimi({ malumot, cf }: { malumot: GrafikMalumot; cf: CashflowNatija }) {
  return (
    <section className="flex flex-col gap-3" data-testid="pul-oqimi" aria-label={t('Oylik pul oqimi prognozi')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="fz-panel">
          <div className="fz-panel__h"><span>{t('Smeta jami (grafik shu summani oylarga taqsimlaydi)')}</span></div>
          <SummaJuft paket={malumot.paketSmeta} kesimYoq kiritishYoli={{ yol: '/admin/obyektlar', matn: t('Smeta kiritilmagan') }} />
        </div>
        <div className="fz-panel">
          <div className="fz-panel__h"><span>{t('Hisob-kitob holati (QQS bilan)')}</span></div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm tabular-nums">
            <dt className="text-text-mute">{t('Hisoblangan (F2 reestri)')}</dt><dd className="text-right">{pul(cf.jamiHisoblangan)}</dd>
            <dt className="text-text-mute">{t('To‘langan')}</dt><dd className="text-right">{pul(cf.jamiTolangan)}</dd>
            <dt className="text-text-mute">{t('Hisoblangan, to‘lanmagan')}</dt><dd className="text-right">{pul(cf.tolanmaganQoldiq)}</dd>
            <dt className="text-text-mute">{t('Bajarilgan, hali hisoblanmagan (fakt − F2)')}</dt><dd className="text-right">{pul(cf.hisoblanmaganFakt)}</dd>
          </dl>
        </div>
      </div>

      {cf.oylar.length === 0
        ? <p className="text-sm text-text-mute">{t('Oylik prognoz uchun grafik (boshlanish sanasi) yoki F2/to‘lov yozuvlari kerak.')}</p>
        : (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
              <thead className="bg-surface-2 text-xs text-text-dim">
                <tr>
                  <th className="px-2 py-1 text-left">{t('Oy')}</th>
                  <th className="px-2 py-1 text-right">{t('Reja (grafikdan)')}</th>
                  <th className="px-2 py-1 text-right">{t('Hisoblangan (F2)')}</th>
                  <th className="px-2 py-1 text-right">{t('To‘langan')}</th>
                  <th className="px-2 py-1 text-right">{t('Kutilayotgan hisob')}</th>
                </tr>
              </thead>
              <tbody>
                {cf.oylar.map((o) => (
                  <tr key={o.oy} className={`border-t border-border ${o.davr === 'joriy' ? 'bg-accent/10' : ''}`} data-testid="pul-oy">
                    <td className="px-2 py-1 text-left">{o.oy.slice(0, 7)} <span className="text-[10px] text-text-mute">{t(DAVR_NOMI[o.davr])}</span></td>
                    <td className="px-2 py-1 text-right"><Uchlik v={o.reja} nisbat={cf.nisbat} /></td>
                    <td className="px-2 py-1 text-right">
                      {pul(o.hisoblangan)}
                      {o.f3 != null && <div className="text-[10px] text-text-mute">{t('shundan F3 da')}: <FmtN val={o.f3} kasr={0} /></div>}
                      {o.hisoblanganNomalum > 0 && <div className="text-[10px] text-warn">{o.hisoblanganNomalum} {t('ta F2 summasi noma’lum')}</div>}
                    </td>
                    <td className="px-2 py-1 text-right">{pul(o.tolangan)}</td>
                    <td className="px-2 py-1 text-right font-semibold">{o.davr === 'otgan' ? <span className="text-text-mute">{'—'}</span> : pul(o.prognoz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {cf.grafiksizSumma != null && cf.grafiksizSumma > 0 && (
        <p className="text-xs text-warn" data-testid="grafiksiz-izoh">{t('Mehnati yo‘q razdellar summasi grafikka qo‘yilmagan va oylarga taqsimlanmagan (QQS bilan)')}: <FmtN val={cf.grafiksizSumma} kasr={0} /></p>
      )}
      <p className="text-[11px] text-text-mute">
        {t('Hisoblash: reja = smeta paketi (QQS bilan) razdel vazni va ish kunlari bo‘yicha oylarga taqsimlanadi. Kutilayotgan hisob: kelgusi oylar = reja; joriy oy = reja + hali hisoblanmagan bajarilgan ish. To‘lov kechikishi hisobga olinmagan.')}
      </p>
    </section>
  );
}
