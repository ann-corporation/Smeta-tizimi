import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { useState, useEffect } from 'react';
import { Gavel, PackageSearch, Plus, Clock, ChevronRight, ChevronLeft, Save, RefreshCw, Handshake, CheckCircle2 } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { FmtN } from '../lib/format';
import { useKompaniya } from './KompaniyaTanlov';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { BirjaTaqqoslash } from './BirjaTaqqoslash';
import { sbBirjaSorovOl, sbBirjaTakliflarOl, sbBirjaRfqYarat, sbBirjaTaklifBer, type BirjaRfq, type BirjaTaklif } from '../api/t2-birja';
import { OpsChiziq, OpsMaydon, OpsOyna, OpsTablar } from '../components/kompaniya-ops/OpsUi';

/**
 * B2B xarid birjasi (RFQ) — egasi 2026-10-25: Firuza ko'rinishi. So'rov e'lon qilinadi → yetkazuvchilar narx beradi →
 * takliflar eng arzondan boshlab chiziq bilan taqqoslanadi. (Avvalgi «AI bozor tahlili» bloki — manbasiz raqam edi, olib tashlandi.)
 */
type Tab = 'rfq' | 'taklif' | 'tarix';
const BIRLIKLAR = ['tonna', 'm2', 'm3', 'kg', 'dona', 'litr'];

