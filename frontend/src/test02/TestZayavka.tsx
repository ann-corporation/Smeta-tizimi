import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Building2, Calendar, Send, RefreshCw, AlertTriangle } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';
import { sbZayavkalarOl, sbZayavkaYoz, sbZayavkaHolatYoz, type T2Zayavka, type ZayavkaHolat } from '../api/t2-zayavka';
import { sbOqi, sbT2ObyektlarOlKomp, type T2Obyekt } from '../api/supabase';
import { usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { materialTakliflari, materialTopish, type SmetaMaterial } from '../lib/zayavka-material';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { FmtN } from '../lib/format';
import { t } from '../i18n/til';
import { kunYoshi, taqsimot, ZAYAVKA_TARTIB, zayavkaXulosa, zayavkaYetkazish } from '../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsChiziq, OpsKpi, OpsKpiQator, OpsMaydon, OpsOyna, OpsQidiruv, OpsTaqsimot } from '../components/kompaniya-ops/OpsUi';
import { BuyurtmaBerish } from '../components/buyurtma/BuyurtmaBerish';
import { BuyurtmaRoyxati } from '../components/buyurtma/BuyurtmaRoyxati';
import { useFaolAloqalar } from '../components/buyurtma/aloqalar';

/**
 * Zayavkalar — obyektdan ta'minotga talabnoma (egasi 2026-10-25: Firuza ko'rinishi).
 * Yo'l: qoralama → yuborildi → tasdiqlandi → ta'minotda → buyurtma → (qisman) yetkazildi → yopildi; bekor — alohida.
 * Tepada: ochiq / muddati o'tgan / yetkazilgan soni va holatlar bo'yicha segmentli chiziq (bosilsa — filtr).
 */
const HOLAT: Record<ZayavkaHolat, { nom: string; stamp: string; rang: string }> = {
  draft: { nom: 'Qoralama', stamp: 'fz-stamp--draft', rang: 'var(--border-strong)' },
  submitted: { nom: 'Yuborildi', stamp: 'fz-stamp--warn', rang: 'var(--warn)' },
  approved: { nom: 'Tasdiqlandi', stamp: 'fz-stamp--info', rang: 'var(--info)' },
  procurement: { nom: 'Ta’minotda', stamp: 'fz-stamp--info', rang: 'var(--kat-ob)' },
  ordered: { nom: 'Buyurtma berildi', stamp: 'fz-stamp--info', rang: 'var(--kat-chel)' },
  partially_delivered: { nom: 'Qisman yetkazildi', stamp: 'fz-stamp--warn', rang: 'var(--accent)' },
  delivered: { nom: 'Yetkazildi', stamp: 'fz-stamp--ok', rang: 'var(--ok)' },
  closed: { nom: 'Yopildi', stamp: '', rang: 'var(--text-mute)' },
  cancelled: { nom: 'Bekor qilindi', stamp: 'fz-stamp--danger', rang: 'var(--danger)' },
};
const holatNom = (h: ZayavkaHolat) => t(HOLAT[h]?.nom ?? h);

/** Keyingi qadam tugmalari — holatlar mashinasi o'zgarmagan. */
const QADAMLAR: { dan: ZayavkaHolat[]; ga: ZayavkaHolat; nom: string; title: string; cls: string }[] = [
  { dan: ['draft'], ga: 'submitted', nom: 'Yuborish', title: 'Yuborish', cls: 'fz-btn--primary' },
  { dan: ['submitted'], ga: 'approved', nom: 'Tasdiqlash', title: 'Tasdiqlash', cls: 'fz-btn--primary' },
  { dan: ['approved'], ga: 'procurement', nom: 'Ta’minotga', title: 'Ta’minotga berish', cls: 'fz-btn--primary' },
  { dan: ['procurement'], ga: 'ordered', nom: 'Buyurtma', title: 'Buyurtma berish', cls: 'fz-btn--primary' },
  { dan: ['ordered', 'partially_delivered'], ga: 'delivered', nom: 'Yetkazildi', title: 'Yetkazildi deb belgilash', cls: 'fz-btn--primary' },
  { dan: ['delivered'], ga: 'closed', nom: 'Yopish', title: 'Yopish', cls: '' },
  { dan: ['draft', 'submitted'], ga: 'cancelled', nom: 'Bekor qilish', title: 'Bekor qilish', cls: 'fz-btn--ghost' },
];

export default function TestZayavka() {
  const { joriy } = useKompaniya();
  const [params] = useSearchParams();
  const ws = usePTOWorkspace();
  /* Obyekt: URL, bo'lmasa joriy ish konteksti (qayta tanlatmaslik). */
  const initialObyekt = params.get('obyekt') || (ws.scope?.objectId ? String(ws.scope.objectId) : '');
  const initYarat = params.get('yarat') === '1';

  const [zayavkalar, setZayavkalar] = useState<T2Zayavka[]>([]);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [filtr, setFiltr] = useState<ZayavkaHolat | null>(null);
  const [qidiruv, setQidiruv] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(initYarat);
  const [formObyektId, setFormObyektId] = useState('');
  const [formMaxsulot, setFormMaxsulot] = useState('');
  const [formMiqdor, setFormMiqdor] = useState('');
  const [formBirlik, setFormBirlik] = useState('');
  const [formSana, setFormSana] = useState('');
  const [formMuhimlik, setFormMuhimlik] = useState('orta');
  const [formIzoh, setFormIzoh] = useState('');

  const [amalId, setAmalId] = useState<number | null>(null);
  /* Buyurtma berish (ta'minotdagi zayavka -> yetkazuvchi): faqat tizimga ulangan (faol aloqali) kompaniyalar. */
  const yetkazuvchilar = useFaolAloqalar(joriy?.id);
  const [buyurtmaZ, setBuyurtmaZ] = useState<T2Zayavka | null>(null);
  const [buyurtmaKalit, setBuyurtmaKalit] = useState(0);

  /** Buyurtma yuborildi: zayavka «Buyurtma berildi» holatiga o'tadi (mavjud holat mashinasi), ro'yxatlar yangilanadi. */
  const buyurtmaBerildi = async (z: T2Zayavka) => {
    setBuyurtmaZ(null);
    setBuyurtmaKalit((k) => k + 1);
    if (!joriy) return;
    try {
      const natija = await sbZayavkaHolatYoz(joriy.id, z, 'ordered');
      if (!natija.ok) toast(t('Buyurtma yuborildi, lekin zayavka holatini yangilab bo‘lmadi. Holatni qo‘lda o‘zgartiring.'), 'warn');
    } catch {
      toast(t('Buyurtma yuborildi, lekin zayavka holatini yangilab bo‘lmadi. Holatni qo‘lda o‘zgartiring.'), 'warn');
    }
    void yukla();
  };

  const yukla = async () => {
    if (!joriy) return;
    setYuklanmoqda(true);
    try {
      const [zRes, oRes] = await Promise.all([sbZayavkalarOl(joriy.id), sbT2ObyektlarOlKomp(joriy.id)]);
      if (zRes.error) throw new Error(zRes.error);
      if (oRes.error) throw new Error(oRes.error);
      setZayavkalar(zRes.qatorlar || []);
      setObyektlar(oRes.qatorlar || []);
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [joriy]);

  useEffect(() => {
    if (!initialObyekt) { setFormObyektId(''); return; }
    const obyekt = obyektlar.find((o) => String(o.id) === initialObyekt || o.nom === initialObyekt);
    setFormObyektId(obyekt ? String(obyekt.id) : '');
  }, [initialObyekt, obyektlar]);

  /* Smeta materiallari (tanlangan obyekt): birlik va qoldiq shundan olinadi. */
  const [smetaMat, setSmetaMat] = useState<SmetaMaterial[]>([]);
  useEffect(() => {
    setSmetaMat([]);
    const id = Number(formObyektId);
    if (!joriy || !Number.isSafeInteger(id) || id <= 0) return;
    let faol = true;
    void sbOqi<SmetaMaterial>({ jadval: 't2_qator', filtr: 'obyekt_id=eq.' + id + '&kat=in.(mat,ob)', ustunlar: 'nom,birlik,hajm', limit: 20000 })
      .then((r) => { if (faol && r.ok) setSmetaMat(r.qatorlar ?? []); }).catch(() => undefined);
    return () => { faol = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- joriy?.id: obyekt identifikatori barqaror (joriy obyekti har renderda yangi bo'lishi mumkin)
  }, [formObyektId, joriy?.id]);
  const materiallar = useMemo(() => materialTakliflari(smetaMat, zayavkalar.filter((z) => String(z.obyektId) === formObyektId)), [smetaMat, zayavkalar, formObyektId]);
  const tanlanganMat = useMemo(() => materialTopish(materiallar, formMaxsulot), [materiallar, formMaxsulot]);
  const maxsulotOzgardi = (v: string) => {
    setFormMaxsulot(v);
    const m = materialTopish(materiallar, v);
    if (m?.birlik) setFormBirlik(m.birlik);
  };

  const handleYuborish = async () => {
    if (!joriy) return;
    if (!formObyektId || !formMaxsulot || !formMiqdor) {
      toast(t('Obyekt, maxsulot va miqdorni kiriting'), 'warn');
      return;
    }
    if (!(parseFloat(formMiqdor) > 0)) {
      toast(t('Miqdor 0 dan katta son bo‘lishi kerak'), 'warn');
      return;
    }
    setYuklanmoqda(true);
    try {
      const natija = await sbZayavkaYoz(joriy.id, {
        obyektId: parseInt(formObyektId),
        itemText: formMaxsulot,
        requestedQty: parseFloat(formMiqdor),
        unit: formBirlik,
        requiredDate: formSana,
        priority: formMuhimlik,
        note: formIzoh,
      });
      if (!natija.ok) throw new Error(natija.error || t('Xato yuz berdi'));
      toast(t('Zayavka muvaffaqiyatli yaratildi!'), 'ok');
      setIsModalOpen(false);
      setFormMaxsulot(''); setFormMiqdor(''); setFormSana(''); setFormIzoh('');
      void yukla();
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  const holatOzgartir = async (id: number, yHolat: ZayavkaHolat) => {
    if (!joriy) return;
    setAmalId(id);
    try {
      const request = zayavkalar.find((item) => item.id === id);
      if (!request) throw new Error(t('Zayavka topilmadi'));
      const natija = await sbZayavkaHolatYoz(joriy.id, request, yHolat);
      if (!natija.ok) throw new Error(natija.error || t('Xato yuz berdi'));
      toast(t('Holat o‘zgardi: {h}', { h: holatNom(yHolat) }), 'ok');
      void yukla();
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setAmalId(null);
    }
  };

  const bugun = new Date().toISOString().slice(0, 10);
  const xulosa = useMemo(() => zayavkaXulosa(zayavkalar, bugun), [zayavkalar, bugun]);
  const quvur = useMemo(() => taqsimot(zayavkalar, (z) => z.status, ZAYAVKA_TARTIB), [zayavkalar]);
  const obyektNomi = (id: number) => obyektlar.find((o) => o.id === id)?.nom || t('Noma’lum obyekt');
  const korinadi = zayavkalar.filter((z) => (!filtr || z.status === filtr)
    && (!qidiruv || `${z.itemText} ${obyektNomi(z.obyektId)} ${z.note ?? ''}`.toLowerCase().includes(qidiruv.toLowerCase())));

  return (
    <Sahifa
      sarlavha="Zayavkalar (ta’minot talabnomasi)"
      tavsif="Obyektdan kelgan talab → tasdiq → ta’minot → buyurtma → yetkazish. Har qatorda yetkazilgan ulush."
      amallar={<>
        <button type="button" onClick={() => void yukla()} disabled={yuklanmoqda} className="fz-btn fz-btn--ghost"><RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <button type="button" onClick={() => setIsModalOpen(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Yangi zayavka')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Zayavka ko‘rsatkichlari')}>
          <OpsKpi nom={t('Jami zayavka')} qiymat={xulosa.jami} />
          <OpsKpi nom={t('Ochiq (jarayonda)')} qiymat={xulosa.ochiq} rang="var(--info)" ost={t('yetkazilmagan va bekor qilinmagan')} />
          <OpsKpi nom={t('Muddati o‘tgan')} qiymat={<span className={xulosa.muddatiOtgan ? 'text-danger' : ''}>{xulosa.muddatiOtgan}</span>} rang="var(--danger)" ost={t('kerakli sana o‘tgan, hali ochiq')} />
          <OpsKpi nom={t('Yetkazilgan / yopilgan')} qiymat={xulosa.yetkazilgan} rang="var(--ok)" />
        </OpsKpiQator>

        <OpsTaqsimot sarlavha={t('Zayavkalar yo‘li — holatlar bo‘yicha')} tanlangan={filtr}
          onTanla={(k) => setFiltr((f) => (f === k ? null : k as ZayavkaHolat))}
          ong={filtr ? <button type="button" className="fz-chip fz-chip--accent" onClick={() => setFiltr(null)}>{t('filtrni olib tashlash')}</button> : t('bosing — filtr')}
          segmentlar={quvur.map((q) => ({ kalit: q.kalit, nom: holatNom(q.kalit), soni: q.soni, rang: HOLAT[q.kalit]?.rang ?? 'var(--border-strong)' }))} />

        <div className="flex items-center gap-2">
          <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Material, obyekt yoki izoh bo‘yicha…')} />
          <span className="text-[12px] text-text-mute">{t('{n} ta ko‘rsatilmoqda', { n: korinadi.length })}</span>
        </div>

        <div className="fz-table-wrap">
          <table className="fz-table">
            <thead>
              <tr>
                <th>{t('№ / yoshi')}</th>
                <th>{t('Obyekt / kerakli sana')}</th>
                <th>{t('Material')}</th>
                <th className="fz-c-num">{t('So‘ralgan')}</th>
                <th className="fz-c-num">{t('Yetkazilgan')}</th>
                <th className="fz-c-num">{t('Qolgan')}</th>
                <th>{t('Yetkazish')}</th>
                <th>{t('Holat')}</th>
                <th style={{ textAlign: 'right' }}>{t('Keyingi qadam')}</th>
              </tr>
            </thead>
            <tbody>
              {korinadi.length === 0 ? (
                <OpsBoshQator ustun={9} matn={zayavkalar.length ? t('Filtrga mos zayavka yo‘q.') : t('Hozircha zayavkalar yo‘q.')}
                  izoh={zayavkalar.length ? undefined : t('«Yangi zayavka» tugmasi bilan obyekt uchun material so‘rang.')} />
              ) : korinadi.map((z) => {
                const yetkazildi = z.deliveredQty || 0;
                const { ulush, qolgan } = zayavkaYetkazish(z);
                const yosh = kunYoshi(z.createdAt);
                const kechikdi = !!z.requiredDate && z.requiredDate.slice(0, 10) < bugun && !['delivered', 'closed', 'cancelled'].includes(z.status);
                const h = HOLAT[z.status];
                return (
                  <tr key={z.id}>
                    <td>
                      <span className="fz-c-shifr">{'#' + z.id}</span>
                      <span className="block text-[11px] text-text-mute">{yosh == null ? '—' : yosh < 1 ? t('bugun') : t('{n} kun', { n: yosh })}</span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1 font-medium"><Building2 size={12} className="text-text-mute" />{obyektNomi(z.obyektId)}</span>
                      <span className={`mt-0.5 flex items-center gap-1 text-[11.5px] ${kechikdi ? 'font-semibold text-danger' : 'text-text-mute'}`}>
                        {kechikdi ? <AlertTriangle size={11} /> : <Calendar size={11} />}{z.requiredDate || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="font-medium text-text">{z.itemText}</span>
                      {z.note && <span className="mt-0.5 block line-clamp-1 text-[11.5px] text-text-mute">{z.note}</span>}
                    </td>
                    <td className="fz-c-num"><FmtN val={z.requestedQty} /> <span className="text-[11px] text-text-mute">{z.unit}</span></td>
                    <td className="fz-c-num"><FmtN val={yetkazildi} /> <span className="text-[11px] text-text-mute">{z.unit}</span></td>
                    <td className={`fz-c-num ${qolgan && qolgan > 0 ? 'text-warn' : ''}`}><FmtN val={qolgan == null ? null : Math.max(qolgan, 0)} /> <span className="text-[11px] text-text-mute">{z.unit}</span></td>
                    <td style={{ minWidth: 110 }}>
                      <span className="flex items-center gap-2">
                        <OpsChiziq ulush={ulush} rang={ulush === 1 ? 'var(--ok)' : 'var(--accent)'} />
                        <span className="w-9 text-right text-[11.5px] tabular-nums text-text-mute">{ulush == null ? '—' : `${Math.round(ulush * 100)}%`}</span>
                      </span>
                    </td>
                    <td><span className={`fz-stamp ${h?.stamp ?? ''}`}>{holatNom(z.status)}</span></td>
                    <td className="text-right">
                      {amalId === z.id ? (
                        <span className="animate-pulse text-[12px] text-text-mute">{t('Kuting…')}</span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center justify-end gap-1">
                          {z.status === 'procurement' && (
                            <button type="button" onClick={() => setBuyurtmaZ(z)} className="fz-btn fz-btn--sm fz-btn--primary" title={t('Yetkazuvchiga buyurtma berish')}>{t('Buyurtma berish')}</button>
                          )}
                          {QADAMLAR.filter((q) => q.dan.includes(z.status) && q.ga !== 'ordered').map((q) => (
                            <button key={q.ga} type="button" onClick={() => void holatOzgartir(z.id, q.ga)} className={`fz-btn fz-btn--sm ${q.cls}`} title={t(q.title)}>{t(q.nom)}</button>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {joriy && <BuyurtmaRoyxati kompaniyaId={joriy.id} yetkazuvchilar={yetkazuvchilar} yangilash={buyurtmaKalit} />}
      </div>

      {joriy && buyurtmaZ && (
        <BuyurtmaBerish kompaniyaId={joriy.id} zayavka={buyurtmaZ} yetkazuvchilar={yetkazuvchilar}
          onYop={() => setBuyurtmaZ(null)} onBerildi={() => void buyurtmaBerildi(buyurtmaZ)} />
      )}

      <OpsOyna ochiq={isModalOpen} onYop={() => setIsModalOpen(false)} band={yuklanmoqda} ikon={<ClipboardList />} sarlavha={t('Yangi zayavka')}
        amallar={<>
          <button type="button" onClick={() => setIsModalOpen(false)} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
          <button type="button" onClick={() => void handleYuborish()} disabled={yuklanmoqda} className="fz-btn fz-btn--primary">
            {yuklanmoqda ? t('Yuborilmoqda…') : <><Send /> {t('Yuborish')}</>}
          </button>
        </>}>
        <OpsMaydon nom={t('Obyekt')} majburiy>
          <select value={formObyektId} onChange={(e) => setFormObyektId(e.target.value)}>
            <option value="">{t('— tanlang —')}</option>
            {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </OpsMaydon>
        <OpsMaydon nom={t('Material / xizmat nomi')} majburiy>
          <input type="text" list="zayavka-materiallar" value={formMaxsulot} onChange={(e) => maxsulotOzgardi(e.target.value)} placeholder={t('M400 beton')} />
          <datalist id="zayavka-materiallar">{materiallar.map((m) => <option key={m.nom + '|' + (m.birlik ?? '')} value={m.nom}>{m.birlik ?? ''}</option>)}</datalist>
        </OpsMaydon>
        {tanlanganMat && tanlanganMat.smetaHajm != null && tanlanganMat.qoldiq != null && (
          <p className="m-0 text-[12px] text-text-dim" data-testid="zayavka-qoldiq">{t('Smetada: {s} {b} · oldin so‘ralgan: {o} · qoldiq: {q}', { s: tanlanganMat.smetaHajm, b: tanlanganMat.birlik ?? '', o: tanlanganMat.soralgan, q: tanlanganMat.qoldiq })}
            {formMiqdor.trim() === '' && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm ml-2" onClick={() => setFormMiqdor(String(tanlanganMat.qoldiq))}>{t('Qoldiqni qo‘yish')}</button>}</p>
        )}
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <OpsMaydon nom={t('Miqdor')} majburiy>
            <input type="number" min="0" step="any" value={formMiqdor} onChange={(e) => setFormMiqdor(e.target.value)} onFocus={(e) => e.target.select()} placeholder="0.00" className="text-right tabular-nums" />
          </OpsMaydon>
          <OpsMaydon nom={t('Birlik')}>
            <input type="text" value={formBirlik} onChange={(e) => setFormBirlik(e.target.value)} placeholder={t('tonna, m3')} />
          </OpsMaydon>
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <OpsMaydon nom={t('Qachonga kerak?')}>
            <input type="date" value={formSana} onChange={(e) => setFormSana(e.target.value)} />
          </OpsMaydon>
          <OpsMaydon nom={t('Muhimlik')}>
            <select value={formMuhimlik} onChange={(e) => setFormMuhimlik(e.target.value)}>
              <option value="past">{t('Past')}</option>
              <option value="orta">{t('O‘rta')}</option>
              <option value="yuqori">{t('Yuqori')}</option>
            </select>
          </OpsMaydon>
        </div>
        <OpsMaydon nom={t('Izoh')}>
          <textarea value={formIzoh} onChange={(e) => setFormIzoh(e.target.value)} rows={2} placeholder={t('Qo‘shimcha ma’lumotlar…')} />
        </OpsMaydon>
      </OpsOyna>
    </Sahifa>
  );
}
