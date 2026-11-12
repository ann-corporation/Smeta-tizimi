/**
 * ObyektPortali.tsx — /admin/zakazchik/obyekt/:aloqaId/:obyektId. Buyurtmachi ko'zi bilan BITTA obyekt:
 * shartnoma, bajarilish (sertifikatlangan F2 / shartnoma), F2 aktlar ro'yxati va yuborilgan hujjatlar holati
 * (yuborildi -> ko'rib chiqilmoqda -> izoh -> qabul/rad). Yangi hisob YO'Q: raqamlar `zakazchikObyektlarOl` va
 * `taqdimlarOl` javobidan (server grant bo'yicha qirqiydi); ruxsat berilmagan ko'rsatkich bu yerga kelmaydi.
 * Summa: har akt uchun ikkita rasmiy raqam (ustamali + ustamasiz, NDS siz) va hujjatdagi podval satrlari; server hisoblaydi,\n * ichki koeffitsient/marja ko'rsatilmaydi. Eski serverda (ustama yo'q) faqat sertifikatlangan jami ko'rinadi.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { taqdimlarOl, zakazchikObyektlarOl, type TaqdimQisqa, type ZakazchikObyekt } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim, HolatBelgi, PodvalJadvali, TomonSummaJuft } from './tomon-ui';
import ObyektSorovlari from './ObyektSorovlari';
import { bajarilishFoizi, holatYigindisi } from './obyekt-portali-yordam';
import { oyMatn, pul, sana } from './tomon-yordam';
import { raqamTozala } from '../../lib/raqam-belgi';

function Kartochka({ nom, qiymat, izoh, rang }: { nom: string; qiymat: string; izoh?: string; rang?: string }) {
  return <div className="fz-kpi"><span className="fz-kpi__label">{rang && <i style={{ background: rang }} />}{t(nom)}</span><span className="fz-kpi__value">{qiymat}</span>{izoh && <span className="fz-kpi__sub">{t(izoh)}</span>}</div>;
}

/** Yuborilgan hujjatlar holati — segmentli chiziq (qabul / ko'rilmoqda / kutilmoqda / tuzatish / rad). */
const HOLAT_RANG: Array<[string, string]> = [['qabul', 'var(--ok)'], ['ko_rilmoqda', 'var(--info)'], ['yuborilgan', 'var(--warn)'], ['tuzatish', 'var(--kat-mash)'], ['rad', 'var(--danger)'], ['qaytarilgan', 'var(--border-strong)']];

