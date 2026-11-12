import { useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { hrMenOl, type HrMen as HrMenJavob } from '../../api/t2-hr';
import { BAZA_TURI_NOMI, ROL_NOMI } from '../../lib/hr/qarorlar';
import { OGOH_MATN, oyKaliti } from '../../lib/hr/hisob';
import { HrKpiBlok } from './HrKpiBlok';
import { XatoQutisi, useHrYukla } from './umumiy';

/**
 * «Mening oyligim va KPI» (D5): xodim FAQAT o'zini ko'radi. Server (t2_hr_men_v1) boshqa xodim parametrini qabul qilmaydi;
 * xodimlar ro'yxatiga ulanmagan foydalanuvchiga oddiy xabar. Boshqa odamning ma'lumoti, F2 summalari bu ekranga kelmaydi.
 */
export function HrMen({ kid }: { kid: number }) {
  const [oy, setOy] = useState(() => oyKaliti(new Date()));
  const m = useHrYukla<HrMenJavob>(() => hrMenOl(kid, oy), [kid, oy]);
  const d = m.data;
  const oylar = useMemo(() => (d?.oylar?.length ? d.oylar : [oy]), [d, oy]);
  const q = d?.qator ?? null;

  return (
    <div className="flex flex-col gap-3" data-testid="hr-men">
      <XatoQutisi xato={m.xato} />
      {d && !d.bog_langan && (
        <div className="rounded-md border border-border bg-surface p-4 text-[14px] text-text" role="status">
          {t('Siz xodimlar ro‘yxatiga ulanmagansiz. Kadrlar bo‘limiga murojaat qiling: sizni ro‘yxatga qo‘shib, hisobingizga ulaydi.')}
        </div>
      )}
      {d && d.bog_langan && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-text-mute">{t('Oy')}
              <select className="input h-8 px-2 text-[13px]" value={oy} onChange={(e) => setOy(e.target.value)} aria-label={t('Oy')}>
                {oylar.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <span className="fz-chip">{d.holat === 'tasdiqlangan' ? t('Tasdiqlangan') : t('Taxminiy (hali tasdiqlanmagan)')}</span>
          </div>
          {!q && <div className="rounded-md border border-border bg-surface p-4 text-[14px] text-text-dim" role="status">{t('Sizning HR kartangiz hali to‘ldirilmagan. Kadrlar bo‘limiga murojaat qiling.')}</div>}
          {q && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Karta nom={t('Qo‘lga (shu oy)')} val={q.qolga ?? q.sof} katta />
                <Karta nom={t('Donabay (naryad)')} val={q.naryad_summa ?? null} izoh={t('Naryad bo‘yicha alohida to‘langan; tabel bilan takror to‘lanmaydi.')} />
                <Karta nom={t('Jami daromad')} val={q.jami_daromad ?? null} izoh={t('Ish haqi + donabay')} />
                <Karta nom={t('Ish turi')} matn={`${t(ROL_NOMI[q.rol] ?? q.rol)} · ${t(BAZA_TURI_NOMI[q.baza_turi] ?? q.baza_turi)}`} />
              </div>

              <section className="rounded-md border border-border bg-surface p-3">
                <h3 className="mb-2 text-[14px] font-semibold text-text">{t('Hisob-kitob')}</h3>
                <table className="fz-table">
                  <tbody>
                    <Qator nom={t('Baza (tabel bo‘yicha)')} val={q.baza} izoh={q.baza_turi === 'donabay' ? t('Donabay xodimda baza 0: pul naryad orqali.') : t('Ishlagan kun: {k} / norma {n}', { k: q.kun_ishlagan ?? '—', n: q.norma_kun })} />
                    <Qator nom={t('KPI bonusi')} val={q.kpi_f2_qollandi ?? 0} izoh={q.kpi_pulga_tasir ? t('F2 foizli bonus qo‘shildi.') : t('KPI hozircha ish haqiga qo‘shilmaydi.')} />
                    <Qator nom={t('Bonus')} val={q.bonus} />
                    <Qator nom={t('Jarima')} val={q.jarima} minus />
                    <Qator nom={t('Hisoblangan')} val={q.hisoblangan} qalin />
                    <Qator nom={t('NDFL')} val={q.ndfl} minus />
                    <Qator nom={t('INPS')} val={q.inps} minus />
                    <Qator nom={t('Qo‘lga (tabel bo‘yicha qism)')} val={q.sof} qalin />
                    <Qator nom={t('Donabay (naryad) - alohida to‘langan')} val={q.naryad_summa ?? null} izoh={q.naryad_soni ? t('{n} ta naryad', { n: q.naryad_soni }) : undefined} />
                  </tbody>
                </table>
                {q.naryad_kun ? <p className="mt-2 text-[12px] text-text-mute">{t('Naryad davriga tushgan {n} kun tabel bo‘yicha qayta to‘lanmadi.', { n: q.naryad_kun })}</p> : null}
                {q.ogohlantirish.length > 0 && <ul className="mt-2 text-[12px] text-warn">{q.ogohlantirish.map((o) => <li key={o}>{t(OGOH_MATN[o] ?? o)}</li>)}</ul>}
              </section>

              <section className="rounded-md border border-border bg-surface p-3">
                <h3 className="mb-2 text-[14px] font-semibold text-text">{t('Mening KPI m')}</h3>
                <HrKpiBlok kpi={q.kpi} pulgaTasir={q.kpi_pulga_tasir} />
              </section>
            </>
          )}
        </>
      )}
      {m.yuk && <div className="text-[12px] text-text-mute" aria-live="polite">{t('Yuklanmoqda…')}</div>}
    </div>
  );
}

function Karta({ nom, val, matn, izoh, katta }: { nom: string; val?: number | null; matn?: string; izoh?: string; katta?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-[11.5px] text-text-mute">{nom}</div>
      <div className={`${katta ? 'text-[24px]' : 'text-[18px]'} font-semibold tabular-nums`}>{matn ?? <FmtN val={val ?? null} />}</div>
      {izoh && <div className="mt-1 text-[11.5px] text-text-mute">{izoh}</div>}
    </div>
  );
}

function Qator({ nom, val, izoh, minus, qalin }: { nom: string; val: number | null | undefined; izoh?: string; minus?: boolean; qalin?: boolean }) {
  return (
    <tr className={qalin ? 'font-semibold' : ''}>
      <td>{nom}{izoh && <div className="text-[11.5px] font-normal text-text-mute">{izoh}</div>}</td>
      <td className="fz-c-num">{val == null ? '—' : <>{minus && val > 0 ? '− ' : ''}<FmtN val={val} /></>}</td>
    </tr>
  );
}
