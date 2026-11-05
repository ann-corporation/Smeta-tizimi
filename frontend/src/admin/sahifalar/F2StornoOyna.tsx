import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { sbT2AktReestrOl, type T2AktReestr } from '../../api/supabase';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';
import { yigindi2 } from '../../lib/hisob-yadro';
import { faolStornolar, stornoBolimlar, stornoFaktReja, stornoQilinadiAkt, stornoQator, stornoQur, type StornoDaraxtTugun, type StornoFaktRejim, type StornoManbaQator, type StornoReestrAkt, type StornoYukQator } from '../../lib/f2-storno';
import { f2StornoAktIdlari, f2StornoDaraxtOl, f2StornoFaktYoz, f2StornoHolatOl, f2StornoManbaOl, f2StornoQoralamaYarat, yangiOperationId, type StornoQatorKorinish } from '../../api/t2-f2-storno';
import { aktPodvalStornoNusxa } from '../../api/t2-akt-podval';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';

/** Server akt id qaytarmasa: reestrdagi shu raqamli (bo'lmasa eng so'nggi) F2 qoralamasi. */
async function oxirgiQoralamaTop(obyektId: number, raqam: string): Promise<number | null> {
  try {
    const r = await sbT2AktReestrOl(obyektId);
    if (!r.ok) return null;
    const q = ((r.qatorlar ?? []) as T2AktReestr[]).filter((a) => a.tur === 'f2' && a.holat === 'qoralama').sort((a, b) => b.id - a.id);
    return (q.find((a) => raqam !== '' && a.raqam === raqam) ?? q[0])?.id ?? null;
  } catch { return null; }
}

export type F2StornoAkt = { id: number; raqam: string | null; oy: string | null; hujjat_jami: number | null };

const KORSATISH_LIMIT = 400;
const bugun = () => new Date().toISOString().slice(0, 10);
const oyBosh = () => `${bugun().slice(0, 7)}-01`;
const kalit = (aktId: number, qatorId: number) => `${aktId}:${qatorId}`;

/**
 * «Storno (minus) F2 yaratish»: tanlangan F2 aktning (BIR NECHTA bo'lishi mumkin — egasi 2026-11-03) qatorlari (hammasi belgilangan;
 * SAQLAB QOLINADIGANLARNI belgidan oling) minus qilib YANGI qoralamaga yoziladi, har eski F2 alohida blok (qator `stornoOf` = shu akt id),
 * har blok o'z hujjat podvalini (`t2_akt_podval`) ishora-teskari nusxada oladi. Fakt — aniq tanlov (egasi 2026-11-05): sukut bo'yicha shu qatorlarning
 * fakti minus yozuv bilan 0 ga tushiriladi; «Faktni o'zgartirma» — fakt allaqachon to'g'rilangan, hech qanday fakt yozuvi yo'q.
 * Asl akt va o'tgan fakt yozuvlari o'zgarmaydi. Yangi pozitsiyalar keyin F2 tayyorlashda shu qoralama ostiga qo'shiladi.
 */
