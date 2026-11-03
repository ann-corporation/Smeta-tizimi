import { useMemo, useState } from 'react';
import { Calculator, Fuel, Pencil, Plus, Tags } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsBoshQator, OpsMaydon } from '../components/kompaniya-ops/OpsUi';
import { toast } from '../umumiy/ui/Toast';
import type { Tarif } from '../api/t2-transport';
import { tannarxHisobla } from '../lib/transport/xarajat';
import { narxHisobla } from '../lib/transport/narxlash';
import { useTPark, useTSozlama, useTYoz } from './hooks';
import { FormOyna, type Maydon } from './FormOyna';
import { INP, NarxQqs, Tannarx, bugunISO, foiz, raqamYoki, som } from './format';
import { xatoMatn } from './xato';

const YOQ = ['dizel', 'benzin', 'metan', 'propan', 'elektr'];

export default function NarxlashTab({ kompaniyaId, yozish }: { kompaniyaId: number; yozish: boolean }) {
  const park = useTPark(kompaniyaId); const soz = useTSozlama(kompaniyaId); const yoz = useTYoz(kompaniyaId);
  const [mId, setMId] = useState(''); const [hId, setHId] = useState(''); const [tId, setTId] = useState('');
  const [km, setKm] = useState(''); const [tonna, setTonna] = useState(''); const [soat, setSoat] = useState('');
  const [forma, setForma] = useState<null | { tur: 'tarif' | 'yoqilgi'; q: Record<string, unknown> }>(null);
  const m = park.data?.mashinalar.find((x) => String(x.id) === mId) ?? null;
  const h = park.data?.haydovchilar.find((x) => String(x.id) === hId) ?? null;
  const tarif = soz.data?.tariflar.find((x) => String(x.id) === tId) ?? null;
  const kmN = raqamYoki(km), tonnaN = raqamYoki(tonna), soatN = raqamYoki(soat);

  const tn = useMemo(() => m ? tannarxHisobla(
    { yoqilgiTuri: m.yoqilgi_turi as 'dizel', norma100km: m.norma_100km, normaMotosoat: m.norma_motosoat, egalik: m.egalik, amortKm: m.amort_km, amortSoat: m.amort_soat, ijaraKm: m.ijara_km, ijaraSoat: m.ijara_soat, ijaraKun: m.ijara_kun, kutishSoatNarx: m.kutish_soat_narx },
    h ? { tolovTuri: h.tolov_turi, tolovStavka: h.tolov_stavka, ijtimoiyFoiz: h.ijtimoiy_foiz } : null,
    { sana: bugunISO(), rejaKm: kmN, rejaDaqiqa: soatN != null ? Math.round(soatN * 60) : null, kmBoshi: null, kmOxiri: null, faktKm: null, motoBoshi: null, motoOxiri: null, ishSoat: soatN, boshlandi: null, tugadi: null, kutishDaqiqa: null,
      yoqilgiSarfiL: null, yoqilgiNarxFakt: null, normaKoef: 1, yolHaqi: null, boshqaXarajat: null },
    (soz.data?.yoqilgi_narxlari ?? []).map((n) => ({ yoqilgiTuri: n.yoqilgi_turi, sana: n.sana, narx: n.narx }))) : null, [m, h, kmN, soatN, soz.data]);
  const narx = useMemo(() => tarif ? narxHisobla({ kmNarx: tarif.km_narx, tonnaKmNarx: tarif.tonna_km_narx, soatNarx: tarif.soat_narx, reysNarx: tarif.reys_narx, minimalSumma: tarif.minimal_summa, marjaFoiz: tarif.marja_foiz,
    qqsFoiz: tarif.qqs_foiz, qqsKiritilgan: tarif.qqs_kiritilgan }, { km: kmN, tonna: tonnaN, soat: soatN }, tn ? { jami: tn.jami, toliq: tn.toliq } : null) : null, [tarif, kmN, tonnaN, soatN, tn]);

  const tarifMaydon: Maydon[] = [
    { k: 'nom', nom: t('Tarif nomi'), tur: 'matn', majburiy: true, keng: true }, { k: 'zona', nom: t('Zona / hudud'), tur: 'matn' }, { k: 'mashina_turi', nom: t('Mashina turi'), tur: 'matn' },
    { k: 'km_narx', nom: t('1 km uchun, so‘m'), tur: 'pul' }, { k: 'tonna_km_narx', nom: t('1 tonna-km uchun, so‘m'), tur: 'pul' }, { k: 'soat_narx', nom: t('1 soat uchun, so‘m'), tur: 'pul' }, { k: 'reys_narx', nom: t('Reys boshiga qo‘shimcha, so‘m'), tur: 'pul' },
    { k: 'minimal_summa', nom: t('Minimal summa, so‘m'), tur: 'pul' }, { k: 'marja_foiz', nom: t('Maqsadli marja, %'), tur: 'son', izoh: t('Narx tannarxdan shu marja bilan past bo‘lmasligi tavsiya qilinadi') },
    { k: 'qqs_foiz', nom: t('QQS, %'), tur: 'son' }, { k: 'qqs_kiritilgan', nom: t('Tarif narxlari QQS bilan kiritilganmi?'), tur: 'ha_yoq' },
    { k: 'holat', nom: t('Holati'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'faol', nom: t('Faol') }, { v: 'nofaol', nom: t('Nofaol') }] },
  ];
  const yoqMaydon: Maydon[] = [
    { k: 'yoqilgi_turi', nom: t('Yoqilg‘i turi'), tur: 'tanlov', majburiy: true, variantlar: YOQ.map((x) => ({ v: x, nom: x })) }, { k: 'sana', nom: t('Qaysi sanadan'), tur: 'sana', majburiy: true },
    { k: 'narx', nom: t('Narx, so‘m (QQS siz)'), tur: 'pul', majburiy: true }, { k: 'izoh', nom: t('Izoh'), tur: 'matn', keng: true },
  ];
  const saqla = async (amal: 'tarif_saqla' | 'yoqilgi_narx_saqla', data: Record<string, unknown>) => {
    try { await yoz.mutateAsync({ amal, data }); toast(t('Saqlandi')); } catch (e) { throw new Error(xatoMatn(e)); }
  };
  const tarifQoshuv = (x: Tarif) => [x.km_narx != null ? `${som(x.km_narx)}/${t('km')}` : null, x.tonna_km_narx != null ? `${som(x.tonna_km_narx)}/${t('t·km')}` : null, x.soat_narx != null ? `${som(x.soat_narx)}/${t('soat')}` : null, x.reys_narx != null ? `+${som(x.reys_narx)}/${t('reys')}` : null].filter(Boolean).join(' · ') || '—';

  return (
    <div className="flex flex-col gap-5">
      <section className="fz-card p-4">
        <h3 className="mb-3 inline-flex items-center gap-2 text-[14px] font-semibold"><Calculator className="h-4 w-4" />{t('Narx kalkulyatori')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <OpsMaydon nom={t('Mashina')}><select className={INP} value={mId} onChange={(e) => { setMId(e.target.value); const x = park.data?.mashinalar.find((q) => String(q.id) === e.target.value); setHId(x?.haydovchi_id ? String(x.haydovchi_id) : hId); }}><option value="">{t('— tanlang —')}</option>{park.data?.mashinalar.map((x) => <option key={x.id} value={x.id}>{x.nomi}</option>)}</select></OpsMaydon>
          <OpsMaydon nom={t('Haydovchi')}><select className={INP} value={hId} onChange={(e) => setHId(e.target.value)}><option value="">{t('— tanlanmagan —')}</option>{park.data?.haydovchilar.map((x) => <option key={x.id} value={x.id}>{x.ism}</option>)}</select></OpsMaydon>
          <OpsMaydon nom={t('Tarif')}><select className={INP} value={tId} onChange={(e) => setTId(e.target.value)}><option value="">{t('— tanlang —')}</option>{soz.data?.tariflar.filter((x) => x.holat === 'faol').map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></OpsMaydon>
          <OpsMaydon nom={t('Masofa, km')}><input className={INP} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></OpsMaydon>
          <OpsMaydon nom={t('Yuk, tonna')}><input className={INP} inputMode="decimal" value={tonna} onChange={(e) => setTonna(e.target.value)} /></OpsMaydon>
          <OpsMaydon nom={t('Ish vaqti, soat')}><input className={INP} inputMode="decimal" value={soat} onChange={(e) => setSoat(e.target.value)} /></OpsMaydon>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <b className="text-[13px]">{t('Ichki tannarx')}</b>
            {tn ? <div className="mt-1 text-[12px]">
              <div className="num">{t('Yoqilg‘i')}: {som(tn.yoqilgi.summa)}</div><div className="num">{t('Haydovchi')}: {som(tn.haydovchi)}</div><div className="num">{t('Amortizatsiya / ijara')}: {som(tn.amortizatsiya)}</div>
              <div className="mt-1"><Tannarx jami={tn.jami} toliq={tn.toliq} /></div>
              {!tn.toliq && <div className="text-warn">{t('Yetishmaydi')}: {tn.yetishmaydi.join(', ')}</div>}
              {kmN != null && tonnaN != null && tonnaN > 0 && kmN > 0 && <div className="text-text-mute">{t('1 tonna-km tannarxi')}: <span className="num">{som(tn.jami / (tonnaN * kmN))}</span></div>}
            </div> : <p className="mt-1 text-[12px] text-text-mute">{t('Mashinani tanlang')}</p>}
          </div>
          <div className="rounded-lg border border-border p-3">
            <b className="text-[13px]">{t('Mijozga narx')}</b>
            {narx ? <div className="mt-1 flex flex-col gap-1 text-[12px]">
              <div className="flex items-baseline justify-between"><span>{t('Tavsiya etilgan (asosiy)')}</span><NarxQqs qqsSiz={narx.tavsiyaQqsSiz} qqsFoiz={tarif?.qqs_foiz ?? 12} /></div>
              <div className="flex justify-between"><span>{t('Tarif bo‘yicha (QQS siz)')}</span><span className="num">{som(narx.tarifQqsSiz)}</span></div>
              <div className="flex justify-between"><span>{t('Marja uchun minimal (QQS siz)')}</span><span className="num">{som(narx.marjaUchunMin)}</span></div>
              <div className="flex justify-between"><span>{t('QQS')}</span><span className="num">{som(narx.qqs)}</span></div>
              <div className="flex justify-between border-t border-border pt-1"><span>{t('Foyda (QQS siz)')}</span><b className={`num ${narx.foyda != null && narx.foyda < 0 ? 'text-danger' : ''}`}>{som(narx.foyda)} · {foiz(narx.marjaFoiz)}</b></div>
              {narx.minimalQoplandi && <span className="text-warn">{t('Minimal summa qo‘llandi')}</span>}
              {narx.yetishmaydi.length > 0 && <span className="text-warn">{t('Yetishmaydi')}: {narx.yetishmaydi.join(', ')}</span>}
            </div> : <p className="mt-1 text-[12px] text-text-mute">{t('Tarifni tanlang')}</p>}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="inline-flex items-center gap-2 text-[14px] font-semibold"><Tags className="h-4 w-4" />{t('Tariflar')}</h3>
          {yozish && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => setForma({ tur: 'tarif', q: { qqs_foiz: 12, qqs_kiritilgan: 'yoq', holat: 'faol' } })}><Plus />{t('Tarif qo‘shish')}</button>}</div>
        <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
          <thead><tr><th>{t('Nomi')}</th><th>{t('Zona')}</th><th>{t('Narxlar')}</th><th>{t('Minimal')}</th><th>{t('Marja')}</th><th>{t('QQS')}</th><th /></tr></thead>
          <tbody>
            {(soz.data?.tariflar.length ?? 0) === 0 && <OpsBoshQator ustun={7} matn={t('Tariflar kiritilmagan')} izoh={t('Tashqi mijozlarga narx berish uchun tarif qo‘shing.')} />}
            {soz.data?.tariflar.map((x) => (
              <tr key={x.id}><td className="font-medium">{x.nom}</td><td>{x.zona ?? '—'}</td><td className="num">{tarifQoshuv(x)}</td><td className="num">{som(x.minimal_summa)}</td><td className="num">{foiz(x.marja_foiz)}</td>
                <td>{x.qqs_foiz}% {x.qqs_kiritilgan ? t('(narx QQS bilan)') : t('(narx QQS siz)')}</td>
                <td>{yozish && <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Tahrirlash')} onClick={() => setForma({ tur: 'tarif', q: { ...x, qqs_kiritilgan: x.qqs_kiritilgan ? 'ha' : 'yoq' } as unknown as Record<string, unknown> })}><Pencil /></button>}</td></tr>))}
          </tbody></table></div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="inline-flex items-center gap-2 text-[14px] font-semibold"><Fuel className="h-4 w-4" />{t('Yoqilg‘i narxi tarixi')}</h3>
          {yozish && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => setForma({ tur: 'yoqilgi', q: { yoqilgi_turi: 'dizel', sana: bugunISO() } })}><Plus />{t('Narx qo‘shish')}</button>}</div>
        <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
          <thead><tr><th>{t('Yoqilg‘i')}</th><th>{t('Sanadan')}</th><th>{t('Narx, so‘m (QQS siz)')}</th><th>{t('Izoh')}</th></tr></thead>
          <tbody>
            {(soz.data?.yoqilgi_narxlari.length ?? 0) === 0 && <OpsBoshQator ustun={4} matn={t('Yoqilg‘i narxi kiritilmagan')} izoh={t('Narx bo‘lmasa yoqilg‘i xarajati hisoblanmaydi («kiritilmagan»).')} />}
            {soz.data?.yoqilgi_narxlari.map((n) => <tr key={n.id}><td>{n.yoqilgi_turi}</td><td>{n.sana}</td><td className="num">{som(n.narx)}</td><td>{n.izoh ?? '—'}</td></tr>)}
          </tbody></table></div>
      </section>

      {forma && <FormOyna ochiq sarlavha={forma.tur === 'tarif' ? t('Tarif') : t('Yoqilg‘i narxi')} maydonlar={forma.tur === 'tarif' ? tarifMaydon : yoqMaydon} boshlangich={forma.q}
        onSaqla={(d) => saqla(forma.tur === 'tarif' ? 'tarif_saqla' : 'yoqilgi_narx_saqla', d)} onYop={() => setForma(null)} />}
    </div>
  );
}
