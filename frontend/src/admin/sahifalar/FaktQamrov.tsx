import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import type { AktBekorFn } from '../../lib/fakt-f2-tenglash';
import type { JurnalHolat, JurnalIsh } from '../../lib/fakt-jurnal';
import { QAMROV_ISTISNOLAR, foizOqi, ishlarniYangila, qamrovBolaklari, qamrovJami, qamrovReja, type QamrovIstisno } from '../../lib/fakt-qamrov';
import { urinishAktlari, urinishHolati, urinishOchiqmi, urinishOchir, urinishOl, urinishReceipt, urinishSaqla, urinishYarat, yozilganKorinadimi, yozilganOchir, yozilganOl, yozilganSaqla, yozilganYasa, type QamrovUrinish, type QamrovYozilgan } from '../../lib/fakt-qamrov-urinish';
import { t } from '../../i18n/til';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { toast } from '../../umumiy/ui/Toast';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

const ISTISNO_NOM: Record<QamrovIstisno, string> = {
  faktli: 'Allaqachon faktli', zamenalangan: 'Zamenalangan (asl)', zamena: 'Zamena qatori', bajarilmaydi: 'Bajarilmaydi belgili',
  narxsiz: 'Narxsiz', chegirma: 'Chegirma (manfiy smeta)',
};
const KORSAT_CHEGARA = 300;

/**
 * «Qamrov %» (Tiklash rejimi): bo'lim (avlodlari bilan) yoki ish → bitta foiz → fakt = foiz × ochiq qoldiq.
 * Oldindan ko'rish (qatorlar, summa ustamasiz+ustamali, istisnolar) → egasi keraksizini olib tashlaydi →
 * BITTA fakt hujjati (fakt_yoz_v2; juda katta qamrov — bir necha hujjat). Xabarda «Bekor qilish» — shu
 * operatsiyaning barcha hujjatlari qaytariladi (akt_bekor). Smeta qatorlariga tegilmaydi.
 */
