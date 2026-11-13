/**
 * ILOVALAR KATALOGI (ekotizim P1, docs/architecture/EKOTIZIM_ILOVALAR_V1.md §B) — SOF MA'LUMOT (React/ikonka importi yo'q).
 *
 * «Google Workspace» uslubi: bitta platforma, alohida ilovalar. Kompaniya kerakli ilovalarni yoqadi; o'chirilgani menyuda
 * va ilova ishga tushirgichda ko'rinmaydi, serverda esa amallari `ILOVA_YOQILMAGAN` bilan rad etiladi (gateway).
 * Yoqish/o'chirish MAVJUD modul mexanizmi bilan: `t2_capability` (turi='module') + kompaniya override
 * (`t2_modul_holat_v1`, `capability_override_set`). Yangi jadval YO'Q.
 *
 * Manba: menyu — navReestr (`NavSahifa.ilova`); server — `functions/_shared/ilova-darvoza.ts` (shu fayldagi AMAL_ILOVA/SORO_ILOVA).
 * Pul qoidasi: ilova yoqilgan/yoqilmaganligi hech qanday summani o'zgartirmaydi.
 */

export const ILOVA_KODLAR = ['pto', 'ff', 'moliya', 'sotuv', 'xarid', 'hr', 'logistika', 'hujjat', 'desktop', 'yadro', 'platforma'] as const;
export type IlovaKod = (typeof ILOVA_KODLAR)[number];

export type IlovaTa = {
  kod: IlovaKod;
  nom: string;
  izoh: string;
  /** Ilovani yoqadigan modul kodi (t2_capability). null — yadro: modul emas, doim yoqiq. */
  modul: string | null;
  /** Ishga tushirgichda ko'rsatish tartibi. */
  tartib: number;
  /** Launcherda ko'rinadimi (yadro/platforma ilova emas — «Barcha bo'limlar»da). */
  ishgaTushirgich: boolean;
};

export const ILOVALAR: readonly IlovaTa[] = [
  { kod: 'pto', nom: 'PTO va Smeta', izoh: 'Obyektlar, smeta, narxlash, loyihalar', modul: null, tartib: 1, ishgaTushirgich: true },
  { kod: 'ff', nom: 'Fakt va F2', izoh: 'Fakt, F2, nakopitelniy, Forma-3, M-29, oylik paket', modul: null, tartib: 2, ishgaTushirgich: true },
  { kod: 'moliya', nom: 'Moliya', izoh: 'To‘lov, xarajat, shartnoma, qarzdorlik, kontragentlar', modul: 'module.moliya', tartib: 3, ishgaTushirgich: true },
  { kod: 'sotuv', nom: 'Uy sotish', izoh: 'Shaxmatka, bron, bitim, to‘lov grafigi', modul: 'module.sotuv', tartib: 4, ishgaTushirgich: true },
  { kod: 'xarid', nom: 'Xarid va tender', izoh: 'Zayavka, tender, birja', modul: 'module.xarid', tartib: 5, ishgaTushirgich: true },
  { kod: 'hr', nom: 'Kadrlar va KPI', izoh: 'Xodimlar, tabel, texnika', modul: 'module.hr', tartib: 6, ishgaTushirgich: true },
  { kod: 'logistika', nom: 'Logistika va ombor', izoh: 'Ta‘minot, sklad, reys', modul: 'module.logistika', tartib: 7, ishgaTushirgich: true },
  { kod: 'hujjat', nom: 'Hujjat aylanishi', izoh: 'Hujjatlar, AOSR, tomonlar, buyurtmachi kabineti', modul: 'module.hujjat', tartib: 8, ishgaTushirgich: true },
  { kod: 'desktop', nom: 'Desktop (oflayn)', izoh: 'Windows ilovasi va oflayn obyekt paketi', modul: 'module.desktop', tartib: 9, ishgaTushirgich: false },
  { kod: 'yadro', nom: 'Kompaniya va shaxsiy', izoh: 'A‘zolar, sozlamalar, tokenlar, shaxsiy sahifalar', modul: null, tartib: 10, ishgaTushirgich: false },
  { kod: 'platforma', nom: 'Platforma', izoh: 'Faqat platforma superadmini', modul: null, tartib: 11, ishgaTushirgich: false },
];

