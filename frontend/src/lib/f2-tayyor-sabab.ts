/**
 * F2 tayyorlash — «nega saqlanmaydi?» ning YAGONA manbai (audit 2026-11-06, tizimli tuzatish).
 * Avval `saqlashMumkin` bir nechta jim shartdan iborat edi (qoshTayyor, bajXato …): tugma sababsiz yopiq turardi, Tekshiruv esa
 * «xato yo‘q» derdi. Endi har to‘siq shu ro‘yxatda — sababi va bir bosishli amali bilan; `saqlashMumkin = sabablar.length === 0`;
 * ro‘yxat saqlash tugmasi yonida va Tekshiruv tepasida ko‘rinadi; «toza» belgisi faqat ro‘yxat bo‘sh bo‘lganda.
 * Sof funksiyalar: holatni sahifa beradi, bu yerda faqat qaror va matn.
 */
import { t } from '../i18n/til';

export type SababAmal = 'qayta_yuklash' | 'qayta_qosh' | 'qayta_aktlar' | 'qatorga' | 'narxsiz' | 'raqam_taklif';
export type SababKod =
  | 'obyekt' | 'kompaniya' | 'yuklanmoqda' | 'yuklash_xato'
  | 'akt_oqilmoqda' | 'akt_xato' | 'muhr'
  | 'bosh' | 'xato_hajm' | 'xato_narx' | 'xato_summa' | 'pul'
  | 'dublikat' | 'aktlar_oqilmoqda' | 'aktlar_xato'
  | 'qosh_kutilmoqda' | 'baj_xato' | 'zamena_xato' | 'protokol_xato' | 'qoralama_xato'
  | 'avto_narxsiz';
export type SaqlashSabab = {
  kod: SababKod; matn: string;
  /** `blok` — saqlashni to‘xtatadi; `ogoh` — ko‘rinadi, lekin saqlashni to‘smaydi (egasi qarori: qoralamada narxsiz). */
  daraja: 'blok' | 'ogoh';
  amal?: SababAmal; amalMatn?: string;
  /** `qatorga` amali uchun: birinchi qator id. */
  id?: number;
};

export type SababKirish = {
  validId: boolean; kompaniya: boolean;
  loading: boolean; error: boolean;
  /** ?akt=ID rejimi. */
  tahrir: boolean; aktBor: boolean; aktXato: string; aktKorish: boolean;
  qatorSoni: number;
  /** f2Qatorlar xatolari: tur bo‘yicha qator idlari. */
  xatoHajm: readonly number[]; xatoNarx: readonly number[]; xatoSumma: readonly number[];
  /** Tugallanmagan/noto‘g‘ri narx-summa kiritmalari (MoneyInput qoralama matni). */
  pul: readonly number[];
  dublikatBlok: string | null;
  aktlarYuklandi: boolean; aktlarXato: boolean;
  qoshTayyor: boolean; bajXato: boolean; zamenaXato: boolean;
  protokolXato: boolean; qoralamaXato: boolean;
  /** Qoralamada avtomatik narxsiz resurslar (blok emas — ogohlantirish). */
  avtoNarxsiz: readonly number[];
};

