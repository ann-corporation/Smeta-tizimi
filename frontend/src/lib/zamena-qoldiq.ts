/**
 * ZAMENA QOLDIQ -- yagona frontend ta'rifi (SQL: t2_almashtirilgan_hajm / t2_qator_holat bilan AYNAN bir xil qoida).
 *
 * Egasi qarori (2026-10-24): zamena qatoriga F2/fakt yozilgan sari ASLNING qoldig'i kamayadi.
 *  - birlik bir xil -> 1:1 (zamenaning F2/fakt hajmi aslning qoldig'idan ayriladi);
 *  - birlik farqli  -> `almashtirishHajm` (aslning birligida, zamenaning TO'LIQ rejalangan hajmi uchun) kiritilgan bo'lsa
 *    proporsional: progress / zamenaHajm * almashtirishHajm; kiritilmagan bo'lsa zamenaning bajarilgan
 *    ulushida (progress / zamenaHajm * aslHajm; egasi qarori 2026-10-25);
 *  - zamena ISH (bl) bo'lsa, aslning bola resurslari (rs/mat/ob) ham xuddi shu ulushda yopiladi.
 * Asl smeta qatorlari O'ZGARMAYDI; hajm bloklanmaydi (ortiqcha aslning qoldig'i bilan cheklanadi); NULL != 0.
 */
export interface ZamenaQator {
  id: number;
  ota_id?: number | null;
  tur?: string | null;
  birlik?: string | null;
  birlik_key?: string | null;
  hajm: number | null;
  /** Aslning tasdiqlangan F2 hajmi (o'zining). */
  f2Hajm?: number;
  /** Zamena qatori uchun: max(tasdiqlangan F2, fakt) hajmi (o'z birligida). */
  progress?: number;
  replaces_line_id?: number | null;
  change_type?: string | null;
  almashtirish_hajm?: number | null;
}

/**
 * ZAMENA «KUCHDA»LIGI (egasi 2026-11-05, pereraschet). Zamena aslni faqat BAJARILGAN qismi bo'yicha yopadi:
 *   progress = max(sof F2, fakt)  (SQL t2_zamena_qoplash.progress_hajm bilan aynan bir xil);
 *   sof F2   = tasdiqlangan F2 qatorlarining ISHORALI yig'indisi (tasdiqlangan storno o'zini o'chiradi)
 *              + faol (bekor/rad/almashtirilmagan) F2 qoralamalaridagi STORNO qatorlari (raw_snapshot.source='storno').
 * Natija: zamena to'liq stornolangan (sof F2 = 0) va fakti 0/NULL bo'lsa progress 0 — asl qator to'liq hajmiga qaytadi
 * (fakt % va F2 uchun). Fakti bor zamena kuchda qoladi. Hech qachon bajarilmagan rejali zamena aslni yopmaydi (2026-10-24).
 * NULL fakt / NULL F2 — yozuv yo'q (0 hajm), SQL COALESCE bilan bir xil; ishora SQL greatest() dagidek.
 */
export function zamenaProgress(p: { f2Tasdiq?: number | null; stornoKutilayotgan?: number | null; fakt?: number | null }): number {
  const f2 = Number(p.f2Tasdiq ?? 0) + Number(p.stornoKutilayotgan ?? 0);
  return Math.max(f2, Number(p.fakt ?? 0));
}

const birlikKalit = (q: ZamenaQator): string => (q.birlik_key ?? (q.birlik ?? '').trim().toLowerCase());

/** Qoldiq rejimi: 'fakt' — fakt kiritish ekranlari (ochiq qoldiq); 'f2' — F2 hujjatlari (F2 qoldig'i). */
export type QoldiqRejim = 'fakt' | 'f2';
export interface QoldiqKirish {
  smeta: number | null | undefined;
  fakt?: number | null;
  /** Tasdiqlangan F2 hajmi. */
  f2?: number | null;
  /** Zamenalar qoplagan hajm (aslning birligida). */
  almashtirilgan?: number | null;
  /** Faol «bajarilmaydi» belgilari hajmi (faqat 'fakt' rejimida ayriladi). */
  bajarilmaydi?: number | null;
}

