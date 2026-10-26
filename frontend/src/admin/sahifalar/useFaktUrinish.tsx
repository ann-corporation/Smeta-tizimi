import { useRef, useState } from 'react';
import { sbFaktYoz } from '../../api/t2-fakt';
import type { AktBekorFn } from '../../lib/fakt-f2-tenglash';
import type { JurnalHolat } from '../../lib/fakt-jurnal';
import { urinishAktlari, urinishHolati, urinishOchiqmi, urinishOchir, urinishOl, urinishReceipt, urinishSaqla, yozilganKorinadimi, yozilganOchir, yozilganOl, yozilganSaqla, yozilganYasa, type QamrovUrinish, type QamrovYozilgan } from '../../lib/fakt-qamrov-urinish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

/**
 * Ko'p qatorli fakt yozuvi — bitta urinish (snapshot + bo'lak receipt'lari, lib/fakt-qamrov-urinish) yo'li.
 * «Qamrov %», «Tuzatish» va «Fakt = F2» (obyekt/bo'lim) shu bitta yo'ldan yozadi: hal bo'lmagan urinish bor ekan
 * yangisi boshlanmaydi (kalit — kompaniya:obyekt, hamma tur uchun umumiy), javob noma'lum bo'lsa xuddi shu UUID'lar
 * qayta yuboriladi (ikkinchi hujjat yaratilmaydi), tasdiqlangan yozuv jadvalda ko'ringuncha yangi reja hisoblanmaydi (JQA-09).
 * Faqat fakt_yoz_v2 / akt_bekor; smeta qatorlariga tegilmaydi.
 */