export const ILOVA_MAP: Readonly<Record<IlovaKod, IlovaTa>> =
  Object.fromEntries(ILOVALAR.map((i) => [i.kod, i])) as Record<IlovaKod, IlovaTa>;

/** Ilovani yoqadigan modul kodi (yadro ilovalari uchun null). */
export const ilovaModuli = (kod: IlovaKod): string | null => ILOVA_MAP[kod]?.modul ?? null;

/** Faqat ilova modullari kodlari (migratsiya 20261130000000 bilan bir xil to'plam). */
export const ILOVA_MODUL_KODLARI: readonly string[] = ILOVALAR.flatMap((i) => (i.modul ? [i.modul] : []));

/* ── Gateway xaritasi: amal/so'rov → ilova ───────────────────────────────────────────────────────────────────────
 * Faqat ANIQ ilovaga tegishli amallar. PTO yadrosi, shartnoma/loyiha (F2 paketi unga tayanadi), token sotib olish
 * (`tolov_sorov_yarat_v1`), hujjat biriktirish (`hujjat_yoz`) va umumiy `erp_amal` BU YERDA YO'Q: ular hech qachon
 * ilova o'chirilgani uchun to'xtamaydi. */

/** `/api/sb-yoz` `amal` → ilova. */
export const AMAL_ILOVA: Readonly<Record<string, IlovaKod>> = {
  // Moliya
  tolov_yoz: 'moliya', tolov_tahrir: 'moliya', tolov_ochir: 'moliya', tolov_taqsimot_saqla_v1: 'moliya',
  xarajat_yoz: 'moliya', xarajat_tahrir: 'moliya', xarajat_ochir: 'moliya', xarajat_kirit_v1: 'moliya', xarajat_bekor_v1: 'moliya',
  qarzdorlik_saqla_v1: 'moliya', qarzdorlik_import_v1: 'moliya', sverka_yozuv_v1: 'moliya', sverka_import_v1: 'moliya',
  moliya_qolda_yoz_v1: 'moliya', solishtiruv_tushuntir_v1: 'moliya', solishtiruv_yangila_v1: 'moliya', faktura_yoz: 'moliya',
  // Xarid va tender
  birja_rfq_yarat: 'xarid', birja_taklif_ber: 'xarid',
  // Logistika va ombor
  sklad_kirim_import_v1: 'logistika', sklad_kirim_storno_v1: 'logistika', skladga_yozish: 'logistika', sklad_mustaqil_yarat: 'logistika',
  // Kadrlar
  kadr_mustaqil_yarat: 'hr', texnika_mustaqil_yarat: 'hr',
  hr_xodim_saqla_v1: 'hr', hr_sxema_saqla_v1: 'hr', hr_kalendar_saqla_v1: 'hr', hr_tabel_saqla_v1: 'hr', hr_tuzatma_saqla_v1: 'hr', hr_tuzatma_qaror_v1: 'hr', hr_oylik_v1: 'hr', hr_kpi_qoida_saqla_v1: 'hr',
  // Buxgalteriya
  bux_boshlash_v1: 'moliya', bux_hisob_saqla_v1: 'moliya', bux_moslik_saqla_v1: 'moliya', bux_avto_v1: 'moliya', bux_qolda_v1: 'moliya', bux_storno_v1: 'moliya', bux_davr_v1: 'moliya', bux_shablon_tanla_v1: 'moliya', bux_davr_blok_v1: 'moliya', bux_hisob_tasdiq_v1: 'moliya', bux_saldo_import_v1: 'moliya', bux_saldo_bekor_v1: 'moliya', bux_tannarx_v1: 'moliya', bux_hisobot_saqla_v1: 'moliya', bux_bank_yuklash_v1: 'moliya', bux_bank_qabul_v1: 'moliya', bux_kassa_yoz_v1: 'moliya', bux_kassa_bekor_v1: 'moliya', bux_taqsim_saqla_v1: 'moliya',
  bux_bank_import_v1: 'moliya', bux_tashqi_v1: 'moliya',
  // Yuk birjasi
  yb_yuk_saqla_v1: 'logistika', yb_yuk_elon_v1: 'logistika', yb_yuk_javob_v1: 'logistika', yb_yuk_bekor_v1: 'logistika', yb_yuk_tasdiq_v1: 'logistika', yb_yuk_baho_v1: 'logistika', yb_yuk_nizo_v1: 'logistika',
  // Hujjat aylanishi (AOSR, laboratoriya)
  aosr_yoz: 'hujjat', aosr_yoz_v2: 'hujjat', aosr_bekor: 'hujjat', aosr_bog_saqla: 'hujjat', aosr_bog_ochir: 'hujjat', aosr_bog_hajm_v1: 'hujjat', aosr_asos_qoralama_v1: 'hujjat',
  lab_protokol_yoz: 'hujjat', lab_protokol_bekor: 'hujjat', lab_protokol_bog_saqla: 'hujjat',
};

