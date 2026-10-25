import { useState, useEffect, useMemo } from 'react';
import { sbT2TolovlarOl, sbT2BuxDashboardOl, type Tolov } from '../api/t2-buxgalteriya';
import { Plus, RefreshCcw, FileSpreadsheet, Building2, CreditCard, Banknote, BarChart3 } from 'lucide-react';
import { FmtN } from '../lib/format';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { useKompaniya } from './KompaniyaTanlov';
import { tolovOqimi, tolovUlushi } from '../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsChiziq, OpsKpi, OpsKpiQator, OpsQidiruv, OpsTablar } from '../components/kompaniya-ops/OpsUi';

/**
 * To'lovlar (moliya) — egasi 2026-10-25: Firuza ko'rinishi.
 * Tepada: bajarilgan (F2) → to'langan ulushi chizig'i, qarzdorlik va avans; oylar bo'yicha kirim/chiqim ustunlari.
 * To'lov — haqiqiy pul harakati (ustama qo'llanmaydi); belgi o'rniga so'z: «kirim» / «chiqim».
 */
type Tab = 'reestr' | 'kassa' | 'cashflow' | '1c';
type Toifa = 'barchasi' | 'kirim' | 'chiqim';
const TUR_NOM: Record<string, string> = { avans: 'avans', tolov: 'to‘lov', qaytarim: 'qaytarim' };

