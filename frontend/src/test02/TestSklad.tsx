import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, ArrowDownToLine, ArrowUpFromLine, Barcode, ClipboardCheck, QrCode, Building2, History, Layers } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { FmtN } from '../lib/format';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { sbT2ObyektlarOl, sbSkladQoldiqOl, sbSkladgaYozish, type T2Obyekt, type T2SkladQoldiq } from '../api/supabase';
import { sbSkladlarOl } from '../api/t2-resurs';
import { sbSkladKonsolidatsiyaOl, type SkladKonsolidatsiya } from '../api/t2-sklad-konsolidatsiya';
import { obyektUlushlari, skladXulosa } from '../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsKpi, OpsKpiQator, OpsMaydon, OpsOyna, OpsQidiruv, OpsTablar } from '../components/kompaniya-ops/OpsUi';

/**
 * Ombor (sklad) — qoldiq va kirim/chiqim yozuvi (egasi 2026-10-25: Firuza ko'rinishi).
 * Jamlangan ombor: har material bo'yicha jami qoldiq va uning obyektlar orasida taqsimoti (chiziq).
 * Obyekt qoldiqlari: manfiy qoldiq (kirim kiritilmagan chiqim) qizil bilan aniq belgilanadi.
 */
type Tab = 'qoldiq' | 'kirim' | 'm29' | 'konsolidatsiya';
const OBYEKT_RANGLARI = ['var(--kat-chel)', 'var(--kat-mat)', 'var(--kat-mash)', 'var(--kat-ob)', 'var(--accent)', 'var(--info)'];

