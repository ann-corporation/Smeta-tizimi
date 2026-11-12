/**
 * Subpudratchi «Bugun» (ekotizim, tomon: subpudratchi): bitta sodda ekran - 5 katta tugma, har birida bitta keyingi qadam.
 *   1) Shartnomalarim (bosh pudratchilar)  2) Menga topshirilgan ishlar  3) Faktni kiritish va aktim  4) Aktlarim va qaror  5) To'lov holati
 * Bu begona sahifa EMAS: bosh pudratchi tenantidagi qatorlar t2_tomon_aloqa + t2_tomon_grant orqali, FAQAT hajm va KELISHILGAN narx bilan ko'rinadi
 * (bosh pudratchining smeta narxi/ustamasi serverdan umuman kelmaydi). Akt = t2_tomon_taqdim oqimi (qoralama -> yuborildi -> qaror).
 * Pul hisobi lib/hisob-yadro orqali (lib/subpudratchi/hisob.ts); noma'lum = «—».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileCheck2, HardHat, RefreshCw, Wallet, Handshake } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { aloqalarOl, type Aloqa } from '../../api/t2-tomon';
import { subAktTafsilotOl, subAktYoz, subAktYubor, subAktlarOl, subIshlarimOl, subTolovOl, type SubAktQisqa, type SubIsh, type SubTolovQator } from '../../api/t2-sub';
import { aktJami, ishQoldigi, subBugunHisobi, tolovHolati, subQatorSumma, type TolovHolat } from '../../lib/subpudratchi/hisob';
import { t } from '../../i18n/til';
import { AktHolatBelgi, Katak, hajmKorsat, oyKorsat, pulKorsat } from './sub-ui';

const TOLOV_NOMI: Record<TolovHolat, string> = { tolangan: 'To‘langan', qisman: 'Qisman to‘langan', tolanmagan: 'To‘lanmagan' };
const bugungiOy = () => new Date().toISOString().slice(0, 7);

export default function SubpudratchiBugun() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const [ishlar, setIshlar] = useState<SubIsh[] | null>(null);
  const [aktlar, setAktlar] = useState<SubAktQisqa[] | null>(null);
  const [tolov, setTolov] = useState<SubTolovQator[] | null>(null);
  const [aloqalar, setAloqalar] = useState<Aloqa[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [kalit, setKalit] = useState(0);
  const [tanlov, setTanlov] = useState<string>('');
  const [oy, setOy] = useState(bugungiOy());
  const [kiritma, setKiritma] = useState<Record<number, string>>({});
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    if (kid == null) return;
    setYuk(true);
    const [i, a, p, al] = await Promise.all([subIshlarimOl(kid), subAktlarOl(kid, 'yuborilgan'), subTolovOl(kid), aloqalarOl(kid)]);
    setYuk(false);
    const x: string[] = [];
    if (i.ok) setIshlar(i.natija.ishlar); else { setIshlar([]); x.push(i.error); }
    if (a.ok) setAktlar(a.natija.aktlar); else { setAktlar([]); x.push(a.error); }
    if (p.ok) setTolov(p.natija.aktlar); else { setTolov([]); x.push(p.error); }
    if (al.ok) setAloqalar(al.natija); else { setAloqalar([]); x.push(al.error); }
    setXato(x[0] ?? null);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla, kalit]);

  const h = useMemo(() => subBugunHisobi(ishlar ?? [], aktlar ?? []), [ishlar, aktlar]);
  const shartnomalar = useMemo(() => (aloqalar ?? []).filter((a) => a.men_rol.toLowerCase() === 'subpudratchi' && a.holat === 'faol'), [aloqalar]);
  /** (aloqa, obyekt) juftlari: har biri alohida akt. */
  const juftlar = useMemo(() => {
    const m = new Map<string, { aloqaId: number; obyektId: number; nom: string }>();
    for (const i of ishlar ?? []) m.set(`${i.aloqa_id}:${i.obyekt_id}`, { aloqaId: i.aloqa_id, obyektId: i.obyekt_id, nom: `${i.gc_nom} - ${i.obyekt_nom}` });
    return [...m.entries()].map(([k, v]) => ({ k, ...v }));
  }, [ishlar]);
  const tanlangan = juftlar.find((j) => j.k === tanlov) ?? juftlar[0] ?? null;
  const qatorlar = useMemo(() => (ishlar ?? []).filter((i) => tanlangan && i.aloqa_id === tanlangan.aloqaId && i.obyekt_id === tanlangan.obyektId), [ishlar, tanlangan]);
  const joriyAkt = useMemo(() => (aktlar ?? []).find((a) => tanlangan && a.aloqa_id === tanlangan.aloqaId && a.obyekt_id === tanlangan.obyektId && a.oy.slice(0, 7) === oy && a.holat !== 'bekor') ?? null, [aktlar, tanlangan, oy]);
  const tahrirlanadi = !joriyAkt || joriyAkt.holat === 'qoralama' || joriyAkt.holat === 'tuzatish';

  /* Mavjud qoralama/tuzatish aktni tahrirga yuklash */
  const joriyAktId = joriyAkt?.id ?? null;
  const joriyAktHolat = joriyAkt?.holat ?? null;
  useEffect(() => {
    if (kid == null) return;
    if (joriyAktId == null || (joriyAktHolat !== 'qoralama' && joriyAktHolat !== 'tuzatish')) { setKiritma({}); setIzoh(''); return; }
    let bekor = false;
    void subAktTafsilotOl(kid, joriyAktId).then((r) => {
      if (bekor || !r.ok) return;
      const m: Record<number, string> = {};
      for (const q of r.natija.qatorlar) m[q.topshiriq_id] = String(q.hajm);
      setKiritma(m); setIzoh(r.natija.akt.izoh ?? '');
    });
    return () => { bekor = true; };
  }, [kid, joriyAktId, joriyAktHolat, kalit]);

  const satrlar = qatorlar.map((q) => {
    const matn = (kiritma[q.id] ?? '').replace(',', '.').trim();
    const son = matn === '' ? null : Number(matn);
    const qoldiq = ishQoldigi(q);
    const xatoli = son != null && (!Number.isFinite(son) || son <= 0 || son > qoldiq);
    return { q, matn, son: son != null && Number.isFinite(son) && son > 0 ? son : null, qoldiq, xatoli };
  });
  const kiritilgan = satrlar.filter((s) => s.son != null);
  const buzuq = satrlar.some((s) => s.xatoli);
  const qqsFoiz = qatorlar.length && qatorlar.every((q) => q.qqs_foiz === qatorlar[0].qqs_foiz) ? qatorlar[0].qqs_foiz : null;
  const jami = aktJami(kiritilgan.map((s) => ({ hajm: s.son as number, narx: s.q.narx })), qqsFoiz);

  async function saqla(yubor: boolean) {
    if (kid == null || !tanlangan || band) return;
    if (!kiritilgan.length) { toast(t('Hech bo‘lmasa bitta qatorga bajarilgan hajmni kiriting.'), 'warn'); return; }
    if (buzuq) { toast(t('Hajm qoldiqdan oshmasligi kerak.'), 'danger'); return; }
    setBand(true);
    const r = await subAktYoz(kid, { aloqaId: tanlangan.aloqaId, obyektId: tanlangan.obyektId, oy: `${oy}-01`, aktId: joriyAkt?.id ?? null, izoh,
      qatorlar: kiritilgan.map((s) => ({ topshiriq_id: s.q.id, hajm: s.son as number })) });
    if (!r.ok) { setBand(false); toast(t(r.error), 'danger'); return; }
    if (yubor) {
      const y = await subAktYubor(kid, r.natija.id, izoh);
      if (!y.ok) { setBand(false); toast(t(y.error), 'danger'); setKalit((k) => k + 1); return; }
      toast(t('Akt bosh pudratchiga yuborildi.'), 'ok');
    } else toast(t('Qoralama saqlandi.'), 'ok');
    setBand(false);
    setKalit((k) => k + 1);
  }

  if (!joriy) return <KompaniyaKerak nima="Subpudratchi: bugun" />;
  const tayyor = ishlar !== null && aktlar !== null && tolov !== null && aloqalar !== null;
  const aktBoshqaOy = (a: SubAktQisqa) => { setTanlov(`${a.aloqa_id}:${a.obyekt_id}`); setOy(a.oy.slice(0, 7)); document.getElementById('akt')?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <Sahifa
      sarlavha="Subpudratchi: bugun"
      tavsif="Sizga topshirilgan ishlar, bajargan hajmingiz, aktingiz va to‘lov — bitta joyda."
      amallar={<button type="button" className="fz-btn fz-btn--ghost" onClick={() => setKalit((k) => k + 1)} disabled={yuk}><RefreshCw className={yuk ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}
    >
      <div className="flex flex-col gap-4 overflow-auto">
        {xato && <p className="fz-note" role="alert">{t(xato)}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Katak ikon={<Handshake size={16} />} nom={t('Shartnomalarim')} son={tayyor ? shartnomalar.length : null}
            izoh={t('Bosh pudratchilar bilan faol aloqalar')} tugma={t('Aloqalarni ko‘rish')} yol="/admin/kontragentlar?tab=aloqa" />
          <Katak ikon={<HardHat size={16} />} nom={t('Menga topshirilgan ishlar')} son={tayyor ? h.ishlar : null}
            izoh={tayyor ? t('Hajmi qolgan: {n}. Narxi kelishilmagan: {m}', { n: h.qolganIshlar, m: h.narxsiz }) : ''} tugma={t('Ishlarni ko‘rish')} yol="#ishlar" />
          <Katak ikon={<ClipboardList size={16} />} nom={t('Faktim va aktim')} son={tayyor ? h.qoralama.length + h.tuzatish.length : null} rang={h.tuzatish.length ? 'warn' : undefined}
            izoh={tayyor ? t('Tuzatishga qaytgan: {n}', { n: h.tuzatish.length }) : ''} tugma={t('Hajm kiritish')} yol="#akt" />
          <Katak ikon={<FileCheck2 size={16} />} nom={t('Yuborilgan aktlarim')} son={tayyor ? h.kutilmoqda.length : null}
            izoh={tayyor ? t('Qabul qilingan: {n}', { n: h.qabul.length }) : ''} tugma={t('Qarorni ko‘rish')} yol="#aktlar" />
          <Katak ikon={<Wallet size={16} />} nom={t('To‘lov holati')} son={tayyor ? (tolov ?? []).length : null}
            izoh={t('Qabul qilingan aktlar bo‘yicha')} tugma={t('To‘lovni ko‘rish')} yol="#tolov" />
        </div>

        <section id="ishlar" className="fz-panel" aria-label={t('Menga topshirilgan ishlar')}>
          <div className="fz-panel__h"><span>{t('Menga topshirilgan ishlar')}</span><span>{qatorlar.length}</span></div>
          {ishlar !== null && ishlar.length === 0 && <p className="text-[13px] text-text-mute">{t('Hozircha sizga ish topshirilmagan. Bosh pudratchi ish topshirgach, shu yerda ko‘rinadi.')}</p>}
          <ul className="divide-y divide-border text-[13px]">
            {qatorlar.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="fz-c-shifr">{q.kod ?? '—'}</span> <span className="font-medium">{q.nom}</span></span>
                <span className="text-text-mute tabular-nums">
                  {t('Topshirilgan')}: {hajmKorsat(q.hajm)} {q.birlik} · {t('qolgan')}: {hajmKorsat(ishQoldigi(q))} · {t('narx (QQS siz)')}: {q.narx == null ? t('kelishilmagan') : pulKorsat(q.narx)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-text-mute">{t('Bu yerda faqat sizga kelishilgan narx ko‘rinadi.')}</p>
        </section>

        <section id="akt" className="fz-panel" aria-label={t('Faktim va aktim')}>
          <div className="fz-panel__h"><span>{t('Bajargan hajmim va aktim')}</span></div>
          {juftlar.length === 0 ? <p className="text-[13px] text-text-mute">{t('Avval bosh pudratchi sizga ish topshirishi kerak.')}</p> : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Obyekt')}
                  <select className="px-2 py-1 text-[13px]" value={tanlangan?.k ?? ''} onChange={(e) => setTanlov(e.target.value)}>
                    {juftlar.map((j) => <option key={j.k} value={j.k}>{j.nom}</option>)}
                  </select></label>
                <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Hisobot oyi')}
                  <input type="month" className="px-2 py-1 text-[13px]" value={oy} onChange={(e) => setOy(e.target.value || bugungiOy())} /></label>
                {joriyAkt && <span className="self-end"><AktHolatBelgi holat={joriyAkt.holat} /></span>}
              </div>
              {joriyAkt?.holat === 'tuzatish' && joriyAkt.qaror_izoh && <p className="fz-note" role="status">{t('Bosh pudratchi izohi')}: {joriyAkt.qaror_izoh}</p>}
              {!tahrirlanadi && <p className="fz-note">{t('Bu oy akti yuborilgan - o‘zgartirib bo‘lmaydi. Javobni kuting.')}</p>}
              <ul className="divide-y divide-border text-[13px]">
                {satrlar.map((s) => (
                  <li key={s.q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="fz-c-shifr">{s.q.kod ?? '—'}</span> {s.q.nom}
                      <span className="block text-[12px] text-text-mute">{t('Qolgan')}: {hajmKorsat(s.qoldiq)} {s.q.birlik}{s.q.narx == null ? ` · ${t('narx kelishilmagan')}` : ''}</span></span>
                    <label className="flex items-center gap-1">
                      <input inputMode="decimal" className={`w-[110px] px-2 py-1 text-right text-[13px] ${s.xatoli ? 'border-danger' : ''}`} disabled={!tahrirlanadi || s.qoldiq <= 0}
                        aria-label={t('Bajarilgan hajm')} placeholder="0" value={kiritma[s.q.id] ?? ''} onChange={(e) => setKiritma((m) => ({ ...m, [s.q.id]: e.target.value }))} />
                      <span className="text-text-mute">{s.q.birlik}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="tabular-nums">{t('Jami (QQS siz)')}: <b>{pulKorsat(jami.qqsSiz)}</b> · {t('QQS bilan')}: <b>{pulKorsat(jami.qqsBilan)}</b>
                  {kiritilgan.some((s) => subQatorSumma(s.son, s.q.narx) == null) && <span className="text-warn"> · {t('narxi kelishilmagan qator bor')}</span>}</span>
                {tahrirlanadi && (
                  <span className="flex gap-2">
                    <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void saqla(false)}>{t('Qoralamani saqlash')}</button>
                    <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || jami.qqsSiz == null} onClick={() => void saqla(true)}>{t('Bosh pudratchiga yuborish')}</button>
                  </span>
                )}
              </div>
              {tahrirlanadi && <input className="px-2 py-1 text-[13px]" maxLength={1000} placeholder={t('Izoh (ixtiyoriy)')} value={izoh} onChange={(e) => setIzoh(e.target.value)} />}
              <p className="text-[12px] text-text-mute">{t('Foto, АОСР va laboratoriya natijasi kerak bo‘lsa — hujjatlar bo‘limidan qo‘shing.')} <Link className="underline" to="/admin/aosr">{t('АОСР va laboratoriya')}</Link></p>
            </div>
          )}
        </section>

        <section id="aktlar" className="fz-panel" aria-label={t('Yuborilgan aktlarim')}>
          <div className="fz-panel__h"><span>{t('Aktlarim va bosh pudratchi qarori')}</span><span>{(aktlar ?? []).length}</span></div>
          {aktlar !== null && aktlar.length === 0 && <p className="text-[13px] text-text-mute">{t('Hali akt yo‘q.')}</p>}
          <ul className="divide-y divide-border text-[13px]">
            {(aktlar ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">{oyKorsat(a.oy)} · {a.gc_nom} - {a.obyekt_nom} <AktHolatBelgi holat={a.holat} />
                  {a.holat === 'tuzatish' && a.qaror_izoh && <span className="block text-warn">{a.qaror_izoh}</span>}</span>
                <span className="flex items-center gap-2 tabular-nums">{pulKorsat(a.jami_qqs_siz)}
                  {(a.holat === 'qoralama' || a.holat === 'tuzatish') && <button type="button" className="fz-btn fz-btn--sm" onClick={() => aktBoshqaOy(a)}>{t('Tahrirlash')}</button>}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="tolov" className="fz-panel" aria-label={t('To‘lov holati')}>
          <div className="fz-panel__h"><span>{t('To‘lov holati')}</span></div>
          {tolov !== null && tolov.length === 0 && <p className="text-[13px] text-text-mute">{t('Qabul qilingan akt yo‘q.')}</p>}
          <ul className="divide-y divide-border text-[13px]">
            {(tolov ?? []).map((q) => {
              const th = tolovHolati(q);
              return (
                <li key={q.akt_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{oyKorsat(q.oy)} · {q.gc_nom} - {q.obyekt_nom}</span>
                  <span className="tabular-nums">
                    {t('Akt (QQS siz)')}: {pulKorsat(q.jami_qqs_siz)} · {th.holat ? t(TOLOV_NOMI[th.holat]) : t('To‘lov ma‘lumoti ochilmagan')}
                    {th.qarz != null && <> · {t('Qarz (QQS bilan)')}: {pulKorsat(th.qarz)}</>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12px] text-text-mute">{t('To‘lov ma‘lumotini bosh pudratchi ochsa ko‘rinadi.')}</p>
        </section>
      </div>
    </Sahifa>
  );
}