export default function ObyektPortali() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const { aloqaId: aloqaP, obyektId: obyektP } = useParams();
  const aloqaId = Number(aloqaP); const obyektId = Number(obyektP);
  const [obyekt, setObyekt] = useState<ZakazchikObyekt | null>(null);
  const [hujjatlar, setHujjatlar] = useState<TaqdimQisqa[]>([]);
  const [xato, setXato] = useState('');
  const [yuklandi, setYuklandi] = useState(false);

  useEffect(() => {
    if (!kompaniyaId || !Number.isFinite(aloqaId) || !Number.isFinite(obyektId)) return;
    let bekor = false;
    void Promise.all([zakazchikObyektlarOl(kompaniyaId), taqdimlarOl(kompaniyaId, { yonalish: 'kelgan', aloqaId })]).then(([o, q]) => {
      if (bekor) return;
      const e = [o, q].find((x) => !x.ok);
      setXato(e && !e.ok ? e.error : '');
      if (o.ok) setObyekt(o.natija.find((x) => x.aloqa_id === aloqaId && x.obyekt_id === obyektId) ?? null);
      if (q.ok) setHujjatlar(q.natija);
      setYuklandi(true);
    });
    return () => { bekor = true; };
  }, [kompaniyaId, aloqaId, obyektId]);

  // obyekt_id bo'lsa u bo'yicha (20261108102000 dan keyin), aks holda nom bo'yicha (aloqa doirasida).
  const obyektHujjatlari = useMemo(() => (obyekt ? hujjatlar.filter((x) => (x.obyekt_id != null ? x.obyekt_id === obyekt.obyekt_id : x.obyekt_nom === obyekt.obyekt_nom)) : []), [hujjatlar, obyekt]);
  const yigindi = useMemo(() => holatYigindisi(obyektHujjatlari), [obyektHujjatlari]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Buyurtmachi kabineti" />;
  const foiz = obyekt ? bajarilishFoizi(obyekt.f2?.jami, obyekt.shartnoma?.summa_bez_nds) : null;
  const aktMaks = Math.max(0, ...(obyekt?.f2?.royxat ?? []).map((a) => Number(a.jami) || 0));
  const qabul = yigindi.qabul; const kutayotgan = (yigindi.yuborilgan?.soni ?? 0) + (yigindi.ko_rilmoqda?.soni ?? 0);

  return (
    <Sahifa sarlavha={obyekt?.obyekt_nom ?? 'Obyekt'} tavsif="Pudratchi sizga ochgan obyekt: bajarilish, aktlar va hujjatlar holati">
      <div className="space-y-4">
        <Link to="/admin/zakazchik" className="fz-btn fz-btn--ghost fz-btn--sm self-start">{t('Buyurtmachi kabinetiga qaytish')}</Link>
        {xato && <div role="alert" className="fz-note fz-note--danger">{xato}</div>}
        {yuklandi && !obyekt && !xato && <p className="fz-note">{t('Obyekt topilmadi yoki sizga ochilmagan.')}</p>}
        {obyekt && <>
          <p className="text-[13px] text-text-dim">{obyekt.qarshi_nom} — {obyekt.qarshi_rol}</p>
          <section className="fz-card fz-kpis p-4" aria-label={t('Obyekt ko‘rsatkichlari')}>
            <Kartochka nom="Shartnoma summasi (QQSsiz)" qiymat={obyekt.shartnoma ? pul(obyekt.shartnoma.summa_bez_nds) : t('ochilmagan')} izoh={obyekt.shartnoma ? `№ ${raqamTozala(obyekt.shartnoma.raqam)}` : undefined} />
            {obyekt.f2?.ustama_jami ? (
              <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--info)' }} />{t('Sertifikatlangan F2 jami')}</span>
                <span className="fz-kpi__value"><TomonSummaJuft u={obyekt.f2.ustama_jami} /></span><span className="fz-kpi__sub">{obyekt.f2.soni} {t('ta akt')}</span></div>
            ) : (
              <Kartochka nom="Sertifikatlangan F2 jami" qiymat={obyekt.f2 ? pul(obyekt.f2.jami) : t('ochilmagan')} izoh={obyekt.f2 ? `${obyekt.f2.soni} ${t('ta akt')}` : undefined} />)}
            <Kartochka nom="Bajarilish" qiymat={foiz == null ? '—' : `${foiz} %`} izoh="sertifikatlangan F2 / shartnoma" />
            <Kartochka nom="Qaror kutayotgan hujjat" qiymat={String(kutayotgan)} izoh={qabul ? `${t('Qabul qilingan')}: ${qabul.soni}` : undefined} rang={kutayotgan ? 'var(--warn)' : undefined} />
          </section>
          {foiz != null && (
            <section className="fz-panel" aria-label={t('Bajarilish')}>
              <div className="fz-panel__h"><span>{t('Bajarilish: sertifikatlangan F2 / shartnoma (QQSsiz)')}</span><span>{foiz > 100 ? t('shartnomadan oshgan') : t('qolgan: {f}%', { f: Math.round((100 - foiz) * 10) / 10 })}</span></div>
              <div role="progressbar" aria-valuenow={Math.min(foiz, 100)} aria-valuemin={0} aria-valuemax={100} className={`fz-meter fz-meter--lg ${foiz > 100 ? 'fz-meter--over' : ''}`}>
                <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${Math.min(foiz, 100)}%` }} /></span>
              </div>
            </section>
          )}
          {obyektHujjatlari.length > 0 && (
            <section className="fz-panel" aria-label={t('Hujjatlar holati')}>
              <div className="fz-panel__h"><span>{t('Yuborilgan hujjatlar holati')}</span><span>{obyektHujjatlari.length}</span></div>
              <div className="fz-split">{HOLAT_RANG.filter(([h]) => yigindi[h]?.soni).map(([h, r]) => <i key={h} style={{ background: r, flexGrow: yigindi[h].soni }} />)}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">{HOLAT_RANG.filter(([h]) => yigindi[h]?.soni).map(([h]) => (
                <span key={h} className="inline-flex items-center gap-1.5"><HolatBelgi holat={h} turi="taqdim" /><b className="tabular-nums">{yigindi[h].soni}</b>{yigindi[h].summa ? <span className="text-text-mute">{pul(yigindi[h].summa)}</span> : null}</span>))}</div>
            </section>
          )}

          <Bolim sarlavha="Yuborilgan hujjatlar" amal={<Link to="/admin/taqdimlar" className="text-xs text-accent underline">{t('Qaror chiqarish')}</Link>}>
            {obyektHujjatlari.length === 0 ? <p className="text-[13px] text-text-mute">{t('Hujjat yo‘q')}</p> : (
              <ul className="divide-y divide-border">{obyektHujjatlari.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]">
                  <Link to={`/admin/taqdimlar?id=${x.id}`} className="font-medium text-accent underline">{x.nom}</Link>
                  <span className="text-text-dim">{oyMatn(x.oy)} · {pul(x.summa)}</span><HolatBelgi holat={x.holat} turi="taqdim" />
                  {x.qaror_izoh && <span className="text-xs text-text-dim">— {x.qaror_izoh}</span>}
                  <span className="ml-auto text-xs text-text-dim">{sana(x.taqdim_vaqti)}</span>
                </li>))}</ul>)}
          </Bolim>

          <Bolim sarlavha="Sertifikatlangan F2 aktlar">
            {!obyekt.f2 ? <p className="text-[13px] text-text-mute">{t('Pudratchi F2 ni sizga hali ochmagan.')}</p> : obyekt.f2.royxat.length === 0 ? <p className="text-[13px] text-text-mute">{t('Hali sertifikatlangan akt yo‘q')}</p> : (
              <div className="fz-table-wrap"><table className="fz-table min-w-[520px]"><thead><tr><th>№</th><th>{t('Oy')}</th><th style={{ width: '30%' }}>{t('Oy hissasi')}</th><th className="fz-c-num">{t('Summa (QQSsiz)')}</th></tr></thead>
                <tbody>{obyekt.f2.royxat.map((a) => (
                  <tr key={a.akt_id} className="align-top"><td>{a.raqam ?? a.akt_id}</td><td>{oyMatn(a.oy)}</td>
                    <td>{aktMaks > 0 && a.jami != null ? <span className="fz-meter" title={t('eng katta aktga nisbatan')}><span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${Math.max(0, Number(a.jami)) / aktMaks * 100}%` }} /></span></span> : <span className="text-text-mute">—</span>}</td>
                    <td className="fz-c-num">{a.ustama ? (
                      <div className="flex flex-col items-end gap-1"><TomonSummaJuft u={a.ustama} kichik />
                        <details className="text-left"><summary className="cursor-pointer text-[11px] text-accent">{t('Hujjatdagi podval')}</summary><PodvalJadvali podval={a.ustama.podval} /></details></div>
                    ) : <span className="tabular-nums">{pul(a.jami)}</span>}</td></tr>))}</tbody></table></div>)}
          </Bolim>

          <ObyektSorovlari kompaniyaId={kompaniyaId} aloqaId={aloqaId} obyektId={obyektId} obyektNom={obyekt.obyekt_nom} />
        </>}
      </div>
    </Sahifa>
  );
}
