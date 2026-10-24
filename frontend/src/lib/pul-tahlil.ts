/**
 * Rahbarlar uchun pul tahlili (egasi 2026-10-24) — sof hisob-kitob yordamchilari.
 * Hisob bazada (`t2_pul_tahlil_v1`); bu yerda faqat ko'rsatish qoidalari: NULL ≠ 0, farq/foiz, zanjir bosqichlari.
 * Yangi ustama formulasi YO'Q — zanjir `t2_obyekt_nakrutka_v1` natijasidan olinadi.
 */

/** Ustamali summa (mavjud kaskad natijasi): itogo4 = QQS siz, vsego = QQS bilan. */
export type PulUstamali = { itogo4: number; nds: number; vsego: number };

export type PulKesim = {
  kat: string; ota: string | null;
  smeta_ustamasiz: number | null; smeta_nomalum?: number;
  f2_yopilgan: number | null; f2_nomalum?: number;
  xarajat: number | null; farq: number | null; farq_foiz: number | null;
  smeta_ustamali?: PulUstamali | null; f2_ustamali?: PulUstamali | null;
  xarajat_holat?: 'kiritilmagan' | 'hisoblanmagan' | 'malum';
};

export type PulZanjirBosqich = { kalit: string; nom: string; foiz?: string; formula?: string };

/** Zanjir bosqichlari (t2_nakrutka_hisobla_v1 chiqish kalitlari) — tartib va formula izohi. Qiymatlar bazadan keladi. */
export const PUL_ZANJIR: readonly PulZanjirBosqich[] = [
  { kalit: 'pryamye', nom: "To'g'ridan-to'g'ri xarajat", formula: 'ЧЕЛ + МАШ + МАТ + ОБ' },
  { kalit: 'tr_mat', nom: 'Material transporti', formula: '(МАТ − КАБ) × ТРАНСПОРТ_МАТЕРИАЛ%' },
  { kalit: 'skl_mat', nom: 'Material skladi', formula: '(МАТ − БЕЗСКЛАД − М/К) × СКЛАД% + М/К × СКЛАД_МК%' },
  { kalit: 'tr_kab', nom: 'Kabel transporti', formula: 'КАБ × ТРАНСПОРТ_КАБЕЛЬ%' },
  { kalit: 'itogo1', nom: 'Jami 1', formula: "to'g'ridan-to'g'ri − ОБ + transport + sklad + kabel" },
  { kalit: 'prochie', nom: 'Boshqa xarajatlar (ustama)', formula: 'Jami 1 × ПРОЧИЕ%' },
  { kalit: 'itogo2', nom: 'Jami 2', formula: 'Jami 1 + boshqa' },
  { kalit: 'tr_ob', nom: 'Uskuna transporti', formula: 'ОБ × ТРАНСПОРТ_ОБОРУД%' },
  { kalit: 'zag_ob', nom: 'Uskuna zagotovka-skladi', formula: 'ОБ × ЗАГОТ_СКЛАД%' },
  { kalit: 'itogo3', nom: 'Jami 3', formula: 'Jami 2 + ОБ + transport + zagotovka' },
  { kalit: 'strax', nom: "Sug'urta", formula: 'Jami 3 × СТРАХОВАНИЕ%' },
  { kalit: 'risk', nom: 'Risk', formula: 'Jami 3 × РИСК%' },
  { kalit: 'itogo4', nom: 'Jami 4 (QQS siz, ustama bilan)', formula: 'Jami 3 + sug\'urta + risk' },
  { kalit: 'nds', nom: 'QQS', formula: 'Jami 4 × НДС%' },
  { kalit: 'vsego', nom: 'Hammasi (QQS bilan)', formula: 'Jami 4 + QQS' },
];

const bor = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/** Farq = xarajat − F2. Ikkala tomon ma'lum bo'lsagina; aks holda null (NULL ≠ 0). Tiyingacha aniq. */
export function pulFarq(xarajat: number | null | undefined, f2: number | null | undefined): number | null {
  if (!bor(xarajat) || !bor(f2)) return null;
  return Math.round((xarajat - f2) * 100) / 100;
}

/** Farq foizi = farq / F2 × 100. F2 = 0 bo'lsa yoki biror tomon noma'lum bo'lsa — null (nolga bo'lish yo'q). */
export function pulFarqFoiz(xarajat: number | null | undefined, f2: number | null | undefined): number | null {
  const f = pulFarq(xarajat, f2);
  if (f == null || !bor(f2) || f2 === 0) return null;
  return Math.round((f / f2) * 1000) / 10;
}

/** Xarajat kiritilganmi (P1 dan keyin): kesimlardan kamida bittasida xarajat ma'lum. */
export function xarajatKiritilganmi(kesimlar: readonly PulKesim[]): boolean {
  return kesimlar.some((k) => bor(k.xarajat));
}

/** Xarajat qamrovi: ma'lum xarajatli (hisoblanadigan) kesimlar ulushi, %. Hisoblanmagan (SUB/OTK) kesimlar kirmaydi. */
export function xarajatQamrovFoiz(kesimlar: readonly PulKesim[]): number {
  const asosiy = kesimlar.filter((k) => k.ota == null && k.xarajat_holat !== 'hisoblanmagan');
  if (!asosiy.length) return 0;
  return Math.round((asosiy.filter((k) => bor(k.xarajat)).length / asosiy.length) * 100);
}

export type PulBanner = { kod: string; matn: string };

/** Bitta asosiy banner (eng muhimi) + qolganlari. Matnlar o'zbek lotin kalit (t() chaqiruvchi tomonda). */
export function pulBannerlar(p: { kesimlar: readonly PulKesim[]; f2Nomalum: number; smetaNomalum: number }): PulBanner[] {
  const r: PulBanner[] = [];
  const q = xarajatQamrovFoiz(p.kesimlar);
  if (q < 100) r.push({ kod: 'xarajat', matn: q === 0 ? "Xarajat ma'lumoti hali kiritilmagan — farq hisoblanmaydi" : "Xarajat ma'lumoti to'liq emas ({foiz}% kesimda kiritilgan)" });
  if (p.f2Nomalum > 0) r.push({ kod: 'f2_nomalum', matn: "F2 da summasi noma'lum qatorlar bor: {soni} ta (jamiga kirmagan)" });
  if (p.smetaNomalum > 0) r.push({ kod: 'smeta_nomalum', matn: "Smetada summasi noma'lum qatorlar bor: {soni} ta" });
  if (p.kesimlar.some((k) => k.xarajat_holat === 'hisoblanmagan')) r.push({ kod: 'sub_otk', matn: "Subpudrat va o'tkazma hisoblanmagan (ТРАНЗ qarori kutilmoqda)" });
  return r;
}

/** Zanjirdagi bosqich qiymati (bazadagi natijadan aynan; to'qilmaydi). */
export function pulZanjirQiymat(nakrutka: Record<string, unknown> | null | undefined, kalit: string): number | null {
  const v = nakrutka?.[kalit];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Ustama koeffitsienti = Jami 4 / to'g'ridan-to'g'ri (ixtiyoriy ko'rsatkich, faqat bazadagi ikki raqam nisbati). */
export function pulUmumiyKoef(nakrutka: Record<string, unknown> | null | undefined): number | null {
  const a = pulZanjirQiymat(nakrutka, 'pryamye'); const b = pulZanjirQiymat(nakrutka, 'itogo4');
  if (a == null || b == null || a === 0) return null;
  return Math.round((b / a) * 10000) / 10000;
}