export default function TestSklad() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;

  const [activeTab, setActiveTab] = useState<Tab>('konsolidatsiya');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [opType, setOpType] = useState<'kirim' | 'chiqim'>('kirim');

  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [skladQoldiq, setSkladQoldiq] = useState<T2SkladQoldiq[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [markaziySkladlar, setMarkaziySkladlar] = useState<any[]>([]);
  const [markaziyId, setMarkaziyId] = useState<number | null>(null);
  const [konsQoldiqlar, setKonsQoldiqlar] = useState<SkladKonsolidatsiya[]>([]);

  const [formNomi, setFormNomi] = useState('');
  const [formHajmi, setFormHajmi] = useState('');
  const [formBirligi, setFormBirligi] = useState('dona');

  useEffect(() => {
    if (!aktKomp) { setObyektlar([]); return; }
    void sbT2ObyektlarOl(aktKomp).then((r) => {
      if (r.ok && r.qatorlar) {
        setObyektlar(r.qatorlar);
        if (r.qatorlar.length > 0 && !obyektId) setObyektId(r.qatorlar[0].id);
      }
    });
    void sbSkladlarOl(aktKomp).then((r) => {
      if (r.ok && r.qatorlar) {
        setMarkaziySkladlar(r.qatorlar);
        if (r.qatorlar.length > 0 && !markaziyId) setMarkaziyId(r.qatorlar[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktKomp]);

  useEffect(() => {
    if (activeTab === 'konsolidatsiya' && markaziyId) {
      setYuklanmoqda(true);
      void sbSkladKonsolidatsiyaOl(markaziyId).then((r) => {
        if (r.ok && r.qatorlar) setKonsQoldiqlar(r.qatorlar as SkladKonsolidatsiya[]);
        setYuklanmoqda(false);
      });
    }
  }, [activeTab, markaziyId]);

  const qoldiqYukla = () => {
    if (!obyektId) return;
    setYuklanmoqda(true);
    void sbSkladQoldiqOl(obyektId).then((r) => {
      setYuklanmoqda(false);
      setSkladQoldiq(r.ok && r.qatorlar ? r.qatorlar : []);
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { qoldiqYukla(); }, [obyektId]);

  const handleSave = async () => {
    if (!obyektId || !formNomi || !formHajmi || !formBirligi) {
      toast(t('Barcha maydonlarni to‘ldiring'), 'warn');
      return;
    }
    setYuklanmoqda(true);
    const operatsiya = opType === 'kirim' ? 'prixod' : 'rasxod';
    const res = await sbSkladgaYozish(aktKomp, operatsiya, {
      obyekt_id: obyektId, operatsiya, turi: 'mat', sana: new Date().toISOString().split('T')[0],
      nomi: formNomi, birligi: formBirligi, obyomi: Number(formHajmi),
    });
    setYuklanmoqda(false);
    if (res.ok) {
      toast(opType === 'kirim' ? t('Omborga kirim yozildi.') : t('Ombordan chiqim yozildi.'), 'ok');
      setIsFormOpen(false);
      setFormNomi(''); setFormHajmi('');
      qoldiqYukla();
    } else {
      toast(t('Xato yuz berdi: {x}', { x: res.error ?? '' }), 'danger');
    }
  };

  const filteredQoldiq = skladQoldiq.filter((item) => item.nomi.toLowerCase().includes(searchTerm.toLowerCase()));
  const xulosa = useMemo(() => skladXulosa(skladQoldiq), [skladQoldiq]);
  const obyektRangi = useMemo(() => {
    const m = new Map<number, string>();
    for (const k of konsQoldiqlar) for (const o of k.obyektlar_boyicha ?? []) if (!m.has(o.obyekt_id)) m.set(o.obyekt_id, OBYEKT_RANGLARI[m.size % OBYEKT_RANGLARI.length]);
    return m;
  }, [konsQoldiqlar]);
  const ochOyna = (tur: 'kirim' | 'chiqim') => { setOpType(tur); setIsFormOpen(true); };

  return (
    <Sahifa
      sarlavha="Ombor (sklad): qoldiq va harakatlar"
      tavsif="Kirim — omborga keldi, chiqim — obyektga sarflandi. Qoldiq = kirim − chiqim; manfiy qoldiq — kirim kiritilmagan."
      amallar={<>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-text-dim">
          <Building2 size={15} className="text-text-mute" />
          <select aria-label={t('Obyekt')} className="h-8 max-w-[260px] px-2 text-[13px]" value={obyektId || ''} onChange={(e) => setObyektId(Number(e.target.value))}>
            {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => ochOyna('chiqim')} className="fz-btn"><ArrowUpFromLine /> {t('Chiqim (rasxod)')}</button>
        <button type="button" onClick={() => ochOyna('kirim')} className="fz-btn fz-btn--primary"><ArrowDownToLine /> {t('Kirim (prixod)')}</button>
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
          { id: 'konsolidatsiya', nom: t('Jamlangan ombor'), ikon: <Layers /> },
          { id: 'qoldiq', nom: t('Obyekt qoldiqlari'), ikon: <Box />, soni: skladQoldiq.length },
          { id: 'kirim', nom: t('Harakatlar tarixi'), ikon: <History /> },
          { id: 'm29', nom: t('M-29 hisobot'), ikon: <ClipboardCheck /> },
        ]} />

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

        {activeTab === 'kirim' && (
          <section className="fz-note"><History /><span>{t('Kirim va chiqim jurnali hali yasalmagan — hozircha harakatlar «Obyekt qoldiqlari» orqali ko‘rinadi.')}</span></section>
        )}
      </div>

      <OpsOyna ochiq={isFormOpen} onYop={() => setIsFormOpen(false)} band={yuklanmoqda}
        ikon={opType === 'kirim' ? <ArrowDownToLine style={{ color: 'var(--ok)' }} /> : <ArrowUpFromLine style={{ color: 'var(--danger)' }} />}
        sarlavha={opType === 'kirim' ? t('Omborga kirim qilish') : t('Ombordan chiqim qilish')}
        amallar={<>
          <button type="button" onClick={() => setIsFormOpen(false)} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
          <button type="button" onClick={() => void handleSave()} disabled={yuklanmoqda} className={`fz-btn ${opType === 'kirim' ? 'fz-btn--primary' : 'fz-btn--danger'}`}>
            {yuklanmoqda ? t('Yozilmoqda…') : t('Tasdiqlash')}
          </button>
        </>}>
        <p className="text-[12px] text-text-dim">{t('Obyekt')}: <b className="text-text">{obyektlar.find((o) => o.id === obyektId)?.nom ?? '—'}</b></p>
        <OpsMaydon nom={t('Material nomi')} majburiy>
          <span className="relative block">
            <Barcode className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" size={15} />
            <input type="text" value={formNomi} onChange={(e) => setFormNomi(e.target.value)} style={{ paddingLeft: 30 }} placeholder={t('Masalan, sement M400')} />
          </span>
        </OpsMaydon>
        <div className="grid grid-cols-2 gap-3">
          <OpsMaydon nom={t('Hajmi')} majburiy>
            <input type="number" value={formHajmi} onChange={(e) => setFormHajmi(e.target.value)} className="text-right tabular-nums" />
          </OpsMaydon>
          <OpsMaydon nom={t('O‘lchov birligi')}>
            <select value={formBirligi} onChange={(e) => setFormBirligi(e.target.value)}>
              {['tonna', 'dona', 'm2', 'm3', 'kg'].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </OpsMaydon>
        </div>
      </OpsOyna>
    </Sahifa>
  );
}
