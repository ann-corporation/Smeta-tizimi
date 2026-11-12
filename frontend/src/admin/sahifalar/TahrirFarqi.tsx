/**
 * TahrirFarqi.tsx — «Tahrirlar farqi» (loyiha-smeta sahifasi ichida): chizma to'plamining ikki tahriri varaq belgisi bo'yicha, miqdor farqi foizi va pul ta'siri,
 * «smeta eskirgan» bo'limlari va har farq uchun QAROR (smetaga ko'chirish / pereraschet / qoldirish). Asl smeta o'zgarmaydi: bu yerda faqat belgi va qaror yozuvi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bolim } from '../zakazchik/tomon-ui';
import { inp, tugma, tugmaAsosiy } from '../zakazchik/tomon-yordam';
import { toast } from '../../umumiy/ui/Toast';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { katKesimJamiBilan } from '../../lib/ustamali-summa';
import { loyihaTahrirAsos, loyihaTahrirFarqOl, loyihaTahrirQaror, type TahrirQatori } from '../../api/t2-loyiha-smeta';
import { eskirganBolimlar, tahrirJami, tahrirJuftligi, tahrirQatorlari, type TahrirFarqDB, type TahrirHolat, type TahrirQarorTuri } from '../../lib/loyiha-smeta/tahrir-farq';
import { t } from '../../i18n/til';

const HOLAT_NOMI: Record<TahrirHolat | 'olingan_varaq' | 'yangi_varaq' | 'ayni', string> = {
  ozgargan: 'o‘zgargan', olingan: 'olib tashlangan', yangi: 'yangi', olingan_varaq: 'varaq olib tashlangan', yangi_varaq: 'yangi varaq', ayni: 'o‘zgarmagan',
};
const QAROR_NOMI: Record<TahrirQarorTuri, string> = { smetaga_kochir: 'Smetaga ko‘chirish', pereraschet: 'Pereraschet', qoldir: 'Qoldirish' };
const fmt = (n: number | null, d = 2) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(n));

export function TahrirFarqi({ kompaniyaId, obyektId, tahrirlar, yangila }: { kompaniyaId: number; obyektId: number; tahrirlar: TahrirQatori[]; yangila: () => void }) {
  const j = useMemo(() => tahrirJuftligi(tahrirlar), [tahrirlar]);
  const [eski, setEski] = useState<number | ''>('');
  const [yangi, setYangi] = useState<number | ''>('');
  const [d, setD] = useState<TahrirFarqDB | null>(null);
  const [xato, setXato] = useState('');
  useEffect(() => { if (j) { setEski(j.eski); setYangi(j.yangi); } }, [j?.eski, j?.yangi]);   // eslint-disable-line react-hooks/exhaustive-deps
  const yukla = useCallback(async () => {
    if (eski === '' || yangi === '' || eski === yangi) { setD(null); return; }
    const r = await loyihaTahrirFarqOl(kompaniyaId, obyektId, eski, yangi);
    if (!r.ok) { setXato(r.error); setD(null); return; }
    setXato(''); setD(r.natija);
  }, [kompaniyaId, obyektId, eski, yangi]);
  useEffect(() => { void yukla(); }, [yukla]);

  const qatorlar = useMemo(() => (d ? tahrirQatorlari(d) : []), [d]);
  const jami = useMemo(() => (d ? tahrirJami(d, qatorlar) : null), [d, qatorlar]);
  const bolimlar = useMemo(() => eskirganBolimlar(qatorlar), [qatorlar]);
  const asos = tahrirlar.find((x) => x.smeta_asosi) ?? null;
  const smetaEskirgan = asos != null && eski === asos.id && yangi !== '' && yangi !== eski;
  const kesim = useMemo(() => katKesimJamiBilan(qatorlar, (x) => x.qator?.kat ?? null, (x) => x.pulQQSsiz, jami?.pulQQSsiz ?? 0), [qatorlar, jami]);

  async function asosBelgila(id: number) {
    const r = await loyihaTahrirAsos(kompaniyaId, { obyektId, tahrirId: id });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Smeta asosi belgilandi'), 'ok'); yangila();
  }
  async function qaror(varaq: string, kalit: string, tur: TahrirQarorTuri) {
    if (eski === '' || yangi === '') return;
    let sabab: string | undefined;
    if (tur === 'qoldir') { const s = window.prompt(t('Nega qoldiriladi? (sabab majburiy)')); if (!s || s.trim().length < 3) { toast(t('Sababni yozing'), 'warn'); return; } sabab = s.trim(); }
    const r = await loyihaTahrirQaror(kompaniyaId, { obyektId, eskiId: eski, yangiId: yangi, varaq, kalit, qaror: tur, sabab });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Qaror yozildi'), 'ok'); await yukla();
  }

  if (tahrirlar.length === 0) return <Bolim sarlavha="Tahrirlar farqi"><p className="text-xs">{t('Chizma to‘plamining tahrirlari yo‘q: yuqorida PDF yuklashda tahrir nomini kiriting (masalan «Ekspertiza 2026-01-28»).')}</p></Bolim>;
  return (
    <Bolim sarlavha="Tahrirlar farqi">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
        <label>{t('Eski tahrir')} <select className={inp} value={eski} onChange={(e) => setEski(e.target.value ? Number(e.target.value) : '')}><option value="">—</option>{tahrirlar.map((x) => <option key={x.id} value={x.id}>{x.nom}{x.smeta_asosi ? ` · ${t('smeta asosi')}` : ''} ({x.varaq_soni})</option>)}</select></label>
        <label>{t('Yangi tahrir')} <select className={inp} value={yangi} onChange={(e) => setYangi(e.target.value ? Number(e.target.value) : '')}><option value="">—</option>{tahrirlar.map((x) => <option key={x.id} value={x.id}>{x.nom} ({x.varaq_soni})</option>)}</select></label>
        {eski !== '' && eski !== asos?.id && <button type="button" className={tugma} onClick={() => void asosBelgila(eski)}>{t('Smeta shu tahrirga asoslangan')}</button>}
      </div>
      {xato && <p className="text-sm text-danger">{xato}</p>}
      {!asos && <p className="mb-2 text-xs">{t('Smeta qaysi tahrirga asoslangani belgilanmagan: «Eski tahrir» ni tanlab, «Smeta shu tahrirga asoslangan» ni bosing.')}</p>}
      {d && jami && (
        <>
          {smetaEskirgan && (
            <div className="mb-2 rounded border border-warn p-2 text-[13px]"><b>{t('Smeta eskirgan')}</b>: {t('{n} ta smeta bo‘limi yangi tahrirda o‘zgargan elementlarga bog‘langan', { n: bolimlar.length })}. {t('Qarori kerak')}: {jami.qarorKutadi}. {t('Asl smeta o‘zgarmaydi.')}</div>)}
          <div className="mb-2 grid gap-2 text-sm sm:grid-cols-3">
            <div><b>{t('Pul ta’siri (loyiha o‘zgarishi)')}</b><SummaJuft obyektId={obyektId} ustamasiz={jami.pulQQSsiz} katKesim={kesim} /></div>
            <div className="text-xs">{t('Varaqlar')}: {t('o‘zgargan')} {jami.varaqOzgargan}, {t('olib tashlangan')} {jami.varaqOlingan}, {t('yangi')} {jami.varaqYangi}<br />{t('Elementlar')}: {jami.elementSoni} · {t('qarori kerak')}: {jami.qarorKutadi}</div>
            <div className="text-xs">{t('Narxsiz (summa noma‘lum, «—»)')}: {jami.narxsizSoni} · {t('smetaga bog‘lanmagan')}: {jami.bogsizSoni}</div>
          </div>
          {bolimlar.length > 0 && (
            <div className="mb-2 text-[13px]"><b>{t('Eskirgan smeta bo‘limlari')}</b>
              {bolimlar.slice(0, 12).map((b) => <div key={b.bolimId} className="text-xs">{(b.bolimNom ?? `#${b.bolimId}`).slice(0, 90)} · {b.soni} · {b.varaqlar.join(', ')} · {fmt(b.pulQQSbilan)} {t('so‘m')} ({t('QQS bilan')}) · {t('qarori bor')}: {b.hal}</div>)}</div>)}
          <div className="mb-2 text-xs">{d.varaqlar.filter((v) => v.holat !== 'ayni').map((v) => <span key={v.varaq} className="mr-2 inline-block rounded border px-1">{v.varaq}: {t(HOLAT_NOMI[v.holat])}</span>)}</div>
          <div className="overflow-x-auto"><table className="w-full text-[13px]">
            <thead><tr className="text-left"><th>{t('Varaq')}</th><th>{t('Element')}</th><th>{t('Holat')}</th><th className="num">{t('Eski')}</th><th className="num">{t('Yangi')}</th><th className="num">%</th><th className="num">{t('Pul (QQS bilan / siz)')}</th><th>{t('Qaror')}</th></tr></thead>
            <tbody>{qatorlar.map((x) => (
              <tr key={`${x.item.varaq}|${x.item.kalit}`} className="border-t align-top">
                <td>{x.item.varaq}</td><td>{x.item.nom}{x.qator && <div className="text-xs">{x.qator.nom.slice(0, 50)}</div>}</td><td>{t(HOLAT_NOMI[x.item.holat])}</td>
                <td className="num">{fmt(x.item.eski_miqdor, 3)} {x.item.eski_birlik ?? ''}</td><td className="num">{fmt(x.item.yangi_miqdor, 3)} {x.item.yangi_birlik ?? ''}</td>
                <td className="num">{x.item.foiz == null ? '—' : `${x.item.foiz > 0 ? '+' : ''}${fmt(x.item.foiz)}`}</td>
                <td className="num">{fmt(x.pulQQSbilan)}<div className="text-xs">{fmt(x.pulQQSsiz)}</div></td>
                <td className="text-xs">{x.qaror ? <b>{t(QAROR_NOMI[x.qaror])}</b> : (
                  <div className="flex flex-wrap gap-1">{(['smetaga_kochir', 'pereraschet', 'qoldir'] as TahrirQarorTuri[]).map((q) => <button key={q} type="button" className={q === 'smetaga_kochir' ? tugmaAsosiy : tugma} onClick={() => void qaror(x.item.varaq, x.item.kalit, q)}>{t(QAROR_NOMI[q])}</button>)}</div>)}</td>
              </tr>))}</tbody></table></div>
          {qatorlar.length === 0 && <p className="text-sm">{t('Tahrirlar orasida o‘zgarish topilmadi')}</p>}
        </>
      )}
    </Bolim>
  );
}
