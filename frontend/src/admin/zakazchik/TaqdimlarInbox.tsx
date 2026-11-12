/**
 * TaqdimlarInbox.tsx — /admin/taqdimlar. Tomonlar orasidagi hujjat yuborish (taqdim: F2, АОСР) va qaror:
 *   Kelgan  — menga yuborilganlar: ko'rish, izoh, qabul / rad / tuzatish so'rash (buyurtmachi va texnik nazorat tomoni);
 *   Yuborilgan — men yuborganlar: holat, qaror izohi, qaytarib olish (pudratchi tomoni).
 * Zakazchik pudratchi hujjatini TAHRIRLAY OLMAYDI — faqat qaror chiqaradi. Qaror o'zgarmaydi.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { izohYoz, taqdimTafsilotOl, taqdimlarOl, taqdimniQaytar, taqdimQarori, type TaqdimQisqa, type TaqdimTafsilot } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim, HolatBelgi } from './tomon-ui';
import { TolovXabarlariKelgan } from './TolovXabarlari';
import { QatorIzohMuloqot, QatorIzohTugma } from './QatorIzohlari';
import { AosrTaqdimKorinish } from './AosrTaqdimKorinish';
import { AosrDalillari, F2Tekshiruvi } from '../nazorat/KorikPanellari';
import { useQatorIzohlari } from './qator-izohlari-hook';
import { HODISA_NOMI, inp, oyMatn, pul, sana, TAQDIM_HOLAT_NOMI, tugma, tugmaAsosiy } from './tomon-yordam';
import { SummaYorliq } from '../../umumiy/ui/QiymatUchlik';

const OCHIQ = ['yuborilgan', 'ko_rilmoqda'];
const KORINADIGAN_QATOR = 200;
const TUR_FILTR = [['', 'Hammasi'], ['f2', 'Ф-2'], ['aosr', 'АОСР']] as const;

function Tafsilot({ kompaniyaId, id, yangila }: { kompaniyaId: number; id: number; yangila: () => void }) {
  const [d, setD] = useState<TaqdimTafsilot | null>(null);
  const [izoh, setIzoh] = useState('');
  const [hammasi, setHammasi] = useState(false);
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const r = await taqdimTafsilotOl(kompaniyaId, id); if (r.ok) setD(r.natija); else toast(r.error, 'danger'); }, [kompaniyaId, id]);
  useEffect(() => { setD(null); setIzoh(''); void ol(); }, [ol]);
  const aktId = d && d.taqdim.resurs === 'f2' && d.taqdim.manba_jadval === 't2_akt' ? d.taqdim.manba_id : null;
  const qIzoh = useQatorIzohlari(kompaniyaId, aktId, d?.taqdim.aloqa_id);
  const [ochiqQator, setOchiqQator] = useState<number | null>(null);
  if (!d) return <div className="skel h-40 rounded-xl" aria-label={t('Yuklanmoqda…')} />;
  const q = d.taqdim;
  const ochiq = OCHIQ.includes(q.holat);

  const qaror = async (qr: 'korilmoqda' | 'qabul' | 'rad' | 'tuzatish') => {
    if ((qr === 'rad' || qr === 'tuzatish') && izoh.trim().length < 3) { toast(t('Rad etish yoki tuzatish so‘rash uchun izoh yozing'), 'danger'); return; }
    setBand(true); const r = await taqdimQarori(kompaniyaId, q.id, qr, izoh); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Qaror saqlandi'), 'ok'); setIzoh(''); yangila(); void ol();
  };
  const qaytar = async () => { setBand(true); const r = await taqdimniQaytar(kompaniyaId, q.id, izoh); setBand(false); if (!r.ok) toast(r.error, 'danger'); else { yangila(); void ol(); } };
  const izohQosh = async () => {
    if (!izoh.trim()) return; setBand(true); const r = await izohYoz(kompaniyaId, { taqdimId: q.id, matn: izoh }); setBand(false);
    if (!r.ok) toast(r.error, 'danger'); else { setIzoh(''); void ol(); }
  };
  const qatorlar = hammasi ? d.qatorlar : d.qatorlar.slice(0, KORINADIGAN_QATOR);
  const yashirinBor = !hammasi && d.qatorlar.length > KORINADIGAN_QATOR;

  return (
    <div className="space-y-3">
      {/* Hujjat varag'i: kim → kimga, obyekt, oy, summa, holat va butunlik — bir qarashda. */}
      <section className={`fz-doc__sheet ${q.holat === 'rad' ? 'fz-doc__sheet--danger' : OCHIQ.includes(q.holat) ? 'fz-doc__sheet--draft' : ''}`}>
        <div className="fz-doc__top">
          <div className="min-w-0">
            <div className="fz-doc__eyebrow">{q.resurs === 'f2' ? t('Ф-2 · bajarilgan ishlar akti') : q.resurs === 'aosr' ? t('АОСР · yashirin ishlar akti') : t('Yuborilgan hujjat')}</div>
            <h3 className="fz-doc__title">{q.nom} <HolatBelgi holat={q.holat} turi="taqdim" /></h3>
            <div className="fz-doc__meta">
              <span>{t('Kimdan')}: <b>{q.etuvchi_nom}</b></span><span>{t('Kimga')}: <b>{q.qabul_qiluvchi_nom}</b></span>
              {q.obyekt_nom && <span>{t('Obyekt')}: <b>{q.obyekt_nom}</b></span>}
              {q.oy && <span>{t('Davr')}: <b>{oyMatn(q.oy)}</b></span>}
              {q.resurs === 'f2' && <span>{t('{n} qator', { n: d.qator_jami })}</span>}
            </div>
          </div>
          {q.summa != null && <div className="fz-doc__total"><small>{t('Summa')}</small><b className="text-[20px] tabular-nums">{pul(q.summa)}</b></div>}
        </div>
        <div className="fz-check">
          {d.butunlik_ok === false && <p role="alert" className="fz-check__q fz-check__q--bad">{t('DIQQAT: yuborilgandan keyin hujjat qatorlari o‘zgargan (butunlik xeshi mos kelmaydi). Qaror chiqarishdan oldin yuboruvchidan aniqlang.')}</p>}
          {d.butunlik_ok === true && <p className="fz-check__q fz-check__q--ok text-ok">✓ {t('Butunlik tekshiruvi: yuborilgan hujjat o‘zgarmagan')}</p>}
        </div>
        {q.taqdim_izoh && <p className="fz-note">{t('Yuboruvchi izohi')}: {q.taqdim_izoh}</p>}
        {q.qaror_izoh && <p className="fz-note fz-note--warn">{t('Qaror izohi')}: {q.qaror_izoh}</p>}
        {q.document_id != null && <a className="fz-btn fz-btn--sm self-start" href={hujjatYuklabOlishUrl(q.document_id)}>{t('Hujjat faylini yuklab olish')}</a>}
      </section>

      {q.resurs === 'aosr' && <AosrTaqdimKorinish snapshot={q.snapshot} />}
      {q.resurs === 'aosr' && <AosrDalillari kompaniyaId={kompaniyaId} taqdimId={id} />}
      {q.resurs === 'f2' && aktId != null && <F2Tekshiruvi kompaniyaId={kompaniyaId} taqdimId={id} />}

      {q.resurs === 'f2' && (
        <div className="fz-table-wrap max-h-96">
          <table className="fz-table min-w-[720px]">
            <thead><tr><th>№</th><th>{t('Kod')}</th><th>{t('Nomi')}</th><th>{t('Birlik')}</th>
              <th className="fz-c-num">{t('Hajm')}</th><th className="fz-c-num">{t('Narx')}<SummaYorliq tur="narx" /></th><th className="fz-c-num">{t('Summa')}</th>{aktId != null && <th>{t('Izoh')}</th>}</tr></thead>
            <tbody>{qatorlar.map((x) => (
              <Fragment key={x.qator_id}>
                <tr><td className="tabular-nums text-text-mute">{x.tartib}</td><td className="fz-c-shifr">{x.kod}</td><td>{x.nom}</td><td className="fz-c-unit">{x.birlik}</td>
                  <td className="fz-c-num">{pul(x.hajm)}</td><td className="fz-c-num">{pul(x.narx)}</td><td className="fz-c-num font-semibold">{pul(x.summa)}</td>
                  {aktId != null && <td>{x.akt_qator_id != null && <QatorIzohTugma soni={qIzoh.ochiqSoni(x.akt_qator_id)} jami={(qIzoh.qator.get(x.akt_qator_id) ?? []).length} ochiq={ochiqQator === x.akt_qator_id} onClick={() => setOchiqQator(ochiqQator === x.akt_qator_id ? null : x.akt_qator_id!)} />}</td>}</tr>
                {aktId != null && x.akt_qator_id != null && ochiqQator === x.akt_qator_id && (
                  <tr><td colSpan={8} className="p-0"><QatorIzohMuloqot kompaniyaId={kompaniyaId} aloqaId={q.aloqa_id} aktQatorId={x.akt_qator_id} izohlar={qIzoh.qator.get(x.akt_qator_id) ?? []} ichkiMumkin={!q.kelgan} yangila={() => void qIzoh.yukla()} /></td></tr>)}
              </Fragment>))}</tbody>
          </table>
          <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-text-dim">{t('Qatorlar')}: {d.qator_jami}{d.qisqartirilgan ? ` (${t('birinchi 5000 ta')})` : ''}
            {yashirinBor && <button type="button" className="text-accent underline" onClick={() => setHammasi(true)}>{t('Hammasini ko‘rsatish')}</button>}</div>
        </div>
      )}

      <div>
        <div className="fz-panel__h">{t('Muloqot va tarix')}</div>
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto border-l-2 border-border pl-3">{d.hodisalar.map((h) => (
          <li key={h.id} className={`text-xs ${h.meni ? 'text-text' : 'text-text-dim'}`}><span className="tabular-nums">{sana(h.vaqt)}</span> · {h.kompaniya_nom ?? '—'} · <b>{t(HODISA_NOMI[h.tur] ?? h.tur)}</b>{h.matn ? ` — ${h.matn}` : ''}</li>))}</ul>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[240px] flex-1 text-xs text-text-dim">{t('Izoh')}
          <textarea className={`${inp} mt-1 block h-16 w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('Izoh yozing (rad etish va tuzatish uchun majburiy)')} /></label>
        <button type="button" className={tugma} disabled={band || !izoh.trim()} onClick={() => void izohQosh()}>{t('Izoh qoldirish')}</button>
        {q.kelgan && ochiq && q.resurs === 'aosr' && <p className="fz-note w-full">{t('«Qabul qilish» — АОСР «tasdiqlangan» bo‘ladi (qaror o‘zgarmaydi). Kamchilik bo‘lsa — izoh yozib «Tuzatish so‘rash»: pudratchi tuzatib qayta yuboradi.')}</p>}
        {q.kelgan && ochiq && <>
          {q.holat === 'yuborilgan' && <button type="button" className={tugma} disabled={band} onClick={() => void qaror('korilmoqda')}>{t('Ko‘rib chiqila boshlandi')}</button>}
          <button type="button" className={tugmaAsosiy} disabled={band || d.butunlik_ok === false} onClick={() => void qaror('qabul')}>{t('Qabul qilish')}</button>
          <button type="button" className={tugma} disabled={band} onClick={() => void qaror('tuzatish')}>{t('Tuzatish so‘rash')}</button>
          <button type="button" className={tugma} disabled={band} onClick={() => void qaror('rad')}>{t('Rad etish')}</button></>}
        {!q.kelgan && q.holat === 'yuborilgan' && <button type="button" className={tugma} disabled={band} onClick={() => void qaytar()}>{t('Qaytarib olish')}</button>}
      </div>
    </div>
  );
}

export default function TaqdimlarInbox() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [qidirParam] = useSearchParams();
  const [yonalish, setYonalish] = useState<'kelgan' | 'yuborilgan'>(() => (qidirParam.get('yonalish') === 'yuborilgan' ? 'yuborilgan' : 'kelgan'));
  const [holat, setHolat] = useState('');
  const [tur, setTur] = useState(() => { const x = qidirParam.get('tur'); return x === 'f2' || x === 'aosr' ? x : ''; });
  const [royxat, setRoyxat] = useState<TaqdimQisqa[]>([]);
  const [tanlangan, setTanlangan] = useState<number | null>(() => { const v = Number(qidirParam.get('id')); return Number.isFinite(v) && v > 0 ? v : null; });
  const [xato, setXato] = useState('');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const r = await taqdimlarOl(kompaniyaId, { yonalish, holat: holat || undefined });
    if (!r.ok) { setXato(r.error); return; }
    setXato(''); setRoyxat(r.natija);
  }, [kompaniyaId, yonalish, holat]);
  useEffect(() => { void yukla(); }, [yukla]);
  const korinadi = useMemo(() => (tur ? royxat.filter((x) => x.resurs === tur) : royxat), [royxat, tur]);
  const ochiqSoni = useMemo(() => korinadi.filter((x) => OCHIQ.includes(x.holat)).length, [korinadi]);
  const turOchiq = (k: string) => royxat.filter((x) => OCHIQ.includes(x.holat) && (!k || x.resurs === k)).length;

  if (!kompaniyaId) return <KompaniyaKerak nima="Hujjatlar almashinuvi" />;
  return (
    <Sahifa sarlavha="Tomonlar hujjatlari" tavsif="Pudratchi yuborgan F2 va АОСР — buyurtmachi va texnik nazorat ko‘radi, izoh yozadi, qabul qiladi yoki tuzatishga qaytaradi; qaror o‘zgarmaydi">
      <div className="space-y-3">
        <TolovXabarlariKelgan kompaniyaId={kompaniyaId} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1" role="group" aria-label={t('Yo‘nalish')}>
            {(['kelgan', 'yuborilgan'] as const).map((y) => (
              <button key={y} type="button" aria-pressed={yonalish === y} onClick={() => { setYonalish(y); setTanlangan(null); }} className={`fz-btn fz-btn--sm ${yonalish === y ? 'fz-btn--primary' : ''}`}>{y === 'kelgan' ? t('Kelgan') : t('Yuborilgan')}</button>))}
          </div>
          <div className="inline-flex gap-1" role="group" aria-label={t('Hujjat turi')}>
            {TUR_FILTR.map(([k, nom]) => (
              <button key={k || 'hammasi'} type="button" aria-pressed={tur === k} onClick={() => setTur(k)} className={`fz-btn fz-btn--sm ${tur === k ? 'fz-btn--primary' : ''}`}>{k ? nom : t(nom)}{turOchiq(k) > 0 ? `  · ${turOchiq(k)}` : ''}</button>))}
          </div>
          <select aria-label={t('Holat')} className={inp} value={holat} onChange={(e) => setHolat(e.target.value)}>
            <option value="">{t('Barcha holatlar')}</option>
            {(['yuborilgan', 'ko_rilmoqda', 'tuzatish', 'qabul', 'rad', 'qaytarilgan'] as const).map((h) => <option key={h} value={h}>{t(TAQDIM_HOLAT_NOMI[h])}</option>)}
          </select>
          <span className={`fz-chip ${ochiqSoni ? 'fz-chip--warn' : ''}`}>{t('Ochiq')}: {ochiqSoni}</span>
        </div>
        {xato && <div role="alert" className="fz-note fz-note--danger">{xato}</div>}
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
          <Bolim sarlavha="Ro‘yxat">
            {korinadi.length === 0 ? <p className="text-[13px] text-text-mute">{t('Hujjat yo‘q')}</p> : (
              <ul className="fz-list max-h-[70vh] overflow-auto p-0">{korinadi.map((x) => (
                <li key={x.id}><button type="button" onClick={() => setTanlangan(x.id)} aria-current={tanlangan === x.id} className="fz-list__q">
                  <span className="min-w-0"><span className="fz-list__nom block truncate">{x.nom}</span>
                    <span className="fz-list__sub">{x.qarshi_nom} · {x.obyekt_nom ?? '—'} · {oyMatn(x.oy)}</span>
                    <span className="fz-list__sub">{sana(x.taqdim_vaqti)}</span></span>
                  <span className="flex flex-col items-end gap-1"><HolatBelgi holat={x.holat} turi="taqdim" /><span className="fz-list__sum text-[12.5px]">{pul(x.summa)}</span></span></button></li>))}</ul>)}
          </Bolim>
          <Bolim sarlavha="Hujjat">
            {tanlangan == null ? <p className="text-sm text-text-dim">{t('Ro‘yxatdan hujjatni tanlang')}</p> : <Tafsilot kompaniyaId={kompaniyaId} id={tanlangan} yangila={() => void yukla()} />}
          </Bolim>
        </div>
      </div>
    </Sahifa>
  );
}
