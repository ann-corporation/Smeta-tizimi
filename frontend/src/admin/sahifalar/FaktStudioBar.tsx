import { useEffect, useState } from 'react';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import type { FaktYigindi } from '../../lib/fakt-studio';
import { nakopitelniyMoslik, type BolimSumma } from '../../lib/fakt-jurnal';
import { t2NakopitelniyOl, type NakopitelniyJami } from '../../api/t2-nakopitelniy';

/** Narx qoidasi izohi (yadro `faktSummaF2Narxda`): tasdiqlangan F2 bor pozitsiyalarda fakt summasi F2 narxida. */
export function FaktF2Izoh({ f2Narxda }: { f2Narxda: number }) {
  if (!f2Narxda) return null;
  return <div className="text-[10px] text-text-mute" data-testid="fakt-f2-izoh">
    {t('fakt summasi tasdiqlangan F2 narxida: {n} ta pozitsiya (fakt hajmi o‘zgarmaydi)', { n: String(f2Narxda) })}
  </div>;
}

/**
 * Fakt Studio yig'indi paneli: shu obyekt bo'yicha fakt (ustamali + ustamasiz), smetada yo'q yangi ishlar,
 * bajarilmaydigan hajmlar va F2 tayyorlashga o'tish. Barcha summalar SummaJuft orqali (ustamali asosiy, ustamasiz kichik).
 * Obyekt jamisi yonida: «Nakopitelniy smeta = daraxt smeta + qo'shimcha ishlar» va Nakopitelniy bilan farq bo'lsa — ogohlantirish.
 */
export function FaktStudioBar({ yigindi, obyektId, kompaniyaId, onF2, onYangiIsh, band, jami }: {
  yigindi: FaktYigindi; obyektId: number; kompaniyaId: number;
  /** «Faktdan F2» tez yo'li: tanlangan F2 davri (YYYY-MM) bilan F2 tayyorlashga o'tish. */
  onF2?: (oy: string) => void; onYangiIsh?: () => void; band?: boolean;
  /** Obyekt jami: smeta / F2 / qoldiq summalari (ustamali + ustamasiz). */
  jami?: BolimSumma;
}) {
  const y = yigindi;
  const [oy, setOy] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  /** Nakopitelniy jami (faqat jami: limit 1) — daraxt jamisi bilan solishtirish uchun; o'qilmasa solishtirilmaydi. */
  const [nak, setNak] = useState<NakopitelniyJami | null>(null);
  const bor = !!jami;
  useEffect(() => {
    if (!bor) return;
    let tirik = true;
    setNak(null);
    Promise.resolve().then(() => t2NakopitelniyOl(obyektId, null, 1, 0)).then((r) => { if (tirik && r?.ok && r.jami) setNak(r.jami); }).catch(() => undefined);
    return () => { tirik = false; };
  }, [obyektId, bor]);
  const ml = jami ? nakopitelniyMoslik(jami, nak) : null;
  return <section className="karta flex flex-wrap items-start gap-x-6 gap-y-2 px-3 py-2" aria-label={t('Fakt yig‘indisi')} data-testid="fakt-studio-bar">
    <div><div className="text-[10px] uppercase text-text-mute">{t('Fakt (hozircha)')}</div>
      <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={y.faktUstamasiz} katKesim={y.faktKesim} />
      <FaktF2Izoh f2Narxda={y.faktF2Narxda} /></div>
    {jami && ([['smeta', t('Smeta')], ['f2', t('F2 (tasdiqlangan)')], ['qoldiq', t('Qoldiq')]] as const).map(([k, l]) => <div key={k} data-testid={`fs-jami-${k}`}><div className="text-[10px] uppercase text-text-mute">{l}</div>
      <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami[k].ustamasiz} katKesim={jami[k].kesim} /></div>)}
    <div><div className="text-[10px] uppercase text-text-mute">{t('Smetada yo‘q ishlar')}: <b className="text-text" data-testid="fs-yangi-soni">{y.yangiSoni}</b></div>
      {y.yangiSoni > 0 && <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={y.yangiUstamasiz} katKesim={y.yangiKesim} />}</div>
    <div><div className="text-[10px] uppercase text-text-mute">{t('Bajarilmaydi')}: <b className="text-text" data-testid="fs-bajarilmadi-soni">{y.bajarilmadiSoni}</b></div>
      {y.bajarilmadiSoni - y.bajarilmadiNarxsiz > 0 && <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={y.bajarilmadiUstamasiz} katKesim={y.bajarilmadiKesim} />}
      {y.bajarilmadiNarxsiz > 0 && <div className="text-[10px] text-warn" data-testid="fs-narxsiz">{t('narxi noma‘lum: {n} ta', { n: String(y.bajarilmadiNarxsiz) })}</div>}</div>
    <div className="ml-auto flex items-center gap-2">
      {onYangiIsh && <button type="button" onClick={onYangiIsh} className="fz-btn">+ {t('Smetada yo‘q ish')}</button>}
      {onF2 && <label className="flex items-center gap-1.5 text-[11px] text-text-mute">{t('F2 davri')}
        <input type="month" value={oy} onChange={(e) => setOy(e.target.value)} aria-label={t('F2 davri')} className="input h-8 px-2 text-[12px] text-text" /></label>}
      {onF2 && <button type="button" disabled={band || !/^\d{4}-\d{2}$/.test(oy)} onClick={() => onF2(oy)} data-testid="faktdan-f2"
        title={t('Shu davr uchun F2 qoralama: fakt − F2 > 0 bo‘lgan barcha ishlar avtomatik olinadi; tasdiq — F2 tarixida (egasi)')} className="fz-btn fz-btn--primary">{t('Fakt bo‘yicha F2 qoralama')} →</button>}
    </div>
    {jami && ml && jami.qoshimcha.ustamasiz != null && <div className="w-full text-[11px] text-text-mute" data-testid="fs-nak-smeta">
      {t('Nakopitelniy smeta')} = {t('daraxt smeta')} <FmtN val={jami.smeta.ustamasiz} /> + {t('qo‘shimcha ishlar')} (<FmtN val={jami.qoshimcha.ustamasiz} />) = <b className="text-text"><FmtN val={ml.smetaJami} /></b> {t('(ustamasiz, NDS siz)')}</div>}
    {nak && ml && !ml.mos && <div className="fz-note fz-note--warn w-full text-[11px]" role="status" data-testid="fs-nak-farq">
      {t('Nakopitelniy bilan farq')}: {ml.smetaFarq != null && Math.abs(ml.smetaFarq) > 1 && <>{t('smeta')} <FmtN val={ml.smetaFarq} /> </>}
      {ml.f2Farq != null && Math.abs(ml.f2Farq) > 1 && <>{t('F2')} <FmtN val={ml.f2Farq} /> </>}
      {t('(daraxt − Nakopitelniy; tekshiring)')}</div>}
  </section>;
}
