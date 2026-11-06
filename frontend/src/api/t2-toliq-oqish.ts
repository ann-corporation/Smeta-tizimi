import type { SbJavob, SbSoro } from './supabase';

/** Gateway subrequest byudjetidan keyin qolgan qatorlar stable keyset orqali olinadi. */
export async function t2ToliqOqi<T>(
  oqi: (s: SbSoro) => Promise<SbJavob<T>>, s: SbSoro, kalit: 'id' | 'qator_id',
): Promise<SbJavob<T>> {
  const rows: T[] = [];
  const limit = s.limit ?? 200000;
  let last = 0, expected: number | null = null;
  const failed = (): SbJavob<T> => ({ ok: false, toliq: false, qatorlar: [],
    error: 'Smeta qatorlari to‘liq olinmadi. Hisoblash to‘xtatildi — qayta yangilang.' });
  for (let round = 0; round < 200; round++) {
    const page = await oqi({ ...s, tartib: kalit + '.asc',
      filtr: s.filtr + (last ? '&' + kalit + '=gt.' + last : '') });
    if (!page.ok) return { ...page, qatorlar: [], toliq: false };
    const batch = page.qatorlar ?? [];
    if (expected == null && page.jamiServerda != null) expected = page.jamiServerda;
    // Duplicate/out-of-order rows or a stalled cursor cannot become financial success.
    for (const row of batch) {
      const key = Number((row as Record<string, unknown>)[kalit]);
      if (!Number.isSafeInteger(key) || key <= last) return failed();
      last = key;
      rows.push(row);
    }
    if (rows.length > limit) return failed();
    if (page.toliq !== false) {
      if (expected != null && rows.length !== expected) return failed();
      return { ...page, qatorlar: rows, soni: rows.length, jamiServerda: expected, toliq: true };
    }
    if (!batch.length || rows.length >= limit) return failed();
  }
  return failed();
}

/**
 * Katta jadval (25k+ qator) — kalit oralig'i oynalarga bo'linib PARALLEL o'qiladi (prod profil 2026-10-24: Sun'iy ko'l
 * smetasi 6 ta ketma-ket /api/sb chaqiruvi, ~32 s). Sabab: proksi bir chaqiruvda chekli sub-so'rov qiladi va obyekt id lari
 * notekis (boshqa obyektlar id lari aralash) bo'lgani uchun har chaqiruv faqat ~5k qatorlik uzluksiz prefiks qaytaradi.
 * 2026-11-06: shlyuz bir chaqiruvda ~26k+ qator beradi — avval bitta oddiy chaqiruv, oynalar faqat qolgan qism uchun.
 * Har oyna `t2ToliqOqi` bilan o'z ichida to'liq tekshiriladi; yig'indi umumiy server soniga teng bo'lmasa yoki biror oyna
 * xato bersa — oddiy ketma-ket o'qishga qaytiladi (natija har doim bir xil: kalit bo'yicha o'sish tartibida, to'liq).
 */
export async function t2ToliqOqiParallel<T>(
  oqi: (s: SbSoro) => Promise<SbJavob<T>>, s: SbSoro, kalit: 'id' | 'qator_id',
  opts: { oyna?: number; minQator?: number } = {},
): Promise<SbJavob<T>> {
  const oynaSoni = opts.oyna ?? 6;
  const zaxira = (sabab: string) => {
    // eslint-disable-next-line no-console
    console.info('[smeta parallel] zaxira yo‘l:', sabab);
    return t2ToliqOqi(oqi, s, kalit);
  };
  try {
    /* 2026-11-06: shlyuz endi bitta chaqiruvda ~26k+ qatorni o'zi parallel yig'adi (kalit oraliqlari, 40 sub-so'rov).
       Shuning uchun avval ODDIY to'liq chaqiruv: ko'p obyekt 1 ta borib-kelishda tugaydi (avval: 2 zond + 6 oyna).
       Oynalar faqat qoldiq uchun — shlyuz byudjetidan katta jadvalda. */
    const birinchi = await oqi({ ...s, tartib: kalit + '.asc' });
    if (!birinchi.ok) return { ...birinchi, qatorlar: [], toliq: false };
    const bosh = birinchi.qatorlar ?? [];
    let last = 0;
    for (const row of bosh) {
      const key = Number((row as Record<string, unknown>)[kalit]);
      if (!Number.isSafeInteger(key) || key <= last) return zaxira('birinchi sahifa tartibi buzilgan');
      last = key;
    }
    const jami = birinchi.jamiServerda ?? null;
    if (bosh.length > (s.limit ?? 200000)) return zaxira('limitdan oshdi');
    if (birinchi.toliq !== false) {
      if (jami != null && bosh.length !== jami) return zaxira(`soni ${bosh.length} != ${jami}`);
      return { ...birinchi, qatorlar: bosh, soni: bosh.length, jamiServerda: jami, toliq: true };
    }
    if (!bosh.length || jami == null || jami > (s.limit ?? 200000)) return zaxira(`davom: soni=${bosh.length} jami=${jami}`);
    const davom: SbSoro = { ...s, filtr: `${s.filtr}&${kalit}=gt.${last}` };
    const qoldiqlar: SbJavob<T>[] = [];
    if (jami - bosh.length < (opts.minQator ?? 6000)) {
      qoldiqlar.push(await t2ToliqOqi(oqi, davom, kalit));
    } else {
      const oxiri = await oqi({ ...davom, ustunlar: kalit, tartib: kalit + '.desc', limit: 1 });
      const max = Number((oxiri.qatorlar?.[0] as Record<string, unknown> | undefined)?.[kalit]);
      if (!oxiri.ok || !Number.isSafeInteger(max) || max <= last) return zaxira(`zond ok=${oxiri.ok} max=${max} xato=${oxiri.error ?? ''}`);
      const kenglik = Math.ceil((max - last) / oynaSoni);
      const oynalar: Array<[number, number]> = [];
      for (let a = last + 1; a <= max; a += kenglik) oynalar.push([a, Math.min(a + kenglik - 1, max)]);
      qoldiqlar.push(...await Promise.all(oynalar.map(([a, b]) =>
        t2ToliqOqi(oqi, { ...s, filtr: `${s.filtr}&${kalit}=gte.${a}&${kalit}=lte.${b}` }, kalit))));
    }
    const yomon = qoldiqlar.find((n) => !n.ok);
    if (yomon) return zaxira(`oyna xato: ${yomon.error ?? ''}`);
    const qatorlar = bosh.concat(qoldiqlar.flatMap((n) => n.qatorlar ?? []));
    if (qatorlar.length !== jami) return zaxira(`soni ${qatorlar.length} != ${jami}`);
    return { ...birinchi, qatorlar, soni: qatorlar.length, jamiServerda: jami, toliq: true };
  } catch (e) {
    return zaxira(`istisno: ${e instanceof Error ? e.message : String(e)}`);
  }
}