/**
 * YAGONA «OCHIQ QOLDIQ» formulasi (tadqiqot 02, §3.1; egasi 2026-10-25: «bir ekranda uch xil qoldiq — to'qnashuv»):
 *  - fakt rejimi: ochiq = smeta − fakt − almashtirilgan − bajarilmaydi;
 *  - F2 rejimi:   qoldiq = smeta − F2 − almashtirilgan (SQL t2_qator_holat.qoldiq_hajm bilan bir xil).
 * Fakt jurnali ustuni, 25/50/100% tugmalari, «faqat bajarilmaganlar» filtri, «qoldiqdan oshdi» ogohlantirishi,
 * «bajarilmaydi» taklifi va qamrov % (Tiklash rejimi) — hammasi SHU funksiyadan.
 * Smeta NULL → NULL (0 emas). Chegirma (manfiy smeta) qatorida yopilgan hajmlar smeta ishorasida ayriladi.
 * Asl smeta o'zgarmaydi; natija bloklash uchun emas — faqat ko'rsatish/taklif/ogohlantirish.
 */
export function ochiqQoldiq(k: QoldiqKirish, rejim: QoldiqRejim = 'fakt'): number | null {
  if (k.smeta == null || !Number.isFinite(Number(k.smeta))) return null;
  const smeta = Number(k.smeta);
  const bajarilgan = rejim === 'fakt' ? Number(k.fakt ?? 0) : Number(k.f2 ?? 0);
  const yopiq = Number(k.almashtirilgan ?? 0) + (rejim === 'fakt' ? Number(k.bajarilmaydi ?? 0) : 0);
  return smeta - bajarilgan - (smeta < 0 ? -yopiq : yopiq);
}

/** Ochiq qoldiqdan OSHGAN hajm (musbat) — `fakt` kiritmadan keyingi jami fakt; oshmasa 0; smeta noma'lum yoki 0 bo'lsa null. */
export function ochiqdanOrtiqcha(k: QoldiqKirish): number | null {
  const o = ochiqQoldiq(k, 'fakt');
  if (o == null || !k.smeta) return null;
  const ort = Number(k.smeta) < 0 ? o : -o;
  return ort > 1e-9 ? Math.round(ort * 1e6) / 1e6 : 0;
}

/** qoldiq = smeta - tasdiqlangan F2 - almashtirilgan (`ochiqQoldiq` F2 rejimi). smeta NULL bo'lsa NULL (0 emas). */
export function qoldiqHajmi(smeta: number | null | undefined, tasdiqlangan: number | null | undefined, almashtirilgan?: number | null): number | null {
  return ochiqQoldiq({ smeta, f2: tasdiqlangan, almashtirilgan }, 'f2');
}

/** Bitta zamenaning aslni qoplagan hajmi (aslning birligida; cheklovsiz) -- SQL t2_almashtirilgan_oz_hajm CASE bilan bir xil. */
function qoplash(asl: ZamenaQator, z: ZamenaQator): number {
  const miq = z.almashtirish_hajm;
  const zh = z.hajm ?? 0;
  const pr = z.progress ?? 0;
  if (miq != null) return zh > 0 ? pr / zh * miq : 0;
  if (birlikKalit(z) === birlikKalit(asl)) return pr;
  // Egasi qarori 2026-10-25: birlik farqli, miqdorsiz -> zamenaning bajarilgan ulushida (zamena hajmi noma'lum -> 0).
  return zh > 0 ? Math.min(pr / zh, 1) * (asl.hajm ?? 0) : 0;
}

/** Bir asl qatorning O'Z zamenalaridan qoplangan hajmi (aslning birligida), aslning qolgan qoldig'i bilan cheklangan. */
function ozHajm(asl: ZamenaQator, zamenalar: readonly ZamenaQator[]): number {
  if (zamenalar.length === 0) return 0;
  const rem = Math.max((asl.hajm ?? 0) - (asl.f2Hajm ?? 0), 0);
  let yigindi = 0;
  for (const z of zamenalar) yigindi += qoplash(asl, z);
  return Math.min(yigindi, rem);
}

