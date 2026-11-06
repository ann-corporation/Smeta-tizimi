import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { sbT2AktReestrOl, type T2AktReestr } from '../../api/supabase';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';
import { yigindi2 } from '../../lib/hisob-yadro';
import { faolStornolar, stornoFaktReja, stornoManbaNetto, stornoQatorimi, stornoQilinadiAkt, stornoQator, stornoQur, type StornoDaraxtTugun, type StornoFaktRejim, type StornoManbaQator, type StornoReestrAkt, type StornoYukQator } from '../../lib/f2-storno';
import { stornoDaraxtQur, stornoJamlar, stornoUmumiy } from '../../lib/f2-storno-daraxt';
import { F2StornoDaraxtRoyxat } from './F2StornoDaraxtRoyxat';
import {
  f2StornoAktIdlari, f2StornoAktQatorlariOl, f2StornoDaraxtOl, f2StornoFaktYoz, f2StornoHolatOl, f2StornoManbaOl, f2StornoQatorTarixOl,
  f2StornoQoralamaYarat, yangiOperationId, type StornoAktQatorXom, type StornoQatorKorinish, type StornoTarixQator,
} from '../../api/t2-f2-storno';
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

const bugun = () => new Date().toISOString().slice(0, 10);
const oyBosh = () => `${bugun().slice(0, 7)}-01`;
const kalit = (aktId: number, qatorId: number) => `${aktId}:${qatorId}`;
const snap = (x: { raw_snapshot?: unknown }) => (x.raw_snapshot && typeof x.raw_snapshot === 'object' ? x.raw_snapshot as Record<string, unknown> : {});

/** Server xatosi — kodi bilan o'qiladigan matn (audit B2: umumiy xabar emas). */
function stornoServerXato(r: { code?: string; error?: string; xabar?: string; sabab?: string }, sukut: string): string {
  const kod = r.code || r.sabab;
  if (kod === 'DUPLICATE_F2_SOURCE_LINE') return t('Server bitta hujjatda bir qatorni ikki marta qabul qilmadi (DUPLICATE_F2_SOURCE_LINE). Takror qatorlar belgisini oling yoki eski F2 larni alohida storno qiling.');
  if (kod === 'STORNO_SOURCE_NOT_APPROVED') return t('Storno manbai tasdiqlangan F2 emas (STORNO_SOURCE_NOT_APPROVED).');
  const m = r.xabar || r.error || sukut;
  return kod && !m.includes(kod) ? `${m} [${kod}]` : m;
}

/**
 * «Storno (minus) F2 yaratish»: tanlangan F2 aktning (BIR NECHTA bo'lishi mumkin — egasi 2026-11-03) qatorlari (hammasi belgilangan;
 * SAQLAB QOLINADIGANLARNI belgidan oling) minus qilib YANGI qoralamaga yoziladi, har eski F2 alohida blok (qator `stornoOf` = shu akt id),
 * har blok o'z hujjat podvalini (`t2_akt_podval`) ishora-teskari nusxada oladi. Fakt — aniq tanlov (egasi 2026-11-05): «0 ga» —
 * har qatorda faqat stornolangan hajm (min(fakt, eski hajm)) minus yozuv bilan; «o'zgartirma» — hech qanday fakt yozuvi yo'q.
 * `qoralamaga` berilsa (F2 tayyorlashda ochiq qoralama) — yangi qoralama yaratilmaydi: storno qatorlari SHU qoralamaga qo'shiladi.
 * Asl akt va o'tgan fakt yozuvlari o'zgarmaydi.
 */