export function saqlashSabablari(k: SababKirish): SaqlashSabab[] {
  const out: SaqlashSabab[] = [];
  const blok = (kod: SababKod, matn: string, x: Partial<SaqlashSabab> = {}) => out.push({ kod, matn, daraja: 'blok', ...x });
  const qayta = { amal: 'qayta_yuklash' as const, amalMatn: t('Qayta urinib ko‘rish') };
  if (!k.validId) { blok('obyekt', t('Obyekt tanlanmagan.')); return out; }
  if (!k.kompaniya) blok('kompaniya', t('Kompaniya tanlanmagan — F2 yozilmaydi.'));
  if (k.loading) blok('yuklanmoqda', t('Smeta va fakt qoldig‘i o‘qilmoqda…'));
  else if (k.error) blok('yuklash_xato', t('Smeta va fakt qoldig‘i o‘qilmadi — F2 saqlanmaydi.'), qayta);
  if (k.tahrir) {
    if (k.aktXato) blok('akt_xato', k.aktXato, qayta);
    else if (!k.aktBor) blok('akt_oqilmoqda', t('F2 akti o‘qilmoqda…'));
    else if (k.aktKorish) blok('muhr', t('Bu F2 qoralama emas (tasdiqlangan yoki yuborilgan) — o‘zgartirib bo‘lmaydi.'));
  }
  if (!k.loading && !k.error && k.qatorSoni === 0) blok('bosh', t('Hali birorta ish hajmi kiritilmagan.'));
  if (k.xatoHajm.length) blok('xato_hajm', t('{n} ta qatorda hajm noto‘g‘ri (son bo‘lsin, 0 bo‘lmasin).', { n: k.xatoHajm.length }), { amal: 'qatorga', amalMatn: t('Qatorga o‘tish'), id: k.xatoHajm[0] });
  if (k.xatoNarx.length) blok('xato_narx', t('{n} ta resursda narx noto‘g‘ri (son va manfiy emas bo‘lsin).', { n: k.xatoNarx.length }), { amal: 'qatorga', amalMatn: t('Qatorga o‘tish'), id: k.xatoNarx[0] });
  if (k.xatoSumma.length) blok('xato_summa', t('{n} ta qatorda summa son emas.', { n: k.xatoSumma.length }), { amal: 'qatorga', amalMatn: t('Qatorga o‘tish'), id: k.xatoSumma[0] });
  if (k.pul.length) blok('pul', t('{n} ta narx/summa maydoni to‘liq kiritilmagan.', { n: k.pul.length }), { amal: 'qatorga', amalMatn: t('Qatorga o‘tish'), id: k.pul[0] });
  if (k.dublikatBlok) blok('dublikat', k.dublikatBlok);
  if (!k.tahrir) {
    if (k.aktlarXato) blok('aktlar_xato', t('Obyektning F2 aktlari o‘qilmadi — dublikat tekshiruvi ishlamaydi, F2 saqlanmaydi.'), { amal: 'qayta_aktlar', amalMatn: t('Qayta urinib ko‘rish') });
    else if (!k.aktlarYuklandi) blok('aktlar_oqilmoqda', t('Obyektning F2 aktlari o‘qilmoqda (dublikat tekshiruvi)…'));
  }
  const qosh = { amal: 'qayta_qosh' as const, amalMatn: t('Qayta urinib ko‘rish') };
  if (k.bajXato) blok('baj_xato', t('Ishdan chiqarilgan resurslar ro‘yxati o‘qilmadi — F2 saqlanmaydi.'), qosh);
  if (k.zamenaXato) blok('zamena_xato', t('Zamena bog‘lanishlari o‘qilmadi — asl va zamena ikki marta olinmasligi uchun F2 saqlanmaydi.'), qosh);
  if (!k.qoshTayyor && !k.bajXato && !k.zamenaXato) blok('qosh_kutilmoqda', t('Zamena va ishdan chiqarilgan resurslar o‘qilmoqda…'), qosh);
  if (k.protokolXato) blok('protokol_xato', t('Narx protokollari o‘qilmadi — narx boshqa manbadan olinmasligi uchun F2 saqlanmaydi.'), qayta);
  if (k.qoralamaXato) blok('qoralama_xato', t('Boshqa F2 qoralamalaridagi hajmlar o‘qilmadi — ikki marta olish himoyasi ishlamaydi, F2 saqlanmaydi.'), qayta);
  if (k.avtoNarxsiz.length) out.push({ kod: 'avto_narxsiz', daraja: 'ogoh',
    matn: t('{n} ta resursda narx yo‘q — qoralamada narxsiz saqlanadi; tasdiqlashdan oldin narx kiriting yoki «narxsiz» deb belgilang.', { n: k.avtoNarxsiz.length }),
    amal: 'narxsiz', amalMatn: t('Narxi yo‘q {n} ta resursni «narxsiz» belgilash', { n: k.avtoNarxsiz.length }) });
  return out;
}