/**
 * ZAMENA «UMUMIY QOZON» (egasi 2026-11-08; SQL t2_zamena_reja_hajm bilan AYNAN bir xil).
 * Asl qator va uning zamenalari bitta hajm qozonini bo'lishadi = asl smeta hajmi. Birlik bir xil va `almashtirish_hajm`
 * NULL bo'lgan zamenaning samarali reja hajmi (qoldiq, fakt %, «smetadan oshdi», F2 qoldig'i, nakopitelniy «по смете»):
 *   max(asl.hajm − aslning tasdiqlangan F2 − BOSHQA zamenalar qoplagani, zamenaning o'z hajmi).
 * Birlik farqli / miqdor kiritilgan / asl hajmi ≤ 0 yoki noma'lum / zamena hajmi manfiy → null (zamena.hajm o'zgarmaydi).
 * t2_qator.hajm hech qachon o'zgartirilmaydi — bu faqat hisob qatlami.
 */
export function zamenaRejaHajm(zamena: ZamenaQator, asl: ZamenaQator, boshqalar: readonly ZamenaQator[] = []): number | null {
  if (zamena.almashtirish_hajm != null || birlikKalit(zamena) !== birlikKalit(asl)) return null;
  if (asl.hajm == null || !(asl.hajm > 0) || (zamena.hajm != null && zamena.hajm < 0)) return null;
  const rem = Math.max(asl.hajm - (asl.f2Hajm ?? 0), 0);
  let boshqa = 0;
  for (const b of boshqalar) if (b.id !== zamena.id) boshqa += qoplash(asl, b);
  return Math.max(rem - boshqa, zamena.hajm ?? 0);
}

/** Barcha zamenalar uchun samarali reja hajmi xaritasi (zamena id -> reja; qoida qo'llanmaydiganlar kirmaydi). */
export function zamenaRejaHajmlar(rows: readonly ZamenaQator[]): Map<number, number> {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const zam = new Map<number, ZamenaQator[]>();
  for (const r of rows) {
    if (r.change_type === 'REPLACEMENT' && r.replaces_line_id != null && byId.has(r.replaces_line_id)) {
      const a = zam.get(r.replaces_line_id) ?? []; a.push(r); zam.set(r.replaces_line_id, a);
    }
  }
  const out = new Map<number, number>();
  for (const [aslId, list] of zam) {
    const asl = byId.get(aslId)!;
    for (const z of list) { const v = zamenaRejaHajm(z, asl, list); if (v != null) out.set(z.id, v); }
  }
  return out;
}

/**
 * Barcha qatorlar uchun almashtirilgan hajm xaritasi (qator id -> hajm; faqat > 0 bo'lganlar).
 * `rows` -- bitta obyekt qatorlari (replaces_line_id/almashtirish_hajm/f2Hajm/progress bilan).
 */
export function almashtirilganHajmlar(rows: readonly ZamenaQator[]): Map<number, number> {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const zam = new Map<number, ZamenaQator[]>();
  for (const r of rows) {
    if (r.change_type === 'REPLACEMENT' && r.replaces_line_id != null && byId.has(r.replaces_line_id)) {
      const a = zam.get(r.replaces_line_id) ?? [];
      a.push(r); zam.set(r.replaces_line_id, a);
    }
  }
  const oz = (r: ZamenaQator) => ozHajm(r, zam.get(r.id) ?? []);
  const out = new Map<number, number>();
  for (const r of rows) {
    let h = oz(r);
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    if (ota && ota.tur === 'bl' && r.tur != null && ['rs', 'mat', 'ob'].includes(r.tur) && zam.has(ota.id) && (r.hajm ?? 0) !== 0 && (ota.hajm ?? 0) > 0) {
      const rem = Math.max((r.hajm ?? 0) - (r.f2Hajm ?? 0), 0);
      h = Math.max(h, Math.min(rem, (r.hajm as number) * Math.min(oz(ota) / (ota.hajm as number), 1)));
    }
    if (h > 0) out.set(r.id, h);
  }
  return out;
}