export function FaktQamrov({ sarlavha, ishlar, holatMap, narxOl, obyektId, kompaniyaId, sana, onYop, onBajarildi, aktBekor }: {
  sarlavha: string; ishlar: readonly JurnalIsh[]; holatMap: ReadonlyMap<number, JurnalHolat>;
  narxOl?: (id: number) => number | null;
  obyektId: number; kompaniyaId: number; sana: string;
  onYop: () => unknown; onBajarildi: () => unknown; aktBekor: AktBekorFn;
}) {
  const [foizMatn, setFoizMatn] = useState('100');
  const [ichki, setIchki] = useState(true);
  const [chiqarilgan, setChiqarilgan] = useState<Set<number>>(new Set());
  const [band, setBand] = useState(false);
  /**
   * Hal bo'lmagan urinish (JQA-04/08): snapshot modal tashqarisida (reestr + localStorage) yashaydi — oyna yopilib qayta
   * ochilsa ham, foiz o'zgartirilsa ham XUDDI SHU bo'laklar xuddi shu UUID'lar bilan qayta yuboriladi; yangi urinish —
   * faqat eskisi to'liq tasdiqlangach.
   */
  const [urinish, setUrinish] = useState<QamrovUrinish | null>(() => { const u = urinishOl(kompaniyaId, obyektId); return urinishOchiqmi(u) ? u : null; });
  const urinishRef = useRef(urinish);
  /** JQA-09: tasdiqlangan yozuvlar (aktlar + kutilgan fakt) — jadval ularni ko'rsatmaguncha yangi urinish boshlanmaydi. */
  const [yozilgan, setYozilgan] = useState<QamrovYozilgan | null>(() => yozilganOl(kompaniyaId, obyektId));
  const yozilganQoy = (y: QamrovYozilgan | null) => { setYozilgan(y); if (y) yozilganSaqla(y); else yozilganOchir(kompaniyaId, obyektId); };
  const jadvalYangi = !yozilgan || yozilganKorinadimi(yozilgan, (id) => { const f = holatMap.get(id)?.fakt_hajm; return f == null ? null : Number(f); });
  const foiz = foizOqi(foizMatn);
  // Snapshot (ochilgandagi ishlar) joriy holat bilan yangilanadi: oyna ochiq turganda yozilgan fakt qoldiqdan ayriladi.
  const ishlarJoriy = useMemo(() => ishlarniYangila(ishlar, holatMap), [ishlar, holatMap]);
  const reja = useMemo(() => qamrovReja(ishlarJoriy, foiz ?? 0, holatMap, { ichkiResurslar: ichki, narxOl }), [ishlarJoriy, foiz, holatMap, ichki, narxOl]);
  const jami = useMemo(() => qamrovJami(reja, chiqarilgan), [reja, chiqarilgan]);
  const istisnoli = useMemo(() => reja.qatorlar.filter((q) => q.istisnolar.length > 0), [reja]);
  /** Alohida «Tuzatish» (JQA-03): faqat oshgan qatorlar, faqat egasi ochib tasdiqlaganda; 100%/foiz yo'li hech qachon kamaytirmaydi. */
  const [tuzatishOchiq, setTuzatishOchiq] = useState(false);
  const [tuzTanlangan, setTuzTanlangan] = useState<Set<number>>(new Set());
  const tuzPaket = useMemo(() => reja.oshganlar.filter((q) => tuzTanlangan.has(q.id)).map((q) => ({ qator_id: q.id, hajm: q.hajm })), [reja, tuzTanlangan]);
  const yanaSoni = Math.max(0, istisnoli.length - KORSAT_CHEGARA);
  const turNomi = (tur: string) => (tur === 'bl' ? t('ISH') : tur === 'ob' ? t('uskuna') : t('material'));

  const almashtir = (id: number) => setChiqarilgan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const turniChiqar = (tur: QamrovIstisno, chiqar: boolean) => setChiqarilgan((s) => {
    const n = new Set(s);
    for (const q of reja.qatorlar) if (q.istisnolar.includes(tur)) { if (chiqar) n.add(q.id); else n.delete(q.id); }
    return n;
  });

  const bekorQil = (aktlar: readonly number[]) => () => {
    void Promise.all(aktlar.map((a) => aktBekor(a))).then((natija) => {
      const xato = natija.filter((b) => !b.ok);
      if (xato.length) toast(xato[0].error || t('Bekor qilinmadi.'), 'danger');
      else {
        toast(t('Qamrov % bekor qilindi.'), 'ok');
        // Bekor qilingan aktlar bo'yicha receipt'lar endi haqiqiy emas: yozuv va (shu aktli) urinish tozalanadi.
        const bekor = new Set(aktlar);
        const y = yozilganOl(kompaniyaId, obyektId);
        if (y && y.aktlar.every((a) => bekor.has(a))) yozilganQoy(null);
        const u = urinishRef.current;
        if (u && urinishAktlari(u).some((a) => bekor.has(a)) && urinishHolati(u) !== 'nomalum') urinishQoy(null);
      }
      void onBajarildi();
    });
  };
  const urinishQoy = (u: QamrovUrinish | null) => { urinishRef.current = u; setUrinish(u); if (u) urinishSaqla(u); else urinishOchir(kompaniyaId, obyektId); };

  /**
   * Yozish. Hal bo'lmagan urinish bo'lsa — joriy forma e'tiborga olinmaydi, o'sha snapshot (hamma bo'lagi, shu UUID'lar)
   * qayta yuboriladi: server tasdiqlangan bo'lakka eski aktni (takror) qaytaradi, yozilmaganini yozadi. Aks holda birinchi
   * so'rovdan OLDIN yangi snapshot muzlatilib saqlanadi. Har bo'lak javobi receipt sifatida darhol saqlanadi.
   */
  const yoz = async (tuzatish?: readonly { qator_id: number; hajm: number }[]) => {
    if (band) return;
    let u = urinishRef.current;
    if (!u) {
      const paket = tuzatish ?? jami.paket;
      if ((!tuzatish && foiz == null) || !paket.length) return;
      if (yozilgan) {
        // Oldingi yozuv jadvalda hali ko'rinmasa — reja eski qoldiqdan: tasdiqlangan hajm ikki marta yozilardi (JQA-09).
        if (!jadvalYangi) { toast(t('Jadval hali yangilanmagan — oldingi yozuv ko‘rinmayapti. «Jadvalni yangilash» ni bosing.'), 'warn'); return; }
        yozilganQoy(null);
      }
      const faktlar = new Map([...reja.qatorlar, ...reja.oshganlar].map((q) => [q.id, q.fakt] as const));
      u = urinishYarat(tuzatish
        ? { kompaniyaId, obyektId, sana, sarlavha, foiz: 100, tur: 'tuzatish', izohBosh: 'Tuzatish (oshgan fakt → smeta)' }
        : { kompaniyaId, obyektId, sana, sarlavha, foiz: foiz ?? 0 }, qamrovBolaklari(paket), yangiOperationId, undefined, (id) => faktlar.get(id) ?? 0);
    }
    setBand(true);
    urinishQoy(u);
    try {
      for (let i = 0; i < u.bolaklar.length; i++) {
        const b = u.bolaklar[i];
        let r: Parameters<typeof urinishReceipt>[2];
        try { r = await sbFaktYoz({ obyektId: u.obyektId, sana: u.sana, operationId: b.operationId, qatorlar: [...b.qatorlar], izoh: b.izoh }); }
        catch { r = { tashlandi: true }; }
        u = urinishReceipt(u, i, r);
        urinishQoy(u);
      }
      const aktlar = urinishAktlari(u);
      const holat = urinishHolati(u);
      const qatorSoni = u.bolaklar.reduce((s, b) => s + b.qatorlar.length, 0);
      if (holat === 'toliq') {
        yozilganQoy(yozilganYasa(u));
        urinishQoy(null);
        toast(u.tur === 'tuzatish' ? t('Tuzatish: {n} qator fakti smetaga tushirildi', { n: String(qatorSoni) }) : t('Qamrov {foiz}%: {n} qator faktga yozildi', { foiz: String(u.foiz), n: String(qatorSoni) }), 'ok', undefined, 15000,
          aktlar.length ? { label: 'Bekor qilish', onClick: bekorQil(aktlar) } : undefined);
        onYop();
        await onBajarildi();
        return;
      }
      const birinchi = u.bolaklar.find((b) => b.holat !== 'confirmed');
      const tasdiq = u.bolaklar.filter((b) => b.holat === 'confirmed').length;
      toast(`${holat === 'nomalum' ? t('Javob olinmadi — amal serverda bajarilgan bo‘lishi mumkin. «Qayta yuborish» xuddi shu amalni (bir xil ID) yuboradi, ikkinchi hujjat yaratilmaydi.') : birinchi?.xato || t('Fakt saqlanmadi.')}${tasdiq ? ` — ${t('yozilgani')}: ${tasdiq}/${u.bolaklar.length}` : ''}`,
        'danger', undefined, 15000, aktlar.length ? { label: 'Bekor qilish', onClick: bekorQil(aktlar) } : undefined);
      if (aktlar.length) void onBajarildi();
    } finally { setBand(false); }
  };
  /**
   * Faqat aniq rad etilgan (unknown yo'q) urinishni tashlash. Tasdiqlangan bo'laklar TASHLANMAYDI (JQA-09): ularning aktlari
   * va kutilgan fakti yozuvga o'tadi (ro'yxat va «bekor qilish» ko'rinib turadi); yangi urinish faqat jadval ularni
   * ko'rsatgach va qoldiq yangi holatdan qayta hisoblangach.
   */
  const urinishniTashla = () => {
    if (!urinish || urinishHolati(urinish) === 'nomalum') return;
    const y = yozilganYasa(urinish);
    if (y) {
      const eski = yozilganOl(kompaniyaId, obyektId);
      yozilganQoy(eski ? { ...y, aktlar: [...eski.aktlar, ...y.aktlar], tekshir: [...eski.tekshir, ...y.tekshir] } : y);
      void onBajarildi();
    }
    urinishQoy(null);
  };

  useHotkeys('fakt-qamrov', t('Qamrov % oynasi'), [
    { id: 'fakt-qamrov.yop', keys: 'esc', nom: t('Yopish'), inInput: true, run: () => { onYop(); } },
    { id: 'fakt-qamrov.yoz', keys: ['ctrl+enter'], nom: t('Faktga yozish'), inInput: true, run: () => { if (!urinish && !jami.paket.length) return false; void yoz(); } },
  ]);
  const uHolat = urinish ? urinishHolati(urinish) : null;
  const uAktlar = urinish ? urinishAktlari(urinish) : [];
  const BOLAK_HOLAT: Record<string, string> = { confirmed: 'tasdiqlandi', failed: 'rad etildi', unknown: 'noma’lum', kutmoqda: 'kutmoqda' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('Qamrov %')}>
      <div className="karta flex max-h-[88vh] w-full max-w-4xl flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-text">{t('Qamrov %')} · {t('Tiklash rejimi')}</h2>
            <p className="truncate text-[12px] text-text-dim" title={sarlavha}>{sarlavha}</p>
          </div>
          <button type="button" onClick={onYop} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:text-text"><X size={16} /></button>
        </div>

        {urinish && <div className="rounded-lg border border-warn/60 bg-warn/10 px-3 py-2 text-[12px]" role="alert" data-testid="qamrov-urinish">
          <p className="font-semibold text-text">{uHolat === 'nomalum' ? t('Oldingi urinish natijasi noma’lum — avval shuni hal qiling') : t('Oldingi urinish to‘liq yozilmadi — avval shuni hal qiling')}</p>
          <p className="text-text-dim">{t('Qamrov')}: {urinish.sarlavha} · {urinish.foiz}% · {t('Sana')}: {urinish.sana} · {t('bo‘laklar')}: {urinish.bolaklar.map((b, i) => `${i + 1}:${t(BOLAK_HOLAT[b.holat])}${b.aktId != null ? ` (№${b.aktId})` : ''}`).join(', ')}</p>
          <p className="text-text-dim">{t('«Qayta yuborish» xuddi shu amalni bir xil ID bilan yuboradi — server yozilganini qaytadan yozmaydi. Foizni o‘zgartirish bu urinish hal bo‘lgach mumkin.')}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {uAktlar.length > 0 && <button type="button" className="tugma" onClick={bekorQil(uAktlar)} data-testid="urinish-bekor">{t('Yozilgan {n} hujjatni bekor qilish', { n: String(uAktlar.length) })}</button>}
            {uHolat !== 'nomalum' && <button type="button" className="tugma" onClick={urinishniTashla} data-testid="urinish-tashla">{t('Urinishni tashlash (yangisiga yo‘l)')}</button>}
          </div>
        </div>}
        {!urinish && yozilgan && <div className={`rounded-lg border px-3 py-2 text-[12px] ${jadvalYangi ? 'border-border bg-surface-2/40' : 'border-warn/60 bg-warn/10'}`} data-testid="qamrov-yozilgan">
          <p className="text-text">{t('Oldin yozilgan')}: {yozilgan.sarlavha} · {yozilgan.foiz}% · {t('hujjatlar')}: {yozilgan.aktlar.map((a) => `№${a}`).join(', ') || '—'} · {t('{n} qator', { n: String(yozilgan.tekshir.length) })}</p>
          {!jadvalYangi && <p className="text-text-dim">{t('Jadval bu yozuvni hali ko‘rsatmayapti — yangi qamrov eski qoldiqdan hisoblanib, ikki marta yozilishi mumkin edi. Yangilanmaguncha yozish yopiq.')}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {yozilgan.aktlar.length > 0 && <button type="button" className="tugma" onClick={bekorQil(yozilgan.aktlar)} data-testid="yozilgan-bekor">{t('Yozilgan {n} hujjatni bekor qilish', { n: String(yozilgan.aktlar.length) })}</button>}
            {!jadvalYangi && <button type="button" className="tugma" onClick={() => void onBajarildi()} data-testid="jadval-yangila">{t('Jadvalni yangilash')}</button>}
          </div>
        </div>}
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-2 font-medium text-text-dim">{t('Bajarilish foizi')}
            <input autoFocus value={foizMatn} disabled={!!urinish} onChange={(e) => setFoizMatn(e.target.value)} onFocus={(e) => e.currentTarget.select()} inputMode="decimal"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); void yoz(); } }}
              aria-label={t('Bajarilish foizi')} className={`input h-8 w-20 px-2 text-right font-mono ${foiz == null ? 'border-warn' : ''}`} />%</label>
          <div className="flex gap-1">{[25, 50, 70, 100].map((p) => <button key={p} type="button" disabled={!!urinish} onClick={() => setFoizMatn(String(p))}
            className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-50 ${foiz === p ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim hover:border-accent'}`}>{p}%</button>)}</div>
          <label className="flex items-center gap-1.5 text-text-dim"><input type="checkbox" checked={ichki} disabled={!!urinish} onChange={(e) => setIchki(e.target.checked)} /> {t('Ish ichidagi material/uskuna ham')}</label>
        </div>
        <p className="text-[11px] text-text-mute">{t('Har qatorga: foiz × ochiq qoldiq (smeta − fakt − almashtirilgan − bajarilmaydi). Mehnat va mashina norma bo‘yicha o‘zi ergashadi. Hech narsa bloklanmaydi.')}</p>

        <div className="flex flex-wrap items-start gap-x-5 gap-y-1 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[12px]" data-testid="qamrov-jami">
          <span><b className="text-text">{jami.paket.length}</b> {t('qator yoziladi')}</span>
          <span className="inline-flex items-start gap-1">{t('Summa')}: <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.ustamasiz} katKesim={jami.kesim} /></span>
          {jami.narxsiz > 0 && <span className="text-warn">{t('summa noma’lum: {n} qator', { n: String(jami.narxsiz) })}</span>}
          {reja.yopiq > 0 && <span className="text-text-mute">{t('ochiq qoldig‘i yo‘q: {n}', { n: String(reja.yopiq) })}</span>}
          {reja.smetasiz > 0 && <span className="text-text-mute">{t('smetasi noma’lum: {n}', { n: String(reja.smetasiz) })}</span>}
          {reja.oshganlar.length > 0 && <span className="text-warn" data-testid="qamrov-oshgan-soni">{t('allaqachon ≥100% (smetadan oshgan, o‘zgarmaydi): {n}', { n: String(reja.oshganlar.length) })}</span>}
          {chiqarilgan.size > 0 && <span className="text-text-mute">{t('olib tashlangan: {n}', { n: String(chiqarilgan.size) })}</span>}
          {jami.paket.length > 3000 && <span className="text-text-mute">{t('{n} ta hujjatga bo‘linadi', { n: String(qamrovBolaklari(jami.paket).length) })}</span>}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {istisnoli.length === 0
            ? <p className="py-3 text-[12px] text-text-dim">{reja.qatorlar.length ? t('Istisno yo‘q — hamma qator bir xil foizda olinadi.') : t('Yoziladigan qator yo‘q.')}</p>
            : <>
              <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">{QAMROV_ISTISNOLAR.filter((k) => reja.qatorlar.some((q) => q.istisnolar.includes(k))).map((k) => {
                const hammasi = reja.qatorlar.filter((q) => q.istisnolar.includes(k));
                const chiq = hammasi.every((q) => chiqarilgan.has(q.id));
                return <button key={k} type="button" onClick={() => turniChiqar(k, !chiq)} data-testid={`istisno-tur-${k}`}
                  className={`rounded border px-2 py-0.5 ${chiq ? 'border-danger/50 text-danger' : 'border-border text-text-dim hover:border-accent'}`}>
                  {t(ISTISNO_NOM[k])}: {hammasi.length} · {chiq ? t('qaytarish') : t('olib tashlash')}</button>;
              })}</div>
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-border text-left text-text-mute">
                  <th className="w-6 px-1" /><th className="px-1">{t('Qator')}</th><th className="px-1">{t('Istisno')}</th>
                  <th className="px-1 text-right">{t('Fakt')}</th><th className="px-1 text-right">{t('Ochiq qoldiq')}</th><th className="px-1 text-right">{t('Yoziladi')}</th><th className="px-1 text-right">{t('Summa')}</th>
                </tr></thead>
                <tbody>{istisnoli.slice(0, KORSAT_CHEGARA).map((q) => {
                  const chiq = chiqarilgan.has(q.id) || (q.otaIshId != null && chiqarilgan.has(q.otaIshId));
                  return <tr key={q.id} className={`border-b border-border/40 ${chiq ? 'opacity-50' : ''}`} data-testid={`qamrov-istisno-${q.id}`}>
                    <td className="px-1"><input type="checkbox" checked={!chiq} disabled={q.otaIshId != null && chiqarilgan.has(q.otaIshId)} onChange={() => almashtir(q.id)} aria-label={t('Olinsin: {nom}', { nom: q.nom })} /></td>
                    <td className="max-w-[300px] truncate px-1" title={q.nom}><span className="text-text-mute">{turNomi(q.tur)}</span> {q.kod ? `${q.kod} ` : ''}{q.nom}</td>
                    <td className="px-1 text-[11px] text-warn">{q.istisnolar.map((i) => t(ISTISNO_NOM[i])).join(', ')}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.fakt)}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.ochiq)}</td>
                    <td className="px-1 text-right font-semibold tabular-nums">{q.hajm > 0 ? '+' : ''}{fmt(q.hajm)} {q.birlik ?? ''}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.summa)}</td>
                  </tr>;
                })}</tbody>
              </table>
              {yanaSoni > 0 && <p className="pt-1 text-[11px] text-text-mute">{t('yana {n} ta istisno — yuqoridagi tur tugmalari bilan boshqaring', { n: String(yanaSoni) })}</p>}
            </>}
          {!urinish && reja.oshganlar.length > 0 && <div className="mt-3 rounded-lg border border-border px-3 py-2 text-[12px]" data-testid="qamrov-oshganlar">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-text-dim">{t('Smetadan oshgan qatorlar foiz bilan KAMAYTIRILMAYDI. Kamaytirish kerak bo‘lsa — alohida tuzatish (oldindan ko‘rish bilan).')}</span>
              {!tuzatishOchiq && <button type="button" className="tugma" onClick={() => { setTuzTanlangan(new Set(reja.oshganlar.map((q) => q.id))); setTuzatishOchiq(true); }} data-testid="tuzatish-och">{t('Tuzatishni ko‘rish ({n})', { n: String(reja.oshganlar.length) })}</button>}
            </div>
            {tuzatishOchiq && <>
              <table className="mt-2 w-full text-[12px]">
                <thead><tr className="border-b border-border text-left text-text-mute">
                  <th className="w-6 px-1" /><th className="px-1">{t('Qator')}</th><th className="px-1 text-right">{t('Smeta')}</th>
                  <th className="px-1 text-right">{t('Hozirgi fakt')}</th><th className="px-1 text-right">{t('Yangi fakt')}</th><th className="px-1 text-right">{t('Farq')}</th>
                </tr></thead>
                <tbody>{reja.oshganlar.slice(0, KORSAT_CHEGARA).map((q) => <tr key={q.id} className="border-b border-border/40" data-testid={`tuzatish-${q.id}`}>
                  <td className="px-1"><input type="checkbox" checked={tuzTanlangan.has(q.id)} onChange={() => setTuzTanlangan((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })} aria-label={t('Tuzatilsin: {nom}', { nom: q.nom })} /></td>
                  <td className="max-w-[300px] truncate px-1" title={q.nom}><span className="text-text-mute">{turNomi(q.tur)}</span> {q.kod ? `${q.kod} ` : ''}{q.nom}</td>
                  <td className="px-1 text-right tabular-nums">{fmt(q.smeta)}</td>
                  <td className="px-1 text-right tabular-nums">{fmt(q.fakt)}</td>
                  <td className="px-1 text-right tabular-nums">{fmt(q.fakt + q.hajm)}</td>
                  <td className="px-1 text-right font-semibold tabular-nums text-danger">{fmt(q.hajm)} {q.birlik ?? ''}</td>
                </tr>)}</tbody>
              </table>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="tugma" onClick={() => setTuzatishOchiq(false)}>{t('Bekor')}</button>
                <button type="button" className="tugma border-danger/50 text-danger" disabled={band || tuzPaket.length === 0 || !jadvalYangi} onClick={() => void yoz(tuzPaket)} data-testid="tuzatish-yoz">
                  {t('Tuzatishni yozish — faktni kamaytirish ({n})', { n: String(tuzPaket.length) })}</button>
              </div>
            </>}
          </div>}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[12px]">
          <span className="text-text-mute">{t('Sana')}: {sana}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="tugma" onClick={onYop}>{t('Bekor')}</button>
            <button type="button" className="tugma tugma-asosiy" disabled={band || (!urinish && (foiz == null || jami.paket.length === 0 || !jadvalYangi))} onClick={() => void yoz()}>
              {band ? t('Yozilmoqda…') : urinish ? t('Faktga yozish — qayta yuborish (bir xil ID)') : t('Faktga yozish ({n})', { n: String(jami.paket.length) })} <kbd className="ml-1 rounded bg-white/20 px-1 text-[10px]">{'Ctrl+Enter'}</kbd></button>
          </div>
        </div>
      </div>
    </div>
  );
}
