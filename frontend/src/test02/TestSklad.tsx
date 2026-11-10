import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Box, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, QrCode, Building2, History, Layers, FileSpreadsheet, Plus, Warehouse } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { FmtN } from '../lib/format';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { sbT2ObyektlarOl, sbSkladQoldiqOl, type T2Obyekt, type T2SkladQoldiq } from '../api/supabase';
import { sbSkladlarOl, sbSkladYarat, type SkladMustaqil } from '../api/t2-resurs';
import { sbSkladKonsolidatsiyaOl, type SkladKonsolidatsiya } from '../api/t2-sklad-konsolidatsiya';
import { obyektUlushlari, skladXulosa } from '../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsKpi, OpsKpiQator, OpsMaydon, OpsQidiruv, OpsTablar } from '../components/kompaniya-ops/OpsUi';
import { PrixodKitobPreview } from '../components/ombor/PrixodKitobPreview';
import { KirimKunlikForm } from '../components/ombor/KirimKunlikForm';
import { KirimKunlikJurnal } from '../components/ombor/KirimKunlikJurnal';
import { OmborTanlov } from '../components/ombor/OmborTanlov';
import { MarkaziyBerdimForm } from '../components/ombor/MarkaziyBerdimForm';
import { OmborKirimJadval, OmborQoldiqJadval } from '../components/ombor/OmborKirimJadval';
import { kirimRuxsat } from '../lib/ombor-prixod/yozish';

/** Egasi (KOORDINATSIYA 2026-10-28): «Navoiy park.xlsx» → «Приход» shu omborda ko'rinsin. Avtomatik yaratilmaydi — tugma bilan. */
export const NAVOIY_SKLAD_NOMI = "NEW TIMES BUILDINGS MCHJ — Navoiy bog' skladi";
const NAVOIY_KOMPANIYA_ID = 123;

/**
 * Ombor (sklad) — qoldiq va kirim/chiqim yozuvi (egasi 2026-10-25: Firuza ko'rinishi).
 * Jamlangan ombor: har material bo'yicha jami qoldiq va uning obyektlar orasida taqsimoti (chiziq).
 * Obyekt qoldiqlari: manfiy qoldiq (kirim kiritilmagan chiqim) qizil bilan aniq belgilanadi.
 */
type Tab = 'ombor-kirim' | 'ombor-qoldiq' | 'qoldiq' | 'kirim' | 'm29' | 'konsolidatsiya';
const OBYEKT_RANGLARI = ['var(--kat-chel)', 'var(--kat-mat)', 'var(--kat-mash)', 'var(--kat-ob)', 'var(--accent)', 'var(--info)'];