export function F2StornoOyna(p: {
  obyektId: number; akt: F2StornoAkt; reestr: readonly StornoReestrAkt[];
  /** Birga storno qilinadigan boshqa eski F2 lar (bitta pereraschet hujjatida alohida bloklar). */
  qoshimcha?: readonly F2StornoAkt[];
  onYop: () => void;
  /** Qoralama (va fakt) tayyor bo'lgach yangi qoralama id si bilan chaqiriladi. */
  onYaratildi?: (yangiAktId: number) => void;
  /** Fakt tanlovining boshlang'ich qiymati (F2 tayyorlash oqimida «o'zgartirma»). */
  faktRejimSukut?: StornoFaktRejim;
  /** Eski nom (F2 tarixi): `onYaratildi` bilan bir vaqtda chaqiriladi. */
  onTugadi?: (yangiAktId: number) => void;
  /** Ochiq qoralamaga qo'shish rejimi (audit M8): yangi qoralama yo'q, fakt yozilmaydi; qatorlar shu qoralama storno blokiga. */
  qoralamaga?: { aktId: number; onQosh: (qatorlar: StornoYukQator[], ogoh?: string) => void };
}) {
  const { joriyId } = useKompaniya();
  const aktlarKalit = [p.akt.id, ...(p.qoshimcha ?? []).map((a) => a.id)].join(',');
  // Barqaror: ota har renderda yangi massiv bersa ham (audit M6) — faqat id lar o'zgarsa qayta yuklanadi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const aktlar = useMemo(() => [p.akt, ...(p.qoshimcha ?? [])], [aktlarKalit]);
  const kop = aktlar.length > 1;
  const aktNomi = (a: F2StornoAkt) => a.raqam || String(a.id);
  const qoralamaga = p.qoralamaga ?? null;
  const [yuk, setYuk] = useState<Array<{ akt: F2StornoAkt; qatorlar: StornoManbaQator[] }> | null>(null);
  const [netto, setNetto] = useState({ n: 0, narxFarq: 0 });
  const [holat, setHolat] = useState<StornoQatorKorinish[] | null>(null);
  const [faol, setFaol] = useState<StornoReestrAkt[] | null>(null);
  /** Faol storno aktlarining qatorlari (avval stornolangan qatorlar, qoralamani davom ettirish). */
  const [faolQatorlar, setFaolQatorlar] = useState<ReadonlyMap<number, StornoAktQatorXom[]>>(new Map());
  const [avvalSoni, setAvvalSoni] = useState(0);
  const [yuklashXato, setYuklashXato] = useState('');
  const [tanlangan, setTanlangan] = useState<ReadonlySet<string>>(new Set());
  const [raqam, setRaqam] = useState(`${aktlar.map(aktNomi).join('+')}-С`);
  const [oy, setOy] = useState(oyBosh());
  const [takrorTasdiq, setTakrorTasdiq] = useState(false);
  const [faktRejimTanlov, setFaktRejim] = useState<StornoFaktRejim>(p.faktRejimSukut ?? 'nolga');
  const faktRejim: StornoFaktRejim = qoralamaga ? 'ozgartirma' : faktRejimTanlov;
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  /** Podvali yo'q manba F2 lar (audit M5): blok smeta podvali bilan hisoblanadi — ogohlantiriladi, jim emas. */
  const [podvalYoq, setPodvalYoq] = useState<{ aktId: number; nomlar: string[] } | null>(null);
  /** Qoralama yaratilgach shu yerda saqlanadi: podval nusxasi / fakt yozuvi yiqilsa, faqat shu qadamlar qayta uriniladi (qoralama takrorlanmaydi). */
  const [yaratilganAkt, setYaratilganAkt] = useState<number | null>(null);
  /** Davom ettirilayotgan (yarim qolgan) storno qoralamasi: qayta urinish uning saqlangan rejimi bilan. */
  const [davomAkt, setDavomAkt] = useState<number | null>(null);
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
        const nt = m.map((x) => stornoManbaNetto(x.qatorlar));
        const y = aktlar.map((a, i) => ({ akt: a, qatorlar: nt[i].qatorlar }));
        const fs = faolStornolar([...new Set(ids.flat())], p.reestr);
        // Avval stornolangan qatorlar (audit M10): faol storno aktlaridagi shu eski F2 qatorlari — sukut bo'yicha belgisiz.
        const fq = await Promise.all(fs.map((a) => f2StornoAktQatorlariOl(a.id, p.obyektId)));
        if (!jonli) return;
        if (fq.some((x) => !x.ok)) { setYuklashXato(t('Storno tekshiruvi o‘qilmadi (ikki marta storno himoyasi). Qayta urinib ko‘ring.')); return; }
        const aktIdlar = new Set(aktlar.map((a) => a.id));
        const avval = new Set<string>();
        for (const r of fq) for (const x of r.qatorlar) {
          const of = Number(snap(x).stornoOf);
          if (stornoQatorimi(x) && aktIdlar.has(of)) avval.add(kalit(of, x.qator_id));
        }
        setYuk(y); setHolat(h.qatorlar); setFaol(fs);
        setNetto({ n: nt.reduce((s, x) => s + x.nettolandi, 0), narxFarq: nt.reduce((s, x) => s + x.narxFarq, 0) });
        setFaolQatorlar(new Map(fs.map((a, i) => [a.id, fq[i].qatorlar] as const)));
        const hammasi = y.flatMap((e) => e.qatorlar.filter((x) => stornoQator(x, e.akt.id).tur === 'qator').map((x) => kalit(e.akt.id, x.qator_id)));
        setAvvalSoni(hammasi.filter((k) => avval.has(k)).length);
        setTanlangan(new Set(hammasi.filter((k) => !avval.has(k))));
      } catch { if (jonli) setYuklashXato(t('Storno tekshiruvi o‘qilmadi (ikki marta storno himoyasi). Qayta urinib ko‘ring.')); }
    })();
    return () => { jonli = false; };
  }, [aktlar, p.obyektId, p.reestr]);

  /* Daraxt: faol smeta daraxti + storno qatorlarining TARIX metama'lumoti (audit B1: eski versiya qatorlari ham razdelga tushadi). */
  const [daraxt, setDaraxt] = useState<StornoDaraxtTugun[] | null>(null);
  const [tarix, setTarix] = useState<StornoTarixQator[]>([]);
  useEffect(() => {
    let jonli = true;
    void (async () => {
      try { const r = await f2StornoDaraxtOl(p.obyektId); if (jonli) setDaraxt(r.ok ? r.qatorlar : []); } catch { if (jonli) setDaraxt([]); }
    })();
    return () => { jonli = false; };
  }, [p.obyektId]);
  useEffect(() => {
    if (!yuk || daraxt == null) return;
    const bor = new Set(daraxt.map((r) => r.id));
    const kerak = yuk.flatMap((e) => e.qatorlar.map((x) => x.qator_id)).filter((id) => !bor.has(id));
    if (!kerak.length) return;
    let jonli = true;
    void f2StornoQatorTarixOl(p.obyektId, kerak, bor).then((r) => { if (jonli) setTarix(r.qatorlar); }).catch(() => undefined);
    return () => { jonli = false; };
  }, [yuk, daraxt, p.obyektId]);
  const toliqDaraxt = useMemo(() => (daraxt == null ? null : [...daraxt, ...tarix.map((x) => ({ id: x.id, ota_id: x.ota_id, tur: x.tur, nom: x.nom, kod: x.kod, tartib: x.tartib }))]), [daraxt, tarix]);
  const nomlar = useMemo(() => {
    const m = new Map<number, StornoQatorKorinish>();
    for (const x of tarix) m.set(x.id, { qator_id: x.id, tur: x.tur, fakt_hajm: null, kod: x.kod, nom: x.nom, birlik: x.birlik });
    for (const h of holat ?? []) m.set(h.qator_id, h);
    return m;
  }, [holat, tarix]);

  /** Bitta qator bitta hujjatda ikki marta bo'lmaydi: ikkinchi eski F2 dagi bir xil pozitsiya tashlanadi (`toqnashdi`; server qoidasi kelguncha). */
  const reja = useMemo(() => {
    if (!yuk) return null;
    const band2 = new Set<number>();
    const qatorlar: StornoYukQator[] = [];
    let toqnashdi = 0;
    for (const e of yuk) {
      const set = new Set<number>();
      for (const x of e.qatorlar) {
        if (!tanlangan.has(kalit(e.akt.id, x.qator_id))) continue;
        if (band2.has(x.qator_id)) { toqnashdi++; continue; }
        set.add(x.qator_id);
      }
      const r = stornoQur(e.qatorlar, e.akt.id, set);
      for (const q of r.qatorlar) band2.add(q.qatorId);
      qatorlar.push(...r.qatorlar);
    }
    return { qatorlar, jami: yigindi2(qatorlar.map((q) => q.certifiedAmount)), toqnashdi };
  }, [yuk, tanlangan]);
  const stornoHajm = useMemo(() => new Map((reja?.qatorlar ?? []).map((q) => [q.qatorId, q.certifiedQuantity] as const)), [reja]);
  const faktReja = useMemo(() => (holat ? stornoFaktReja(stornoHajm, holat, aktlar.map(aktNomi).join('+')) : null), [holat, stornoHajm, aktlar]);

  const tree = useMemo(() => (yuk && toliqDaraxt ? stornoDaraxtQur({
    bloklar: yuk.map((e) => ({ aktId: e.akt.id, aktNom: aktNomi(e.akt), qatorlar: e.qatorlar })), daraxt: toliqDaraxt, nomlar, kalit,
  }) : null), [yuk, toliqDaraxt, nomlar]);
  const jam = useMemo(() => stornoJamlar(tree?.ildiz ?? [], tanlangan), [tree, tanlangan]);
  const umumiy = useMemo(() => (tree ? stornoUmumiy(tree.ildiz, jam) : null), [tree, jam]);
  const qulf = band || yaratilganAkt != null;
  /** Haqiqiy noma'lum summa soni (audit M1): ish (bl) va mashinist mehnati sanalmaydi — ularning puli resurslarida. */
  const nomalumSoni = umumiy?.nomalum ?? 0;
  /** Saqlab qolinadigan qism — 1-daraja bo'limlar kesimida. */
  const qolganBolimlar = useMemo(() => (tree ? [...tree.byId.values()].filter((n) => n.k === 'bolim' && (n.ota == null || tree.byId.get(n.ota)?.k === 'akt') && (jam.get(n.id)?.qolganSoni ?? 0) > 0) : []), [tree, jam]);

  /** Storno manbai faqat TASDIQLANGAN F2 (reestrda tekshiriladi; topilmasa — ruxsat yo'q). */
  const tasdiqlanmagan = useMemo(() => aktlar.filter((a) => { const r = p.reestr.find((x) => x.id === a.id); return !r || !stornoQilinadiAkt(r); }), [aktlar, p.reestr]);
  const takrorKerak = (faol?.length ?? 0) > 0;
  /** Davom ettiriladigan (yarim qolgan) storno qoralamalari (audit M9). */
  const faolQoralama = useMemo(() => (faol ?? []).filter((a) => a.holat === 'qoralama' && (a.lifecycle_status ?? 'draft') === 'draft'), [faol]);
  const oyTogri = qoralamaga != null || /^\d{4}-\d{2}-\d{2}$/.test(oy);
  /** Tugma nega o'chiq (audit m3). */
  const sabablar = [
    !reja || reja.qatorlar.length === 0 ? t('hech qator belgilanmagan') : '',
    !oyTogri ? t('davr noto‘g‘ri') : '',
    takrorKerak && !takrorTasdiq ? t('mavjud stornoni tasdiqlang («Baribir…»)') : '',
    faol === null && !yuklashXato ? t('ikki marta storno tekshiruvi tugamagan') : '',
    tasdiqlanmagan.length ? t('manba F2 tasdiqlanmagan') : '',
  ].filter(Boolean);
  const tayyor = sabablar.length === 0 || davomAkt != null;

  const bitdi = (aktId: number) => { p.onYaratildi?.(aktId); p.onTugadi?.(aktId); };

  /** Har eski F2 ning O'Z podvali ishora-teskari nusxada blokka ko'chadi (idempotent). Yiqilsa — to'xtaydi; podval yo'q — ogohlantiradi. */
  async function podvalNusxa(aktId: number, manbaIdlar: readonly number[], jim = false): Promise<{ holat: 'ok' | 'yiqildi' | 'yoq'; yoq: string[] }> {
    if (!joriyId) { setXato(t('Kompaniya aniqlanmadi — podval nusxalanmadi.')); return { holat: 'yiqildi', yoq: [] }; }
    const yiqilgan: string[] = []; const yoq: string[] = [];
    for (const id of manbaIdlar) {
      const nom = `№${aktlar.find((a) => a.id === id)?.raqam || id}`;
      const r = await aktPodvalStornoNusxa({ kompaniyaId: joriyId, aktId, manbaAktId: id }).catch(() => null);
      if (!r?.ok) yiqilgan.push(nom); else if (r.podval_yoq) yoq.push(nom);
    }
    if (yiqilgan.length) { setXato(`${t('Storno qoralamasi yaratildi, lekin hujjat podvali nusxalanmadi')}: ${yiqilgan.join(', ')} ${t('— qayta urinib ko‘ring (qoralama takrorlanmaydi).')}`); return { holat: 'yiqildi', yoq }; }
    if (yoq.length) { if (!jim) setPodvalYoq({ aktId, nomlar: yoq }); return { holat: 'yoq', yoq }; }
    return { holat: 'ok', yoq };
  }

  async function faktVaYakun(aktId: number, rejim: StornoFaktRejim, hajm: ReadonlyMap<number, number>, op: string, manbaIdlar: readonly number[]) {
    const pv = (await podvalNusxa(aktId, manbaIdlar)).holat;
    if (pv === 'yiqildi') return;
    const fr = holat ? stornoFaktReja(hajm, holat, aktlar.map(aktNomi).join('+')) : null;
    if (rejim === 'nolga' && fr && fr.yozuvlar.length > 0) {
      const r = await f2StornoFaktYoz({ obyektId: p.obyektId, sana: bugun(), yozuvlar: fr.yozuvlar, operationId: op, raqam: undefined, izoh: `Сторно F2 №${aktlar.map(aktNomi).join('+')}: fakt 0 ga` });
      if (!r.ok) { setXato(`${t('Storno qoralamasi yaratildi, lekin fakt 0 ga tushmadi')}: ${stornoServerXato(r, '')} ${t('— qayta urinib ko‘ring (qoralama takrorlanmaydi).')}`); return; }
    }
    if (pv === 'yoq') return; // ogohlantirish ko'rsatiladi, foydalanuvchi «Davom etish» bilan yopadi
    bitdi(aktId);
  }

  /** Storno qatorlari: tanlangan fakt rejimi va fakt operatsiya id si raw_snapshot ga yoziladi (audit M11 — davom ettirish uchun). */
  const yukQatorlar = (): StornoYukQator[] => (reja?.qatorlar ?? []).map((q) => ({
    ...q, rawSnapshot: { ...q.rawSnapshot, stornoFaktRejim: faktRejim, ...(faktRejim === 'nolga' ? { stornoFaktOp: opFakt.current } : {}) },
  }));

  async function bajar() {
    // Manba F2 tasdiqlanmagan bo'lsa — serverga umuman chiqilmaydi (keyingi har saqlash yiqilardi).
    if (tasdiqlanmagan.length) { setXato(t('Storno faqat shu obyektning tasdiqlangan F2 sidan qilinadi: {r} tasdiqlanmagan.', { r: tasdiqlanmagan.map((a) => `№${aktNomi(a)}`).join(', ') })); return; }
    if (!tayyor || !reja || band) return;
    setBand(true); setXato('');
    try {
      const manbaIdlar = [...new Set(reja.qatorlar.map((q) => Number(q.rawSnapshot.stornoOf)))];
      if (qoralamaga) {
        const pv = await podvalNusxa(qoralamaga.aktId, manbaIdlar, true);
        if (pv.holat === 'yiqildi') return;
        qoralamaga.onQosh(yukQatorlar(), pv.yoq.length ? t('{r}: manba F2 da o‘z hujjat podvali yo‘q — bu blok smeta podvali bilan hisoblanadi.', { r: pv.yoq.join(', ') }) : undefined);
        return;
      }
      if (davomAkt != null) { setBand(false); await davomEt(davomAkt); return; }
      let aktId = yaratilganAkt;
      if (aktId == null) {
        const r = await f2StornoQoralamaYarat({ obyektId: p.obyektId, oy, raqam: raqam.trim() || undefined, qatorlar: yukQatorlar(), operationId: opQoralama.current });
        if (!r.ok) { setXato(stornoServerXato(r, t('Storno qoralamasi yaratilmadi.'))); return; }
        const topilgan = r.akt_id ?? await oxirgiQoralamaTop(p.obyektId, raqam.trim());
        if (topilgan == null) { setXato(t('Storno qoralamasi yaratildi, lekin uning raqami olinmadi. F2 tarixidan oching.')); return; }
        aktId = topilgan; setYaratilganAkt(aktId);
      }
      await faktVaYakun(aktId, faktRejim, stornoHajm, opFakt.current, manbaIdlar);
    } catch { setXato(t('Javob olinmadi. Qayta urinib ko‘ring — takror yozilmaydi.')); }
    finally { setBand(false); }
  }

  /** Yarim qolgan storno qoralamasini davom ettirish (audit M9): saqlangan rejim va fakt operatsiya id si bilan (takror yozilmaydi). */
  async function davomEt(aktId: number) {
    if (band) return;
    setBand(true); setXato('');
    try {
      const qs = (faolQatorlar.get(aktId) ?? []).filter(stornoQatorimi);
      const birinchi = snap(qs[0] ?? {});
      const rejim: StornoFaktRejim = birinchi.stornoFaktRejim === 'nolga' && typeof birinchi.stornoFaktOp === 'string' ? 'nolga' : 'ozgartirma';
      const hajm = new Map(qs.map((x) => [x.qator_id, Number(x.certified_quantity ?? x.hajm)] as const));
      const manbaIdlar = [...new Set(qs.map((x) => Number(snap(x).stornoOf)).filter((n) => Number.isSafeInteger(n) && n > 0))];
      setYaratilganAkt(aktId); setDavomAkt(aktId);
      await faktVaYakun(aktId, rejim, hajm, rejim === 'nolga' ? String(birinchi.stornoFaktOp) : opFakt.current, manbaIdlar);
    } catch { setXato(t('Javob olinmadi. Qayta urinib ko‘ring — takror yozilmaydi.')); }
    finally { setBand(false); }
  }

  return (
    <F2Oyna label={t('Storno (minus) F2 yaratish')} onYop={band ? undefined : p.onYop} kenglik={880}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><RotateCcw size={15} aria-hidden="true" /> {t('Storno (minus) F2 yaratish')}</h3></div>
      <div className="space-y-3 p-4 text-[13px]">
        {aktlar.map((a) => (
          <p key={a.id} className="text-text-dim">{qoralamaga
            ? t('F2 №{r} · {d} — tanlangan qatorlar minus qilib OCHIQ qoralamaning storno blokiga qo‘shiladi (narx o‘sha). Asl F2 o‘zgarmaydi.', { r: aktNomi(a), d: davrNomi(a.oy ?? '', tilLocale()) || '—' })
            : t('F2 №{r} · {d} — tanlangan qatorlar minus qilib YANGI qoralamaga yoziladi (narx o‘sha). Asl F2 o‘zgarmaydi.', { r: aktNomi(a), d: davrNomi(a.oy ?? '', tilLocale()) || '—' })}</p>
        ))}
        {kop && <p data-testid="storno-kop" className="fz-note fz-note--info">{t('{n} ta eski F2: har biri hujjatda alohida «Сторно Ф-2 №…» bloki bo‘ladi va o‘z podvali bilan hisoblanadi.', { n: aktlar.length })}</p>}
        {tasdiqlanmagan.length > 0 && <p role="alert" data-testid="storno-tasdiqlanmagan" className="fz-note fz-note--danger"><ShieldAlert />{t('Faqat tasdiqlangan F2 storno qilinadi: {r} tasdiqlanmagan (qoralama yoki bekor).', { r: tasdiqlanmagan.map((a) => `№${aktNomi(a)}`).join(', ') })}</p>}
        {yuklashXato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{yuklashXato}</p>}
        {!yuklashXato && !yuk && <div className="skel min-h-[120px] rounded-xl" />}
        {!qoralamaga && faolQoralama.length > 0 && (
          <div data-testid="storno-davom" className="fz-note fz-note--info flex-wrap">
            <span className="flex-1">{t('Bu F2 uchun yarim qolgan storno qoralamasi bor: {r}. Yangisini yaratmasdan uni davom ettiring (podval va fakt saqlangan operatsiya bilan — takror yozilmaydi).', { r: faolQoralama.map((a) => `№${a.raqam || a.id}`).join(', ') })}</span>
            {faolQoralama.map((a) => <button key={a.id} type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void davomEt(a.id)}>{t('№{r} ni davom ettirish', { r: a.raqam || String(a.id) })}</button>)}
          </div>
        )}
        {takrorKerak && (
          <div role="alert" className="fz-note fz-note--warn flex-wrap">
            <ShieldAlert />
            <span>{t('Bu F2 uchun storno allaqachon bor: {r}. Yana bir storno ikki marta minus qiladi.', { r: (faol ?? []).map((a) => `№${a.raqam || a.id}`).join(', ') })}</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={takrorTasdiq} onChange={(e) => setTakrorTasdiq(e.target.checked)} />{t('Baribir yana bitta storno yarataman')}</label>
          </div>
        )}
        {avvalSoni > 0 && <p data-testid="storno-avval" className="fz-note fz-note--info">{t('{n} qator avval stornolangan — sukut bo‘yicha belgisiz (ikki marta minus bo‘lmasin).', { n: avvalSoni })}</p>}
        {netto.n > 0 && <p data-testid="storno-netto" className="fz-note fz-note--info">{t('{n} qator eski F2 da bir necha marta (storno + yangi) — bitta netto qatorga birlashtirildi.', { n: netto.n })}{netto.narxFarq > 0 ? ` ${t('{n} tasida narx farqli — summa noma‘lum (to‘qilmaydi).', { n: netto.narxFarq })}` : ''}</p>}
        {yuk && reja && (
          <>
            <p className="text-text-dim">{t('Hammasi belgilangan. Saqlab qolinadigan bo‘lim, ish yoki qatordan belgini oling — masalan, «ЗЕМЛЯНЫЕ РАБОТЫ» ni qoldirish uchun shu bo‘lim belgisini bir marta bosing.')}</p>
            {tree && <F2StornoDaraxtRoyxat tree={tree} jam={jam} tanlangan={tanlangan} onTanlangan={setTanlangan} qulf={qulf}
              faktOl={(id) => { const f = nomlar.get(id)?.fakt_hajm; return f == null ? null : Number(f); }} />}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('Storno jami')}>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Qatorlar')}</p><p data-testid="storno-soni" className="text-lg font-semibold tabular-nums">{reja.qatorlar.length}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Σ summa (minus), ustamasiz')}</p><p data-testid="storno-jami" className="text-lg font-semibold tabular-nums"><FmtN val={reja.jami} /></p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Summasi noma‘lum')}</p><p data-testid="storno-nomalum" className={`text-lg font-semibold tabular-nums ${nomalumSoni ? 'text-warn' : ''}`}>{nomalumSoni}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Saqlab qolinadi')}</p><p data-testid="storno-qoladi-soni" className="text-lg font-semibold tabular-nums">{umumiy?.qolganSoni ?? 0}</p></div>
            </div>
            <p className="text-[11.5px] text-text-mute">{t('Ustamali (podval bilan) summa — F2 tayyorlashdagi pereraschet panelida, har blok o‘z podvali bilan.')}</p>
            {umumiy && umumiy.qolganSoni > 0 && (
              <div data-testid="storno-qoladi" className="fz-card space-y-0.5 px-3 py-2">
                <p className="text-xs font-semibold">{t('Saqlab qolinadi: {n} qator', { n: umumiy.qolganSoni })} · <FmtN val={umumiy.qolganJami} />{umumiy.qolganNomalum > 0 && <span className="ml-1 text-warn">({t('qisman noma‘lum: {n}', { n: umumiy.qolganNomalum })})</span>}</p>
                {qolganBolimlar.map((b) => { const j = jam.get(b.id)!; return (
                  <p key={b.id} className="text-text-dim">{kop && b.ota ? `${tree?.byId.get(b.ota)?.nom ?? ''} › ` : ''}{b.nom}: {t('{n} qator', { n: j.qolganSoni })} · <FmtN val={j.qolganJami} /></p>
                ); })}
              </div>
            )}
            {reja.toqnashdi > 0 && <p data-testid="storno-toqnashuv" className="fz-note fz-note--warn"><ShieldAlert />{t('{n} ta qator bir nechta eski F2 da bor: bitta hujjatda bir pozitsiya ikki marta bo‘lmaydi — keyingi F2 dagisi tashlandi.', { n: reja.toqnashdi })}</p>}
            {qoralamaga
              ? <p data-testid="storno-fakt" className="fz-note fz-note--info">{t('Ochiq qoralamaga qo‘shishda fakt o‘zgarmaydi. Saqlash — F2 tayyorlashdagi «Saqlash» tugmasi bilan.')}</p>
              : <>
                <fieldset data-testid="storno-fakt-rejim" className="fz-card space-y-1 px-3 py-2" disabled={band}>
                  <legend className="text-xs font-semibold">{t('Fakt bilan nima qilinadi?')}</legend>
                  <label className="flex items-center gap-1.5"><input type="radio" name="storno-fakt-rejim" checked={faktRejim === 'nolga'} onChange={() => setFaktRejim('nolga')} />{t('Faktni 0 ga tushirish')}</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name="storno-fakt-rejim" checked={faktRejim === 'ozgartirma'} onChange={() => setFaktRejim('ozgartirma')} />{t('Faktni o‘zgartirma (fakt allaqachon to‘g‘rilangan)')}</label>
                  <p className="text-text-dim">{t('Fakt allaqachon to‘g‘rilangan bo‘lsa «o‘zgartirma» ni tanlang: eski F2 minus tepada, yangi plyus hajmlar to‘g‘rilangan faktdan pastda qo‘shiladi.')}</p>
                </fieldset>
                {faktRejim === 'nolga'
                  ? <p data-testid="storno-fakt" className="fz-note fz-note--info">{t('Fakt ham 0 ga tushiriladi: {n} qator', { n: faktReja?.yozuvlar.length ?? 0 })}
                    {' '}{t('(faqat stornolangan hajm: min(fakt, eski F2 hajmi))')}
                    {faktReja && faktReja.hosila > 0 ? ` · ${t('{n} qatorning fakti ish normasidan hosil bo‘ladi (qo‘lda yozilmaydi)', { n: faktReja.hosila })}` : ''}
                    {faktReja && faktReja.musbat > 0 ? ` · ${t('{n} qator minus qatorning stornosi — fakti tegilmaydi', { n: faktReja.musbat })}` : ''}
                    {' — '}{t('o‘tgan fakt yozuvlari o‘chirilmaydi, minus yozuv qo‘shiladi.')}</p>
                  : <p data-testid="storno-fakt" className="fz-note fz-note--info">{t('Fakt o‘zgarmaydi: hech qanday fakt yozuvi qo‘shilmaydi.')}</p>}
              </>}
            {nomalumSoni > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} qatorda summa noma‘lum: noma‘lum bo‘lib qoladi (0 emas), narx «ataylab yo‘q» deb belgilanadi.', { n: nomalumSoni })}</p>}
            {!qoralamaga && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-text-dim">{t('Storno F2 raqami')}<input value={raqam} onChange={(e) => setRaqam(e.target.value)} maxLength={100} className="mt-1 block w-48" disabled={band || yaratilganAkt != null} /></label>
                <label className="text-xs text-text-dim">{t('Davr')}<input type="month" value={oy.slice(0, 7)} onChange={(e) => setOy(`${e.target.value}-01`)} className="mt-1 block" disabled={band || yaratilganAkt != null} /></label>
              </div>
            )}
          </>
        )}
        {podvalYoq && (
          <div role="alert" data-testid="storno-podval-yoq" className="fz-note fz-note--warn flex-wrap">
            <ShieldAlert />
            <span className="flex-1">{t('{r}: manba F2 da o‘z hujjat podvali yo‘q — bu blok smeta podvali bilan hisoblanadi. Kerak bo‘lsa, avval manba F2 podvalini tiklang.', { r: podvalYoq.nomlar.join(', ') })}</span>
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => bitdi(podvalYoq.aktId)}>{t('Tushundim, davom etish')}</button>
          </div>
        )}
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        <div data-testid="storno-footer" className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-surface px-4 py-2">
          {reja && <span className="mr-auto text-xs tabular-nums text-text-dim">{t('Storno: {n} qator', { n: reja.qatorlar.length })} · <FmtN val={reja.jami} />{umumiy ? <> · {t('qoladi: {n}', { n: umumiy.qolganSoni })}</> : null}</span>}
          {!tayyor && !band && yuk && <span data-testid="storno-sabab" className="w-full text-right text-[11.5px] text-warn">{t('Tugma o‘chiq: {s}', { s: sabablar.join('; ') })}</span>}
          <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop} disabled={band}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" onClick={() => void bajar()} disabled={!tayyor || band || podvalYoq != null}>
            {band ? '…' : qoralamaga ? t('{n} qatorni ochiq qoralamaga qo‘shish', { n: reja?.qatorlar.length ?? 0 })
              : yaratilganAkt != null ? (faktRejim === 'nolga' ? t('Podval va faktni qayta urinish') : t('Podvalni qayta urinish')) : t('{n} qatorni storno qilish', { n: reja?.qatorlar.length ?? 0 })}
          </button>
        </div>
      </div>
    </F2Oyna>
  );
}

export default F2StornoOyna;