/** Prefiks qoidalari (amal va so'rov nomlari uchun): `sotuv_*`, `tender_*`, `transport_*`. */
const PREFIKS_ILOVA: ReadonlyArray<readonly [string, IlovaKod]> = [['sotuv_', 'sotuv'], ['tender_', 'xarid'], ['buyurtma_', 'xarid'],['transport_', 'logistika']];

/** `/api/sb-yoz` amali qaysi ilovaga tegishli (yo'q — ilovaga bog'lanmagan, hech qachon bloklanmaydi). */
export function amalIlovasi(amal: string | null | undefined): IlovaKod | null {
  const a = String(amal ?? '');
  if (Object.prototype.hasOwnProperty.call(AMAL_ILOVA, a)) return AMAL_ILOVA[a];
  return PREFIKS_ILOVA.find(([p]) => a.startsWith(p))?.[1] ?? null;
}

/** `/api/sb` o'qish RPC (`soro`) → ilova. */
export const SORO_ILOVA: Readonly<Record<string, IlovaKod>> = {
  qarzdorlik_royxat_v1: 'moliya', qarz_svod_v1: 'moliya',
  sklad_kirim_royxat_v1: 'logistika',
  hr_xodimlar_v1: 'hr', hr_oy_v1: 'hr', hr_kpi_v1: 'hr', hr_oylik_buxgalteriya_v1: 'hr', hr_men_v1: 'hr', hr_qoida_v1: 'hr',
  bux_holat_v1: 'moliya', bux_jurnal_v1: 'moliya', bux_osv_v1: 'moliya', bux_kontragent_v1: 'moliya', bux_nds_v1: 'moliya', bux_tolov_v1: 'moliya', bux_kartochka_v1: 'moliya', bux_pul_korinish_v1: 'moliya', bux_sverka_v1: 'moliya', bux_bank_taklif_v1: 'moliya', bux_kassa_kitob_v1: 'moliya', bux_sverka_tomonlar_v1: 'moliya', bux_hisobot_v1: 'moliya', bux_sozlama_v1: 'moliya',
  yb_ol_v1: 'logistika',
};

export function soroIlovasi(soro: string | null | undefined): IlovaKod | null {
  const s = String(soro ?? '');
  if (Object.prototype.hasOwnProperty.call(SORO_ILOVA, s)) return SORO_ILOVA[s];
  return PREFIKS_ILOVA.find(([p]) => s.startsWith(p))?.[1] ?? null;
}

/** Ilova (menyu/server) shu modul holatida yoqiqmi. Holat noma'lum (yuklanmoqda/xato) — yoqiq (ko'rinish; server alohida). */
export function ilovaYoqiq(kod: IlovaKod, modullar: ReadonlyArray<{ kod: string; holat: 'on' | 'off' }> | undefined | null): boolean {
  const m = ilovaModuli(kod);
  if (!m || !modullar) return true;
  return !modullar.some((x) => x.kod === m && x.holat === 'off');
}
