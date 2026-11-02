import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useState } from 'react';
import { sbT2ObyektlarOlKomp, sbT2QatorHolatOl, type T2Obyekt, type T2QatorHolat } from '../../api/supabase';
import { resursVedomostHujjat, resursVedomostKategoriyalarga, type ResursVedomostKategoriya } from '../../lib/resurs-vedomost';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { FmtN } from '../../lib/format';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { toast } from '../../umumiy/ui/Toast';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { t } from '../../i18n/til';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { katKesimYigish } from '../../lib/ustamali-summa';
import { AlertTriangle, Eye, FileSpreadsheet, Search } from 'lucide-react';

// T2-PTO-CLOSURE-007 (Claude lane): egasining so'rovi bo'yicha — butun
// smeta+F2'dan kategoriya (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М-К) kesimida resurs
// vedomosti. Manba — `t2_qator_holat` (bu sessiyada certified_* ustuvor
// bo'lishi tuzatilgan), yangi hisob-kitob yo'q, faqat jamlanma. Holat.tsx
// bilan bir xil "ochish ixtiyoriy" naqsh — mavjud oqimga tegmaydi.

function Sessiya({ companyId, fixedObjectId }: { companyId: number; fixedObjectId?: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState(fixedObjectId ? String(fixedObjectId) : '');
  const [kategoriyalar, setKategoriyalar] = useState<ResursVedomostKategoriya[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qidiruv, setQidiruv] = useState('');
  const [holatlar, setHolatlar] = useState<T2QatorHolat[]>([]);
  const [tomonlar, setTomonlar, imzoTafsilot] = useHujjatTomonlari(companyId, Number(objectId) || null);

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then(r => {
      if (!active) return;
      setObjects(r.ok ? (r.qatorlar || []) as T2Obyekt[] : []);
      if (!r.ok) setError('Obyektlar o‘qilmadi.');
    });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    if (fixedObjectId) void obyektTanla(String(fixedObjectId));
  }, [fixedObjectId]);

  async function obyektTanla(id: string) {
    setObjectId(id); setKategoriyalar([]); setError('');
    if (!id) return;
    setLoading(true);
    try {
      const r = await sbT2QatorHolatOl(Number(id));
      if (!r.ok) throw new Error('Ma’lumot o‘qilmadi.');
      const rows = (r.qatorlar || []) as T2QatorHolat[];
      setHolatlar(rows);
      setKategoriyalar(resursVedomostKategoriyalarga(rows));
    } catch (e) { setError(e instanceof Error ? e.message : 'O‘qish bajarilmadi.'); }
    finally { setLoading(false); }
  }

  const filtr = qidiruv.trim().toUpperCase();
  const korinadigan = kategoriyalar.map(k => ({
    ...k,
    qatorlar: filtr ? k.qatorlar.filter(r => r.nom.toUpperCase().includes(filtr)) : k.qatorlar,
  })).filter(k => k.qatorlar.length > 0);

  const korinish = useHujjatKorinish();
  async function hujjat(korish: boolean) {
    const nom = objects.find((o) => String(o.id) === objectId)?.nom || `Obyekt ${objectId}`;
    const h = resursVedomostHujjat(holatlar, { obyektNomi: nom, imzo: tomonlar });
    const t = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'RESURS_VEDOMOST', sabab: `Ресурсная ведомость · ${nom}`, obyekt: objectId },
      () => { if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi); });
    if (!t.ok) toast(t.xabar, 'danger'); else if (t.xabar) toast(t.xabar, 'ok');
  }
  /* Kategoriya → tushuntirish va Firuza rang sinfi (yagona manba: firuza.css --kat-*). */
  const KAT_INFO: Record<string, { nom: string; bg: string }> = {
    ЧЕЛ: { nom: 'Mehnat (ishchilar)', bg: 'fz-bg-chel' }, МАШ: { nom: 'Mashina va mexanizmlar', bg: 'fz-bg-mash' },
    МАТ: { nom: 'Materiallar', bg: 'fz-bg-mat' }, ОБ: { nom: 'Jihozlar', bg: 'fz-bg-ob' },
  };
  const jamiSmeta = kategoriyalar.reduce((x, k) => x + k.jamiSmetaSumma, 0);
  const jamiF2 = kategoriyalar.reduce((x, k) => x + k.jamiF2Summa, 0);
  const jamiQoldiq = kategoriyalar.reduce((x, k) => x + k.jamiQoldiqSumma, 0);
  const oid = Number(objectId) || null;
  // Svod yaxlit belgili obyektda butun smeta ustamalisi — server kesimi (yaxlit bo'limlar ustamasiz, QQS bir marta).
  const obyektKesim = useUstamaliSumma(oid, { kompaniyaId: companyId }).obyektKesim;
  const smetaKesim = obyektKesim ?? katKesimYigish(kategoriyalar, k => k.kat, k => k.jamiSmetaSumma);
  const f2Kesim = katKesimYigish(kategoriyalar, k => k.kat, k => k.jamiF2Summa);
  return (
    <div className="space-y-3">
      {korinish.oyna}
      {!fixedObjectId && <label className="flex items-center gap-2 text-[13px]">{t('Obyekt')}
        <select aria-label="Obyekt" className="h-8 rounded-md border border-[var(--border-strong)] bg-surface-2 px-2"
          value={objectId} onChange={e => void obyektTanla(e.target.value)}>
          <option value="">{t('Tanlang')}</option>
          <ObyektOptionlari obyektlar={objects} />
        </select>
      </label>}
      {loading && <p role="status" className="text-[12.5px] text-text-mute">{t('Yuklanmoqda…')}</p>}
      {error && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div>}
      {kategoriyalar.length > 0 && (
        <>
          <section className="fz-card fz-kpis p-4" aria-label={t('Resurs vedomosti jami')} data-testid="resurs-kpi">
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Smeta')}</span><SummaJuft obyektId={oid} ustamasiz={jamiSmeta} katKesim={smetaKesim} /></div>
            <div className="fz-kpi"><span className="fz-kpi__label">{t('F2 (tasdiqlangan)')}</span><SummaJuft obyektId={oid} ustamasiz={jamiF2} katKesim={f2Kesim} /></div>
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Qoldiq')}</span><b className="text-[14px] tabular-nums text-text"><FmtN val={jamiQoldiq} /></b><span className="fz-kpi__sub">{t('ustamasiz')}</span></div>
          </section>
          {jamiSmeta > 0 && (
            <div className="fz-panel">
              <div className="fz-panel__h"><span>{t('Resurs tarkibi (smeta summasi bo‘yicha)')}</span><span>{t('ustamasiz')}: <FmtN val={jamiSmeta} /></span></div>
              <div className="fz-split" role="img" aria-label={t('Resurs tarkibi (smeta summasi bo‘yicha)')}>
                {kategoriyalar.filter(k => k.jamiSmetaSumma > 0).map(k => <i key={k.kat} className={KAT_INFO[k.kat]?.bg ?? 'fz-bg-nomalum'} style={{ flex: k.jamiSmetaSumma }} title={`${KAT_INFO[k.kat] ? t(KAT_INFO[k.kat].nom) : k.kat}: ${Math.round((k.jamiSmetaSumma / jamiSmeta) * 100)}%`} />)}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-text-dim">
                {kategoriyalar.filter(k => k.jamiSmetaSumma > 0).map(k => <span key={k.kat} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className={KAT_INFO[k.kat]?.bg ?? 'fz-bg-nomalum'} style={{ width: 8, height: 8, borderRadius: 2 }} />{KAT_INFO[k.kat] ? t(KAT_INFO[k.kat].nom) : t('Boshqa')} <b className="tabular-nums text-text">{Math.round((k.jamiSmetaSumma / jamiSmeta) * 100)}%</b></span>)}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-start gap-3">
            <button type="button" className="fz-btn fz-btn--primary"
              onClick={() => void hujjat(false)}><FileSpreadsheet aria-hidden="true" />Ресурсная ведомость (Excel)</button>
            <button type="button" className="fz-btn" title={t('Saytda hujjatdagiday ko‘rish')}
              onClick={() => void hujjat(true)}><Eye aria-hidden="true" />{t('Ko‘rish')}</button>
            <div className="min-w-[260px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} tafsilot={imzoTafsilot} /></div>
          </div>
          <label className="relative block max-w-sm">
            <Search size={14} aria-hidden="true" className="absolute left-2.5 top-[9px] text-text-mute" />
            <input aria-label="Resurs qidirish" placeholder={t('Resurs qidirish')} className="h-8 w-full rounded-md border border-[var(--border-strong)] bg-bg pl-8 pr-2 text-[13px]"
              value={qidiruv} onChange={e => setQidiruv(e.target.value)} />
          </label>
          {korinadigan.map(k => (
            <details key={k.kat} className="fz-card" open>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 text-[13px] font-semibold">
                <KatNishon kat={k.kat} />
                <span className="text-text-dim font-normal">{KAT_INFO[k.kat] ? t(KAT_INFO[k.kat].nom) : ''} <span className="text-text-mute">({k.qatorlar.length} {t('resurs')})</span></span>
                <span className="ml-auto text-[11.5px] font-normal text-text-mute tabular-nums">
                  {t('Smeta')}: <FmtN val={k.jamiSmetaSumma} /> · F2: <FmtN val={k.jamiF2Summa} /> · {t('Qoldiq')}: <FmtN val={k.jamiQoldiqSumma} /> · {t('ustamasiz')}
                </span>
              </summary>
              {/* 8 ustun + uzun ruscha resurs nomlari: tor ekranda jadval
                  BUTUN sahifani gorizontal surib yubormasligi uchun o'z
                  konteyneri ichida suriladi. */}
              <div className="overflow-x-auto">
              <table className="fz-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>{t('Resurs')}</th><th>{t('Birlik')}</th>
                    <th className="fz-c-num">{t('Smeta hajm')}</th><th className="fz-c-num">{t('Smeta summa')}</th>
                    <th className="fz-c-num">{t('F2 hajm')}</th><th className="fz-c-num">{t('F2 summa')}</th>
                    <th>{t('F2 ulushi')}</th>
                    <th className="fz-c-num">{t('Qoldiq hajm')}</th><th className="fz-c-num">{t('Qoldiq summa')}</th>
                  </tr>
                </thead>
                <tbody>
                  {k.qatorlar.map(r => {
                    const ulush = r.smetaHajm > 0 ? Math.max(0, r.f2Hajm) / r.smetaHajm : null;
                    return (
                    <tr key={k.kat + '|' + r.nom + '|' + r.birlik}>
                      <td>{r.kod ? r.kod + ' ' : ''}{r.nom}</td>
                      <td className="fz-c-unit">{r.birlik || '—'}</td>
                      <td className="fz-c-num"><FmtN val={r.smetaHajm} /></td>
                      <td className="fz-c-num"><FmtN val={r.smetaSumma} /></td>
                      <td className="fz-c-num"><FmtN val={r.f2Hajm} /></td>
                      <td className="fz-c-num"><FmtN val={r.f2Summa} /></td>
                      <td style={{ minWidth: 120 }}>{ulush == null ? <span className="text-text-mute">—</span> : <span className={`fz-meter ${ulush > 1 ? 'fz-meter--over' : ''}`} style={{ minWidth: 0 }}><span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${Math.min(1, ulush) * 100}%` }} /></span><span className="fz-meter__f">{Math.round(ulush * 100)}%</span></span>}</td>
                      <td className="fz-c-num"><FmtN val={r.qoldiqHajm} /></td>
                      <td className="fz-c-num"><FmtN val={r.qoldiqSumma} /></td>
                    </tr>);
                  })}
                </tbody>
              </table>
              </div>
            </details>
          ))}
        </>
      )}
      {objectId && !loading && kategoriyalar.length === 0 && !error && (
        <p className="text-text-mute text-sm">{t('Bu obyektda resurs qatori topilmadi.')}</p>
      )}
    </div>
  );
}

export default function ResursVedomostNative({ obyektId }: { obyektId?: number } = {}) {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p className="text-[12.5px] text-text-mute">{t('Kompaniya yuklanmoqda…')}</p>;
  if (!joriy?.id) return <p className="fz-note fz-note--warn">{t('Kompaniyani tanlang.')}</p>;
  return <Sessiya key={`${joriy.id}:${obyektId ?? 'all'}`} companyId={joriy.id} fixedObjectId={obyektId} />;
}