export default function TestTolov() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;

  const [activeTab, setActiveTab] = useState<Tab>('reestr');
  const [dashboard, setDashboard] = useState<{ bajarilgan: number; tolangan: number; debitor: number; avans: number }>({ bajarilgan: 0, tolangan: 0, debitor: 0, avans: 0 });
  const [tolovlar, setTolovlar] = useState<Tolov[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toifa, setToifa] = useState<Toifa>('barchasi');

  useEffect(() => {
    if (!aktKomp) return;
    setYuklanmoqda(true);
    void Promise.all([sbT2BuxDashboardOl(aktKomp), sbT2TolovlarOl()]).then(([dashRes, tolovRes]) => {
      setYuklanmoqda(false);
      if (dashRes.ok && dashRes.qatorlar) {
        // t2_bux_dashboard da kompaniya_id bo'lmasligi mumkin — hozircha barcha qatorlar yig'iladi (avvalgi xulq).
        setDashboard(dashRes.qatorlar.reduce((acc, curr) => ({
          bajarilgan: acc.bajarilgan + (curr.bajarilgan || 0),
          tolangan: acc.tolangan + (curr.tolangan || 0),
          debitor: acc.debitor + (curr.debitor || 0),
          avans: acc.avans + (curr.avans || 0),
        }), { bajarilgan: 0, tolangan: 0, debitor: 0, avans: 0 }));
      } else {
        setDashboard({ bajarilgan: 0, tolangan: 0, debitor: 0, avans: 0 });
      }
      // sbT2TolovlarOl barcha to'lovlarni berishi mumkin — joriy kompaniya bo'yicha ajratiladi.
      setTolovlar(tolovRes.ok && tolovRes.qatorlar ? tolovRes.qatorlar.filter((x) => x.kompaniya_id === aktKomp) : []);
    });
  }, [aktKomp]);

  const filteredTolovlar = tolovlar.filter((x) =>
    (x.izoh?.toLowerCase().includes(searchTerm.toLowerCase()) || x.shartnoma_id?.toString().includes(searchTerm))
    && (toifa === 'barchasi' || (toifa === 'kirim' ? x.summa > 0 : x.summa < 0)));
  const oqim = useMemo(() => tolovOqimi(tolovlar), [tolovlar]);
  const ulush = tolovUlushi(dashboard.bajarilgan, dashboard.tolangan);
  const oyMaks = Math.max(1, ...oqim.oylar.map((o) => Math.max(o.kirim, o.chiqim)));

  return (
    <Sahifa
      sarlavha="To‘lovlar va kassa"
      tavsif="Bajarilgan ish (F2) qanchasi to‘langan, kim qarzdor va oylar bo‘yicha pul oqimi."
      amallar={<>
        <button type="button" className="fz-btn fz-btn--ghost" title={t('Tez orada')}><FileSpreadsheet /> {t('Excel eksport')}</button>
        <button type="button" onClick={() => toast(t('Yangi to‘lov faqat «Shartnomalar» ichidan kiritiladi (shartnomaga bog‘lanadi).'), 'warn')} className="fz-btn fz-btn--primary"><Plus /> {t('Yangi to‘lov')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Moliya ko‘rsatkichlari')}>
          <OpsKpi nom={t('Bajarilgan (F2)')} rang="var(--info)" qiymat={<FmtN val={dashboard.bajarilgan} />} ost={t('Forma-2 lar yig‘indisi, so‘m')} />
          <OpsKpi nom={t('To‘langan')} rang="var(--ok)" qiymat={<FmtN val={dashboard.tolangan} />}
            ost={<span className="flex items-center gap-2"><OpsChiziq ulush={ulush} rang="var(--ok)" /><span className="whitespace-nowrap">{ulush == null ? '—' : t('{f}% bajarilgandan', { f: Math.round(ulush * 100) })}</span></span>} />
          <OpsKpi nom={t('Qarzdorlik (bizga)')} rang="var(--danger)" qiymat={<span className={dashboard.debitor > 0 ? 'text-danger' : ''}><FmtN val={dashboard.debitor} /></span>} ost={t('bajarilgan, lekin to‘lanmagan')} />
          <OpsKpi nom={t('Avans')} rang="var(--warn)" qiymat={<FmtN val={dashboard.avans} />} ost={t('oldindan to‘lovlar')} />
        </OpsKpiQator>

        <section className="fz-panel" aria-label={t('Pul oqimi oylar bo‘yicha')}>
          <div className="fz-panel__h">
            <span>{t('Pul oqimi oylar bo‘yicha')}</span>
            <span className="flex gap-3 normal-case tracking-normal">
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--ok)' }} />{t('kirim')} <b className="tabular-nums text-text"><FmtN val={oqim.kirim} kasr={0} /></b></span>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--danger)' }} />{t('chiqim')} <b className="tabular-nums text-text"><FmtN val={oqim.chiqim} kasr={0} /></b></span>
            </span>
          </div>
          {oqim.oylar.length === 0 ? <p className="text-[12px] text-text-mute">{t('To‘lovlar hali yo‘q — oqim chizig‘i to‘lov kiritilgach paydo bo‘ladi.')}</p> : (
            <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ minHeight: 110 }}>
              {oqim.oylar.map((o) => (
                <div key={o.oy} className="flex min-w-[44px] flex-col items-center gap-1" title={t('{oy}: kirim {k}, chiqim {c}', { oy: o.oy, k: o.kirim.toLocaleString('ru-RU'), c: o.chiqim.toLocaleString('ru-RU') })}>
                  <div className="flex h-[84px] items-end gap-1">
                    <i className="block w-3 rounded-t-sm" style={{ height: `${(o.kirim / oyMaks) * 100}%`, minHeight: o.kirim ? 2 : 0, background: 'var(--ok)' }} />
                    <i className="block w-3 rounded-t-sm" style={{ height: `${(o.chiqim / oyMaks) * 100}%`, minHeight: o.chiqim ? 2 : 0, background: 'var(--danger)' }} />
                  </div>
                  <span className="text-[10.5px] tabular-nums text-text-mute">{o.oy}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <OpsTablar<Tab> yorliq={t('Moliya bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'reestr', nom: t('To‘lovlar reestri'), ikon: <CreditCard />, soni: tolovlar.length },
          { id: 'kassa', nom: t('Bank va kassa'), ikon: <Banknote /> },
          { id: 'cashflow', nom: t('Cashflow (prognoz)'), ikon: <BarChart3 /> },
          { id: '1c', nom: t('1C sinxron'), ikon: <RefreshCcw /> },
        ]} />

        {activeTab === 'reestr' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <OpsQidiruv qiymat={searchTerm} onChange={setSearchTerm} placeholder={t('Izoh yoki shartnoma № bo‘yicha qidiring…')} />
              <select aria-label={t('Toifa')} value={toifa} onChange={(e) => setToifa(e.target.value as Toifa)} className="h-8 px-2 text-[13px]">
                <option value="barchasi">{t('Barcha toifalar')}</option>
                <option value="kirim">{t('Kirim')}</option>
                <option value="chiqim">{t('Chiqim')}</option>
              </select>
            </div>
            <div className="fz-table-wrap">
              <table className="fz-table">
                <thead>
                  <tr><th>{t('ID')}</th><th>{t('Sana')}</th><th>{t('Shartnoma / tur')}</th><th>{t('Izoh')}</th><th className="fz-c-num">{t('Summa, so‘m')}</th><th>{t('Holat')}</th></tr>
                </thead>
                <tbody>
                  {yuklanmoqda ? (
                    <tr><td colSpan={6}><div className="skel h-24 rounded" /></td></tr>
                  ) : filteredTolovlar.map((x) => (
                    <tr key={x.id}>
                      <td className="fz-c-shifr">#{x.id.toString().padStart(4, '0')}</td>
                      <td className="whitespace-nowrap">{x.sana}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5"><Building2 size={13} className="text-text-mute" />{t('Shartnoma № {id}', { id: x.shartnoma_id })}</span>
                        <span className="mt-0.5 block"><span className="fz-chip">{t(TUR_NOM[x.tur] ?? x.tur)}</span></span>
                      </td>
                      <td className="max-w-[260px] truncate text-text-dim" title={x.izoh || ''}>{x.izoh || '—'}</td>
                      <td className={`fz-c-num font-semibold ${x.summa > 0 ? 'text-ok' : 'text-danger'}`}>
                        <FmtN val={Math.abs(x.summa)} /><small className="ml-1 text-[10.5px] font-medium opacity-80">{x.summa > 0 ? t('kirim') : t('chiqim')}</small>
                      </td>
                      <td><span className={`fz-stamp ${x.holat === 'faol' ? 'fz-stamp--ok' : 'fz-stamp--danger'}`}>{x.holat === 'faol' ? t('faol') : t('bekor')}</span></td>
                    </tr>
                  ))}
                  {!yuklanmoqda && filteredTolovlar.length === 0 && <OpsBoshQator ustun={6} matn={t('Hech qanday to‘lov yozuvi topilmadi.')} izoh={t('To‘lovlar «Shartnomalar» bo‘limida shartnomaga bog‘lab kiritiladi.')} />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === '1c' && (
          <section className="fz-note fz-note--info"><RefreshCcw /><span><b>{t('1C:Buxgalteriya ko‘prigi')}</b>{' — '}{t('to‘lovlar, F2 aktlar va EHF larni 1C bazasi bilan ikki tomonlama sinxronlash. Hozircha ishlab chiqilmoqda.')}</span></section>
        )}
        {(activeTab === 'kassa' || activeTab === 'cashflow') && (
          <section className="fz-note"><BarChart3 /><span>{t('Bu bo‘lim keyingi bosqichda ishga tushiriladi. Hozircha to‘lovlar reestridan foydalaning.')}</span></section>
        )}
      </div>
    </Sahifa>
  );
}