export default function TestBirja() {
  const { joriy } = useKompaniya();
  const [activeTab, setActiveTab] = useState<Tab>('rfq');
  const [rfqList, setRfqList] = useState<BirjaRfq[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [yangiRfq, setYangiRfq] = useState({ nom: '', birlik: 'tonna', hajm: '', izoh: '' });
  const [saqlamoqda, setSaqlamoqda] = useState(false);
  const [tanlanganRfq, setTanlanganRfq] = useState<BirjaRfq | null>(null);
  const [takliflar, setTakliflar] = useState<BirjaTaklif[]>([]);
  const [taklifYuklanmoqda, setTaklifYuklanmoqda] = useState(false);
  const [yangiTaklif, setYangiTaklif] = useState({ narx: '', izoh: '' });

  const yuklaRfq = async () => {
    setYuklanmoqda(true);
    try {
      const res = await sbBirjaSorovOl();
      setRfqList(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };
  useEffect(() => { void yuklaRfq(); }, []);

  const handleYaratRfq = async () => {
    if (!joriy) return toast(t('Kompaniya tanlang'), 'warn');
    if (!yangiRfq.nom || !yangiRfq.hajm) return toast(t('Nomi va hajmini kiriting'), 'warn');
    setSaqlamoqda(true);
    try {
      await sbBirjaRfqYarat({ nom: yangiRfq.nom, birlik: yangiRfq.birlik, hajm: Number(yangiRfq.hajm), izoh: yangiRfq.izoh, kompaniya_id: joriy.id });
      toast(t('Yangi RFQ tenderga qo‘yildi!'), 'ok');
      setIsModalOpen(false);
      setYangiRfq({ nom: '', birlik: 'tonna', hajm: '', izoh: '' });
      void yuklaRfq();
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setSaqlamoqda(false);
    }
  };

  const korishRfq = async (r: BirjaRfq) => {
    setTanlanganRfq(r);
    setTaklifYuklanmoqda(true);
    try {
      const res = await sbBirjaTakliflarOl(r.id);
      setTakliflar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setTaklifYuklanmoqda(false);
    }
  };

  const handleTaklifBer = async () => {
    if (!tanlanganRfq || !joriy) return;
    if (!yangiTaklif.narx) return toast(t('Narxni kiriting'), 'warn');
    setSaqlamoqda(true);
    try {
      await sbBirjaTaklifBer(tanlanganRfq.id, joriy.id, Number(yangiTaklif.narx), yangiTaklif.izoh);
      toast(t('Taklif yuborildi!'), 'ok');
      setYangiTaklif({ narx: '', izoh: '' });
      const res = await sbBirjaTakliflarOl(tanlanganRfq.id);
      setTakliflar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setSaqlamoqda(false);
    }
  };

  const maksNarx = Math.max(1, ...takliflar.map((x) => Number(x.narx) || 0));
  const ochiqSorovlar = rfqList.filter((r) => r.kompaniya_id !== joriy?.id && !['yopiq', 'yopildi', 'bekor'].includes(r.holat));

  return (
    <Sahifa
      sarlavha="Xarid birjasi (tenderlar)"
      tavsif="Material so‘rovi (RFQ) e’lon qilinadi, yetkazuvchilar narx beradi, takliflar eng arzonidan boshlab taqqoslanadi."
      amallar={<>
        <button type="button" onClick={() => void yuklaRfq()} className="fz-btn fz-btn--ghost" aria-label={t('Yangilash')}><RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <button type="button" onClick={() => setIsModalOpen(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Yangi RFQ')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsTablar<Tab> yorliq={t('Birja bo‘limlari')} joriy={activeTab} onTanla={(k) => { setActiveTab(k); setTanlanganRfq(null); }} tablar={[
          { id: 'rfq', nom: t('Faol so‘rovlar (RFQ)'), ikon: <Gavel />, soni: rfqList.length },
          { id: 'taklif', nom: t('Yetkazuvchi kabineti'), ikon: <PackageSearch />, soni: ochiqSorovlar.length || null },
          { id: 'tarix', nom: t('Xarid tarixi'), ikon: <Clock /> },
        ]} />

        {activeTab === 'rfq' && (!tanlanganRfq ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rfqList.length === 0 && !yuklanmoqda && (
              <section className="fz-note col-span-full"><Gavel /><span>{t('Hali hech qanday RFQ e’lon qilinmagan.')} {t('«Yangi RFQ» tugmasi bilan birinchi so‘rovni e’lon qiling.')}</span></section>
            )}
            {rfqList.map((rfq) => (
              <article key={rfq.id} className="fz-panel">
                <div className="flex items-start justify-between">
                  <span className="fz-c-shifr">#{rfq.id}</span>
                  <span className={`fz-stamp ${rfq.holat === 'faol' ? 'fz-stamp--ok' : ''}`}>{t(rfq.holat)}</span>
                </div>
                <h3 className="text-[15px] font-semibold leading-tight text-text">{rfq.nom}</h3>
                <div className="flex gap-6 text-[12px]">
                  <span><span className="block text-text-mute">{t('Talab hajmi')}</span><b className="tabular-nums"><FmtN val={rfq.hajm} /> {rfq.birlik}</b></span>
                  <span><span className="block text-text-mute">{t('Sana')}</span><b>{new Date(rfq.yaratilgan_vaqt).toLocaleDateString('ru-RU')}</b></span>
                </div>
                <button type="button" onClick={() => void korishRfq(rfq)} className="fz-btn mt-auto w-full">{t('Batafsil va takliflar')} <ChevronRight /></button>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,1fr)_2fr]">
            <section className="fz-panel">
              <button type="button" onClick={() => setTanlanganRfq(null)} className="fz-btn fz-btn--ghost fz-btn--sm self-start"><ChevronLeft /> {t('Orqaga')}</button>
              <span className="fz-c-shifr">RFQ #{tanlanganRfq.id}</span>
              <h2 className="text-[17px] font-semibold leading-tight text-text">{tanlanganRfq.nom}</h2>
              <span className="fz-chip fz-chip--accent self-start"><FmtN val={tanlanganRfq.hajm} /> {tanlanganRfq.birlik}</span>
              {tanlanganRfq.izoh && <p className="fz-note">{tanlanganRfq.izoh}</p>}
              {tanlanganRfq.kompaniya_id !== joriy?.id && (
                <div className="mt-2 space-y-3 border-t border-border pt-3">
                  <h3 className="inline-flex items-center gap-2 text-[13px] font-semibold"><Handshake size={15} />{t('Taklif yuborish')}</h3>
                  <OpsMaydon nom={t('Sizning narxingiz (so‘m / {b})', { b: tanlanganRfq.birlik })}>
                    <MoneyInput value={yangiTaklif.narx} onValueChange={(v) => setYangiTaklif({ ...yangiTaklif, narx: v })} className="h-8 w-full px-2 text-right font-semibold tabular-nums" placeholder={t('masalan: 1200000')} />
                  </OpsMaydon>
                  <OpsMaydon nom={t('Izoh / muddat')}>
                    <input type="text" value={yangiTaklif.izoh} onChange={(e) => setYangiTaklif({ ...yangiTaklif, izoh: e.target.value })} placeholder={t('3 kunda yetkazib beramiz')} />
                  </OpsMaydon>
                  <button type="button" onClick={() => void handleTaklifBer()} disabled={saqlamoqda} className="fz-btn fz-btn--primary w-full">
                    {saqlamoqda ? <RefreshCw className="animate-spin" /> : <CheckCircle2 />} {t('Yuborish')}
                  </button>
                </div>
              )}
            </section>

            <section className="fz-panel" aria-label={t('Kelib tushgan takliflar')}>
              <div className="fz-panel__h"><span>{t('Kelib tushgan takliflar')}</span><span>{takliflar.length}</span></div>
              {taklifYuklanmoqda ? <div className="skel h-24 rounded" /> : takliflar.length === 0 ? (
                <p className="fz-note"><Clock /><span>{t('Hozircha hech qanday zavod taklif bermagan.')}</span></p>
              ) : (<>
                <BirjaTaqqoslash rfq={tanlanganRfq} takliflar={takliflar} />
                <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
                  {takliflar.map((tk, idx) => (
                    <div key={tk.id} className="rounded-md border p-3" style={{ borderColor: idx === 0 ? 'color-mix(in srgb, var(--ok) 50%, transparent)' : 'var(--border)', background: 'var(--surface-2)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-text">{t('Kompaniya #{id}', { id: tk.kompaniya_id })}</span>
                          {idx === 0 && <span className="fz-stamp fz-stamp--ok ml-2">{t('Eng arzon')}</span>}
                          <span className="block text-[12px] text-text-dim">{tk.izoh || t('Izohsiz')}</span>
                          <span className="block text-[11px] text-text-mute">{new Date(tk.yaratilgan_vaqt).toLocaleString('ru-RU')}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[17px] font-semibold tabular-nums"><FmtN val={tk.narx} /></span>
                          <span className="text-[11px] text-text-mute">{t('so‘m / {b}', { b: tanlanganRfq.birlik })}</span>
                        </div>
                      </div>
                      <div className="mt-2"><OpsChiziq ulush={(Number(tk.narx) || 0) / maksNarx} rang={idx === 0 ? 'var(--ok)' : 'var(--border-strong)'} /></div>
                    </div>
                  ))}
                </div>
              </>)}
            </section>
          </div>
        ))}

        {activeTab === 'taklif' && (
          <section className="fz-panel">
            <div className="fz-panel__h"><span>{t('Yetkazuvchi kabineti')}</span></div>
            <p className="text-[12.5px] text-text-dim">{t("Narx bera oladigan ochiq so'rovlar (boshqa kompaniyalar e'lon qilgan)")}</p>
            {ochiqSorovlar.length === 0 ? <p className="text-[12.5px] text-text-mute">{t("Hozircha sizga narx berish uchun ochiq so'rov yo'q.")}</p> : (
              <ul className="divide-y divide-border">
                {ochiqSorovlar.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{r.nom} <span className="fz-chip"><FmtN val={r.hajm} /> {r.birlik}</span></span>
                    <button type="button" onClick={() => { setActiveTab('rfq'); void korishRfq(r); }} className="fz-btn fz-btn--sm fz-btn--primary">{t('Narx berish')}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11.5px] text-text-mute">{t("Mahsulot katalogi, ombor joylashuvi va buyurtmalar yetkazuvchi kabinetiga keyingi bosqichda qo'shiladi.")}</p>
          </section>
        )}
        {activeTab === 'tarix' && <section className="fz-note"><Clock /><span>{t('Yopilgan va hal qilingan tenderlar tarixi shu yerda ko‘rinadi (keyingi bosqich).')}</span></section>}
      </div>

      <OpsOyna ochiq={isModalOpen} onYop={() => setIsModalOpen(false)} band={saqlamoqda} ikon={<Gavel />} sarlavha={t('Yangi RFQ qo‘shish')}
        amallar={<>
          <button type="button" onClick={() => setIsModalOpen(false)} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
          <button type="button" onClick={() => void handleYaratRfq()} disabled={saqlamoqda} className="fz-btn fz-btn--primary">
            {saqlamoqda ? <RefreshCw className="animate-spin" /> : <Save />} {t('Tenderga e’lon qilish')}
          </button>
        </>}>
        <OpsMaydon nom={t('Tovarning to‘liq nomi')} majburiy>
          <input value={yangiRfq.nom} onChange={(e) => setYangiRfq({ ...yangiRfq, nom: e.target.value })} placeholder={t('masalan: M400 sement')} />
        </OpsMaydon>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <OpsMaydon nom={t('Hajm')} majburiy>
            <input type="number" value={yangiRfq.hajm} onChange={(e) => setYangiRfq({ ...yangiRfq, hajm: e.target.value })} placeholder="100" className="text-right tabular-nums" />
          </OpsMaydon>
          <OpsMaydon nom={t('O‘lchov birligi')}>
            <select value={yangiRfq.birlik} onChange={(e) => setYangiRfq({ ...yangiRfq, birlik: e.target.value })}>
              {BIRLIKLAR.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </OpsMaydon>
        </div>
        <OpsMaydon nom={t('Qo‘shimcha izoh')}>
          <textarea value={yangiRfq.izoh} onChange={(e) => setYangiRfq({ ...yangiRfq, izoh: e.target.value })} rows={3} placeholder={t('Zavodga qo‘shimcha talablar…')} />
        </OpsMaydon>
      </OpsOyna>
    </Sahifa>
  );
}