export default function TestSklad() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;
  const kompaniyaRef = useRef(aktKomp); kompaniyaRef.current = aktKomp;
  const obyektRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('ombor-kirim');
  const ruxsat = kirimRuxsat(joriy?.permissions);
  const [excelOchiq, setExcelOchiq] = useState(false);
  const [berdimOchiq, setBerdimOchiq] = useState(false);
  const [kirimYangilash, setKirimYangilash] = useState(0);
  const [skladYaratilmoqda, setSkladYaratilmoqda] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [opType, setOpType] = useState<'kirim' | 'chiqim'>('kirim');

  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  obyektRef.current = obyektId;
  const [obyektlarYuklanmoqda, setObyektlarYuklanmoqda] = useState(false);
  const [harakatYangilash, setHarakatYangilash] = useState(0);
  const [skladQoldiq, setSkladQoldiq] = useState<T2SkladQoldiq[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [markaziySkladlar, setMarkaziySkladlar] = useState<SkladMustaqil[]>([]);
  const [markaziyId, setMarkaziyId] = useState<number | null>(null);
  const [konsQoldiqlar, setKonsQoldiqlar] = useState<SkladKonsolidatsiya[]>([]);

  useEffect(() => {
    let active = true;
    const kompaniya = aktKomp;
    // Boshqa kompaniyaning obyekti/qoldig'i yangi kompaniyada ko'rinib qolmasin.
    setObyektlar([]); setObyektId(null); setSkladQoldiq([]); setObyektlarYuklanmoqda(kompaniya > 0);
    if (!kompaniya) return () => { active = false; };
    void sbT2ObyektlarOl(kompaniya).then((r) => {
      if (!active || kompaniyaRef.current !== kompaniya) return;
      const qatorlar = r.ok && r.qatorlar ? r.qatorlar.filter((o) => o.kompaniya_id === kompaniya) : [];
      setObyektlar(qatorlar);
      if (qatorlar.length > 0) setObyektId(qatorlar[0].id);
      setObyektlarYuklanmoqda(false);
    }).catch(() => { if (active && kompaniyaRef.current === kompaniya) setObyektlarYuklanmoqda(false); });
    skladlarniYukla();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktKomp]);

  const tanlanganObyekt = obyektlar.find((o) => o.id === obyektId && o.kompaniya_id === aktKomp) ?? null;

  function skladlarniYukla(tanla?: string) {
    void sbSkladlarOl(aktKomp).then((r) => {
      if (r.ok && r.qatorlar) {
        setMarkaziySkladlar(r.qatorlar);
        const nomli = tanla ? r.qatorlar.find((s) => s.nomi === tanla) : undefined;
        const navoiy = r.qatorlar.find((s) => s.nomi === NAVOIY_SKLAD_NOMI);
        if (nomli) setMarkaziyId(nomli.id);
        else if (!markaziyId || !r.qatorlar.some((s) => s.id === markaziyId)) setMarkaziyId((navoiy ?? r.qatorlar[0])?.id ?? null);
      }
    });
  }

  const navoiySkladYoq = aktKomp === NAVOIY_KOMPANIYA_ID && !markaziySkladlar.some((s) => s.nomi === NAVOIY_SKLAD_NOMI);
  const navoiySkladYarat = async () => {
    setSkladYaratilmoqda(true);
    const r = await sbSkladYarat({ kompaniyaId: aktKomp, nomi: NAVOIY_SKLAD_NOMI });
    setSkladYaratilmoqda(false);
    if (r.ok) { toast(t('Ombor yaratildi.'), 'ok'); skladlarniYukla(NAVOIY_SKLAD_NOMI); }
    else toast(t('Xato yuz berdi: {x}', { x: r.error ?? '' }), 'danger');
  };
  const tanlanganSklad = markaziySkladlar.find((s) => s.id === markaziyId) ?? null;

  useEffect(() => {
    if (activeTab === 'konsolidatsiya' && markaziyId) {
      setYuklanmoqda(true);
      void sbSkladKonsolidatsiyaOl(markaziyId).then((r) => {
        if (r.ok && r.qatorlar) setKonsQoldiqlar(r.qatorlar as SkladKonsolidatsiya[]);
        setYuklanmoqda(false);
      });
    }
  }, [activeTab, markaziyId]);

  useEffect(() => {
    let active = true;
    const company = aktKomp; const object = tanlanganObyekt;
    setSkladQoldiq([]);
    if (!object || company <= 0) { setYuklanmoqda(false); return () => { active = false; }; }
    setYuklanmoqda(true);
    void sbSkladQoldiqOl(object.id).then((r) => {
      if (!active || kompaniyaRef.current !== company || obyektRef.current !== object.id) return;
      setYuklanmoqda(false);
      setSkladQoldiq(r.ok && r.qatorlar ? r.qatorlar : []);
    });
    return () => { active = false; };
  }, [aktKomp, tanlanganObyekt, harakatYangilash]);

  const filteredQoldiq = skladQoldiq.filter((item) => item.nomi.toLowerCase().includes(searchTerm.toLowerCase()));
  const xulosa = useMemo(() => skladXulosa(skladQoldiq), [skladQoldiq]);
  const obyektRangi = useMemo(() => {
    const m = new Map<number, string>();
    for (const k of konsQoldiqlar) for (const o of k.obyektlar_boyicha ?? []) if (!m.has(o.obyekt_id)) m.set(o.obyekt_id, OBYEKT_RANGLARI[m.size % OBYEKT_RANGLARI.length]);
    return m;
  }, [konsQoldiqlar]);
  const ochOyna = (tur: 'kirim' | 'chiqim') => { if (!tanlanganObyekt) return; setOpType(tur); setIsFormOpen(true); };

  return (
    <Sahifa
      sarlavha="Ombor (sklad): qoldiq va harakatlar"
      tavsif="Kirim — omborga keldi, chiqim — obyektga sarflandi. Qoldiq = kirim − chiqim; manfiy qoldiq — kirim kiritilmagan."
      amallar={<>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-text-dim">
          <Building2 size={15} className="text-text-mute" />
          <OmborTanlov label={t('Obyekt')} value={tanlanganObyekt ? String(tanlanganObyekt.id) : ''} disabled={!aktKomp || obyektlarYuklanmoqda}
            options={obyektlar.map((o) => ({ value: String(o.id), label: o.nom }))} onChange={(v) => setObyektId(Number(v))} />
        </label>
        <button type="button" disabled={!tanlanganObyekt} onClick={() => ochOyna('chiqim')} className="fz-btn min-h-[48px] disabled:opacity-50"><ArrowUpFromLine /> {t('BERDIM — ombordan chiqim')}</button>
        <button type="button" disabled={!tanlanganObyekt} onClick={() => ochOyna('kirim')} className="fz-btn fz-btn--primary min-h-[48px] disabled:opacity-50"><ArrowDownToLine /> {t('KELDI — omborga kirim')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Ombor ko‘rsatkichlari')}>
          <OpsKpi nom={t('Pozitsiyalar (tanlangan obyekt)')} qiymat={xulosa.pozitsiya} />
          <OpsKpi nom={t('Manfiy qoldiq')} rang="var(--danger)" qiymat={<span className={xulosa.manfiy ? 'text-danger' : ''}>{xulosa.manfiy}</span>} ost={t('chiqim bor, kirim yo‘q — tekshiring')} />
          <OpsKpi nom={t('Tugagan (0)')} rang="var(--warn)" qiymat={xulosa.nol} />
          <OpsKpi nom={t('Oxirgi harakat')} qiymat={<span className="text-[15px]">{xulosa.oxirgi ?? '—'}</span>} />
        </OpsKpiQator>

        <OpsTablar<Tab> yorliq={t('Ombor bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'ombor-kirim', nom: t('Kirim'), ikon: <ArrowDownToLine /> },
          { id: 'ombor-qoldiq', nom: t('Qoldiq'), ikon: <Warehouse /> },
          { id: 'konsolidatsiya', nom: t('Jamlangan ombor'), ikon: <Layers /> },
          { id: 'qoldiq', nom: t('Obyekt qoldiqlari'), ikon: <Box />, soni: skladQoldiq.length },
          { id: 'kirim', nom: t('Harakatlar tarixi'), ikon: <History /> },
          { id: 'm29', nom: t('M-29 hisobot'), ikon: <ClipboardCheck /> },
        ]} />

        {(activeTab === 'ombor-kirim' || activeTab === 'ombor-qoldiq') && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <OpsMaydon nom={t('Ombor')}>
                <select aria-label={t('Ombor')} value={markaziyId ?? ''} onChange={(e) => { setMarkaziyId(e.target.value ? Number(e.target.value) : null); setExcelOchiq(false); }}
                  className="min-h-[48px] w-full sm:max-w-md">
                  <option value="">{t('— tanlang —')}</option>
                  {markaziySkladlar.map((s) => <option key={s.id} value={s.id}>{s.nomi}</option>)}
                </select>
              </OpsMaydon>
              {navoiySkladYoq && ruxsat.yozish && <button type="button" className="fz-btn min-h-[48px] justify-center" disabled={skladYaratilmoqda} onClick={() => void navoiySkladYarat()}>
                <Plus size={16} aria-hidden="true" />{t('«{nom}» omborini yaratish', { nom: NAVOIY_SKLAD_NOMI })}</button>}
              {activeTab === 'ombor-kirim' && tanlanganSklad && ruxsat.yozish && <button type="button" className={`fz-btn ${excelOchiq ? '' : 'fz-btn--primary'} min-h-[56px] justify-center text-[15px] font-semibold`}
                aria-expanded={excelOchiq} onClick={() => setExcelOchiq((v) => !v)}>
                <FileSpreadsheet size={18} aria-hidden="true" />{excelOchiq ? t('Yuklashni yopish') : t('Excel’dan yuklash')}</button>}
              {tanlanganSklad && ruxsat.yozish && <button type="button" className="fz-btn min-h-[56px] justify-center text-[15px] font-semibold" disabled={obyektlar.length === 0}
                onClick={() => setBerdimOchiq(true)}><ArrowUpFromLine size={18} aria-hidden="true" />{t('Berdim → obyekt')}</button>}
            </div>
            {!ruxsat.korish && <p className="m-0 text-[12px] text-warn">{t('Omborni ko‘rish uchun «Hujjatlarni ko‘rish» huquqi kerak.')}</p>}
            {!tanlanganSklad && <div className="rounded-md border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-[13px] text-text-mute">
              {markaziySkladlar.length ? t('Omborni tanlang.') : t('Bu kompaniyada hali ombor yo‘q.')}</div>}
            {tanlanganSklad && activeTab === 'ombor-kirim' && excelOchiq && ruxsat.yozish && <PrixodKitobPreview kompaniyaId={aktKomp} skladId={tanlanganSklad.id}
              skladNomi={tanlanganSklad.nomi} yozishMumkin={ruxsat.yozish} onYozildi={() => setKirimYangilash((n) => n + 1)} />}
            {tanlanganSklad && ruxsat.korish && activeTab === 'ombor-kirim' && <OmborKirimJadval kompaniyaId={aktKomp} skladId={tanlanganSklad.id} yozishMumkin={ruxsat.yozish} yangilash={kirimYangilash} />}
            {tanlanganSklad && berdimOchiq && ruxsat.yozish && <MarkaziyBerdimForm key={`${aktKomp}:${tanlanganSklad.id}`} kompaniyaId={aktKomp} skladId={tanlanganSklad.id}
              skladNomi={tanlanganSklad.nomi} obyektlar={obyektlar} boshObyektId={tanlanganObyekt?.id ?? null} onYop={() => setBerdimOchiq(false)}
              onYozildi={() => { setBerdimOchiq(false); setKirimYangilash((n) => n + 1); setHarakatYangilash((n) => n + 1); toast(t('Obyektga berildi — obyekt qoldigʻiga tushdi.'), 'ok'); }} />}
            {tanlanganSklad && ruxsat.korish && activeTab === 'ombor-qoldiq' && <OmborQoldiqJadval kompaniyaId={aktKomp} skladId={tanlanganSklad.id} yangilash={kirimYangilash} />}
          </div>
        )}

        {activeTab === 'konsolidatsiya' && (
          <div className="flex flex-col gap-3">
            <OpsMaydon nom={t('Markaziy sklad')}>
              <select value={markaziyId || ''} onChange={(e) => setMarkaziyId(Number(e.target.value))} className="max-w-sm">
                <option value="">{t('— tanlang —')}</option>
                {markaziySkladlar.map((s) => <option key={s.id} value={s.id}>{s.nomi} {s.manzil ? `(${s.manzil})` : ''}</option>)}
              </select>
            </OpsMaydon>
            {yuklanmoqda ? <div className="skel h-40 rounded-xl" /> : (
              <div className="fz-table-wrap">
                <table className="fz-table">
                  <thead>
                    <tr>
                      <th>{t('Material')}</th>
                      <th className="fz-c-num">{t('Jami qoldiq')}</th>
                      <th style={{ width: '45%' }}>{t('Obyektlar bo‘yicha taqsimot')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {konsQoldiqlar.length === 0 && <OpsBoshQator ustun={3} matn={t('Ushbu markaziy sklad va unga bog‘langan obyektlarda qoldiq yo‘q.')} />}
                    {konsQoldiqlar.map((kq, i) => {
                      const ul = obyektUlushlari(kq.obyektlar_boyicha ?? []);
                      return (
                        <tr key={i}>
                          <td className="font-medium text-text">{kq.material_nomi}</td>
                          <td className={`fz-c-num font-semibold ${kq.jami_qoldiq < 0 ? 'text-danger' : ''}`}><FmtN val={kq.jami_qoldiq} /> <span className="text-[11px] font-normal text-text-mute">{kq.birligi}</span></td>
                          <td>
                            <div className="fz-split mb-1.5" role="img" aria-label={ul.map((o) => `${o.obyekt_nom}: ${o.qoldiq}`).join(', ')}>
                              {ul.filter((o) => o.ulush > 0).map((o) => <i key={o.obyekt_id} style={{ background: obyektRangi.get(o.obyekt_id), flexGrow: o.ulush }} title={`${o.obyekt_nom}: ${o.qoldiq}`} />)}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
                              {ul.map((o) => (
                                <span key={o.obyekt_id} className="inline-flex items-center gap-1">
                                  <i className="inline-block h-2 w-2 rounded-sm" style={{ background: obyektRangi.get(o.obyekt_id) }} />
                                  <span className="max-w-[140px] truncate text-text-dim">{o.obyekt_nom}</span>
                                  <b className={`tabular-nums ${o.manfiy ? 'text-danger' : 'text-text'}`}><FmtN val={o.qoldiq} /></b>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'qoldiq' && (
          <div className="flex flex-col gap-2">
            <OpsQidiruv qiymat={searchTerm} onChange={setSearchTerm} placeholder={t('Material nomi bo‘yicha…')} />
            {yuklanmoqda ? <div className="skel h-40 rounded-xl" /> : (
              <div className="fz-table-wrap">
                <table className="fz-table">
                  <thead>
                    <tr><th>{t('ID')}</th><th>{t('Material')}</th><th className="fz-c-num">{t('Qoldiq')}</th><th>{t('Holat')}</th><th>{t('Oxirgi harakat')}</th><th className="text-center">{t('QR pasport')}</th></tr>
                  </thead>
                  <tbody>
                    {filteredQoldiq.map((item) => (
                      <tr key={item.id}>
                        <td className="fz-c-shifr">#{item.id.toString().padStart(4, '0')}</td>
                        <td className="font-medium text-text"><span className="inline-flex items-center gap-2"><Box size={14} className="text-text-mute" />{item.nomi}</span></td>
                        <td className={`fz-c-num font-semibold ${item.qoldiq < 0 ? 'text-danger' : ''}`}><FmtN val={item.qoldiq} /> <span className="text-[11px] font-normal text-text-mute">{item.birligi}</span></td>
                        <td>
                          {item.qoldiq < 0 ? <span className="fz-stamp fz-stamp--danger">{t('manfiy')}</span>
                            : item.qoldiq === 0 ? <span className="fz-stamp fz-stamp--warn">{t('tugagan')}</span>
                              : <span className="fz-stamp fz-stamp--ok">{t('bor')}</span>}
                        </td>
                        <td className="text-[12px] text-text-mute">{item.oxirgi_harakat || '—'}</td>
                        <td className="text-center">
                          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('QR pasport')} title={t('QR pasport')}><QrCode /></button>
                        </td>
                      </tr>
                    ))}
                    {filteredQoldiq.length === 0 && <OpsBoshQator ustun={6} matn={t('Omborda qoldiq mavjud emas yoki topilmadi.')} izoh={t('Kirim tugmasi bilan omborga material kiriting.')} />}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'm29' && (
          <section className="fz-note fz-note--info">
            <ClipboardCheck />
            <span>
              <b>{t('M-29: norma ↔ fakt sarf hisoboti')}</b>{' — '}{t('tasdiqlangan F2 normasi va ombor chiqimi alohida sahifada solishtiriladi.')}{' '}
              <Link to="/admin/m29" className="font-semibold underline">{t('M-29 sahifasini ochish')}</Link>
            </span>
          </section>
        )}

        {activeTab === 'kirim' && <KirimKunlikJurnal kompaniyaId={aktKomp} obyektId={tanlanganObyekt?.id ?? null} obyektNomi={tanlanganObyekt?.nom} yangilashKaliti={harakatYangilash} />}
      </div>

      {isFormOpen && <KirimKunlikForm key={`${aktKomp}:${tanlanganObyekt?.id ?? 0}:${opType}`} kompaniyaId={aktKomp} obyekt={tanlanganObyekt}
        amal={opType === 'kirim' ? 'prixod' : 'rasxod'} onYop={() => setIsFormOpen(false)}
        onYozildi={({ kompaniyaId, obyektId: yozilganObyekt }) => {
          if (kompaniyaRef.current !== kompaniyaId || obyektRef.current !== yozilganObyekt) return;
          setIsFormOpen(false); setHarakatYangilash((n) => n + 1);
          toast(t('Ombor harakati yozildi.'), 'ok');
        }} />}
    </Sahifa>
  );
}