export interface QoralamaQator {
  id: number; ota_id?: number | null; otaId?: number | null; tur?: string | null; birlik?: string | null; hajm: number | null;
}

/**
 * SHU F2 QORALAMASIDAGI zamena hajmi aslning qoldig'ini kamaytiradigan KUTILAYOTGAN almashtirish (asl qator id -> hajm, aslning birligida).
 * Egasi 2026-10-25: zamenaga hali yozilmagan F2 hajmi ham aslning qoldig'idan ayriladi, aks holda hujjatda ostatka qoladi.
 * Yagona formula -- `almashtirilganHajmlar`: zamenaning progressi = server progressi (`oldingi`) + shu qoralamadagi hajm (`shu`);
 * kutilayotgan = (shu bilan) - (shusiz); aslning serverdagi almashtirilgan qismi (`serverAlm`) ayrilgach qolgan qoldiq bilan cheklanadi.
 * `zamenaAsl`: zamena id -> asl id (rejali zamenalar ham); `miqdor`: zamena id -> almashtirish hajmi (aslning birligida).
 */
export function qoralamaAlmashtirilgan(
  rows: Iterable<QoralamaQator>,
  zamenaAsl: ReadonlyMap<number, number>,
  miqdor: ReadonlyMap<number, number>,
  oldingi: ReadonlyMap<number, number>,
  shu: ReadonlyMap<number, number>,
  serverAlm: ReadonlyMap<number, number>,
): Map<number, number> {
  const out = new Map<number, number>();
  let bor = false;
  for (const [z] of zamenaAsl) if ((shu.get(z) ?? 0) > 0) { bor = true; break; }
  if (!bor) return out;
  const list = [...rows];
  const yasa = (qoralama: boolean): ZamenaQator[] => list.map((r) => {
    const z = zamenaAsl.has(r.id);
    const old = oldingi.get(r.id) ?? 0;
    return { id: r.id, ota_id: r.ota_id ?? r.otaId, tur: r.tur, birlik: r.birlik, hajm: r.hajm, f2Hajm: old,
      ...(z ? { change_type: 'REPLACEMENT', replaces_line_id: zamenaAsl.get(r.id), almashtirish_hajm: miqdor.get(r.id) ?? null,
        progress: old + (qoralama ? Math.max(shu.get(r.id) ?? 0, 0) : 0) } : {}) };
  });
  const bilan = almashtirilganHajmlar(yasa(true));
  const siz = almashtirilganHajmlar(yasa(false));
  const byId = new Map(list.map((r) => [r.id, r] as const));
  for (const [id, h] of bilan) {
    const r = byId.get(id);
    const rem = Math.max((r?.hajm ?? 0) - (oldingi.get(id) ?? 0) - (serverAlm.get(id) ?? 0), 0);
    const d = Math.min(Math.max(h - (siz.get(id) ?? 0), 0), rem);
    if (d > 0) out.set(id, d);
  }
  return out;
}

/**
 * Narx qoidasi (SQL: t2_almashtirilgan_summa_hisob): summa to'qilmaydi.
 * Narx 0, lekin summa != 0 (pul bola resurslarda, ish qatori) -> narx NULL kabi: alm × summa / hajm (2026-11-08).
 */
export function almashtirilganSumma(alm: number, hajm: number | null, narx: number | null, summa: number | null): number | null {
  if (!alm) return 0;
  if (narx != null && !(narx === 0 && (summa ?? 0) !== 0)) return alm * narx;
  if (hajm != null && hajm !== 0 && summa != null) return alm * summa / hajm;
  return null;
}

/** UI matni: «almashtirildi: X / Y birlik» (aslning birligida). Almashtirish yo'q bo'lsa null. */
export function almashtirildiMatn(alm: number | null | undefined, smeta: number | null | undefined, birlik?: string | null, fmt: (n: number) => string = (n) => String(+n.toFixed(4))): string | null {
  if (alm == null || !(alm > 0)) return null;
  return `${fmt(alm)}${smeta != null ? ' / ' + fmt(smeta) : ''}${birlik ? ' ' + birlik : ''}`;
}
