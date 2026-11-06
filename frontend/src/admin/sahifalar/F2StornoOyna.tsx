import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { sbT2AktReestrOl, type T2AktReestr } from '../../api/supabase';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';
import { yigindi2 } from '../../lib/hisob-yadro';
import { faolStornolar, stornoFaktReja, stornoQilinadiAkt, stornoQator, stornoQur, type StornoDaraxtTugun, type StornoFaktRejim, type StornoManbaQator, type StornoReestrAkt, type StornoYukQator } from '../../lib/f2-storno';
import { stornoBelgiHolat, stornoBolinganIshlar, stornoDaraxtQur, stornoJamlar, stornoQidir, stornoTugunAlmashtir, stornoUmumiy, type StornoTugun } from '../../lib/f2-storno-daraxt';
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

  /* Daraxt (egasi 2026-11-06): УЧАСТОК/РАЗДЕЛ → ish → resurs/material, uch holatli belgilar. Smeta daraxti o'qilmasa —
   * qatorlar yassi ro'yxatda (tanlov va storno yuki o'zgarmaydi). */
  const [daraxt, setDaraxt] = useState<StornoDaraxtTugun[] | null>(null);
  useEffect(() => {
    let jonli = true;
    void (async () => {
      try { const r = await f2StornoDaraxtOl(p.obyektId); if (jonli) setDaraxt(r.ok ? r.qatorlar : null); } catch { if (jonli) setDaraxt(null); }
    })();
    return () => { jonli = false; };
  }, [p.obyektId]);
  const tree = useMemo(() => (yuk ? stornoDaraxtQur({
    bloklar: yuk.map((e) => ({ aktId: e.akt.id, aktNom: aktNomi(e.akt), qatorlar: e.qatorlar })), daraxt, nomlar, kalit,
  }) : null), [yuk, daraxt, nomlar]);
  const jam = useMemo(() => stornoJamlar(tree?.ildiz ?? [], tanlangan), [tree, tanlangan]);
  const umumiy = useMemo(() => (tree ? stornoUmumiy(tree.ildiz, jam) : null), [tree, jam]);
  const bolingan = useMemo(() => (tree ? stornoBolinganIshlar(tree.byId, jam) : []), [tree, jam]);
  const qidiruv = useMemo(() => (tree ? stornoQidir(tree.ildiz, tree.byId, qidir) : null), [tree, qidir]);
  /** Ochiq tugunlar: sukut — F2 bloklari va 1-daraja bo'limlar (ichki bo'limlar va ishlar yopiq). */
  const [ochiq, setOchiq] = useState<ReadonlySet<string> | null>(null);
  const ochiqlar = useMemo(() => ochiq ?? new Set((tree ? [...tree.byId.values()] : []).filter((t) => t.k === 'akt' || (t.k === 'bolim' && (t.ota == null || tree?.byId.get(t.ota)?.k === 'akt'))).map((t) => t.id)), [ochiq, tree]);
  const [faqatQolgan, setFaqatQolgan] = useState(false);
  const [limit, setLimit] = useState(KORSATISH_LIMIT);
  const satrlar = useMemo(() => {
    const out: StornoTugun[] = [];
    if (!tree) return out;
    const yur = (ns: readonly StornoTugun[]) => {
      for (const n of ns) {
        if (qidiruv && !qidiruv.korinadi.has(n.id)) continue;
        if (faqatQolgan && stornoBelgiHolat(jam.get(n.id)) === 'bor' && (jam.get(n.id)?.barchasi ?? 0) > 0) continue;
        out.push(n);
        if (n.bolalar.length && (ochiqlar.has(n.id) || qidiruv?.ochiq.has(n.id))) yur(n.bolalar);
      }
    };
    yur(tree.ildiz);
    return out;
  }, [tree, qidiruv, faqatQolgan, jam, ochiqlar]);
  const yanaSoni = satrlar.length - limit;
  const ochYop = (id: string) => setOchiq(() => { const n = new Set(ochiqlar); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hammasiniOch = (on: boolean) => setOchiq(on && tree ? new Set([...tree.byId.values()].filter((t) => t.bolalar.length).map((t) => t.id)) : new Set());
  const tugunBelgila = (n: StornoTugun) => setTanlangan((s) => stornoTugunAlmashtir(n, jam.get(n.id), s));
  const hammasi = (on: boolean) => setTanlangan(on && tree ? new Set(tree.ildiz.flatMap((n) => n.barglar)) : new Set());
  const qulf = band || yaratilganAkt != null;
  /** Saqlab qolinadigan qism — 1-daraja bo'limlar kesimida. */
  /** Haqiqiy noma'lum summa soni: resurslari bor ishning bo'sh o'z summasi noma'lum emas (puli resurslarida). Daraxt bo'lmasa — reja. */
  const nomalumSoni = umumiy?.nomalum ?? reja?.nomalum ?? 0;
  const qolganBolimlar = useMemo(() => (tree ? [...tree.byId.values()].filter((t) => t.k === 'bolim' && (t.ota == null || tree.byId.get(t.ota)?.k === 'akt') && (jam.get(t.id)?.qolganSoni ?? 0) > 0) : []), [tree, jam]);

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
            <p className="text-text-dim">{t('Hammasi belgilangan. Saqlab qolinadigan bo‘lim, ish yoki qatordan belgini oling — masalan, «ЗЕМЛЯНЫЕ РАБОТЫ» ni qoldirish uchun shu bo‘lim belgisini bir marta bosing.')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={t('Qator qidirish')} value={qidir} onChange={(e) => { setQidir(e.target.value); setLimit(KORSATISH_LIMIT); }} placeholder={t('Kod yoki nom bo‘yicha qidirish')} className="w-full sm:w-64" />
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={qulf} onClick={() => hammasi(true)}>{t('Hammasini belgilash')}</button>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={qulf} onClick={() => hammasi(false)}>{t('Hammasidan olish')}</button>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" aria-pressed={faqatQolgan} onClick={() => setFaqatQolgan((v) => !v)}>{faqatQolgan ? t('Hammasini ko‘rsatish') : t('Tanlanmaganlarni ko‘rsatish')}</button>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasiniOch(true)}>{t('Hammasini ochish')}</button>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasiniOch(false)}>{t('Hammasini yopish')}</button>
            </div>
            <div role="tree" aria-label={t('Storno qatorlari daraxti')} data-testid="storno-daraxt" className="max-h-[46dvh] overflow-auto rounded border border-border/60 text-[12.5px]">
              {satrlar.slice(0, limit).map((n) => {
                const j = jam.get(n.id);
                const holat = stornoBelgiHolat(j);
                const q = n.q;
                const guruh = n.k === 'akt' || n.k === 'bolim';
                const ochilgan = ochiqlar.has(n.id) || !!qidiruv?.ochiq.has(n.id);
                const tanlanmaydi = (j?.barchasi ?? 0) === 0;
                const fakt = q ? nomlar.get(q.qatorId)?.fakt_hajm : null;
                return (
                  <div key={n.id} role="treeitem" aria-level={n.daraja + 1} aria-expanded={n.bolalar.length ? ochilgan : undefined} aria-selected={holat === 'bor'}
                    data-testid={guruh ? 'storno-bolim' : 'f2-storno-qator'}
                    className={`flex items-center gap-1.5 border-t border-border/40 py-1 pr-2 ${guruh ? 'bg-surface-2/60 font-semibold' : ''} ${holat === 'yoq' && !tanlanmaydi ? 'text-text-dim' : ''}`}
                    style={{ paddingLeft: 6 + Math.min(n.daraja, 8) * 14 }}>
                    {n.bolalar.length
                      ? <button type="button" className="w-5 shrink-0 text-text-dim" aria-label={ochilgan ? t('Yopish: {n}', { n: n.nom }) : t('Ochish: {n}', { n: n.nom })} onClick={() => ochYop(n.id)}>{ochilgan ? '▾' : '▸'}</button>
                      : <span className="w-5 shrink-0" />}
                    <input type="checkbox" className="shrink-0" disabled={tanlanmaydi || qulf} checked={holat === 'bor'}
                      ref={(el) => { if (el) el.indeterminate = holat === 'qisman'; }}
                      onChange={() => tugunBelgila(n)}
                      aria-label={guruh ? t('Storno bo‘limi: {n}', { n: n.nom }) : t('Storno: {n}', { n: q?.kod || n.nom })} />
                    <span className="min-w-0 flex-1 truncate" title={n.nom}>
                      {q?.kod && <span className="mr-1.5 font-mono text-[11.5px] text-text-mute">{q.kod}</span>}
                      {n.nom}
                      {q?.otkaz && <span className="ml-1 text-warn">({q.otkaz === 'nol' ? t('hajm 0 — stornolanmaydi') : t('hajm noma‘lum — stornolanmaydi')})</span>}
                    </span>
                    {q && q.hajm != null && <span className="hidden w-28 shrink-0 text-right tabular-nums sm:inline"><FmtN val={q.hajm} /> {q.birlik ?? ''}</span>}
                    {n.k === 'qator' && q && (
                      <span className="w-28 shrink-0 text-right tabular-nums">{q.otkaz ? '—' : q.summa == null ? <span className="text-warn">{t('noma‘lum')}</span> : <FmtN val={q.summa} />}</span>
                    )}
                    {n.k !== 'qator' && j && (
                      <span className="shrink-0 text-right text-[11.5px] tabular-nums" data-testid="storno-tugun-jam">
                        <span className="text-text-mute">{j.soni}/{j.barchasi} · </span><FmtN val={j.jami} />
                        {j.nomalum > 0 && <span className="ml-1 text-warn">({t('qisman noma‘lum: {n}', { n: j.nomalum })})</span>}
                      </span>
                    )}
                    {n.k === 'qator' && <span className="hidden w-16 shrink-0 text-right tabular-nums text-text-mute sm:inline">{fakt != null ? <FmtN val={Number(fakt)} /> : ''}</span>}
                  </div>
                );
              })}
              {satrlar.length === 0 && <p className="p-2 text-text-dim">{t('Hech narsa topilmadi.')}</p>}
              {yanaSoni > 0 && (
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm m-2" onClick={() => setLimit((l) => l + KORSATISH_LIMIT)}>
                  {t('Yana ko‘rsatish ({n} qoldi)', { n: yanaSoni })}
                </button>
              )}
            </div>
            {bolingan.length > 0 && (
              <p data-testid="storno-bolingan" className="fz-note fz-note--warn"><ShieldAlert />
                {t('{n} ta ish o‘z resurslaridan ajratildi (bir qismi storno, bir qismi qoladi): {r}. Ataylab bo‘lsa — davom eting.', { n: bolingan.length, r: bolingan.slice(0, 3).map((x) => x.q?.kod || x.nom).join(', ') + (bolingan.length > 3 ? '…' : '') })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('Storno jami')}>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Qatorlar')}</p><p data-testid="storno-soni" className="text-lg font-semibold tabular-nums">{reja.qatorlar.length}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Σ summa (minus)')}</p><p data-testid="storno-jami" className="text-lg font-semibold tabular-nums"><FmtN val={reja.jami} /></p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Summasi noma‘lum')}</p><p data-testid="storno-nomalum" className={`text-lg font-semibold tabular-nums ${nomalumSoni ? 'text-warn' : ''}`}>{nomalumSoni}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Saqlab qolinadi')}</p><p data-testid="storno-qoladi-soni" className="text-lg font-semibold tabular-nums">{umumiy?.qolganSoni ?? 0}</p></div>
            </div>
            {umumiy && umumiy.qolganSoni > 0 && (
              <div data-testid="storno-qoladi" className="fz-card space-y-0.5 px-3 py-2">
                <p className="text-xs font-semibold">{t('Saqlab qolinadi: {n} qator', { n: umumiy.qolganSoni })} · <FmtN val={umumiy.qolganJami} />{umumiy.qolganNomalum > 0 && <span className="ml-1 text-warn">({t('qisman noma‘lum: {n}', { n: umumiy.qolganNomalum })})</span>}</p>
                {qolganBolimlar.map((b) => { const j = jam.get(b.id)!; return (
                  <p key={b.id} className="text-text-dim">{kop && b.ota ? `${tree?.byId.get(b.ota)?.nom ?? ''} › ` : ''}{b.nom}: {t('{n} qator', { n: j.qolganSoni })} · <FmtN val={j.qolganJami} /></p>
                ); })}
              </div>
            )}
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
            {nomalumSoni > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} qatorda summa noma‘lum: noma‘lum bo‘lib qoladi (0 emas), narx «ataylab yo‘q» deb belgilanadi.', { n: nomalumSoni })}</p>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-text-dim">{t('Storno F2 raqami')}<input value={raqam} onChange={(e) => setRaqam(e.target.value)} maxLength={100} className="mt-1 block w-48" disabled={band || yaratilganAkt != null} /></label>
              <label className="text-xs text-text-dim">{t('Davr')}<input type="month" value={oy.slice(0, 7)} onChange={(e) => setOy(`${e.target.value}-01`)} className="mt-1 block" disabled={band || yaratilganAkt != null} /></label>
            </div>
          </>
        )}
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        <div data-testid="storno-footer" className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-surface px-4 py-2">
          {reja && <span className="mr-auto text-xs tabular-nums text-text-dim">{t('Storno: {n} qator', { n: reja.qatorlar.length })} · <FmtN val={reja.jami} />{umumiy ? <> · {t('qoladi: {n}', { n: umumiy.qolganSoni })}</> : null}</span>}
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
