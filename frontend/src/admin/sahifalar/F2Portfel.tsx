/**
 * F2 PORTFELI (egasi 2026-11-05; TEZ variant 2026-11-18): shartnoma yoki obyekt bo'yicha BARCHA F2 lar — bitta jadval:
 * Akt № · Oy · Obyekt · Holat · Ustamasiz · Ustamali · QQS bilan. Tepada shartnoma jami (tasdiqlangan / qoralama / hammasi).
 *
 * Tezlik: jadval va jamilar serverdan BITTA so'rovda (`f2_portfel_v1`); ochilganda smeta/F2 tafsilotlari O'QILMAYDI.
 * Har aktning summasi — serverning yagona yadrosidan (`f2_portfel_summa_v1`), 3 aktdan bo'lib 4 parallel; «3/12 akt hisoblandi».
 * Brauzerda summa HISOBLANMAYDI (faqat qo'shiladi). Bekor qilingan F2 ko'rinadi (kulrang), jamiga kirmaydi.
 * Fayllar faqat «Paketni yuklab olish» bosilganda yig'iladi: faqat tanlangan aktlarning obyektlari o'qiladi (parallel), token BIR marta yechiladi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import { FmtN } from '../../lib/format';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import { portfelObyektOl, type PortfelObyektMalumot } from '../../api/f2-oylik-paket';
import { aktSummalarParallel, portfelBarchaAktlar, portfelOl, type PortfelAktQator, type PortfelHolat, type PortfelJavob } from '../../api/t2-f2-portfel';
import { paketUchligi, type SummaPaket } from '../../lib/summa-paket';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { diskJoy } from '../../lib/disk-joy';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { hujjatFaylNomi, rasmiyKitob } from '../../lib/hujjat-yozuvchi';
import { f2HujjatVaraqlar } from '../../lib/f2-hujjat';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { barchaShartnomalar } from '../../lib/f2-oylik-paket/shartnoma';
import { oyKaliti, type PaketAkt } from '../../lib/f2-oylik-paket/oylik';
import { aktVaraqNomi, portfelAktTayyor, portfelGuruhla, type PortfelKesim } from '../../lib/f2-oylik-paket/portfel';
import { jamiFarqi, aktlarYigindisi, paketAktiga, portfelBosqich } from '../../lib/f2-oylik-paket/portfel-tez';
import { portfelKitob, portfelSvodVaraq, type PortfelAktVaraq } from '../../lib/f2-oylik-paket/portfel-eksport';
import { paketRejasi, paketReestriXlsx, paketZipi, type PaketHujjat } from '../../lib/f2-oylik-paket/portfel-zip';
import { davrMatni } from '../../lib/nakopitelniy-vedomost-export';
import { raqamTozala } from '../../lib/raqam-belgi';

const BOSQICH_NOMI = { tasdiqlangan: 'Tasdiqlangan', jarayonda: 'Qoralama / tekshiruvda', rad: 'Rad etilgan', bekor: 'Bekor qilingan' } as const;
const BOSQICH_RANG = { tasdiqlangan: 'text-ok', jarayonda: 'text-warn', rad: 'text-danger', bekor: 'text-text-mute' } as const;
const BOSQICH_RU = { tasdiqlangan: 'утверждён', jarayonda: 'черновик / на проверке', rad: 'отклонён', bekor: 'аннулирован' } as const;
const SAHIFA = 200;

function urlParam(k: string): string | null { try { return new URLSearchParams(window.location.search).get(k); } catch { return null; } }
const Son = ({ v, kuchli = false }: { v: number | null | undefined; kuchli?: boolean }) => (v == null ? <span className="text-text-mute">—</span> : <span className={`tabular-nums ${kuchli ? 'font-semibold' : ''}`}><FmtN val={v} /></span>);

type SummaXarita = Map<string, SummaPaket | null>;
/** Kesh kaliti: akt + versiya (akt o'zgarsa yangi kalit — eski summa ko'rsatilmaydi). */
const kalitOf = (a: Pick<PortfelAktQator, 'id' | 'versiya'>) => `${a.id}:${a.versiya}`;