export function useFaktUrinish({ kompaniyaId, obyektId, holatMap, onYop, onBajarildi, aktBekor, bekorMatn }: {
  kompaniyaId: number; obyektId: number; holatMap: ReadonlyMap<number, JurnalHolat>;
  onYop: () => unknown; onBajarildi: () => unknown; aktBekor: AktBekorFn;
  /** Bekor qilingach xabar (standart: «Qamrov % bekor qilindi.»). */
  bekorMatn?: string;
}) {
  const [band, setBand] = useState(false);
  const [urinish, setUrinish] = useState<QamrovUrinish | null>(() => { const u = urinishOl(kompaniyaId, obyektId); return urinishOchiqmi(u) ? u : null; });
  const urinishRef = useRef(urinish);
  const [yozilgan, setYozilgan] = useState<QamrovYozilgan | null>(() => yozilganOl(kompaniyaId, obyektId));
  const yozilganQoy = (y: QamrovYozilgan | null) => { setYozilgan(y); if (y) yozilganSaqla(y); else yozilganOchir(kompaniyaId, obyektId); };
  const jadvalYangi = !yozilgan || yozilganKorinadimi(yozilgan, (id) => { const f = holatMap.get(id)?.fakt_hajm; return f == null ? null : Number(f); });
  const urinishQoy = (u: QamrovUrinish | null) => { urinishRef.current = u; setUrinish(u); if (u) urinishSaqla(u); else urinishOchir(kompaniyaId, obyektId); };

  const bekorQil = (aktlar: readonly number[]) => () => {
    void Promise.all(aktlar.map((a) => aktBekor(a))).then((natija) => {
      const xato = natija.filter((b) => !b.ok);
      if (xato.length) toast(xato[0].error || t('Bekor qilinmadi.'), 'danger');
      else {
        toast(bekorMatn ?? t('Qamrov % bekor qilindi.'), 'ok');
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

  /**
   * Yozish. Hal bo'lmagan urinish bo'lsa — `yangi` chaqirilmaydi, o'sha snapshot (hamma bo'lagi, shu UUID'lar) qayta
   * yuboriladi. Aks holda `yangi()` birinchi so'rovdan OLDIN muzlatilgan snapshot qaytaradi (null — yoziladigan narsa yo'q).
   * Har bo'lak javobi receipt sifatida darhol saqlanadi.
   */
  const yoz = async (yangi: () => QamrovUrinish | null) => {
    if (band) return;
    let u = urinishRef.current;
    if (!u) {
      if (yozilgan) {
        if (!jadvalYangi) { toast(t('Jadval hali yangilanmagan — oldingi yozuv ko‘rinmayapti. «Jadvalni yangilash» ni bosing.'), 'warn'); return; }
        yozilganQoy(null);
      }
      u = yangi();
      if (!u || !u.bolaklar.length) return;
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
        const matn = u.tur === 'tuzatish' ? t('Tuzatish: {n} qator fakti smetaga tushirildi', { n: String(qatorSoni) })
          : u.tur === 'f2' ? t('Fakt = F2: {n} qator faktga yozildi', { n: String(qatorSoni) })
          : t('Qamrov {foiz}%: {n} qator faktga yozildi', { foiz: String(u.foiz), n: String(qatorSoni) });
        toast(matn, 'ok', undefined, 15000, aktlar.length ? { label: 'Bekor qilish', onClick: bekorQil(aktlar) } : undefined);
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
   * va kutilgan fakti yozuvga o'tadi; yangi urinish faqat jadval ularni ko'rsatgach.
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

  return { band, urinish, yozilgan, jadvalYangi, yoz, bekorQil, urinishniTashla, onBajarildi };
}

const BOLAK_HOLAT: Record<string, string> = { confirmed: 'tasdiqlandi', failed: 'rad etildi', unknown: 'noma’lum', kutmoqda: 'kutmoqda' };
const urinishNomi = (u: { tur?: string; sarlavha: string; foiz: number }) => (u.tur === 'f2' ? `${t('Fakt = F2')}: ${u.sarlavha}` : `${u.tur === 'tuzatish' ? t('Tuzatish') : t('Qamrov')}: ${u.sarlavha} · ${u.foiz}%`);

/** Hal bo'lmagan urinish va oldin yozilgan yozuv ogohlantirishlari (Qamrov % va Fakt = F2 oynalarida bir xil). */
export function FaktUrinishPanel({ u }: { u: ReturnType<typeof useFaktUrinish> }) {
  const { urinish, yozilgan, jadvalYangi, bekorQil, urinishniTashla, onBajarildi } = u;
  const uHolat = urinish ? urinishHolati(urinish) : null;
  const uAktlar = urinish ? urinishAktlari(urinish) : [];
  return <>
    {urinish && <div className="fz-note fz-note--warn flex-col items-start text-[12px]" role="alert" data-testid="qamrov-urinish">
      <p className="font-semibold text-text">{uHolat === 'nomalum' ? t('Oldingi urinish natijasi noma’lum — avval shuni hal qiling') : t('Oldingi urinish to‘liq yozilmadi — avval shuni hal qiling')}</p>
      <p className="text-text-dim">{urinishNomi(urinish)} · {t('Sana')}: {urinish.sana} · {t('bo‘laklar')}: {urinish.bolaklar.map((b, i) => `${i + 1}:${t(BOLAK_HOLAT[b.holat])}${b.aktId != null ? ` (№${b.aktId})` : ''}`).join(', ')}</p>
      <p className="text-text-dim">{t('«Qayta yuborish» xuddi shu amalni bir xil ID bilan yuboradi — server yozilganini qaytadan yozmaydi. Foizni o‘zgartirish bu urinish hal bo‘lgach mumkin.')}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {uAktlar.length > 0 && <button type="button" className="fz-btn fz-btn--sm fz-btn--danger" onClick={bekorQil(uAktlar)} data-testid="urinish-bekor">{t('Yozilgan {n} hujjatni bekor qilish', { n: String(uAktlar.length) })}</button>}
        {uHolat !== 'nomalum' && <button type="button" className="fz-btn fz-btn--sm" onClick={urinishniTashla} data-testid="urinish-tashla">{t('Urinishni tashlash (yangisiga yo‘l)')}</button>}
      </div>
    </div>}
    {!urinish && yozilgan && <div className={`fz-note ${jadvalYangi ? 'fz-note--info' : 'fz-note--warn'} flex-col items-start text-[12px]`} data-testid="qamrov-yozilgan">
      <p className="text-text">{t('Oldin yozilgan')}: {yozilgan.sarlavha} · {yozilgan.foiz}% · {t('hujjatlar')}: {yozilgan.aktlar.map((a) => `№${a}`).join(', ') || '—'} · {t('{n} qator', { n: String(yozilgan.tekshir.length) })}</p>
      {!jadvalYangi && <p className="text-text-dim">{t('Jadval bu yozuvni hali ko‘rsatmayapti — yangi qamrov eski qoldiqdan hisoblanib, ikki marta yozilishi mumkin edi. Yangilanmaguncha yozish yopiq.')}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {yozilgan.aktlar.length > 0 && <button type="button" className="fz-btn fz-btn--sm fz-btn--danger" onClick={bekorQil(yozilgan.aktlar)} data-testid="yozilgan-bekor">{t('Yozilgan {n} hujjatni bekor qilish', { n: String(yozilgan.aktlar.length) })}</button>}
        {!jadvalYangi && <button type="button" className="fz-btn fz-btn--sm" onClick={() => void onBajarildi()} data-testid="jadval-yangila">{t('Jadvalni yangilash')}</button>}
      </div>
    </div>}
  </>;
}
