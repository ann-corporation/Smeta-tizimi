import type { ReactNode } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { sbT2TolovlarOl, sbT2BuxDashboardOl, type Tolov } from '../api/t2-buxgalteriya';
import { sbT2ShartnomalarOl, type Shartnoma } from '../api/t2-shartnoma';
import { TolovForma } from '../components/moliya/TolovForma';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'framer-motion';
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

/** Navigatsiya oqimi (2026-11-11): «keyingi bosqichda ulanadi» deb turgan tablar (Bank va kassa, Cashflow, 1C) foydalanuvchiga ko'rsatilmaydi.
 *  Kod saqlanadi: bo'lim tayyor bo'lganda id ni shu ro'yxatga qo'shing. */
const TAYYOR_TABLAR = ['reestr'] as const;

export default function TestTolov() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;

  const [activeTab, setActiveTab] = useState<Tab>('reestr');
  /* null = hali o'qilmagan / o'qilmadi: «0.00» ko'rsatilmaydi (0 haqiqiy qiymat, noma'lum emas) — «—» chiqadi. */
  const [dashboard, setDashboard] = useState<{ bajarilgan: number; tolangan: number; debitor: number; avans: number } | null>(null);
  const [shartnomalar, setShartnomalar] = useState<Shartnoma[]>([]);
  const [formOchiq, setFormOchiq] = useState(false);
  const [yangilash, setYangilash] = useState(0);
  const [tolovlar, setTolovlar] = useState<Tolov[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toifa, setToifa] = useState<Toifa>('barchasi');

  useEffect(() => {
    if (!aktKomp) return;
    setYuklanmoqda(true);
    void Promise.all([sbT2BuxDashboardOl(aktKomp), sbT2TolovlarOl(), sbT2ShartnomalarOl(aktKomp, false)]).then(([dashRes, tolovRes, shRes]) => {
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
        setDashboard(null);
      }
      // sbT2TolovlarOl barcha to'lovlarni berishi mumkin — joriy kompaniya bo'yicha ajratiladi.
      setTolovlar(tolovRes.ok && tolovRes.qatorlar ? tolovRes.qatorlar.filter((x) => x.kompaniya_id === aktKomp) : []);
      setShartnomalar(shRes.ok && shRes.qatorlar ? shRes.qatorlar.filter((x) => x.holat !== 'bekor') : []);
    });
  }, [aktKomp, yangilash]);

  const filteredTolovlar = tolovlar.filter((x) =>
    (x.izoh?.toLowerCase().includes(searchTerm.toLowerCase()) || x.shartnoma_id?.toString().includes(searchTerm))
    && (toifa === 'barchasi' || (toifa === 'kirim' ? x.summa > 0 : x.summa < 0)));
  const oqim = useMemo(() => tolovOqimi(tolovlar), [tolovlar]);
  const raqamlar = useMemo(() => new Map(shartnomalar.map((s) => [s.id, s.raqam])), [shartnomalar]);
  /* KPI: o'qilmagan bo'lsa «—» (yuklanayotganda skelet), 0 bilan aralashtirilmaydi. */
  const kpi = (v: number | undefined) => (yuklanmoqda && !dashboard ? <span className="skel inline-block h-5 w-20 rounded" aria-busy="true" /> : v == null ? <span className="text-text-mute">—</span> : <FmtN val={v} />);
  // To'lov yozuvi umuman yo'q (hali kiritilmagan) — «to'langan 0, qarz = butun F2» deb ko'rsatilmaydi: noma'lum (rahbar paneli bilan bir xil ta'rif).
  const tolovKiritilmagan = !yuklanmoqda && tolovlar.length === 0 && (dashboard?.tolangan ?? 0) === 0;
  const ulush = tolovKiritilmagan || !dashboard ? null : tolovUlushi(dashboard.bajarilgan, dashboard.tolangan);
  const kamHarakat = useReducedMotion();
  const nomKirim = t('kirim'), nomChiqim = t('chiqim'), nomSof = t('jamlangan qoldiq');
  /** To‘lov — haqiqiy pul harakati (ustamasiz, o‘zgartirilmaydi): oylik kirim/chiqim va jamlangan sof oqim. */
  const oyData = useMemo(() => { let c = 0; return oqim.oylar.map((o) => { c += o.kirim - o.chiqim; return { ...o, sof: c }; }); }, [oqim]);

  return (
    <Sahifa
      sarlavha="To‘lovlar va kassa"
      tavsif="Bajarilgan ish (F2) qanchasi to‘langan, kim qarzdor va oylar bo‘yicha pul oqimi."
      amallar={<>
        <button type="button" className="fz-btn fz-btn--ghost" title={t('Tez orada')}><FileSpreadsheet /> {t('Excel eksport')}</button>
        <button type="button" onClick={() => setFormOchiq(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Yangi to‘lov')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Moliya ko‘rsatkichlari')}>
          <OpsKpi nom={t('Bajarilgan (F2)')} rang="var(--info)" qiymat={kpi(dashboard?.bajarilgan)} ost={t('tasdiqlangan Forma-2 lar yig‘indisi, so‘m')} />
          <OpsKpi nom={t('To‘langan')} rang="var(--ok)" qiymat={tolovKiritilmagan ? <span className="text-text-mute" title={t('To‘lov hali kiritilmagan')}>—</span> : kpi(dashboard?.tolangan)}
            ost={tolovKiritilmagan ? <span>{t('to‘lov hali kiritilmagan')}</span> : <span className="flex items-center gap-2"><OpsChiziq ulush={ulush} rang="var(--ok)" /><span className="whitespace-nowrap">{ulush == null ? '—' : t('{f}% bajarilgandan', { f: Math.round(ulush * 100) })}</span></span>} />
          <OpsKpi nom={t('Qarzdorlik (bizga)')} rang="var(--danger)" qiymat={tolovKiritilmagan ? <span className="text-text-mute">—</span> : <span className={(dashboard?.debitor ?? 0) > 0 ? 'text-danger' : ''}>{kpi(dashboard?.debitor)}</span>} ost={tolovKiritilmagan ? t('to‘lov kiritilmaguncha hisoblanmaydi') : t('tasdiqlangan F2, lekin to‘lanmagan')} />
          <OpsKpi nom={t('Avans')} rang="var(--warn)" qiymat={tolovKiritilmagan ? <span className="text-text-mute">—</span> : kpi(dashboard?.avans)} ost={t('oldindan to‘lovlar')} />
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
            <div role="img" aria-label={t('Pul oqimi oylar bo‘yicha')} style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={oyData} margin={{ top: 6, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="oy" tick={{ fill: 'var(--text-mute)', fontSize: 11 }} stroke="var(--border)" />
                  <YAxis tick={{ fill: 'var(--text-mute)', fontSize: 11 }} stroke="var(--border)" width={56} tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6)} ${t('mln')}` : String(v))} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
                    formatter={(v) => Number(v ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} />
                  <Bar dataKey="kirim" name={nomKirim} fill="var(--ok)" radius={[3, 3, 0, 0]} isAnimationActive={!kamHarakat} animationDuration={700} />
                  <Bar dataKey="chiqim" name={nomChiqim} fill="var(--danger)" radius={[3, 3, 0, 0]} isAnimationActive={!kamHarakat} animationDuration={700} />
                  <Line dataKey="sof" name={nomSof} type="monotone" stroke="var(--info)" strokeWidth={2} dot={{ r: 2.5, fill: 'var(--info)' }} isAnimationActive={!kamHarakat} animationDuration={900} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {TAYYOR_TABLAR.length > 1 && <OpsTablar<Tab> yorliq={t('Moliya bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'reestr', nom: t('To‘lovlar reestri'), ikon: <CreditCard />, soni: tolovlar.length },
          { id: 'kassa', nom: t('Bank va kassa'), ikon: <Banknote /> },
          { id: 'cashflow', nom: t('Cashflow (prognoz)'), ikon: <BarChart3 /> },
          { id: '1c', nom: t('1C sinxron'), ikon: <RefreshCcw /> },
        ].filter((x) => (TAYYOR_TABLAR as readonly string[]).includes(x.id)) as Array<{ id: Tab; nom: string; ikon: ReactNode; soni?: number }>} />}

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
                        <span className="inline-flex items-center gap-1.5"><Building2 size={13} className="text-text-mute" />{t('Shartnoma № {id}', { id: raqamlar.get(x.shartnoma_id) ?? x.shartnoma_id })}</span>
                        <span className="mt-0.5 block"><span className="fz-chip">{t(TUR_NOM[x.tur] ?? x.tur)}</span></span>
                      </td>
                      <td className="max-w-[260px] truncate text-text-dim" title={x.izoh || ''}>{x.izoh || '—'}</td>
                      <td className={`fz-c-num font-semibold ${x.summa > 0 ? 'text-ok' : 'text-danger'}`}>
                        <FmtN val={Math.abs(x.summa)} /><small className="ml-1 text-[10.5px] font-medium opacity-80">{x.summa > 0 ? t('kirim') : t('chiqim')}</small>
                      </td>
                      <td><span className={`fz-stamp ${x.holat === 'faol' ? 'fz-stamp--ok' : 'fz-stamp--danger'}`}>{x.holat === 'faol' ? t('faol') : t('bekor')}</span></td>
                    </tr>
                  ))}
                  {!yuklanmoqda && filteredTolovlar.length === 0 && <OpsBoshQator ustun={6} matn={t('Hech qanday to‘lov yozuvi topilmadi.')} izoh={t('«Yangi to‘lov» tugmasi bilan kiriting — to‘lov tanlangan shartnomaga bog‘lanadi.')} />}
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
      {formOchiq && <TolovForma kompaniyaId={aktKomp} shartnomalar={shartnomalar} yop={() => setFormOchiq(false)} onSaved={() => setYangilash((n) => n + 1)} />}
    </Sahifa>
  );
}