export function F2StornoOyna(p: {
  obyektId: number; akt: F2StornoAkt; reestr: readonly StornoReestrAkt[];
  /** Birga storno qilinadigan boshqa eski F2 lar (bitta pereraschet hujjatida alohida bloklar). */
  qoshimcha?: readonly F2StornoAkt[];
  onYop: () => void;
  /** Qoralama (va fakt 0 ga) tayyor bo'lgach yangi qoralama id si bilan chaqiriladi. */
  onYaratildi?: (yangiAktId: number) => void;
  /** Fakt tanlovining boshlang'ich qiymati (pereraschet oqimida «o'zgartirma»). */
  faktRejimSukut?: StornoFaktRejim;
  /** Eski nom (F2 tarixi): `onYaratildi` bilan bir vaqtda chaqiriladi. */
  onTugadi?: (yangiAktId: number) => void;
}) {
  const { joriyId } = useKompaniya();
  const aktlar = useMemo(() => [p.akt, ...(p.qoshimcha ?? [])], [p.akt, p.qoshimcha]);
  const kop = aktlar.length > 1;
  const aktNomi = (a: F2StornoAkt) => a.raqam || String(a.id);
  const [yuk, setYuk] = useState<Array<{ akt: F2StornoAkt; qatorlar: StornoManbaQator[] }> | null>(null);
  const [holat, setHolat] = useState<StornoQatorKorinish[] | null>(null);
  const [faol, setFaol] = useState<StornoReestrAkt[] | null>(null);
  const [yuklashXato, setYuklashXato] = useState('');
  const [tanlangan, setTanlangan] = useState<ReadonlySet<string>>(new Set());
  const [qidir, setQidir] = useState('');
  const [raqam, setRaqam] = useState(`${aktlar.map(aktNomi).join('+')}-С`);
  const [oy, setOy] = useState(oyBosh());
  const [takrorTasdiq, setTakrorTasdiq] = useState(false);
  /** Fakt bilan nima qilinadi (sukut — eski oqim: 0 ga). */
  const [faktRejim, setFaktRejim] = useState<StornoFaktRejim>(p.faktRejimSukut ?? 'nolga');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  /** Qoralama yaratilgach shu yerda saqlanadi: podval nusxasi / fakt yozuvi yiqilsa, faqat shu qadamlar qayta uriniladi (qoralama takrorlanmaydi). */
  const [yaratilganAkt, setYaratilganAkt] = useState<number | null>(null);
  const opQoralama = useRef(yangiOperationId());
  const opFakt = useRef(yangiOperationId());

  useEffect(() => {
    let jonli = true;
    void (async () => {
      try {
        const [m, h, ids] = await Promise.all([
          Promise.all(aktlar.map((a) => f2StornoManbaOl(a.id, p.obyektId))), f2StornoHolatOl(p.obyektId),
          Promise.all(aktlar.map((a) => f2StornoAktIdlari(a.id, p.obyektId))),
        ]);
        if (!jonli) return;
        if (m.some((x) => !x.ok) || !h.ok) { setYuklashXato(t('F2 qatorlari yoki fakt holati o‘qilmadi. Qayta urinib ko‘ring.')); return; }
        const y = aktlar.map((a, i) => ({ akt: a, qatorlar: m[i].qatorlar }));
        setYuk(y); setHolat(h.qatorlar);
        setFaol(faolStornolar([...new Set(ids.flat())], p.reestr));
        setTanlangan(new Set(y.flatMap((e) => e.qatorlar.filter((x) => stornoQator(x, e.akt.id).tur === 'qator').map((x) => kalit(e.akt.id, x.qator_id)))));
      } catch { if (jonli) setYuklashXato(t('Storno tekshiruvi o‘qilmadi (ikki marta storno himoyasi). Qayta urinib ko‘ring.')); }
    })();
    return () => { jonli = false; };
  }, [aktlar, p.obyektId, p.reestr]);

  const nomlar = useMemo(() => new Map((holat ?? []).map((h) => [h.qator_id, h] as const)), [holat]);
  /** Bitta qator bitta hujjatda ikki marta bo'lmaydi: ikkinchi eski F2 dagi bir xil pozitsiya tashlanadi (`toqnashdi`). */
  const reja = useMemo(() => {
    if (!yuk) return null;
    const band2 = new Set<number>();
    const qatorlar: StornoYukQator[] = [];
    let nomalum = 0; let toqnashdi = 0;
    for (const e of yuk) {
      const set = new Set<number>();
      for (const x of e.qatorlar) {
        if (!tanlangan.has(kalit(e.akt.id, x.qator_id))) continue;
        if (band2.has(x.qator_id)) { toqnashdi++; continue; }
        set.add(x.qator_id);
      }
      const r = stornoQur(e.qatorlar, e.akt.id, set);
      for (const q of r.qatorlar) band2.add(q.qatorId);
      qatorlar.push(...r.qatorlar); nomalum += r.nomalum;
    }
    return { qatorlar, jami: yigindi2(qatorlar.map((q) => q.certifiedAmount)), nomalum, toqnashdi };
  }, [yuk, tanlangan]);
  const stornolanadi = useMemo(() => new Set((reja?.qatorlar ?? []).map((q) => q.qatorId)), [reja]);
  const faktReja = useMemo(() => (holat ? stornoFaktReja(stornolanadi, holat, aktlar.map(aktNomi).join('+')) : null), [holat, stornolanadi, aktlar]);

  const qatorlar = useMemo(() => (yuk ?? []).flatMap((e) => e.qatorlar.map((x) => ({ akt: e.akt, x }))), [yuk]);
  const korinadigan = useMemo(() => {
    const q = qidir.trim().toLowerCase();
    return qatorlar.filter(({ x }) => {
      if (!q) return true;
      const n = nomlar.get(x.qator_id);
      return `${n?.kod ?? ''} ${n?.nom ?? ''}`.toLowerCase().includes(q);
    });
  }, [qatorlar, qidir, nomlar]);

  /* Bo'lim bo'yicha tanlash (egasi 2026-11-05): tanlangan rz ning BUTUN avlodi — ishlar, rs/mat/ob, qo'shimcha qatorlar.
   * Daraxt o'qilmasa — bu tanlov ko'rinmaydi, qolgan oqim o'zgarmaydi. */
  const [daraxt, setDaraxt] = useState<StornoDaraxtTugun[] | null>(null);
  useEffect(() => {
    let jonli = true;
    void (async () => {
      try { const r = await f2StornoDaraxtOl(p.obyektId); if (jonli) setDaraxt(r.ok ? r.qatorlar : null); } catch { if (jonli) setDaraxt(null); }
    })();
    return () => { jonli = false; };
  }, [p.obyektId]);
  const bolimlar = useMemo(() => (daraxt && qatorlar.length ? stornoBolimlar(daraxt, qatorlar.map(({ x }) => x.qator_id)) : []), [daraxt, qatorlar]);
  const [bolimId, setBolimId] = useState<number | null>(null);
  const bolimBelgila = (rejim: 'qosh' | 'ol' | 'faqat') => {
    const b = bolimlar.find((x) => x.id === bolimId);
    if (!b) return;
    const ichida = new Set(b.qatorlar);
    setTanlangan((s) => {
      const n = rejim === 'faqat' ? new Set<string>() : new Set(s);
      for (const { akt, x } of qatorlar) {
        if (!ichida.has(x.qator_id) || stornoQator(x, akt.id).tur !== 'qator') continue;
        if (rejim === 'ol') n.delete(kalit(akt.id, x.qator_id)); else n.add(kalit(akt.id, x.qator_id));
      }
      return n;
    });
  };
  const bolimTanlovBor = bolimlar.length > 0;
  const bolimTanlanmagan = bolimId == null || band || yaratilganAkt != null;

  const kesilgan = korinadigan.length > KORSATISH_LIMIT;
  const belgila = (k: string, on: boolean) => setTanlangan((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
  const hammasi = (on: boolean) => setTanlangan((s) => {
    const n = new Set(s);
    for (const { akt, x } of korinadigan) { if (stornoQator(x, akt.id).tur !== 'qator') continue; if (on) n.add(kalit(akt.id, x.qator_id)); else n.delete(kalit(akt.id, x.qator_id)); }
    return n;
  });

  /** Storno manbai faqat TASDIQLANGAN F2 (reestrda tekshiriladi; topilmasa — ruxsat yo'q). */
  const tasdiqlanmagan = useMemo(() => aktlar.filter((a) => { const r = p.reestr.find((x) => x.id === a.id); return !r || !stornoQilinadiAkt(r); }), [aktlar, p.reestr]);
  const takrorKerak = (faol?.length ?? 0) > 0;
  const tayyor = !!reja && reja.qatorlar.length > 0 && !!/^\d{4}-\d{2}-\d{2}$/.test(oy) && (!takrorKerak || takrorTasdiq) && faol !== null && tasdiqlanmagan.length === 0;

  const bitdi = (aktId: number) => { p.onYaratildi?.(aktId); p.onTugadi?.(aktId); };

  /** Har eski F2 ning O'Z podvali ishora-teskari nusxada yangi qoralama bloklariga ko'chadi (idempotent). Yiqilsa — jim smeta podvaliga o'tilmaydi. */
  async function podvalNusxa(aktId: number): Promise<boolean> {
    if (!joriyId) { setXato(t('Kompaniya aniqlanmadi — podval nusxalanmadi.')); return false; }
    const yiqilgan: string[] = [];
    for (const a of aktlar) {
      if (!stornolanadi.size) break;
      const r = await aktPodvalStornoNusxa({ kompaniyaId: joriyId, aktId, manbaAktId: a.id }).catch(() => null);
      if (!r?.ok) yiqilgan.push(`№${aktNomi(a)}`);
    }
    if (yiqilgan.length) { setXato(`${t('Storno qoralamasi yaratildi, lekin hujjat podvali nusxalanmadi')}: ${yiqilgan.join(', ')} ${t('— qayta urinib ko‘ring (qoralama takrorlanmaydi).')}`); return false; }
    return true;
  }

  async function faktYoz(aktId: number) {
    if (!await podvalNusxa(aktId)) return;
    // «Faktni o'zgartirma»: fakt allaqachon to'g'rilangan — hech qanday fakt yozuvi yo'q, bu muvaffaqiyat.
    if (faktRejim === 'ozgartirma' || !faktReja || faktReja.yozuvlar.length === 0) { bitdi(aktId); return; }
    const r = await f2StornoFaktYoz({ obyektId: p.obyektId, sana: bugun(), yozuvlar: faktReja.yozuvlar, operationId: opFakt.current, raqam: undefined, izoh: `Сторно F2 №${aktlar.map(aktNomi).join('+')}: fakt 0 ga` });
    if (!r.ok) { setXato(`${t('Storno qoralamasi yaratildi, lekin fakt 0 ga tushmadi')}: ${r.error || r.xabar || ''} ${t('— qayta urinib ko‘ring (qoralama takrorlanmaydi).')}`); return; }
    bitdi(aktId);
  }

  async function bajar() {
    if (!tayyor || !reja || band) return;
    setBand(true); setXato('');
    try {
      let aktId = yaratilganAkt;
      if (aktId == null) {
        const r = await f2StornoQoralamaYarat({ obyektId: p.obyektId, oy, raqam: raqam.trim() || undefined, qatorlar: reja.qatorlar, operationId: opQoralama.current });
        if (!r.ok) { setXato(r.error || r.xabar || t('Storno qoralamasi yaratilmadi.')); return; }
        const topilgan = r.akt_id ?? await oxirgiQoralamaTop(p.obyektId, raqam.trim());
        if (topilgan == null) { setXato(t('Storno qoralamasi yaratildi, lekin uning raqami olinmadi. F2 tarixidan oching.')); return; }
        aktId = topilgan; setYaratilganAkt(aktId);
      }
      await faktYoz(aktId);
    } catch { setXato(t('Javob olinmadi. Qayta urinib ko‘ring — takror yozilmaydi.')); }
    finally { setBand(false); }
  }

  return (
    <F2Oyna label={t('Storno (minus) F2 yaratish')} onYop={band ? undefined : p.onYop} kenglik={880}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><RotateCcw size={15} aria-hidden="true" /> {t('Storno (minus) F2 yaratish')}</h3></div>
      <div className="space-y-3 p-4 text-[13px]">
        {aktlar.map((a) => (
          <p key={a.id} className="text-text-dim">{t('F2 №{r} · {d} — tanlangan qatorlar minus qilib YANGI qoralamaga yoziladi (narx o‘sha). Asl F2 o‘zgarmaydi.', { r: aktNomi(a), d: davrNomi(a.oy ?? '', tilLocale()) || '—' })}</p>
        ))}
        {kop && <p data-testid="storno-kop" className="fz-note fz-note--info">{t('{n} ta eski F2: har biri hujjatda alohida «Сторно Ф-2 №…» bloki bo‘ladi va o‘z podvali bilan hisoblanadi.', { n: aktlar.length })}</p>}
        {tasdiqlanmagan.length > 0 && <p role="alert" data-testid="storno-tasdiqlanmagan" className="fz-note fz-note--danger"><ShieldAlert />{t('Faqat tasdiqlangan F2 storno qilinadi: {r} tasdiqlanmagan (qoralama yoki bekor).', { r: tasdiqlanmagan.map((a) => `№${aktNomi(a)}`).join(', ') })}</p>}
        {yuklashXato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{yuklashXato}</p>}
        {!yuklashXato && !yuk && <div className="skel min-h-[120px] rounded-xl" />}
        {takrorKerak && (
          <div role="alert" className="fz-note fz-note--warn flex-wrap">
            <ShieldAlert />
            <span>{t('Bu F2 uchun storno allaqachon bor: {r}. Yana bir storno ikki marta minus qiladi.', { r: (faol ?? []).map((a) => `№${a.raqam || a.id}`).join(', ') })}</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={takrorTasdiq} onChange={(e) => setTakrorTasdiq(e.target.checked)} />{t('Baribir yana bitta storno yarataman')}</label>
          </div>
        )}
        {yuk && reja && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={t('Qator qidirish')} value={qidir} onChange={(e) => setQidir(e.target.value)} placeholder={t('Kod yoki nom bo‘yicha qidirish')} className="w-64" />
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasi(true)}>{t('Ko‘ringanlarni belgilash')}</button>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasi(false)}>{t('Ko‘ringanlardan belgini olish')}</button>
              <span className="text-text-dim">{t('Saqlab qolinadigan qatorlardan belgini oling.')}</span>
            </div>
            {bolimTanlovBor && (
              <div className="flex flex-wrap items-center gap-2" data-testid="storno-bolim-tanlov">
                <label className="text-text-dim">{t('Bo‘lim bo‘yicha tanlash')}
                  <select aria-label={t('Bo‘lim bo‘yicha tanlash')} className="ml-2 max-w-[28rem]" value={bolimId ?? ''} onChange={(e) => setBolimId(e.target.value === '' ? null : Number(e.target.value))}>
                    <option value="">{t('— bo‘limni tanlang —')}</option>
                    {bolimlar.map((b) => <option key={b.id} value={b.id}>{`${' '.repeat(Math.min(b.daraja, 6) * 2)}${b.yol} (${b.qatorlar.length})`}</option>)}
                  </select>
                </label>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={bolimTanlanmagan} onClick={() => bolimBelgila('faqat')}>{t('Faqat shu bo‘lim')}</button>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={bolimTanlanmagan} onClick={() => bolimBelgila('qosh')}>{t('Bo‘limni qo‘shish')}</button>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={bolimTanlanmagan} onClick={() => bolimBelgila('ol')}>{t('Bo‘limdan belgini olish')}</button>
              </div>
            )}
            <div className="max-h-[38dvh] overflow-auto rounded border border-border/60">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-text-dim"><tr><th className="w-8 p-1.5" />{kop && <th>{t('F2 №')}</th>}<th>{t('Kod')}</th><th>{t('Nomi')}</th><th className="text-right">{t('Hajm')}</th><th className="text-right">{t('Summa')}</th><th className="p-1.5 text-right">{t('Fakt')}</th></tr></thead>
                <tbody>
                  {korinadigan.slice(0, KORSATISH_LIMIT).map(({ akt, x }) => {
                    const n = stornoQator(x, akt.id);
                    const h = nomlar.get(x.qator_id);
                    const k = kalit(akt.id, x.qator_id);
                    return (
                      <tr key={k} data-testid="f2-storno-qator" className="border-t border-border/40">
                        <td className="p-1.5"><input type="checkbox" disabled={n.tur !== 'qator' || band || yaratilganAkt != null} checked={tanlangan.has(k)} onChange={(e) => belgila(k, e.target.checked)} aria-label={t('Storno: {n}', { n: h?.kod || h?.nom || String(x.qator_id) })} /></td>
                        {kop && <td>{aktNomi(akt)}</td>}
                        <td>{h?.kod || '—'}</td>
                        <td>{h?.nom || `#${x.qator_id}`}{n.tur === 'otkaz' && <span className="ml-1 text-warn">({n.sabab === 'nol' ? t('hajm 0 — stornolanmaydi') : t('hajm noma‘lum — stornolanmaydi')})</span>}</td>
                        <td className="text-right tabular-nums">{n.tur === 'qator' ? <FmtN val={n.qator.certifiedQuantity} /> : '—'}</td>
                        <td className="text-right tabular-nums">{n.tur === 'qator' ? (n.qator.certifiedAmount == null ? <span className="text-warn">{t('noma‘lum')}</span> : <FmtN val={n.qator.certifiedAmount} />) : '—'}</td>
                        <td className="p-1.5 text-right tabular-nums">{h?.fakt_hajm != null ? <FmtN val={Number(h.fakt_hajm)} /> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {kesilgan && <p className="p-2 text-text-dim">{t('Ro‘yxat {n} qatorgacha ko‘rsatildi — qidiruv bilan toraytiring (belgilar hammasi uchun amal qiladi).', { n: KORSATISH_LIMIT })}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-4" aria-label={t('Storno jami')}>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Qatorlar')}</p><p data-testid="storno-soni" className="text-lg font-semibold tabular-nums">{reja.qatorlar.length}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Σ summa (minus)')}</p><p data-testid="storno-jami" className="text-lg font-semibold tabular-nums"><FmtN val={reja.jami} /></p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Summasi noma‘lum')}</p><p data-testid="storno-nomalum" className={`text-lg font-semibold tabular-nums ${reja.nomalum ? 'text-warn' : ''}`}>{reja.nomalum}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Saqlab qolinadi')}</p><p className="text-lg font-semibold tabular-nums">{qatorlar.length - reja.qatorlar.length}</p></div>
            </div>
            {reja.toqnashdi > 0 && <p data-testid="storno-toqnashuv" className="fz-note fz-note--warn"><ShieldAlert />{t('{n} ta qator bir nechta eski F2 da bor: bitta hujjatda bir pozitsiya ikki marta bo‘lmaydi — keyingi F2 dagisi tashlandi.', { n: reja.toqnashdi })}</p>}
            <fieldset data-testid="storno-fakt-rejim" className="fz-card space-y-1 px-3 py-2" disabled={band}>
              <legend className="text-xs font-semibold">{t('Fakt bilan nima qilinadi?')}</legend>
              <label className="flex items-center gap-1.5"><input type="radio" name="storno-fakt-rejim" checked={faktRejim === 'nolga'} onChange={() => setFaktRejim('nolga')} />{t('Faktni 0 ga tushirish')}</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="storno-fakt-rejim" checked={faktRejim === 'ozgartirma'} onChange={() => setFaktRejim('ozgartirma')} />{t('Faktni o‘zgartirma (fakt allaqachon to‘g‘rilangan)')}</label>
              <p className="text-text-dim">{t('Fakt allaqachon to‘g‘rilangan bo‘lsa «o‘zgartirma» ni tanlang: eski F2 minus tepada, yangi plyus hajmlar to‘g‘rilangan faktdan pastda qo‘shiladi.')}</p>
            </fieldset>
            {faktRejim === 'nolga'
              ? <p data-testid="storno-fakt" className="fz-note fz-note--info">{t('Fakt ham 0 ga tushiriladi: {n} qator', { n: faktReja?.yozuvlar.length ?? 0 })}
                {faktReja && faktReja.hosila > 0 ? ` · ${t('{n} qatorning fakti ish normasidan hosil bo‘ladi (qo‘lda yozilmaydi)', { n: faktReja.hosila })}` : ''}
                {' — '}{t('o‘tgan fakt yozuvlari o‘chirilmaydi, minus yozuv qo‘shiladi.')}</p>
              : <p data-testid="storno-fakt" className="fz-note fz-note--info">{t('Fakt o‘zgarmaydi: hech qanday fakt yozuvi qo‘shilmaydi.')}</p>}
            {reja.nomalum > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} qatorda summa noma‘lum: noma‘lum bo‘lib qoladi (0 emas), narx «ataylab yo‘q» deb belgilanadi.', { n: reja.nomalum })}</p>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-text-dim">{t('Storno F2 raqami')}<input value={raqam} onChange={(e) => setRaqam(e.target.value)} maxLength={100} className="mt-1 block w-48" disabled={band || yaratilganAkt != null} /></label>
              <label className="text-xs text-text-dim">{t('Davr')}<input type="month" value={oy.slice(0, 7)} onChange={(e) => setOy(`${e.target.value}-01`)} className="mt-1 block" disabled={band || yaratilganAkt != null} /></label>
            </div>
          </>
        )}
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop} disabled={band}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" onClick={() => void bajar()} disabled={!tayyor || band}>
            {band ? '…' : yaratilganAkt != null ? (faktRejim === 'nolga' ? t('Podval va faktni qayta urinish') : t('Podvalni qayta urinish')) : t('{n} qatorni storno qilish', { n: reja?.qatorlar.length ?? 0 })}
          </button>
        </div>
      </div>
    </F2Oyna>
  );
}

export default F2StornoOyna;