function PortfelIchi({ kompaniyaId, malumot, tashkilot }: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null }) {
  const shartnomalar = useMemo(() => barchaShartnomalar(malumot), [malumot]);
  const obyektlarMal = useMemo(() => {
    const bor = new Set(malumot.aktlar.map((a) => a.obyekt_id));
    return malumot.obyektlar.filter((o) => bor.has(o.id)).sort((a, b) => a.nom.localeCompare(b.nom, 'ru'));
  }, [malumot]);
  const [kesim, setKesim] = useState<PortfelKesim | null>(() => {
    const sh = Number(urlParam('shartnoma')); const ob = Number(urlParam('portfel_obyekt'));
    if (Number.isSafeInteger(ob) && ob > 0) return { tur: 'obyekt', id: ob };
    if (Number.isSafeInteger(sh) && sh > 0) return { tur: 'shartnoma', id: sh };
    return null;
  });
  useEffect(() => {
    if (kesim) return;
    if (shartnomalar.length) setKesim({ tur: 'shartnoma', id: shartnomalar[0].id });
    else if (obyektlarMal.length) setKesim({ tur: 'obyekt', id: obyektlarMal[0].id });
  }, [kesim, shartnomalar, obyektlarMal]);

  // Filtrlar (server tomonida): oy, holat, obyekt.
  const [oy, setOy] = useState('');
  const [holat, setHolat] = useState<'' | PortfelHolat>('');
  const [obyektF, setObyektF] = useState(0);
  useEffect(() => { setOy(''); setHolat(''); setObyektF(0); }, [kesim?.tur, kesim?.id]);

  const [javob, setJavob] = useState<PortfelJavob | null>(null);
  const [aktlar, setAktlar] = useState<PortfelAktQator[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [summa, setSumma] = useState<SummaXarita>(new Map());
  const [hisob, setHisob] = useState({ bajarildi: 0, jami: 0 });
  const [qoralamalar, setQoralamalar] = useState(false);
  const [shakl, setShakl] = useState<'zip' | 'excel'>('zip');
  const [band, setBand] = useState<{ bajarildi: number; jami: number } | null>(null);
  const sorovVersiya = useRef(0);
  const summaVersiya = useRef(0);
  const sorovAktlar = useRef(new Set<string>());

  const sorov = useCallback((offset: number) => {
    if (!kesim) return null;
    return { kompaniyaId, shartnomaId: kesim.tur === 'shartnoma' ? kesim.id : null, obyektId: kesim.tur === 'obyekt' ? kesim.id : obyektF || null,
      oyDan: oy || null, oyGacha: oy || null, holat: holat || null, limit: SAHIFA, offset };
  }, [kompaniyaId, kesim, oy, holat, obyektF]);

  const yukla = useCallback(async (yangi: boolean) => {
    const s = sorov(0);
    if (!s) return;
    const v = ++sorovVersiya.current;
    setYuklanmoqda(true); setXato('');
    try {
      const j = await portfelOl(s);
      if (v !== sorovVersiya.current) return;
      setJavob(j); setAktlar(j.aktlar);
      if (yangi) { sorovAktlar.current = new Set(); setSumma(new Map()); setHisob({ bajarildi: 0, jami: 0 }); }
    } catch (e) { if (v === sorovVersiya.current) setXato(e instanceof Error ? e.message : String(e)); }
    finally { if (v === sorovVersiya.current) setYuklanmoqda(false); }
  }, [sorov]);
  useEffect(() => { void yukla(false); }, [yukla]);
  // Sahifaga qaytilganda ro'yxat qayta o'qiladi (arzon); o'zgargan akt (yangi versiya) summasi qayta so'raladi.
  useEffect(() => {
    const k = () => { if (document.visibilityState === 'visible') void yukla(false); };
    document.addEventListener('visibilitychange', k);
    return () => document.removeEventListener('visibilitychange', k);
  }, [yukla]);

  async function yana() {
    const s = sorov(aktlar.length);
    if (!s || !javob?.sahifa.yana_bor) return;
    setYuklanmoqda(true);
    try { const j = await portfelOl(s); setAktlar((old) => [...old, ...j.aktlar]); } catch (e) { setXato(e instanceof Error ? e.message : String(e)); } finally { setYuklanmoqda(false); }
  }

  // Har aktning O'Z summasi — serverdan (yadro), faqat hali so'ralmaganlar; bekor so'ralmaydi.
  useEffect(() => {
    const kerak = aktlar.filter((a) => a.holat !== 'bekor' && !sorovAktlar.current.has(kalitOf(a)));
    if (!kerak.length) return;
    for (const a of kerak) sorovAktlar.current.add(kalitOf(a));
    // Natija kalit (akt:versiya) bilan saqlanadi — kech kelgan javob ham to'g'ri (eskirgan versiya ko'rsatilmaydi); hisoblagich yig'iladi.
    summaVersiya.current += kerak.length;
    setHisob((h) => ({ bajarildi: h.bajarildi, jami: h.jami + kerak.length }));
    let oldingi = 0;
    void aktSummalarParallel(kompaniyaId, kerak.map((a) => a.id), (x, bajarildi) => {
      const qosh = bajarildi - oldingi; oldingi = bajarildi;
      setSumma((old) => { const m = new Map(old); for (const a of kerak) if (x.has(a.id)) m.set(kalitOf(a), x.get(a.id) ?? null); return m; });
      setHisob((h) => ({ bajarildi: h.bajarildi + qosh, jami: h.jami }));
    });
  }, [aktlar, kompaniyaId]);

  const paketOf = useCallback((a: PortfelAktQator) => summa.get(kalitOf(a)), [summa]);
  const hisoblanmoqda = hisob.bajarildi < hisob.jami;
  const barchasiOchiq = !oy && !holat && !obyektF && !javob?.sahifa.yana_bor;
  const farq = useMemo(() => {
    if (!javob || !barchasiOchiq || hisoblanmoqda) return null;
    const xarita = new Map(aktlar.map((a) => [a.id, paketOf(a) ?? null] as const));
    return jamiFarqi(javob.jami.hammasi, aktlarYigindisi(aktlar, xarita, ['tasdiqlangan', 'qoralama']));
  }, [javob, barchasiOchiq, hisoblanmoqda, aktlar, paketOf]);

  const kesimNomi = useMemo(() => {
    if (!kesim) return '';
    if (kesim.tur === 'shartnoma') { const s = shartnomalar.find((x) => x.id === kesim.id); return s ? `№ ${raqamTozala(s.raqam)}${s.nom ? ` · ${s.nom}` : ''}` : `№ ${kesim.id}`; }
    return obyektlarMal.find((o) => o.id === kesim.id)?.nom ?? String(kesim.id);
  }, [kesim, shartnomalar, obyektlarMal]);

  /** «Paketni yuklab olish»: fayllar FAQAT shu yerda yig'iladi. Obyektlar parallel (4), progress «3/12 akt tayyor», token bitta. */
  async function yuklabOl() {
    if (band || !kesim) return;
    setBand({ bajarildi: 0, jami: 0 });
    try {
      const barcha = await portfelBarchaAktlar({ kompaniyaId, shartnomaId: kesim.tur === 'shartnoma' ? kesim.id : null, obyektId: kesim.tur === 'obyekt' ? kesim.id : null });
      const eksport = barcha.filter((a) => a.holat === 'tasdiqlangan' || (qoralamalar && a.holat === 'qoralama'));
      if (!eksport.length) { toast(t('Yuklab olish uchun tasdiqlangan F2 yo‘q'), 'warn'); return; }
      // Summalar — serverdan (yadro); mavjudlari qayta so'ralmaydi.
      const paket = new Map<number, SummaPaket | null>();
      for (const a of barcha) { const p = summa.get(kalitOf(a)); if (p !== undefined) paket.set(a.id, p); }
      const yetishmaydi = eksport.map((a) => a.id).filter((id) => !paket.has(id));
      if (yetishmaydi.length) await aktSummalarParallel(kompaniyaId, yetishmaydi, (x) => { for (const [id, p] of x) paket.set(id, p); });
      const barchaSatrlar: PaketAkt[] = barcha.map((a) => paketAktiga(a, paket.get(a.id)));
      const rows = new Map(barchaSatrlar.map((r) => [r.akt.id, r] as const));
      const portfel = portfelGuruhla(barchaSatrlar);
      const raqamlar = new Map(malumot.aktlar.map((a) => [a.id, a.raqam ?? null] as const));

      const jami = eksport.length;
      setBand({ bajarildi: 0, jami });
      const guruh = new Map<number, PortfelAktQator[]>();
      for (const a of eksport) guruh.set(a.obyekt_id, [...(guruh.get(a.obyekt_id) ?? []), a]);
      const aktVaraqlar = new Map<number, PortfelAktVaraq>();
      const zipHujjatlar = new Map<number, PaketHujjat>();
      const varaqNomi = new Map<number, string>();
      const kirmadi = new Map<number, string>();
      const katak = new Map<number, number>();
      let imzo: PortfelObyektMalumot['kontekst']['imzo'] | undefined;
      let bajarildi = 0;
      const navbat = [...guruh];
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(4, navbat.length) }, async () => {
        while (i < navbat.length) {
          const [obyektId, ob] = navbat[i++];
          let m: PortfelObyektMalumot | null = null;
          try { m = await portfelObyektOl(kompaniyaId, obyektId, ob.map((a) => a.id)); imzo ??= m.kontekst.imzo; } catch { /* quyida har akt «kirmadi» */ }
          for (const a of ob) {
            const r = rows.get(a.id)!;
            try {
              if (!m) throw new Error('OBYEKT_OQILMADI');
              const k = portfelAktTayyor(m, r.akt, a.obyekt_nom, raqamlar);
              if (!k) { kirmadi.set(a.id, 'нет строк для вывода'); continue; }
              const nom = aktVaraqNomi(r);
              const x = f2HujjatVaraqlar(k.bolimlar, k.qatorlar, { ...k.opsiya, varaqNomi: nom });
              const yakka = rasmiyKitob(x.varaqlar, { tur: 'f2', formulasiz: true });
              katak.set(a.id, yakka.yacheykalar);
              aktVaraqlar.set(a.id, { varaq: x.varaqlar[0], formulali: !k.opsiya.formulasiz });
              varaqNomi.set(a.id, nom);
              if (shakl === 'zip') {
                const fayl = rasmiyKitob(x.varaqlar, { tur: 'f2', formulasiz: k.opsiya.formulasiz });
                zipHujjatlar.set(a.id, { tur: 'akt', obyekt: a.obyekt_nom, hujjat: 'Акт Ф-2', raqam: a.raqam?.trim() || null, davr: a.oy ? davrMatni(a.oy) : null, oyKalit: oyKaliti(a.oy),
                  holat: BOSQICH_RU[r.bosqich], summa: r.moliya?.jami ?? null, qoralama: r.bosqich !== 'tasdiqlangan', aktId: a.id, bytes: fayl.bytes });
              }
            } catch { kirmadi.set(a.id, 'лист не сформирован: строки акта не прочитаны'); }
            bajarildi++; setBand({ bajarildi, jami });
          }
        }
      }));
      const tartib = eksport.map((a) => a.id);
      const kesimMatni = kesim.tur === 'shartnoma' ? `по договору ${kesimNomi}` : `по объекту: ${kesimNomi}`;
      const tanlanganKatak = tartib.map((id) => katak.get(id)).filter((x): x is number => x != null);
      if (shakl === 'zip') {
        const hujjatlar = tartib.map((id) => zipHujjatlar.get(id)).filter((x): x is PaketHujjat => !!x);
        const reja0 = paketRejasi(hujjatlar, { svodKesim: kesimNomi });
        const yollar = new Map(reja0.filter((q) => q.hujjat.aktId != null).map((q) => [q.hujjat.aktId!, q.yol] as const));
        const svod = portfelSvodVaraq(portfel, { kesimMatni, tashkilot, imzo, varaqlar: yollar, kirmadi, faylRejimi: true });
        const svodKitob = rasmiyKitob([svod], { tur: 'f2' });
        const hammasi: PaketHujjat[] = [...hujjatlar, { tur: 'svod', obyekt: null, hujjat: 'Свод Ф-2', raqam: null, davr: null, holat: null, summa: portfel.jami.hammasi.jami.soni - portfel.jami.hammasi.jami.nomalum > 0 ? portfel.jami.hammasi.jami.malum : null, bytes: svodKitob.bytes }];
        const reja = paketRejasi(hammasi, { svodKesim: kesimNomi });
        const kirmadiMatn = [...kirmadi].map(([id, sabab]) => `${rows.get(id)?.obyektNom ?? ''} · Ф-2 № ${rows.get(id)?.akt.raqam ?? id}: ${sabab}`);
        const reestr = paketReestriXlsx(reja, { kesimMatni, tashkilot, imzo, kirmadi: kirmadiMatn });
        const zip = paketZipi(reja, reestr);
        const zipNom = hujjatFaylNomi({ obyekt: tashkilot ?? undefined, hujjat: `ПАКЕТ_Ф-2_${kesimNomi}`.slice(0, 80), kengaytma: 'zip' });
        // BITTA token yechimi: narx har fayl narxining yig'indisi (`fayllar`), xesh — butun paket mazmuni (aynan shu paket qayta yuklansa bepul).
        const rz = await hujjatTokenBilan({ kompaniyaId, bytes: zip, hujjat: 'F2_PORTFEL', sabab: `Пакет Ф-2 ${kesimMatni}`, obyekt: kesim.tur === 'obyekt' ? kesim.id : null, fayllar: tanlanganKatak },
          () => downloadBlob(zip, zipNom, 'application/zip'));
        if (!rz.ok) { toast(rz.xabar, 'danger'); return; }
        toast(kirmadi.size ? t('Yuklandi; {n} ta F2 kirmadi (sababi — paket reestri faylida)', { n: kirmadi.size }) : (rz.xabar || t('Yuklandi')), kirmadi.size ? 'warn' : 'ok');
        return;
      }
      const varaqlar = tartib.map((id) => aktVaraqlar.get(id)).filter((x): x is PortfelAktVaraq => !!x);
      const svod = portfelSvodVaraq(portfel, { kesimMatni, tashkilot, imzo, varaqlar: varaqNomi, kirmadi });
      const kitob = portfelKitob(svod, varaqlar, { nom: kesimNomi, tashkilot });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes: kitob.bytes, hujjat: 'F2_PORTFEL', disk: diskJoy({ tur: 'f2_portfel', kompaniyaId, obyektId: kesim.tur === 'obyekt' ? kesim.id : null, obyekt: tashkilot ?? null, qism: kesimNomi, qismNom: kesimNomi, faylNomi: kitob.faylNomi }), sabab: `Свод Ф-2 ${kesimMatni}`, obyekt: kesim.tur === 'obyekt' ? kesim.id : null, fayllar: tanlanganKatak },
        () => downloadBlob(kitob.bytes, kitob.faylNomi));
      if (!r.ok) { toast(r.xabar, 'danger'); return; }
      toast(kirmadi.size ? t('Yuklandi; {n} ta F2 varag‘i kirmadi (Свод varag‘ida sababi)', { n: kirmadi.size }) : (r.xabar || t('Yuklandi')), kirmadi.size ? 'warn' : 'ok');
    } catch { toast(t('Portfelni yig‘ib bo‘lmadi.'), 'danger'); }
    finally { setBand(null); }
  }

  const sarlavha = 'px-2 py-2';
  const oyOptions = useMemo(() => [...new Set(aktlar.map((a) => a.oy.slice(0, 7)))].sort(), [aktlar]);
  return <section className="karta flex flex-col gap-3 p-3 text-[12px]" aria-label={t('F2 portfeli')}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px]"><p className="text-[13px] font-semibold text-text">{t('F2 portfeli')}</p>
        <p className="text-[11px] text-text-mute">{t('Shartnoma yoki obyektning barcha F2 lari, barcha oylar; summalar serverdan')}</p></div>
      <label>{t('Kesim')}
        <select aria-label={t('Kesim')} value={kesim?.tur ?? 'shartnoma'} className="input mt-1 block h-8"
          onChange={(e) => {
            if (e.target.value === 'obyekt') { if (obyektlarMal[0]) setKesim({ tur: 'obyekt', id: obyektlarMal[0].id }); }
            else if (shartnomalar[0]) setKesim({ tur: 'shartnoma', id: shartnomalar[0].id });
          }}>
          <option value="shartnoma" disabled={!shartnomalar.length}>{t('Shartnoma bo‘yicha')}</option><option value="obyekt">{t('Obyekt bo‘yicha')}</option></select></label>
      {kesim?.tur === 'shartnoma'
        ? <label>{t('Shartnoma')}
          <select aria-label={t('Shartnoma')} value={kesim.id} onChange={(e) => setKesim({ tur: 'shartnoma', id: Number(e.target.value) })} className="input mt-1 block h-8 max-w-[260px]">
            {shartnomalar.map((s) => <option key={s.id} value={s.id}>№ {raqamTozala(s.raqam)}{s.nom ? ` · ${s.nom}` : ''}</option>)}</select></label>
        : <label>{t('Obyekt')}
          <select aria-label={t('Obyekt')} value={kesim?.id ?? ''} onChange={(e) => setKesim({ tur: 'obyekt', id: Number(e.target.value) })} className="input mt-1 block h-8 max-w-[260px]">
            {obyektlarMal.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>}
      <span className="ml-auto flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => void yukla(true)} disabled={!!band || yuklanmoqda}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50"><RefreshCw size={14} className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <label>{t('Shakl')}
          <select aria-label={t('Yuklab olish shakli')} value={shakl} onChange={(e) => setShakl(e.target.value === 'excel' ? 'excel' : 'zip')} className="input mt-1 block h-8" disabled={!!band}>
            <option value="zip">{t('ZIP — papkalar, har hujjat alohida fayl')}</option><option value="excel">{t('Bitta Excel — barcha varaqlar bir faylda')}</option></select></label>
        <label className="inline-flex items-center gap-1.5 pb-2"><input type="checkbox" checked={qoralamalar} onChange={(e) => setQoralamalar(e.target.checked)} /> {t('Qoralamalarni ham qo‘shish')}</label>
        <button type="button" onClick={() => void yuklabOl()} disabled={!!band || !javob || javob.soni.jami === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)] disabled:opacity-50">
          <Download size={14} /> {band ? (band.jami ? t('{a}/{b} akt tayyor', { a: band.bajarildi, b: band.jami }) : t('Yig‘ilmoqda…')) : t('Paketni yuklab olish')}</button>
      </span>
    </div>

    {xato && <p role="alert" className="text-danger">{xato}</p>}
    {javob && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label={t('Portfel jamilari')} data-testid="portfel-jami">
      {([['tasdiqlangan', t('Tasdiqlangan jami'), javob.soni.tasdiqlangan], ['qoralama', t('Qoralamalar'), javob.soni.qoralama], ['hammasi', t('Hammasi (bekorsiz)'), javob.soni.tasdiqlangan + javob.soni.qoralama]] as const).map(([k, nom, soni]) =>
        <div key={k} className="rounded-lg border border-border/60 p-2" data-testid={`portfel-${k}`}>
          <p className="text-[11px] text-text-mute">{nom} · {t('{n} ta F2', { n: soni })}</p>
          {javob.jami[k] ? <QiymatUchlik q={paketUchligi(javob.jami[k])} /> : <span className="text-text-mute">—</span>}
        </div>)}
    </div>}
    {javob && javob.soni.bekor > 0 && <p className="text-[11.5px] text-text-mute">{t('{n} ta bekor qilingan F2 ko‘rsatilgan, jamiga kirmaydi', { n: javob.soni.bekor })}</p>}
    {hisoblanmoqda && <p role="status" className="text-[11.5px] text-text-mute">{t('{a}/{b} akt summasi hisoblandi…', { a: hisob.bajarildi, b: hisob.jami })}</p>}
    {farq != null && farq !== 0 && <p role="alert" className="text-[11.5px] text-warn">{t('Diqqat: shartnoma jami aktlar yig‘indisidan {f} so‘mga farq qiladi — ma’lumotni tekshiring.', { f: String(farq) })}</p>}

    <div className="flex flex-wrap items-end gap-3" aria-label={t('Filtrlar')}>
      <label>{t('Oy')}<select aria-label={t('Oy')} value={oy} onChange={(e) => setOy(e.target.value)} className="input mt-1 block h-8">
        <option value="">{t('Hammasi')}</option>{(oy && !oyOptions.includes(oy) ? [...oyOptions, oy] : oyOptions).map((o) => <option key={o} value={o}>{davrNomi(`${o}-01`, tilLocale()) || o}</option>)}</select></label>
      <label>{t('Holat')}<select aria-label={t('F2 holati')} value={holat} onChange={(e) => setHolat(e.target.value as '' | PortfelHolat)} className="input mt-1 block h-8">
        <option value="">{t('Hammasi')}</option><option value="tasdiqlangan">{t('Tasdiqlangan')}</option><option value="qoralama">{t('Qoralama / tekshiruvda')}</option><option value="bekor">{t('Bekor qilingan')}</option></select></label>
      {kesim?.tur === 'shartnoma' && <label>{t('Obyekt')}<select aria-label={t('Obyekt filtri')} value={obyektF} onChange={(e) => setObyektF(Number(e.target.value))} className="input mt-1 block h-8 max-w-[260px]">
        <option value={0}>{t('Hammasi')}</option>{(javob?.obyektlar ?? []).map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>}
      {(oy || holat || obyektF) ? <button type="button" className="pb-2 text-accent underline" onClick={() => { setOy(''); setHolat(''); setObyektF(0); }}>{t('Filtrni tozalash')}</button> : null}
    </div>

    {!javob && yuklanmoqda ? <p role="status" className="text-text-mute">{t('Yuklanmoqda…')}</p>
      : aktlar.length === 0 ? <p className="text-text-mute">{t('Bu kesimda F2 yo‘q.')}</p>
      : <div className="max-h-[70vh] overflow-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[920px] text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-surface-2 text-left text-[11px] text-text-dim"><tr>
            <th className={sarlavha}>{t('Akt №')}</th><th className={sarlavha}>{t('Oy')}</th><th className={sarlavha}>{t('Obyekt')}</th><th className={sarlavha}>{t('Holat')}</th>
            <th className={`${sarlavha} text-right`}>{t('Ustamasiz')}</th><th className={`${sarlavha} text-right`}>{t('Ustamali (QQS siz)')}</th>
            <th className={`${sarlavha} text-right`}>{t('QQS bilan')}</th><th className={sarlavha}>{t('Amallar')}</th>
          </tr></thead>
          <tbody>
            {aktlar.map((a) => {
              const b = portfelBosqich(a); const bekor = b === 'bekor';
              const p = paketOf(a);
              const tahrir = a.holat === 'qoralama' && (a.lifecycle_status ?? 'draft') === 'draft';
              const q = `obyekt=${a.obyekt_id}&akt=${a.id}`;
              const katak = (v: number | undefined, kuchli = false) => {
                if (bekor) return <Son v={null} />;
                if (p === undefined) return <span className="text-text-mute" aria-busy="true">{'…'}</span>;
                if (p === null) return <span className="text-warn">{t('noma’lum')}</span>;
                return <Son v={v} kuchli={kuchli} />;
              };
              return <tr key={a.id} className={`border-t border-border/40 align-top ${bekor ? 'text-text-mute line-through opacity-60' : 'hover:bg-surface-2/40'}`}>
                <td className="px-2 py-1.5">{a.raqam?.trim() ? `№ ${a.raqam}` : <span className="text-warn">{t('raqamsiz')}</span>}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{davrNomi(a.oy, tilLocale()) || a.oy.slice(0, 7)}</td>
                <td className="px-2 py-1.5">{a.obyekt_nom}</td>
                <td className={`px-2 py-1.5 ${BOSQICH_RANG[b]}`}>{t(BOSQICH_NOMI[b])}</td>
                <td className="px-2 py-1.5 text-right">{katak(p?.ustamasiz)}</td>
                <td className="px-2 py-1.5 text-right">{katak(p?.ustamali)}</td>
                <td className="px-2 py-1.5 text-right">{katak(p?.qqs_bilan, true)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 no-underline">
                  <a className="mr-2 text-accent underline" href={`/admin/f2-tarix?obyekt=${a.obyekt_id}`}>{t('Ochish')}</a>
                  {tahrir && (a.manba === 'import'
                    ? <a className="text-accent underline" href={`/admin/f2?${q}`}>✎ {t('Tahrirlash')}</a>
                    : <a className="text-accent underline" href={`/admin/f2-tayyorlash?${q}`}>✎ {t('Tizimda tahrirlash')}</a>)}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    {javob?.sahifa.yana_bor && <button type="button" onClick={() => void yana()} disabled={yuklanmoqda} className="self-start rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50">
      {t('Yana yuklash ({a}/{b})', { a: aktlar.length, b: javob.sahifa.jami })}</button>}
  </section>;
}

/** F2 reestri sahifasidagi bo'lim: sukut bo'yicha yig'iq; `?portfel=1` (+ `shartnoma=ID` yoki `portfel_obyekt=ID`) bilan ochiq. */
export function F2Portfel(p: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null; yangila?: () => void }) {
  const [ochiq, setOchiq] = useState(() => urlParam('portfel') === '1');
  if (!ochiq) {
    return <section className="karta flex flex-wrap items-center gap-3 p-3 text-[12px]" aria-label={t('F2 portfeli')}>
      <div className="min-w-[200px] flex-1"><p className="text-[13px] font-semibold text-text">{t('F2 portfeli')}</p>
        <p className="text-[11px] text-text-mute">{t('Shartnoma va obyekt bo‘yicha barcha F2: jamilar doim ko‘rinadi, bitta Excel yuklab olish')}</p></div>
      <button type="button" onClick={() => setOchiq(true)} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)]">{t('Portfelni ochish')}</button>
    </section>;
  }
  return <div className="flex flex-col gap-1">
    <PortfelIchi kompaniyaId={p.kompaniyaId} malumot={p.malumot} tashkilot={p.tashkilot} />
    <button type="button" onClick={() => setOchiq(false)} className="self-end text-[11px] text-text-mute underline">{t('Yig‘ish')}</button>
  </div>;
}
