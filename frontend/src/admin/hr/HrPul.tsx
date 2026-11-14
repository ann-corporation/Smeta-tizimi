import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Download, RefreshCw, RotateCcw, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { HrKpiBlok } from './HrKpiBlok';
import { hrOylikAmal, hrTuzatmaQaror, hrTuzatmaSaqla, type HrKpi, type HrKpiQator, type HrOy, type HrTuzatma, type HrXodimlarJavob } from '../../api/t2-hr';
import { OGOH_MATN, kpiJamlari, reyting, type ReytingMezon } from '../../lib/hr/hisob';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { yozNatija, type Qayta } from './umumiy';

const SABAB_NOMI: Record<string, string> = { nuqson: 'Nuqsonli ish', kechikish: 'Kechikish', xavfsizlik: 'Xavfsizlik buzilishi', ragbat: 'Rag‘batlantirish', boshqa: 'Boshqa' };
const HOLAT_NOMI: Record<string, string> = { qoralama: 'Tasdiq kutmoqda', tasdiqlangan: 'Tasdiqlangan', rad: 'Rad etilgan', bekor: 'Bekor' };
const num = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

export function HrTuzatmalar({ kid, oy, d, o, qayta }: { kid: number; oy: string; d: HrXodimlarJavob; o: HrOy; qayta: Qayta }) {
  const xodimlar = d.xodimlar.filter((x) => x.hr_bor);
  const nomi = (id: number) => d.xodimlar.find((x) => x.kadr_id === id)?.ism ?? `#${id}`;
  const [f, setF] = useState({ kadr: '', tur: 'jarima' as 'jarima' | 'bonus', sabab: 'nuqson', izoh: '', usul: 'summa' as 'summa' | 'foiz', qiymat: '', obyekt: '', akt: '', sifat: '', fayl: '' });
  const [qarorIzoh, setQarorIzoh] = useState('');

  const yarat = async () => {
    const v = num(f.qiymat);
    const r = await hrTuzatmaSaqla({
      kompaniyaId: kid, operationId: yangiOperationId(),
      tuzatma: {
        kadr_id: Number(f.kadr), oy, tur: f.tur, sabab: f.tur === 'bonus' && f.sabab === 'nuqson' ? 'ragbat' : f.sabab, izoh: f.izoh || null,
        summa: f.usul === 'summa' ? v : null, foiz: f.usul === 'foiz' ? v : null,
        obyekt_id: f.obyekt ? Number(f.obyekt) : null, akt_id: num(f.akt), sifat_id: num(f.sifat), fayl_id: f.fayl || null,
      },
    });
    if (yozNatija(r, 'Qoralama yaratildi (tasdiq kutmoqda)')) { setF({ ...f, izoh: '', qiymat: '', akt: '', sifat: '', fayl: '' }); await qayta(); }
  };
  const qaror = async (x: HrTuzatma, q: 'tasdiqlangan' | 'rad') => {
    const r = await hrTuzatmaQaror({ kompaniyaId: kid, id: x.id, qaror: q, izoh: qarorIzoh || null, kutilganVersiya: x.versiya, operationId: yangiOperationId() });
    if (yozNatija(r, q === 'tasdiqlangan' ? 'Tasdiqlandi' : 'Rad etildi')) await qayta();
  };
  const bekor = async (x: HrTuzatma) => {
    const r = await hrTuzatmaSaqla({ kompaniyaId: kid, kutilganVersiya: x.versiya, operationId: yangiOperationId(), tuzatma: { id: x.id, bekor: true } });
    if (yozNatija(r, 'Bekor qilindi')) await qayta();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-surface p-3">
        <h3 className="mb-1 text-[14px] font-semibold text-text">{t('Jarima yoki bonus kiritish')}</h3>
        <p className="mb-2 text-[12px] text-text-mute">{t('Yozuv qoralama bo‘lib tushadi; ish haqiga faqat ish haqi huquqiga ega shaxs tasdiqlagandan keyin kiradi.')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Xodim')}
            <select className="input h-8 px-2 text-[13px]" value={f.kadr} onChange={(e) => setF({ ...f, kadr: e.target.value })}><option value="">{t('— xodim —')}</option>{xodimlar.map((x) => <option key={x.kadr_id} value={x.kadr_id}>{x.ism}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Turi')}
            <select className="input h-8 px-2 text-[13px]" value={f.tur} onChange={(e) => setF({ ...f, tur: e.target.value === 'bonus' ? 'bonus' : 'jarima', sabab: e.target.value === 'bonus' ? 'ragbat' : 'nuqson' })}><option value="jarima">{t('Jarima')}</option><option value="bonus">{t('Bonus')}</option></select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Sabab')}
            <select className="input h-8 px-2 text-[13px]" value={f.sabab} onChange={(e) => setF({ ...f, sabab: e.target.value })}>
              {(f.tur === 'jarima' ? ['nuqson', 'kechikish', 'xavfsizlik', 'boshqa'] : ['ragbat', 'boshqa']).map((k) => <option key={k} value={k}>{t(SABAB_NOMI[k])}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Obyekt (ixtiyoriy)')}
            <select className="input h-8 px-2 text-[13px]" value={f.obyekt} onChange={(e) => setF({ ...f, obyekt: e.target.value })}><option value="">{t('— yo‘q —')}</option>{d.obyektlar.map((ob) => <option key={ob.id} value={ob.id}>{ob.nom}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Miqdor usuli')}
            <select className="input h-8 px-2 text-[13px]" value={f.usul} onChange={(e) => setF({ ...f, usul: e.target.value === 'foiz' ? 'foiz' : 'summa' })}><option value="summa">{t('Summa (so‘m)')}</option><option value="foiz">{t('Bazadan foiz (%)')}</option></select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{f.usul === 'summa' ? t('Summa (so‘m)') : t('Foiz (%)')}
            {f.usul === 'summa' ? <MoneyInput inputMode="decimal" value={f.qiymat} onValueChange={(v) => setF({ ...f, qiymat: v })} className="input h-8 px-2 text-[13px]" />
              : <input className="input h-8 px-2 text-[13px]" inputMode="decimal" value={f.qiymat} onChange={(e) => setF({ ...f, qiymat: e.target.value })} />}</label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('F2 akt ID (ixtiyoriy)')}<input className="input h-8 px-2 text-[13px]" inputMode="numeric" value={f.akt} onChange={(e) => setF({ ...f, akt: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Sifat nazorati ID (ixtiyoriy)')}<input className="input h-8 px-2 text-[13px]" inputMode="numeric" value={f.sifat} onChange={(e) => setF({ ...f, sifat: e.target.value })} /></label>
        </div>
        <label className="mt-2 flex flex-col gap-1 text-[12px] text-text-mute">{f.tur === 'jarima' ? t('Sabab tavsifi (majburiy)') : t('Izoh')}
          <input className="input h-8 px-2 text-[13px]" value={f.izoh} onChange={(e) => setF({ ...f, izoh: e.target.value })} /></label>
        <label className="mt-2 flex flex-col gap-1 text-[12px] text-text-mute">{t('Dalil fayli (hujjat identifikatori, ixtiyoriy)')}
          <input className="input h-8 px-2 text-[13px]" value={f.fayl} onChange={(e) => setF({ ...f, fayl: e.target.value })} /></label>
        <button type="button" className="fz-btn fz-btn--primary mt-3" disabled={!f.kadr || !f.qiymat || (f.tur === 'jarima' && !f.izoh.trim())} onClick={() => void yarat()}>{t('Qoralama yaratish')}</button>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2"><h3 className="text-[14px] font-semibold text-text">{t('Shu oydagi jarima va bonuslar')}</h3>
          <input className="input h-8 w-64 px-2 text-[13px]" value={qarorIzoh} onChange={(e) => setQarorIzoh(e.target.value)} placeholder={t('Qaror izohi (ixtiyoriy)')} aria-label={t('Qaror izohi')} /></div>
        <div className="fz-table-wrap">
          <table className="fz-table whitespace-nowrap">
            <thead><tr><th>{t('Xodim')}</th><th>{t('Turi')}</th><th>{t('Sabab')}</th><th className="fz-c-num">{t('Miqdor')}</th><th>{t('Izoh')}</th><th>{t('Holat')}</th><th aria-label={t('Amal')} /></tr></thead>
            <tbody>
              {o.tuzatmalar.map((x) => (
                <tr key={x.id}>
                  <td>{nomi(x.kadr_id)}</td><td>{x.tur === 'jarima' ? t('Jarima') : t('Bonus')}</td><td>{t(SABAB_NOMI[x.sabab] ?? x.sabab)}</td>
                  <td className="fz-c-num">{x.summa != null ? <FmtN val={x.summa} /> : `${x.foiz}%`}</td>
                  <td className="max-w-[260px] truncate" title={x.izoh ?? ''}>{x.izoh ?? ''}{x.akt_id ? ` · F2 #${x.akt_id}` : ''}{x.sifat_id ? ` · ${t('sifat')} #${x.sifat_id}` : ''}</td>
                  <td>{t(HOLAT_NOMI[x.holat] ?? x.holat)}</td>
                  <td className="flex gap-1">
                    {x.holat === 'qoralama' && <>
                      <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void qaror(x, 'tasdiqlangan')}><Check size={13} /> {t('Tasdiqlash')}</button>
                      <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void qaror(x, 'rad')}><X size={13} /> {t('Rad etish')}</button></>}
                    {(x.holat === 'qoralama' || x.holat === 'tasdiqlangan') && <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void bekor(x)}>{t('Bekor qilish')}</button>}
                  </td>
                </tr>
              ))}
              {o.tuzatmalar.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-dim">{t('Bu oyda jarima yoki bonus yo‘q.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Ogoh({ q }: { q: HrKpiQator }) {
  if (!q.ogohlantirish.length) return null;
  return <div className="flex flex-wrap gap-1">{q.ogohlantirish.map((k) => <span key={k} className="fz-chip" style={{ color: 'var(--warn)' }}>{t(OGOH_MATN[k] ?? k)}</span>)}</div>;
}

export function HrIshHaqi({ kid, oy, kompaniyaNom, kpi, qayta }: { kid: number; oy: string; kompaniyaNom: string; kpi: HrKpi; qayta: Qayta }) {
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [band, setBand] = useState(false);
  const jami = useMemo(() => kpiJamlari(kpi.qatorlar), [kpi.qatorlar]);
  const holat = (id: number) => kpi.saqlangan.find((x) => x.kadr_id === id);
  const tasdiqlanganSoni = kpi.saqlangan.filter((x) => x.holat === 'tasdiqlangan').length;

  const amal = async (a: 'hisobla' | 'tasdiqla' | 'qaytar') => {
    setBand(true);
    const r = await hrOylikAmal({ kompaniyaId: kid, oy, amal: a, operationId: yangiOperationId() });
    setBand(false);
    if (yozNatija(r, a === 'hisobla' ? 'Qoralama hisoblandi' : a === 'tasdiqla' ? 'Tasdiqlandi' : 'Qoralamaga qaytarildi')) {
      if (r.rad_etilgan?.length) toast(t('{n} xodim tasdiqlanmadi (hisob to‘liq emas yoki provodka yozilgan)', { n: r.rad_etilgan.length }), 'warn', undefined, 8000);
      await qayta();
    }
  };
  const eksport = async () => {
    setBand(true);
    try {
      const { ishHaqiVedomosti } = await import('../../lib/hr/eksport');
      const x = await ishHaqiVedomosti(kpi.qatorlar, { kompaniya: kompaniyaNom, oy, tasdiqlangan: tasdiqlanganSoni > 0 && tasdiqlanganSoni === kpi.qatorlar.length });
      const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes: x.bytes, hujjat: 'ISH_HAQI_VEDOMOST', sabab: `Ведомость начисления заработной платы · ${oy}` }, () => downloadBlob(x.bytes, x.faylNomi));
      toast(r.ok ? (r.xabar || t('Ведомость tayyor')) : r.xabar, r.ok ? 'ok' : 'danger');
    } catch { toast(t('Excel fayli tuzilmadi. Qayta urinib ko‘ring.'), 'danger'); }
    finally { setBand(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void amal('hisobla')}><RefreshCw size={14} /> {t('Hisoblash (qoralama)')}</button>
        <button type="button" className="fz-btn" disabled={band} onClick={() => void amal('tasdiqla')}><Check size={14} /> {t('Tasdiqlash')}</button>
        <button type="button" className="fz-btn" disabled={band || tasdiqlanganSoni === 0} onClick={() => void amal('qaytar')}><RotateCcw size={14} /> {t('Qaytarish')}</button>
        <button type="button" className="fz-btn" disabled={band || kpi.qatorlar.length === 0} onClick={() => void eksport()}><Download size={14} /> {t('Excel vedomost')}</button>
        <span className="text-[12px] text-text-mute">{t('Tasdiqlash faqat to‘liq (noma’lum qismsiz) hisob uchun. Buxgalteriya provodkasi keyingi bosqichda ulanadi.')}</span>
        <span className="basis-full text-[12px] text-text-mute" data-testid="naryad-qoida">{t('Donabay (naryad) puli naryad orqali alohida to‘langan: u ish haqiga qayta qo‘shilmaydi, naryad kunlari tabel bo‘yicha ikkinchi marta to‘lanmaydi.')}</span>
      </div>
      <div className="fz-table-wrap max-h-[62vh]">
        <table className="fz-table whitespace-nowrap">
          <thead><tr>
            <th aria-label={t('Tafsilot')} /><th>{t('F.I.O')}</th><th className="fz-c-num">{t('Norma')}</th><th className="fz-c-num">{t('Ishlagan')}</th><th className="fz-c-num">{t('Baza')}</th><th className="fz-c-num">{t('Donabay (naryad)')}</th>
            <th className="fz-c-num">{t('KPI (F2)')}</th><th className="fz-c-num">{t('Bonus')}</th><th className="fz-c-num">{t('Jarima')}</th><th className="fz-c-num">{t('Hisoblangan')}</th>
            <th className="fz-c-num">{t('NDFL')}</th><th className="fz-c-num">{t('INPS')}</th><th className="fz-c-num">{t('Qo‘lga')}</th><th>{t('Holat')}</th>
          </tr></thead>
          <tbody>
            {kpi.qatorlar.map((q) => {
              const h = holat(q.kadr_id); const och = ochiq === q.kadr_id;
              return (
                <Fragment key={q.kadr_id}>
                  <tr>
                    <td><button type="button" className="fz-btn fz-btn--ghost fz-btn--icon" onClick={() => setOchiq(och ? null : q.kadr_id)} aria-label={t('Tafsilot')}>{och ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                    <td><div className="font-medium text-text">{q.ism}</div><Ogoh q={q} /></td>
                    <td className="fz-c-num">{q.norma_kun}</td><td className="fz-c-num">{q.kun_ishlagan ?? '—'}</td>
                    <td className="fz-c-num"><FmtN val={q.baza} /></td><td className="fz-c-num"><FmtN val={q.naryad_summa ?? null} /></td><td className="fz-c-num"><FmtN val={q.kpi_f2} /></td>
                    <td className="fz-c-num"><FmtN val={q.bonus} /></td><td className="fz-c-num"><FmtN val={q.jarima} /></td>
                    <td className="fz-c-num font-semibold"><FmtN val={q.hisoblangan} /></td>
                    <td className="fz-c-num"><FmtN val={q.ndfl} /></td><td className="fz-c-num"><FmtN val={q.inps} /></td><td className="fz-c-num font-semibold"><FmtN val={q.sof} /></td>
                    <td>{h ? (h.holat === 'tasdiqlangan' ? t('Tasdiqlangan') : t('Qoralama')) : t('Hisoblanmagan')}</td>
                  </tr>
                  {och && (
                    <tr><td /><td colSpan={13}>
                      <div className="py-1 text-[12px] text-text-mute">
                        {q.sxema ? t('Sxema: {nom}, F2 bonus {foiz}% ({baza})', { nom: q.sxema, foiz: q.f2_foiz ?? '—', baza: q.f2_baza === 'ustamali' ? t('ustamali') : t('ustamasiz') }) : t('KPI sxemasi biriktirilmagan.')}
                        {' · '}{t('Tabel: keldi {k}, kelmadi {n}, otpusk {o}, kasal {b}, otgul {d}', { k: q.kun_ishlagan ?? '—', n: q.kun_kelmadi ?? '—', o: q.kun_otpusk ?? '—', b: q.kun_kasal ?? '—', d: q.kun_otgul ?? '—' })}
                      </div>
                      {q.aktlar.length > 0 && (
                        <table className="fz-table mb-2 whitespace-nowrap"><thead><tr><th>{t('F2 akt')}</th><th>{t('Obyekt')}</th><th>{t('Tasdiq sanasi')}</th><th className="fz-c-num">{t('Summa')}</th><th className="fz-c-num">{t('Ulush, %')}</th><th className="fz-c-num">{t('KPI')}</th></tr></thead>
                          <tbody>{q.aktlar.map((a) => <tr key={a.akt_id}><td>{a.raqam ?? `#${a.akt_id}`}</td><td>{a.obyekt}</td><td>{a.sana}</td><td className="fz-c-num"><FmtN val={a.summa} /></td><td className="fz-c-num">{a.ulush}</td><td className="fz-c-num"><FmtN val={a.kpi} /></td></tr>)}</tbody></table>)}
                      {q.naryad_kun ? <p className="mb-1 text-[12px] text-text-mute">{t('Naryad davriga tushgan {n} kun tabel bo‘yicha qayta to‘lanmadi.', { n: q.naryad_kun })}</p> : null}
                      <HrKpiBlok kpi={q.kpi} pulgaTasir={q.kpi_pulga_tasir} />
                      {q.tuzatmalar.length > 0 && <ul className="mb-1 text-[12px]">{q.tuzatmalar.map((x) => <li key={x.id}>{x.tur === 'jarima' ? t('Jarima') : t('Bonus')}: {t(SABAB_NOMI[x.sabab] ?? x.sabab)} — <FmtN val={x.summa} />{x.foiz != null ? ` (${x.foiz}%)` : ''} {x.izoh ?? ''}</li>)}</ul>}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {kpi.qatorlar.length === 0 && <tr><td colSpan={14} className="py-8 text-center text-text-dim">{t('HR kartasi to‘ldirilgan xodim yo‘q.')}</td></tr>}
            {kpi.qatorlar.length > 0 && (
              <tr className="font-semibold">
                <td /><td>{t('Jami')} ({jami.soni})</td><td /><td />
                <td className="fz-c-num"><FmtN val={jami.baza} /></td><td className="fz-c-num"><FmtN val={jami.naryad} /></td><td className="fz-c-num"><FmtN val={jami.kpi} /></td><td className="fz-c-num"><FmtN val={jami.bonus} /></td><td className="fz-c-num"><FmtN val={jami.jarima} /></td>
                <td className="fz-c-num"><FmtN val={jami.hisoblangan} /></td><td className="fz-c-num"><FmtN val={jami.ndfl} /></td><td className="fz-c-num"><FmtN val={jami.inps} /></td><td className="fz-c-num"><FmtN val={jami.sof} /></td>
                <td>{jami.nomalum_hisoblangan > 0 ? t('Noma’lum: {n}', { n: jami.nomalum_hisoblangan }) : ''}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HrPanel({ kpi }: { kpi: HrKpi }) {
  const [mezon, setMezon] = useState<ReytingMezon>('kpi');
  const jami = useMemo(() => kpiJamlari(kpi.qatorlar), [kpi.qatorlar]);
  const royxat = useMemo(() => reyting(kpi.qatorlar, mezon), [kpi.qatorlar, mezon]);
  const eng = Math.max(1, ...kpi.qatorlar.map((q) => Math.max(q.kpi_f2 ?? 0, q.jarima, q.bonus)));
  const Karta = ({ nom, val, rang }: { nom: string; val: number; rang?: string }) => (
    <div className="rounded-md border border-border bg-surface p-3"><div className="text-[11.5px] text-text-mute">{nom}</div><div className="text-[18px] font-semibold tabular-nums" style={{ color: rang }}><FmtN val={val} /></div></div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Karta nom={t('Tasdiqlangan F2 (biriktirilgan)')} val={jami.f2_summa} /><Karta nom={t('F2 KPI bonuslari')} val={jami.kpi} rang="var(--ok)" />
        <Karta nom={t('Qo‘lda bonuslar')} val={jami.bonus} rang="var(--ok)" /><Karta nom={t('Jarimalar')} val={jami.jarima} rang="var(--danger)" /><Karta nom={t('Hisoblangan jami')} val={jami.hisoblangan} />
      </div>
      {jami.toliq_emas > 0 && <div className="text-[12px] text-warn">{t('{n} xodimning hisobi to‘liq emas (noma’lum qismlar jamiga kirmagan).', { n: jami.toliq_emas })}</div>}
      <label className="flex items-center gap-2 text-[12px] text-text-mute">{t('Reyting mezoni')}
        <select className="input h-8 px-2 text-[13px]" value={mezon} onChange={(e) => setMezon(e.target.value as ReytingMezon)}>
          <option value="kpi">{t('F2 KPI bonusi')}</option><option value="f2">{t('F2 hajmi (summa)')}</option><option value="hisoblangan">{t('Hisoblangan ish haqi')}</option></select></label>
      <div className="fz-table-wrap">
        <table className="fz-table whitespace-nowrap">
          <thead><tr><th>#</th><th>{t('F.I.O')}</th><th>{t('Rol')}</th><th className="fz-c-num">{t('F2 hajmi')}</th><th className="fz-c-num">{t('F2 aktlar')}</th><th style={{ minWidth: 220 }}>{t('Bonus va jarima')}</th><th className="fz-c-num">{t('Hisoblangan')}</th></tr></thead>
          <tbody>
            {royxat.map((q, i) => (
              <tr key={q.kadr_id}>
                <td>{i + 1}</td><td className="font-medium text-text">{q.ism}</td><td>{q.rol}</td>
                <td className="fz-c-num"><FmtN val={q.f2_summa} /></td><td className="fz-c-num">{q.f2_soni}{q.f2_nomalum_soni > 0 ? ` (${q.f2_nomalum_soni}?)` : ''}</td>
                <td>
                  <div className="flex flex-col gap-0.5" title={`${t('KPI')}: ${q.kpi_f2 ?? '—'} · ${t('Bonus')}: ${q.bonus} · ${t('Jarima')}: ${q.jarima}`}>
                    <div className="h-2 rounded-sm" style={{ width: `${Math.round(((q.kpi_f2 ?? 0) + q.bonus) / eng * 100)}%`, background: 'var(--ok)', minWidth: (q.kpi_f2 ?? 0) + q.bonus > 0 ? 2 : 0 }} />
                    <div className="h-2 rounded-sm" style={{ width: `${Math.round(q.jarima / eng * 100)}%`, background: 'var(--danger)', minWidth: q.jarima > 0 ? 2 : 0 }} />
                  </div>
                </td>
                <td className="fz-c-num"><FmtN val={q.hisoblangan} /></td>
              </tr>
            ))}
            {royxat.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-dim">{t('Ma’lumot yo‘q.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
