/**
 * Bosh pudratchi: SUBPUDRAT boshqaruvi (ekotizim, tomon: bosh pudratchi). Bitta sahifa, to'rt qadam:
 *   1) ishni topshirish (qator yoki butun bo'lim) subpudratchiga  2) kelishilgan narx  3) kelgan aktlar: qabul / tuzatishga qaytarish  4) marja.
 * Qoida (bir gapda): bir ish - bitta fakt. Subpudratchi hajmni kiritgan bo'lsa, siz uni qayta kiritmaysiz - aktni qabul qilsangiz u faktga BIR marta tushadi
 * va bitta subpudrat xarajati yoziladi. Smeta qatori o'zgarmaydi. Narxlar QQS siz; pul hisobi lib/hisob-yadro orqali.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Handshake, HardHat, Inbox, RefreshCw } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { useT2ObyektlarRoyxati } from '../../api/t2-obyektlar-kesh';
import { sbT2DaraxtOl } from '../../api/supabase';
import { sbT2ShartnomalarOl, type Shartnoma } from '../../api/t2-shartnoma';
import { aloqalarOl, type Aloqa } from '../../api/t2-tomon';
import { subAktQarori, subAktTafsilotOl, subAktlarOl, subBoshqaruvOl, subTopshir, subTopshiriqBekor, type SubAktQisqa, type SubAktTafsilot, type SubTopshiriq } from '../../api/t2-sub';
import { katKesimYigish, type KatKesim } from '../../lib/ustamali-summa';
import { gcQolgan, ikkiMartaXavfi, marjaJami, marjaQatori } from '../../lib/subpudratchi/hisob';
import { t } from '../../i18n/til';
import { AktHolatBelgi, hajmKorsat, oyKorsat, pulKorsat } from './sub-ui';

type DaraxtQator = { id: number; ota_id: number | null; tur: string | null; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; kat: string | null; tartib: number | null; daraja: number | null };
const ISH_TURLARI = new Set(['bl', 'mat', 'ob']);

export default function SubpudratBoshqaruv() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const { obyektlar } = useT2ObyektlarRoyxati(kid);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [aloqalar, setAloqalar] = useState<Aloqa[] | null>(null);
  const [topshiriqlar, setTopshiriqlar] = useState<SubTopshiriq[] | null>(null);
  const [aktlar, setAktlar] = useState<SubAktQisqa[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [band, setBand] = useState(false);
  const [kalit, setKalit] = useState(0);
  const [aloqaId, setAloqaId] = useState<number | null>(null);
  const [daraxt, setDaraxt] = useState<DaraxtQator[] | null>(null);
  const [bolimId, setBolimId] = useState<number | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<number>>(new Set());
  const [narxlar, setNarxlar] = useState<Record<number, string>>({});
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [tafsilot, setTafsilot] = useState<SubAktTafsilot | null>(null);
  const [qaytarIzoh, setQaytarIzoh] = useState('');
  const [shartnomalar, setShartnomalar] = useState<Shartnoma[]>([]);
  const [shartnomaId, setShartnomaId] = useState<number | null>(null);
  const [ulgurji, setUlgurji] = useState('');
  /* Karta (mindmap) dan kelganda: ?obyekt=&aloqa= — obyekt va subpudratchi oldindan tanlanadi (qayta yozilmaydi, shu sahifaning o‘zi). */
  const [qidiruvParam] = useSearchParams();
  useEffect(() => {
    const o = Number(qidiruvParam.get('obyekt')), a = Number(qidiruvParam.get('aloqa'));
    if (Number.isSafeInteger(o) && o > 0) setObyektId(o);
    if (Number.isSafeInteger(a) && a > 0) setAloqaId(a);
  }, [qidiruvParam]);

  const obyekt = obyektlar.find((o) => o.id === obyektId) ?? obyektlar[0] ?? null;
  const oid = obyekt?.id ?? null;

  const yukla = useCallback(async () => {
    if (kid == null) return;
    setYuk(true);
    const [al, ak, tp, sh] = await Promise.all([aloqalarOl(kid), subAktlarOl(kid, 'kelgan'), oid != null ? subBoshqaruvOl(kid, oid) : Promise.resolve(null), sbT2ShartnomalarOl(kid)]);
    setYuk(false);
    if (sh.ok) setShartnomalar(((sh.qatorlar ?? []) as Shartnoma[]).filter((s) => !(s as { asosiy?: boolean }).asosiy));
    const x: string[] = [];
    if (al.ok) setAloqalar(al.natija); else { setAloqalar([]); x.push(al.error); }
    if (ak.ok) setAktlar(ak.natija.aktlar); else { setAktlar([]); x.push(ak.error); }
    if (tp == null) setTopshiriqlar([]); else if (tp.ok) setTopshiriqlar(tp.natija.topshiriqlar); else { setTopshiriqlar([]); x.push(tp.error); }
    setXato(x[0] ?? null);
  }, [kid, oid]);
  useEffect(() => { void yukla(); }, [yukla, kalit]);

  /* Smeta daraxti (bo'lim va ish qatorlari) - faqat tanlangan obyekt uchun, kerak bo'lganda. */
  useEffect(() => {
    if (oid == null) { setDaraxt(null); return; }
    let bekor = false;
    setDaraxt(null); setBolimId(null); setTanlangan(new Set());
    void sbT2DaraxtOl(oid, 'id,ota_id,tur,kod,nom,birlik,hajm,kat,tartib,daraja').then((r) => { if (!bekor) setDaraxt(r.ok ? (r.qatorlar as DaraxtQator[]) : []); });
    return () => { bekor = true; };
  }, [oid]);

  const subAloqalar = useMemo(() => (aloqalar ?? []).filter((a) => a.qarshi_rol.toLowerCase() === 'subpudratchi' && a.holat === 'faol'), [aloqalar]);
  const aloqa = subAloqalar.find((a) => a.id === aloqaId) ?? subAloqalar[0] ?? null;
  const bolimlar = useMemo(() => (daraxt ?? []).filter((q) => q.tur === 'rz'), [daraxt]);
  /** Tanlangan bo'lim ostidagi ish qatorlari (butun avlodlar). */
  const bolimIshlari = useMemo(() => {
    if (bolimId == null || !daraxt) return [] as DaraxtQator[];
    const bolalar = new Map<number, DaraxtQator[]>();
    for (const q of daraxt) if (q.ota_id != null) bolalar.set(q.ota_id, [...(bolalar.get(q.ota_id) ?? []), q]);
    const chiqish: DaraxtQator[] = [];
    const stek = [bolimId];
    while (stek.length) for (const c of bolalar.get(stek.pop() as number) ?? []) { if (ISH_TURLARI.has(c.tur ?? '') && (c.hajm ?? 0) > 0) chiqish.push(c); else stek.push(c.id); }
    return chiqish.sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0) || a.id - b.id);
  }, [daraxt, bolimId]);
  const bandQatorlar = useMemo(() => new Set((topshiriqlar ?? []).map((x) => x.qator_id)), [topshiriqlar]);

  const marjalar = useMemo(() => (topshiriqlar ?? []).map((x) => marjaQatori(x)), [topshiriqlar]);
  const jami = useMemo(() => marjaJami(marjalar), [marjalar]);
  const smetaKesim: KatKesim = useMemo(() => katKesimYigish(marjalar.map((m, i) => ({ m, kat: (topshiriqlar ?? [])[i]?.kat ?? null })), (x) => x.kat, (x) => x.m.smetaSumma), [marjalar, topshiriqlar]);

  async function topshir(qatorlar: Array<{ qator_id: number; narx?: number | null }>, bolim: number | null, lump: number | null = null) {
    if (kid == null || oid == null || !aloqa || band) return;
    setBand(true);
    const r = await subTopshir(kid, { aloqaId: aloqa.id, obyektId: oid, qatorlar, bolimId: bolim, shartnomaId, umumiySumma: lump });
    setBand(false);
    if (!r.ok) { toast(t(r.error), 'danger'); return; }
    toast(t('Topshirildi: yangi {n}, yangilandi {m}', { n: r.natija.yangi, m: r.natija.yangilandi }), 'ok');
    setTanlangan(new Set()); setKalit((k) => k + 1);
  }
  const ulgurjiSon = ulgurji.trim() === '' || Number.isNaN(Number(ulgurji)) ? null : Number(ulgurji);
  async function narxSaqla(x: SubTopshiriq) {
    const matn = (narxlar[x.id] ?? '').trim();
    if (matn === '' || Number.isNaN(Number(matn))) return;
    await topshir([{ qator_id: x.qator_id, narx: Number(matn) }], null);
  }
  async function bekorQil(x: SubTopshiriq) {
    if (kid == null) return;
    const r = await subTopshiriqBekor(kid, x.id);
    if (!r.ok) toast(t(r.error), 'danger'); else setKalit((k) => k + 1);
  }
  async function ochish(a: SubAktQisqa) {
    if (kid == null) return;
    if (ochiq === a.id) { setOchiq(null); setTafsilot(null); return; }
    setOchiq(a.id); setTafsilot(null); setQaytarIzoh('');
    const r = await subAktTafsilotOl(kid, a.id);
    if (r.ok) setTafsilot(r.natija); else toast(t(r.error), 'danger');
  }
  async function qaror(a: SubAktQisqa, q: 'qabul' | 'tuzatish' | 'rad') {
    if (kid == null || a.taqdim_id == null || band) return;
    if (q !== 'qabul' && qaytarIzoh.trim().length < 3) { toast(t('Qaytarish uchun sababni yozing.'), 'warn'); return; }
    setBand(true);
    const r = await subAktQarori(kid, a.taqdim_id, q, q === 'qabul' ? undefined : qaytarIzoh.trim());
    setBand(false);
    if (!r.ok) { toast(t(r.error), 'danger'); return; }
    toast(q === 'qabul' ? t('Qabul qilindi: hajm faktga bir marta yozildi.') : t('Subpudratchiga qaytarildi.'), 'ok');
    setOchiq(null); setTafsilot(null); setKalit((k) => k + 1);
  }

  if (!joriy) return <KompaniyaKerak nima="Subpudrat boshqaruvi" />;
  const kutilmoqda = (aktlar ?? []).filter((a) => a.holat === 'yuborilgan');

  return (
    <Sahifa
      sarlavha="Subpudrat boshqaruvi"
      tavsif="Ishni subpudratchiga topshiring, kelishilgan narxni belgilang, uning aktini qabul qiling."
      amallar={<button type="button" className="fz-btn fz-btn--ghost" onClick={() => setKalit((k) => k + 1)} disabled={yuk}><RefreshCw className={yuk ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}
    >
      <div className="flex flex-col gap-4 overflow-auto">
        {xato && <p className="fz-note" role="alert">{t(xato)}</p>}
        <p className="fz-note">{t('Bir ish — bitta fakt: subpudratchi hajmni kiritgan bo‘lsa, siz uni qayta kiritmaysiz — aktni qabul qilsangiz u faktga bir marta tushadi.')}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <section className="fz-panel flex flex-col gap-1"><div className="flex items-center gap-2 text-[13px] text-text-mute"><Handshake size={16} />{t('Subpudratchilar')}</div>
            <div className="text-[30px] font-semibold tabular-nums leading-none">{aloqalar ? subAloqalar.length : '—'}</div>
            <Link to="/admin/kontragentlar?tab=aloqa" className="fz-btn fz-btn--primary mt-auto w-full text-center">{t('Subpudratchi taklif qilish')}</Link></section>
          <section className="fz-panel flex flex-col gap-1"><div className="flex items-center gap-2 text-[13px] text-text-mute"><HardHat size={16} />{t('Topshirilgan ishlar')}</div>
            <div className="text-[30px] font-semibold tabular-nums leading-none">{topshiriqlar ? topshiriqlar.length : '—'}</div>
            <a href="#topshirish" className="fz-btn fz-btn--primary mt-auto w-full text-center">{t('Ish topshirish')}</a></section>
          <section className="fz-panel flex flex-col gap-1"><div className="flex items-center gap-2 text-[13px] text-text-mute"><Inbox size={16} />{t('Kelgan aktlar')}</div>
            <div className={`text-[30px] font-semibold tabular-nums leading-none ${kutilmoqda.length ? 'text-warn' : ''}`}>{aktlar ? kutilmoqda.length : '—'}</div>
            <a href="#aktlar" className="fz-btn fz-btn--primary mt-auto w-full text-center">{t('Aktlarni ko‘rish')}</a></section>
        </div>

        <section className="fz-panel flex flex-wrap items-end gap-2" aria-label={t('Obyekt')}>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Obyekt')}
            <select className="px-2 py-1 text-[13px]" value={oid ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}>
              {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Subpudratchi')}
            <select className="px-2 py-1 text-[13px]" value={aloqa?.id ?? ''} onChange={(e) => setAloqaId(Number(e.target.value))} disabled={!subAloqalar.length}>
              {subAloqalar.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom}</option>)}</select></label>
          {aloqalar && !subAloqalar.length && <span className="text-[12.5px] text-text-mute">{t('Avval subpudratchini «Aloqalar»da taklif qiling (uning roli: subpudratchi).')}</span>}
        </section>

        <section id="topshirish" className="fz-panel" aria-label={t('Ish topshirish')}>
          <div className="fz-panel__h"><span>{t('Ishni subpudratchiga topshirish')}</span></div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] text-text-mute">{t('Shartnoma (ixtiyoriy)')}
              <select className="px-2 py-1 text-[13px]" value={shartnomaId ?? ''} onChange={(e) => setShartnomaId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t('— shartnomasiz —')}</option>
                {shartnomalar.map((s) => <option key={s.id} value={s.id}>{`${s.raqam} ${s.nom ?? s.taraf ?? ''}`}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Ulgurji summa (QQS siz, ixtiyoriy)')}
              <MoneyInput className="w-[160px] px-2 py-1 text-right text-[13px]" aria-label={t('Ulgurji summa')} value={ulgurji} onValueChange={setUlgurji} /></label>
          </div>
          <p className="mb-2 text-[12px] text-text-mute">{t('Ulgurji summa kiritilsa, topshirilgan qator(lar)ning butun mazmuni shu summaga chiqadi (smeta puliga mutanosib taqsimlanadi).')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] text-text-mute">{t('Bo‘lim')}
              <select className="px-2 py-1 text-[13px]" value={bolimId ?? ''} onChange={(e) => { setBolimId(e.target.value ? Number(e.target.value) : null); setTanlangan(new Set()); }}>
                <option value="">{daraxt === null ? t('Yuklanmoqda…') : t('— bo‘limni tanlang —')}</option>
                {bolimlar.map((b) => <option key={b.id} value={b.id}>{`${'· '.repeat(Math.min(b.daraja ?? 0, 4))}${b.kod ?? ''} ${b.nom ?? ''}`}</option>)}</select></label>
            <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || bolimId == null || !aloqa || !bolimIshlari.length}
              onClick={() => void topshir([], bolimId, ulgurjiSon)}>{t('Butun bo‘limni topshirish')} ({bolimIshlari.length})</button>
            {bolimId != null && oid != null && bolimIshlari.length > 0 && (
              <Link className="fz-btn fz-btn--sm" to={`/admin/tender-ochiq?smeta=1&obyekt=${oid}&bolim=${bolimId}&tur=subpudrat`}
                title={t('Bo‘limni ochiq tenderga chiqarish: faqat hajm, narxsiz')}>{t('Tenderga chiqarish')}</Link>
            )}
          </div>
          {bolimIshlari.length > 0 && (
            <>
              <ul className="mt-2 max-h-[280px] divide-y divide-border overflow-auto text-[13px]">
                {bolimIshlari.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 py-1.5">
                    <input type="checkbox" aria-label={t('Tanlash')} disabled={bandQatorlar.has(q.id)} checked={tanlangan.has(q.id)}
                      onChange={(e) => setTanlangan((s) => { const n = new Set(s); if (e.target.checked) n.add(q.id); else n.delete(q.id); return n; })} />
                    <span className="min-w-0 flex-1"><span className="fz-c-shifr">{q.kod ?? '—'}</span> {q.nom}</span>
                    <span className="tabular-nums text-text-mute">{hajmKorsat(q.hajm)} {q.birlik}{bandQatorlar.has(q.id) ? ` · ${t('topshirilgan')}` : ''}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="fz-btn fz-btn--sm mt-2" disabled={band || !tanlangan.size || !aloqa}
                onClick={() => void topshir([...tanlangan].map((id) => ({ qator_id: id })), null, ulgurjiSon)}>{t('Tanlanganlarni topshirish')} ({tanlangan.size})</button>
            </>
          )}
        </section>

        <section className="fz-panel" aria-label={t('Topshirilgan ishlar va marja')}>
          <div className="fz-panel__h"><span>{t('Topshirilgan ishlar va marja')}</span><span>{(topshiriqlar ?? []).length}</span></div>
          {topshiriqlar !== null && topshiriqlar.length === 0 && <p className="text-[13px] text-text-mute">{t('Bu obyektda hali ish topshirilmagan.')}</p>}
          <ul className="divide-y divide-border text-[13px]">
            {(topshiriqlar ?? []).map((x, i) => {
              const m = marjalar[i];
              return (
                <li key={x.id} className="flex flex-col gap-1 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0"><span className="fz-c-shifr">{x.kod ?? '—'}</span> <span className="font-medium">{x.nom}</span> <span className="text-text-mute">→ {x.sub_nom}</span></span>
                    <span className="tabular-nums text-text-mute">{hajmKorsat(x.hajm)} {x.birlik} · {t('qabul')}: {hajmKorsat(x.qabul_hajm)} · {t('kutilmoqda')}: {hajmKorsat(x.kutilayotgan_hajm)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 tabular-nums">
                    <span>{t('Smeta narxi')}: {pulKorsat(x.smeta_narx)}</span>
                    <label className="flex items-center gap-1">{t('Kelishilgan narx (QQS siz)')}
                      <MoneyInput className="w-[120px] px-2 py-1 text-right text-[13px]" aria-label={t('Kelishilgan narx')} value={narxlar[x.id] ?? (x.narx == null ? '' : String(x.narx))}
                        onValueChange={(v) => setNarxlar((s) => ({ ...s, [x.id]: v }))} /></label>
                    <button type="button" className="fz-btn fz-btn--sm" disabled={band || narxlar[x.id] === undefined} onClick={() => void narxSaqla(x)}>{t('Narxni saqlash')}</button>
                    <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" disabled={band} onClick={() => void bekorQil(x)}>{t('Qaytarib olish')}</button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[12.5px] tabular-nums text-text-mute">
                    <span>{t('Smeta puli')}: {pulKorsat(m.smetaSumma)}</span><span>{t('Subpudrat narxi')}: {pulKorsat(m.subSumma)}</span><span>{t('Farq')}: <b>{pulKorsat(m.farq)}</b></span>
                    <span>{t('Qolgan hajm')}: {hajmKorsat(gcQolgan(x))}</span>
                    {ikkiMartaXavfi(x) && <span className="text-warn">{t('Siz bu qatorga o‘zingiz ham fakt kiritgansiz: {n}. Jami topshirilgan hajmdan oshmaydi.', { n: hajmKorsat(x.gc_fakt_hajm) })}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {(topshiriqlar ?? []).length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-3"><span>{t('Smeta puli (topshirilgan hajm)')}:</span>
                <SummaJuft obyektId={oid} ustamasiz={jami.smeta} katKesim={smetaKesim} kompaniyaId={kid} kichik /></div>
              <div className="tabular-nums">{t('Subpudrat narxi (QQS siz)')}: <b>{pulKorsat(jami.sub)}</b> · {t('Farq (to‘g‘ri xarajat darajasida)')}: <b>{pulKorsat(jami.farq)}</b></div>
            </div>
          )}
        </section>

        <section id="aktlar" className="fz-panel" aria-label={t('Kelgan aktlar')}>
          <div className="fz-panel__h"><span>{t('Subpudratchi aktlari')}</span><span>{(aktlar ?? []).length}</span></div>
          {aktlar !== null && aktlar.length === 0 && <p className="text-[13px] text-text-mute">{t('Hali akt kelmagan.')}</p>}
          <ul className="divide-y divide-border text-[13px]">
            {(aktlar ?? []).map((a) => (
              <Fragment key={a.id}>
                <li className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">{oyKorsat(a.oy)} · {a.sub_nom} - {a.obyekt_nom} <AktHolatBelgi holat={a.holat} /></span>
                  <span className="flex items-center gap-2 tabular-nums">{pulKorsat(a.jami_qqs_siz)}
                    <button type="button" className="fz-btn fz-btn--sm" onClick={() => void ochish(a)}>{ochiq === a.id ? t('Yopish') : t('Ko‘rish')}</button></span>
                </li>
                {ochiq === a.id && tafsilot && (
                  <li className="bg-surface-2 p-2">
                    <ul className="text-[12.5px]">
                      {tafsilot.qatorlar.map((q) => (
                        <li key={q.topshiriq_id} className="flex flex-wrap justify-between gap-2 py-1"><span>{q.kod ?? '—'} {q.nom}</span>
                          <span className="tabular-nums">{hajmKorsat(q.hajm)} {q.birlik} × {pulKorsat(q.narx)}</span></li>
                      ))}
                    </ul>
                    {a.holat === 'yuborilgan' && (
                      <div className="mt-2 flex flex-col gap-2">
                        <p className="text-[12px] text-text-mute">{t('Qabul qilsangiz: hajm faktga bir marta yoziladi va subpudrat xarajati qo‘shiladi.')}</p>
                        <input className="px-2 py-1 text-[13px]" maxLength={2000} placeholder={t('Qaytarish sababi (tuzatish yoki rad uchun)')} value={qaytarIzoh} onChange={(e) => setQaytarIzoh(e.target.value)} />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band} onClick={() => void qaror(a, 'qabul')}>{t('Qabul qilish')}</button>
                          <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void qaror(a, 'tuzatish')}>{t('Tuzatishga qaytarish')}</button>
                          <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" disabled={band} onClick={() => void qaror(a, 'rad')}>{t('Rad etish')}</button>
                        </div>
                      </div>
                    )}
                    {a.holat === 'qabul' && <p className="mt-2 text-[12px] text-text-mute">{t('Qabul qilingan: fakt va xarajat yozilgan.')}</p>}
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        </section>
      </div>
    </Sahifa>
  );
}