/** Saqlashni to'xtatadigan sabablar (ogohlantirishlar emas). */
export const bloklovchi = (s: readonly SaqlashSabab[]) => s.filter((x) => x.daraja === 'blok');

/**
 * F2 yozish RPC/shlyuz kodlari → tushunarli matn (audit A-8: avval umumiy «yuklab bo‘lmadi»). Noma'lum kod — server xabari,
 * u ham bo'lmasa `zaxira`.
 */
export function f2YozishXatoMatni(r: { code?: string | null; xabar?: string | null; error?: string | null; bogliq?: unknown; soni?: unknown }, zaxira: string): string {
  const bogliq = Array.isArray(r.bogliq) ? r.bogliq.map((x) => (x && typeof x === 'object' ? String((x as { raqam?: unknown; id?: unknown }).raqam ?? (x as { id?: unknown }).id ?? '') : String(x))).filter(Boolean).join(', ') : '';
  const soni = typeof r.soni === 'number' || typeof r.soni === 'string' ? String(r.soni) : '?';
  const M: Record<string, () => string> = {
    STORNO_LINE_INVALID: () => t('Storno qatori noto‘g‘ri (eski F2 qatoriga mos emas) — storno blokini qayta yarating.'),
    DEPENDENTS_EXIST: () => t('Bu F2 ga bog‘liq hujjatlar bor: {b}. Avval ularni hal qiling.', { b: bogliq || '—' }),
    NARXSIZ_QATOR_BOR: () => t('{n} ta qatorda narx yo‘q (qoralamada avtomatik narxsiz) — tasdiqlashdan oldin narx kiriting yoki «narxsiz» deb belgilang.', { n: soni }),
    DUPLICATE_F2_SOURCE_LINE: () => t('Bitta smeta qatori F2 da ikki marta turibdi — takror qatorni olib tashlang.'),
    CERTIFIED_QTY_INVALID: () => t('F2 qatorida hajm noto‘g‘ri (son emas yoki 0) — hajmni tekshiring.'),
    F2_HAJM_NOL: () => t('F2 qatorida hajm 0 — bunday qator yozilmaydi. Hajmi 0 qatorni olib tashlang yoki hajm kiriting.'),
    MISSING_CERTIFIED_PRICE: () => t('Narxi yo‘q qator bor — narx kiriting yoki «narxsiz» deb belgilang.'),
    MISSING_CERTIFIED_AMOUNT: () => t('Summasi yo‘q qator bor — narx yoki summani tekshiring.'),
    F2_LINES_REQUIRED: () => t('F2 da birorta qator yo‘q — avval ish hajmini kiriting.'),
    QATOR_ALMASHTIRILGAN: () => t('Qator yangi smeta versiyasi bilan almashtirilgan — F2 faqat faol qatorlarga yoziladi. Sahifani yangilang.'),
    F2_ACT_NUMBER_CONFLICT: () => t('Shu raqam bilan F2 allaqachon mavjud — boshqa raqam kiriting yoki mavjud F2 ni yangilang.'),
    STALE_VERSION: () => t('Qoralama boshqa oynada o‘zgargan — qayta yuklang.'),
  };
  const kod = r.code ?? '';
  if (M[kod]) return M[kod]();
  return r.xabar || r.error || zaxira;
}

/**
 * DAVOM (A-12): avtomatik ochiladigan qoralama faqat shu sahifada yaratilgan bo'lsa (`native_f2_preparation`, storno bloki
 * bilan birga). Importdan kelgan qoralama ochilsa, qatorlar normadan qayta hisoblanib, faktsiz import qatorlari o'chardi.
 */
export function davomMumkinmi(qatorlar: readonly { raw_snapshot?: unknown }[]): boolean {
  return qatorlar.every((q) => {
    const s = (q.raw_snapshot as { source?: unknown } | null | undefined)?.source;
    return s === 'native_f2_preparation' || s === 'storno';
  });
}
