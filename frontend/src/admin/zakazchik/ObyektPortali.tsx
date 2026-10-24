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

function Kartochka({ nom, qiymat, izoh }: { nom: string; qiymat: string; izoh?: string }) {
  return <div className="rounded-lg border border-border px-3 py-2"><div className="text-[11px] uppercase text-text-dim">{t(nom)}</div><div className="text-xl font-semibold tabular-nums">{qiymat}</div>{izoh && <div className="text-[11px] text-text-dim">{t(izoh)}</div>}</div>;
}

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
  const qabul = yigindi.qabul; const kutayotgan = (yigindi.yuborilgan?.soni ?? 0) + (yigindi.ko_rilmoqda?.soni ?? 0);

  return (
    <Sahifa sarlavha={obyekt?.obyekt_nom ?? 'Obyekt'} tavsif="Pudratchi sizga ochgan obyekt: bajarilish, aktlar va hujjatlar holati">
      <div className="space-y-4">
        <Link to="/admin/zakazchik" className="text-xs text-accent underline">{t('Buyurtmachi kabinetiga qaytish')}</Link>
        {xato && <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
        {yuklandi && !obyekt && !xato && <p className="text-sm text-text-dim">{t('Obyekt topilmadi yoki sizga ochilmagan.')}</p>}
        {obyekt && <>
          <p className="text-sm text-text-dim">{obyekt.qarshi_nom} — {obyekt.qarshi_rol}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kartochka nom="Shartnoma summasi (QQSsiz)" qiymat={obyekt.shartnoma ? pul(obyekt.shartnoma.summa_bez_nds) : t('ochilmagan')} izoh={obyekt.shartnoma ? `№ ${obyekt.shartnoma.raqam}` : undefined} />
            {obyekt.f2?.ustama_jami ? (
              <div className="rounded-lg border border-border px-3 py-2"><div className="text-[11px] uppercase text-text-dim">{t('Sertifikatlangan F2 jami')}</div>
                <div className="text-xl font-semibold"><TomonSummaJuft u={obyekt.f2.ustama_jami} /></div><div className="text-[11px] text-text-dim">{obyekt.f2.soni} {t('ta akt')}</div></div>
            ) : (
              <Kartochka nom="Sertifikatlangan F2 jami" qiymat={obyekt.f2 ? pul(obyekt.f2.jami) : t('ochilmagan')} izoh={obyekt.f2 ? `${obyekt.f2.soni} ${t('ta akt')}` : undefined} />)}
            <Kartochka nom="Bajarilish" qiymat={foiz == null ? '—' : `${foiz} %`} izoh="sertifikatlangan F2 / shartnoma" />
            <Kartochka nom="Qaror kutayotgan hujjat" qiymat={String(kutayotgan)} izoh={qabul ? `${t('Qabul qilingan')}: ${qabul.soni}` : undefined} />
          </div>
          {foiz != null && (
            <div role="progressbar" aria-valuenow={Math.min(foiz, 100)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded bg-surface-2">
              <div className="h-full bg-accent" style={{ width: `${Math.min(foiz, 100)}%` }} />
            </div>
          )}

          <Bolim sarlavha="Yuborilgan hujjatlar" amal={<Link to="/admin/taqdimlar" className="text-xs text-accent underline">{t('Qaror chiqarish')}</Link>}>
            {obyektHujjatlari.length === 0 ? <p className="text-sm text-text-dim">{t('Hujjat yo‘q')}</p> : (
              <ul className="space-y-1">{obyektHujjatlari.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/admin/taqdimlar?id=${x.id}`} className="font-medium text-accent underline">{x.nom}</Link>
                  <span className="text-text-dim">{oyMatn(x.oy)} · {pul(x.summa)}</span><HolatBelgi holat={x.holat} turi="taqdim" />
                  {x.qaror_izoh && <span className="text-xs text-text-dim">— {x.qaror_izoh}</span>}
                  <span className="ml-auto text-xs text-text-dim">{sana(x.taqdim_vaqti)}</span>
                </li>))}</ul>)}
          </Bolim>

          <Bolim sarlavha="Sertifikatlangan F2 aktlar">
            {!obyekt.f2 ? <p className="text-sm text-text-dim">{t('Pudratchi F2 ni sizga hali ochmagan.')}</p> : obyekt.f2.royxat.length === 0 ? <p className="text-sm text-text-dim">{t('Hali sertifikatlangan akt yo‘q')}</p> : (
              <table className="w-full min-w-[420px] text-xs"><thead className="text-left text-text-dim"><tr><th className="px-2 py-1">№</th><th className="px-2 py-1">{t('Oy')}</th><th className="px-2 py-1 text-right">{t('Summa (QQSsiz)')}</th></tr></thead>
                <tbody>{obyekt.f2.royxat.map((a) => (
                  <tr key={a.akt_id} className="border-t align-top"><td className="px-2 py-1">{a.raqam ?? a.akt_id}</td><td className="px-2 py-1">{oyMatn(a.oy)}</td>
                    <td className="px-2 py-1 text-right">{a.ustama ? (
                      <div className="flex flex-col items-end gap-1"><TomonSummaJuft u={a.ustama} kichik />
                        <details className="text-left"><summary className="cursor-pointer text-[11px] text-accent">{t('Hujjatdagi podval')}</summary><PodvalJadvali podval={a.ustama.podval} /></details></div>
                    ) : <span className="tabular-nums">{pul(a.jami)}</span>}</td></tr>))}</tbody></table>)}
          </Bolim>

          <ObyektSorovlari kompaniyaId={kompaniyaId} aloqaId={aloqaId} obyektId={obyektId} obyektNom={obyekt.obyekt_nom} />
        </>}
      </div>
    </Sahifa>
  );
}
